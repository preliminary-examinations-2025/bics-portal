export const API_BASE = import.meta.env.VITE_API_BASE || (() => {
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.startsWith('192.168.') || 
    window.location.hostname.startsWith('10.') || 
    window.location.hostname.startsWith('172.')
  );
  return isLocal 
    ? `http://127.0.0.1:5000/api` 
    : `${window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')}/api`;
})();

export const API_ACCESS_SECRET = import.meta.env.VITE_API_ACCESS_SECRET || '';

// Automatically attach apiSecret query parameter to all backend API requests
if (typeof window !== 'undefined' && window.fetch && !window.__bics_ot_fetch_patched) {
  window.__bics_ot_fetch_patched = true;
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    const secret = API_ACCESS_SECRET || 
                   localStorage.getItem('portal_api_secret') || 
                   window.__BICS_API_SECRET__ || 
                   'qwertty';

    let urlString = '';
    if (typeof resource === 'string') {
      urlString = resource;
    } else if (resource && typeof resource.url === 'string') {
      urlString = resource.url;
    }

    const isExternal = urlString.includes('tfhub.dev') || 
                       urlString.includes('googleapis.com') || 
                       urlString.includes('jsdelivr.net') || 
                       urlString.includes('unpkg.com') ||
                       urlString.includes('cloudinary.com');

    const isBackendApi = (urlString.startsWith('/api') || 
                          urlString.includes('/api/') || 
                          (typeof API_BASE !== 'undefined' && API_BASE && urlString.startsWith(API_BASE)) ||
                          urlString.startsWith(window.location.origin) ||
                          (!urlString.startsWith('http://') && !urlString.startsWith('https://'))) && !isExternal;

    if (secret && isBackendApi && !urlString.includes('apiSecret=') && !urlString.includes('apiKey=')) {
      const separator = urlString.includes('?') ? '&' : '?';
      const targetUrl = `${urlString}${separator}apiSecret=${encodeURIComponent(secret)}`;
      if (typeof resource === 'string') {
        return originalFetch.call(this, targetUrl, init);
      } else if (resource && typeof resource === 'object') {
        return originalFetch.call(this, new Request(targetUrl, resource), init);
      }
    }
    return originalFetch.call(this, resource, init);
  };
}
