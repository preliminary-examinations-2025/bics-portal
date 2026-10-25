import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import KataContestSubNav from '../components/KataContestSubNav';
import CodeforcesEditor from '../components/CodeforcesEditor';
import { useAuth } from '../context/AuthContext';

const DEFAULT_CPP_TEMPLATE = `#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // write your solution here

    return 0;
}
`;

export default function KataContestSubmitView() {
    const { contestId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const searchParams = new URLSearchParams(location.search);
    const queryProblem = searchParams.get('problem')?.toUpperCase() || '';
    const isProblemsetParam = searchParams.get('problemset') === 'true';

    const [contest, setContest] = useState(null);
    const [selectedProblem, setSelectedProblem] = useState(queryProblem || 'A');
    const [selectedLang, setSelectedLang] = useState('cpp');
    const [code, setCode] = useState(DEFAULT_CPP_TEMPLATE);

    // Forma HTML/CSS/JS state
    const [formaTab, setFormaTab] = useState('html');
    const [htmlCode, setHtmlCode] = useState('<!-- HTML Structure -->\n<div class="container">\n  \n</div>');
    const [cssCode, setCssCode] = useState('/* CSS Styles */\n.container {\n  \n}');
    const [jsCode, setJsCode] = useState('// JavaScript Logic\n');

    // Candidate timer state
    const [candidateTimer, setCandidateTimer] = useState(null);
    const [candSecondsLeft, setCandSecondsLeft] = useState(null);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);

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
        document.title = `Submit Code | ${contestId} | Kata`;

        fetch(`/api/kata/contests/${contestId}?handle=${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContest(data.contest);
                    if (queryProblem) {
                        setSelectedProblem(queryProblem);
                    } else if (data.contest.problems?.length > 0) {
                        setSelectedProblem(data.contest.problems[0].letter);
                    }
                    if (data.candidateTimer) {
                        setCandidateTimer(data.candidateTimer);
                        setCandSecondsLeft(data.candidateTimer.remainingSeconds);
                    }
                } else {
                    setErrorMsg(data.error || 'Contest not found');
                }
                setLoading(false);
            })
            .catch(err => {
                setErrorMsg('Error loading contest details');
                setLoading(false);
            });
    }, [contestId, handle]);

    // Candidate timer countdown
    useEffect(() => {
        if (!candidateTimer?.isStarted || candSecondsLeft === null) return;
        if (candSecondsLeft <= 0) return;

        const interval = setInterval(() => {
            setCandSecondsLeft(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [candidateTimer?.isStarted, candSecondsLeft]);

    const isForma = contest?.track === 'forma' || contestId.toUpperCase().startsWith('FORMA');
    const isLiveContest = contest?.isLive && !isProblemsetParam;
    const isExpired = isLiveContest 
        ? (candidateTimer?.isStarted && !candidateTimer?.isVirtual && candSecondsLeft !== null && candSecondsLeft <= 0)
        : (candidateTimer?.isVirtual && candidateTimer?.isExpired);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isExpired && isLiveContest) {
            setErrorMsg('Your 2-hour contest window has expired. Submissions are now locked.');
            return;
        }

        if (isForma) {
            const isSubstantive = (val) => {
                if (!val || typeof val !== 'string') return false;
                const stripped = val
                    .replace(/<!--[\s\S]*?-->/g, '')
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/\/\/.*/g, '')
                    .replace(/<div\s+class=["']container["']>\s*<\/div>/gi, '')
                    .replace(/<div\s*>\s*<\/div>/gi, '')
                    .replace(/\.container\s*\{\s*\}/g, '')
                    .replace(/\s+/g, '')
                    .trim();
                return stripped.length > 0;
            };

            if (!isSubstantive(htmlCode) && !isSubstantive(cssCode) && !isSubstantive(jsCode)) {
                setErrorMsg('Please write or paste your solution before submitting.');
                return;
            }
        } else {
            if (!code.trim() || code.trim() === DEFAULT_CPP_TEMPLATE.trim()) {
                setErrorMsg('Please write or paste your solution before submitting.');
                return;
            }
        }

        setSubmitting(true);
        setErrorMsg('');

        try {
            const payload = isForma ? {
                problemLetter: selectedProblem,
                html: htmlCode,
                css: cssCode,
                js: jsCode,
                language: 'web',
                handle: handle || profile?.handle || user?.username
            } : {
                problemLetter: selectedProblem,
                code: code,
                language: selectedLang,
                handle: handle || profile?.handle || user?.username
            };

            const res = await fetch(`/api/kata/contests/${contestId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                // Navigate to submissions view preserving problemset context if applicable
                if (isProblemsetParam || contest?.hasEnded) {
                    navigate(`/status?problemset=true&contestId=${contestId}`);
                } else {
                    navigate(`/kata/contests/${contestId}/submissions`);
                }
            } else {
                setErrorMsg(data.error || 'Submission failed');
                setSubmitting(false);
            }
        } catch (err) {
            setErrorMsg('Connection failed while submitting code');
            setSubmitting(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} contestId={contestId} />
            <KataContestSubNav contestId={contestId} />

            <main style={{ maxWidth: '900px', width: '100%', margin: '20px auto 40px auto', padding: '0 12px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{
                    border: '1px solid #b9b9b9',
                    borderRadius: '4px',
                    background: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    {/* Header Strip */}
                    <div style={{
                        background: '#f0f4f8',
                        padding: '10px 16px',
                        borderBottom: '1px solid #b9b9b9',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: '#333333',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span>Submit Solution — {contest?.title || contestId}</span>
                        {candidateTimer?.isStarted && (
                            <span style={{
                                fontSize: '13px',
                                fontFamily: 'Consolas, monospace',
                                fontWeight: 'bold',
                                color: isExpired ? '#dc2626' : '#16a34a'
                            }}>
                                {isExpired ? 'Window Expired' : `Time Remaining: ${formatTimer(candSecondsLeft)}`}
                            </span>
                        )}
                    </div>

                    <div style={{ padding: '24px 28px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#777' }}>
                                Loading submit form...
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                {errorMsg && (
                                    <div style={{
                                        color: '#d9534f',
                                        background: '#fdf7f7',
                                        border: '1px solid #eed3d7',
                                        padding: '10px 14px',
                                        borderRadius: '4px',
                                        marginBottom: '16px',
                                        fontSize: '12px'
                                    }}>
                                        {errorMsg}
                                    </div>
                                )}

                                {isExpired && isLiveContest && (
                                    <div style={{
                                        color: '#991b1b',
                                        background: '#fee2e2',
                                        border: '1px solid #fecaca',
                                        padding: '12px 16px',
                                        borderRadius: '4px',
                                        marginBottom: '18px',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        textAlign: 'center'
                                    }}>
                                        🔒 Submissions Locked — Your personal 2-hour window has ended.
                                    </div>
                                )}

                                {/* Problem Selector */}
                                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <label style={{ width: '130px', fontWeight: 'bold', fontSize: '12px' }}>
                                        Problem:
                                    </label>
                                    <select
                                        value={selectedProblem}
                                        onChange={(e) => setSelectedProblem(e.target.value)}
                                        style={{
                                            padding: '5px 10px',
                                            fontSize: '12px',
                                            border: '1px solid #b9b9b9',
                                            borderRadius: '3px',
                                            minWidth: '280px',
                                            background: '#ffffff'
                                        }}
                                    >
                                        {(contest?.problems || []).map((p) => (
                                            <option key={p.letter} value={p.letter}>
                                                {p.letter} - {p.title} ({p.points} points)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Language Selector */}
                                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <label style={{ width: '130px', fontWeight: 'bold', fontSize: '12px' }}>
                                        Language:
                                    </label>
                                    {isForma ? (
                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1' }}>
                                            Web Engineering (HTML5, CSS3, ES6 JavaScript)
                                        </span>
                                    ) : (
                                        <select
                                            value={selectedLang}
                                            onChange={(e) => setSelectedLang(e.target.value)}
                                            style={{
                                                padding: '5px 10px',
                                                fontSize: '12px',
                                                border: '1px solid #b9b9b9',
                                                borderRadius: '3px',
                                                minWidth: '280px',
                                                background: '#ffffff'
                                            }}
                                        >
                                            <option value="cpp">GNU G++17 6.3.0 (C++17, 64-bit)</option>
                                            <option value="cpp20">GNU G++20 (C++20, 64-bit)</option>
                                        </select>
                                    )}
                                </div>

                                {isForma ? (
                                    /* Forma HTML / CSS / JS Editor */
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setFormaTab('html')}
                                                style={{
                                                    padding: '4px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: formaTab === 'html' ? 'bold' : 'normal',
                                                    background: formaTab === 'html' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                    color: '#000000',
                                                    border: '1px solid #767676',
                                                    borderRadius: '2px',
                                                    cursor: 'pointer',
                                                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                    boxShadow: formaTab === 'html' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                }}
                                            >
                                                HTML Structure
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormaTab('css')}
                                                style={{
                                                    padding: '4px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: formaTab === 'css' ? 'bold' : 'normal',
                                                    background: formaTab === 'css' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                    color: '#000000',
                                                    border: '1px solid #767676',
                                                    borderRadius: '2px',
                                                    cursor: 'pointer',
                                                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                    boxShadow: formaTab === 'css' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                }}
                                            >
                                                CSS Styles
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormaTab('js')}
                                                style={{
                                                    padding: '4px 14px',
                                                    fontSize: '12px',
                                                    fontWeight: formaTab === 'js' ? 'bold' : 'normal',
                                                    background: formaTab === 'js' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                    color: '#000000',
                                                    border: '1px solid #767676',
                                                    borderRadius: '2px',
                                                    cursor: 'pointer',
                                                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                    boxShadow: formaTab === 'js' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                }}
                                            >
                                                JavaScript Logic
                                            </button>
                                        </div>

                                        {formaTab === 'html' && (
                                            <CodeforcesEditor
                                                label="Source:"
                                                value={htmlCode}
                                                onChange={setHtmlCode}
                                                height="380px"
                                                placeholder="<!-- HTML markup goes here -->"
                                            />
                                        )}
                                        {formaTab === 'css' && (
                                            <CodeforcesEditor
                                                label="Source:"
                                                value={cssCode}
                                                onChange={setCssCode}
                                                height="380px"
                                                placeholder="/* CSS styles go here */"
                                            />
                                        )}
                                        {formaTab === 'js' && (
                                            <CodeforcesEditor
                                                label="Source:"
                                                value={jsCode}
                                                onChange={setJsCode}
                                                height="380px"
                                                placeholder="// JavaScript logic goes here"
                                            />
                                        )}
                                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                            Forma solutions are evaluated asynchronously against automated rubrics.
                                        </div>
                                    </div>
                                ) : (
                                    /* Shin C++ Codeforces Editor matching img ref 1 */
                                    <div style={{ marginBottom: '20px' }}>
                                        <CodeforcesEditor
                                            label="Source:"
                                            value={code}
                                            onChange={setCode}
                                            height="420px"
                                            placeholder="// write your solution here"
                                        />
                                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                                            Asynchronous execution: server evaluates against sample and hidden test cases without blocking the portal.
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <button
                                        type="submit"
                                        disabled={submitting || isExpired}
                                        style={{
                                            background: (submitting || isExpired)
                                                ? '#f4f4f4'
                                                : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                            color: (submitting || isExpired) ? '#888888' : '#000000',
                                            border: (submitting || isExpired) ? '1px solid #cccccc' : '1px solid #767676',
                                            borderRadius: '2px',
                                            padding: '4px 20px',
                                            fontWeight: 'normal',
                                            fontSize: '13px',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            cursor: (submitting || isExpired) ? 'not-allowed' : 'pointer',
                                            boxShadow: (submitting || isExpired) ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                        }}
                                    >
                                        {isExpired ? 'Submissions Locked' : submitting ? 'Submitting...' : 'Submit'}
                                    </button>
                                    <Link 
                                        to={`/kata/contests/${contestId}`}
                                        style={{ color: '#315682', fontSize: '12px' }}
                                    >
                                        Cancel and return to problems
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
