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

const DEFAULT_OT_FETCH_TIMEOUT_MS = 20000;
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

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

// Auto-extract URL auth tokens on initialization (scoped strictly to OT session)
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlAuth = params.get('authToken') || params.get('jwt');
    if (urlAuth) {
      sessionStorage.setItem('bics_ot_auth_token', urlAuth);
      window.__BICS_OT_AUTH_TOKEN__ = urlAuth;
    }
    const urlExamToken = params.get('token');
    if (urlExamToken) {
      sessionStorage.setItem('bics_exam_token', urlExamToken);
      window.__BICS_EXAM_TOKEN__ = urlExamToken;
    }
    if (urlAuth && window.history && window.history.replaceState) {
      params.delete('authToken');
      params.delete('jwt');
      const cleanedQuery = params.toString();
      const cleanedUrl = `${window.location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanedUrl);
    }
  } catch (_) {}
}

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

// Enterprise fetch wrapper with automatic JWT & Exam Token authentication, timeout guards, and GET cold-start retries
if (typeof window !== 'undefined' && window.fetch && !window.__bics_ot_fetch_patched) {
  window.__bics_ot_fetch_patched = true;
  const originalFetch = window.fetch;

  window.fetch = async function(resource, init) {
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
      const token = (typeof window !== 'undefined' ? window.__BICS_OT_AUTH_TOKEN__ : '') ||
                    sessionStorage.getItem('bics_ot_auth_token') ||
                    (typeof window !== 'undefined' ? window.__BICS_AUTH_TOKEN__ : '') ||
                    sessionStorage.getItem('bics_auth_token') ||
                    localStorage.getItem('bics_auth_token') ||
                    localStorage.getItem('token') ||
                    '';
      const examToken = (typeof window !== 'undefined' ? window.__BICS_EXAM_TOKEN__ : '') ||
                        sessionStorage.getItem('bics_exam_token') ||
                        '';

      const rawInit = init ? { ...init } : {};
      const {
        timeoutMs: customTimeoutMs,
        retry: allowRetryOpt,
        maxRetries: customMaxRetries,
        signal: externalSignal,
        ...restInit
      } = rawInit;

      const headersObj = new Headers(restInit.headers || (resource instanceof Request ? resource.headers : {}));
      if (token && !headersObj.has('Authorization')) {
        headersObj.set('Authorization', `Bearer ${token}`);
      }
      if (examToken && !headersObj.has('x-exam-token')) {
        headersObj.set('x-exam-token', examToken);
      }

      const method = String(
        restInit.method || (typeof resource === 'object' && resource?.method) || 'GET'
      ).toUpperCase();
      const isIdempotent = method === 'GET' || method === 'HEAD';
      const maxRetries = (allowRetryOpt === false || !isIdempotent)
        ? 0
        : (typeof customMaxRetries === 'number' ? Math.max(0, customMaxRetries) : 2);
      const timeoutMs = (typeof customTimeoutMs === 'number' && customTimeoutMs > 0)
        ? customTimeoutMs
        : DEFAULT_OT_FETCH_TIMEOUT_MS;

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

        const reqInit = {
          ...restInit,
          headers: headersObj,
          ...(attemptController ? { signal: attemptController.signal } : {})
        };

        try {
          const targetArg = typeof resource === 'string'
            ? urlString
            : (typeof resource.clone === 'function'
                ? resource.clone()
                : (typeof Request !== 'undefined' ? new Request(urlString, reqInit) : urlString));
          const response = await originalFetch.call(this, targetArg, reqInit);

          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (externalSignal && onExternalAbort) {
            externalSignal.removeEventListener('abort', onExternalAbort);
          }

          if (TRANSIENT_GATEWAY_STATUSES.has(response.status) && attempt < maxRetries) {
            lastResponse = response;
            await delayWithSignal(attempt === 0 ? 600 : 1400, externalSignal);
            continue;
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
            err?.name === 'TypeError' ||
            (typeof navigator === 'undefined' || navigator.onLine !== false)
          );

          if (isRetryableError && (err?.name !== 'AbortError' || timedOut)) {
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
