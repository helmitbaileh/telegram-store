import React, { useEffect, useState } from 'react';
import { getCustomers, addCustomer, mergeCustomers } from '../api';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCustomerName, setNewCustomerName] = useState('');
  
  // Merge state: { [sourceCustomerId]: targetCustomerId }
  const [mergeSelections, setMergeSelections] = useState({});

  const fetchCustomers = () => {
    getCustomers().then(data => {
      setCustomers(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;
    try {
      await addCustomer(newCustomerName);
      setNewCustomerName('');
      fetchCustomers();
    } catch (error) {
      alert('خطأ أثناء إضافة الزبون');
    }
  };

  const handleMerge = async (sourceId) => {
    const targetId = mergeSelections[sourceId];
    if (!targetId) return alert('الرجاء اختيار الزبون الرئيسي للدمج معه');
    if (sourceId === targetId) return alert('لا يمكن دمج الزبون مع نفسه');

    if (!window.confirm('تأكيد عملية الدمج؟ سيتم نقل كافة ديون وطلبات هذا الزبون إلى الزبون المختار وحذفه.')) return;

    try {
      await mergeCustomers(sourceId, targetId);
      setMergeSelections(prev => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      fetchCustomers();
      alert('تم الدمج بنجاح');
    } catch (error) {
      alert('خطأ أثناء الدمج');
    }
  };

  if (loading) return <div>جاري التحميل...</div>;

  return (
    <div>
      <h1 className="page-title">الزبائن والديون</h1>
      
      <div className="card-grid">
        <div className="stat-card">
          <h3 style={{ marginBottom: '1rem' }}>إضافة زبون جديد يدوياً</h3>
          <form onSubmit={handleAddCustomer} className="flex-row">
            <input 
              type="text" 
              className="input-field" 
              placeholder="اسم الزبون" 
              value={newCustomerName}
              onChange={e => setNewCustomerName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">إضافة</button>
          </form>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الأسماء المستعارة (يوزرات تابعة)</th>
              <th>الديون المتراكمة</th>
              <th>دمج مع زبون آخر (الزبون الرئيسي)</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{c.aliases.join(', ')}</td>
                <td>
                  <span className={`badge ${c.totalDebt > 0 ? 'pending' : 'completed'}`}>
                    {c.totalDebt}
                  </span>
                </td>
                <td>
                  <div className="flex-row">
                    <select 
                      className="input-field" 
                      style={{ width: '200px', padding: '0.4rem' }}
                      value={mergeSelections[c.id] || ''}
                      onChange={e => setMergeSelections({...mergeSelections, [c.id]: e.target.value})}
                    >
                      <option value="">اختر الزبون الرئيسي...</option>
                      {customers.filter(target => target.id !== c.id).map(target => (
                        <option key={target.id} value={target.id}>{target.name}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" style={{ padding: '0.4rem 1rem' }} onClick={() => handleMerge(c.id)}>
                      دمج
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center' }}>لا يوجد زبائن حالياً</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
