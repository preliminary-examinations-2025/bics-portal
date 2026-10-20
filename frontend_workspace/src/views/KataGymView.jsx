import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import CodeforcesPillFilter from '../components/CodeforcesPillFilter';
import { useAuth } from '../context/AuthContext';

export default function KataGymView() {
    const { candidate: authUser, profile: authProfile } = useAuth();
    const [contests, setContests] = useState([]);
    const [activeVirtualContest, setActiveVirtualContest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);
    const [filterTrack, setFilterTrack] = useState('all');

    const handle = authProfile?.handle || authUser?.username || localStorage.getItem('kata_handle') || '';

    useEffect(() => {
        if (authProfile) setProfile(authProfile);
        if (authUser) setUser(authUser);
    }, [authProfile, authUser]);

    useEffect(() => {
        document.title = 'Gym | Kata | BICS Portal';

        fetch(`/api/kata/gym?handle=${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContests(data.contests || []);
                    if (data.activeVirtualContest) {
                        setActiveVirtualContest(data.activeVirtualContest);
                    }
                } else {
                    setErrorMsg(data.error || 'Failed to load gym contests');
                }
                setLoading(false);
            })
            .catch(err => {
                setErrorMsg('Network error connecting to gym archive');
                setLoading(false);
            });
    }, [handle]);

    const filteredContests = contests.filter(c => {
        if (filterTrack === 'shin') return c.track === 'shin' || c.contestId.startsWith('SHIN');
        if (filterTrack === 'forma') return c.track === 'forma' || c.contestId.startsWith('FORMA');
        return true;
    });

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '20px auto 40px auto', padding: '0 10px', flex: 1, boxSizing: 'border-box' }}>
                {activeVirtualContest && (
                    <div style={{
                        background: '#fffbeb',
                        border: '1px solid #f59e0b',
                        borderRadius: '4px',
                        padding: '12px 18px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '22px', lineHeight: 1 }}>⏱️</span>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#b45309' }}>
                                    Active Virtual Contest: {activeVirtualContest.title || activeVirtualContest.contestId}
                                </div>
                                <div style={{ fontSize: '11px', color: '#78350f', marginTop: '3px' }}>
                                    Your 2-hour virtual round is currently in progress ({Math.ceil((activeVirtualContest.remainingSeconds || 0) / 60)} minutes remaining). Each candidate can only have one active virtual contest at a time across Kata.
                                </div>
                            </div>
                        </div>
                        <Link
                            to={`/kata/contests/${activeVirtualContest.contestId}`}
                            style={{
                                background: '#d97706',
                                color: '#ffffff',
                                padding: '6px 16px',
                                borderRadius: '3px',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}
                        >
                            Resume Active Contest »
                        </Link>
                    </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
                    {/* Left Column: Gym Archive Table */}
                    <div>
                        <div style={{
                            borderBottom: '2px solid #b9b9b9',
                            paddingBottom: '8px',
                            marginBottom: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end'
                        }}>
                            <div>
                                <h1 style={{
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    margin: 0,
                                    color: '#3b88c3',
                                    fontFamily: 'Verdana, sans-serif'
                                }}>
                                    Kata Gym (Virtual Participation)
                                </h1>
                                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                    Archive of concluded contests available for timed virtual practice.
                                </div>
                            </div>

                            {/* Track Filter with Codeforces sliding dark cloud pill */}
                            <CodeforcesPillFilter
                                items={[
                                    { id: 'all', label: 'All' },
                                    { id: 'shin', label: 'KataShin' },
                                    { id: 'forma', label: 'KataForma' }
                                ]}
                                activeId={filterTrack}
                                onChange={(id) => setFilterTrack(id)}
                            />
                        </div>

                        {loading ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#777' }}>
                                Loading gym contests...
                            </div>
                        ) : errorMsg ? (
                            <div style={{
                                padding: '12px',
                                background: '#fdf7f7',
                                border: '1px solid #eed3d7',
                                color: '#b94a48',
                                borderRadius: '4px',
                                fontSize: '12px'
                            }}>
                                {errorMsg}
                            </div>
                        ) : filteredContests.length === 0 ? (
                            <div style={{
                                border: '1px solid #d4d4d4',
                                borderRadius: '4px',
                                padding: '30px',
                                textAlign: 'center',
                                color: '#666',
                                fontSize: '13px',
                                background: '#fafafa'
                            }}>
                                <strong>No concluded contests in the Gym yet.</strong>
                                <div style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
                                    Live contests automatically migrate here once their live 15-hour round concludes.
                                </div>
                                <div style={{ marginTop: '16px' }}>
                                    <Link to="/kata/contests" style={{ color: '#315682', fontWeight: 'bold' }}>
                                        View Upcoming / Running Contests »
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                border: '1px solid #b9b9b9',
                                fontSize: '11px',
                                fontFamily: 'Verdana, sans-serif'
                            }}>
                                <thead>
                                    <tr style={{ background: '#f0f4f8', borderBottom: '2px solid #b9b9b9', height: '36px' }}>
                                        <th style={{ width: '5px', padding: 0 }} />
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 'bold', width: '45%' }}>Contest</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 'bold' }}>Writers</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>Concluded</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>Length</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredContests.map((c, idx) => (
                                        <tr 
                                            key={c.contestId}
                                            style={{
                                                background: idx % 2 === 0 ? '#ffffff' : '#f8f9fa',
                                                borderBottom: '1px solid #e0e0e0',
                                                height: '44px',
                                                verticalAlign: 'middle'
                                            }}
                                        >
                                            {/* Dedicated Left Status Stripe matching crop_left.png */}
                                            <td style={{
                                                width: '5px',
                                                minWidth: '5px',
                                                maxWidth: '5px',
                                                padding: 0,
                                                background: c.userSolvedCount > 0 ? '#c2e59c' : 'transparent',
                                                borderRight: '1px solid #e1e1e1'
                                            }} />

                                            <td style={{ padding: '8px 10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Link 
                                                        to={`/kata/contests/${c.contestId}`} 
                                                        style={{ fontWeight: 'bold', color: '#222222', textDecoration: 'none', fontSize: '12px' }}
                                                    >
                                                        {c.title}
                                                    </Link>
                                                    {c.userSolvedCount > 0 && (
                                                        <span style={{
                                                            background: '#d4edc9',
                                                            color: '#1a591d',
                                                            fontSize: '10px',
                                                            fontWeight: 'bold',
                                                            padding: '1px 6px',
                                                            borderRadius: '3px'
                                                        }}>
                                                            ✓ {c.userSolvedCount}/{c.problemCount} Solved
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ color: '#777', fontSize: '10px', marginTop: '2px' }}>
                                                    {c.contestId} • 5 Problems • {c.totalScore || 1500} pts
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px 10px', color: '#555' }}>
                                                {(c.writers || ['BICS Academic Council']).join(', ')}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#555' }}>
                                                {formatDate(c.endTime)}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#555' }}>
                                                {c.durationHours || 15}:00
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                {activeVirtualContest && activeVirtualContest.contestId?.toUpperCase() === c.contestId?.toUpperCase() ? (
                                                    <Link
                                                        to={`/kata/contests/${c.contestId}`}
                                                        style={{
                                                            display: 'inline-block',
                                                            background: '#e6f4ea',
                                                            color: '#137333',
                                                            border: '1px solid #34a853',
                                                            borderRadius: '3px',
                                                            padding: '3px 8px',
                                                            fontWeight: 'bold',
                                                            fontSize: '11px',
                                                            textDecoration: 'none',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                        }}
                                                    >
                                                        Resume Virtual »
                                                    </Link>
                                                ) : (
                                                    <Link
                                                        to={`/kata/contests/${c.contestId}/virtual-register`}
                                                        style={{
                                                            display: 'inline-block',
                                                            background: '#e9f2fa',
                                                            color: '#2d568c',
                                                            border: '1px solid #b5d1e8',
                                                            borderRadius: '3px',
                                                            padding: '3px 8px',
                                                            fontWeight: 'bold',
                                                            fontSize: '11px',
                                                            textDecoration: 'none'
                                                        }}
                                                    >
                                                        Virtual Participation »
                                                    </Link>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Right Sidebar: Rules & Guidelines */}
                    <div style={{ fontFamily: 'Verdana, sans-serif' }}>
                        {/* What is Gym Card */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            marginBottom: '16px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid #e0e0e0',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                color: '#2d568c'
                            }}>
                                → What is Gym?
                            </div>
                            <div style={{ padding: '10px 12px', fontSize: '11px', lineHeight: '1.6', color: '#444' }}>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <strong>Kata Gym</strong> hosts all concluded contest rounds for self-paced practice and virtual simulation.
                                </p>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    When you participate in a Gym contest, you can test your solutions against real test cases and evaluate your approach.
                                </p>
                                <div style={{
                                    background: '#fff9e6',
                                    border: '1px solid #ffe299',
                                    borderRadius: '3px',
                                    padding: '6px 8px',
                                    fontSize: '10px',
                                    color: '#8a6d3b'
                                }}>
                                    ⚠️ <strong>Notice:</strong> Once a live contest concludes, points are not saved towards your live rank and will be assigned 0. Submissions in Gym are for training only.
                                </div>
                            </div>
                        </div>

                        {/* Season Schedule */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid #e0e0e0',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                color: '#2d568c'
                            }}>
                                → 6-Week Contest Season
                            </div>
                            <div style={{ padding: '10px 12px', fontSize: '11px', color: '#555', lineHeight: '1.5' }}>
                                <div><strong>Saturdays:</strong> KataShin (Algorithms & C++)</div>
                                <div><strong>Sundays:</strong> KataForma (System Design & Code)</div>
                                <div style={{ marginTop: '8px' }}>
                                    <Link to="/kata/contests" style={{ color: '#315682' }}>
                                        Check Live / Upcoming Rounds »
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <KataFooter />
        </div>
    );
}
