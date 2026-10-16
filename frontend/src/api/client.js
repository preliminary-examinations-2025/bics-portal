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

/**
 * Retrieve the active authentication token from client storage
 */
export const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token') || null;
};

/**
 * Persist authentication token to storage
 */
export const setAuthToken = (token, rememberMe = true) => {
  if (typeof window === 'undefined') return;
  if (!token) {
    clearAuthToken();
    return;
  }
  if (rememberMe) {
    localStorage.setItem('bics_auth_token', token);
    sessionStorage.removeItem('bics_auth_token');
  } else {
    sessionStorage.setItem('bics_auth_token', token);
    localStorage.removeItem('bics_auth_token');
  }
};

/**
 * Clear stored authentication token
 */
export const clearAuthToken = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('bics_auth_token');
  sessionStorage.removeItem('bics_auth_token');
};

// Automatically attach Bearer Authorization header to all backend API requests
if (typeof window !== 'undefined' && window.fetch && !window.__bics_fetch_patched) {
  window.__bics_fetch_patched = true;
  const originalFetch = window.fetch;
  
  window.fetch = async function(resource, init = {}) {
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

    if (isBackendApi) {
      const token = getAuthToken();
      const headers = new Headers(init.headers || (typeof resource === 'object' && resource.headers ? resource.headers : {}));

      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const modifiedInit = {
        ...init,
        headers
      };

      try {
        const response = await originalFetch.call(this, resource, modifiedInit);
        
        // Handle 401 Unauthorized: clear expired credentials
        if (response.status === 401 && !urlString.includes('/login') && !urlString.includes('/verify-session')) {
          clearAuthToken();
          localStorage.removeItem('bics_session');
          sessionStorage.removeItem('bics_session');
          window.dispatchEvent(new CustomEvent('bics_auth_expired'));
        }

        return response;
      } catch (err) {
        throw err;
      }
    }

    return originalFetch.call(this, resource, init);
  };
}
