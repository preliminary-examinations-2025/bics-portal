import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import KataContestSubNav from '../components/KataContestSubNav';
import CodeforcesPillFilter from '../components/CodeforcesPillFilter';
import { useAuth } from '../context/AuthContext';
import { getRatingTier } from '../utils/kataApi';

export default function KataStandingsView() {
    const { contestId } = useParams();
    const { candidate: user, profile } = useAuth();

    const [contest, setContest] = useState(null);
    const [standings, setStandings] = useState([]);
    const [mode, setMode] = useState('live'); // 'live' | 'virtual' | 'all'
    const [concealedData, setConcealedData] = useState(null);
    const [notStartedData, setNotStartedData] = useState(null);
    const [countdownStr, setCountdownStr] = useState('');
    const [letters, setLetters] = useState(['A', 'B', 'C', 'D', 'E']);
    const [problemPoints, setProblemPoints] = useState({});
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchStandings = () => {
        fetch(`/api/kata/contests/${contestId}/standings?mode=${mode}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContest(data.contest);
                    if (data.notStarted || data.contest?.status === 'scheduled') {
                        setNotStartedData(data);
                        setConcealedData(null);
                        setStandings([]);
                    } else if (data.concealed) {
                        setConcealedData(data);
                        setNotStartedData(null);
                        setStandings([]);
                    } else {
                        setNotStartedData(null);
                        setConcealedData(null);
                        setStandings(data.standings || []);
                    }
                    if (data.letters && data.letters.length > 0) {
                        setLetters(data.letters);
                    }
                    if (data.problemPoints) {
                        setProblemPoints(data.problemPoints);
                    }
                    setErrorMsg('');
                } else {
                    setErrorMsg(data.error || 'Failed to load standings');
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Error fetching standings:', err);
                setErrorMsg('Network error loading standings');
                setLoading(false);
            });
    };

    useEffect(() => {
        document.title = `Standings | ${contestId} | Kata`;
        setLoading(true);
        fetchStandings();
    }, [contestId, mode]);

    // Auto-refresh interval if contest is running and autoRefresh is enabled
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchStandings();
        }, 20000);
        return () => clearInterval(interval);
    }, [autoRefresh, contestId, mode]);

    // Countdown timer for scheduled contest before start
    useEffect(() => {
        if (!contest?.startTime) return;
        const target = new Date(contest.startTime).getTime();
        const updateCountdown = () => {
            const diff = target - Date.now();
            if (diff <= 0) {
                setCountdownStr('00:00:00 (Starting now)');
                return;
            }
            const hours = Math.floor(diff / (1000 * 3600));
            const mins = Math.floor((diff % (1000 * 3600)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);
            setCountdownStr(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
        };
        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    }, [contest?.startTime]);

    const isScheduled = Boolean(notStartedData) || contest?.status === 'scheduled' || (contest?.startTime && new Date() < new Date(contest.startTime));
    const isRunning = contest?.status === 'running';

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222222', fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
            <KataHeader user={user} profile={profile} contestId={contestId} />
            <KataContestSubNav contestId={contestId} isScheduled={isScheduled} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '14px auto 40px auto', padding: '0 10px', flex: 1, boxSizing: 'border-box' }}>
                {/* Contest Title & Meta */}
                <div style={{
                    borderBottom: '2px solid #b9b9b9',
                    paddingBottom: '8px',
                    marginBottom: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: '8px'
                }}>
                    <div>
                        <h1 style={{
                            margin: '0 0 4px 0',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#222222'
                        }}>
                            {contest?.title || contestId} — Standings
                        </h1>
                        <div style={{ fontSize: '11px', color: '#666666' }}>
                            {contest?.track === 'shin' ? 'Algorithmic Track (C++)' : 'Web Engineering Track (HTML/CSS/JS)'} • 15h Round Window
                        </div>
                    </div>

                    {!isScheduled ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', userSelect: 'none' }}>
                                <input 
                                    type="checkbox" 
                                    checked={autoRefresh} 
                                    onChange={(e) => setAutoRefresh(e.target.checked)} 
                                />
                                <span>Auto-refresh (20s)</span>
                            </label>
                            <button
                                onClick={fetchStandings}
                                style={{
                                    background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                    border: '1px solid #767676',
                                    padding: '3px 10px',
                                    borderRadius: '2px',
                                    fontSize: '11px',
                                    color: '#000000',
                                    cursor: 'pointer',
                                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                    boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                }}
                            >
                                Refresh now
                            </button>
                        </div>
                    ) : (
                        <div style={{ fontSize: '11px', color: '#666666' }}>
                            Starts in: <strong style={{ color: '#222222' }}>{countdownStr || '00:00:00'}</strong>
                        </div>
                    )}
                </div>

                {/* Standings Mode Selection Tabs with Codeforces sliding dark cloud pill - only shown when not scheduled */}
                {!isScheduled && (
                    <div style={{
                        marginBottom: '16px',
                        borderBottom: '1px solid #d4d4d4',
                        paddingBottom: '8px'
                    }}>
                        <CodeforcesPillFilter
                            items={[
                                { id: 'live', label: 'Official Live Standings' },
                                { id: 'virtual', label: 'Virtual Participation' },
                                { id: 'all', label: 'Combined Standings' }
                            ]}
                            activeId={mode}
                            onChange={(id) => setMode(id)}
                        />
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#777777', fontSize: '13px' }}>
                        Loading real-time contest standings...
                    </div>
                ) : isScheduled ? (
                    <div style={{
                        border: '1px solid #b9b9b9',
                        borderRadius: '5px',
                        backgroundColor: '#ffffff',
                        padding: '28px 24px',
                        margin: '20px 0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            fontSize: '19px',
                            fontWeight: 'bold',
                            color: '#3b5998',
                            marginBottom: '10px',
                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
                        }}>
                            Contest Has Not Started Yet
                        </div>
                        <p style={{
                            fontSize: '13px',
                            color: '#555555',
                            lineHeight: '1.6',
                            maxWidth: '620px',
                            margin: '0 auto 20px auto'
                        }}>
                            Standings are not available because this contest is scheduled and has not begun. The official live scoreboard will become active once the contest officially starts.
                        </p>

                        <div style={{
                            backgroundColor: '#f8f8f8',
                            border: '1px solid #d0d0d0',
                            borderRadius: '4px',
                            padding: '16px 28px',
                            display: 'inline-block',
                            marginBottom: '22px',
                            minWidth: '280px'
                        }}>
                            <div style={{ fontSize: '11px', color: '#777777', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                Before Contest Starts
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#222222', fontFamily: 'monospace' }}>
                                {countdownStr || '00:00:00'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#666666', marginTop: '6px' }}>
                                Scheduled Start: {contest?.startTime ? new Date(contest.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST' : 'TBA'}
                            </div>
                        </div>

                        <div>
                            <Link
                                to={`/kata/contests/${contestId}`}
                                style={{
                                    display: 'inline-block',
                                    background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                    border: '1px solid #767676',
                                    color: '#000000',
                                    padding: '5px 16px',
                                    borderRadius: '2px',
                                    fontSize: '12px',
                                    fontWeight: 'normal',
                                    textDecoration: 'none',
                                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                    boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                }}
                            >
                                « Back to Contest Overview
                            </Link>
                        </div>
                    </div>
                ) : concealedData ? (
                    <div style={{
                        border: '1px solid #fed7aa',
                        background: '#fffbeb',
                        borderRadius: '6px',
                        padding: '28px 24px',
                        margin: '20px 0',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔒</div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#9a3412', marginBottom: '8px' }}>
                            Standings Concealed
                        </div>
                        <div style={{ fontSize: '12px', color: '#7c2d12', maxWidth: '620px', margin: '0 auto', lineHeight: '1.6' }}>
                            {concealedData.message}
                            {concealedData.releaseTime && (
                                <div style={{ marginTop: '10px', fontWeight: 'bold', color: '#9a3412', fontSize: '13px' }}>
                                    Scheduled Release: {new Date(concealedData.releaseTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} IST ({concealedData.remainingHours}h remaining)
                                </div>
                            )}
                        </div>
                    </div>
                ) : errorMsg ? (
                    <div style={{
                        padding: '16px',
                        background: '#fdf7f7',
                        border: '1px solid #eed3d7',
                        borderRadius: '4px',
                        color: '#b94a48',
                        fontSize: '13px'
                    }}>
                        {errorMsg}
                    </div>
                ) : standings.length === 0 ? (
                    <div style={{
                        border: '1px solid #e1e1e1',
                        borderRadius: '4px',
                        padding: '30px',
                        textAlign: 'center',
                        color: '#666666',
                        background: '#fafafa',
                        fontSize: '13px'
                    }}>
                        No participants or submissions recorded for this round yet.
                    </div>
                ) : (
                    <div style={{
                        border: '1px solid #d4d4d4',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '12px'
                        }}>
                            <thead>
                                <tr style={{
                                    background: '#f5f5f5',
                                    borderBottom: '1px solid #d4d4d4',
                                    height: '38px',
                                    textAlign: 'center'
                                }}>
                                    <th style={{ width: '5px', minWidth: '5px', maxWidth: '5px', padding: 0 }} />
                                    <th style={{ width: '45px', padding: '6px 8px', fontWeight: 'bold' }}>#</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 'bold' }}>Who</th>
                                    <th style={{ width: '60px', padding: '6px 8px', fontWeight: 'bold' }}>=</th>
                                    <th style={{ width: '70px', padding: '6px 8px', fontWeight: 'bold' }}>Penalty</th>
                                    {letters.map(letter => (
                                        <th 
                                            key={letter}
                                            style={{
                                                width: '65px',
                                                padding: '6px 6px',
                                                fontWeight: 'bold',
                                                borderLeft: '1px solid #e1e1e1'
                                            }}
                                            title={`Problem ${letter} (${problemPoints[letter] || 100} pts)`}
                                        >
                                            <Link 
                                                to={`/kata/contests/${contestId}/problem/${letter}`}
                                                style={{ color: '#315682', textDecoration: 'none' }}
                                            >
                                                {letter}
                                            </Link>
                                            <div style={{ fontSize: '9px', color: '#888888', fontWeight: 'normal' }}>
                                                {problemPoints[letter] || 100}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {standings.map((row, idx) => {
                                    const isEven = idx % 2 === 0;
                                    const isSelf = (user?.username && row.handle?.toLowerCase() === user.username.toLowerCase()) ||
                                                   (profile?.handle && row.handle?.toLowerCase() === profile.handle.toLowerCase());
                                    const rankColor = row.rankColor || '#008000';
                                    const hasAnySolved = row.solvedCount > 0;

                                    return (
                                        <tr
                                            key={row.candidateId || row.handle}
                                            style={{
                                                background: isSelf ? '#eef7ff' : (isEven ? '#ffffff' : '#f9f9f9'),
                                                borderBottom: '1px solid #e7e7e7',
                                                height: '44px',
                                                verticalAlign: 'middle'
                                            }}
                                        >
                                            {/* Codeforces 5px left status stripe */}
                                            <td style={{
                                                width: '5px',
                                                minWidth: '5px',
                                                maxWidth: '5px',
                                                padding: 0,
                                                background: hasAnySolved ? '#c2e59c' : 'transparent',
                                                borderRight: '1px solid #e1e1e1'
                                            }} />

                                            {/* Rank */}
                                            <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: '#555555' }}>
                                                {row.rank}
                                            </td>

                                            {/* Who (Competitor Handle) */}
                                            <td style={{ padding: '6px 12px', textAlign: 'left' }}>
                                                <Link
                                                    to={`/kata/profile/${encodeURIComponent(row.handle)}`}
                                                    style={{
                                                        color: rankColor,
                                                        fontWeight: 'bold',
                                                        textDecoration: 'none',
                                                        fontSize: '12px'
                                                    }}
                                                    title={`${row.handle} (${row.rankTitle} • ${row.rating})`}
                                                >
                                                    {row.handle}
                                                </Link>
                                                {row.isVirtual && (
                                                    <span style={{
                                                        marginLeft: '6px',
                                                        fontSize: '10px',
                                                        background: '#e0f2fe',
                                                        color: '#0369a1',
                                                        border: '1px solid #bae6fd',
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        #virtual
                                                    </span>
                                                )}
                                                {isSelf && (
                                                    <span style={{
                                                        marginLeft: '6px',
                                                        fontSize: '10px',
                                                        color: '#3b88c3',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        (you)
                                                    </span>
                                                )}
                                                <div style={{ fontSize: '10px', color: '#888888' }}>
                                                    {row.rankTitle} • {row.rating}
                                                </div>
                                            </td>

                                            {/* Total Points */}
                                            <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: '#008000', fontSize: '13px' }}>
                                                {row.totalPoints}
                                            </td>

                                            {/* Penalty (minutes) */}
                                            <td style={{ padding: '6px 8px', textAlign: 'center', color: '#666666', fontSize: '11px' }}>
                                                {row.totalPenalty > 0 ? `${row.totalPenalty}` : '0'}
                                            </td>

                                            {/* Problem Matrix Columns A-E */}
                                            {letters.map(letter => {
                                                const res = row.problemResults?.[letter];
                                                const isSolved = res?.solved;
                                                const hasDisplay = !!res?.display;

                                                return (
                                                    <td
                                                        key={letter}
                                                        style={{
                                                            padding: '6px 6px',
                                                            textAlign: 'center',
                                                            borderLeft: '1px solid #e1e1e1',
                                                            background: isSolved ? '#e0f7e9' : (hasDisplay ? '#fee2e2' : 'transparent')
                                                        }}
                                                    >
                                                        {isSolved ? (
                                                            <div>
                                                                <span style={{ color: '#166534', fontWeight: 'bold', fontSize: '13px' }}>
                                                                    {res.display || '+'}
                                                                </span>
                                                                {res.penalty > 0 && (
                                                                    <div style={{ fontSize: '9px', color: '#15803d' }}>
                                                                        {res.penalty}m
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : hasDisplay ? (
                                                            <span style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '12px' }}>
                                                                {res.display}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#cccccc' }}>—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
            <KataFooter />
        </div>
    );
}
