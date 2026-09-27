export const API_BASE = import.meta.env.VITE_API_BASE || (() => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.') || 
                  window.location.hostname.startsWith('10.') || 
                  window.location.hostname.startsWith('172.');
  return isLocal ? `http://127.0.0.1:5000/api` : `${window.location.origin}/api`;
})();

export const API_ACCESS_SECRET = import.meta.env.VITE_API_ACCESS_SECRET || '';
