import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';

// ─── WhatsApp Config ──────────────────────────────────────────────────────────

const FIELDS = [
  { key: 'meta_app_id',           label: 'Meta App ID',           type: 'text',     help: 'From Meta Developer Dashboard' },
  { key: 'meta_app_secret',       label: 'Meta App Secret',       type: 'password', help: 'Keep this secret!' },
  { key: 'meta_verify_token',     label: 'Webhook Verify Token',  type: 'text',     help: 'Token you set in Meta Webhook config' },
  { key: 'meta_whatsapp_token',   label: 'WhatsApp Access Token', type: 'password', help: 'Permanent or temporary access token' },
  { key: 'meta_phone_number_id',  label: 'Phone Number ID',       type: 'text',     help: 'From Meta WhatsApp > Phone Numbers' },
  { key: 'admin_password',        label: 'Admin Login Password',  type: 'password', help: 'Password to login to this panel' },
];

function CredentialInput({ field, value, onChange, show, onToggle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#2d3748', marginBottom: 6 }}>
        {field.label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={field.type === 'password' && !show ? 'password' : 'text'}
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder={value?.includes('****') ? value : `Enter ${field.label}`}
          style={{
            width: '100%',
            padding: '10px 40px 10px 14px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        {field.type === 'password' && (
          <button
            onClick={onToggle}
            type="button"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
          >
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 11, color: '#a0aec0', marginTop: 4 }}>{field.help}</p>
    </div>
  );
}

function WhatsAppConfigTab() {
  const [form,      setForm]      = useState({});
  const [showPass,  setShowPass]  = useState({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testing,   setTesting]   = useState(false);
  const [testResult,setTestResult]= useState('');

  useEffect(() => {
    api.get('/api/settings/meta')
      .then(r => setForm(r.data.data || {}))
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const handleToggleShow = (key) => setShowPass(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {};
      FIELDS.forEach(f => {
        const v = form[f.key] || '';
        if (v && !v.includes('****')) payload[f.key] = v;
      });
      await api.post('/api/settings/meta', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading settings...</div>;

  return (
    <>
      {/* Webhook URL info */}
      <div style={{ background: '#ebf8ff', border: '1px solid #90cdf4', borderRadius: 10, padding: 16, marginBottom: 32 }}>
        <p style={{ fontWeight: 600, color: '#2b6cb0', fontSize: 13, marginBottom: 6 }}>Webhook URL to set in Meta Dashboard:</p>
        <code style={{ fontSize: 12, color: '#2b6cb0', wordBreak: 'break-all' }}>
          https://whatsapp.nodesurge.tech/webhook
        </code>
        <p style={{ fontSize: 11, color: '#4a90d9', marginTop: 6 }}>
          Set this URL in your Meta App &gt; WhatsApp &gt; Configuration &gt; Webhook
        </p>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#2d3748', marginBottom: 20 }}>Meta WhatsApp API Credentials</h2>
          {FIELDS.map(field => (
            <CredentialInput
              key={field.key}
              field={field}
              value={form[field.key]}
              onChange={handleChange}
              show={showPass[field.key]}
              onToggle={() => handleToggleShow(field.key)}
            />
          ))}
          {error && (
            <div style={{ padding: '10px 14px', background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, color: '#c53030', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '12px 32px',
              background: saving ? '#a0aec0' : '#25d366',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Test Connection */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginTop: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#2d3748', marginBottom: 8 }}>Test WhatsApp Connection</h2>
        <p style={{ fontSize: 13, color: '#718096', marginBottom: 16 }}>Send a test message to verify your Meta credentials are working.</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#2d3748', marginBottom: 6 }}>
              Recipient Phone (with country code)
            </label>
            <input
              type="tel"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="919876543210"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={async () => {
              setTesting(true); setTestResult('');
              try {
                await api.post('/api/settings/test-message', { phone: testPhone });
                setTestResult('success');
              } catch (e) {
                setTestResult(e.response?.data?.error || e.message || 'Failed');
              } finally { setTesting(false); }
            }}
            disabled={testing || !testPhone}
            style={{
              padding: '10px 24px',
              background: testing ? '#a0aec0' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: testing || !testPhone ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {testing ? 'Sending...' : 'Send Test Message'}
          </button>
        </div>
        {testResult === 'success' && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 8, color: '#276749', fontSize: 13 }}>
            ✓ Test message sent successfully! Check your WhatsApp.
          </div>
        )}
        {testResult && testResult !== 'success' && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, color: '#c53030', fontSize: 13 }}>
            Error: {testResult}
          </div>
        )}
      </div>

      {/* How to get credentials */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginTop: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#2d3748', marginBottom: 16 }}>How to get Meta credentials</h2>
        <ol style={{ paddingLeft: 20, fontSize: 13, color: '#4a5568', lineHeight: 2 }}>
          <li>Go to <strong>developers.facebook.com</strong> and create/open your App</li>
          <li>Add <strong>WhatsApp Business</strong> product to your App</li>
          <li>Copy <strong>App ID</strong> and <strong>App Secret</strong> from App Settings &gt; Basic</li>
          <li>Under WhatsApp &gt; API Setup, copy the <strong>Temporary Access Token</strong> (or generate permanent)</li>
          <li>Copy the <strong>Phone Number ID</strong> from the same page</li>
          <li>Under WhatsApp &gt; Configuration, set Webhook URL and your <strong>Verify Token</strong></li>
          <li>Subscribe to <strong>messages</strong> webhook field</li>
        </ol>
      </div>
    </>
  );
}

// ─── Canned Responses Tab ─────────────────────────────────────────────────────

const CANNED_CATEGORIES = ['general', 'greetings', 'support', 'info'];

const emptyCannedForm = { shortcut: '', title: '', content: '', category: 'general' };

function CannedResponsesTab() {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState(emptyCannedForm);
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState('');
  const [editId,     setEditId]     = useState(null);
  const [editForm,   setEditForm]   = useState(emptyCannedForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/chat/canned')
      .then(r => setItems(r.data.data || r.data || []))
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.title || !addForm.content) { setAddError('Title and content are required.'); return; }
    setAddSaving(true); setAddError('');
    try {
      await api.post('/api/chat/canned', addForm);
      setAddForm(emptyCannedForm);
      setShowAdd(false);
      load();
    } catch (e) {
      setAddError(e.response?.data?.message || 'Failed to save.');
    } finally { setAddSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this canned response?')) return;
    try {
      await api.delete(`/api/chat/canned/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Delete failed.');
    }
  };

  const startEdit = (item) => {
    setEditId(item._id || item.id);
    setEditForm({
      shortcut: item.shortcut || '',
      title:    item.title    || '',
      content:  item.content  || '',
      category: item.category || 'general',
    });
    setEditError('');
    setShowAdd(false);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editForm.title || !editForm.content) { setEditError('Title and content are required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/api/chat/canned/${editId}`, editForm);
      setEditId(null);
      load();
    } catch (e) {
      setEditError(e.response?.data?.message || 'Failed to save.');
    } finally { setEditSaving(false); }
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 7,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 4 };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', margin: 0 }}>Canned Responses</h2>
          <p style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>Pre-written replies agents can insert quickly during chats.</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setEditId(null); setAddForm(emptyCannedForm); setAddError(''); }}
            style={{ padding: '9px 20px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add New
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, color: '#c53030', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#2d3748', marginBottom: 16 }}>New Canned Response</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Shortcut</label>
                <input style={inputStyle} placeholder="/hello" value={addForm.shortcut} onChange={e => setAddForm(p => ({ ...p, shortcut: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}>
                  {CANNED_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Title <span style={{ color: '#e53e3e' }}>*</span></label>
              <input style={inputStyle} placeholder="e.g. Welcome Message" value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Content <span style={{ color: '#e53e3e' }}>*</span></label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
                placeholder="Type the response text here..."
                value={addForm.content}
                onChange={e => setAddForm(p => ({ ...p, content: e.target.value }))}
              />
            </div>
            {addError && <p style={{ fontSize: 12, color: '#c53030', marginBottom: 10 }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={addSaving}
                style={{ padding: '9px 22px', background: addSaving ? '#a0aec0' : '#25d366', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: addSaving ? 'not-allowed' : 'pointer' }}
              >
                {addSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setAddError(''); }}
                style={{ padding: '9px 22px', background: '#edf2f7', color: '#4a5568', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#a0aec0', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
          No canned responses yet. Click "Add New" to create one.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Shortcut', 'Title', 'Category', 'Content', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#4a5568', letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const id = item._id || item.id;
                const isEditing = editId === id;
                return (
                  <React.Fragment key={id}>
                    <tr
                      style={{
                        borderBottom: '1px solid #f0f4f8',
                        background: isEditing ? '#f0fff4' : idx % 2 === 0 ? '#fff' : '#fcfcfd',
                        cursor: isEditing ? 'default' : 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => { if (!isEditing) startEdit(item); }}
                    >
                      <td style={{ padding: '11px 16px', fontSize: 13 }}>
                        <code style={{ background: '#edf2f7', padding: '2px 7px', borderRadius: 4, fontSize: 12, color: '#553c9a' }}>{item.shortcut || '—'}</code>
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 500, color: '#2d3748' }}>{item.title}</td>
                      <td style={{ padding: '11px 16px', fontSize: 12 }}>
                        <span style={{ background: '#ebf8ff', color: '#2b6cb0', padding: '2px 9px', borderRadius: 20, fontWeight: 600 }}>
                          {item.category || 'general'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 12, color: '#718096', maxWidth: 260 }}>
                        {(item.content || '').length > 50 ? item.content.slice(0, 50) + '…' : item.content}
                      </td>
                      <td style={{ padding: '11px 16px' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete(id)}
                          style={{ padding: '5px 12px', background: '#fff5f5', color: '#c53030', border: '1px solid #fc8181', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>

                    {/* Inline edit row */}
                    {isEditing && (
                      <tr style={{ background: '#f0fff4', borderBottom: '2px solid #9ae6b4' }}>
                        <td colSpan={5} style={{ padding: 20 }}>
                          <form onSubmit={handleEditSave}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                              <div>
                                <label style={labelStyle}>Shortcut</label>
                                <input style={inputStyle} value={editForm.shortcut} onChange={e => setEditForm(p => ({ ...p, shortcut: e.target.value }))} />
                              </div>
                              <div>
                                <label style={labelStyle}>Category</label>
                                <select style={inputStyle} value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}>
                                  {CANNED_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <label style={labelStyle}>Title <span style={{ color: '#e53e3e' }}>*</span></label>
                              <input style={inputStyle} value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <label style={labelStyle}>Content <span style={{ color: '#e53e3e' }}>*</span></label>
                              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))} />
                            </div>
                            {editError && <p style={{ fontSize: 12, color: '#c53030', marginBottom: 8 }}>{editError}</p>}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button
                                type="submit"
                                disabled={editSaving}
                                style={{ padding: '8px 20px', background: editSaving ? '#a0aec0' : '#25d366', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: editSaving ? 'not-allowed' : 'pointer' }}
                              >
                                {editSaving ? 'Saving...' : 'Update'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditId(null); setEditError(''); }}
                                style={{ padding: '8px 20px', background: '#edf2f7', color: '#4a5568', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Labels Tab ───────────────────────────────────────────────────────────────

const PRESET_COLORS = ['#25d366', '#3182ce', '#d69e2e', '#e53e3e', '#805ad5', '#ed8936', '#38b2ac', '#dd6b20'];

function LabelsTab() {
  const [labels,      setLabels]     = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState('');
  const [newName,     setNewName]    = useState('');
  const [newColor,    setNewColor]   = useState(PRESET_COLORS[0]);
  const [addSaving,   setAddSaving]  = useState(false);
  const [addError,    setAddError]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/chat/labels')
      .then(r => setLabels(r.data.data || r.data || []))
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) { setAddError('Label name is required.'); return; }
    setAddSaving(true); setAddError('');
    try {
      await api.post('/api/chat/labels', { name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      load();
    } catch (e) {
      setAddError(e.response?.data?.message || 'Failed to create label.');
    } finally { setAddSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this label?')) return;
    try {
      await api.delete(`/api/chat/labels/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Delete failed.');
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', margin: 0 }}>Labels</h2>
        <p style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>Organize conversations with color-coded labels.</p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, color: '#c53030', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Add label form */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', marginBottom: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#2d3748', marginBottom: 16 }}>Add Label</h3>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Name */}
            <div style={{ flex: '1 1 180px' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Label Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Urgent"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Color picker */}
            <div style={{ flex: '0 0 auto' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: c,
                      border: newColor === c ? '3px solid #2d3748' : '2px solid transparent',
                      cursor: 'pointer',
                      outline: newColor === c ? '2px solid #fff' : 'none',
                      outlineOffset: '-4px',
                      transition: 'border 0.15s',
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ flex: '0 0 auto', paddingBottom: 2 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 20,
                background: newColor + '22',
                color: newColor,
                fontWeight: 700,
                fontSize: 13,
                border: `1px solid ${newColor}55`,
              }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: newColor, display: 'inline-block' }} />
                {newName || 'Preview'}
              </span>
            </div>

            {/* Submit */}
            <div style={{ flex: '0 0 auto' }}>
              <button
                type="submit"
                disabled={addSaving}
                style={{ padding: '9px 22px', background: addSaving ? '#a0aec0' : '#25d366', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: addSaving ? 'not-allowed' : 'pointer' }}
              >
                {addSaving ? 'Adding...' : 'Add Label'}
              </button>
            </div>
          </div>
          {addError && <p style={{ fontSize: 12, color: '#c53030', marginTop: 10 }}>{addError}</p>}
        </form>
      </div>

      {/* Labels grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading labels...</div>
      ) : labels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#a0aec0', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
          No labels yet. Create your first label above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {labels.map(label => {
            const id = label._id || label.id;
            const color = label.color || '#25d366';
            return (
              <div
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px 8px 12px',
                  background: '#fff',
                  border: `1px solid ${color}55`,
                  borderRadius: 24,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                }}
              >
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2d3748' }}>{label.name}</span>
                <button
                  onClick={() => handleDelete(id)}
                  title="Delete label"
                  style={{
                    marginLeft: 4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fed7d7',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#c53030',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const [keys,       setKeys]      = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [newKeyName, setNewKeyName]= useState('');
  const [newKeyPerms,setNewKeyPerms]= useState(['read']);
  const [creating,   setCreating]  = useState(false);
  const [newKey,     setNewKey]    = useState(null);  // revealed once after creation
  const [error,      setError]     = useState('');
  const [copied,     setCopied]    = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/apikeys')
      .then(r => setKeys(r.data.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return setError('Name is required');
    setCreating(true); setError('');
    try {
      const r = await api.post('/api/apikeys', { name: newKeyName.trim(), permissions: newKeyPerms });
      setNewKey(r.data.data.full_key);
      setNewKeyName('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally { setCreating(false); }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
    await api.delete(`/api/apikeys/${id}`).catch(() => {});
    load();
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', margin: 0 }}>🔑 API Keys</h2>
        <p style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>
          Generate API keys to connect external apps via the REST API (<code>/v1/</code>).
        </p>
      </div>

      {/* API Base URL info */}
      <div style={{ background: '#ebf8ff', border: '1px solid #90cdf4', borderRadius: 10, padding: 14, marginBottom: 24 }}>
        <p style={{ fontWeight: 600, color: '#2b6cb0', fontSize: 12, marginBottom: 4 }}>Base URL</p>
        <code style={{ fontSize: 12, color: '#2b6cb0' }}>https://whatsapp.nodesurge.tech/v1/</code>
        <p style={{ fontSize: 11, color: '#4a90d9', marginTop: 6 }}>
          Header: <code>X-Api-Key: wsk_xxxxxxxx</code> &nbsp;|&nbsp;
          Endpoints: /contacts &nbsp;/conversations &nbsp;/conversations/:id/messages &nbsp;/labels
        </p>
      </div>

      {error && <div style={{ background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, padding: '10px 14px', color: '#c53030', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* Reveal new key */}
      {newKey && (
        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <p style={{ fontWeight: 700, color: '#276749', fontSize: 13, marginBottom: 8 }}>
            ✓ API key created! Copy it now — it won't be shown again.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <code style={{ flex: 1, background: '#fff', border: '1px solid #9ae6b4', borderRadius: 6, padding: '8px 12px', fontSize: 12, wordBreak: 'break-all' }}>
              {newKey}
            </code>
            <button onClick={copyKey} style={{ padding: '8px 16px', background: copied ? '#276749' : '#25d366', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} style={{ marginTop: 8, fontSize: 12, color: '#718096', background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      {/* Create form */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#2d3748', marginBottom: 14 }}>Generate New Key</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Key Name</label>
            <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. My CRM"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Permissions</label>
            <select value={newKeyPerms[0]} onChange={e => setNewKeyPerms(e.target.value === 'write' ? ['read','write'] : e.target.value === 'admin' ? ['read','write','admin'] : ['read'])}
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
              <option value="read">Read only</option>
              <option value="write">Read + Write</option>
              <option value="admin">Admin (full)</option>
            </select>
          </div>
          <button type="submit" disabled={creating} style={{ padding: '9px 20px', background: creating ? '#a0aec0' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer' }}>
            {creating ? 'Generating...' : 'Generate Key'}
          </button>
        </form>
      </div>

      {/* Keys table */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#a0aec0' }}>Loading...</div>
      ) : keys.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#a0aec0', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>No API keys yet.</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {keys.map((key, idx) => (
            <div key={key.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: idx < keys.length - 1 ? '1px solid #f7fafc' : 'none', opacity: key.is_active ? 1 : 0.5 }}>
              <span style={{ fontSize: 20 }}>🔑</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1a202c' }}>{key.name}</div>
                <div style={{ fontSize: 11, color: '#a0aec0', fontFamily: 'monospace' }}>{key.key_prefix}••••••••••••••</div>
              </div>
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#ebf8ff', color: '#2b6cb0' }}>
                {key.permissions?.join(', ') || 'read'}
              </span>
              <span style={{ fontSize: 11, color: '#718096' }}>{key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}` : 'Never used'}</span>
              {key.is_active && (
                <button onClick={() => handleRevoke(key.id)} style={{ padding: '5px 12px', background: '#fff5f5', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  Revoke
                </button>
              )}
              {!key.is_active && <span style={{ fontSize: 11, color: '#e53e3e', fontWeight: 700 }}>Revoked</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Outgoing Webhooks Tab ────────────────────────────────────────────────────

const ALL_EVENTS = ['message.received', 'message.sent', 'conversation.resolved', 'conversation.reopened'];

function WebhooksTab() {
  const [endpoints,  setEndpoints]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({ name: '', url: '', secret: '', events: ['message.received', 'conversation.resolved'] });
  const [saving,     setSaving]     = useState(false);
  const [testingId,  setTestingId]  = useState(null);
  const [testResult, setTestResult] = useState({});
  const [error,      setError]      = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/webhooks')
      .then(r => setEndpoints(r.data.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEvent = (ev) => {
    setForm(p => ({
      ...p,
      events: p.events.includes(ev) ? p.events.filter(e => e !== ev) : [...p.events, ev]
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.url) return setError('Name and URL required');
    setSaving(true); setError('');
    try {
      await api.post('/api/webhooks', form);
      setShowForm(false);
      setForm({ name: '', url: '', secret: '', events: ['message.received', 'conversation.resolved'] });
      load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this webhook endpoint?')) return;
    await api.delete(`/api/webhooks/${id}`).catch(() => {});
    load();
  };

  const handleToggle = async (ep) => {
    await api.put(`/api/webhooks/${ep.id}`, { is_active: !ep.is_active }).catch(() => {});
    load();
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const r = await api.post(`/api/webhooks/${id}/test`);
      setTestResult(prev => ({ ...prev, [id]: `✓ ${r.data.status_code}` }));
    } catch (e) {
      setTestResult(prev => ({ ...prev, [id]: `✗ ${e.response?.data?.message || 'Failed'}` }));
    } finally { setTestingId(null); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d3748', margin: 0 }}>🔗 Outgoing Webhooks</h2>
          <p style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>Push real-time events to your own server or Zapier/Make.</p>
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setError(''); }} style={{ padding: '9px 18px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Add Endpoint
          </button>
        )}
      </div>

      {error && <div style={{ background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, padding: '10px 14px', color: '#c53030', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* Add form */}
      {showForm && (
        <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>New Webhook Endpoint</h3>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. My CRM"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Signing Secret (optional)</label>
                <input value={form.secret} onChange={e => setForm(p => ({ ...p, secret: e.target.value }))} placeholder="HMAC signing secret"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 5 }}>Endpoint URL *</label>
              <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://your-server.com/webhook"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 8 }}>Subscribe to Events</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ALL_EVENTS.map(ev => (
                  <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                    <code style={{ background: '#edf2f7', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{ev}</code>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={saving} style={{ padding: '9px 22px', background: saving ? '#a0aec0' : '#25d366', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save Endpoint'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '9px 22px', background: '#edf2f7', color: '#4a5568', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Endpoints list */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#a0aec0' }}>Loading...</div>
      ) : endpoints.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#a0aec0', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
          No webhook endpoints yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {endpoints.map(ep => (
            <div key={ep.id} style={{ background: '#fff', border: `1px solid ${ep.is_active ? '#c6f6d5' : '#e2e8f0'}`, borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>{ep.name}</span>
                  {ep.last_status && (
                    <span style={{ marginLeft: 10, fontSize: 11, padding: '1px 8px', borderRadius: 10, background: ep.last_status >= 200 && ep.last_status < 300 ? '#f0fff4' : '#fff5f5', color: ep.last_status >= 200 && ep.last_status < 300 ? '#276749' : '#c53030', fontWeight: 700 }}>
                      {ep.last_status}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleToggle(ep)} style={{ padding: '4px 10px', background: ep.is_active ? '#fffbeb' : '#f0fff4', color: ep.is_active ? '#d69e2e' : '#276749', border: `1px solid ${ep.is_active ? '#f6e05e' : '#9ae6b4'}`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {ep.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => handleTest(ep.id)} disabled={testingId === ep.id} style={{ padding: '4px 10px', background: '#ebf8ff', color: '#2b6cb0', border: '1px solid #90cdf4', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {testingId === ep.id ? 'Testing...' : 'Test'}
                  </button>
                  <button onClick={() => handleDelete(ep.id)} style={{ padding: '4px 10px', background: '#fff5f5', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
              <code style={{ fontSize: 11, color: '#718096', wordBreak: 'break-all' }}>{ep.url}</code>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(ep.events || []).map(ev => (
                  <span key={ev} style={{ padding: '2px 8px', borderRadius: 10, background: '#ebf8ff', color: '#2b6cb0', fontSize: 10, fontWeight: 600 }}>{ev}</span>
                ))}
              </div>
              {testResult[ep.id] && (
                <div style={{ marginTop: 8, fontSize: 12, color: testResult[ep.id].startsWith('✓') ? '#276749' : '#c53030', fontWeight: 600 }}>
                  Test result: {testResult[ep.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

const TABS = [
  { id: 'whatsapp', label: '⚙️ WhatsApp Config' },
  { id: 'canned',   label: '💬 Canned Responses' },
  { id: 'labels',   label: '🏷️ Labels' },
  { id: 'apikeys',  label: '🔑 API Keys' },
  { id: 'webhooks', label: '🔗 Webhooks' },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('whatsapp');

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2d3748', marginBottom: 8 }}>Settings</h1>
      <p style={{ color: '#718096', marginBottom: 28, fontSize: 14 }}>
        Manage your WhatsApp configuration, canned responses, and conversation labels.
      </p>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 32, flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 22px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid #25d366' : '2px solid transparent',
                marginBottom: -2,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#25d366' : '#718096',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {activeTab === 'whatsapp' && <WhatsAppConfigTab />}
      {activeTab === 'canned'   && <CannedResponsesTab />}
      {activeTab === 'labels'   && <LabelsTab />}
      {activeTab === 'apikeys'  && <ApiKeysTab />}
      {activeTab === 'webhooks' && <WebhooksTab />}
    </div>
  );
}
