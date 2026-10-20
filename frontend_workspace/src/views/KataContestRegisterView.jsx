import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import { useAuth } from '../context/AuthContext';

export default function KataContestRegisterView() {
    const { contestId } = useParams();
    const navigate = useNavigate();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const [contest, setContest] = useState(null);
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
        document.title = `Registration | ${contestId} | Kata`;

        const token = localStorage.getItem('bics_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        fetch(`/api/kata/contests/${contestId}?handle=${encodeURIComponent(handle)}`, { headers })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContest(data.contest);
                    if (data.contest.isRegistered) {
                        // Already registered, redirect to contest dashboard
                        navigate(`/kata/contests/${contestId}`, { replace: true });
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
    }, [contestId, handle, navigate]);

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!password.trim()) {
            setErrorMsg('Please enter your BICS portal password to register for this contest.');
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(`/api/kata/contests/${contestId}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    handle: handle || profile?.handle || user?.username,
                    email: email || user?.email,
                    password: password.trim(),
                    mode: 'individual'
                })
            });

            const data = await res.json();
            if (data.success) {
                // Registration succeeded! Navigate directly to the contest page
                navigate(`/kata/contests/${contestId}`);
            } else {
                setErrorMsg(data.error || 'Failed to complete registration');
                setSubmitting(false);
            }
        } catch (err) {
            setErrorMsg('Server connection failed. Please retry.');
            setSubmitting(false);
        }
    };

    const effectiveHandle = handle || profile?.handle || user?.username || 'candidate';

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} contestId={contestId} />

            <main style={{ maxWidth: '780px', width: '100%', margin: '30px auto', padding: '0 15px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{
                    border: '1px solid #b9b9b9',
                    borderRadius: '5px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    background: '#ffffff'
                }}>
                    {/* Header bar */}
                    <div style={{
                        background: '#f0f4f8',
                        padding: '10px 16px',
                        borderBottom: '1px solid #b9b9b9',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: '#333333'
                    }}>
                        Registration for the contest
                    </div>

                    <div style={{ padding: '24px 28px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#777' }}>
                                Loading contest registration details...
                            </div>
                        ) : errorMsg && !contest ? (
                            <div style={{ color: '#d9534f', padding: '12px', background: '#fdf7f7', border: '1px solid #eed3d7', borderRadius: '4px' }}>
                                {errorMsg}
                            </div>
                        ) : (
                            <form onSubmit={handleRegisterSubmit}>
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

                                {/* Contest Name Row */}
                                <div style={{ marginBottom: '18px', fontSize: '13px' }}>
                                    <span style={{ fontWeight: 'bold', marginRight: '10px' }}>Contest:</span>
                                    <Link to={`/kata/contests/${contestId}`} style={{ color: '#315682', fontWeight: 'bold' }}>
                                        {contest?.title || contestId}
                                    </Link>
                                </div>

                                {/* Candidate Credentials Card */}
                                <div style={{
                                    background: '#f8f9fa',
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
                                    <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                                        Take part:
                                    </span>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input 
                                            type="radio" 
                                            name="mode" 
                                            value="individual" 
                                            defaultChecked 
                                            style={{ margin: 0 }}
                                        />
                                        <span>
                                            as individual participant <strong style={{ color: '#008000' }}>{effectiveHandle}</strong>
                                        </span>
                                    </label>
                                </div>

                                {/* BICS Portal Password Verification */}
                                <div style={{
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    background: '#f8fafc',
                                    padding: '16px',
                                    marginBottom: '20px'
                                }}>
                                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '12px', color: '#1e293b', marginBottom: '6px' }}>
                                        BICS Portal Password <span style={{ color: '#dc2626' }}>*</span>
                                    </label>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                                        Please enter your BICS portal login password to verify your candidate identity and register for this contest.
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
                                                outline: 'none'
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
                                                cursor: 'pointer',
                                                color: '#64748b',
                                                fontSize: '12px',
                                                padding: '4px'
                                            }}
                                        >
                                            {showPassword ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>

                                {/* Terms & Conditions Agreement Box (Codeforces Style) */}
                                <div style={{
                                    border: '1px solid #d4d4d4',
                                    borderRadius: '4px',
                                    background: '#fafafa',
                                    padding: '14px 18px',
                                    marginBottom: '24px',
                                    fontSize: '11px',
                                    lineHeight: '1.7',
                                    color: '#444'
                                }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#222' }}>
                                        I agree to:
                                    </div>
                                    <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                                        <li>not participate with multiple accounts;</li>
                                        <li>not discuss problems until the contest is over;</li>
                                        <li>not submit somebody else's code.</li>
                                    </ul>
                                </div>

                                {/* Register Button */}
                                <div>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        style={{
                                            background: submitting
                                                ? '#f4f4f4'
                                                : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                            color: submitting ? '#888888' : '#000000',
                                            border: submitting ? '1px solid #cccccc' : '1px solid #767676',
                                            borderRadius: '2px',
                                            padding: '4px 20px',
                                            fontSize: '13px',
                                            fontWeight: 'normal',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            cursor: submitting ? 'not-allowed' : 'pointer',
                                            boxShadow: submitting ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                        }}
                                    >
                                        {submitting ? 'Registering...' : 'Register'}
                                    </button>
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
