import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';

const TYPE_LABELS = {
  cart_abandonment: { label: 'Cart Abandonment', icon: '🛒', color: '#d97706' },
  wishlist_nudge:   { label: 'Wishlist Nudge',   icon: '💝', color: '#7c3aed' },
  reorder_reminder: { label: 'Reorder Reminder', icon: '🔄', color: '#2563eb' },
  special_day:      { label: 'Special Day',       icon: '🎉', color: '#059669' },
};

const STATUS_COLORS = {
  pending: { bg: '#fffbeb', text: '#d97706' },
  sent:    { bg: '#f0fff4', text: '#059669' },
  failed:  { bg: '#fff5f5', text: '#ef4444' },
  skipped: { bg: '#f7f7f7', text: '#718096' },
};

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', flex: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#718096', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function Automation() {
  const [jobs,   setJobs]   = useState([]);
  const [stats,  setStats]  = useState(null);
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [page,   setPage]   = useState(1);
  const [total,  setTotal]  = useState(0);
  const [loading, setLoading]   = useState(true);
  const [triggering, setTriggering] = useState('');

  const limit = 30;

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/api/automation/stats');
      setStats(res.data);
    } catch (_) {}
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (filter.status) params.status = filter.status;
      if (filter.type)   params.type   = filter.type;
      const res = await api.get('/api/automation/jobs', { params });
      setJobs(res.data.jobs || []);
      setTotal(res.data.total || 0);
    } catch (_) {}
    finally { setLoading(false); }
  }, [page, filter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadJobs();  }, [loadJobs]);

  const trigger = async (type) => {
    setTriggering(type);
    try {
      const res = await api.post('/api/automation/trigger', { type });
      alert(res.data.message || 'Triggered!');
      await loadStats();
      await loadJobs();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to trigger');
    } finally { setTriggering(''); }
  };

  const cancelJob = async (id) => {
    if (!window.confirm('Cancel this job?')) return;
    try {
      await api.delete(`/api/automation/jobs/${id}`);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'skipped' } : j));
    } catch (_) {}
  };

  // Aggregate stats
  const sentToday   = stats?.sent_today   || 0;
  const pendingCount = stats?.pending_count || 0;
  const typeBreakdown = {};
  (stats?.breakdown || []).forEach(row => {
    if (!typeBreakdown[row.type]) typeBreakdown[row.type] = { sent: 0, pending: 0, failed: 0 };
    typeBreakdown[row.type][row.status] = parseInt(row.count);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>AI Keep-in-Touch Automation</h2>
          <p style={{ margin: '4px 0 0', color: '#718096', fontSize: 13 }}>
            Automated WhatsApp messages: cart recovery, wishlist nudges, reorder reminders, special days
          </p>
        </div>
        <button onClick={() => { loadStats(); loadJobs(); }}
          style={{ padding: '8px 16px', background: '#f0f2f5', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard icon="📤" label="Sent Today"      value={sentToday}    color="#059669" />
        <StatCard icon="⏳" label="Pending"          value={pendingCount} color="#d97706" />
        <StatCard icon="📊" label="Total Logged"     value={total}        color="#3b82f6" />
        <StatCard icon="⚡" label="Automation Active" value="ON"          color="#7c3aed" />
      </div>

      {/* Trigger cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {Object.entries(TYPE_LABELS).map(([type, meta]) => {
          const counts = typeBreakdown[type] || { sent: 0, pending: 0, failed: 0 };
          return (
            <div key={type} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderTop: `3px solid ${meta.color}` }}>
              <div style={{ fontSize: 28 }}>{meta.icon}</div>
              <div style={{ fontWeight: 600, marginTop: 8, fontSize: 14 }}>{meta.label}</div>
              <div style={{ fontSize: 12, color: '#718096', marginTop: 6 }}>
                Sent: <b style={{ color: '#059669' }}>{counts.sent}</b> &nbsp;
                Pending: <b style={{ color: '#d97706' }}>{counts.pending}</b> &nbsp;
                Failed: <b style={{ color: '#ef4444' }}>{counts.failed}</b>
              </div>
              <button
                onClick={() => trigger(type)}
                disabled={!!triggering}
                style={{
                  marginTop: 12, width: '100%', padding: '8px 0',
                  background: triggering === type ? '#e2e8f0' : meta.color,
                  color: '#fff', border: 'none', borderRadius: 8,
                  cursor: triggering ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {triggering === type ? 'Running...' : '▶ Run Now'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            value={filter.status}
            onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
          <select
            value={filter.type}
            onChange={e => { setFilter(f => ({ ...f, type: e.target.value })); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([t, m]) => (
              <option key={t} value={t}>{m.label}</option>
            ))}
          </select>
          <span style={{ marginLeft: 'auto', color: '#718096', fontSize: 13, alignSelf: 'center' }}>
            {total} jobs total
          </span>
        </div>

        {/* Jobs table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#718096' }}>Loading...</div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#718096' }}>
            No jobs found. Click "Run Now" on any automation type to trigger a scan.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  {['ID', 'Type', 'Customer', 'Phone', 'Status', 'Scheduled', 'Sent At', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#718096', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const typeMeta = TYPE_LABELS[job.type] || { label: job.type, icon: '📩', color: '#718096' };
                  const sc       = STATUS_COLORS[job.status] || { bg: '#f7f7f7', text: '#718096' };
                  return (
                    <tr key={job.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                      <td style={{ padding: '10px 12px', color: '#718096' }}>#{job.id}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span>{typeMeta.icon} </span>
                        <span style={{ color: typeMeta.color, fontWeight: 500 }}>{typeMeta.label}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{job.client_name || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{job.client_phone || job.client_phone_display || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                          {job.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#718096', fontSize: 12 }}>
                        {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#718096', fontSize: 12 }}>
                        {job.sent_at ? new Date(job.sent_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {job.status === 'pending' && (
                          <button
                            onClick={() => cancelJob(job.id)}
                            style={{ padding: '4px 12px', background: '#fff5f5', color: '#ef4444', border: '1px solid #fed7d7', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: page === 1 ? 'not-allowed' : 'pointer', background: '#fff' }}
            >← Prev</button>
            <span style={{ padding: '6px 14px', color: '#718096', fontSize: 13 }}>
              Page {page} of {Math.ceil(total / limit)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / limit)}
              style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: page >= Math.ceil(total / limit) ? 'not-allowed' : 'pointer', background: '#fff' }}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
