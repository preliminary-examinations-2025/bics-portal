import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import KataContestSubNav from '../components/KataContestSubNav';
import CodeforcesSubmissionsTable from '../components/CodeforcesSubmissionsTable';
import CodeforcesPillFilter from '../components/CodeforcesPillFilter';
import { useAuth } from '../context/AuthContext';

export default function KataContestSubmissionsView({ isProblemsetRoute }) {
    const { contestId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const searchParams = new URLSearchParams(location.search);
    const filterAll = location.search.includes('all=true');
    const isProblemset = isProblemsetRoute || location.pathname.includes('/problemset') || searchParams.get('problemset') === 'true';
    const effectiveContestId = contestId || searchParams.get('contestId') || '';

    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [problemFilter, setProblemFilter] = useState('ALL');
    const [verdictFilter, setVerdictFilter] = useState('ALL');
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);

    const handle = authProfile?.handle || authUser?.username || localStorage.getItem('kata_handle') || '';
    const pollIntervalRef = useRef(null);

    const isOverallMode = !contestId;

    useEffect(() => {
        if (authProfile) setProfile(authProfile);
        if (authUser) setUser(authUser);
    }, [authProfile, authUser]);

    const fetchSubmissions = async () => {
        try {
            let url = '';
            if (isOverallMode) {
                // Platform-wide overall submissions
                url = filterAll 
                    ? `/api/kata/submissions?limit=60` 
                    : `/api/kata/submissions?handle=${encodeURIComponent(handle)}&limit=60`;
            } else {
                // Specific contest submissions
                url = `/api/kata/contests/${contestId}/submissions?handle=${encodeURIComponent(handle)}&all=${filterAll ? 'true' : 'false'}`;
            }

            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setSubmissions(data.submissions || []);
            }
        } catch (err) {
            console.error('Error fetching submissions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const pageTitle = isOverallMode
            ? `${filterAll ? 'Status' : 'My Submissions'} | Kata`
            : `${filterAll ? 'Contest Status' : 'My Contest Submissions'} | ${contestId} | Kata`;
        document.title = pageTitle;
        setLoading(true);
        fetchSubmissions();
    }, [contestId, handle, filterAll, isOverallMode]);

    // Live poller for pending submissions: stops polling immediately once all are terminal
    useEffect(() => {
        const hasRunningTests = submissions.some(s => s.verdict?.toLowerCase().startsWith('running'));
        const hasPending = submissions.some(s => 
            s.verdict === 'In queue' || s.verdict === 'Compiling' || s.verdict?.toLowerCase().startsWith('running')
        );

        if (hasPending) {
            const intervalMs = hasRunningTests ? 1000 : 2000;
            pollIntervalRef.current = setInterval(() => {
                fetchSubmissions();
            }, intervalMs);
        } else {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [submissions]);

    const setFilterAllMode = (isAll) => {
        if (isAll) {
            navigate(`?all=true`);
        } else {
            navigate(location.pathname);
        }
    };

    // Filtered submissions based on problem letter and verdict
    const displayedSubmissions = submissions.filter(s => {
        if (problemFilter !== 'ALL' && s.problemLetter?.toUpperCase() !== problemFilter) return false;
        if (verdictFilter === 'Accepted' && s.verdict !== 'Accepted') return false;
        if (verdictFilter === 'Rejected' && s.verdict === 'Accepted') return false;
        return true;
    });

    // Table title matching img ref 2
    const tableTitle = isOverallMode
        ? (filterAll ? "Status" : "My submissions")
        : (filterAll ? "Contest status" : "My contest submissions");

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222222', fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
            <KataHeader user={user} profile={profile} contestId={effectiveContestId || contestId} />
            {(contestId || isProblemset) && <KataContestSubNav contestId={effectiveContestId || contestId} isProblemset={isProblemset} />}

            <main style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '14px 10px 40px 10px', flex: 1, boxSizing: 'border-box' }}>
                {/* Header & Filter Controls Row */}
                <div style={{
                    borderBottom: '1px solid #b9b9b9',
                    paddingBottom: '10px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <h1 style={{
                            fontSize: '17px',
                            margin: 0,
                            fontWeight: 'bold',
                            color: '#3b88c3',
                            fontFamily: "'Cuprum', Verdana, sans-serif"
                        }}>
                            {isOverallMode
                                ? (filterAll ? 'Status (Overall Feed)' : 'My Submissions (Overall)')
                                : `${filterAll ? 'Contest Status' : 'My Contest Submissions'} — ${contestId}`}
                        </h1>

                        {/* Mode Toggle Buttons with Codeforces sliding dark cloud pill */}
                        <CodeforcesPillFilter
                            items={[
                                { id: 'mine', label: 'My Submissions' },
                                { id: 'all', label: 'Status (All)' }
                            ]}
                            activeId={filterAll ? 'all' : 'mine'}
                            onChange={(id) => setFilterAllMode(id === 'all')}
                        />
                    </div>

                    {/* Filter Dropdowns */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: '#555555' }}>Problem:</span>
                            <select
                                value={problemFilter}
                                onChange={(e) => setProblemFilter(e.target.value)}
                                style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '3px', border: '1px solid #cbd5e1' }}
                            >
                                <option value="ALL">All (A-E)</option>
                                <option value="A">Problem A</option>
                                <option value="B">Problem B</option>
                                <option value="C">Problem C</option>
                                <option value="D">Problem D</option>
                                <option value="E">Problem E</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: '#555555' }}>Verdict:</span>
                            <select
                                value={verdictFilter}
                                onChange={(e) => setVerdictFilter(e.target.value)}
                                style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '3px', border: '1px solid #cbd5e1' }}
                            >
                                <option value="ALL">All Verdicts</option>
                                <option value="Accepted">Accepted Only</option>
                                <option value="Rejected">Rejected Only</option>
                            </select>
                        </div>

                        <button
                            onClick={fetchSubmissions}
                            style={{
                                background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                border: '1px solid #767676',
                                padding: '3px 12px',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                color: '#000000',
                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                            }}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Codeforces Submissions Table (replicates img ref 2) */}
                <CodeforcesSubmissionsTable
                    title={tableTitle}
                    submissions={displayedSubmissions}
                    loading={loading}
                    contestId={contestId}
                    emptyMessage={
                        <div>
                            No submissions match the current filter.
                            {!filterAll && contestId && (
                                <div style={{ marginTop: '8px' }}>
                                    <Link to={`/kata/contests/${contestId}/submit`} style={{ color: '#315682', fontWeight: 'bold' }}>
                                        Submit your solution »
                                    </Link>
                                </div>
                            )}
                        </div>
                    }
                />
            </main>
            <KataFooter />
        </div>
    );
}
