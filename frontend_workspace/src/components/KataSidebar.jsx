import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CodeforcesPayAttentionBox from './CodeforcesPayAttentionBox';

export default function KataSidebar({ profile, candidate, leaderboard, upcomingContests = [], onFindUser }) {
    const handle = profile?.handle || candidate?.username || '';
    const shinRating = profile?.shinRating || 1200;
    const shinRankColor = profile?.shinRankColor || '#008000';
    const [selectedTrack, setSelectedTrack] = useState('shin');
    const [searchHandle, setSearchHandle] = useState('');

    const nextContest = upcomingContests.length > 0 ? upcomingContests[0] : null;

    // Dynamic timer based on real nextContest or fallback if active contest
    const [secondsLeft, setSecondsLeft] = useState(0);

    useEffect(() => {
        if (!nextContest || !nextContest.startTime) {
            setSecondsLeft(0);
            return;
        }

        const calcRemaining = () => {
            const diff = Math.max(0, Math.floor((new Date(nextContest.startTime).getTime() - Date.now()) / 1000));
            setSecondsLeft(diff);
        };

        calcRemaining();
        const timer = setInterval(calcRemaining, 1000);
        return () => clearInterval(timer);
    }, [nextContest]);

    const formatTimer = (totalSec) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const topRatedList = (leaderboard && leaderboard[selectedTrack]) || [];
    const topContributors = leaderboard?.topContributors || [];

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchHandle.trim() && onFindUser) {
            onFindUser(searchHandle.trim());
        }
    };

    return (
        <aside style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            fontSize: '11px',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Box 1: Pay attention (Codeforces exact style & single-contest listing) */}
            <CodeforcesPayAttentionBox contests={upcomingContests} handle={handle} />

            {/* Box 2: Mini User Box (Codeforces Layout) */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #B9B9B9',
                borderRadius: '5px',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
                <div style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #B9B9B9',
                    fontWeight: 'bold',
                    color: '#3B5998',
                    fontSize: '11px',
                    background: '#ffffff'
                }}>
                    → {handle || 'User'}
                </div>
                <div style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3182ce" strokeWidth="2.5">
                                    <path d="M3 3v18h18" />
                                    <path d="m19 9-5 5-4-4-3 3" />
                                </svg>
                                <span>Rating: <strong style={{ color: shinRankColor }}>{shinRating}</strong></span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                                <span style={{ color: '#3182ce', fontSize: '12px' }}>★</span>
                                <span>Contribution: {profile?.contribution || 0}</span>
                            </div>
                            {/* User Links List */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                marginTop: '6px',
                                fontSize: '11px'
                            }}>
                                <a href="#settings" style={{ color: '#315682', textDecoration: 'none' }}>• Settings</a>
                                <a href="#blog" style={{ color: '#315682', textDecoration: 'none' }}>• Blog</a>
                                <a href="#teams" style={{ color: '#315682', textDecoration: 'none' }}>• Teams</a>
                                <Link to="/kata/submissions" style={{ color: '#315682', textDecoration: 'none' }}>• Submissions</Link>
                                <a href="#talks" style={{ color: '#315682', textDecoration: 'none' }}>• Talks</a>
                                <Link to="/kata/contests" style={{ color: '#315682', textDecoration: 'none' }}>• Contests</Link>
                            </div>
                        </div>

                        {/* Mini Avatar on the right with handle underneath */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '55px' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                border: '1px solid #B9B9B9',
                                borderRadius: '3px',
                                background: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <svg width="34" height="38" viewBox="0 0 100 110">
                                    <circle cx="50" cy="38" r="23" fill="#a7bbce" />
                                    <path d="M 14 104 C 16 75, 30 66, 50 66 C 70 66, 84 75, 86 104 Z" fill="#9eb2c8" />
                                </svg>
                            </div>
                            <span style={{ fontSize: '10px', color: '#555', marginTop: '4px', textAlign: 'center', wordBreak: 'break-all' }}>
                                {handle || 'Guest'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Box 3: Top Rated Table */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #B9B9B9',
                borderRadius: '5px',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
                <div style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #B9B9B9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#ffffff'
                }}>
                    <span style={{ fontWeight: 'bold', color: '#3B5998', fontSize: '11px' }}>
                        → Top rated
                    </span>
                    <div style={{ display: 'flex', gap: '3px', fontSize: '10px' }}>
                        <button
                            onClick={() => setSelectedTrack('shin')}
                            style={{
                                border: '1px solid #767676',
                                background: selectedTrack === 'shin' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                color: '#000000',
                                borderRadius: '2px',
                                padding: '1px 6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: selectedTrack === 'shin' ? 'bold' : 'normal',
                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                boxShadow: selectedTrack === 'shin' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                            }}
                        >
                            Shin
                        </button>
                        <button
                            onClick={() => setSelectedTrack('forma')}
                            style={{
                                border: '1px solid #767676',
                                background: selectedTrack === 'forma' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                color: '#000000',
                                borderRadius: '2px',
                                padding: '1px 6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: selectedTrack === 'forma' ? 'bold' : 'normal',
                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                boxShadow: selectedTrack === 'forma' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                            }}
                        >
                            Forma
                        </button>
                    </div>
                </div>

                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '11px',
                    textAlign: 'left'
                }}>
                    <thead>
                        <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
                            <th style={{ padding: '4px 8px', width: '22px', textAlign: 'center', color: '#555' }}>#</th>
                            <th style={{ padding: '4px 8px', color: '#555' }}>User</th>
                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#555' }}>Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topRatedList.length > 0 ? (
                            topRatedList.slice(0, 10).map((u, i) => (
                                <tr
                                    key={i}
                                    style={{
                                        borderBottom: '1px solid #f0f0f0',
                                        background: i % 2 === 1 ? '#f8f8f8' : '#ffffff'
                                    }}
                                >
                                    <td style={{ padding: '4px 8px', textAlign: 'center', color: '#777' }}>{u.rank || i + 1}</td>
                                    <td style={{ padding: '4px 8px', fontWeight: 'bold' }}>
                                        <span style={{ color: u.color || '#008000', cursor: 'pointer' }}>
                                            {u.handle}
                                        </span>
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', color: '#444' }}>
                                        {u.rating}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="3" style={{ padding: '12px 8px', textAlign: 'center', color: '#888' }}>
                                    No rated participants yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <div style={{
                    padding: '5px 8px',
                    borderTop: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    background: '#f8f8f8'
                }}>
                    <a href="#countries" style={{ color: '#315682' }}>Countries | Cities | Organizations</a>
                    <a href="#all-ratings" style={{ color: '#315682' }}>View all →</a>
                </div>
            </div>

            {/* Box 4: Top Contributors */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #B9B9B9',
                borderRadius: '5px',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
                <div style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #B9B9B9',
                    fontWeight: 'bold',
                    color: '#3B5998',
                    fontSize: '11px',
                    background: '#ffffff'
                }}>
                    → Top contributors
                </div>

                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '11px',
                    textAlign: 'left'
                }}>
                    <thead>
                        <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
                            <th style={{ padding: '4px 8px', width: '22px', textAlign: 'center', color: '#555' }}>#</th>
                            <th style={{ padding: '4px 8px', color: '#555' }}>User</th>
                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#555' }}>Contrib.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topContributors.length > 0 ? (
                            topContributors.slice(0, 10).map((u, i) => (
                                <tr
                                    key={i}
                                    style={{
                                        borderBottom: '1px solid #f0f0f0',
                                        background: i % 2 === 1 ? '#f8f8f8' : '#ffffff'
                                    }}
                                >
                                    <td style={{ padding: '4px 8px', textAlign: 'center', color: '#777' }}>{u.rank || i + 1}</td>
                                    <td style={{ padding: '4px 8px', fontWeight: 'bold' }}>
                                        <span style={{ color: u.color || '#315682', cursor: 'pointer' }}>
                                            {u.handle}
                                        </span>
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', color: '#444' }}>
                                        {u.contribution}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="3" style={{ padding: '12px 8px', textAlign: 'center', color: '#888' }}>
                                    No contributors yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <div style={{
                    padding: '5px 8px',
                    borderTop: '1px solid #e0e0e0',
                    textAlign: 'right',
                    fontSize: '10px',
                    background: '#f8f8f8'
                }}>
                    <a href="#all-contributors" style={{ color: '#315682' }}>View all →</a>
                </div>
            </div>

            {/* Box 5: Find User */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #B9B9B9',
                borderRadius: '5px',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
                <div style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #B9B9B9',
                    fontWeight: 'bold',
                    color: '#3B5998',
                    fontSize: '11px',
                    background: '#ffffff'
                }}>
                    → Find user
                </div>
                <form onSubmit={handleSearchSubmit} style={{ padding: '10px', margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ color: '#222222', fontWeight: 'bold' }}>Handle:</label>
                        <input
                            type="text"
                            value={searchHandle}
                            onChange={(e) => setSearchHandle(e.target.value)}
                            placeholder=""
                            style={{
                                flex: 1,
                                height: '22px',
                                border: '1px solid #B5B5B5',
                                borderRadius: '3px',
                                padding: '2px 6px',
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                outline: 'none'
                            }}
                        />
                    </div>
                </form>
            </div>
        </aside>
    );
}
