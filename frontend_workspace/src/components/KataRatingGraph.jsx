import React, { useState } from 'react';

export default function KataRatingGraph({ profile }) {
    const [trackFilter, setTrackFilter] = useState('combined'); // 'combined', 'shin', 'forma'
    const [ratedOnly, setRatedOnly] = useState('rated');
    const [hoveredNode, setHoveredNode] = useState(null);

    const handle = profile?.handle || '';

    // Extract strictly actual contest history
    const allHistory = (profile?.contestHistory || []).filter(h => (ratedOnly === 'rated' ? h.isRated !== false : true));
    const shinNodes = allHistory.filter(h => h.track === 'shin');
    const formaNodes = allHistory.filter(h => h.track === 'forma');

    const displayedNodes = trackFilter === 'shin' 
        ? shinNodes 
        : trackFilter === 'forma' 
        ? formaNodes 
        : allHistory;

    // Chart dimensions
    const width = 760;
    const height = 240;
    const paddingLeft = 50;
    const paddingRight = 30;
    const paddingTop = 20;
    const paddingBottom = 40;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const minRating = 1000;
    const maxRating = 2050;

    const getY = (val) => {
        const clamped = Math.max(minRating, Math.min(maxRating, val));
        const ratio = (clamped - minRating) / (maxRating - minRating);
        return paddingTop + chartH - ratio * chartH;
    };

    const getX = (idx, total) => {
        if (total <= 1) return paddingLeft + chartW / 2;
        return paddingLeft + (idx / (total - 1)) * chartW;
    };

    // Rating Bands (Codeforces standard palette)
    const bands = [
        { label: '1900', min: 1900, max: 2050, color: '#ff88ff' }, // Violet (Candidate Master)
        { label: '1600', min: 1600, max: 1900, color: '#aaaaee' }, // Blue (Expert)
        { label: '1400', min: 1400, max: 1600, color: '#77ddbb' }, // Cyan (Specialist)
        { label: '1200', min: 1200, max: 1400, color: '#77ff77' }, // Green (Apprentice)
        { label: '1000', min: 1000, max: 1200, color: '#cccccc' }  // Gray (Initiate)
    ];

    const generatePolyline = (nodes) => {
        return nodes.map((n, i) => `${getX(i, nodes.length)},${getY(n.newRating || n.rating || 1200)}`).join(' ');
    };

    const hasData = displayedNodes.length > 0;

    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #b9b9b9',
            borderRadius: '4px',
            marginBottom: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            overflow: 'hidden'
        }}>
            {/* Graph Header Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 14px',
                background: '#ffffff',
                borderBottom: '1px solid #b9b9b9',
                fontSize: '11px',
                color: '#666'
            }}>
                <span>Click on the graph to enable the zoom feature.</span>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={trackFilter}
                        onChange={(e) => setTrackFilter(e.target.value)}
                        style={{
                            fontSize: '11px',
                            fontFamily: 'inherit',
                            padding: '2px 6px',
                            border: '1px solid #b9b9b9',
                            borderRadius: '3px',
                            background: '#fff'
                        }}
                    >
                        <option value="combined">Combined (Shin + Forma)</option>
                        <option value="shin">KataShin (Algo)</option>
                        <option value="forma">KataForma (Frontend)</option>
                    </select>

                    <select
                        value={ratedOnly}
                        onChange={(e) => setRatedOnly(e.target.value)}
                        style={{
                            fontSize: '11px',
                            fontFamily: 'inherit',
                            padding: '2px 6px',
                            border: '1px solid #b9b9b9',
                            borderRadius: '3px',
                            background: '#fff'
                        }}
                    >
                        <option value="rated">Only rated</option>
                        <option value="all">All contests</option>
                    </select>
                </div>
            </div>

            {/* SVG Rating Chart */}
            <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                >
                    {/* Colored Rating Tier Background Bands */}
                    {bands.map((b, i) => {
                        const top = getY(b.max);
                        const bottom = getY(b.min);
                        const h = bottom - top;
                        return (
                            <rect
                                key={i}
                                x={paddingLeft}
                                y={top}
                                width={chartW}
                                height={h}
                                fill={b.color}
                                opacity="0.65"
                            />
                        );
                    })}

                    {/* Horizontal Guidelines & Y-Axis Labels */}
                    {bands.map((b, i) => (
                        <g key={`guide-${i}`}>
                            <line
                                x1={paddingLeft}
                                y1={getY(b.min)}
                                x2={paddingLeft + chartW}
                                y2={getY(b.min)}
                                stroke="#999"
                                strokeWidth="0.8"
                                strokeDasharray={b.min === 1200 ? 'none' : '3 3'}
                            />
                            <text
                                x={paddingLeft - 8}
                                y={getY(b.min) + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="#555"
                                fontFamily="Verdana"
                            >
                                {b.min}
                            </text>
                        </g>
                    ))}

                    {/* Chart border */}
                    <rect
                        x={paddingLeft}
                        y={paddingTop}
                        width={chartW}
                        height={chartH}
                        fill="none"
                        stroke="#888888"
                        strokeWidth="1"
                    />

                    {/* If no contest history yet, show empty calibration banner inside chart */}
                    {!hasData && (
                        <text
                            x={paddingLeft + chartW / 2}
                            y={paddingTop + chartH / 2}
                            textAnchor="middle"
                            fontSize="11"
                            fill="#555555"
                            fontFamily="Verdana"
                        >
                            No rated contest history yet. Compete in Kata contests to establish your rating curve.
                        </text>
                    )}

                    {/* Real Forma Curve */}
                    {(trackFilter === 'combined' || trackFilter === 'forma') && formaNodes.length > 0 && (
                        <>
                            <polyline
                                fill="none"
                                stroke="#0284c7"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={generatePolyline(formaNodes)}
                            />
                            {formaNodes.map((n, i) => {
                                const cx = getX(i, formaNodes.length);
                                const cy = getY(n.newRating || n.rating || 1200);
                                return (
                                    <circle
                                        key={`fnode-${i}`}
                                        cx={cx}
                                        cy={cy}
                                        r="4"
                                        fill="#38bdf8"
                                        stroke="#0369a1"
                                        strokeWidth="1.5"
                                        style={{ cursor: 'pointer' }}
                                        onMouseEnter={() => setHoveredNode({ ...n, trackName: 'KataForma' })}
                                        onMouseLeave={() => setHoveredNode(null)}
                                    />
                                );
                            })}
                        </>
                    )}

                    {/* Real Shin Curve */}
                    {(trackFilter === 'combined' || trackFilter === 'shin') && shinNodes.length > 0 && (
                        <>
                            <polyline
                                fill="none"
                                stroke="#ca8a04"
                                strokeWidth="2.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={generatePolyline(shinNodes)}
                            />
                            {shinNodes.map((n, i) => {
                                const cx = getX(i, shinNodes.length);
                                const cy = getY(n.newRating || n.rating || 1200);
                                return (
                                    <circle
                                        key={`snode-${i}`}
                                        cx={cx}
                                        cy={cy}
                                        r="4.5"
                                        fill="#fbbf24"
                                        stroke="#92400e"
                                        strokeWidth="1.5"
                                        style={{ cursor: 'pointer' }}
                                        onMouseEnter={() => setHoveredNode({ ...n, trackName: 'KataShin' })}
                                        onMouseLeave={() => setHoveredNode(null)}
                                    />
                                );
                            })}
                        </>
                    )}

                    {/* Codeforces User Legend Badge matching Img Ref 1 */}
                    {handle && (
                        <g transform={`translate(${paddingLeft + chartW - (handle.length * 7.5 + 16)}, ${paddingTop + 8})`}>
                            <rect
                                x="0"
                                y="0"
                                width={handle.length * 7.5 + 14}
                                height="18"
                                rx="2"
                                fill="#ffee88"
                                stroke="#d8be50"
                                strokeWidth="1"
                            />
                            <text
                                x={(handle.length * 7.5 + 14) / 2}
                                y="13"
                                textAnchor="middle"
                                fontSize="11"
                                fill="#000000"
                                fontFamily="Verdana, sans-serif"
                            >
                                {handle}
                            </text>
                        </g>
                    )}
                </svg>

                {/* Hover Tooltip Modal */}
                {hoveredNode && (
                    <div style={{
                        position: 'absolute',
                        top: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#ffffff',
                        border: '1px solid #718096',
                        borderRadius: '3px',
                        padding: '6px 12px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        fontSize: '11px',
                        zIndex: 10,
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontWeight: 'bold', color: '#1e3a8a', marginBottom: '2px' }}>
                            {hoveredNode.contestTitle || 'Contest Round'}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', color: '#333' }}>
                            <span>Track: <strong>{hoveredNode.trackName || hoveredNode.track}</strong></span>
                            <span>Rank: <strong>{hoveredNode.rank || '-'}</strong></span>
                            <span>
                                Delta:{' '}
                                <strong style={{ color: (hoveredNode.delta || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                                    {(hoveredNode.delta || 0) >= 0 ? `+${hoveredNode.delta || 0}` : hoveredNode.delta}
                                </strong>
                            </span>
                            <span>New Rating: <strong>{hoveredNode.newRating || hoveredNode.rating || 1200}</strong></span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
