import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function useAuth() {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const login = async (phone, password) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { phone, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return { user, loading, error, login, logout };
}
