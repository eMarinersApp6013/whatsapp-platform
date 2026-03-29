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
    transition: 'background 0.2s',
  },
  btnDanger: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  btnEdit: {
    background: '#374151',
    color: '#e5e7eb',
    border: '1px solid #4b5563',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    marginRight: '6px',
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
  },
  tr: {
    background: '#111827',
    transition: 'background 0.15s',
  },
  badge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
  },
  toggle: {
    position: 'relative',
    display: 'inline-block',
    width: '44px',
    height: '24px',
    cursor: 'pointer',
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    background: '#1f2937',
    borderRadius: '16px',
    padding: '32px',
    width: '100%',
    maxWidth: '540px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
    marginBottom: '24px',
  },
  formGroup: {
    marginBottom: '18px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#9ca3af',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    width: '100%',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    boxSizing: 'border-box',
  },
  productList: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    padding: '10px',
    maxHeight: '180px',
    overflowY: 'auto',
  },
  productItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 4px',
    cursor: 'pointer',
    borderRadius: '6px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  btnCancel: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
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
    background: '#065f46',
    color: '#d1fae5',
    padding: '14px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    zIndex: 2000,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
};

const emptyForm = {
  name: '',
  description: '',
  bundlePrice: '',
  savings: '',
  productIds: [],
  active: true,
};

export default function Bundles() {
  const [bundles, setBundles] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editBundle, setEditBundle] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bundleRes, productRes] = await Promise.all([
        api.get('/api/catalog/bundles'),
        api.get('/api/products/catalog'),
      ]);
      setBundles(bundleRes.data?.bundles || bundleRes.data || []);
      setProducts(productRes.data?.data || productRes.data?.products || (Array.isArray(productRes.data) ? productRes.data : []));
    } catch (err) {
      setBundles([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditBundle(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (bundle) => {
    setEditBundle(bundle);
    setForm({
      name: bundle.name || '',
      description: bundle.description || '',
      bundlePrice: bundle.bundlePrice ?? bundle.bundle_price ?? '',
      savings: bundle.savings ?? '',
      productIds: bundle.productIds || bundle.product_ids || [],
      active: bundle.active ?? true,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditBundle(null);
    setForm(emptyForm);
  };

  const handleToggleProduct = (id) => {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id)
        ? f.productIds.filter((p) => p !== id)
        : [...f.productIds, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        bundlePrice: parseFloat(form.bundlePrice) || 0,
        savings: parseFloat(form.savings) || 0,
        productIds: form.productIds,
        active: form.active,
      };
      if (editBundle) {
        await api.put(`/api/catalog/bundles/${editBundle._id || editBundle.id}`, payload);
        showToast('Bundle updated successfully');
      } else {
        await api.post('/api/catalog/bundles', payload);
        showToast('Bundle created successfully');
      }
      closeModal();
      fetchData();
    } catch (err) {
      showToast('Failed to save bundle', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bundle) => {
    if (!window.confirm(`Delete bundle "${bundle.name}"?`)) return;
    try {
      await api.delete(`/api/catalog/bundles/${bundle._id || bundle.id}`);
      showToast('Bundle deleted');
      fetchData();
    } catch {
      showToast('Failed to delete bundle', 'error');
    }
  };

  const handleToggleActive = async (bundle) => {
    try {
      await api.put(`/api/catalog/bundles/${bundle._id || bundle.id}`, {
        ...bundle,
        active: !bundle.active,
      });
      fetchData();
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const getProductNames = (ids = []) => {
    if (!ids.length) return <span style={{ color: '#6b7280' }}>No products</span>;
    const names = ids
      .map((id) => products.find((p) => (p._id || p.id) === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(', ') : <span style={{ color: '#6b7280' }}>—</span>;
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Product Bundles</h1>
          <p style={styles.subtitle}>Create and manage product bundles with special pricing</p>
        </div>
        <button style={styles.btnPrimary} onClick={openCreate}>
          <span>＋</span> Create Bundle
        </button>
      </div>

      {/* Table card */}
      <div style={styles.card}>
        {loading ? (
          <div style={styles.emptyState}>Loading bundles...</div>
        ) : bundles.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div>
            <div style={{ fontWeight: 600, fontSize: '16px', color: '#d1d5db', marginBottom: '6px' }}>No bundles yet</div>
            <div>Create your first bundle to get started</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Name', 'Products', 'Bundle Price (₹)', 'Savings (₹)', 'Active', 'Actions'].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundles.map((b) => (
                  <tr
                    key={b._id || b.id}
                    style={styles.tr}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1a2433')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#111827')}
                  >
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{b.name}</div>
                      {b.description && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{b.description}</div>
                      )}
                    </td>
                    <td style={{ ...styles.td, maxWidth: '220px' }}>
                      <div style={{ fontSize: '13px' }}>
                        {getProductNames(b.productIds || b.product_ids)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {(b.productIds || b.product_ids || []).length} products
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: '#34d399', fontWeight: 700, fontSize: '15px' }}>
                        ₹{(b.bundlePrice ?? b.bundle_price ?? 0).toLocaleString()}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {(b.savings ?? 0) > 0 ? (
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                          ₹{(b.savings ?? 0).toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>—</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleToggleActive(b)}
                        style={{
                          width: '44px',
                          height: '24px',
                          borderRadius: '12px',
                          border: 'none',
                          background: b.active ? '#25d366' : '#374151',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.2s',
                        }}
                        title={b.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      >
                        <span style={{
                          position: 'absolute',
                          top: '3px',
                          left: b.active ? '23px' : '3px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button style={styles.btnEdit} onClick={() => openEdit(b)}>Edit</button>
                      <button style={styles.btnDanger} onClick={() => handleDelete(b)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>{editBundle ? 'Edit Bundle' : 'Create New Bundle'}</h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>Bundle Name *</label>
              <input
                style={styles.input}
                placeholder="e.g. Summer Starter Pack"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                style={styles.textarea}
                placeholder="Short description of this bundle..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Bundle Price (₹)</label>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="0"
                  min="0"
                  value={form.bundlePrice}
                  onChange={(e) => setForm((f) => ({ ...f, bundlePrice: e.target.value }))}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Savings (₹)</label>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="0"
                  min="0"
                  value={form.savings}
                  onChange={(e) => setForm((f) => ({ ...f, savings: e.target.value }))}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Select Products
                <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: '8px' }}>
                  ({form.productIds.length} selected)
                </span>
              </label>
              <div style={styles.productList}>
                {products.length === 0 ? (
                  <div style={{ color: '#6b7280', padding: '8px', fontSize: '13px' }}>No products found</div>
                ) : (
                  products.map((p) => {
                    const pid = p._id || p.id;
                    const checked = form.productIds.includes(pid);
                    return (
                      <label key={pid} style={{ ...styles.productItem, color: checked ? '#fff' : '#9ca3af' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleProduct(pid)}
                          style={{ accentColor: '#4f46e5', width: '15px', height: '15px' }}
                        />
                        <span style={{ fontSize: '13px' }}>{p.name}</span>
                        {p.price && (
                          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280' }}>
                            ₹{p.price}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                id="active-toggle"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                style={{ accentColor: '#4f46e5', width: '16px', height: '16px' }}
              />
              <label htmlFor="active-toggle" style={{ color: '#d1d5db', fontSize: '14px', cursor: 'pointer' }}>
                Active (visible to customers)
              </label>
            </div>

            <div style={styles.modalActions}>
              <button style={styles.btnCancel} onClick={closeModal}>Cancel</button>
              <button
                style={{ ...styles.btnPrimary, opacity: saving ? 0.7 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : editBundle ? 'Save Changes' : 'Create Bundle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === 'error' ? '#7f1d1d' : '#065f46',
          color: toast.type === 'error' ? '#fca5a5' : '#d1fae5',
        }}>
          <span>{toast.type === 'error' ? '✗' : '✓'}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
