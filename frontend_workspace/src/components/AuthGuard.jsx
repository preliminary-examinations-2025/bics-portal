import React from 'react';
import { useAuth } from '../context/AuthContext';
import { getLoginUrl } from '../utils/kataApi';
import KataRegisterPage from '../views/KataRegisterPage';
import iconImg from '../assets/kata_icon.png';

export default function AuthGuard({ children }) {
    const { isAuthenticated, isLoading, isRedirecting, candidate, needsRegistration, onHandleRegistered, authError } = useAuth();

    // If still verifying authentication or actively redirecting to login, render a clean blank white container to prevent any card flicker
    if ((isLoading || isRedirecting) && !isAuthenticated) {
        return <div style={{ minHeight: '100vh', background: '#ffffff' }} />;
    }

    if (!isAuthenticated) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f4f6f8',
                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
            }}>
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    padding: '24px 32px',
                    textAlign: 'center',
                    maxWidth: '420px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
                }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔒</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#b91c1c', marginBottom: '8px' }}>
                        Access Restricted
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px', lineHeight: '1.4' }}>
                        {authError || 'Only enrolled BICS students and administrators are permitted access to the Kata workspace. Redirecting to login portal...'}
                    </div>
                    <button
                        onClick={() => {
                            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
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
                            const fullRedirect = pathname + search + hash;
                            window.location.href = getLoginUrl(fullRedirect);
                        }}
                        style={{
                            background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                            color: '#000000',
                            border: '1px solid #767676',
                            padding: '4px 16px',
                            borderRadius: '2px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                            boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                        }}
                    >
                        Return to BICS Login Portal »
                    </button>
                </div>
            </div>
        );
    }

    if (needsRegistration) {
        return (
            <KataRegisterPage
                candidate={candidate}
                onRegistered={onHandleRegistered}
            />
        );
    }

    return children;
}
