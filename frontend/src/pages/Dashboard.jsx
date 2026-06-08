import React, { useEffect, useState } from 'react';
import { getStats } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalDebt: 0, totalBalance: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats().then(data => {
      setStats(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>جاري التحميل...</div>;

  return (
    <div>
      <h1 className="page-title">لوحة القيادة</h1>
      
      <div className="card-grid">
        <div className="stat-card">
          <span className="stat-title">إجمالي ديون الزبائن</span>
          <span className="stat-value danger">{stats.totalDebt}</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">إجمالي رصيد المحافظ</span>
          <span className="stat-value success">{stats.totalBalance}</span>
        </div>
      </div>
    </div>
  );
}
