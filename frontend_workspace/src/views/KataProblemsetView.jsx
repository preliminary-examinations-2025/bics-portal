import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import CodeforcesActionCell from '../components/CodeforcesActionCell';
import CodeforcesPayAttentionBox from '../components/CodeforcesPayAttentionBox';
import { useAuth } from '../context/AuthContext';

export default function KataProblemsetView() {
    const { candidate: authUser, profile: authProfile } = useAuth();
    const [problems, setProblems] = useState([]);
    const [activeContest, setActiveContest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [profile, setProfile] = useState(authProfile);
    const [user, setUser] = useState(authUser);

    // Filters and settings matching Ref Img 4
    const [diffMin, setDiffMin] = useState('');
    const [diffMax, setDiffMax] = useState('');
    const [tagSearch, setTagSearch] = useState('');
    const [showTags, setShowTags] = useState(true);
    const [hideSolved, setHideSolved] = useState(false);
    const [textFilter, setTextFilter] = useState('');

    const handle = authProfile?.handle || authUser?.username || localStorage.getItem('kata_handle') || '';

    useEffect(() => {
        if (authProfile) setProfile(authProfile);
        if (authUser) setUser(authUser);
    }, [authProfile, authUser]);

    useEffect(() => {
        document.title = 'Problemset | Kata | BICS Portal';

        fetch(`/api/kata/problemset?handle=${encodeURIComponent(handle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setProblems(data.problems || []);
                    setActiveContest(data.activeContest || null);
                } else {
                    setErrorMsg(data.error || 'Failed to load problemset');
                }
                setLoading(false);
            })
            .catch(err => {
                setErrorMsg('Network error fetching problem archive');
                setLoading(false);
            });
    }, [handle]);

    // Filter problems
    const filteredProblems = problems.filter(p => {
        if (textFilter && !p.title.toLowerCase().includes(textFilter.toLowerCase()) && !p.code.toLowerCase().includes(textFilter.toLowerCase())) {
            return false;
        }
        if (tagSearch) {
            const hasTag = (p.tags || []).some(t => t.toLowerCase().includes(tagSearch.toLowerCase()));
            if (!hasTag) return false;
        }
        if (hideSolved && p.isSolved) return false;
        if (diffMin && Number(p.difficulty) < Number(diffMin)) return false;
        if (diffMax && Number(p.difficulty) > Number(diffMax)) return false;
        return true;
    });

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '20px auto 40px auto', padding: '0 10px', flex: 1, boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
                    {/* Left Column: Codeforces Problemset Table (Ref Img 4) */}
                    <div>
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            {/* Table Title Bar */}
                            <div style={{
                                background: '#ffffff',
                                padding: '6px 12px',
                                borderBottom: '1px solid #b9b9b9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontWeight: 'bold',
                                    fontSize: '13px',
                                    color: '#333333'
                                }}>
                                    <span>Problems</span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
                                        <line x1="8" y1="6" x2="21" y2="6"></line>
                                        <line x1="8" y1="12" x2="21" y2="12"></line>
                                        <line x1="8" y1="18" x2="21" y2="18"></line>
                                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                    </svg>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input 
                                        type="text"
                                        placeholder="Search problems..."
                                        value={textFilter}
                                        onChange={(e) => setTextFilter(e.target.value)}
                                        style={{
                                            border: '1px solid #b5b5b5',
                                            borderRadius: '3px',
                                            padding: '2px 6px',
                                            fontSize: '11px',
                                            width: '130px'
                                        }}
                                    />
                                    <span style={{ color: '#888', fontSize: '11px' }}>🔍</span>
                                </div>
                            </div>

                            {/* Table Content */}
                            {loading ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#777' }}>
                                    Loading problemset catalog...
                                </div>
                            ) : errorMsg ? (
                                <div style={{ padding: '16px', color: '#b94a48', fontSize: '12px' }}>
                                    {errorMsg}
                                </div>
                            ) : filteredProblems.length === 0 ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                                    <strong>No problems found matching filter.</strong>
                                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#888' }}>
                                        Problems from concluded contests are automatically published here.
                                    </div>
                                </div>
                            ) : (
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '13px',
                                    fontFamily: 'Verdana, sans-serif'
                                }}>
                                    <thead>
                                        <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #b9b9b9', height: '38px' }}>
                                            <th style={{ width: '5px', padding: 0 }} />
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '60px', fontWeight: 'bold', fontSize: '13px' }}>#</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 'bold', fontSize: '13px' }}>Name</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px', fontWeight: 'bold', fontSize: '13px' }}>⚡</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '75px', fontWeight: 'bold', fontSize: '13px' }}>✔</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProblems.map((p, idx) => {
                                            const isSolved = p.isSolved;
                                            const isPartiallySolved = !isSolved && p.isPartiallySolved;
                                            const isEven = idx % 2 === 0;

                                            let stripeBg = 'transparent';
                                            let rowBg = isEven ? '#ffffff' : '#f9fafb';

                                            if (isSolved) {
                                                stripeBg = '#c2e59c';
                                                rowBg = '#f4fbf4';
                                            } else if (isPartiallySolved) {
                                                stripeBg = '#eab308'; // Yellow/amber stripe for partially solved
                                                rowBg = '#fefce8';    // Soft yellow row background
                                            }

                                            return (
                                                <tr 
                                                    key={p.code}
                                                    style={{
                                                        background: rowBg,
                                                        borderBottom: '1px solid #ebebeb',
                                                        height: '52px',
                                                        verticalAlign: 'middle'
                                                    }}
                                                >
                                                    {/* Dedicated Left Solved Status Stripe matching crop_left.png */}
                                                    <td style={{
                                                        width: '5px',
                                                        minWidth: '5px',
                                                        maxWidth: '5px',
                                                        padding: 0,
                                                        background: stripeBg,
                                                        borderRight: '1px solid #e1e1e1'
                                                    }} />

                                                    {/* Problem Code as Blue Link */}
                                                    <td style={{
                                                        padding: '8px 10px',
                                                        width: '60px',
                                                        fontSize: '13px'
                                                    }}>
                                                        <Link 
                                                            to={`/problemset/problem/${p.contestId}/${p.letter}`}
                                                            style={{ color: '#00a4d3', fontWeight: 'bold', textDecoration: 'none' }}
                                                            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                                            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                                        >
                                                            {p.code}
                                                        </Link>
                                                    </td>

                                                    {/* Problem Title & Tags */}
                                                    <td style={{ padding: '8px 10px', fontSize: '13px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px' }}>
                                                            <Link 
                                                                to={`/problemset/problem/${p.contestId}/${p.letter}`}
                                                                style={{ color: '#222222', fontWeight: '500', textDecoration: 'none' }}
                                                            >
                                                                {p.title}
                                                            </Link>
                                                            {showTags && p.tags && (
                                                                <span style={{ fontSize: '11px', color: '#777777' }}>
                                                                    {p.tags.join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Codeforces paper plane & star action cell with #d4edc9 solved highlight */}
                                                    <CodeforcesActionCell
                                                        isSolved={p.isSolved}
                                                        isPartiallySolved={isPartiallySolved}
                                                        to={`/problemset/problem/${p.contestId}/${p.letter}`}
                                                        title={`Submit solution to ${p.code}`}
                                                    />

                                                {/* Solved Count */}
                                                <td style={{ padding: '8px 10px', textAlign: 'center', width: '75px', fontSize: '13px' }}>
                                                    <span style={{ color: '#2d568c', fontWeight: '500' }}>
                                                        👤 x{p.solvedCount || 0}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Right Sidebar: Ref Img 4 (Pay Attention, Filter Problems, Settings) */}
                    <div style={{ fontFamily: 'Verdana, sans-serif' }}>
                        {/* → Pay attention Card (Codeforces Ref Img 2 & up to 2 contests) */}
                        <div style={{ marginBottom: '16px' }}>
                            <CodeforcesPayAttentionBox handle={handle} />
                        </div>

                        {/* → Filter Problems Card (Ref Img 4) */}
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
                                fontSize: '13px',
                                color: '#2d568c'
                            }}>
                                → Filter Problems
                            </div>
                            <div style={{ padding: '12px', fontSize: '11px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ width: '65px', fontWeight: 'bold' }}>Difficulty:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input
                                            type="text"
                                            value={diffMin}
                                            onChange={(e) => setDiffMin(e.target.value)}
                                            style={{ width: '45px', padding: '2px 4px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '2px' }}
                                        />
                                        <span>—</span>
                                        <input
                                            type="text"
                                            value={diffMax}
                                            onChange={(e) => setDiffMax(e.target.value)}
                                            style={{ width: '45px', padding: '2px 4px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '2px' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ width: '65px', fontWeight: 'bold' }}>Tag:</span>
                                    <input
                                        type="text"
                                        placeholder="e.g. math, dp"
                                        value={tagSearch}
                                        onChange={(e) => setTagSearch(e.target.value)}
                                        style={{ width: '130px', padding: '2px 4px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '2px' }}
                                    />
                                </div>

                                <div style={{ textAlign: 'center' }}>
                                    <button
                                        type="button"
                                        style={{
                                            background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                            color: '#000000',
                                            border: '1px solid #767676',
                                            borderRadius: '2px',
                                            padding: '3px 18px',
                                            fontSize: '12px',
                                            fontWeight: 'normal',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            cursor: 'pointer',
                                            boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                        }}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* → Settings Card (Ref Img 4) */}
                        <div style={{
                            border: '1px solid #b9b9b9',
                            borderRadius: '4px',
                            background: '#ffffff',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid #e0e0e0',
                                fontWeight: 'bold',
                                fontSize: '13px',
                                color: '#2d568c'
                            }}>
                                → Settings
                            </div>
                            <div style={{ padding: '12px', fontSize: '11px', lineHeight: '1.8' }}>
                                <div>
                                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input 
                                            type="checkbox"
                                            checked={showTags}
                                            onChange={(e) => setShowTags(e.target.checked)}
                                        />
                                        Show tags for unsolved problems
                                    </label>
                                </div>
                                <div>
                                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input 
                                            type="checkbox"
                                            checked={hideSolved}
                                            onChange={(e) => setHideSolved(e.target.checked)}
                                        />
                                        Hide solved problems
                                    </label>
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
