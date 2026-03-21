import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter } from 'lucide-react';
import api from '../utils/api';
import { formatCurrency, formatDate, statusColor } from '../utils/helpers';

const STATUS_TABS = ['All', 'PENDING_PAYMENT', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeTab !== 'All') params.status = activeTab;
      if (search) params.search = search;
      const res = await api.get('/api/orders', { params });
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error('Load orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadOrders();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  activeTab === tab
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab === 'All' ? 'All' : tab.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orders..."
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none w-64"
              />
            </div>
            <button
              type="submit"
              className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
            >
              <Filter className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No orders found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Order #</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Payment</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition"
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary-500">
                    #{order.order_number || order.id}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-800">{order.client_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{order.client_phone || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {Array.isArray(order.items) ? order.items.length : '-'} items
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    {formatCurrency(order.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {order.payment_method || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${statusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
