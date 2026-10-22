import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLoginUrl } from '../utils/kataApi';
import logoImg from '../assets/kata_logo.png';
import katashinLogo from '../assets/katashin_logo_cropped.png';
import kataformaLogo from '../assets/kataforma_logo_cropped.png';

// Global memory cache to seamlessly glide the indicator across unmount/mount route transitions
let globalLastIndicator = null;

export default function KataHeader({ user, profile, onSearch, track, contestId }) {
    let authContext = null;
    try {
        authContext = useAuth();
    } catch (e) {}
    const logout = authContext?.logout;

    const [searchVal, setSearchVal] = useState('');
    const handle = profile?.handle || user?.username || '';
    const isAuthenticated = !!profile?.handle;
    const rankColor = profile?.rankColor || profile?.shinRankColor || '#008000';

    let routerLocation = null;
    try {
        routerLocation = useLocation();
    } catch (e) {}

    const currentPath = (routerLocation?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '')).toLowerCase();
    const currentSearch = (routerLocation?.search || (typeof window !== 'undefined' ? window.location.search : '')).toLowerCase();
    const trackLower = (track || '').toLowerCase();
    const cidLower = (contestId || '').toLowerCase();

    const navLinksRef = useRef(null);
    const [indicatorPos, setIndicatorPos] = useState(() => {
        if (globalLastIndicator && (Date.now() - globalLastIndicator.time < 5000)) {
            return {
                left: globalLastIndicator.left,
                width: globalLastIndicator.width,
                opacity: 1
            };
        }
        return { left: 0, width: 0, opacity: 0 };
    });

    const isShinActive = currentSearch.includes('track=shin') || trackLower === 'shin';
    const isFormaActive = currentSearch.includes('track=forma') || trackLower === 'forma';
    const isRulesActive = currentPath.includes('/rules');
    const isGymActive = currentPath.includes('/gym');
    const isProblemsetActive = currentPath.includes('/problemset');
    const isSubmissionsActive = currentPath.includes('/submissions') || currentPath.includes('/status');
    const isContestsActive = (currentPath.includes('/contests') || currentPath.includes('/contest')) && !currentSearch.includes('track=') && !isShinActive && !isFormaActive && !isRulesActive && !isGymActive && !isProblemsetActive && !isSubmissionsActive;
    const isHomeActive = !isRulesActive && !isGymActive && !isProblemsetActive && !isSubmissionsActive && !isContestsActive && !isShinActive && !isFormaActive && (currentPath === '/workspace/kata' || currentPath === '/kata' || currentPath === '/workspace' || currentPath === '/workspace/' || currentPath.includes('/profile'));

    useEffect(() => {
        let animFrame = null;
        const updateIndicator = () => {
            if (!navLinksRef.current) return;
            const activeEl = navLinksRef.current.querySelector('.kata-nav-link.active');
            if (activeEl) {
                const navRect = navLinksRef.current.getBoundingClientRect();
                const activeRect = activeEl.getBoundingClientRect();
                const newLeft = activeRect.left - navRect.left;
                const newWidth = activeRect.width;

                globalLastIndicator = {
                    left: newLeft,
                    width: newWidth,
                    time: Date.now()
                };

                setIndicatorPos({
                    left: newLeft,
                    width: newWidth,
                    opacity: 1
                });
            } else {
                setIndicatorPos(prev => ({ ...prev, opacity: 0 }));
            }
        };

        animFrame = requestAnimationFrame(updateIndicator);
        const timer = setTimeout(updateIndicator, 60);

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(updateIndicator);
        }

        window.addEventListener('resize', updateIndicator);
        return () => {
            if (animFrame) cancelAnimationFrame(animFrame);
            clearTimeout(timer);
            window.removeEventListener('resize', updateIndicator);
        };
    }, [currentPath, currentSearch, trackLower]);

    const handleLinkClick = (e) => {
        const targetEl = e.currentTarget;
        if (!navLinksRef.current || !targetEl) return;
        const navRect = navLinksRef.current.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const newLeft = targetRect.left - navRect.left;
        const newWidth = targetRect.width;

        globalLastIndicator = {
            left: newLeft,
            width: newWidth,
            time: Date.now()
        };

        setIndicatorPos({
            left: newLeft,
            width: newWidth,
            opacity: 1
        });
    };

    let logoSrc = logoImg;
    let logoAlt = "Kata";

    if (trackLower === 'shin' || cidLower.startsWith('shin') || currentPath.includes('shin')) {
        logoSrc = katashinLogo;
        logoAlt = "KataShin";
    } else if (trackLower === 'forma' || cidLower.startsWith('forma') || currentPath.includes('forma')) {
        logoSrc = kataformaLogo;
        logoAlt = "KataForma";
    }

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchVal.trim() && onSearch) {
            onSearch(searchVal.trim());
        }
    };

    const handleReturnToMain = () => {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isAdmin = user?.role === 'admin' || authContext?.candidate?.role === 'admin';
        const targetPath = isAdmin ? '/main/admin/dashboard' : '/main/home';
        window.location.href = isLocal ? `http://localhost:5173${targetPath}` : targetPath;
    };

    return (
        <header style={{
            width: '100%',
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '14px 10px 0 10px',
            boxSizing: 'border-box',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Top row: Logo on left, user session & language flags on right */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px'
            }}>
                {/* Brand / Logo */}
                <div>
                    <Link to="/kata" style={{ textDecoration: 'none', display: 'inline-block' }}>
                        <img 
                            src={logoSrc} 
                            alt={logoAlt} 
                            style={{ 
                                height: '42px', 
                                width: 'auto', 
                                objectFit: 'contain',
                                display: 'block'
                            }} 
                        />
                    </Link>
                </div>

                {/* Right controls: Two-row Codeforces header style (Bell + Flags on row 1, User session on row 2) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', fontSize: '11px' }}>
                    {/* Top sub-row: Bell Icon | Flags */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center' }} title="Notifications">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                        </span>
                        <span style={{ color: '#aaa', fontSize: '10px' }}>|</span>
                        <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                            <span title="English" style={{ fontSize: '12px', cursor: 'pointer' }}>🇬🇧</span>
                            <span title="Alternative" style={{ fontSize: '12px', cursor: 'pointer' }}>🇷🇺</span>
                        </div>
                    </div>

                    {/* Bottom sub-row: User session */}
                    {isAuthenticated ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Link 
                                to="/kata" 
                                style={{ 
                                    fontWeight: 'bold', 
                                    color: rankColor, 
                                    textDecoration: 'none' 
                                }}
                            >
                                {handle}
                            </Link>
                            <span style={{ color: '#888' }}>|</span>
                            <button 
                                onClick={handleReturnToMain}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: '#315682',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontFamily: 'inherit'
                                }}
                            >
                                Return to Main
                            </button>
                            <span style={{ color: '#888' }}>|</span>
                            <button 
                                onClick={() => {
                                    if (logout) {
                                        logout();
                                    } else {
                                        try { localStorage.clear(); sessionStorage.clear(); } catch {}
                                        window.location.replace(getLoginUrl(null, { clean: true }));
                                    }
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: '#e11d48',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontFamily: 'inherit'
                                }}
                            >
                                Logout
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button 
                                onClick={handleReturnToMain}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: '#315682',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontFamily: 'inherit'
                                }}
                            >
                                Return to Main
                            </button>
                            <span style={{ color: '#888' }}>|</span>
                            <button 
                                onClick={() => {
                                    window.location.href = getLoginUrl(window.location.pathname + window.location.search);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: '#315682',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontFamily: 'inherit'
                                }}
                            >
                                Sign In
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Codeforces Main Navigation Bar styled with Cuprum 15px Regular spanning proper 100% width */}
            <nav style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #b9b9b9',
                borderRadius: '5px',
                background: '#ffffff',
                height: '38px',
                padding: '0 10px 0 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                <div 
                    ref={navLinksRef}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%',
                        gap: '22px',
                        fontFamily: "'Cuprum', 'Arial Narrow', sans-serif",
                        fontSize: '15px',
                        fontWeight: 400,
                        position: 'relative'
                    }}
                >
                    <Link 
                        to="/kata" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isHomeActive ? 'active' : ''}`}
                    >
                        HOME
                    </Link>
                    <Link 
                        to="/kata/rules" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isRulesActive ? 'active' : ''}`}
                    >
                        RULES
                    </Link>
                    <Link 
                        to="/kata/contests" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isContestsActive ? 'active' : ''}`}
                    >
                        CONTESTS
                    </Link>
                    <Link 
                        to="/kata/gym" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isGymActive ? 'active' : ''}`}
                    >
                        GYM
                    </Link>
                    <Link 
                        to="/kata/problemset" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isProblemsetActive ? 'active' : ''}`}
                    >
                        PROBLEMSET
                    </Link>
                    <Link 
                        to="/kata/submissions" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isSubmissionsActive ? 'active' : ''}`}
                    >
                        SUBMISSIONS
                    </Link>
                    <Link 
                        to="/kata/contests?track=shin" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isShinActive ? 'active' : ''}`}
                    >
                        SHIN
                    </Link>
                    <Link 
                        to="/kata/contests?track=forma" 
                        onClick={handleLinkClick}
                        className={`kata-nav-link ${isFormaActive ? 'active' : ''}`}
                    >
                        FORMA
                    </Link>

                    {/* Elevated Underline Indicator with Smooth, Slow Glide Transition */}
                    <span 
                        className="kata-nav-indicator"
                        style={{
                            position: 'absolute',
                            bottom: '4px',
                            left: `${indicatorPos.left}px`,
                            width: `${indicatorPos.width}px`,
                            height: '2px',
                            backgroundColor: '#315682',
                            borderRadius: '1px',
                            opacity: indicatorPos.opacity,
                            pointerEvents: 'none',
                            transition: 'left 0.7s cubic-bezier(0.25, 1, 0.35, 1), width 0.7s cubic-bezier(0.25, 1, 0.35, 1), opacity 0.25s ease',
                            zIndex: 2
                        }}
                    />
                </div>

                {/* Codeforces Embedded Search Input (magnifying glass on left like Codeforces ref) */}
                <form onSubmit={handleSearchSubmit} style={{ margin: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                        type="text"
                        value={searchVal}
                        onChange={(e) => setSearchVal(e.target.value)}
                        placeholder=""
                        style={{
                            width: '145px',
                            height: '24px',
                            border: '1px solid #b5b5b5',
                            borderRadius: '3px',
                            padding: '1px 8px 1px 24px',
                            fontSize: '11px',
                            fontFamily: 'inherit',
                            outline: 'none',
                            background: '#ffffff',
                            boxSizing: 'border-box'
                        }}
                    />
                    <button
                        type="submit"
                        aria-label="Search"
                        style={{
                            position: 'absolute',
                            left: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            boxShadow: 'none'
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888888" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </button>
                </form>
            </nav>
        </header>
    );
}
