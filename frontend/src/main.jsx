import './api/client.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Route handling before router initialization:
// 1. If accessing root '/' or '/main' or '/main/', redirect to '/main/login'
// 2. If accessing any URL not starting with '/main/' (e.g. '/ain/coursework/online-tests'), rewrite to '/main/404?from=...'
if (typeof window !== 'undefined') {
  const path = window.location.pathname;
  if (path === '/' || path === '' || path === '/main' || path === '/main/') {
    window.history.replaceState(null, '', '/main/login' + window.location.search + window.location.hash);
  } else if (!path.startsWith('/main/')) {
    const originalPath = path + window.location.search + window.location.hash;
    window.history.replaceState(null, '', '/main/404?from=' + encodeURIComponent(originalPath));
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/main">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
