import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import DashboardLauncher from './components/DashboardLauncher';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <DashboardLauncher />
    <App />
  </React.StrictMode>
);

// Register Service Worker with robust error handling for sandbox environments
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    /**
     * In many preview and sandbox environments (like AI Studio), Service Workers 
     * cannot be registered due to origin mismatches or security policies.
     * We use a relative path and catch errors to ensure the app remains functional.
     */
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('Service Worker registered successfully with scope:', registration.scope);
      })
      .catch((err) => {
        // Check if the error is due to origin mismatch or security restrictions common in sandboxes
        const isOriginError = err.message?.includes('origin') || err.name === 'SecurityError';
        if (isOriginError) {
          console.warn('Service Worker registration skipped: This environment does not support Service Workers on this origin.');
        } else {
          console.error('Service Worker registration failed:', err);
        }
      });
  });
}
