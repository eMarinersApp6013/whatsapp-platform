import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';

const STATUS_COLORS = {
  pending:    { bg: '#fffbeb', text: '#d97706' },
  confirmed:  { bg: '#f0fff4', text: '#25d366' },
  shipped:    { bg: '#ebf8ff', text: '#3b82f6' },
  delivered:  { bg: '#f0fff4', text: '#059669' },
  cancelled:  { bg: '#fff5f5', text: '#ef4444' },
};

const safeNum = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
};

export default function Orders() {
  const [orders,  setOrders]  = useState([]);
  const [filter,  setFilter]  = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.status = filter;
      const res = await api.get('/api/orders', { params });
      setOrders(res.data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/api/orders/${id}/status`, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      // Send WhatsApp notification
      try {
        await api.post(`/api/invoice/${id}/notify-status`, { status });
      } catch (_e) { /* WA not configured */ }
    } catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  const sendInvoice = async (id) => {
    try {
      await api.post(`/api/invoice/${id}/send`);
      alert('Invoice sent via WhatsApp!');
    } catch (e) { alert(e.response?.data?.message || 'WhatsApp not configured. Add credentials in Settings.'); }
  };

  const STATUSES = ['', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const items = (order) => {
    try {
      if (Array.isArray(order.items)) return order.items;
      if (typeof order.items === 'string') return JSON.parse(order.items);
      return [];
    } catch { return []; }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2d3748' }}>Orders</h1>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All Status'}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>No orders found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f7fafc' }}>
              <tr>
                {['Order ID', 'Customer', 'Items', 'Total', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#718096', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const sc = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
                return (
                  <tr key={order.id} style={{ borderBottom: '1px solid #f7fafc' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#2d3748' }}>#{order.id}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#2d3748' }}>{order.customer_name || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: '#718096' }}>{order.customer_phone}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#4a5568' }}>
                      {items(order).map((it, i) => (
                        <div key={i} style={{ fontSize: 12 }}>{it.name} × {it.qty}</div>
                      ))}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#25d366' }}>
                      ₹{safeNum(order.total_amount).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#718096', fontSize: 12 }}>
                      {order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={order.status}
                        onChange={e => updateStatus(order.id, e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                      >
                        {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button
                        onClick={() => sendInvoice(order.id)}
                        title="Send invoice via WhatsApp"
                        style={{ padding: '4px 8px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                      >
                        📄 Send
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
