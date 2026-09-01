import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Telecallers from './pages/Telecallers';
import CallReports from './pages/CallReports';
import TelecallerDetails from './pages/TelecallerDetails';
import ChatReports from './pages/ChatReports';
import Login from './pages/Login';

// Enable sending session cookies with all requests
axios.defaults.withCredentials = true;

// Attach token from localStorage if present
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token') || 'admin-session-token';
  config.headers['x-admin-token'] = token;
  config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Global axios interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="admin/dashboard" element={<Dashboard />} />
          <Route path="admin/telecallers" element={<Telecallers />} />
          <Route path="admin/telecallers/:employeeId" element={<TelecallerDetails />} />
          <Route path="admin/call-reports" element={<CallReports />} />
          <Route path="admin/reports" element={<ChatReports />} />
          <Route path="admin/chat-reports" element={<ChatReports />} />
          {/* Fallback for other routes showing under construction */}
          <Route path="admin/*" element={<div className="p-8">Page Under Construction</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
