import React, { useEffect, useState } from 'react';
import { getProductDemandAnalysis } from '../api';

export default function ProductsAI() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProductDemandAnalysis();
      setProducts(data);
    } catch (err) {
      setError('حدث خطأ أثناء جلب تحليل الذكاء الاصطناعي.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderDemandBadge = (level) => {
    if (level === 'عالي') return <span className="badge-status completed">{level}</span>;
    if (level === 'منخفض') return <span className="badge-status pending" style={{ background: '#ffebee', color: '#c62828' }}>{level}</span>;
    return <span className="badge-status pending">{level}</span>;
  };

  const renderTrend = (trend) => {
    if (trend === 'صاعد') return <span style={{ color: '#137333', fontWeight: 'bold' }}>↗ {trend}</span>;
    if (trend === 'متراجع') return <span style={{ color: '#c62828', fontWeight: 'bold' }}>↘ {trend}</span>;
    return <span style={{ color: '#b06000', fontWeight: 'bold' }}>→ {trend}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>تحليل المنتجات بالذكاء الاصطناعي 🤖</h1>
        <button className="btn btn-primary" onClick={fetchData} disabled={loading}>
          {loading ? 'جاري التحليل...' : 'تحديث التحليل'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: '#ffebee', padding: '1rem', borderRadius: '10px' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <h3 style={{ marginBottom: '1rem' }}>يقوم الذكاء الاصطناعي بتحليل طلبات متجرك...</h3>
          <p>قد يستغرق هذا بضع ثوانٍ</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>اسم المنتج</th>
                <th style={{ textAlign: 'center' }}>مستوى الطلب</th>
                <th style={{ textAlign: 'center' }}>الطلبات الأخيرة</th>
                <th style={{ textAlign: 'center' }}>المؤشر</th>
                <th style={{ width: '40%' }}>ملاحظات الذكاء الاصطناعي</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem' }}>لا يوجد بيانات كافية للتحليل</td>
                </tr>
              ) : (
                products.map((p, index) => (
                  <tr key={index}>
                    <td style={{ fontWeight: 'bold', fontSize: '1.05rem', color: 'var(--accent-primary)' }}>{p.productName}</td>
                    <td style={{ textAlign: 'center' }}>{renderDemandBadge(p.demandLevel)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{p.orderCount}</td>
                    <td style={{ textAlign: 'center' }}>{renderTrend(p.trend)}</td>
                    <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>{p.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
