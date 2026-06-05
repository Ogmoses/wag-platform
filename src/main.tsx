// src/main.tsx
// WAG ENTERPRISES — React entry point

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global error boundary for uncaught promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('[WAG] Unhandled promise rejection:', event.reason);
  // Prevent the browser from logging the full stack in production
  event.preventDefault();
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
