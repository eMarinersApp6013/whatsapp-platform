import React, { useEffect, useState } from 'react';
import api from '../utils/api';

const FIELDS = [
  { key: 'meta_app_id',           label: 'Meta App ID',           type: 'text',     help: 'From Meta Developer Dashboard' },
  { key: 'meta_app_secret',       label: 'Meta App Secret',       type: 'password', help: 'Keep this secret!' },
  { key: 'meta_verify_token',     label: 'Webhook Verify Token',  type: 'text',     help: 'Token you set in Meta Webhook config' },
  { key: 'meta_whatsapp_token',   label: 'WhatsApp Access Token', type: 'password', help: 'Permanent or temporary access token' },
  { key: 'meta_phone_number_id',  label: 'Phone Number ID',       type: 'text',     help: 'From Meta WhatsApp > Phone Numbers' },
  { key: 'admin_password',        label: 'Admin Login Password',  type: 'password', help: 'Password to login to this panel' },
];

function Input({ field, value, onChange, show, onToggle }) {
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

export default function Settings() {
  const [form,     setForm]    = useState({});
  const [original, setOriginal] = useState({});
  const [showPass, setShowPass] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testing,   setTesting]   = useState(false);
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    api.get('/api/settings/meta')
      .then(r => {
        const d = r.data.data || {};
        setForm(d);
        setOriginal(d);
      })
      .catch(e => setError(e.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
  };

  const handleToggleShow = (key) => {
    setShowPass(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Only send fields that have changed (and don't contain ****)
      const payload = {};
      FIELDS.forEach(f => {
        const v = form[f.key] || '';
        if (v && !v.includes('****')) {
          payload[f.key] = v;
        }
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
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2d3748', marginBottom: 8 }}>Settings</h1>
      <p style={{ color: '#718096', marginBottom: 32, fontSize: 14 }}>
        Configure your Meta WhatsApp Business API credentials. These are stored securely per tenant.
      </p>

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
            <Input
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
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }}
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
    </div>
  );
}
