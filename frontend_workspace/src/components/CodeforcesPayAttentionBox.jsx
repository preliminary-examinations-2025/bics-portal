import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * CodeforcesPayAttentionBox
 * Replicates the Codeforces "Pay attention" sidebar box (img ref 2):
 * 1. Exact style, color, font weight, and appearance as img ref 2 from Codeforces
 * 2. Lists 1 contest only (running contest or next upcoming contest)
 * 3. Shows "Before contest" with time before start, or "Before contest ends" with running time
 */
export default function CodeforcesPayAttentionBox({ contests: initialContests, handle = '' }) {
    const [contests, setContests] = useState(initialContests || []);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (initialContests && initialContests.length > 0) {
            setContests(initialContests);
        } else {
            // Fetch current and upcoming contests
            const targetUrl = handle 
                ? `/api/kata/contests?handle=${encodeURIComponent(handle)}` 
                : '/api/kata/contests';
            
            fetch(targetUrl)
                .then((res) => res.json())
                .then((data) => {
                    if (data.success && data.currentAndUpcoming) {
                        setContests(data.currentAndUpcoming);
                    } else if (data.contests) {
                        setContests(data.contests);
                    }
                })
                .catch((err) => {
                    console.error('Error fetching Pay Attention contests:', err);
                });
        }
    }, [initialContests, handle]);

    // Live 1-second ticker for countdown
    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Filter and sort contests:
    // Running contests first, then upcoming contests sorted by startTime ascending
    const currentTime = now;
    const processedContests = contests
        .map((c) => {
            const startMs = new Date(c.startTime).getTime();
            const endMs = new Date(c.endTime).getTime();
            const isRunning = currentTime >= startMs && currentTime <= endMs;
            const isUpcoming = currentTime < startMs;
            const hasEnded = currentTime > endMs;

            let remainingSec = 0;
            if (isRunning) {
                remainingSec = Math.max(0, Math.floor((endMs - currentTime) / 1000));
            } else if (isUpcoming) {
                remainingSec = Math.max(0, Math.floor((startMs - currentTime) / 1000));
            }

            return {
                ...c,
                startMs,
                endMs,
                isRunning,
                isUpcoming,
                hasEnded,
                remainingSec
            };
        })
        .filter((c) => !c.hasEnded)
        .sort((a, b) => {
            // Running contests take priority over upcoming
            if (a.isRunning && !b.isRunning) return -1;
            if (!a.isRunning && b.isRunning) return 1;
            // Otherwise sort by start time ascending
            return a.startMs - b.startMs;
        })
        .slice(0, 1); // Only show 1 item in the Pay Attention box

    const formatRemaining = (totalSeconds) => {
        if (totalSeconds <= 0) return '00:00:00';
        const days = Math.floor(totalSeconds / 86400);
        if (days >= 2) {
            return `${days} days`;
        }
        if (days === 1) {
            return '1 day';
        }
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #b9b9b9',
            borderRadius: '5px',
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Codeforces Header: → Pay attention */}
            <div style={{
                padding: '6px 10px',
                borderBottom: '1px solid #b9b9b9',
                fontWeight: 'bold',
                color: '#3b5998',
                fontSize: '12px',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <span>→</span>
                <span>Pay attention</span>
            </div>

            {/* Body */}
            <div>
                {processedContests.length === 0 ? (
                    <div style={{ padding: '14px 10px', textAlign: 'center', color: '#666666', fontSize: '11px' }}>
                        No upcoming or active contests.
                    </div>
                ) : (
                    processedContests.map((c, idx) => {
                        const isRunning = c.isRunning;
                        const cid = c.contestId || c.id;

                        return (
                            <div key={cid || idx} style={{ padding: '10px 10px 12px 10px', textAlign: 'center' }}>
                                {/* Status Label: bold, #315682, 14px (Ref Img 2) */}
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    color: '#315682',
                                    marginBottom: '4px',
                                    lineHeight: '1.2'
                                }}>
                                    {isRunning ? 'Before contest ends' : 'Before contest'}
                                </div>

                                {/* Contest Title Link with Underline, 13px, normal weight, #0000ee (Ref Img 2) */}
                                <div style={{ marginBottom: '3px' }}>
                                    <Link
                                        to={`/kata/contests/${cid}`}
                                        style={{
                                            color: '#0000ee',
                                            fontSize: '13px',
                                            fontWeight: 'normal',
                                            textDecoration: 'underline',
                                            lineHeight: '1.4',
                                            display: 'inline-block'
                                        }}
                                    >
                                        {c.title}
                                    </Link>
                                </div>

                                {/* Time Remaining: 13px, #333333, normal weight (Ref Img 2) */}
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: 'normal',
                                    color: '#333333',
                                    marginBottom: '3px',
                                    fontFamily: 'Verdana, sans-serif'
                                }}>
                                    {formatRemaining(c.remainingSec)}
                                </div>

                                {/* Action link: 13px, normal weight, #0000ee, underline (Ref Img 2) */}
                                <div style={{ marginBottom: '4px' }}>
                                    {isRunning ? (
                                        <Link
                                            to={`/kata/contests/${cid}`}
                                            style={{
                                                color: '#0000ee',
                                                fontSize: '13px',
                                                fontWeight: 'normal',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            Enter »
                                        </Link>
                                    ) : c.isRegistered ? (
                                        <span style={{ color: '#008000', fontSize: '12px', fontWeight: 'bold' }}>
                                            Registered
                                        </span>
                                    ) : (
                                        <Link
                                            to={`/kata/contests/${cid}/register`}
                                            style={{
                                                color: '#0000ee',
                                                fontSize: '13px',
                                                fontWeight: 'normal',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            Register now »
                                        </Link>
                                    )}
                                </div>

                                {/* Footnote with help question mark icon */}
                                <div style={{
                                    fontSize: '10px',
                                    color: '#666666',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '3px'
                                }}>
                                    <span>*has extra registration</span>
                                    <span
                                        title="Extra registration is available"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '11px',
                                            height: '11px',
                                            borderRadius: '50%',
                                            backgroundColor: '#777777',
                                            color: '#ffffff',
                                            fontSize: '9px',
                                            fontWeight: 'bold',
                                            cursor: 'help'
                                        }}
                                    >
                                        ?
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
