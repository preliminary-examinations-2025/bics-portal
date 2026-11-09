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

const DEFAULT_FETCH_TIMEOUT_MS = 20000;
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Retrieve the active authentication token from client storage
 */
export const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  try {
    return (
      localStorage.getItem('bics_auth_token') ||
      sessionStorage.getItem('bics_auth_token') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      null
    );
  } catch {
    return null;
  }
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
  try {
    if (rememberMe) {
      localStorage.setItem('bics_auth_token', token);
      sessionStorage.removeItem('bics_auth_token');
    } else {
      sessionStorage.setItem('bics_auth_token', token);
      localStorage.removeItem('bics_auth_token');
    }
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
  } catch {
    // Storage quota or private mode fallback ignored
  }
};

/**
 * Clear stored authentication token
 */
export const clearAuthToken = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('bics_auth_token');
    sessionStorage.removeItem('bics_auth_token');
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    localStorage.removeItem('bics_token_expiry');
  } catch {
    // Ignore storage removal errors
  }
};

/**
 * Safely parse JSON response bodies (handles non-JSON 502/503 HTML proxy responses without throwing)
 */
export const safeReadJson = async (response) => {
  if (!response) return null;
  try {
    const contentType = response.headers?.get?.('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('+json')) {
      const text = await response.text();
      if (!text || text.trim().startsWith('<')) return null;
      return JSON.parse(text);
    }
    return await response.json();
  } catch {
    return null;
  }
};

function delayWithSignal(ms, externalSignal) {
  return new Promise((resolve, reject) => {
    if (externalSignal?.aborted) {
      const abortErr = new Error('The operation was aborted.');
      abortErr.name = 'AbortError';
      reject(abortErr);
      return;
    }
    const timer = setTimeout(() => {
      if (externalSignal && onAbort) {
        externalSignal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const abortErr = new Error('The operation was aborted.');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };
    if (externalSignal) {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// Automatically attach Bearer Authorization header, timeout guards, and transient cold-start retries
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
      const rawInit = init || {};
      const {
        timeoutMs: customTimeoutMs,
        retry: allowRetryOpt,
        maxRetries: customMaxRetries,
        signal: externalSignal,
        ...restInit
      } = rawInit;

      const method = String(
        restInit.method || (typeof resource === 'object' && resource?.method) || 'GET'
      ).toUpperCase();
      const isIdempotent = method === 'GET' || method === 'HEAD';
      const maxRetries = (allowRetryOpt === false || !isIdempotent)
        ? 0
        : (typeof customMaxRetries === 'number' ? Math.max(0, customMaxRetries) : 2);
      const timeoutMs = (typeof customTimeoutMs === 'number' && customTimeoutMs > 0)
        ? customTimeoutMs
        : DEFAULT_FETCH_TIMEOUT_MS;

      const token = getAuthToken();
      const headers = new Headers(restInit.headers || (typeof resource === 'object' && resource.headers ? resource.headers : {}));
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      let lastError = null;
      let lastResponse = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (externalSignal?.aborted) {
          const abortErr = new Error('The operation was aborted.');
          abortErr.name = 'AbortError';
          throw abortErr;
        }

        const attemptController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timeoutHandle = null;
        let onExternalAbort = null;
        let timedOut = false;

        if (attemptController) {
          if (externalSignal) {
            onExternalAbort = () => attemptController.abort(externalSignal.reason);
            externalSignal.addEventListener('abort', onExternalAbort, { once: true });
          }
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            attemptController.abort();
          }, timeoutMs);
        }

        const modifiedInit = {
          ...restInit,
          headers,
          ...(attemptController ? { signal: attemptController.signal } : {})
        };

        try {
          const targetArg = (typeof resource === 'string')
            ? resource
            : (typeof resource.clone === 'function'
                ? resource.clone()
                : (typeof Request !== 'undefined' ? new Request(urlString, modifiedInit) : urlString));
          const response = await originalFetch.call(this, targetArg, modifiedInit);

          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (externalSignal && onExternalAbort) {
            externalSignal.removeEventListener('abort', onExternalAbort);
          }

          if (TRANSIENT_GATEWAY_STATUSES.has(response.status) && attempt < maxRetries) {
            lastResponse = response;
            const backoffMs = attempt === 0 ? 600 : 1400;
            await delayWithSignal(backoffMs, externalSignal);
            continue;
          }

          // Handle 401 Unauthorized: clear expired credentials cleanly
          if (
            response.status === 401 &&
            !urlString.includes('/login') &&
            !urlString.includes('/logout') &&
            !urlString.includes('/verify-session')
          ) {
            clearAuthToken();
            try {
              localStorage.removeItem('bics_session');
              sessionStorage.removeItem('bics_session');
            } catch {}
            window.dispatchEvent(new CustomEvent('bics_auth_expired'));
          }

          return response;
        } catch (err) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (externalSignal && onExternalAbort) {
            externalSignal.removeEventListener('abort', onExternalAbort);
          }

          if (externalSignal?.aborted) {
            throw err;
          }

          const isRetryableError = isIdempotent && attempt < maxRetries && (
            timedOut ||
            (err?.name !== 'AbortError' && (typeof navigator === 'undefined' || navigator.onLine !== false))
          );

          if (isRetryableError) {
            lastError = err;
            await delayWithSignal(attempt === 0 ? 600 : 1400, externalSignal);
            continue;
          }

          throw err;
        }
      }

      if (lastResponse) return lastResponse;
      if (lastError) throw lastError;
    }

    return originalFetch.call(this, resource, init);
  };
}
