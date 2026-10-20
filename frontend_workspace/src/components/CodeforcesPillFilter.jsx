import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

/**
 * CodeforcesPillFilter
 * Replicates the exact Codeforces tab/filter design shown in img ref 4:
 * - Font: "PT Sans Narrow", Verdana, sans-serif, 12px Bold, Uppercase
 * - Active item has a soft dark cloud-like rounded container (background: #b9b9b9, border-radius: 4px)
 * - Inactive items have clean blue/dark bold text without any bevel border
 * - Smooth ease and slow transitions: when switching between filters, the dark cloud
 *   container glides seamlessly from the old item to the new item.
 */
export default function CodeforcesPillFilter({
    items = [],
    activeId = '',
    onChange = () => {},
    style = {},
    gap = 8
}) {
    const containerRef = useRef(null);
    const itemRefs = useRef({});
    const [pillStyle, setPillStyle] = useState({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        ready: false
    });

    const updatePill = useCallback(() => {
        const activeEl = itemRefs.current[activeId];
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
                return {
                    left: nextLeft,
                    top: nextTop,
                    width: nextWidth,
                    height: nextHeight,
                    ready: true
                };
            });
        }
    }, [activeId]);

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
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: `${gap}px`,
                userSelect: 'none',
                padding: '2px 0',
                ...style
            }}
        >
            {/* Sliding Dark Cloud-Like Container (Codeforces #b9b9b9 pill with smooth slow transition) */}
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

            {items.map((item) => {
                const isActive = item.id === activeId;
                return (
                    <button
                        key={item.id}
                        ref={(el) => (itemRefs.current[item.id] = el)}
                        type="button"
                        onClick={() => onChange(item.id)}
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            cursor: 'pointer',
                            fontFamily: "'PT Sans Narrow', Verdana, sans-serif",
                            fontSize: '12px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                            color: isActive ? '#000000' : '#315682',
                            padding: '4px 10px',
                            margin: 0,
                            borderRadius: '4px',
                            boxShadow: 'none',
                            lineHeight: '16px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'color 0.25s ease',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
