import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import KataContestSubNav from '../components/KataContestSubNav';
import LatexRenderer from '../components/LatexRenderer';
import CodeforcesEditor from '../components/CodeforcesEditor';
import { useAuth } from '../context/AuthContext';

function formatCodeforcesTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${mon}/${day}/${year} ${hours}:${mins}`;
}

function renderVerdictBadge(verdict) {
    if (!verdict) return <span style={{ color: '#888888' }}>—</span>;
    const vLower = verdict.toLowerCase();
    if (vLower === 'accepted') {
        return <span style={{ color: '#00a000', fontWeight: 'bold' }}>Accepted</span>;
    }
    if (
        vLower.startsWith('wrong answer') ||
        vLower.startsWith('time limit') ||
        vLower.startsWith('runtime error') ||
        vLower.startsWith('compilation error')
    ) {
        return <span style={{ color: '#0000cc' }}>{verdict}</span>;
    }
    if (
        vLower.includes('awaiting') ||
        vLower.includes('in queue') ||
        vLower.includes('compiling') ||
        vLower.includes('running')
    ) {
        return <span style={{ color: '#64748b' }}>{verdict}</span>;
    }
    if (vLower === 'deprecated') {
        return <span style={{ color: '#888888' }}>Deprecated</span>;
    }
    return <span style={{ color: '#333333' }}>{verdict}</span>;
}

export default function KataProblemDetailView({ isProblemsetRoute }) {
    const { contestId, letter } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const isProblemset = isProblemsetRoute !== undefined 
        ? isProblemsetRoute 
        : location.pathname.includes('/problemset/');

    const [problemData, setProblemData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);

    // Quick submit state
    const [quickCode, setQuickCode] = useState('');
    const [selectedFileName, setSelectedFileName] = useState('');
    const [showTextEditor, setShowTextEditor] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [copiedInput, setCopiedInput] = useState(false);

    // Forma HTML/CSS/JS state
    const [formaTab, setFormaTab] = useState('html'); // 'html' | 'css' | 'js'
    const [htmlCode, setHtmlCode] = useState('');
    const [cssCode, setCssCode] = useState('');
    const [jsCode, setJsCode] = useState('');

    // Candidate 2-Hour Timer state
    const [candidateTimer, setCandidateTimer] = useState(null);
    const [candSecondsLeft, setCandSecondsLeft] = useState(null);
    const [startingTimer, setStartingTimer] = useState(false);

    // Cooldown gap between submissions: 30s for Shin, 45s for Forma
    const [subCooldownLeft, setSubCooldownLeft] = useState(0);

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

    const handleFileChange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            setSelectedFileName(file.name);
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result || '';
                if (file.name.endsWith('.css')) {
                    setCssCode(text);
                } else if (file.name.endsWith('.js')) {
                    setJsCode(text);
                } else {
                    setQuickCode(text);
                    setHtmlCode(text);
                }
                setSubmitError('');
            };
            reader.onerror = () => {
                setSubmitError('Failed to read selected file.');
            };
            reader.readAsText(file);
        } else {
            setSelectedFileName('');
            setQuickCode('');
            setHtmlCode('');
            setCssCode('');
            setJsCode('');
        }
    };

    useEffect(() => {
        document.title = `Problem ${letter?.toUpperCase()} | ${contestId} | Kata`;

        fetch(`/api/kata/contests/${contestId}/problem/${letter}?handle=${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Availability Rule:
                    // The contest questions should be listed for 4 hours under /contests/:contestId/problem/:letter
                    // and then after 4 hours at /problemset/problem/:contestId/:letter
                    const isPastFourHours = data.isPastFourHours || (data.fourHoursPostEnd && new Date() > new Date(data.fourHoursPostEnd));

                    if (isPastFourHours) {
                        // After 4 hours post-contest: question is listed at /problemset/problem/:contestId/:letter
                        if (!isProblemset) {
                            navigate(`/problemset/problem/${contestId}/${letter}`, { replace: true });
                            return;
                        }
                    } else {
                        // During live contest and for 4 hours after contest ends: question is listed under /contests/:contestId/problem/:letter
                        if (isProblemset) {
                            navigate(`/kata/contests/${contestId}/problem/${letter}`, { replace: true });
                            return;
                        }
                    }

                    setProblemData(data);
                    if (!isProblemset && data.candidateTimer) {
                        setCandidateTimer(data.candidateTimer);
                        if (data.candidateTimer.isStarted) {
                            setCandSecondsLeft(data.candidateTimer.remainingSeconds);
                        }
                    }
                } else {
                    setErrorMsg(data.error || 'Failed to load problem statement');
                }
                setLoading(false);
            })
            .catch(err => {
                setErrorMsg('Network error retrieving problem');
                setLoading(false);
            });
    }, [contestId, letter, handle, isProblemset]);

    // Candidate 2-hour window ticker (clock-skew compensated & drift-resistant)
    useEffect(() => {
        if (!candidateTimer?.isStarted) return;

        const maxDurationSec = candidateTimer.totalSeconds || 7200;

        // Calculate clock skew between server and client device
        // If serverTime is provided: skew = serverTime - clientLocalNow
        // Fallback: derive skew from (expiresAt - (clientLocalNow + remainingSeconds))
        const clientFetchTime = Date.now();
        const serverTimeMs = candidateTimer.serverTime ? new Date(candidateTimer.serverTime).getTime() : null;
        const clockSkewMs = serverTimeMs 
            ? (serverTimeMs - clientFetchTime)
            : (candidateTimer.expiresAt && candidateTimer.remainingSeconds !== undefined
                ? (new Date(candidateTimer.expiresAt).getTime() - (clientFetchTime + candidateTimer.remainingSeconds * 1000))
                : 0);

        const targetExpiry = candidateTimer.expiresAt
            ? new Date(candidateTimer.expiresAt).getTime()
            : (clientFetchTime + clockSkewMs + ((candidateTimer.remainingSeconds ?? candSecondsLeft ?? maxDurationSec) * 1000));

        // Live contest candidate timer strictly ends when contest.endTime ends (e.g. 23:59:59)
        const contestEndMs = (!candidateTimer.isVirtual && (problemData?.contestEndTime || problemData?.endTime))
            ? new Date(problemData.contestEndTime || problemData.endTime).getTime()
            : null;
        const effectiveExpiry = contestEndMs ? Math.min(targetExpiry, contestEndMs) : targetExpiry;

        const updateTimer = () => {
            const syncedNow = Date.now() + clockSkewMs;
            const remaining = Math.min(maxDurationSec, Math.max(0, Math.floor((effectiveExpiry - syncedNow) / 1000)));
            setCandSecondsLeft(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [candidateTimer?.isStarted, candidateTimer?.expiresAt, candidateTimer?.serverTime, candidateTimer?.remainingSeconds, candidateTimer?.isVirtual, problemData?.contestEndTime, problemData?.endTime]);

    // Submission cooldown ticker (Shin: 30s gap, Forma: 45s gap)
    useEffect(() => {
        if (subCooldownLeft <= 0) return;
        const timer = setInterval(() => {
            setSubCooldownLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [subCooldownLeft]);

    const handleStartTimer = async () => {
        setStartingTimer(true);
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
            }
        } catch (err) {
            console.error('Error starting candidate timer:', err);
        } finally {
            setStartingTimer(false);
        }
    };

    const handleCopySampleInput = () => {
        if (!problemData?.problem?.sampleInput) return;
        navigator.clipboard.writeText(problemData.problem.sampleInput);
        setCopiedInput(true);
        setTimeout(() => setCopiedInput(false), 2000);
    };

    const isForma = contestId.toUpperCase().startsWith('FORMA') || problemData?.track === 'forma';
    const isLiveContest = problemData?.isLive && !isProblemset;
    const isExpired = candidateTimer?.isStarted && candSecondsLeft !== null && candSecondsLeft <= 0;

    const handleQuickSubmit = async (e) => {
        e.preventDefault();

        if (isLiveContest && !candidateTimer?.isStarted) {
            setSubmitError('You must enter the contest on the contest dashboard to start your 2-hour window before submitting code.');
            return;
        }

        if (isExpired) {
            setSubmitError(`Your contest window has expired. Submissions are now locked.`);
            return;
        }

        if (subCooldownLeft > 0) {
            setSubmitError(`Submission cooldown active: Please wait ${subCooldownLeft}s before submitting again (${isForma ? '45s gap for Forma' : '30s gap for Shin'}).`);
            return;
        }

        // When submitting through the "Choose file" form, a file MUST be selected
        if (!selectedFileName) {
            setSubmitError('Please choose a file to submit.');
            return;
        }

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

        if (isForma) {
            const hasSubstantive = isSubstantive(htmlCode) || isSubstantive(cssCode) || isSubstantive(jsCode) || isSubstantive(quickCode);
            if (!hasSubstantive) {
                setSubmitError('The selected file contains empty or boilerplate code. Please choose a file containing your substantive solution.');
                return;
            }
        } else {
            if (!isSubstantive(quickCode)) {
                setSubmitError('The selected file contains empty or boilerplate code. Please choose a file containing your substantive solution.');
                return;
            }
        }

        setSubmitting(true);
        setSubmitError('');

        try {
            const payload = isForma ? {
                problemLetter: letter.toUpperCase(),
                html: htmlCode || quickCode,
                css: cssCode,
                js: jsCode,
                language: 'web',
                handle: handle || profile?.handle || user?.username
            } : {
                problemLetter: letter.toUpperCase(),
                code: quickCode,
                language: 'cpp',
                handle: handle || profile?.handle || user?.username
            };

            const res = await fetch(`/api/kata/contests/${contestId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.status === 429) {
                const waitSec = data.cooldownRemaining || (isForma ? 45 : 30);
                setSubCooldownLeft(waitSec);
                setSubmitError(data.error || `Cooldown active: Please wait ${waitSec}s before submitting again.`);
                setSubmitting(false);
                return;
            }

            if (data.success) {
                if (!isLiveContest) {
                    setSubCooldownLeft(data.cooldownSeconds || (isForma ? 45 : 30));
                }
                // Navigate to submissions view preserving problemset context if applicable
                if (isProblemset) {
                    navigate(`/status?problemset=true${contestId ? `&contestId=${contestId}` : ''}`);
                } else {
                    navigate(`/kata/contests/${contestId}/submissions`);
                }
            } else {
                setSubmitError(data.error || 'Submission failed');
                setSubmitting(false);
            }
        } catch (err) {
            setSubmitError('Network failure during submission');
            setSubmitting(false);
        }
    };

    const p = problemData?.problem;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} contestId={contestId} />
            <KataContestSubNav contestId={contestId} letter={letter} isProblemset={isProblemset} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '0 10px 40px 10px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
                    {/* Left Column: Problem Statement Sheet in Helvetica */}
                    <div>
                        {loading ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#777' }}>
                                Loading problem statement...
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
                                <strong>Notice:</strong> {errorMsg}
                            </div>
                        ) : p ? (
                            <div style={{
                                border: 'none',
                                borderRadius: '4px',
                                padding: '24px 28px',
                                background: '#ffffff',
                                boxShadow: 'none',
                                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                color: '#222222'
                            }}>
                                {/* Centered Problem Header */}
                                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '6px' }}>
                                        {letter.toUpperCase()}. {p.title}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#555555', lineHeight: '1.5' }}>
                                        <div>time limit per test: {p.timeLimit || 1.0} second</div>
                                        <div>memory limit per test: {p.memoryLimit || 256} megabytes</div>
                                        <div>input: standard input</div>
                                        <div>output: standard output</div>
                                    </div>
                                </div>

                                {/* Statement Body with LaTeX Parsing */}
                                <div style={{ marginBottom: '20px', textAlign: 'justify' }}>
                                    <LatexRenderer text={p.statementHtml} />
                                </div>

                                {/* Input Specification */}
                                {p.inputFormat && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{
                                            fontWeight: 'bold',
                                            fontSize: '14px',
                                            color: '#1a1a1a',
                                            marginBottom: '6px'
                                        }}>
                                            Input
                                        </div>
                                        <div style={{ textAlign: 'justify' }}>
                                            <LatexRenderer text={p.inputFormat} />
                                        </div>
                                    </div>
                                )}

                                {/* Output Specification */}
                                {p.outputFormat && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{
                                            fontWeight: 'bold',
                                            fontSize: '14px',
                                            color: '#1a1a1a',
                                            marginBottom: '6px'
                                        }}>
                                            Output
                                        </div>
                                        <div style={{ textAlign: 'justify' }}>
                                            <LatexRenderer text={p.outputFormat} />
                                        </div>
                                    </div>
                                )}

                                {/* Sample Test Cases Box */}
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        color: '#1a1a1a',
                                        marginBottom: '6px'
                                    }}>
                                        Examples
                                    </div>
                                    <div style={{
                                        border: '1px solid #b9b9b9',
                                        borderRadius: '3px',
                                        overflow: 'hidden',
                                        fontFamily: 'Consolas, "Lucida Console", "Courier New", monospace',
                                        fontSize: '12px'
                                    }}>
                                        {/* Input Box */}
                                        <div style={{
                                            background: '#efefef',
                                            padding: '4px 10px',
                                            borderBottom: '1px solid #b9b9b9',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            fontWeight: 'bold',
                                            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                                            fontSize: '11px'
                                        }}>
                                            <span>input</span>
                                            <button
                                                type="button"
                                                onClick={handleCopySampleInput}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#315682',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    padding: 0
                                                }}
                                            >
                                                {copiedInput ? '✓ Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre style={{
                                            margin: 0,
                                            padding: '8px 10px',
                                            background: '#ffffff',
                                            borderBottom: '1px solid #b9b9b9',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all'
                                        }}>
                                            {p.sampleInput}
                                        </pre>

                                        {/* Output Box */}
                                        <div style={{
                                            background: '#efefef',
                                            padding: '4px 10px',
                                            borderBottom: '1px solid #b9b9b9',
                                            fontWeight: 'bold',
                                            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                                            fontSize: '11px'
                                        }}>
                                            output
                                        </div>
                                        <pre style={{
                                            margin: 0,
                                            padding: '8px 10px',
                                            background: '#ffffff',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all'
                                        }}>
                                            {p.sampleOutput}
                                        </pre>
                                    </div>
                                </div>

                                {/* Note Section */}
                                {p.note && (
                                    <div>
                                        <div style={{
                                            fontWeight: 'bold',
                                            fontSize: '14px',
                                            color: '#1a1a1a',
                                            marginBottom: '6px'
                                        }}>
                                            Note
                                        </div>
                                        <div style={{ textAlign: 'justify', fontSize: '13px', color: '#444' }}>
                                            <LatexRenderer text={p.note} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Right Sidebar: Quick Submit & Score Card in Verdana */}
                    <div style={{ fontFamily: 'Verdana, sans-serif' }}>
                        {/* Candidate 2-Hour Timer Card */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '5px',
                            marginBottom: '16px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #e0e0e0',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                background: '#f0f4f8',
                                color: '#2d568c'
                            }}>
                                {isLiveContest 
                                    ? 'Candidate Timer (2 Hours)' 
                                    : (candidateTimer?.isVirtual ? 'Virtual Contest Timer (2 Hours)' : 'Practice & Virtual Mode')}
                            </div>
                            <div style={{ padding: '12px', textAlign: 'center' }}>
                                {isLiveContest || candidateTimer?.isVirtual ? (
                                    candidateTimer?.isStarted ? (
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
                                                    Submissions lock when this reaches 00:00:00 (2h window)
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
                                                    Submissions are locked for this round.
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>
                                                {startingTimer ? 'Initiating 2-hour contest window...' : 'Starting contest countdown...'}
                                            </div>
                                            <div style={{
                                                fontSize: '22px',
                                                fontWeight: 'bold',
                                                fontFamily: 'Consolas, monospace',
                                                color: '#16a34a',
                                                letterSpacing: '1px'
                                            }}>
                                                02:00:00
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div>
                                        <div style={{
                                            fontSize: '13px',
                                            fontWeight: 'bold',
                                            color: '#16a34a',
                                            marginBottom: '4px'
                                        }}>
                                            ✓ Practice Mode Active
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.4', marginBottom: '8px' }}>
                                            {isForma 
                                                ? 'Forma solutions are evaluated against automated rubrics upon submission.' 
                                                : 'Shin solutions are compiled and evaluated against authoritative test suites upon submission.'}
                                        </div>
                                        <div style={{
                                            fontSize: '10px',
                                            color: '#854d0e',
                                            background: '#fefce8',
                                            border: '1px solid #fef08a',
                                            borderRadius: '3px',
                                            padding: '5px 8px',
                                            lineHeight: '1.4'
                                        }}>
                                            ⏱ <strong>Submission Gap:</strong> {isForma ? '45 seconds' : '30 seconds'} between submissions per candidate to maintain system stability.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Submit Card */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '5px',
                            marginBottom: '16px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #e0e0e0',
                                fontWeight: 'bold',
                                fontSize: '13px',
                                color: '#2d568c'
                            }}>
                                → Submit Solution
                            </div>
                            <div style={{ padding: '14px 12px' }}>
                                <form onSubmit={handleQuickSubmit}>
                                    {submitError && (
                                        <div style={{ color: '#d9534f', fontSize: '11px', marginBottom: '8px' }}>
                                            {submitError}
                                        </div>
                                    )}

                                    {isExpired ? (
                                        <div style={{
                                            padding: '10px',
                                            background: '#fef2f2',
                                            border: '1px solid #fecaca',
                                            borderRadius: '4px',
                                            color: '#991b1b',
                                            fontSize: '11px',
                                            textAlign: 'center',
                                            fontWeight: 'bold',
                                            marginBottom: '12px'
                                        }}>
                                            🔒 Submissions Locked<br />
                                            <span style={{ fontWeight: 'normal', fontSize: '10px' }}>
                                                Your 2-hour contest window has ended.
                                            </span>
                                        </div>
                                    ) : isForma ? (
                                        /* Forma Web Engineering Submission */
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', fontSize: '12px' }}>
                                                <div style={{ width: '75px', fontWeight: '500', color: '#222' }}>
                                                    Language:
                                                </div>
                                                <div style={{ flex: 1, fontSize: '11px', color: '#334155', fontWeight: 'bold' }}>
                                                    HTML / CSS / JavaScript
                                                </div>
                                            </div>

                                            {/* Choose file row */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '14px', fontSize: '12px' }}>
                                                <div style={{ width: '75px', fontWeight: '500', color: '#222', lineHeight: '1.2' }}>
                                                    Choose<br />file:
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <input
                                                        type="file"
                                                        accept=".html,.css,.js,.txt,.zip"
                                                        onChange={handleFileChange}
                                                        style={{ fontSize: '11px', width: '100%' }}
                                                    />
                                                    {selectedFileName && (
                                                        <div style={{ fontSize: '10px', color: '#008000', marginTop: '3px' }}>
                                                            ✓ Loaded: {selectedFileName}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Link to submit code editor */}
                                            <div style={{ marginBottom: '12px', textAlign: 'right' }}>
                                                <Link
                                                    to={`/kata/contests/${contestId}/submit?problem=${letter}`}
                                                    style={{
                                                        color: '#315682',
                                                        fontSize: '11px',
                                                        textDecoration: 'underline'
                                                    }}
                                                >
                                                    + or write or paste code text »
                                                </Link>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Shin C++ Submission */
                                        <div>
                                            {/* Language row */}
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', fontSize: '12px' }}>
                                                <div style={{ width: '75px', fontWeight: '500', color: '#222' }}>
                                                    Language:
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <select
                                                        style={{
                                                            width: '100%',
                                                            padding: '3px 4px',
                                                            fontSize: '11px',
                                                            border: '1px solid #777',
                                                            borderRadius: '3px',
                                                            background: '#ffffff'
                                                        }}
                                                        defaultValue="cpp23"
                                                    >
                                                        <option value="cpp23">GNU G++23 14.2 (64 bit, msys2)</option>
                                                        <option value="cpp17">GNU G++17 7.3.0</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Choose file row */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '14px', fontSize: '12px' }}>
                                                <div style={{ width: '75px', fontWeight: '500', color: '#222', lineHeight: '1.2' }}>
                                                    Choose<br />file:
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <input
                                                        type="file"
                                                        accept=".cpp,.c,.cc,.cxx,.txt"
                                                        onChange={handleFileChange}
                                                        style={{ fontSize: '11px', width: '100%' }}
                                                    />
                                                    {selectedFileName && (
                                                        <div style={{ fontSize: '10px', color: '#008000', marginTop: '3px' }}>
                                                            ✓ Loaded: {selectedFileName}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Link to submit code editor */}
                                            <div style={{ marginBottom: '12px', textAlign: 'right' }}>
                                                <Link
                                                    to={`/kata/contests/${contestId}/submit?problem=${letter}`}
                                                    style={{
                                                        color: '#315682',
                                                        fontSize: '11px',
                                                        textDecoration: 'underline'
                                                    }}
                                                >
                                                    + or write or paste code text »
                                                </Link>
                                            </div>
                                        </div>
                                    )}

                                    {/* Centered Submit Button */}
                                    <div style={{ textAlign: 'center', marginTop: '10px' }}>
                                        <button
                                            type="submit"
                                            disabled={submitting || isExpired || subCooldownLeft > 0}
                                            style={{
                                                background: (submitting || isExpired || subCooldownLeft > 0)
                                                    ? '#f4f4f4'
                                                    : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                color: (submitting || isExpired || subCooldownLeft > 0) ? '#888888' : '#000000',
                                                border: (submitting || isExpired || subCooldownLeft > 0) ? '1px solid #cccccc' : '1px solid #767676',
                                                borderRadius: '2px',
                                                padding: '4px 22px',
                                                fontSize: '13px',
                                                fontWeight: 'normal',
                                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                cursor: (submitting || isExpired || subCooldownLeft > 0) ? 'not-allowed' : 'pointer',
                                                boxShadow: (submitting || isExpired || subCooldownLeft > 0) ? 'none' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                            }}
                                        >
                                            {isExpired 
                                                ? 'Submissions Locked' 
                                                : subCooldownLeft > 0 
                                                    ? `Wait ${subCooldownLeft}s (${isForma ? '45s' : '30s'} gap)...` 
                                                    : submitting ? 'Submitting...' : 'Submit'}
                                        </button>

                                        {subCooldownLeft > 0 && (
                                            <div style={{
                                                marginTop: '8px',
                                                padding: '5px 8px',
                                                background: '#fefce8',
                                                border: '1px solid #fde047',
                                                borderRadius: '3px',
                                                color: '#854d0e',
                                                fontSize: '11px',
                                                textAlign: 'center'
                                            }}>
                                                ⏱ <strong>Submission gap active:</strong> Please wait {subCooldownLeft}s before submitting again ({isForma ? '45s gap for Forma' : '30s gap for Shin'} to prevent server overload).
                                            </div>
                                        )}
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Last Submissions Card (Codeforces Style) */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            marginBottom: '16px'
                        }}>
                            <div style={{
                                background: '#f0f4f8',
                                padding: '6px 10px',
                                borderBottom: '1px solid #b9b9b9',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                color: '#315682'
                            }}>
                                → Last submissions
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #e1e1e1', height: '26px' }}>
                                            <th style={{ padding: '4px 6px', fontWeight: 'bold', color: '#333333', borderRight: '1px solid #e1e1e1', width: '30%' }}>Submission</th>
                                            <th style={{ padding: '4px 6px', fontWeight: 'bold', color: '#333333', borderRight: '1px solid #e1e1e1', width: '38%', textAlign: 'center' }}>Time</th>
                                            <th style={{ padding: '4px 6px', fontWeight: 'bold', color: '#333333', width: '32%', textAlign: 'center' }}>Verdict</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(problemData?.lastSubmissions && problemData.lastSubmissions.length > 0) ? (
                                            problemData.lastSubmissions.map((s, idx) => {
                                                const isEven = idx % 2 === 0;
                                                const subId = s.submissionId || (s.id ? String(s.id).slice(-8) : `sub-${idx}`);
                                                const subLink = isProblemset 
                                                    ? `/status?problemset=true&submissionId=${subId}` 
                                                    : `/kata/contests/${contestId}/submissions`;
                                                return (
                                                    <tr key={s.id || idx} style={{ background: isEven ? '#ffffff' : '#f9f9f9', borderBottom: '1px solid #f0f0f0', height: '28px' }}>
                                                        <td style={{ padding: '4px 6px', borderRight: '1px solid #e1e1e1' }}>
                                                            <Link 
                                                                to={subLink} 
                                                                style={{ color: '#0000cc', textDecoration: 'underline' }}
                                                                title={`View submission ${subId}`}
                                                            >
                                                                {subId}
                                                            </Link>
                                                        </td>
                                                        <td style={{ padding: '4px 6px', borderRight: '1px solid #e1e1e1', textAlign: 'center', color: '#333333', whiteSpace: 'nowrap' }}>
                                                            {formatCodeforcesTime(s.submittedAt)}
                                                        </td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                            {renderVerdictBadge(s.verdict)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={3} style={{ padding: '12px 8px', textAlign: 'center', color: '#888888', fontStyle: 'italic' }}>
                                                    No submissions yet for this problem
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Problem Score Info */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            marginBottom: '16px'
                        }}>
                            <div style={{
                                background: '#f0f4f8',
                                padding: '6px 10px',
                                borderBottom: '1px solid #b9b9b9',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                color: '#333'
                            }}>
                                Problem Information
                            </div>
                            <div style={{ padding: '10px 12px', fontSize: '11px', lineHeight: '1.6' }}>
                                <div><strong>Problem:</strong> {letter.toUpperCase()}</div>
                                <div><strong>Score:</strong> <span style={{ color: '#008000', fontWeight: 'bold' }}>{problemData?.points || 100} points</span></div>
                                <div><strong>Track:</strong> {contestId.startsWith('SHIN') ? 'KataShin (Saturday)' : 'KataForma (Sunday)'}</div>
                                <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />
                                <Link to={`/kata/contests/${contestId}`} style={{ color: '#315682' }}>
                                    « Back to Problems Table
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <KataFooter />
        </div>
    );
}
