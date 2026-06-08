const { db } = require('./firebase');
const { v4: uuidv4 } = require('uuid');

async function findCustomerByName(name) {
  const snapshot = await db.collection('customers').where('aliases', 'array-contains', name).get();
  if (snapshot.empty) {
    // Check main name
    const exactMatch = await db.collection('customers').where('name', '==', name).get();
    if (!exactMatch.empty) {
      return exactMatch.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return [];
  }
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getAllCustomers() {
  const snapshot = await db.collection('customers').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function createCustomer(name) {
  const id = uuidv4();
  const customer = {
    name,
    aliases: [name],
    totalDebt: 0,
    createdAt: new Date().toISOString()
  };
  await db.collection('customers').doc(id).set(customer);
  return { id, ...customer };
}

async function addAliasToCustomer(customerId, newAlias) {
  const docRef = db.collection('customers').doc(customerId);
  const doc = await docRef.get();
  if (doc.exists) {
    const data = doc.data();
    if (!data.aliases.includes(newAlias)) {
      const updatedAliases = [...data.aliases, newAlias];
      await docRef.update({ aliases: updatedAliases });
    }
  }
}

async function createOrder(customerId, productName, duration, quantity = 1, originalMessageText, batchId = null) {
  const id = uuidv4();
  const order = {
    customerId,
    productName,
    duration,
    quantity,
    status: 'pending_price',
    createdAt: new Date().toISOString(),
    originalMessageText,
    batchId
  };
  await db.collection('orders').doc(id).set(order);
  return { id, ...order };
}

async function updateOrder(orderId, updates) {
  const docRef = db.collection('orders').doc(orderId);
  await docRef.update(updates);
  return { id: orderId, ...updates };
}

async function getOrder(orderId) {
  const doc = await db.collection('orders').doc(orderId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}


module.exports = {
  findCustomerByName,
  getAllCustomers,
  createCustomer,
  addAliasToCustomer,
  createOrder,
  updateOrder,
  getOrder
};
