/**
 * kataApi.js - Kata Competitive Arena API & Utility Helpers
 */

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
    // Locally backend is on port 5000; in production proxy handles /api
    return isLocal ? 'http://127.0.0.1:5000/api' : '/api';
})();

export function parseJwtExp(token) {
    try {
        if (!token || typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(atob(base64));
        return json.exp ? json.exp * 1000 : null;
    } catch {
        return null;
    }
}

export function sanitizeRedirectPath(path) {
    if (!path || typeof path !== 'string') return null;
    let decoded = path;
    try {
        while (decoded.includes('%2F') || decoded.includes('%2f') || decoded.includes('%3F') || decoded.includes('%3f')) {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        }
    } catch {}

    const lower = decoded.toLowerCase();
    if (
        lower.includes('logout') || 
        lower.includes('clean=1') || 
        lower === '/login' || 
        lower === '/main/login' || 
        lower.startsWith('/login?') || 
        lower.startsWith('/main/login?')
    ) {
        return null;
    }
    return decoded;
}

export function getLoginUrl(redirectPath, options = {}) {
    const isLocal = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168.') ||
        window.location.hostname.startsWith('10.') ||
        window.location.hostname.startsWith('172.')
    );
    const isStandaloneWorkspace = typeof window !== 'undefined' && window.location.hostname.includes('bicsworkspace');
    
    let base = '/main/login';
    if (isLocal) {
        base = 'http://localhost:5173/main/login';
    } else if (isStandaloneWorkspace) {
        base = 'https://bicsportal.netlify.app/main/login';
    }

    if (options && options.clean) {
        return `${base}?clean=1`;
    }

    const cleanRedirect = sanitizeRedirectPath(redirectPath);
    if (!cleanRedirect) return base;
    return `${base}?redirect=${encodeURIComponent(cleanRedirect)}`;
}

const getStoredToken = () => {
    try {
        return localStorage.getItem('bics_auth_token') || 
               sessionStorage.getItem('bics_auth_token') || 
               localStorage.getItem('token') || 
               sessionStorage.getItem('token') || '';
    } catch {
        return '';
    }
};

/**
 * Strips authToken from URL query params cleanly without reloading the page
 */
export const sanitizeUrlToken = () => {
    try {
        const url = new URL(window.location.href);
        const queryAuthToken = url.searchParams.get('authToken');
        if (queryAuthToken) {
            localStorage.setItem('bics_auth_token', queryAuthToken);
            sessionStorage.setItem('bics_auth_token', queryAuthToken);
            url.searchParams.delete('authToken');
            const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
            window.history.replaceState({}, document.title, cleanUrl);
            return queryAuthToken;
        }
    } catch (e) {
        console.error('Error sanitizing URL token:', e);
    }
    return getStoredToken();
};

export const getRatingTier = (rating) => {
    const r = Number(rating) || 1200;
    if (r < 1200) return { title: 'Initiate', color: '#808080', bg: '#cccccc' };
    if (r < 1400) return { title: 'Apprentice', color: '#008000', bg: '#77ff77' };
    if (r < 1600) return { title: 'Specialist', color: '#03a89e', bg: '#77ddbb' };
    if (r < 1900) return { title: 'Expert', color: '#0000ff', bg: '#aaaaee' };
    if (r < 2200) return { title: 'Shogun', color: '#aa00aa', bg: '#ff88ff' };
    if (r < 2400) return { title: 'Master', color: '#ff8c00', bg: '#ffcc88' };
    return { title: 'Grandmaster', color: '#ff0000', bg: '#ff7777' };
};

const getHeaders = () => {
    const token = getStoredToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

// Global fetch interceptor ensuring all /api requests target the right host and carry Bearer token
if (typeof window !== 'undefined' && window.fetch && !window.__KATA_FETCH_INTERCEPTED__) {
    window.__KATA_FETCH_INTERCEPTED__ = true;
    const originalFetch = window.fetch;
    window.fetch = async function (resource, config = {}) {
        let url = typeof resource === 'string' ? resource : resource?.url || '';
        let targetResource = resource;

        if (url.startsWith('/api') || url.includes('/api/')) {
            let resolvedUrl = url;
            if (url.startsWith('/api')) {
                resolvedUrl = `${API_BASE}${url.slice(4)}`;
            } else if (url.includes('/api/') && !url.includes('://')) {
                resolvedUrl = `${API_BASE}${url.slice(url.indexOf('/api/') + 4)}`;
            }

            const token = getStoredToken();
            config = config || {};
            const headers = new Headers(config.headers || (typeof resource === 'object' && resource.headers ? resource.headers : {}));
            if (token && !headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${token}`);
            }
            config.headers = headers;

            if (typeof resource === 'string') {
                targetResource = resolvedUrl;
            } else if (resource && typeof resource === 'object') {
                targetResource = new Request(resolvedUrl, config);
            }
        }
        return originalFetch(targetResource, config);
    };
}

export const kataApi = {
    async getMe() {
        try {
            const res = await fetch('/api/kata/me', { headers: getHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { authenticated: false, error: data.error || `HTTP ${res.status}` };
            }
            return data;
        } catch (e) {
            console.error('[kataApi.getMe] Network error:', e);
            return { authenticated: false, error: e.message || 'Network error connecting to backend' };
        }
    },

    async checkHandle(handle) {
        const res = await fetch(`/api/kata/check-handle/${encodeURIComponent(handle)}`, {
            headers: getHeaders()
        });
        return res.json();
    },

    async registerHandle(handle, password) {
        const res = await fetch('/api/kata/register-handle', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ handle, password })
        });
        const data = await res.json();
        if (data && data.token) {
            localStorage.setItem('bics_auth_token', data.token);
        }
        return data;
    },

    async getLeaderboard(track = 'shin') {
        const res = await fetch(`/api/kata/leaderboard?track=${encodeURIComponent(track)}`, {
            headers: getHeaders()
        });
        return res.json();
    },

    async getUpcomingContests() {
        const res = await fetch('/api/kata/upcoming-contests', {
            headers: getHeaders()
        });
        return res.json();
    },

    async getProfile(handle) {
        const res = await fetch(`/api/kata/profile/${encodeURIComponent(handle)}`, {
            headers: getHeaders()
        });
        return res.json();
    }
};
