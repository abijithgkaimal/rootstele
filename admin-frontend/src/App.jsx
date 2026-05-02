import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Telecallers from './pages/Telecallers';
import TelecallerDetails from './pages/TelecallerDetails';
import Login from './pages/Login';

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
          {/* Fallback for other routes showing under construction */}
          <Route path="admin/*" element={<div className="p-8">Page Under Construction</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
