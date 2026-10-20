import React from 'react';

function getRankInfo(rating = 1200) {
    if (rating < 1200) return { rank: 'Newbie', color: '#808080' };
    if (rating < 1400) return { rank: 'Apprentice', color: '#008000' };
    if (rating < 1600) return { rank: 'Specialist', color: '#03a89e' };
    if (rating < 1900) return { rank: 'Expert', color: '#0000ff' };
    if (rating < 2200) return { rank: 'Candidate Master', color: '#aa00aa' };
    if (rating < 2400) return { rank: 'Master', color: '#ff8c00' };
    return { rank: 'Grandmaster', color: '#ff0000' };
}

export default function KataProfileCard({ profile, candidate }) {
    const handle = profile?.handle || candidate?.username || 'siyam-bubere';
    const email = candidate?.email || localStorage.getItem('kata_email') || 'buberesiyam@gmail.com';
    const shinRating = profile?.shinRating || 1092;
    const shinMaxRating = profile?.shinMaxRating || 1092;

    const currentRankInfo = getRankInfo(shinRating);
    const maxRankInfo = getRankInfo(shinMaxRating);

    const shinRank = profile?.shinRank || currentRankInfo.rank;
    const shinRankColor = profile?.shinRankColor || currentRankInfo.color;
    const shinMaxRank = profile?.shinMaxRank || maxRankInfo.rank;
    const shinMaxRankColor = maxRankInfo.color;

    // Relative registration text (e.g. "12 months ago")
    const getRegisteredText = () => {
        if (!profile?.registeredAt) return '12 months ago';
        const months = Math.max(1, Math.floor((Date.now() - new Date(profile.registeredAt).getTime()) / (1000 * 60 * 60 * 24 * 30)));
        return `${months} months ago`;
    };

    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #b9b9b9',
            borderRadius: '5px',
            padding: '18px 22px',
            marginBottom: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Main Codeforces Profile Grid */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '24px'
            }}>
                {/* Left Profile Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Rank title */}
                    <div style={{
                        color: shinRankColor,
                        fontSize: '13px',
                        fontWeight: 'bold',
                        marginBottom: '2px'
                    }}>
                        {shinRank}
                    </div>

                    {/* Handle */}
                    <h1 style={{
                        margin: '0 0 12px 0',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: shinRankColor,
                        letterSpacing: '-0.2px'
                    }}>
                        {handle}
                    </h1>

                    {/* Details rows */}
                    <div style={{
                        fontSize: '12px',
                        lineHeight: '1.65',
                        color: '#222222'
                    }}>
                        {/* Rating row with icon */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3182ce" strokeWidth="2.5">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                            <span>
                                <strong>Contest rating:</strong>{' '}
                                <span style={{ color: shinRankColor, fontWeight: 'bold' }}>{shinRating}</span>{' '}
                                <span style={{ color: '#777777', fontSize: '11px' }}>
                                    (max. <span style={{ color: shinMaxRankColor }}>{shinMaxRank.toLowerCase()}</span>, <span style={{ color: shinMaxRankColor, fontWeight: 'bold' }}>{shinMaxRating}</span>)
                                </span>
                            </span>
                        </div>

                        {/* Contribution */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '14px', color: '#3182ce', lineHeight: 1 }}>★</span>
                            <span><strong>Contribution:</strong> {profile?.contribution || 0}</span>
                        </div>

                        {/* Friend count */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '14px', color: '#e3a008', lineHeight: 1 }}>★</span>
                            <span>Friend of: 0 users</span>
                        </div>

                        {/* My friends link */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '14px', color: '#e3a008', lineHeight: 1 }}>★</span>
                            <a href="#friends" style={{ color: '#0000ee', textDecoration: 'underline' }}>My friends</a>
                        </div>

                        {/* Change settings */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                            <a href="#settings" style={{ color: '#0000ee', textDecoration: 'underline' }}>Change settings</a>
                        </div>

                        {/* Email */}
                        {email && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth="2">
                                    <rect width="20" height="16" x="2" y="4" rx="2" />
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                </svg>
                                <span>
                                    {email} <span style={{ color: '#777777', fontSize: '11px' }}>(not visible)</span>
                                </span>
                            </div>
                        )}

                        {/* Spacing before visit / registered */}
                        <div style={{ marginTop: '14px', marginBottom: '3px' }}>
                            <span>Last visit: </span>
                            <strong style={{ color: '#008000' }}>online now</strong>
                        </div>

                        <div style={{ marginBottom: '3px' }}>
                            <span>Registered: </span>
                            <span style={{ color: '#555555' }}>
                                {getRegisteredText()}
                            </span>
                        </div>

                        {/* Spacing before blog / comments */}
                        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#d97706" stroke="#b45309" strokeWidth="1">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                </svg>
                                <div>
                                    <a href="#blog" style={{ color: '#0000ee', textDecoration: 'underline' }}>Start your own blog</a>,{' '}
                                    <a href="#comments" style={{ color: '#0000ee', textDecoration: 'underline' }}>Comments</a>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#d97706" stroke="#b45309" strokeWidth="1">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                </svg>
                                <a href="#comments" style={{ color: '#0000ee', textDecoration: 'underline' }}>Comments</a>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth="2">
                                    <rect width="20" height="16" x="2" y="4" rx="2" />
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                </svg>
                                <a href="#talks" style={{ color: '#0000ee', textDecoration: 'underline' }}>View my talks</a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Codeforces Glossy 3D Avatar Box matching Img Ref 1 */}
                <div style={{
                    width: '210px',
                    minHeight: '190px',
                    border: '1px solid #b9b9b9',
                    borderRadius: '0px',
                    background: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px 10px 12px 10px',
                    boxSizing: 'border-box',
                    flexShrink: 0
                }}>
                    {/* Authentic Codeforces 3D Glossy Silhouette Avatar SVG */}
                    <svg width="106" height="116" viewBox="0 0 100 110">
                        <defs>
                            <radialGradient id="cfHeadGrad" cx="38%" cy="32%" r="65%">
                                <stop offset="0%" stopColor="#ffffff" />
                                <stop offset="35%" stopColor="#dce5ef" />
                                <stop offset="70%" stopColor="#a7bbce" />
                                <stop offset="100%" stopColor="#8399af" />
                            </radialGradient>
                            <radialGradient id="cfBodyGrad" cx="48%" cy="28%" r="72%">
                                <stop offset="0%" stopColor="#ffffff" />
                                <stop offset="40%" stopColor="#d5e1ee" />
                                <stop offset="80%" stopColor="#9eb2c8" />
                                <stop offset="100%" stopColor="#7c92aa" />
                            </radialGradient>
                        </defs>
                        <circle cx="50" cy="38" r="23" fill="url(#cfHeadGrad)" stroke="#748c9f" strokeWidth="0.6" />
                        <path d="M 14 104 C 16 75, 30 66, 50 66 C 70 66, 84 75, 86 104 Z" fill="url(#cfBodyGrad)" stroke="#748c9f" strokeWidth="0.6" />
                    </svg>

                    {/* Change photo link INSIDE the avatar box at the bottom */}
                    <a href="#change-photo" style={{
                        marginTop: '14px',
                        fontSize: '11px',
                        color: '#0000ee',
                        textDecoration: 'underline'
                    }}>
                        Change photo
                    </a>
                </div>
            </div>
        </div>
    );
}
