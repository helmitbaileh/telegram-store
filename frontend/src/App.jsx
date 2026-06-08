import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Users, Wallet, Sparkles } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Wallets from './pages/Wallets';
import ProductsAI from './pages/ProductsAI';
import './index.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <aside className="sidebar">
          <h2>إدارة المبيعات</h2>
          <nav>
            <NavLink to="/" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'} end>
              <LayoutDashboard size={20} />
              لوحة القيادة
            </NavLink>
            <NavLink to="/orders" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <ShoppingCart size={20} />
              الطلبات
            </NavLink>
            <NavLink to="/customers" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <Users size={20} />
              الزبائن والديون
            </NavLink>
            <NavLink to="/wallets" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <Wallet size={20} />
              المحافظ والدفعات
            </NavLink>
            <NavLink to="/ai-products" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>
              <Sparkles size={20} />
              تحليل المنتجات
            </NavLink>
          </nav>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/wallets" element={<Wallets />} />
            <Route path="/ai-products" element={<ProductsAI />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
