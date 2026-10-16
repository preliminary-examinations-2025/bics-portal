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

export const API_ACCESS_SECRET = import.meta.env.VITE_API_ACCESS_SECRET || '';

// Auto-extract URL auth tokens on initialization
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlAuth = params.get('authToken') || params.get('jwt');
    if (urlAuth) {
      localStorage.setItem('bics_auth_token', urlAuth);
      sessionStorage.setItem('bics_auth_token', urlAuth);
      window.__BICS_AUTH_TOKEN__ = urlAuth;
    }
    const urlExamToken = params.get('token');
    if (urlExamToken) {
      sessionStorage.setItem('bics_exam_token', urlExamToken);
      window.__BICS_EXAM_TOKEN__ = urlExamToken;
    }
  } catch (_) {}
}

// Enterprise fetch wrapper with automatic JWT & Exam Token authentication
if (typeof window !== 'undefined' && window.fetch && !window.__bics_ot_fetch_patched) {
  window.__bics_ot_fetch_patched = true;
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    const secret = API_ACCESS_SECRET || 
                   sessionStorage.getItem('portal_api_secret') || 
                   window.__BICS_API_SECRET__ || 
                   '';

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

    let targetUrl = urlString;
    if (secret && isBackendApi && !urlString.includes('apiSecret=') && !urlString.includes('apiKey=')) {
      const separator = urlString.includes('?') ? '&' : '?';
      targetUrl = `${urlString}${separator}apiSecret=${encodeURIComponent(secret)}`;
    }

    if (isBackendApi) {
      const token = localStorage.getItem('bics_auth_token') || 
                    sessionStorage.getItem('bics_auth_token') || 
                    localStorage.getItem('token') || 
                    window.__BICS_AUTH_TOKEN__ || 
                    '';
      const examToken = sessionStorage.getItem('bics_exam_token') || 
                        window.__BICS_EXAM_TOKEN__ || 
                        '';

      let reqInit = init ? { ...init } : {};
      let headersObj = new Headers(reqInit.headers || (resource instanceof Request ? resource.headers : {}));

      if (token && !headersObj.has('Authorization')) {
        headersObj.set('Authorization', `Bearer ${token}`);
      }
      if (examToken && !headersObj.has('x-exam-token')) {
        headersObj.set('x-exam-token', examToken);
      }
      reqInit.headers = headersObj;

      if (typeof resource === 'string') {
        return originalFetch.call(this, targetUrl, reqInit);
      } else if (resource && typeof resource === 'object') {
        return originalFetch.call(this, new Request(targetUrl, reqInit), reqInit);
      }
    }

    if (targetUrl !== urlString) {
      if (typeof resource === 'string') {
        return originalFetch.call(this, targetUrl, init);
      } else if (resource && typeof resource === 'object') {
        return originalFetch.call(this, new Request(targetUrl, resource), init);
      }
    }

    return originalFetch.call(this, resource, init);
  };
}
