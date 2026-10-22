import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import { useAuth } from '../context/AuthContext';

export default function KataContestsListView() {
    const navigate = useNavigate();
    const { candidate: authUser, profile: authProfile } = useAuth();
    const [contestsData, setContestsData] = useState({ currentAndUpcoming: [], past: [] });
    const [loading, setLoading] = useState(true);
    const [enteringContestId, setEnteringContestId] = useState(null);
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);

    const handle = authProfile?.handle || authUser?.username || localStorage.getItem('kata_handle') || '';

    const handleEnterContest = async (cid) => {
        setEnteringContestId(cid);
        try {
            await fetch(`/api/kata/contests/${cid}/start-timer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ handle })
            });
        } catch (err) {
            console.error('Failed to start timer:', err);
        } finally {
            navigate(`/kata/contests/${cid}`);
        }
    };

    useEffect(() => {
        if (authProfile) setProfile(authProfile);
        if (authUser) setUser(authUser);
    }, [authProfile, authUser]);

    useEffect(() => {
        document.title = 'Contests | Kata | BICS Portal';

        // Fetch contests list
        fetch(`/api/kata/contests?handle=${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContestsData({
                        currentAndUpcoming: data.currentAndUpcoming || [],
                        past: data.past || []
                    });
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Error fetching contests:', err);
                setLoading(false);
            });
    }, [handle]);

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }) + ' IST';
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '18px auto', padding: '0 10px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
                    {/* Left Column: Contests Tables */}
                    <div>
                        {/* Current or Upcoming Contests */}
                        <div style={{ marginBottom: '28px' }}>
                            <div style={{
                                borderBottom: '2px solid #b9b9b9',
                                paddingBottom: '4px',
                                marginBottom: '10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-end'
                            }}>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '15px',
                                    fontWeight: 'bold',
                                    color: '#3b88c3',
                                    fontFamily: 'Verdana, sans-serif'
                                }}>
                                    Current or upcoming contests
                                </h2>
                            </div>

                            {loading ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#777' }}>
                                    Loading contests from database...
                                </div>
                            ) : contestsData.currentAndUpcoming.length === 0 ? (
                                <div style={{
                                    border: '1px solid #e1e1e1',
                                    borderRadius: '4px',
                                    padding: '24px',
                                    textAlign: 'center',
                                    color: '#666',
                                    background: '#fafafa'
                                }}>
                                    No contests currently scheduled. Check back soon for upcoming weekend rounds.
                                </div>
                            ) : (
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '12px',
                                    border: '1px solid #d4d4d4'
                                }}>
                                    <thead>
                                        <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #d4d4d4', textAlign: 'left' }}>
                                            <th style={{ padding: '7px 10px', fontWeight: 'bold' }}>Name</th>
                                            <th style={{ padding: '7px 8px', fontWeight: 'bold' }}>Writers</th>
                                            <th style={{ padding: '7px 8px', fontWeight: 'bold' }}>Start</th>
                                            <th style={{ padding: '7px 8px', fontWeight: 'bold' }}>Length</th>
                                            <th style={{ padding: '7px 8px', fontWeight: 'bold', textAlign: 'center' }}>Registration</th>
                                            <th style={{ padding: '7px 10px', fontWeight: 'bold', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contestsData.currentAndUpcoming.map((c, idx) => {
                                            const isEven = idx % 2 === 0;
                                            const isLive = c.isLive || c.status === 'running' || (new Date() >= new Date(c.startTime) && new Date() <= new Date(c.endTime));
                                            const hasEnded = c.hasEnded || c.status === 'ended' || (new Date() > new Date(c.endTime));
                                            return (
                                                <tr 
                                                    key={c.contestId}
                                                    style={{ 
                                                        background: isEven ? '#ffffff' : '#f9f9f9',
                                                        borderBottom: '1px solid #e7e7e7',
                                                        height: '44px',
                                                        verticalAlign: 'middle'
                                                    }}
                                                >
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <Link 
                                                            to={`/kata/contests/${c.contestId}`}
                                                            style={{ fontWeight: 'bold', color: '#222222', textDecoration: 'none' }}
                                                        >
                                                            {c.title}
                                                        </Link>
                                                    </td>
                                                    <td style={{ padding: '8px 8px', color: '#555' }}>
                                                        {(c.writers || []).join(', ')}
                                                    </td>
                                                    <td style={{ padding: '8px 8px', color: '#444' }}>
                                                        {hasEnded ? (
                                                            c.isStandingsReleased ? (
                                                                <Link 
                                                                    to={`/kata/contests/${c.contestId}/standings`}
                                                                    style={{ color: '#008000', fontWeight: 'bold', textDecoration: 'none' }}
                                                                >
                                                                    Final standings
                                                                </Link>
                                                            ) : (
                                                                <Link 
                                                                    to={`/kata/contests/${c.contestId}/standings`}
                                                                    style={{ color: '#222222', fontWeight: 'bold', textDecoration: 'none' }}
                                                                    title="Contest ended. Official final standings and ratings will be released 36 hours after contest ends."
                                                                >
                                                                    Contest Ended
                                                                </Link>
                                                            )
                                                        ) : (
                                                            formatDateTime(c.startTime)
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '8px 8px' }}>
                                                        {c.durationHours}:00
                                                    </td>
                                                    <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                        {hasEnded ? (
                                                            <span style={{ color: '#777777', fontSize: '11px' }}>
                                                                {c.isRegistered ? '✓ Registered' : 'Registration closed'}
                                                            </span>
                                                        ) : c.isRegistered ? (
                                                            <span style={{ color: '#008000', fontWeight: 'bold', fontSize: '11px' }}>
                                                                ✓ Registered
                                                            </span>
                                                        ) : (
                                                            <Link 
                                                                to={`/kata/contests/${c.contestId}/register`}
                                                                style={{ color: '#315682', fontSize: '11px' }}
                                                            >
                                                                Register »
                                                            </Link>
                                                        )}
                                                        <div style={{ fontSize: '10px', color: '#888' }}>
                                                            {c.registeredCount} registered
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                        {hasEnded ? (
                                                            <Link
                                                                to={`/kata/contests/${c.contestId}`}
                                                                style={{
                                                                    display: 'inline-block',
                                                                    background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                                    color: '#000000',
                                                                    border: '1px solid #767676',
                                                                    padding: '3px 12px',
                                                                    borderRadius: '2px',
                                                                    fontWeight: 'normal',
                                                                    fontSize: '11px',
                                                                    textDecoration: 'none',
                                                                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                                    boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                                }}
                                                            >
                                                                Enter »
                                                            </Link>
                                                        ) : c.isRegistered ? (
                                                            isLive ? (
                                                                <button
                                                                    onClick={() => handleEnterContest(c.contestId)}
                                                                    disabled={enteringContestId === c.contestId}
                                                                    style={{
                                                                        display: 'inline-block',
                                                                        background: enteringContestId === c.contestId
                                                                            ? '#f4f4f4'
                                                                            : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                                        color: enteringContestId === c.contestId ? '#888888' : '#000000',
                                                                        border: enteringContestId === c.contestId ? '1px solid #cccccc' : '1px solid #767676',
                                                                        padding: '3px 12px',
                                                                        borderRadius: '2px',
                                                                        fontWeight: 'normal',
                                                                        fontSize: '11px',
                                                                        cursor: enteringContestId === c.contestId ? 'not-allowed' : 'pointer',
                                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                                        boxShadow: enteringContestId === c.contestId ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                                    }}
                                                                >
                                                                    {enteringContestId === c.contestId ? 'Entering...' : 'Enter »'}
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    disabled
                                                                    style={{
                                                                        display: 'inline-block',
                                                                        background: '#e2e8f0',
                                                                        border: '1px solid #cbd5e1',
                                                                        color: '#64748b',
                                                                        padding: '3px 10px',
                                                                        borderRadius: '3px',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '11px',
                                                                        cursor: 'not-allowed'
                                                                    }}
                                                                    title="Contest has not started yet. Enter unlocks at start time."
                                                                >
                                                                    Enter (Locked)
                                                                </button>
                                                            )
                                                        ) : (
                                                            <Link
                                                                to={`/kata/contests/${c.contestId}/register`}
                                                                style={{
                                                                    display: 'inline-block',
                                                                    background: '#f0f0f0',
                                                                    border: '1px solid #c0c0c0',
                                                                    color: '#333333',
                                                                    padding: '3px 10px',
                                                                    borderRadius: '3px',
                                                                    fontSize: '11px',
                                                                    textDecoration: 'none'
                                                                }}
                                                            >
                                                                Register »
                                                            </Link>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Past Contests */}
                        <div>
                            <div style={{
                                borderBottom: '2px solid #b9b9b9',
                                paddingBottom: '4px',
                                marginBottom: '10px'
                            }}>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '15px',
                                    fontWeight: 'bold',
                                    color: '#3b88c3',
                                    fontFamily: 'Verdana, sans-serif'
                                }}>
                                    Past contests
                                </h2>
                            </div>

                            {contestsData.past.length === 0 ? (
                                <div style={{
                                    border: '1px solid #e1e1e1',
                                    borderRadius: '4px',
                                    padding: '18px',
                                    textAlign: 'center',
                                    color: '#777',
                                    background: '#fafafa',
                                    fontSize: '11px'
                                }}>
                                    No past contests logged in database.
                                </div>
                            ) : (
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '12px',
                                    border: '1px solid #d4d4d4'
                                }}>
                                    <thead>
                                        <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #d4d4d4', textAlign: 'left' }}>
                                            <th style={{ padding: '6px 10px', fontWeight: 'bold' }}>Name</th>
                                            <th style={{ padding: '6px 8px', fontWeight: 'bold' }}>Writers</th>
                                            <th style={{ padding: '6px 8px', fontWeight: 'bold' }}>Start</th>
                                            <th style={{ padding: '6px 8px', fontWeight: 'bold' }}>Length</th>
                                            <th style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contestsData.past.map((c, idx) => (
                                            <tr key={c.contestId} style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #e7e7e7' }}>
                                                <td style={{ padding: '7px 10px' }}>
                                                    <Link to={`/kata/contests/${c.contestId}`} style={{ color: '#222222', fontWeight: 'bold', textDecoration: 'none' }}>
                                                        {c.title}
                                                    </Link>
                                                </td>
                                                <td style={{ padding: '7px 8px', color: '#555' }}>
                                                    {(c.writers || []).join(', ')}
                                                </td>
                                                <td style={{ padding: '7px 8px', color: '#444' }}>
                                                    {c.isStandingsReleased ? (
                                                        <Link 
                                                            to={`/kata/contests/${c.contestId}/standings`}
                                                            style={{ color: '#008000', fontWeight: 'bold', textDecoration: 'none' }}
                                                        >
                                                            Final standings
                                                        </Link>
                                                    ) : (
                                                        <Link 
                                                            to={`/kata/contests/${c.contestId}/standings`}
                                                            style={{ color: '#222222', fontWeight: 'bold', textDecoration: 'none' }}
                                                            title="Contest ended. Official final standings and ratings will be released 36 hours after contest ends."
                                                        >
                                                            Contest Ended
                                                        </Link>
                                                    )}
                                                    <div style={{ fontSize: '10px', color: '#888888', marginTop: '2px' }}>
                                                        {formatDateTime(c.startTime)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '7px 8px' }}>
                                                    {c.durationHours}:00
                                                </td>
                                                <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <Link 
                                                        to={`/kata/contests/${c.contestId}/standings`}
                                                        style={{ 
                                                            color: '#315682', 
                                                            fontSize: '11px', 
                                                            textDecoration: 'none', 
                                                            marginRight: '10px',
                                                            fontWeight: '500' 
                                                        }}
                                                    >
                                                        Standings »
                                                    </Link>
                                                    <Link
                                                        to={`/kata/contests/${c.contestId}`}
                                                        style={{
                                                            display: 'inline-block',
                                                            background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                            color: '#000000',
                                                            border: '1px solid #767676',
                                                            padding: '3px 12px',
                                                            borderRadius: '2px',
                                                            fontWeight: 'normal',
                                                            fontSize: '11px',
                                                            textDecoration: 'none',
                                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                            boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                        }}
                                                    >
                                                        Enter »
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Right Sidebar */}
                    <div>
                        {/* Weekly Track Cadence Box */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            marginBottom: '16px',
                            background: '#ffffff',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                background: '#f0f4f8',
                                padding: '6px 10px',
                                borderBottom: '1px solid #b9b9b9',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                color: '#333'
                            }}>
                                Contest Schedule & Rules
                            </div>
                            <div style={{ padding: '10px 12px', fontSize: '11px', lineHeight: '1.6' }}>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <strong style={{ color: '#008000' }}>KataShin (Saturdays):</strong><br />
                                    Algorithmic contests in C++. 5 problems (A-E), scores 100-500. Runs 15 hours from 09:00 to 00:00.
                                </p>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <strong style={{ color: '#3b88c3' }}>KataForma (Sundays):</strong><br />
                                    Frontend & Logic contests. 5 problems (A-E), scores 100-500. Runs 15 hours from 09:00 to 00:00.
                                </p>
                                <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />
                                <div style={{ color: '#666', fontSize: '10px' }}>
                                    Each contest is worth <strong>1500 points</strong>.
                                </div>
                            </div>
                        </div>

                        {/* Point Distribution Card */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                background: '#f0f4f8',
                                padding: '6px 10px',
                                borderBottom: '1px solid #b9b9b9',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                color: '#333'
                            }}>
                                Point Values
                            </div>
                            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>Problem A</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#008000' }}>100 pts</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>Problem B</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#008000' }}>200 pts</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>Problem C</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#008000' }}>300 pts</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>Problem D</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#008000' }}>400 pts</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>Problem E</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#008000' }}>500 pts</td>
                                    </tr>
                                    <tr style={{ background: '#fcfcfc', fontWeight: 'bold' }}>
                                        <td style={{ padding: '6px 10px' }}>Total</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#3b88c3' }}>1500 pts</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
            <KataFooter />
        </div>
    );
}
