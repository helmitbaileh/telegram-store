import React, { useEffect, useState } from 'react';
import { getOrders, setOrderPrice, addOrder, updateOrder, deleteOrder, getCustomers } from '../api';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New Order State
  const [newOrder, setNewOrder] = useState({ customerId: '', productName: '', price: '' });

  // Edit Mode State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ productName: '', price: '' });
  
  // Quick Price State
  const [quickPrices, setQuickPrices] = useState({});
  
  // Quick Edit State (for inline edits)
  const [quickEdits, setQuickEdits] = useState({});

  const fetchData = () => {
    Promise.all([getOrders(), getCustomers()]).then(([ordersData, customersData]) => {
      setOrders(ordersData);
      setCustomers(customersData);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddOrder = async (e) => {
    e.preventDefault();
    if (!newOrder.customerId || !newOrder.productName) return alert('اسم الزبون والمنتج مطلوبان');
    try {
      await addOrder({
        ...newOrder,
        quantity: 1,
        price: newOrder.price ? parseFloat(newOrder.price) : null
      });
      setNewOrder({ customerId: '', productName: '', price: '' });
      fetchData();
    } catch (err) {
      alert('خطأ أثناء الإضافة');
    }
  };

  const startEdit = (order) => {
    setEditingId(order.id);
    setEditForm({
      productName: order.productName,
      price: order.price || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id) => {
    try {
      const priceVal = editForm.price ? parseFloat(editForm.price) : null;
      await updateOrder(id, { productName: editForm.productName, price: priceVal });
      setEditingId(null);
      fetchData();
    } catch (err) {
      alert('خطأ أثناء التعديل');
    }
  };

  const handleQuickPriceSave = async (id, currentOrder) => {
    try {
      const val = quickPrices[id];
      if (val === undefined || val === '') return;
      const priceVal = parseFloat(val);
      await updateOrder(id, { ...currentOrder, price: priceVal });
      fetchData();
      setQuickPrices(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      alert('خطأ أثناء حفظ السعر');
    }
  };

  const handleQuickEditChange = (id, field, value) => {
    setQuickEdits(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const handleQuickEditBlur = async (id, currentOrder, field) => {
    const newVal = quickEdits[id]?.[field];
    if (newVal !== undefined && newVal !== currentOrder[field]) {
      try {
        await updateOrder(id, { ...currentOrder, [field]: newVal });
        fetchData();
        setQuickEdits(prev => {
          const next = { ...prev };
          delete next[id][field];
          if (Object.keys(next[id]).length === 0) delete next[id];
          return next;
        });
      } catch (err) {
        alert('خطأ أثناء التعديل السريع');
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب؟ سيتم خصم سعره من ديون الزبون إن كان مسعراً.')) return;
    try {
      await deleteOrder(id);
      fetchData();
    } catch (err) {
      alert('خطأ أثناء الحذف');
    }
  };

  if (loading) return <div>جاري التحميل...</div>;

  return (
    <div>
      <h1 className="page-title">إدارة الطلبات</h1>

      <div className="card-grid">
        <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: '1.5rem', fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>إضافة طلب يدوياً</h3>
          <form onSubmit={handleAddOrder} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="input-field" style={{ flex: 1, minWidth: '150px' }} value={newOrder.customerId} onChange={e => setNewOrder({...newOrder, customerId: e.target.value})}>
              <option value="">اختر الزبون</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="text" className="input-field" style={{ flex: 1, minWidth: '150px' }} placeholder="المنتج (مع المدة والكمية)" value={newOrder.productName} onChange={e => setNewOrder({...newOrder, productName: e.target.value})} />
            <input type="number" className="input-field" style={{ flex: 1, minWidth: '100px' }} placeholder="السعر (اختياري)" value={newOrder.price} onChange={e => setNewOrder({...newOrder, price: e.target.value})} />
            <button type="submit" className="btn btn-primary">إضافة الطلب</button>
          </form>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>الزبون / التاريخ</th>
              <th style={{ width: '25%' }}>رسالة الزبون</th>
              <th style={{ width: '25%' }}>المنتج والكمية</th>
              <th style={{ textAlign: 'center' }}>حالة الطلب</th>
              <th style={{ textAlign: 'center' }}>السعر</th>
              <th style={{ textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>لا يوجد طلبات حالياً.</td>
              </tr>
            ) : (
              orders.map(o => (
                <tr key={o.id} className={editingId === o.id ? 'editing-row' : ''}>
                  {editingId === o.id ? (
                    <td colSpan="6">
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#f8f9fa', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <textarea className="input-field" rows={2} value={editForm.productName} onChange={e => setEditForm({...editForm, productName: e.target.value})} placeholder="المنتج والكمية" style={{ flex: 1, resize: 'none' }} />
                        <input type="number" className="input-field" value={editForm.price} onChange={e => setEditForm({...editForm, price: e.target.value})} placeholder="السعر" style={{ width: '100px' }} />
                        <button className="btn btn-primary" onClick={() => saveEdit(o.id)}>حفظ التعديلات</button>
                        <button className="btn btn-secondary" onClick={cancelEdit}>إلغاء</button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '4px', fontSize: '0.95rem' }}>
                          {customers.find(c => c.id === o.customerId)?.name || 'غير معروف'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(o.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      
                      <td>
                        {o.originalMessageText ? (
                          <div className="chat-bubble">
                            {o.originalMessageText.replace(/\[الرسالة \d+\]:\s*/g, '')}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>لا يوجد</span>
                        )}
                      </td>

                      <td style={{ fontWeight: 'bold' }}>
                        <textarea
                          className="input-field transparent"
                          rows={2}
                          style={{ width: '100%', fontWeight: '700', resize: 'none', overflow: 'hidden', lineHeight: '1.5' }}
                          value={quickEdits[o.id]?.productName !== undefined ? quickEdits[o.id].productName : o.productName}
                          onChange={e => handleQuickEditChange(o.id, 'productName', e.target.value)}
                          onBlur={() => handleQuickEditBlur(o.id, o, 'productName')}
                        />
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {o.status === 'completed' ? (
                          <span className="badge-status completed">مكتمل</span>
                        ) : (
                          <span className="badge-status pending">قيد الانتظار</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <input 
                            type="number" 
                            className="input-field transparent" 
                            placeholder="السعر" 
                            style={{ width: '65px', textAlign: 'center' }}
                            value={quickPrices[o.id] !== undefined ? quickPrices[o.id] : (o.price || '')}
                            onChange={e => setQuickPrices({...quickPrices, [o.id]: e.target.value})}
                          />
                          <button onClick={() => handleQuickPriceSave(o.id, o)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem' }}>
                            حفظ
                          </button>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => startEdit(o)} className="btn btn-secondary">تعديل</button>
                          <button onClick={() => handleDelete(o.id)} className="btn btn-danger-soft">حذف</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
