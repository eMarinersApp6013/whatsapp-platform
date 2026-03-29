import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const safeNum = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  if (v && typeof v === 'object') return Object.values(v).reduce((a, b) => a + (parseFloat(b) || 0), 0);
  return 0;
};

function MiniBar({ data = [], valueKey = 'count', color = '#25d366', height = 80 }) {
  if (!data.length) return <div style={{ color: '#a0aec0', fontSize: 12, padding: 8 }}>No data yet</div>;
  const max = Math.max(...data.map(d => safeNum(d[valueKey])), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.slice(-30).map((d, i) => {
        const val = safeNum(d[valueKey]);
        const pct = max > 0 ? (val / max) * 100 : 0;
        return (
          <div
            key={i}
            title={`${d.date}: ${val}`}
            style={{
              flex: 1,
              height: `${Math.max(pct, 3)}%`,
              background: color,
              borderRadius: '2px 2px 0 0',
              opacity: 0.8,
              minWidth: 4,
            }}
          />
        );
      })}
    </div>
  );
}

function Card({ title, children, span = 1 }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      gridColumn: `span ${span}`,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#718096', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [data,    setData]    = useState(null);
  const [products, setProducts] = useState([]);
  const [days,    setDays]    = useState(30);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/analytics/overview', { params: { days } }),
      api.get('/api/analytics/top-products', { params: { limit: 5 } }),
    ])
      .then(([overview, tops]) => {
        setData(overview.data.data || {});
        setProducts(tops.data.data || []);
      })
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, [days]);

  const totalRevenue = (data?.revenue || []).reduce((s, r) => s + safeNum(r.total), 0);
  const totalOrders  = (data?.orders  || []).reduce((s, r) => s + safeNum(r.count), 0);
  const totalMsgs    = (data?.messages || []).reduce((s, r) => s + safeNum(r.count), 0);
  const newCustomers = (data?.customers || []).reduce((s, r) => s + safeNum(r.count), 0);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#718096' }}>Loading analytics...</div>;
  if (error)   return <div style={{ padding: 24, color: '#c53030', background: '#fff5f5', borderRadius: 8 }}>Error: {error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2d3748' }}>Analytics</h1>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Revenue',      value: `₹${safeNum(totalRevenue).toLocaleString('en-IN')}`, color: '#25d366' },
          { label: 'Orders',       value: totalOrders,  color: '#f59e0b' },
          { label: 'Messages',     value: totalMsgs,    color: '#3b82f6' },
          { label: 'New Customers', value: newCustomers, color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: '#718096', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#2d3748' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Daily Revenue">
          <MiniBar data={data?.revenue  || []} valueKey="total" color="#25d366" />
        </Card>
        <Card title="Daily Orders">
          <MiniBar data={data?.orders   || []} valueKey="count" color="#f59e0b" />
        </Card>
        <Card title="Messages Per Day">
          <MiniBar data={data?.messages || []} valueKey="count" color="#3b82f6" />
        </Card>
        <Card title="New Customers">
          <MiniBar data={data?.customers || []} valueKey="count" color="#8b5cf6" />
        </Card>

        {/* Top products */}
        <Card title="Top Products by Orders" span={2}>
          {products.length === 0 ? (
            <p style={{ color: '#a0aec0', fontSize: 13 }}>No order data yet</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: '#718096', fontWeight: 600 }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: '#718096', fontWeight: 600 }}>Qty Sold</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: '#718096', fontWeight: 600 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f7fafc' }}>
                    <td style={{ padding: '8px 0', color: '#2d3748' }}>{p.name}</td>
                    <td style={{ padding: '8px 0', color: '#2d3748', textAlign: 'right' }}>{safeNum(p.total_qty)}</td>
                    <td style={{ padding: '8px 0', color: '#25d366', textAlign: 'right', fontWeight: 600 }}>₹{safeNum(p.revenue).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
