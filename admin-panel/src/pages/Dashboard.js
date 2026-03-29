import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const safeNum = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v) || 0;
  if (v && typeof v === 'object') return Object.values(v).reduce((a, b) => a + (parseInt(b) || 0), 0);
  return 0;
};

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: 24,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#718096', fontSize: 13, marginBottom: 8 }}>{label}</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#2d3748' }}>{safeNum(value).toLocaleString()}</p>
        </div>
        <span style={{ fontSize: 32 }}>{icon}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/api/dashboard/stats')
      .then(r => setStats(r.data.data))
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#718096' }}>Loading dashboard...</div>;
  if (error)   return <div style={{ padding: 24, color: '#c53030', background: '#fff5f5', borderRadius: 8 }}>Error: {error}</div>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2d3748', marginBottom: 24 }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard icon="👥" label="Total Customers"    value={stats?.total_customers}     color="#25d366" />
        <StatCard icon="💬" label="Conversations"       value={stats?.total_conversations} color="#3b82f6" />
        <StatCard icon="🛒" label="Total Orders"        value={stats?.total_orders}        color="#f59e0b" />
        <StatCard icon="📨" label="Messages Today"      value={stats?.messages_today}      color="#8b5cf6" />
        <StatCard icon="🔓" label="Open Conversations"  value={stats?.open_conversations}  color="#ef4444" />
        <StatCard icon="⏳" label="Pending Orders"      value={stats?.pending_orders}      color="#06b6d4" />
      </div>

      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#2d3748', marginBottom: 16 }}>Revenue Overview</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: '#25d366' }}>
            ₹{safeNum(stats?.total_revenue).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </span>
          <span style={{ color: '#718096', fontSize: 14 }}>Total Revenue (all time)</span>
        </div>
      </div>

      <div style={{ marginTop: 24, background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#2d3748', marginBottom: 16 }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'View Conversations', path: '/conversations', color: '#25d366' },
            { label: 'Manage Products',    path: '/products',      color: '#3b82f6' },
            { label: 'Check Orders',       path: '/orders',        color: '#f59e0b' },
            { label: 'Settings',           path: '/settings',      color: '#8b5cf6' },
          ].map(btn => (
            <a
              key={btn.path}
              href={btn.path}
              style={{
                padding: '10px 20px',
                background: btn.color,
                color: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {btn.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
