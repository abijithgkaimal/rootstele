import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'

// Configure global Axios settings before ANY React components mount
axios.defaults.withCredentials = true;
const adminToken = localStorage.getItem('admin_token') || 'admin-session-token';
axios.defaults.headers.common['x-admin-token'] = adminToken;
axios.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;

// Request interceptor to dynamically update headers if token changes
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token') || 'admin-session-token';
  config.headers['x-admin-token'] = token;
  config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
