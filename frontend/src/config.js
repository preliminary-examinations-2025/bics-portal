export const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase && !envBase.includes('onrender.com')) {
    return envBase;
  }
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.startsWith('192.168.') || 
    window.location.hostname.startsWith('10.') || 
    window.location.hostname.startsWith('172.')
  );
  return isLocal ? `http://127.0.0.1:5000/api` : (typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api');
})();

export const API_ACCESS_SECRET = import.meta.env.VITE_API_ACCESS_SECRET || '';
