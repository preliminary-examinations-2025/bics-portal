import './api/client.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Route handling before router initialization:
// 1. If explicit logout (clean=1 or /logout), synchronously purge auth storage and route to /main/login
// 2. If accessing root '/' or '', or '/main' or '/main/':
//    - If valid token exists in storage, route to /main/home (or /main/admin/dashboard if admin)
//    - If not authenticated, route to /main/login
// 3. If accessing any URL not starting with '/main/', automatically prepend '/main'
if (typeof window !== 'undefined') {
  const path = window.location.pathname;
  const search = window.location.search || '';
  const hash = window.location.hash || '';

  const isExplicitLogout = search.includes('clean=1') || path.includes('/logout');

  if (isExplicitLogout) {
    try {
      localStorage.removeItem('bics_session');
      sessionStorage.removeItem('bics_session');
      localStorage.removeItem('bics_auth_token');
      sessionStorage.removeItem('bics_auth_token');
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      localStorage.removeItem('kata_handle');
      localStorage.removeItem('bics_token_expiry');
      sessionStorage.removeItem('bics_redirect_url');
      localStorage.removeItem('bics_redirect_url');
    } catch (e) {}
    window.history.replaceState(null, '', '/main/login' + search + hash);
  } else {
    const hasToken = localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token') || localStorage.getItem('token');
    let homeTarget = '/main/home';
    try {
      const stored = localStorage.getItem('bics_session') || sessionStorage.getItem('bics_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.user?.role === 'admin') {
          homeTarget = '/main/admin/dashboard';
        }
      }
    } catch (e) {}

    if (path === '/' || path === '') {
      window.history.replaceState(null, '', (hasToken ? homeTarget : '/main/login') + search + hash);
    } else if (path === '/main' || path === '/main/') {
      window.history.replaceState(null, '', (hasToken ? homeTarget : '/main/login') + search + hash);
    } else if (!path.startsWith('/main/')) {
      const cleanPath = path.startsWith('/') ? path : '/' + path;
      window.history.replaceState(null, '', '/main' + cleanPath + search + hash);
    }
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/main">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
