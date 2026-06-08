import React, { useEffect, useState, useRef } from 'react';
import { getWallets, addWallet, getCustomers, recordPayment, recordDeposit, deleteWallet, getTransactions, undoTransaction } from '../api';

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms state
  const [newWalletName, setNewWalletName] = useState('');
  
  const [paymentData, setPaymentData] = useState({ customerId: '', walletId: '', amount: '' });
  const [depositData, setDepositData] = useState({ walletId: '', amount: '', description: '' });

  // Custom Searchable Dropdown state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const fetchData = async () => {
    const [ws, cs, txs] = await Promise.all([getWallets(), getCustomers(), getTransactions()]);
    setWallets(ws);
    setCustomers(cs);
    setTransactions(txs);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    
    // Close dropdown when clicking outside
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddWallet = async (e) => {
    e.preventDefault();
    if (!newWalletName.trim()) return;
    await addWallet(newWalletName);
    setNewWalletName('');
    fetchData();
  };

  const handleDeleteWallet = async (id, balance) => {
    if (balance > 0) return alert('لا يمكن حذف محفظة تحتوي على رصيد');
    if (!window.confirm('هل أنت متأكد من حذف هذه المحفظة؟')) return;
    try {
      await deleteWallet(id);
      fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'خطأ أثناء الحذف');
    }
  };

  const handleUndoTransaction = async (id) => {
    if (!window.confirm('هل أنت متأكد من التراجع عن هذه الحركة؟ سيتم عكس تأثيرها المالي.')) return;
    try {
      await undoTransaction(id);
      fetchData();
    } catch (e) {
      alert('خطأ أثناء التراجع');
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    const { customerId, walletId, amount } = paymentData;
    if (!customerId || !walletId || !amount) return alert('يرجى اختيار الزبون والمحفظة والمبلغ');
    try {
      await recordPayment(customerId, walletId, parseFloat(amount));
      setPaymentData({ customerId: '', walletId: '', amount: '' });
      setSearchQuery('');
      fetchData();
      alert('تم تسجيل الدفعة بنجاح');
    } catch (e) {
      alert('خطأ أثناء التسجيل');
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const { walletId, amount, description } = depositData;
    if (!walletId || !amount) return alert('يرجى ملء جميع الحقول');
    try {
      await recordDeposit(walletId, parseFloat(amount), description);
      setDepositData({ walletId: '', amount: '', description: '' });
      fetchData();
      alert('تم الايداع بنجاح');
    } catch (e) {
      alert('خطأ أثناء الايداع');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.aliases.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectCustomer = (customer) => {
    setPaymentData({ ...paymentData, customerId: customer.id });
    setSearchQuery(`${customer.name} (دين: ${customer.totalDebt})`);
    setShowDropdown(false);
  };

  if (loading) return <div>جاري التحميل...</div>;

  return (
    <div>
      <h1 className="page-title">المحافظ والدفعات</h1>
      
      <div className="card-grid">
        {/* Record Payment Form */}
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <h3 style={{ marginBottom: '1rem' }}>تسجيل دفعة من زبون</h3>
          <form onSubmit={handlePayment} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'start' }}>
            
            {/* Custom Searchable Dropdown */}
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="ابحث عن الزبون..." 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                  if (paymentData.customerId) setPaymentData({ ...paymentData, customerId: '' });
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, 
                  background: '#fff', border: '1px solid var(--border-color)', 
                  borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', 
                  zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginTop: '4px'
                }}>
                  {filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                    <div 
                      key={c.id} 
                      style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                      onMouseDown={() => selectCustomer(c)}
                      onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>دين: {c.totalDebt}</div>
                    </div>
                  )) : (
                    <div style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>لا توجد نتائج</div>
                  )}
                </div>
              )}
            </div>

            <select className="input-field" value={paymentData.walletId} onChange={e => setPaymentData({...paymentData, walletId: e.target.value})}>
              <option value="">اختر المحفظة</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input type="number" className="input-field" placeholder="المبلغ" value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} />
            <button type="submit" className="btn btn-success" style={{ height: '42px' }}>تسجيل</button>
          </form>
        </div>

        {/* Record Deposit Form */}
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <h3 style={{ marginBottom: '1rem' }}>ايداع يدوي</h3>
          <form onSubmit={handleDeposit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '1rem' }}>
            <select className="input-field" value={depositData.walletId} onChange={e => setDepositData({...depositData, walletId: e.target.value})}>
              <option value="">اختر المحفظة</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input type="number" className="input-field" placeholder="المبلغ" value={depositData.amount} onChange={e => setDepositData({...depositData, amount: e.target.value})} />
            <input type="text" className="input-field" placeholder="الوصف (اختياري)" value={depositData.description} onChange={e => setDepositData({...depositData, description: e.target.value})} />
            <button type="submit" className="btn btn-primary">ايداع</button>
          </form>
        </div>

        {/* Add Wallet Form */}
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <h3 style={{ marginBottom: '1rem' }}>إضافة محفظة جديدة</h3>
          <form onSubmit={handleAddWallet} className="flex-row">
            <input 
              type="text" 
              className="input-field" 
              placeholder="اسم المحفظة" 
              value={newWalletName}
              onChange={e => setNewWalletName(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
            <button type="submit" className="btn btn-primary">إضافة</button>
          </form>
        </div>

      </div>

      <div className="table-wrapper" style={{ marginTop: '2rem' }}>
        <table>
          <thead>
            <tr>
              <th>اسم المحفظة</th>
              <th>الرصيد الحالي</th>
              <th style={{ textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map(w => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.name}</td>
                <td><span className="badge-status completed" style={{ fontSize: '1rem' }}>{w.balance}</span></td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => handleDeleteWallet(w.id, w.balance)} className="btn btn-danger-soft">حذف</button>
                </td>
              </tr>
            ))}
            {wallets.length === 0 && (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>لا يوجد محافظ</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="page-title" style={{ marginTop: '3rem', marginBottom: '1.5rem', fontSize: '1.5rem' }}>سجل الحركات الأخير</h2>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>المحفظة</th>
              <th>المبلغ</th>
              <th>الوصف / الزبون</th>
              <th style={{ textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id}>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {new Date(tx.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td>
                  {tx.type === 'payment' ? (
                    <span className="badge-status" style={{ background: '#e5f6fd', color: '#0288d1' }}>تسديد دين</span>
                  ) : (
                    <span className="badge-status completed">إيداع</span>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{tx.walletName}</td>
                <td style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>{tx.amount}</td>
                <td style={{ fontSize: '0.9rem' }}>
                  {tx.type === 'payment' ? (
                    <span>دفعة من: <strong>{tx.customerName}</strong></span>
                  ) : (
                    <span>{tx.description}</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => handleUndoTransaction(tx.id)} className="btn btn-danger-soft" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>تراجع</button>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>لا يوجد حركات مسجلة</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
