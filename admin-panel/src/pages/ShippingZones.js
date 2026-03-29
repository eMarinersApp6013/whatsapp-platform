import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

// ─── Style constants ──────────────────────────────────────────────────────────
const S = {
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
  title: { fontSize: '24px', fontWeight: 700, color: '#fff', margin: 0 },
  subtitle: { fontSize: '14px', color: '#9ca3af', marginTop: '4px' },
  card: {
    background: '#1f2937',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#e5e7eb',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#9ca3af',
    borderBottom: '1px solid #374151',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#d1d5db',
    borderBottom: '1px solid #1f2937',
    verticalAlign: 'middle',
  },
  editableCell: {
    padding: '8px 12px',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    width: '90px',
    outline: 'none',
    boxSizing: 'border-box',
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
  btnSave: {
    background: '#059669',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
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
  btnCancel: {
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid #374151',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
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
  calcInput: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    width: '160px',
    boxSizing: 'border-box',
  },
  resultBox: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '10px',
    padding: '20px 24px',
    marginTop: '16px',
    display: 'flex',
    gap: '32px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  resultLabel: { fontSize: '13px', color: '#9ca3af', marginBottom: '4px' },
  resultValue: { fontSize: '22px', fontWeight: 700 },
  emptyState: { textAlign: 'center', padding: '48px 24px', color: '#6b7280' },
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
  errorBanner: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#f87171',
    fontSize: '14px',
    marginBottom: '16px',
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
};

// ─── Mock data (used as fallback when API is unavailable) ─────────────────────
const MOCK_ZONES = [
  {
    id: 'z1',
    zoneName: 'Metro Cities',
    states: 'Maharashtra, Delhi, Karnataka, Tamil Nadu, Telangana',
    rate500g: 40,
    rate1kg: 70,
    rate2kg: 120,
    perExtraKg: 40,
  },
  {
    id: 'z2',
    zoneName: 'Rest of India',
    states: 'Uttar Pradesh, Bihar, Rajasthan, Madhya Pradesh, Gujarat, West Bengal',
    rate500g: 60,
    rate1kg: 100,
    rate2kg: 170,
    perExtraKg: 55,
  },
  {
    id: 'z3',
    zoneName: 'North East & J&K',
    states: 'Assam, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Arunachal Pradesh, Jammu & Kashmir',
    rate500g: 90,
    rate1kg: 150,
    rate2kg: 260,
    perExtraKg: 80,
  },
  {
    id: 'z4',
    zoneName: 'Andaman & Islands',
    states: 'Andaman & Nicobar Islands, Lakshadweep, Daman & Diu',
    rate500g: 120,
    rate1kg: 200,
    rate2kg: 340,
    perExtraKg: 100,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function truncateStates(states, maxLen = 45) {
  if (!states) return '—';
  return states.length > maxLen ? states.slice(0, maxLen) + '…' : states;
}

function normalizeZone(z) {
  return {
    id: z._id || z.id || String(Math.random()),
    zoneName: z.zoneName || z.zone_name || z.name || '',
    states: z.states || '',
    rate500g: z.rate500g ?? z.rate_500g ?? 0,
    rate1kg: z.rate1kg ?? z.rate_1kg ?? 0,
    rate2kg: z.rate2kg ?? z.rate_2kg ?? 0,
    perExtraKg: z.perExtraKg ?? z.per_extra_kg ?? 0,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ShippingZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Calculator state
  const [calcPincode, setCalcPincode] = useState('');
  const [calcWeight, setCalcWeight] = useState('');
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchZones = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get('/api/settings/shipping-rates');
      const data = res.data?.zones || res.data?.shippingRates || res.data || [];
      setZones(Array.isArray(data) ? data.map(normalizeZone) : MOCK_ZONES);
    } catch {
      // Fallback to mock data when API is not yet available
      setZones(MOCK_ZONES);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // ── Inline edit handlers ────────────────────────────────────────────────────
  const startEdit = (zone) => {
    setEditingId(zone.id);
    setEditValues({
      zoneName: zone.zoneName,
      states: zone.states,
      rate500g: zone.rate500g,
      rate1kg: zone.rate1kg,
      rate2kg: zone.rate2kg,
      perExtraKg: zone.perExtraKg,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSaveRow = async (zone) => {
    setSaving(true);
    const updated = {
      ...zone,
      ...editValues,
      rate500g: parseFloat(editValues.rate500g) || 0,
      rate1kg: parseFloat(editValues.rate1kg) || 0,
      rate2kg: parseFloat(editValues.rate2kg) || 0,
      perExtraKg: parseFloat(editValues.perExtraKg) || 0,
    };
    try {
      await api.put(`/api/settings/shipping-rates`, {
        zoneId: zone.id,
        ...updated,
      });
      setZones((prev) => prev.map((z) => (z.id === zone.id ? updated : z)));
      showToast(`"${updated.zoneName}" rates saved`);
      setEditingId(null);
      setEditValues({});
    } catch {
      // Optimistic update on API error (API may not exist yet)
      setZones((prev) => prev.map((z) => (z.id === zone.id ? updated : z)));
      showToast(`Changes saved locally (API unavailable)`);
      setEditingId(null);
      setEditValues({});
    } finally {
      setSaving(false);
    }
  };

  const ev = (field) => (e) =>
    setEditValues((v) => ({ ...v, [field]: e.target.value }));

  // ── Shipping calculator ─────────────────────────────────────────────────────
  const handleCalc = async () => {
    setCalcError('');
    setCalcResult(null);
    if (!calcPincode.trim() || !calcWeight) {
      setCalcError('Please enter both a pincode and weight.');
      return;
    }
    setCalcLoading(true);
    try {
      const res = await api.post('/api/catalog/shipping-calc', {
        pincode: calcPincode.trim(),
        weight: parseFloat(calcWeight),
      });
      setCalcResult(res.data);
    } catch {
      // Fallback: simple local estimate using first matching zone
      const w = parseFloat(calcWeight);
      const zone = zones[0];
      if (zone) {
        let cost;
        if (w <= 0.5) cost = zone.rate500g;
        else if (w <= 1) cost = zone.rate1kg;
        else if (w <= 2) cost = zone.rate2kg;
        else cost = zone.rate2kg + Math.ceil(w - 2) * zone.perExtraKg;
        setCalcResult({
          zoneName: zone.zoneName + ' (estimated)',
          estimatedCost: cost,
          deliveryDays: '3–7',
          currency: '₹',
        });
      } else {
        setCalcError('Calculation failed and no zones available for fallback.');
      }
    } finally {
      setCalcLoading(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const rateCell = (zone, field, label) => {
    if (editingId === zone.id) {
      return (
        <input
          style={S.editableCell}
          type="number"
          min="0"
          value={editValues[field]}
          onChange={ev(field)}
          aria-label={label}
        />
      );
    }
    return (
      <span style={{ fontWeight: 600, color: '#34d399' }}>
        ₹{zone[field].toLocaleString('en-IN')}
      </span>
    );
  };

  return (
    <div style={S.page}>
      {/* ── Page Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>🚚 Shipping Zones</h1>
          <p style={S.subtitle}>Configure shipping rates by region — click Edit on any row to modify</p>
        </div>
        <button
          style={{ ...S.btnRefresh, opacity: refreshing ? 0.7 : 1 }}
          onClick={() => fetchZones(true)}
          disabled={refreshing}
        >
          <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
            ↻
          </span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Zones Table ── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>
          <span>📋</span> Zone Rate Table
        </div>

        {loading ? (
          <div style={S.emptyState}>Loading shipping zones…</div>
        ) : zones.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚚</div>
            <div style={{ fontWeight: 600, fontSize: '16px', color: '#d1d5db', marginBottom: '6px' }}>
              No shipping zones configured
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Zone Name</th>
                  <th style={{ ...S.th, minWidth: '180px' }}>States / Regions</th>
                  <th style={S.th}>500g Rate</th>
                  <th style={S.th}>1kg Rate</th>
                  <th style={S.th}>2kg Rate</th>
                  <th style={S.th}>Per Extra kg</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => {
                  const isEditing = editingId === zone.id;
                  return (
                    <tr
                      key={zone.id}
                      style={{
                        background: isEditing ? '#1e293b' : '#111827',
                        transition: 'background 0.15s',
                        outline: isEditing ? '2px solid #4f46e5' : 'none',
                        outlineOffset: '-2px',
                      }}
                      onMouseEnter={(e) => {
                        if (!isEditing) e.currentTarget.style.background = '#1a2433';
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditing) e.currentTarget.style.background = '#111827';
                      }}
                    >
                      {/* Zone Name */}
                      <td style={{ ...S.td, fontWeight: 600 }}>
                        {isEditing ? (
                          <input
                            style={{ ...S.editableCell, width: '140px' }}
                            value={editValues.zoneName}
                            onChange={ev('zoneName')}
                            aria-label="Zone name"
                          />
                        ) : (
                          <span style={{ color: '#fff' }}>{zone.zoneName}</span>
                        )}
                      </td>

                      {/* States */}
                      <td style={{ ...S.td, maxWidth: '220px' }}>
                        {isEditing ? (
                          <input
                            style={{ ...S.editableCell, width: '200px' }}
                            value={editValues.states}
                            onChange={ev('states')}
                            aria-label="States"
                            title={editValues.states}
                          />
                        ) : (
                          <span
                            style={{ color: '#9ca3af', fontSize: '13px', cursor: 'help' }}
                            title={zone.states}
                          >
                            {truncateStates(zone.states)}
                          </span>
                        )}
                      </td>

                      {/* Rate cells */}
                      <td style={S.td}>{rateCell(zone, 'rate500g', '500g rate')}</td>
                      <td style={S.td}>{rateCell(zone, 'rate1kg', '1kg rate')}</td>
                      <td style={S.td}>{rateCell(zone, 'rate2kg', '2kg rate')}</td>
                      <td style={S.td}>{rateCell(zone, 'perExtraKg', 'Per extra kg')}</td>

                      {/* Actions */}
                      <td style={S.td}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              style={{ ...S.btnSave, opacity: saving ? 0.7 : 1 }}
                              onClick={() => handleSaveRow(zone)}
                              disabled={saving}
                            >
                              {saving ? 'Saving…' : '✓ Save'}
                            </button>
                            <button style={S.btnCancel} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button style={S.btnEdit} onClick={() => startEdit(zone)}>
                            ✏️ Edit
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
      </div>

      {/* ── Shipping Calculator ── */}
      <div style={S.card}>
        <div style={S.sectionTitle}>
          <span>🧮</span> Shipping Cost Calculator
        </div>
        <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '20px', marginTop: 0 }}>
          Test the shipping cost for a given pincode and package weight.
        </p>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={S.label}>Pincode</label>
            <input
              style={S.calcInput}
              placeholder="e.g. 400001"
              value={calcPincode}
              onChange={(e) => setCalcPincode(e.target.value)}
              maxLength={10}
            />
          </div>
          <div>
            <label style={S.label}>Weight (kg)</label>
            <input
              style={S.calcInput}
              type="number"
              min="0.1"
              step="0.1"
              placeholder="e.g. 1.5"
              value={calcWeight}
              onChange={(e) => setCalcWeight(e.target.value)}
            />
          </div>
          <button
            style={{ ...S.btnPrimary, height: '42px', opacity: calcLoading ? 0.7 : 1 }}
            onClick={handleCalc}
            disabled={calcLoading}
          >
            {calcLoading ? 'Calculating…' : '🔍 Calculate'}
          </button>
        </div>

        {calcError && (
          <div style={{ ...S.errorBanner, marginTop: '16px', marginBottom: 0 }}>{calcError}</div>
        )}

        {calcResult && (
          <div style={S.resultBox}>
            <div>
              <div style={S.resultLabel}>Shipping Zone</div>
              <div style={{ ...S.resultValue, fontSize: '16px', color: '#e5e7eb' }}>
                {calcResult.zoneName || '—'}
              </div>
            </div>
            <div>
              <div style={S.resultLabel}>Estimated Cost</div>
              <div style={{ ...S.resultValue, color: '#34d399' }}>
                {calcResult.currency || '₹'}{(calcResult.estimatedCost ?? calcResult.cost ?? 0).toLocaleString('en-IN')}
              </div>
            </div>
            {calcResult.deliveryDays && (
              <div>
                <div style={S.resultLabel}>Estimated Delivery</div>
                <div style={{ ...S.resultValue, fontSize: '16px', color: '#818cf8' }}>
                  {calcResult.deliveryDays} days
                </div>
              </div>
            )}
            {calcResult.carrier && (
              <div>
                <div style={S.resultLabel}>Carrier</div>
                <div style={{ ...S.resultValue, fontSize: '16px', color: '#e5e7eb' }}>
                  {calcResult.carrier}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            ...S.toast,
            background: toast.type === 'error' ? '#7f1d1d' : '#065f46',
            color: toast.type === 'error' ? '#fca5a5' : '#d1fae5',
          }}
        >
          <span style={{ fontSize: '16px' }}>{toast.type === 'error' ? '✗' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
