import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import AppShell from './AppShell';
import './index.css';

if (import.meta.env.VITE_API_BASE_URL) {
  axios.defaults.baseURL = String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '');
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" was not found');
}

const app = <AppShell />;

ReactDOM.createRoot(rootElement).render(
  import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
);
