import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Conversations from './pages/Conversations';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Agents from './pages/Agents';
import Bundles from './pages/Bundles';
import RestockAlerts from './pages/RestockAlerts';
import ShippingZones from './pages/ShippingZones';
import Automation from './pages/Automation';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const auth = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login auth={auth} />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout auth={auth}>
                <Routes>
                  <Route path="/"               element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard"      element={<Dashboard />} />
                  <Route path="/conversations"  element={<Conversations />} />
                  <Route path="/agents"         element={<Agents />} />
                  <Route path="/products"       element={<Products />} />
                  <Route path="/orders"         element={<Orders />} />
                  <Route path="/analytics"      element={<Analytics />} />
                  <Route path="/settings"       element={<Settings />} />
                  <Route path="/bundles"        element={<Bundles />} />
                  <Route path="/restock-alerts" element={<RestockAlerts />} />
                  <Route path="/shipping-zones" element={<ShippingZones />} />
                  <Route path="/automation"    element={<Automation />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
