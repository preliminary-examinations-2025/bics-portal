import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { kataApi, sanitizeUrlToken, parseJwtExp, sanitizeRedirectPath, getLoginUrl } from '../utils/kataApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const initialToken = typeof window !== 'undefined'
        ? (localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token'))
        : null;
    const initialHandle = typeof window !== 'undefined'
        ? localStorage.getItem('kata_handle')
        : null;

    const [candidate, setCandidate] = useState(null);
    const [profile, setProfile] = useState(null);
    const [needsRegistration, setNeedsRegistration] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRedirecting, setIsRedirecting] = useState(false);
    const [authError, setAuthError] = useState('');

    const redirectToLogin = useCallback((reason) => {
        setIsRedirecting(true);

        // Anti-Loop Circuit Breaker
        try {
            const now = Date.now();
            const lastTs = parseInt(sessionStorage.getItem('bics_ws_last_redirect_ts') || '0', 10);
            let loopCount = parseInt(sessionStorage.getItem('bics_ws_redirect_loop_count') || '0', 10);
            if (now - lastTs < 4000) {
                loopCount += 1;
            } else {
                loopCount = 1;
            }
            sessionStorage.setItem('bics_ws_last_redirect_ts', String(now));
            sessionStorage.setItem('bics_ws_redirect_loop_count', String(loopCount));

            if (loopCount > 3) {
                console.warn('[CircuitBreaker] Workspace detected redirect loop. Halting redirect without parameters.');
                localStorage.clear();
                sessionStorage.clear();
                setIsAuthenticated(false);
                setAuthError('Redirect loop detected. Please sign in directly.');
                window.location.replace(getLoginUrl(null));
                return;
            }
        } catch (e) {}

        try {
            localStorage.removeItem('bics_auth_token');
            sessionStorage.removeItem('bics_auth_token');
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
            localStorage.removeItem('kata_handle');
            localStorage.removeItem('bics_token_expiry');
        } catch {}

        let cleanRedirect = null;
        const isExplicitSignOut = reason === 'User logged out' || reason === 'Session expired';

        if (isExplicitSignOut) {
            console.warn(`[AuthGuard] Explicit sign out (${reason}). Redirecting to login with clean=1.`);
            setIsAuthenticated(false);
            setAuthError(reason);
            window.location.replace(getLoginUrl(null, { clean: true }));
            return;
        }

        let pathname = window.location.pathname || '';
        if (!pathname.startsWith('/workspace')) {
            pathname = '/workspace' + (pathname.startsWith('/') ? pathname : '/' + pathname);
        }
        if (pathname === '/workspace' || pathname === '/workspace/') {
            pathname = '/workspace/kata';
        }
        let search = window.location.search || '';
        if (search) {
            const params = new URLSearchParams(search);
            params.delete('token');
            params.delete('authToken');
            const qs = params.toString();
            search = qs ? `?${qs}` : '';
        }
        const hash = window.location.hash || '';
        cleanRedirect = sanitizeRedirectPath(pathname + search + hash);

        const targetUrl = getLoginUrl(cleanRedirect);

        console.warn(`[AuthGuard] Redirecting to BICS portal login: ${reason || 'unauthorized'}`);
        setIsAuthenticated(false);
        setAuthError(reason || 'Unauthorized access');
        window.location.replace(targetUrl);
    }, []);

    const verifyAuth = useCallback(async () => {
        if (!localStorage.getItem('bics_auth_token') && !sessionStorage.getItem('bics_auth_token')) {
            setIsLoading(true);
        }
        setAuthError('');

        try {
            // 1. Sanitize any query parameter token from URL
            const token = sanitizeUrlToken();

            if (!token) {
                redirectToLogin('No session token found');
                return;
            }

            // 2. Exact Server JWT Expiry Check
            const expMs = parseJwtExp(token);
            if (expMs && Date.now() >= expMs) {
                console.warn('[AuthGuard] JWT token expired according to server exp timestamp.');
                redirectToLogin('Session expired');
                return;
            }

            if (expMs) {
                try {
                    localStorage.setItem('bics_token_expiry', String(expMs));
                } catch {}
            }

            // 3. Fetch authenticated profile from backend
            const res = await kataApi.getMe();

            if (!res || !res.authenticated) {
                redirectToLogin(res?.error || 'Session verification failed');
                return;
            }

            // 4. User is an enrolled BICS candidate or administrator
            const candData = res.candidate || res.student;
            setCandidate(candData);

            if (candData?.email) {
                try {
                    localStorage.setItem('kata_email', candData.email);
                } catch {}
            }

            if (res.needsRegistration || !res.profile || !res.profile.handle) {
                setProfile(null);
                setNeedsRegistration(true);
            } else {
                setProfile(res.profile);
                setNeedsRegistration(false);
                try {
                    localStorage.setItem('kata_handle', res.profile.handle);
                } catch {}
            }

            setIsAuthenticated(true);
        } catch (err) {
            console.error('[AuthGuard] Authentication error:', err);
            setAuthError('Failed to verify BICS credentials.');
            redirectToLogin('Authentication exception');
        } finally {
            setIsLoading(false);
        }
    }, [redirectToLogin]);

    useEffect(() => {
        verifyAuth();
    }, [verifyAuth]);

    // Proactive timer: Automatically logout when JWT exp timestamp is reached
    useEffect(() => {
        if (!isAuthenticated) return;
        const token = localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token');
        const expMs = parseJwtExp(token);
        if (expMs) {
            const timeRemaining = expMs - Date.now();
            if (timeRemaining <= 0) {
                redirectToLogin('Session expired');
                return;
            }
            const timer = setTimeout(() => {
                redirectToLogin('Session expired');
            }, timeRemaining);
            return () => clearTimeout(timer);
        }
    }, [isAuthenticated, redirectToLogin]);

    const handleRegistered = useCallback((newProfile, updatedCandidate) => {
        if (newProfile && newProfile.handle) {
            try {
                localStorage.setItem('kata_handle', newProfile.handle);
            } catch {}
            setProfile(newProfile);
        }
        if (updatedCandidate) {
            setCandidate(prev => ({ ...(prev || {}), ...updatedCandidate }));
        }
        setNeedsRegistration(false);
    }, []);

    const logout = useCallback(async () => {
        setIsRedirecting(true);
        const token = localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token') || '';
        if (token) {
            try {
                await fetch('/api/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ token })
                });
            } catch (e) {
                console.error('[AuthContext] Backend logout failed:', e);
            }
        }

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('bics_auth_sync');
                channel.postMessage({ type: 'BICS_LOGOUT' });
                channel.close();
            }
        } catch (e) {}

        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch {}

        setIsAuthenticated(false);
        setCandidate(null);
        setProfile(null);
        window.location.replace(getLoginUrl(null, { clean: true }));
    }, []);

    return (
        <AuthContext.Provider value={{
            candidate,
            profile,
            needsRegistration,
            isAuthenticated,
            isLoading,
            isRedirecting,
            authError,
            refreshAuth: verifyAuth,
            onHandleRegistered: handleRegistered,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}
