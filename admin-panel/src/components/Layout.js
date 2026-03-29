import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const NAV = [
  { to: '/dashboard',     icon: '📊', label: 'Dashboard' },
  { to: '/conversations', icon: '💬', label: 'Conversations' },
  { to: '/products',      icon: '📦', label: 'Products' },
  { to: '/orders',        icon: '🛒', label: 'Orders' },
  { to: '/analytics',     icon: '📈', label: 'Analytics' },
  { to: '/bundles',       icon: '🎁', label: 'Bundles' },
  { to: '/restock-alerts',icon: '🔔', label: 'Restock Alerts' },
  { to: '/shipping-zones',icon: '🚚', label: 'Shipping Zones' },
  { to: '/settings',      icon: '⚙️',  label: 'Settings' },
];

export default function Layout({ children, auth }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 240,
        background: '#1a1a2e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #2d2d4e', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🟢</span>
          {!collapsed && <span style={{ fontWeight: 700, fontSize: 16 }}>NavyStore</span>}
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 8,
                marginBottom: 4,
                textDecoration: 'none',
                color: isActive ? '#fff' : '#a0aec0',
                background: isActive ? '#25d366' : 'transparent',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
              })}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid #2d2d4e' }}>
          {!collapsed && auth.user && (
            <div style={{ padding: '8px 12px', color: '#a0aec0', fontSize: 12, marginBottom: 8 }}>
              {auth.user.name || auth.user.phone}
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 14,
            }}
          >
            <span>🚪</span>
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {/* Top bar */}
        <div style={{
          background: '#fff',
          padding: '12px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}
          >
            ☰
          </button>
          <span style={{ fontWeight: 600, color: '#2d3748' }}>NavyStore WhatsApp Commerce</span>
        </div>

        <div style={{ padding: 24 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
