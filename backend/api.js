const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { db } = require('./firebase');
const { v4: uuidv4 } = require('uuid');
const { analyzeProductDemand } = require('./gemini');

const router = express.Router();

// Middleware for basic auth (simple protection)
router.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Get overview stats
router.get('/stats', async (req, res) => {
  try {
    const custSnap = await db.collection('customers').get();
    let totalDebt = 0;
    custSnap.forEach(doc => totalDebt += (doc.data().totalDebt || 0));

    const wallSnap = await db.collection('wallets').get();
    let totalBalance = 0;
    wallSnap.forEach(doc => totalBalance += (doc.data().balance || 0));

    res.json({ totalDebt, totalBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/customers', async (req, res) => {
  const snap = await db.collection('customers').orderBy('createdAt', 'desc').get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

router.post('/customers', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuidv4();
  const customer = { name, aliases: [name], totalDebt: 0, createdAt: new Date().toISOString() };
  await db.collection('customers').doc(id).set(customer);
  res.json({ id, ...customer });
});

router.post('/customers/:id/aliases', async (req, res) => {
  const { alias } = req.body;
  const customerId = req.params.id;
  if (!alias) return res.status(400).json({ error: 'Alias is required' });
  const docRef = db.collection('customers').doc(customerId);
  const doc = await docRef.get();
  if (!doc.exists) return res.status(404).json({ error: 'Customer not found' });
  const aliases = doc.data().aliases || [];
  if (!aliases.includes(alias)) {
    await docRef.update({ aliases: [...aliases, alias] });
  }
  res.json({ success: true, alias });
});

router.post('/customers/merge', async (req, res) => {
  const { sourceId, targetId } = req.body;
  if (!sourceId || !targetId || sourceId === targetId) {
    return res.status(400).json({ error: 'Invalid customer IDs' });
  }

  try {
    await db.runTransaction(async (t) => {
      const sourceRef = db.collection('customers').doc(sourceId);
      const targetRef = db.collection('customers').doc(targetId);

      const sourceDoc = await t.get(sourceRef);
      const targetDoc = await t.get(targetRef);

      if (!sourceDoc.exists || !targetDoc.exists) {
        throw new Error('One or both customers not found');
      }

      const sourceData = sourceDoc.data();
      const targetData = targetDoc.data();

      // Merge aliases
      const mergedAliases = Array.from(new Set([...(targetData.aliases || []), ...(sourceData.aliases || [])]));
      
      // Merge debt
      const mergedDebt = (targetData.totalDebt || 0) + (sourceData.totalDebt || 0);

      // Update Target Customer
      t.update(targetRef, { aliases: mergedAliases, totalDebt: mergedDebt });

      // Migrate Orders
      const ordersSnap = await db.collection('orders').where('customerId', '==', sourceId).get();
      ordersSnap.forEach(orderDoc => {
        t.update(orderDoc.ref, { customerId: targetId });
      });

      // Migrate Transactions (Payments)
      const txSnap = await db.collection('transactions').where('customerId', '==', sourceId).get();
      txSnap.forEach(txDoc => {
        t.update(txDoc.ref, { customerId: targetId });
      });

      // Delete Source Customer
      t.delete(sourceRef);
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/orders', async (req, res) => {
  const snap = await db.collection('orders').orderBy('createdAt', 'desc').get();
  // Fetch customers to attach names
  const custSnap = await db.collection('customers').get();
  const custMap = {};
  custSnap.forEach(d => custMap[d.id] = d.data().name);

  const orders = snap.docs.map(d => {
    const data = d.data();
    return { id: d.id, ...data, customerName: custMap[data.customerId] || 'Unknown' };
  });
  res.json(orders);
});

// Update order price
router.post('/orders/:id/price', async (req, res) => {
  const { price } = req.body;
  if (typeof price !== 'number') return res.status(400).json({ error: 'Invalid price' });

  try {
    await db.runTransaction(async (transaction) => {
      const orderRef = db.collection('orders').doc(req.params.id);
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) throw new Error('Order not found');

      const orderData = orderDoc.data();
      if (orderData.status === 'completed') throw new Error('Price already set');

      const customerRef = db.collection('customers').doc(orderData.customerId);
      const customerDoc = await transaction.get(customerRef);
      if (!customerDoc.exists) throw new Error('Customer not found');

      const newTotalDebt = (customerDoc.data().totalDebt || 0) + price;

      transaction.update(orderRef, { price, status: 'completed' });
      transaction.update(customerRef, { totalDebt: newTotalDebt });
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders', async (req, res) => {
  const { customerId, productName, duration, price } = req.body;
  if (!customerId || !productName) return res.status(400).json({ error: 'Missing fields' });
  const id = uuidv4();
  const order = {
    customerId, productName, duration: duration || '', 
    status: price > 0 ? 'completed' : 'pending_price',
    price: price || null,
    createdAt: new Date().toISOString(),
    originalMessageText: 'أضيف يدويا من الموقع'
  };
  
  try {
    await db.runTransaction(async (t) => {
      t.set(db.collection('orders').doc(id), order);
      if (price > 0) {
        const custRef = db.collection('customers').doc(customerId);
        const custDoc = await t.get(custRef);
        const newDebt = (custDoc.data().totalDebt || 0) + price;
        t.update(custRef, { totalDebt: newDebt });
      }
    });
    res.json({ id, ...order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/orders/:id', async (req, res) => {
  const { productName, duration, price } = req.body;
  const orderId = req.params.id;

  try {
    let originalMessageText = null;
    let oldOrderData = null;

    await db.runTransaction(async (t) => {
      const orderRef = db.collection('orders').doc(orderId);
      const orderDoc = await t.get(orderRef);
      if (!orderDoc.exists) throw new Error('Order not found');

      const oldOrder = orderDoc.data();
      oldOrderData = oldOrder;
      originalMessageText = oldOrder.originalMessageText;
      const oldPrice = oldOrder.price || 0;
      const newPrice = price || 0;
      const priceDiff = newPrice - oldPrice;

      // READ Customer BEFORE any updates
      let custRef = null;
      let custDoc = null;
      if (priceDiff !== 0) {
        custRef = db.collection('customers').doc(oldOrder.customerId);
        custDoc = await t.get(custRef);
      }

      // Update Order
      const updates = {};
      if (productName !== undefined) updates.productName = productName;
      if (duration !== undefined) updates.duration = duration;
      if (req.body.quantity !== undefined) updates.quantity = req.body.quantity;

      if (price !== undefined && price !== null) {
        updates.price = price;
        updates.status = price > 0 ? 'completed' : 'pending_price';
      }
      t.update(orderRef, updates);

      // Update Customer Debt
      if (priceDiff !== 0 && custDoc.exists) {
        const newDebt = (custDoc.data().totalDebt || 0) + priceDiff;
        t.update(custRef, { totalDebt: newDebt });
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /orders/:id :", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/orders/:id', async (req, res) => {
  const orderRef = db.collection('orders').doc(req.params.id);
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(orderRef);
      if (!doc.exists) throw new Error('Order not found');
      const order = doc.data();
      
      // If order had a price, refund the debt
      if (order.price > 0) {
        const custRef = db.collection('customers').doc(order.customerId);
        const custDoc = await t.get(custRef);
        if (custDoc.exists) {
          const newDebt = (custDoc.data().totalDebt || 0) - order.price;
          t.update(custRef, { totalDebt: newDebt });
        }
      }
      t.delete(orderRef);
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/wallets', async (req, res) => {
  const snap = await db.collection('wallets').orderBy('createdAt', 'desc').get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

router.post('/wallets', async (req, res) => {
  const { name } = req.body;
  const id = uuidv4();
  await db.collection('wallets').doc(id).set({ name, balance: 0, createdAt: new Date().toISOString() });
  res.json({ id, name, balance: 0 });
});

router.post('/transactions/payment', async (req, res) => {
  const { customerId, walletId, amount } = req.body;
  
  try {
    await db.runTransaction(async (t) => {
      const custRef = db.collection('customers').doc(customerId);
      const wallRef = db.collection('wallets').doc(walletId);
      
      const custDoc = await t.get(custRef);
      const wallDoc = await t.get(wallRef);

      const newDebt = (custDoc.data().totalDebt || 0) - amount;
      const newBalance = (wallDoc.data().balance || 0) + amount;

      t.update(custRef, { totalDebt: newDebt });
      t.update(wallRef, { balance: newBalance });

      const txId = uuidv4();
      t.set(db.collection('transactions').doc(txId), {
        type: 'payment',
        customerId,
        walletId,
        amount,
        createdAt: new Date().toISOString(),
        description: `دفعة من ${custDoc.data().name}`
      });
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/transactions/deposit', async (req, res) => {
  const { walletId, amount, description } = req.body;
  
  try {
    await db.runTransaction(async (t) => {
      const wallRef = db.collection('wallets').doc(walletId);
      const wallDoc = await t.get(wallRef);

      const newBalance = (wallDoc.data().balance || 0) + amount;
      t.update(wallRef, { balance: newBalance });

      const txId = uuidv4();
      t.set(db.collection('transactions').doc(txId), {
        type: 'deposit',
        walletId,
        amount,
        createdAt: new Date().toISOString(),
        description: description || 'ايداع'
      });
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/wallets/:id', async (req, res) => {
  try {
    await db.runTransaction(async (t) => {
      const wallRef = db.collection('wallets').doc(req.params.id);
      const doc = await t.get(wallRef);
      if (!doc.exists) throw new Error('Wallet not found');
      if (doc.data().balance > 0) throw new Error('لا يمكن حذف محفظة تحتوي على رصيد');
      t.delete(wallRef);
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const snap = await db.collection('transactions').orderBy('createdAt', 'desc').limit(50).get();
    
    const wallSnap = await db.collection('wallets').get();
    const custSnap = await db.collection('customers').get();
    const wallMap = {}; wallSnap.forEach(d => wallMap[d.id] = d.data().name);
    const custMap = {}; custSnap.forEach(d => custMap[d.id] = d.data().name);

    res.json(snap.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, ...data, 
        walletName: wallMap[data.walletId] || 'محذوفة',
        customerName: data.customerId ? (custMap[data.customerId] || 'محذوف') : null
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/transactions/:id', async (req, res) => {
  try {
    await db.runTransaction(async (t) => {
      const txRef = db.collection('transactions').doc(req.params.id);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw new Error('Transaction not found');
      
      const tx = txDoc.data();
      const wallRef = db.collection('wallets').doc(tx.walletId);
      const wallDoc = await t.get(wallRef);

      if (tx.type === 'payment') {
        const custRef = db.collection('customers').doc(tx.customerId);
        const custDoc = await t.get(custRef);
        
        if (custDoc.exists) {
          const newDebt = (custDoc.data().totalDebt || 0) + tx.amount;
          t.update(custRef, { totalDebt: newDebt });
        }
        if (wallDoc.exists) {
          const newBalance = (wallDoc.data().balance || 0) - tx.amount;
          t.update(wallRef, { balance: newBalance });
        }
      } else if (tx.type === 'deposit') {
        if (wallDoc.exists) {
          const newBalance = (wallDoc.data().balance || 0) - tx.amount;
          t.update(wallRef, { balance: newBalance });
        }
      }
      
      t.delete(txRef);
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/product-demand', async (req, res) => {
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(300).get();
    const ordersList = snap.docs.map(d => {
      const data = d.data();
      return { productName: data.productName, duration: data.duration, price: data.price, date: data.createdAt };
    });
    
    if (ordersList.length === 0) return res.json([]);
    
    const analysis = await analyzeProductDemand(ordersList);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
