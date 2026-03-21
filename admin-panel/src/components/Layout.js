import React, { useContext } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../App';
import {
  LayoutDashboard, MessageSquare, ShoppingCart, FileText,
  Package, BarChart3, Megaphone, Settings, LogOut, Bell, Store
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { path: '/orders', icon: ShoppingCart, label: 'Orders' },
  { path: '/invoices', icon: FileText, label: 'Invoices' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/broadcast', icon: Megaphone, label: 'Broadcast' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const pageTitles = {
  '/': 'Dashboard',
  '/conversations': 'Conversations',
  '/orders': 'Orders',
  '/invoices': 'Invoices',
  '/products': 'Products',
  '/analytics': 'Analytics',
  '/broadcast': 'Broadcast',
  '/settings': 'Settings',
};

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentTitle = pageTitles[location.pathname] ||
    (location.pathname.startsWith('/orders/') ? 'Order Detail' : 'NavyStore');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-primary-500 text-white flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="h-15 flex items-center px-5 py-4 border-b border-primary-400">
          <Store className="w-7 h-7 text-gold-500 mr-2" />
          <span className="text-lg font-bold text-gold-500">NavyStore</span>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center px-5 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-gold-500 border-r-4 border-gold-500 font-medium'
                    : 'text-primary-100 hover:bg-primary-400 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-primary-400 p-4">
          <p className="text-xs text-primary-200 truncate">{user?.email || 'Admin'}</p>
          <button
            onClick={handleLogout}
            className="flex items-center mt-2 text-sm text-primary-200 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-15 bg-white border-b border-gray-200 flex items-center justify-between px-6 py-4 flex-shrink-0">
          <h1 className="text-xl font-semibold text-gray-800">{currentTitle}</h1>
          <div className="flex items-center gap-4">
            <button className="relative text-gray-500 hover:text-primary-500 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                3
              </span>
            </button>
            <div className="w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center text-sm font-medium">
              {user?.name?.charAt(0) || 'A'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
