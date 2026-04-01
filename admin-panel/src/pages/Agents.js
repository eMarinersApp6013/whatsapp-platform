import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const ROLES    = ['admin', 'supervisor', 'agent'];
const STATUSES = ['online', 'busy', 'offline'];
const STATUS_COLOR = { online: '#48bb78', busy: '#ed8936', offline: '#a0aec0' };
const STATUS_ICON  = { online: '🟢', busy: '🟡', offline: '⚫' };
const ROLE_COLOR   = { admin: '#805ad5', supervisor: '#3182ce', agent: '#25d366' };

const EMPTY = { name: '', phone: '', email: '', role: 'agent', status: 'offline' };

export default function Agents() {
  const [agents,   setAgents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);  // agent being edited
  const [form,     setForm]     = useState(EMPTY);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/agents')
      .then(r => setAgents(r.data.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setEditing(null); setShowForm(true); setError(''); };
  const openEdit = (a) => { setForm({ name: a.name, phone: a.phone || '', email: a.email || '', role: a.role, status: a.status }); setEditing(a); setShowForm(true); setError(''); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required');
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.put(`/api/agents/${editing.id}`, form);
      } else {
        await api.post('/api/agents', form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this agent?')) return;
    await api.delete(`/api/agents/${id}`).catch(() => {});
    load();
  };

  const handleStatus = async (id, status) => {
    await api.patch(`/api/agents/${id}/status`, { status }).catch(() => {});
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const active   = agents.filter(a => a.is_active);
  const inactive = agents.filter(a => !a.is_active);

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a202c', margin: 0 }}>👥 Agent Management</h1>
          <p style={{ color: '#718096', fontSize: 13, marginTop: 4 }}>Manage your support team — assign roles, set availability</p>
        </div>
        <button onClick={openNew} style={{ padding: '10px 20px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          + Add Agent
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Agents', value: active.length, color: '#3182ce', icon: '👥' },
          { label: 'Online',       value: active.filter(a => a.status === 'online').length, color: '#48bb78', icon: '🟢' },
          { label: 'Busy',         value: active.filter(a => a.status === 'busy').length,   color: '#ed8936', icon: '🟡' },
          { label: 'Offline',      value: active.filter(a => a.status === 'offline').length, color: '#a0aec0', icon: '⚫' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#718096' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, padding: '10px 14px', color: '#c53030', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* Agent Table */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#2d3748' }}>Active Agents ({active.length})</span>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: '#a0aec0' }}>Loading...</div>}
        {!loading && active.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#a0aec0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
            <p>No agents yet. Add your first team member.</p>
          </div>
        )}

        {active.map((agent, idx) => (
          <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: idx < active.length - 1 ? '1px solid #f7fafc' : 'none' }}>
            {/* Avatar */}
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: ROLE_COLOR[agent.role] + '22', border: `2px solid ${STATUS_COLOR[agent.status]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: ROLE_COLOR[agent.role], flexShrink: 0 }}>
              {(agent.name || '?')[0].toUpperCase()}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>{agent.name}</div>
              <div style={{ fontSize: 12, color: '#718096' }}>{agent.email || agent.phone || '—'}</div>
            </div>

            {/* Role badge */}
            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ROLE_COLOR[agent.role] + '22', color: ROLE_COLOR[agent.role], textTransform: 'capitalize' }}>
              {agent.role}
            </span>

            {/* Status selector */}
            <select value={agent.status} onChange={e => handleStatus(agent.id, e.target.value)}
              style={{ padding: '4px 8px', border: `1px solid ${STATUS_COLOR[agent.status]}40`, borderRadius: 6, fontSize: 12, cursor: 'pointer', color: STATUS_COLOR[agent.status], fontWeight: 600, background: STATUS_COLOR[agent.status] + '11' }}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_ICON[s]} {s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>

            {/* Actions */}
            <button onClick={() => openEdit(agent)} style={{ padding: '5px 12px', background: '#ebf8ff', color: '#3182ce', border: '1px solid #bee3f8', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Edit
            </button>
            <button onClick={() => handleDeactivate(agent.id)} style={{ padding: '5px 12px', background: '#fff5f5', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Inactive agents */}
      {inactive.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: 16, opacity: 0.6 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#718096' }}>Inactive Agents ({inactive.length})</span>
          </div>
          {inactive.map(agent => (
            <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid #f7fafc' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#a0aec0' }}>
                {(agent.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#718096' }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: '#a0aec0' }}>{agent.email || agent.phone || '—'}</div>
              </div>
              <span style={{ fontSize: 11, color: '#a0aec0' }}>Deactivated</span>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a202c', marginBottom: 20 }}>
              {editing ? '✏️ Edit Agent' : '+ New Agent'}
            </h2>

            {error && <div style={{ background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, padding: '8px 12px', color: '#c53030', fontSize: 12, marginBottom: 14 }}>{error}</div>}

            <form onSubmit={handleSave}>
              {[
                { key: 'name',  label: 'Name *', type: 'text',  placeholder: 'Agent name' },
                { key: 'email', label: 'Email',  type: 'email', placeholder: 'agent@example.com' },
                { key: 'phone', label: 'Phone',  type: 'text',  placeholder: '+91 99999 99999' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>{f.label}</label>
                  <input type={f.type} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}

              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Role</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_ICON[s]} {s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: 10, background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: saving ? '#a0aec0' : '#25d366', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving...' : (editing ? 'Update Agent' : 'Add Agent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
