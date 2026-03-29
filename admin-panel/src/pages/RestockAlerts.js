import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const styles = {
  page: {
    background: '#111827',
    minHeight: '100%',
    padding: '24px',
    color: '#fff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  card: {
    background: '#1f2937',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#1f2937',
    borderRadius: '12px',
    padding: '20px',
    borderLeft: '4px solid',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 700,
    lineHeight: 1.1,
  },
  statLabel: {
    fontSize: '13px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  btnPrimary: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnRefresh: {
    background: '#374151',
    color: '#e5e7eb',
    border: '1px solid #4b5563',
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnNotify: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'background 0.2s',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#9ca3af',
    borderBottom: '1px solid #374151',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: '#d1d5db',
    borderBottom: '1px solid #1f2937',
    verticalAlign: 'middle',
  },
  badgeOutOfStock: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
  },
  badgeInStock: {
    background: '#064e3b',
    color: '#6ee7b7',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
  },
  badgeLowStock: {
    background: '#78350f',
    color: '#fcd34d',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#6b7280',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '14px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    zIndex: 2000,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '260px',
  },
  searchInput: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    width: '260px',
  },
};

export default function RestockAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState({});
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get('/api/catalog/restock-alerts');
      setAlerts(res.data?.alerts || res.data || []);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleNotifyAll = async (alert) => {
    const pid = alert.productId || alert._id || alert.id;
    setNotifying((n) => ({ ...n, [pid]: true }));
    try {
      await api.post(`/api/catalog/restock-notify/${pid}`);
      showToast(`Notified ${alert.waitingCustomers || alert.waiting_customers || 0} customers for "${alert.productName || alert.name}"`);
      fetchAlerts();
    } catch {
      showToast(`Failed to send notifications for "${alert.productName || alert.name}"`, 'error');
    } finally {
      setNotifying((n) => ({ ...n, [pid]: false }));
    }
  };

  const getStockBadge = (status, stock) => {
    const s = (status || '').toLowerCase();
    if (s === 'out_of_stock' || s === 'out of stock' || stock === 0) {
      return <span style={styles.badgeOutOfStock}>Out of Stock</span>;
    }
    if (s === 'low_stock' || s === 'low stock' || (stock !== undefined && stock < 10)) {
      return <span style={styles.badgeLowStock}>Low Stock</span>;
    }
    return <span style={styles.badgeInStock}>In Stock</span>;
  };

  const filtered = alerts.filter((a) => {
    const name = (a.productName || a.name || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const totalWaiting = alerts.reduce((sum, a) => sum + (a.waitingCustomers || a.waiting_customers || 0), 0);
  const outOfStock = alerts.filter((a) => {
    const s = (a.stockStatus || a.stock_status || '').toLowerCase();
    return s.includes('out') || (a.stock ?? a.stockQuantity ?? 1) === 0;
  }).length;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Restock Alerts</h1>
          <p style={styles.subtitle}>Customers waiting for out-of-stock products</p>
        </div>
        <button
          style={{ ...styles.btnRefresh, opacity: refreshing ? 0.7 : 1 }}
          onClick={() => fetchAlerts(true)}
          disabled={refreshing}
        >
          <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={{ ...styles.statCard, borderLeftColor: '#6366f1' }}>
          <div style={{ ...styles.statValue, color: '#818cf8' }}>{alerts.length}</div>
          <div style={styles.statLabel}>Products with Alerts</div>
        </div>
        <div style={{ ...styles.statCard, borderLeftColor: '#f59e0b' }}>
          <div style={{ ...styles.statValue, color: '#fbbf24' }}>{totalWaiting}</div>
          <div style={styles.statLabel}>Total Waiting Customers</div>
        </div>
        <div style={{ ...styles.statCard, borderLeftColor: '#ef4444' }}>
          <div style={{ ...styles.statValue, color: '#f87171' }}>{outOfStock}</div>
          <div style={styles.statLabel}>Out of Stock</div>
        </div>
      </div>

      {/* Table card */}
      <div style={styles.card}>
        {/* Search bar */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <input
            style={styles.searchInput}
            placeholder="Search by product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <span style={{ color: '#9ca3af', fontSize: '13px' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div style={styles.emptyState}>Loading restock alerts...</div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔔</div>
            <div style={{ fontWeight: 600, fontSize: '16px', color: '#d1d5db', marginBottom: '6px' }}>
              {search ? 'No matching alerts' : 'No restock alerts'}
            </div>
            <div>{search ? 'Try a different search term' : 'All products are currently in stock'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Product Name', 'Waiting Customers', 'Stock Status', 'Action'].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((alert) => {
                  const pid = alert.productId || alert._id || alert.id;
                  const waiting = alert.waitingCustomers ?? alert.waiting_customers ?? 0;
                  const isNotifying = notifying[pid];
                  return (
                    <tr
                      key={pid}
                      style={{ background: '#111827', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2433')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#111827')}
                    >
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600, color: '#fff' }}>
                          {alert.productName || alert.name || 'Unknown Product'}
                        </div>
                        {alert.sku && (
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            SKU: {alert.sku}
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: '#1e1b4b',
                            color: '#818cf8',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontWeight: 700,
                            fontSize: '15px',
                          }}>
                            {waiting}
                          </span>
                          <span style={{ color: '#9ca3af', fontSize: '13px' }}>
                            customer{waiting !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        {getStockBadge(
                          alert.stockStatus || alert.stock_status,
                          alert.stock ?? alert.stockQuantity
                        )}
                      </td>
                      <td style={styles.td}>
                        <button
                          style={{
                            ...styles.btnNotify,
                            opacity: isNotifying || waiting === 0 ? 0.6 : 1,
                            cursor: isNotifying || waiting === 0 ? 'not-allowed' : 'pointer',
                          }}
                          onClick={() => handleNotifyAll(alert)}
                          disabled={isNotifying || waiting === 0}
                          title={waiting === 0 ? 'No customers waiting' : `Notify ${waiting} customers`}
                        >
                          {isNotifying ? (
                            <>
                              <span>⏳</span> Sending...
                            </>
                          ) : (
                            <>
                              <span>🔔</span> Notify All
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === 'error' ? '#7f1d1d' : '#065f46',
          color: toast.type === 'error' ? '#fca5a5' : '#d1fae5',
        }}>
          <span style={{ fontSize: '16px' }}>{toast.type === 'error' ? '✗' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      {/* CSS keyframe for spinner (injected inline) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
