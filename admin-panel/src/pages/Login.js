import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ auth }) {
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await auth.login(phone, password);
    if (ok) navigate('/dashboard');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: 40,
        width: 380,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 48 }}>🟢</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginTop: 8 }}>NavyStore</h1>
          <p style={{ color: '#718096', fontSize: 14, marginTop: 4 }}>WhatsApp Commerce Platform</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#2d3748', marginBottom: 6 }}>
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+917978839679"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 15,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#2d3748', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 15,
                outline: 'none',
              }}
            />
          </div>

          {auth.error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, color: '#c53030', fontSize: 14 }}>
              {auth.error}
            </div>
          )}

          <button
            type="submit"
            disabled={auth.loading}
            style={{
              width: '100%',
              padding: '12px',
              background: auth.loading ? '#a0aec0' : '#25d366',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: auth.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {auth.loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
