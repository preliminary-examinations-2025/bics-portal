import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Secondary navigation bar for active contest and problemset pages:
 * Matches Codeforces sub-nav design (img ref 4):
 * - Font: "PT Sans Narrow", Verdana, sans-serif, 12px Bold
 * - Sliding dark cloud container (#b9b9b9) with smooth slow transition
 * - Clean text without underline or bevels
 */
export default function KataContestSubNav({ contestId, letter, isProblemset, isScheduled }) {
    const location = useLocation();
    const currentPath = location.pathname;

    const navItems = isProblemset ? [
        { label: 'PROBLEMS', path: '/problemset' },
        { label: 'SUBMIT CODE', path: letter ? `/problemset/problem/${contestId}/${letter}` : `/kata/contests/${contestId}/submit` },
        { label: 'STATUS', path: `/kata/contests/${contestId}/submissions?all=true` }
    ] : isScheduled ? [
        { label: 'OVERVIEW', path: `/kata/contests/${contestId}` },
        { label: 'PARTICIPANTS', path: `/kata/contests/${contestId}/participants` }
    ] : [
        { label: 'PROBLEMS', path: `/kata/contests/${contestId}` },
        { label: 'SUBMIT CODE', path: `/kata/contests/${contestId}/submit` },
        { label: 'MY SUBMISSIONS', path: `/kata/contests/${contestId}/submissions` },
        { label: 'STATUS', path: `/kata/contests/${contestId}/submissions?all=true` },
        { label: 'STANDINGS', path: `/kata/contests/${contestId}/standings` }
    ];

    const isActive = (itemPath) => {
        const urlObj = new URL(itemPath, 'http://localhost');
        const itemBase = urlObj.pathname;
        const itemHasAll = urlObj.searchParams.get('all') === 'true';
        const currentHasAll = location.search.includes('all=true');

        if (itemHasAll) {
            return currentPath === itemBase && currentHasAll;
        }

        if (itemBase === `/kata/contests/${contestId}/submissions`) {
            return currentPath === itemBase && !currentHasAll;
        }

        if (isProblemset && itemBase === '/problemset') {
            return currentPath === '/problemset' || currentPath === '/kata/problemset';
        }
        if (itemBase === `/kata/contests/${contestId}`) {
            return currentPath === itemBase || currentPath.startsWith(`/kata/contests/${contestId}/problem/`);
        }
        return currentPath === itemBase || currentPath.startsWith(itemBase);
    };

    const containerRef = useRef(null);
    const itemRefs = useRef({});
    const [pillStyle, setPillStyle] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

    const activeItem = navItems.find((item) => isActive(item.path));
    const activePath = activeItem?.path || '';

    const updatePill = useCallback(() => {
        if (!activePath) return;
        const activeEl = itemRefs.current[activePath];
        if (activeEl && containerRef.current) {
            const nextLeft = Math.round(activeEl.offsetLeft);
            const nextTop = Math.round(activeEl.offsetTop);
            const nextWidth = Math.round(activeEl.offsetWidth);
            const nextHeight = Math.round(activeEl.offsetHeight);

            setPillStyle((prev) => {
                if (
                    Math.abs(prev.left - nextLeft) < 1 &&
                    Math.abs(prev.top - nextTop) < 1 &&
                    Math.abs(prev.width - nextWidth) < 1 &&
                    Math.abs(prev.height - nextHeight) < 1 &&
                    prev.ready
                ) {
                    return prev;
                }
                return { left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight, ready: true };
            });
        }
    }, [activePath]);

    useLayoutEffect(() => {
        updatePill();
    }, [updatePill]);

    useEffect(() => {
        let isMounted = true;
        const safeUpdate = () => {
            if (isMounted) updatePill();
        };

        window.addEventListener('resize', safeUpdate);
        const t1 = setTimeout(safeUpdate, 50);
        const t2 = setTimeout(safeUpdate, 200);

        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                if (isMounted) safeUpdate();
            }).catch(() => {});
        }

        return () => {
            isMounted = false;
            window.removeEventListener('resize', safeUpdate);
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [updatePill]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                maxWidth: '1100px',
                margin: '8px auto 14px auto',
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                boxSizing: 'border-box',
                userSelect: 'none'
            }}
        >
            {/* Sliding dark cloud-like container */}
            <div
                style={{
                    position: 'absolute',
                    left: `${pillStyle.left}px`,
                    top: `${pillStyle.top}px`,
                    width: `${pillStyle.width}px`,
                    height: `${pillStyle.height}px`,
                    backgroundColor: '#b9b9b9',
                    borderRadius: '4px',
                    transition: 'left 0.4s cubic-bezier(0.25, 1, 0.5, 1), width 0.4s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s ease, height 0.3s ease, opacity 0.25s ease',
                    opacity: pillStyle.ready ? 1 : 0,
                    pointerEvents: 'none',
                    zIndex: 1,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)'
                }}
            />

            {navItems.map((item) => {
                const active = isActive(item.path);
                return (
                    <Link
                        key={item.path}
                        ref={(el) => (itemRefs.current[item.path] = el)}
                        to={item.path}
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            color: active ? '#000000' : '#315682',
                            textDecoration: 'none',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            background: 'transparent',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: "'PT Sans Narrow', Verdana, sans-serif",
                            fontSize: '12px',
                            fontWeight: 'bold',
                            letterSpacing: '0.4px',
                            transition: 'color 0.25s ease',
                            whiteSpace: 'nowrap',
                            lineHeight: '16px'
                        }}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </div>
    );
}
