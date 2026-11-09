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
  return isLocal 
    ? `http://127.0.0.1:5000/api` 
    : (typeof window !== 'undefined' 
        ? `${window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')}/api` 
        : '/api');
})();

export const getReturnUrl = (targetPath = '/coursework/online-tests') => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.') || 
                  window.location.hostname.startsWith('10.') || 
                  window.location.hostname.startsWith('172.');
  const base = import.meta.env.VITE_DASHBOARD_URL || (
    isLocal
      ? 'http://localhost:5173'
      : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
  );
  const cleanBase = base.replace(/\/+$/, '');
  let subPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  if (!subPath.startsWith('/main/')) {
    subPath = `/main${subPath}`;
  }
  return `${cleanBase}${subPath}`;
};

export const formatTimer = (totalSeconds) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const DEFAULT_TEMPLATES = {
  c: ``,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your C++ code here\n    return 0;\n}`,
  python: ``,
  java: ``
};
