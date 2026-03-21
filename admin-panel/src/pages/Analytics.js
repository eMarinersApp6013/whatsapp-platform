import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, ShoppingCart, Users, Repeat } from 'lucide-react';
import api from '../utils/api';
import { formatCurrency } from '../utils/helpers';

const COLORS = ['#085041', '#C9A84C', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('daily');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const res = await api.get('/api/analytics/summary');
      setStats(res.data);
    } catch (err) {
      console.error('Analytics error:', err);
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

  // Prepare chart data
  const ordersByStatus = (stats?.orders_by_status || []).map((s) => ({
    name: s.status?.replace(/_/g, ' ') || 'Unknown',
    value: parseInt(s.count || 0),
  }));

  const topProducts = (stats?.top_5_products || []).map((p) => ({
    name: (p.name || 'Unknown').substring(0, 15),
    orders: parseInt(p.order_count || p.count || 0),
  }));

  const codPrepaid = [
    { name: 'Prepaid', value: parseInt(stats?.prepaid_count || 0) || 1 },
    { name: 'COD', value: parseInt(stats?.cod_count || 0) || 1 },
  ];

  const courierData = (stats?.courier_breakdown || []).map((c) => ({
    name: c.courier_name || 'Unknown',
    shipments: parseInt(c.count || 0),
  }));

  // Revenue chart mock (7 days)
  const revenueChart = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    revenueChart.push({
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      revenue: i === 0 ? (stats?.revenue_today || 0) : Math.floor(Math.random() * 20000) + 3000,
    });
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Revenue Today</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(stats?.revenue_today || 0)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Revenue This Month</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(stats?.revenue_this_month || 0)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Order Value</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(stats?.avg_order_value || 0)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center">
              <Users className="w-6 h-6 text-gold-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Repeat Customer Rate</p>
              <p className="text-2xl font-bold text-gray-800">{stats?.repeat_customer_rate || '0'}%</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Repeat className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Revenue Trend</h2>
          <div className="flex gap-1">
            {['daily', 'weekly', 'monthly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-lg ${
                  period === p ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [formatCurrency(v), 'Revenue']} />
            <Line type="monotone" dataKey="revenue" stroke="#085041" strokeWidth={3} dot={{ fill: '#C9A84C', r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by Status Donut */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Orders by Status</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={ordersByStatus}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {ordersByStatus.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top 5 Products Bar */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Top 5 Products</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
              <Tooltip />
              <Bar dataKey="orders" fill="#085041" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* COD vs Prepaid Pie */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">COD vs Prepaid</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={codPrepaid}
                cx="50%"
                cy="50%"
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                <Cell fill="#085041" />
                <Cell fill="#C9A84C" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Courier Breakdown */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Courier Partner Breakdown</h2>
          {courierData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400">No courier data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={courierData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="shipments" fill="#C9A84C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
