import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import KataContestSubNav from '../components/KataContestSubNav';
import CodeforcesActionCell from '../components/CodeforcesActionCell';
import { useAuth } from '../context/AuthContext';

export default function KataContestDashboardView() {
    const { contestId } = useParams();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const [contest, setContest] = useState(null);
    const [candidateTimer, setCandidateTimer] = useState(null);
    const [candSecondsLeft, setCandSecondsLeft] = useState(null);
    const [startingTimer, setStartingTimer] = useState(false);
    const [activeVirtualContest, setActiveVirtualContest] = useState(null);
    const [timerErrorMsg, setTimerErrorMsg] = useState('');
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);
    const [timeLeftStr, setTimeLeftStr] = useState('');

    const handle = authProfile?.handle || authUser?.username || localStorage.getItem('kata_handle') || '';

    useEffect(() => {
        if (authProfile) setProfile(authProfile);
        if (authUser) setUser(authUser);
    }, [authProfile, authUser]);

    const formatTimer = (totalSeconds) => {
        if (totalSeconds === null || totalSeconds === undefined) return '--:--:--';
        const s = Math.max(0, Math.floor(totalSeconds));
        const hours = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    useEffect(() => {
        document.title = `${contestId} - Problems | Kata | BICS Portal`;

        fetch(`/api/kata/contests/${contestId}?handle=${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContest(data.contest);
                    if (data.candidateTimer) {
                        setCandidateTimer(data.candidateTimer);
                        setCandSecondsLeft(data.candidateTimer.remainingSeconds);
                    }
                    if (data.activeVirtualContest) {
                        setActiveVirtualContest(data.activeVirtualContest);
                    }
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Error fetching contest:', err);
                setLoading(false);
            });
    }, [contestId, handle]);

    // Live contest-wide countdown timer calculation
    useEffect(() => {
        if (!contest) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const start = new Date(contest.startTime).getTime();
            const end = new Date(contest.endTime).getTime();

            if (now < start) {
                const diff = start - now;
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeftStr(`Before contest starts: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
            } else if (now >= start && now <= end) {
                const diff = end - now;
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeftStr(`Before contest ends: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
            } else {
                setTimeLeftStr('Contest has ended');
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [contest]);

    // Candidate 2-hour window ticker (absolute wall-clock calculation to prevent timer drift)
    useEffect(() => {
        if (!candidateTimer?.isStarted) return;
        const targetExpiry = candidateTimer.expiresAt
            ? new Date(candidateTimer.expiresAt).getTime()
            : (Date.now() + ((candidateTimer.remainingSeconds ?? candSecondsLeft ?? 0) * 1000));

        const updateTimer = () => {
            const remaining = Math.max(0, Math.floor((targetExpiry - Date.now()) / 1000));
            setCandSecondsLeft(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [candidateTimer?.isStarted, candidateTimer?.expiresAt]);

    const handleStartTimer = async () => {
        setStartingTimer(true);
        setTimerErrorMsg('');
        try {
            const res = await fetch(`/api/kata/contests/${contestId}/start-timer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ handle: handle || user?.username })
            });
            const data = await res.json();
            if (data.success && data.candidateTimer) {
                setCandidateTimer(data.candidateTimer);
                setCandSecondsLeft(data.candidateTimer.remainingSeconds);
                setTimerErrorMsg('');
            } else {
                if (data.activeVirtualContest) {
                    setActiveVirtualContest(data.activeVirtualContest);
                }
                setTimerErrorMsg(data.error || 'Failed to start contest timer');
            }
        } catch (err) {
            console.error('Error starting candidate contest timer:', err);
            setTimerErrorMsg('Network failure starting contest timer');
        } finally {
            setStartingTimer(false);
        }
    };

    const isScheduled = contest ? (!contest.isLive && !contest.hasEnded) : false;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} contestId={contestId} />
            <KataContestSubNav contestId={contestId} isScheduled={isScheduled} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '0 10px 40px 10px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
                    {/* Main Left Column: Problems Table */}
                    <div>
                        {loading ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#777' }}>
                                Loading contest problems...
                            </div>
                        ) : !contest ? (
                            <div style={{ padding: '20px', color: '#d9534f' }}>
                                Contest not found.
                            </div>
                        ) : (
                            <div>
                                {timerErrorMsg && (
                                    <div style={{
                                        background: '#fef2f2',
                                        border: '1px solid #fecaca',
                                        borderRadius: '4px',
                                        padding: '10px 14px',
                                        marginBottom: '16px',
                                        fontSize: '12px',
                                        color: '#dc2626'
                                    }}>
                                        ⚠️ {timerErrorMsg}
                                    </div>
                                )}



                                {/* Registration banner if not registered */}
                                {!contest.isRegistered && !contest.hasEnded && (
                                    <div style={{
                                        border: '1px solid #ffcc66',
                                        background: '#fff8e7',
                                        padding: '10px 16px',
                                        borderRadius: '4px',
                                        marginBottom: '16px',
                                        fontSize: '12px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span>You are not registered for this contest yet.</span>
                                        <Link 
                                            to={`/kata/contests/${contestId}/register`}
                                            style={{
                                                background: '#3b88c3',
                                                color: '#ffffff',
                                                padding: '4px 12px',
                                                borderRadius: '3px',
                                                fontWeight: 'bold',
                                                fontSize: '11px',
                                                textDecoration: 'none'
                                            }}
                                        >
                                            Register »
                                        </Link>
                                    </div>
                                )}

                                {/* Enter Contest Banner if registered and live but not entered yet */}
                                {contest.isLive && contest.isRegistered && (!candidateTimer?.isStarted) && (
                                    <div style={{
                                        background: '#ecfdf5',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: '4px',
                                        padding: '12px 16px',
                                        marginBottom: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#065f46' }}>
                                                Ready to begin your contest?
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#047857' }}>
                                                Click Enter Contest to begin your individual 2-hour timer and reveal problem statements.
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleStartTimer}
                                            disabled={startingTimer}
                                            style={{
                                                background: startingTimer
                                                    ? '#f4f4f4'
                                                    : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                color: startingTimer ? '#888888' : '#000000',
                                                border: startingTimer ? '1px solid #cccccc' : '1px solid #767676',
                                                borderRadius: '2px',
                                                padding: '4px 16px',
                                                fontWeight: 'normal',
                                                fontSize: '12px',
                                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                cursor: startingTimer ? 'not-allowed' : 'pointer',
                                                boxShadow: startingTimer ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                            }}
                                        >
                                            {startingTimer ? 'Starting Timer...' : 'Enter Contest »'}
                                        </button>
                                    </div>
                                )}

                                {/* Contest Heading */}
                                <div style={{
                                    borderBottom: '2px solid #b9b9b9',
                                    paddingBottom: '4px',
                                    marginBottom: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline'
                                }}>
                                    <h1 style={{
                                        fontSize: '16px',
                                        margin: 0,
                                        fontWeight: 'bold',
                                        color: '#222222',
                                        fontFamily: 'Verdana, sans-serif'
                                    }}>
                                        {contest.title}
                                    </h1>
                                    <span style={{ fontSize: '11px', color: '#777' }}>
                                        Total Score: {contest.totalScore} pts
                                    </span>
                                </div>

                                {/* Problems Table */}
                                {(() => {
                                    const isContestForma = contest?.track === 'forma' || contest?.contestId?.toUpperCase().includes('FORMA') || contestId?.toUpperCase().includes('FORMA');
                                    return (
                                        <table style={{
                                            width: '100%',
                                            borderCollapse: 'collapse',
                                            fontSize: '12px',
                                            border: '1px solid #d4d4d4'
                                        }}>
                                            <thead>
                                                <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #d4d4d4', textAlign: 'left', height: '36px' }}>
                                                    <th style={{ width: '5px', padding: 0 }} />
                                                    <th style={{ padding: '8px 10px', width: '45px', fontWeight: 'bold' }}>#</th>
                                                    <th style={{ padding: '8px 10px', fontWeight: 'bold' }}>Name</th>
                                                    <th style={{ padding: '8px 10px', width: '60px', fontWeight: 'bold', textAlign: 'center' }}>⚡</th>
                                                    <th style={{ padding: '8px 10px', width: '70px', fontWeight: 'bold', textAlign: 'center' }}>Score</th>
                                                    {isContestForma && (
                                                        <th style={{ padding: '8px 10px', width: '105px', fontWeight: 'bold', textAlign: 'center' }}>Score Obtained</th>
                                                    )}
                                                    <th style={{ padding: '8px 10px', width: '60px', fontWeight: 'bold', textAlign: 'center' }}>Solved</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(contest.problems || []).map((p, idx) => {
                                                    const isEven = idx % 2 === 0;
                                                    const isForma = isContestForma;
                                                    const isFormaEvaluated = isForma && p.isEvaluated;

                                            let stripeBg = 'transparent';
                                            let rowBg = isEven ? '#ffffff' : '#f9f9f9';
                                            let scoreColor = '#333333'; // Default neutral color when not evaluated

                                            if (isForma) {
                                                if (isFormaEvaluated) {
                                                    if (p.scoreTier === 'green') {
                                                        stripeBg = '#16a34a';
                                                        rowBg = '#f0fdf4';
                                                        scoreColor = '#008000';
                                                    } else if (p.scoreTier === 'yellow') {
                                                        stripeBg = '#eab308';
                                                        rowBg = '#fefce8';
                                                        scoreColor = '#ca8a04';
                                                    } else if (p.scoreTier === 'red') {
                                                        stripeBg = '#dc2626';
                                                        rowBg = '#fef2f2';
                                                        scoreColor = '#dc2626';
                                                    }
                                                }
                                            } else {
                                                if (p.isSolved) {
                                                    stripeBg = '#c2e59c';
                                                    rowBg = '#f4fbf4';
                                                    scoreColor = '#008000';
                                                }
                                            }

                                            const canClick = (contest.isLive && candidateTimer?.isStarted) || contest.hasEnded;
                                            const fourHoursPostEnd = contest?.endTime ? new Date(new Date(contest.endTime).getTime() + 4 * 3600 * 1000) : null;
                                            const isPastFourHours = fourHoursPostEnd && new Date() > fourHoursPostEnd;
                                            const problemLink = isPastFourHours 
                                                ? `/problemset/problem/${contestId}/${p.letter}` 
                                                : `/kata/contests/${contestId}/problem/${p.letter}`;
                                            return (
                                                 <tr 
                                                    key={p.letter}
                                                    style={{ 
                                                        background: rowBg,
                                                        borderBottom: '1px solid #e7e7e7',
                                                        height: '44px',
                                                        verticalAlign: 'middle'
                                                    }}
                                                >
                                                    {/* Dedicated Codeforces Left Solved Status Stripe */}
                                                    <td style={{
                                                        width: '5px',
                                                        minWidth: '5px',
                                                        maxWidth: '5px',
                                                        padding: 0,
                                                        background: stripeBg,
                                                        borderRight: '1px solid #e1e1e1'
                                                    }} />

                                                    {/* Problem Letter Column */}
                                                    <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>
                                                        {canClick ? (
                                                            <Link 
                                                                to={problemLink}
                                                                style={{ color: '#222222', fontWeight: 'bold', textDecoration: 'none' }}
                                                            >
                                                                {p.letter}
                                                            </Link>
                                                        ) : (
                                                            <span style={{ color: '#222222', fontWeight: 'bold' }}>{p.letter}</span>
                                                        )}
                                                    </td>

                                                    {/* Problem Title Column */}
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                                            {canClick ? (
                                                                <Link 
                                                                    to={problemLink}
                                                                    style={{ color: '#222222', fontWeight: 500, fontSize: '13px', textDecoration: 'none' }}
                                                                >
                                                                    {p.title}
                                                                </Link>
                                                            ) : (
                                                                <span style={{ color: '#888888', fontWeight: 500, fontSize: '13px' }}>
                                                                    {p.title} {!candidateTimer?.isStarted ? '(Locked until you enter contest)' : '(Locked until start)'}
                                                                </span>
                                                            )}

                                                            {/* Forma Awaiting Evaluation Badge */}
                                                            {isForma && p.hasSubmission && !isFormaEvaluated && (
                                                                <span style={{
                                                                    fontSize: '10px',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '3px',
                                                                    background: '#f1f5f9',
                                                                    color: '#475569',
                                                                    border: '1px solid #cbd5e1'
                                                                }}>
                                                                    Submitted (Awaiting Evaluation)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '10px', color: '#888888', marginTop: '2px' }}>
                                                            standard input/output | 1.0 s | 256 MB
                                                        </div>
                                                    </td>

                                                    {/* Codeforces paper plane & star action cell */}
                                                    <CodeforcesActionCell
                                                        isSolved={p.isSolved}
                                                        to={canClick ? problemLink : '#'}
                                                        title={`Submit ${p.letter}`}
                                                    />

                                                    {/* Score */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold', color: isForma ? '#333333' : scoreColor }}>
                                                        <span>{p.points}</span>
                                                    </td>

                                                    {/* Score Obtained (Forma Contests) */}
                                                    {isForma && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>
                                                            {isFormaEvaluated ? (
                                                                <span
                                                                    style={{
                                                                        color: p.scoreTier === 'green' ? '#008000' : p.scoreTier === 'yellow' ? '#ca8a04' : '#dc2626',
                                                                        fontSize: '13px'
                                                                    }}
                                                                    title={`${p.marksAwarded} / ${p.points} (${p.percentage}%)`}
                                                                >
                                                                    {typeof p.marksAwarded === 'number'
                                                                        ? (Number.isInteger(p.marksAwarded) ? p.marksAwarded : Number(p.marksAwarded.toFixed(1)))
                                                                        : (p.marksAwarded ?? '—')}
                                                                </span>
                                                            ) : p.hasSubmission ? (
                                                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                                                                    Pending
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: '#888888', fontWeight: 'normal' }}>—</span>
                                                            )}
                                                        </td>
                                                    )}

                                                    {/* Solved Count */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#555' }}>
                                                        {p.solvedCount > 0 ? `× ${p.solvedCount}` : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar: Countdown & Score Breakdown */}
                    <div>
                        {/* Candidate 2-Hour Timer Card */}
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
                                {contest?.hasEnded
                                    ? (candidateTimer?.isVirtual && candidateTimer?.isStarted ? 'Virtual Contest Timer (2 Hours)' : 'Concluded Contest')
                                    : 'Candidate Timer (2 Hours)'}
                            </div>
                            <div style={{ padding: '12px', textAlign: 'center' }}>
                                {contest?.isLive ? (
                                    candidateTimer?.isStarted ? (
                                        candSecondsLeft > 0 ? (
                                            <div>
                                                <div style={{
                                                    fontSize: '22px',
                                                    fontWeight: 'bold',
                                                    fontFamily: 'Consolas, monospace',
                                                    color: candSecondsLeft < 600 ? '#dc2626' : '#16a34a',
                                                    letterSpacing: '1px',
                                                    marginBottom: '4px'
                                                }}>
                                                    {formatTimer(candSecondsLeft)}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#666' }}>
                                                    Submissions lock when this reaches 00:00:00
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    color: '#dc2626',
                                                    marginBottom: '4px'
                                                }}>
                                                    Window Expired
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#888' }}>
                                                    Submissions are now locked for this round.
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '12px', color: '#333', marginBottom: '8px' }}>
                                                {contest?.isRegistered ? 'Ready to begin your 2-hour window?' : 'Register to enter contest'}
                                            </div>
                                            {contest?.isRegistered ? (
                                                <button
                                                    onClick={handleStartTimer}
                                                    disabled={startingTimer}
                                                    style={{
                                                        background: startingTimer
                                                            ? '#f4f4f4'
                                                            : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: startingTimer ? '#888888' : '#000000',
                                                        border: startingTimer ? '1px solid #cccccc' : '1px solid #767676',
                                                        borderRadius: '2px',
                                                        padding: '4px 16px',
                                                        fontWeight: 'normal',
                                                        fontSize: '12px',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        cursor: startingTimer ? 'not-allowed' : 'pointer',
                                                        boxShadow: startingTimer ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    {startingTimer ? 'Starting Timer...' : 'Enter Contest »'}
                                                </button>
                                            ) : (
                                                <Link
                                                    to={`/kata/contests/${contestId}/register`}
                                                    style={{
                                                        display: 'inline-block',
                                                        background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: '#000000',
                                                        border: '1px solid #767676',
                                                        padding: '4px 14px',
                                                        borderRadius: '2px',
                                                        fontWeight: 'normal',
                                                        fontSize: '12px',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        textDecoration: 'none',
                                                        boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    Register Now »
                                                </Link>
                                            )}
                                            <div style={{ fontSize: '10px', color: '#666', marginTop: '6px' }}>
                                                2 hours starts immediately when clicked.
                                            </div>
                                        </div>
                                    )
                                ) : contest?.hasEnded ? (
                                    candidateTimer?.isVirtual && candidateTimer?.isStarted ? (
                                        candSecondsLeft > 0 ? (
                                            <div>
                                                <div style={{
                                                    fontSize: '22px',
                                                    fontWeight: 'bold',
                                                    fontFamily: 'Consolas, monospace',
                                                    color: candSecondsLeft < 300 ? '#dc2626' : '#16a34a',
                                                    letterSpacing: '1px',
                                                    marginBottom: '4px'
                                                }}>
                                                    {formatTimer(candSecondsLeft)}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#666' }}>
                                                    Virtual window locks when this reaches 00:00:00 (2 hours)
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    color: '#dc2626',
                                                    marginBottom: '4px'
                                                }}>
                                                    Virtual Window Expired
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#888' }}>
                                                    Submissions are locked for this virtual session.
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div>
                                            <div style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                                                ✓ Concluded Round
                                            </div>
                                            <div style={{ color: '#555', fontSize: '11px', marginBottom: '8px', lineHeight: '1.4' }}>
                                                Available in Gym for virtual contest or problemset practice.
                                            </div>
                                            {activeVirtualContest ? (
                                                <div style={{
                                                    background: '#fffbeb',
                                                    border: '1px solid #f59e0b',
                                                    borderRadius: '3px',
                                                    padding: '6px 8px',
                                                    marginBottom: '8px',
                                                    fontSize: '11px',
                                                    color: '#92400e'
                                                }}>
                                                    ⏱ <strong>Active Virtual Round:</strong>
                                                    <div style={{ marginTop: '2px' }}>
                                                        <Link to={`/kata/contests/${activeVirtualContest.contestId}`} style={{ color: '#b45309', fontWeight: 'bold' }}>
                                                            {activeVirtualContest.title || activeVirtualContest.contestId}
                                                        </Link> ({Math.ceil((activeVirtualContest.remainingSeconds || 0) / 60)}m left)
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ marginBottom: '8px' }}>
                                                    <Link
                                                        to={`/kata/contests/${contestId}/virtual-register`}
                                                        style={{
                                                            display: 'inline-block',
                                                            background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                            color: '#000000',
                                                            border: '1px solid #767676',
                                                            padding: '4px 12px',
                                                            borderRadius: '2px',
                                                            fontWeight: 'bold',
                                                            fontSize: '11px',
                                                            textDecoration: 'none',
                                                            boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                        }}
                                                    >
                                                        Take Virtual Contest »
                                                    </Link>
                                                </div>
                                            )}
                                            <div style={{
                                                fontSize: '10px',
                                                color: '#854d0e',
                                                background: '#fefce8',
                                                border: '1px solid #fef08a',
                                                borderRadius: '3px',
                                                padding: '5px 8px',
                                                lineHeight: '1.4'
                                            }}>
                                                ⏱ <strong>Submission Gap:</strong> {contest?.track === 'forma' ? '45s' : '30s'} gap between submissions per candidate.
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div>
                                        {contest?.isRegistered ? (
                                            <div style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '11px', marginBottom: '8px' }}>
                                                ✓ Registered for Contest
                                            </div>
                                        ) : (
                                            <div style={{ marginBottom: '8px' }}>
                                                <Link
                                                    to={`/kata/contests/${contestId}/register`}
                                                    style={{
                                                        display: 'inline-block',
                                                        background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: '#000000',
                                                        border: '1px solid #767676',
                                                        padding: '4px 14px',
                                                        borderRadius: '2px',
                                                        fontWeight: 'normal',
                                                        fontSize: '12px',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        textDecoration: 'none',
                                                        boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    Register Now »
                                                </Link>
                                            </div>
                                        )}
                                        <button
                                            disabled
                                            style={{
                                                background: '#e2e8f0',
                                                border: '1px solid #cbd5e1',
                                                color: '#64748b',
                                                padding: '6px 16px',
                                                borderRadius: '4px',
                                                fontWeight: 'bold',
                                                fontSize: '11px',
                                                cursor: 'not-allowed'
                                            }}
                                        >
                                            Enter Contest (Locked)
                                        </button>
                                        <div style={{ color: '#888', fontSize: '10px', marginTop: '6px' }}>
                                            Your 2-hour window unlocks when contest starts.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Overall 15h Contest Window Timer Box */}
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
                                Contest Window (15h)
                            </div>
                            <div style={{ padding: '12px', textAlign: 'center' }}>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    color: contest?.isLive ? '#00a000' : '#d9534f',
                                    marginBottom: '4px'
                                }}>
                                    {timeLeftStr || 'Calculating...'}
                                </div>
                                <div style={{ fontSize: '10px', color: '#888' }}>
                                    Runs 09:00 - 00:00 IST continuously
                                </div>
                            </div>
                        </div>

                        {/* Contest Points Box */}
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
                                Problem Scores
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

                        {/* Contest Writers & Info */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            fontSize: '11px',
                            padding: '10px 12px'
                        }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Writers:</div>
                            <div style={{ color: '#555', marginBottom: '8px' }}>
                                {(contest?.writers || ['BICS Academic Council']).join(', ')}
                            </div>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Participants:</div>
                            <div style={{ color: '#555' }}>
                                {contest?.registeredCount || 0} registered candidates
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <KataFooter />
        </div>
    );
}
