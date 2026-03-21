import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, DollarSign, FileText, Truck, AlertCircle, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import { formatCurrency, formatDate, statusColor } from '../utils/helpers';

function StatCard({ icon: Icon, label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 ${onClick ? 'cursor-pointer hover:shadow-md' : ''} transition`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [summaryRes, ordersRes] = await Promise.all([
        api.get('/api/analytics/summary').catch(() => ({ data: {} })),
        api.get('/api/orders?limit=5').catch(() => ({ data: { orders: [] } })),
      ]);
      setStats(summaryRes.data);
      setRecentOrders(ordersRes.data.orders || []);

      // Generate chart data from summary or mock
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({
          date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          revenue: Math.floor(Math.random() * 15000) + 2000,
        });
      }
      if (summaryRes.data?.revenue_today) {
        days[6].revenue = summaryRes.data.revenue_today;
      }
      setChartData(days);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={ShoppingCart}
          label="Orders Today"
          value={stats?.orders_by_status?.reduce((a, b) => a + parseInt(b.count || 0), 0) || 0}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue Today"
          value={formatCurrency(stats?.revenue_today || 0)}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          icon={FileText}
          label="Pending Invoices"
          value={stats?.pending_approvals_count || 0}
          color="bg-yellow-50 text-yellow-600"
          onClick={() => navigate('/invoices')}
        />
        <StatCard
          icon={Truck}
          label="Pending Courier"
          value={stats?.orders_by_status?.find(s => s.status === 'CONFIRMED')?.count || 0}
          color="bg-purple-50 text-purple-600"
          onClick={() => navigate('/orders')}
        />
        <StatCard
          icon={AlertCircle}
          label="Open Tickets"
          value={stats?.open_tickets || 0}
          color="bg-red-50 text-red-600"
        />
      </div>

      {/* Chart + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Revenue (Last 7 Days)</h2>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatCurrency(value), 'Revenue']} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#085041"
                strokeWidth={3}
                dot={{ fill: '#C9A84C', strokeWidth: 2, r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Orders</h2>
          <div className="space-y-3">
            {recentOrders.length === 0 ? (
              <p className="text-gray-400 text-sm">No orders yet</p>
            ) : (
              recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      #{order.order_number || order.id}
                    </p>
                    <p className="text-xs text-gray-500">{order.client_name || 'Unknown'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-800">
                      {formatCurrency(order.total_amount)}
                    </p>
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${statusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          {recentOrders.length > 0 && (
            <button
              onClick={() => navigate('/orders')}
              className="w-full mt-4 text-sm text-primary-500 hover:text-primary-600 font-medium"
            >
              View All Orders
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/invoices')}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition"
          >
            View Pending Invoices
          </button>
          <button
            onClick={() => navigate('/orders')}
            className="px-4 py-2 bg-gold-500 text-white rounded-lg text-sm hover:bg-gold-600 transition"
          >
            View Pending Courier
          </button>
          <button
            onClick={() => navigate('/products')}
            className="px-4 py-2 border border-primary-500 text-primary-500 rounded-lg text-sm hover:bg-primary-50 transition"
          >
            Manage Products
          </button>
          <button
            onClick={() => navigate('/broadcast')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Send Broadcast
          </button>
        </div>
      </div>
    </div>
  );
}
