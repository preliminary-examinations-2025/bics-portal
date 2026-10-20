import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import { useAuth } from '../context/AuthContext';

export default function KataVirtualRegisterView() {
    const { contestId } = useParams();
    const navigate = useNavigate();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const [contest, setContest] = useState(null);
    const [activeVirtualContest, setActiveVirtualContest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);

    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handle = authProfile?.handle || authUser?.username || localStorage.getItem('kata_handle') || '';
    const email = authUser?.email || localStorage.getItem('kata_email') || '';

    useEffect(() => {
        if (authProfile) setProfile(authProfile);
        if (authUser) setUser(authUser);
    }, [authProfile, authUser]);

    useEffect(() => {
        document.title = `Virtual Registration | ${contestId} | Kata`;

        fetch(`/api/kata/contests/${contestId}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContest(data.contest);
                    if (data.candidateTimer?.isVirtual && data.candidateTimer.isStarted && !data.candidateTimer.isExpired) {
                        // Candidate already has an active virtual timer for this contest, redirect to contest dashboard
                        navigate(`/kata/contests/${contestId}`);
                        return;
                    }
                    if (data.activeVirtualContest) {
                        setActiveVirtualContest(data.activeVirtualContest);
                    }
                } else {
                    setErrorMsg(data.error || 'Contest not found');
                }
                setLoading(false);
            })
            .catch(err => {
                setErrorMsg('Network error loading contest details');
                setLoading(false);
            });
    }, [contestId, navigate]);

    const handleVirtualRegisterSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (activeVirtualContest) {
            setErrorMsg(`You already have an active virtual contest running: "${activeVirtualContest.title || activeVirtualContest.contestId}". Candidates can only participate in one virtual contest at a time.`);
            return;
        }

        if (!password.trim()) {
            setErrorMsg('Please enter your BICS portal password to enter virtual participation.');
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(`/api/kata/contests/${contestId}/virtual-register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    handle: handle || profile?.handle || user?.username,
                    email: email || user?.email,
                    password: password.trim(),
                    mode: 'virtual'
                })
            });

            const data = await res.json();
            if (data.success) {
                // Successfully registered for Virtual Participation! Redirect to contest dashboard
                navigate(`/kata/contests/${contestId}`);
            } else {
                if (data.activeVirtualContest) {
                    setActiveVirtualContest(data.activeVirtualContest);
                }
                setErrorMsg(data.error || 'Failed to complete virtual registration');
                setSubmitting(false);
            }
        } catch (err) {
            setErrorMsg('Server connection failed. Please retry.');
            setSubmitting(false);
        }
    };

    const effectiveHandle = handle || profile?.handle || user?.username || 'candidate';

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222222', fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
            <KataHeader user={user} profile={profile} contestId={contestId} />

            <main style={{ maxWidth: '780px', width: '100%', margin: '30px auto', padding: '0 15px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{
                    border: '1px solid #b9b9b9',
                    borderRadius: '5px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    background: '#ffffff',
                    overflow: 'hidden'
                }}>
                    {/* Header bar matching Codeforces / BICS style */}
                    <div style={{
                        background: 'linear-gradient(to bottom, #f0f4f8 0%, #e2e8f0 100%)',
                        padding: '12px 18px',
                        borderBottom: '1px solid #b9b9b9',
                        fontWeight: 'bold',
                        fontSize: '15px',
                        color: '#1e293b'
                    }}>
                        Virtual Participation Registration
                    </div>

                    <div style={{ padding: '24px 28px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '30px', color: '#777777', fontSize: '13px' }}>
                                Loading virtual participation details...
                            </div>
                        ) : errorMsg && !contest ? (
                            <div style={{ color: '#d9534f', padding: '12px', background: '#fdf7f7', border: '1px solid #eed3d7', borderRadius: '4px', fontSize: '12px' }}>
                                {errorMsg}
                            </div>
                        ) : (
                            <form onSubmit={handleVirtualRegisterSubmit}>
                                {errorMsg && (
                                    <div style={{
                                        color: '#b94a48',
                                        backgroundColor: '#f2dede',
                                        borderColor: '#eed3d7',
                                        padding: '10px 14px',
                                        borderRadius: '4px',
                                        marginBottom: '16px',
                                        fontSize: '12px',
                                        border: '1px solid #eed3d7'
                                    }}>
                                        ⚠️ {errorMsg}
                                    </div>
                                )}

                                {activeVirtualContest && (
                                    <div style={{
                                        background: '#fffbeb',
                                        border: '1px solid #f59e0b',
                                        borderRadius: '4px',
                                        padding: '14px 18px',
                                        marginBottom: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '16px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <span style={{ fontSize: '20px', lineHeight: 1 }}>⏱️</span>
                                            <div>
                                                <div style={{ fontWeight: 'bold', color: '#b45309', fontSize: '13px', marginBottom: '4px' }}>
                                                    Active Virtual Contest In Progress
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.5' }}>
                                                    You already have an active virtual round running for <strong>{activeVirtualContest.title || activeVirtualContest.contestId}</strong> ({Math.ceil((activeVirtualContest.remainingSeconds || 0) / 60)} minutes remaining). Candidates can only participate in one virtual contest at a time across the platform.
                                                </div>
                                            </div>
                                        </div>
                                        <Link
                                            to={`/kata/contests/${activeVirtualContest.contestId}`}
                                            style={{
                                                background: '#d97706',
                                                color: '#ffffff',
                                                padding: '6px 14px',
                                                borderRadius: '3px',
                                                fontSize: '12px',
                                                fontWeight: 'bold',
                                                textDecoration: 'none',
                                                whiteSpace: 'nowrap',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                            }}
                                        >
                                            Resume Active Contest »
                                        </Link>
                                    </div>
                                )}

                                {/* Contest Name Row */}
                                <div style={{ marginBottom: '18px', fontSize: '13px' }}>
                                    <span style={{ fontWeight: 'bold', marginRight: '10px', color: '#333333' }}>Contest:</span>
                                    <Link to={`/kata/contests/${contestId}`} style={{ color: '#315682', fontWeight: 'bold' }}>
                                        {contest?.title || contestId}
                                    </Link>
                                    <span style={{ marginLeft: '10px', fontSize: '11px', color: '#666666' }}>
                                        ({contest?.track?.toUpperCase()} Track • 5 Problems • Concluded)
                                    </span>
                                </div>

                                {/* Virtual Participation Rules Box */}
                                <div style={{
                                    border: '1px solid #fed7aa',
                                    borderRadius: '5px',
                                    background: '#fffbeb',
                                    padding: '16px 18px',
                                    marginBottom: '20px'
                                }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#9a3412', marginBottom: '8px' }}>
                                        Rules of Virtual Participation:
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#7c2d12', lineHeight: '1.6' }}>
                                        <li>
                                            <strong>No AI Tools Allowed:</strong> Use of ChatGPT, Claude, Gemini, GitHub Copilot, or external automated code generation tools during this virtual session is strictly prohibited.
                                        </li>
                                        <li>
                                            <strong>Practice Session Only:</strong> Submissions in virtual participation are evaluated for practice. No live contest marks, course credits, or official contest rating changes are awarded.
                                        </li>
                                        <li>
                                            <strong>Individual 2-Hour Timer & Submission Gap:</strong> Once you click <em>Enter Contest</em>, your personal 2-hour virtual contest timer starts immediately and runs continuously. A submission cooldown gap ({contest?.track === 'forma' ? '45 seconds for Forma' : '30 seconds for Shin'}) is enforced between consecutive submissions.
                                        </li>
                                        <li>
                                            <strong>Academic Honor Code:</strong> Do not inspect problem statements or editorial solutions from the problemset prior to taking part in the virtual contest.
                                        </li>
                                    </ul>
                                </div>

                                {/* Candidate Credentials Card */}
                                <div style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    padding: '12px 16px',
                                    marginBottom: '20px',
                                    fontSize: '12px'
                                }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Candidate: </span>
                                            <strong style={{ color: '#0f172a' }}>{user?.name || user?.username || 'Student'}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Student ID: </span>
                                            <strong style={{ color: '#0f172a' }}>{user?.studentId || 'N/A'}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Kata Handle: </span>
                                            <strong style={{ color: '#16a34a' }}>{effectiveHandle}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Participation Mode Radio */}
                                <div style={{ marginBottom: '20px', fontSize: '12px' }}>
                                    <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: '#333333' }}>
                                        Take part:
                                    </span>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input 
                                            type="radio" 
                                            name="mode" 
                                            value="virtual" 
                                            defaultChecked 
                                            style={{ margin: 0 }}
                                        />
                                        <span>
                                            as virtual individual participant <strong style={{ color: '#008000' }}>{effectiveHandle}</strong>
                                        </span>
                                    </label>
                                </div>

                                {/* BICS Portal Password Verification */}
                                <div style={{
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    background: '#f8fafc',
                                    padding: '16px',
                                    marginBottom: '24px'
                                }}>
                                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '12px', color: '#1e293b', marginBottom: '6px' }}>
                                        BICS Portal Password <span style={{ color: '#dc2626' }}>*</span>
                                    </label>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                                        Please enter your registered BICS portal password to verify your candidate identity and start your virtual round.
                                    </div>
                                    <div style={{ position: 'relative', maxWidth: '380px' }}>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your BICS portal password"
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '8px 40px 8px 12px',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                                fontFamily: 'inherit',
                                                boxSizing: 'border-box',
                                                outline: 'none',
                                                background: '#ffffff'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={{
                                                position: 'absolute',
                                                right: '10px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                padding: '2px 4px'
                                            }}
                                        >
                                            {showPassword ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>

                                {/* Enter Contest Action Button */}
                                <div>
                                    <button
                                        type="submit"
                                        disabled={submitting || Boolean(activeVirtualContest)}
                                        style={{
                                            background: (submitting || activeVirtualContest)
                                                ? '#f4f4f4'
                                                : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                            color: (submitting || activeVirtualContest) ? '#888888' : '#000000',
                                            border: (submitting || activeVirtualContest) ? '1px solid #cccccc' : '1px solid #767676',
                                            borderRadius: '2px',
                                            padding: '4px 22px',
                                            fontWeight: 'normal',
                                            fontSize: '13px',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            cursor: (submitting || activeVirtualContest) ? 'not-allowed' : 'pointer',
                                            boxShadow: (submitting || activeVirtualContest) ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                        }}
                                    >
                                        {submitting
                                            ? 'Entering...'
                                            : (activeVirtualContest ? 'Cannot Enter (Another Virtual Contest Active)' : 'Enter Contest')}
                                    </button>
                                    <Link
                                        to="/kata/gym"
                                        style={{
                                            marginLeft: '16px',
                                            fontSize: '12px',
                                            color: '#64748b',
                                            textDecoration: 'none'
                                        }}
                                    >
                                        Cancel
                                    </Link>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </main>
            <KataFooter />
        </div>
    );
}
