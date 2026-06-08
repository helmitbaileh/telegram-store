import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const ADMIN_PASSWORD = 'admin123'; // Hardcoded for simple security

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${ADMIN_PASSWORD}`
  }
});

export const getStats = () => api.get('/stats').then(res => res.data);
export const getCustomers = () => api.get('/customers').then(res => res.data);
export const getOrders = () => api.get('/orders').then(res => res.data);
export const getWallets = () => api.get('/wallets').then(res => res.data);
export const deleteWallet = (walletId) => api.delete(`/wallets/${walletId}`).then(res => res.data);

export const getTransactions = () => api.get('/transactions').then(res => res.data);
export const undoTransaction = (transactionId) => api.delete(`/transactions/${transactionId}`).then(res => res.data);

export const addCustomer = (name) => api.post('/customers', { name }).then(res => res.data);
export const addAlias = (customerId, alias) => api.post(`/customers/${customerId}/aliases`, { alias }).then(res => res.data);
export const mergeCustomers = (sourceId, targetId) => api.post('/customers/merge', { sourceId, targetId }).then(res => res.data);

export const addOrder = (orderData) => api.post('/orders', orderData).then(res => res.data);
export const updateOrder = (orderId, orderData) => api.put(`/orders/${orderId}`, orderData).then(res => res.data);
export const deleteOrder = (orderId) => api.delete(`/orders/${orderId}`).then(res => res.data);

export const setOrderPrice = (orderId, price) => api.post(`/orders/${orderId}/price`, { price }).then(res => res.data);
export const addWallet = (name) => api.post('/wallets', { name }).then(res => res.data);
export const recordPayment = (customerId, walletId, amount) => api.post('/transactions/payment', { customerId, walletId, amount }).then(res => res.data);
export const recordDeposit = (walletId, amount, description) => api.post('/transactions/deposit', { walletId, amount, description }).then(res => res.data);

export const getProductDemandAnalysis = () => api.get('/ai/product-demand').then(res => res.data);

export default api;
