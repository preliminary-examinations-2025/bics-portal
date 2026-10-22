import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import CodeforcesEditor from './CodeforcesEditor';

/**
 * Helper to compute consistent 9-digit submission ID in the format:
 * <time + last 3 digits of studentid>
 * e.g. at 23:24:15 by student STU1001 -> "232415001"
 */
export function getDisplaySubmissionId(sub) {
    if (!sub) return '000000001';

    // If backend already provided a valid numeric submissionId
    if (sub.submissionId && /^\d+$/.test(String(sub.submissionId))) {
        return String(sub.submissionId);
    }
    if (sub.numericId && /^\d+$/.test(String(sub.numericId))) {
        return String(sub.numericId);
    }

    const d = sub.submittedAt ? new Date(sub.submittedAt) : (sub.createdAt ? new Date(sub.createdAt) : new Date());
    const hours = String(isNaN(d.getHours()) ? 0 : d.getHours()).padStart(2, '0');
    const minutes = String(isNaN(d.getMinutes()) ? 0 : d.getMinutes()).padStart(2, '0');
    const seconds = String(isNaN(d.getSeconds()) ? 0 : d.getSeconds()).padStart(2, '0');
    const timeDigits = `${hours}${minutes}${seconds}`;

    const studentIdent = sub.studentId || sub.candidateId || sub.username || '001';
    const rawDigits = String(studentIdent).replace(/\D/g, '');
    let studentDigits = '001';
    if (rawDigits.length >= 3) {
        studentDigits = rawDigits.slice(-3);
    } else if (rawDigits.length > 0) {
        studentDigits = rawDigits.padStart(3, '0');
    } else {
        let hash = 0;
        const str = String(studentIdent);
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) % 900;
        }
        studentDigits = String(Math.abs(hash) + 100);
    }

    return `${timeDigits}${studentDigits}`;
}


/**
 * Format date & time into two lines matching img ref 2:
 * Line 1: Oct/07/2026
 * Line 2: 22:38 UTC+5.5
 */
export function formatCfTimestamp(dateInput) {
    if (!dateInput) return { dateStr: '—', timeStr: '—' };
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return { dateStr: '—', timeStr: '—' };

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const dateStr = `${month}/${day}/${year}`;

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    return { dateStr, timeStr };
}

/**
 * Format language label matching img ref 2:
 * "C++23 (GCC 14-64, msys2)" or "HTML/CSS/JS (Web V8)"
 */
export function formatCfLanguage(lang) {
    const l = (lang || '').toLowerCase();
    if (l === 'web' || l === 'forma' || l.includes('html')) {
        return (
            <div>
                <div>HTML/CSS/JS</div>
                <div>(Web V8)</div>
            </div>
        );
    }
    return (
        <div>
            <div>C++23 (GCC 14-64,</div>
            <div>msys2)</div>
        </div>
    );
}

/**
 * Format verdict with exact Codeforces colors & line-wrapping:
 * Accepted -> bold #00a000
 * Wrong answer on test X -> bold #0000a0
 * Time limit exceeded on test X -> bold #0000a0
 * Compilation error -> bold #cc0000
 */
export function formatCfVerdict(verdict, onCompileErrorClick) {
    if (!verdict) return <span style={{ color: '#555555' }}>—</span>;

    const trimmed = verdict.trim();

    // Do not write AI evaluation anywhere, write Awaiting Evaluation (styled just like Deprecated)
    if (
        trimmed === 'Awaiting Evaluation' ||
        trimmed.toLowerCase().includes('awaiting ai evaluation') ||
        trimmed.toLowerCase().includes('awaiting evaluation') ||
        trimmed.toLowerCase().includes('ai evaluation')
    ) {
        return (
            <span style={{ color: '#777777', fontStyle: 'italic', fontSize: '12px' }} title="Evaluation will be released with official standings">
                Awaiting Evaluation
            </span>
        );
    }

    if (trimmed === 'Deprecated' || trimmed === 'Superseded') {
        return (
            <span style={{ color: '#777777', fontStyle: 'italic', fontSize: '12px' }} title="Earlier submission superseded by candidate's newer solution">
                Deprecated
            </span>
        );
    }

    if (trimmed === 'Accepted') {
        return (
            <span style={{ color: '#00a000', fontWeight: 'bold', fontSize: '12px' }}>
                Accepted
            </span>
        );
    }

    if (trimmed === 'Partially Accepted' || trimmed.toLowerCase().startsWith('partially accepted')) {
        return (
            <span style={{ color: '#ca8a04', fontWeight: 'bold', fontSize: '12px' }}>
                Partially Accepted
            </span>
        );
    }

    if (trimmed.toLowerCase().startsWith('wrong answer')) {
        const parts = trimmed.split(' on ');
        return (
            <div style={{ color: '#222222', fontSize: '12px', lineHeight: '1.25' }}>
                <div>Wrong answer{parts[1] ? ' on' : ''}</div>
                {parts[1] && <div>{parts[1]}</div>}
            </div>
        );
    }

    if (trimmed.startsWith('Time limit')) {
        const parts = trimmed.split(' on ');
        return (
            <div style={{ color: '#0000a0', fontWeight: 'bold', fontSize: '12px', lineHeight: '1.25' }}>
                <div>Time limit exceeded on</div>
                <div>{parts[1] || 'test 1'}</div>
            </div>
        );
    }

    if (trimmed.startsWith('Memory limit')) {
        const parts = trimmed.split(' on ');
        return (
            <div style={{ color: '#0000a0', fontWeight: 'bold', fontSize: '12px', lineHeight: '1.25' }}>
                <div>Memory limit exceeded on</div>
                <div>{parts[1] || 'test 1'}</div>
            </div>
        );
    }

    if (trimmed === 'Compilation error') {
        return (
            <span
                onClick={onCompileErrorClick}
                style={{
                    color: '#cc0000',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: onCompileErrorClick ? 'pointer' : 'default',
                    textDecoration: onCompileErrorClick ? 'underline' : 'none'
                }}
                title={onCompileErrorClick ? 'Click to inspect compilation diagnostic' : ''}
            >
                Compilation error
            </span>
        );
    }

    if (trimmed.toLowerCase().startsWith('running')) {
        const textWithDots = trimmed.endsWith('...') ? trimmed : `${trimmed}...`;
        return (
            <span style={{ color: '#666666', fontWeight: 'normal', fontSize: '12px' }}>
                {textWithDots}
            </span>
        );
    }

    if (trimmed === 'In queue' || trimmed === 'Compiling') {
        const textWithDots = trimmed.endsWith('...') ? trimmed : `${trimmed}...`;
        return (
            <span style={{ color: '#666666', fontWeight: 'normal', fontSize: '12px' }}>
                {textWithDots}
            </span>
        );
    }

    return (
        <span style={{ color: '#b94a48', fontWeight: 'bold', fontSize: '12px' }}>
            {trimmed}
        </span>
    );
}

/**
 * CodeforcesSubmissionsTable Component
 * Replicates the exact Codeforces submissions table layout (img ref 2):
 * - Rounded top card container with border #b9b9b9
 * - Gradient header bar with title and search icon
 * - Columns: # | When | Who | Problem | Lang | Verdict | Time | Memory
 * - Alternating zebra striping: #eef5fe and #ffffff
 * - Light gray vertical cell dividers #e1e1e1
 * - Clickable # opens modal with source code and line-number gutter
 */
// Helper to parse Forma submissions stored as JSON ({ html, css, js })
function extractFormaCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string') return null;
    const trimmed = rawCode.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && (typeof parsed.html === 'string' || typeof parsed.css === 'string' || typeof parsed.js === 'string')) {
                return {
                    html: parsed.html || '',
                    css: parsed.css || '',
                    js: parsed.js || ''
                };
            }
        } catch (e) {
            // Not valid JSON, fallback to raw code
        }
    }
    return null;
}

export default function CodeforcesSubmissionsTable({
    title = "My contest submissions",
    submissions = [],
    loading = false,
    emptyMessage = "No submissions found.",
    contestId = null,
    onSearch = null
}) {
    const [inspectingSub, setInspectingSub] = useState(null);
    const [modalFormaTab, setModalFormaTab] = useState('html');
    const [copiedCode, setCopiedCode] = useState(false);
    const [activeCompileError, setActiveCompileError] = useState(null);
    const [showSearchBox, setShowSearchBox] = useState(false);
    const [filterQuery, setFilterQuery] = useState('');

    // Filter displayed submissions if filter query is typed
    const displayed = submissions.filter(s => {
        if (!filterQuery.trim()) return true;
        const q = filterQuery.toLowerCase().trim();
        const username = (s.username || '').toLowerCase();
        const letter = (s.problemLetter || '').toLowerCase();
        const problemTitle = (s.problemTitle || '').toLowerCase();
        const verdict = (s.verdict || '').toLowerCase();
        const subId = getDisplaySubmissionId(s);
        return username.includes(q) || letter.includes(q) || problemTitle.includes(q) || verdict.includes(q) || subId.includes(q);
    });

    return (
        <div style={{
            width: '100%',
            margin: '0 auto 30px auto',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Table Container Card matching img ref 2 */}
            <div style={{
                border: '1px solid #b9b9b9',
                borderRadius: '6px 6px 0 0',
                background: '#ffffff',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                {/* Header Bar */}
                <div style={{
                    height: '32px',
                    background: 'linear-gradient(to bottom, #f0f0f0 0%, #dfdfdf 100%)',
                    borderBottom: '1px solid #b9b9b9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px'
                }}>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: 'bold',
                        color: '#222222'
                    }}>
                        {title}
                    </span>

                    {/* Magnifying Glass Search Icon */}
                    <button
                        type="button"
                        onClick={() => setShowSearchBox(!showSearchBox)}
                        aria-label="Toggle search filter"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#555555'
                        }}
                        title="Search or filter submissions"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </button>
                </div>

                {/* Collapsible Search Input */}
                {showSearchBox && (
                    <div style={{
                        padding: '6px 12px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e1e1e1',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <input
                            type="text"
                            placeholder="Filter by user handle, problem, verdict, or ID..."
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            style={{
                                flex: 1,
                                height: '24px',
                                border: '1px solid #b5b5b5',
                                borderRadius: '3px',
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontFamily: 'inherit'
                            }}
                            autoFocus
                        />
                        {filterQuery && (
                            <button
                                onClick={() => setFilterQuery('')}
                                style={{
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    borderRadius: '3px',
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: '#777777', fontSize: '13px' }}>
                        Loading submissions...
                    </div>
                ) : displayed.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#666666', fontSize: '12px', background: '#fafafa' }}>
                        {emptyMessage}
                    </div>
                ) : (
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '12px',
                        tableLayout: 'fixed'
                    }}>
                        <thead>
                            <tr style={{ background: '#ffffff', height: '32px' }}>
                                <th style={{ width: '85px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>#</th>
                                <th style={{ width: '110px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>When</th>
                                <th style={{ width: '95px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>Who</th>
                                <th style={{ width: '185px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>Problem</th>
                                <th style={{ width: '155px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>Lang</th>
                                <th style={{ width: '160px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>Verdict</th>
                                <th style={{ width: '75px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderRight: '1px solid #e1e1e1', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>Time</th>
                                <th style={{ width: '85px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #b9b9b9', padding: '4px 6px' }}>Memory</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayed.map((sub, idx) => {
                                // Alternating rows matching img ref 2: row 0 is #eef5fe, row 1 is #ffffff
                                const rowBg = idx % 2 === 0 ? '#eef5fe' : '#ffffff';
                                const displayId = getDisplaySubmissionId(sub);
                                const { dateStr, timeStr } = formatCfTimestamp(sub.submittedAt);

                                const problemLetter = sub.problemLetter || 'A';
                                const problemTitle = sub.problemTitle || `Problem ${problemLetter}`;
                                const problemText = `${problemLetter} - ${problemTitle}`;

                                const targetContestId = sub.contestId || contestId;
                                const problemPath = targetContestId 
                                    ? `/kata/contests/${targetContestId}/problem/${problemLetter}`
                                    : `/problemset`;

                                return (
                                    <React.Fragment key={sub.id || sub._id || idx}>
                                        <tr style={{
                                            background: rowBg,
                                            height: '42px',
                                            verticalAlign: 'middle'
                                        }}>
                                            {/* Column 1: # (Blue underlined link, e.g. 393624963) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 4px'
                                            }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setModalFormaTab('html');
                                                        setCopiedCode(false);
                                                        setInspectingSub(sub);
                                                    }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#315682',
                                                        textDecoration: 'underline',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        fontFamily: 'inherit',
                                                        fontSize: '12px'
                                                    }}
                                                    title="View submission source code"
                                                >
                                                    {displayId}
                                                </button>
                                            </td>

                                            {/* Column 2: When (Two-line timestamp: Oct/07/2026 \n 22:38 UTC+5.5) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 4px',
                                                fontSize: '11px',
                                                lineHeight: '1.25',
                                                color: '#222222'
                                            }}>
                                                <div>{dateStr}</div>
                                                <div>
                                                    {timeStr}
                                                    <sup style={{ fontSize: '9px', verticalAlign: 'super', marginLeft: '1px', color: '#333333' }}>
                                                        UTC+5.5
                                                    </sup>
                                                </div>
                                            </td>

                                            {/* Column 3: Who (Candidate handle with soft break matching img ref 2) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 6px',
                                                fontSize: '12px',
                                                lineHeight: '1.2',
                                                wordBreak: 'break-word',
                                                color: '#555555',
                                                fontWeight: 500
                                            }}>
                                                <Link
                                                    to={`/kata?handle=${encodeURIComponent(sub.username || '')}`}
                                                    style={{ color: '#555555', textDecoration: 'none' }}
                                                >
                                                    {sub.username || 'candidate'}
                                                </Link>
                                            </td>

                                            {/* Column 4: Problem (e.g. D - Precision Alignment, blue underlined link) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 8px',
                                                fontSize: '12px',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                <Link
                                                    to={problemPath}
                                                    style={{
                                                        color: '#315682',
                                                        textDecoration: 'underline',
                                                        cursor: 'pointer'
                                                    }}
                                                    title={problemText}
                                                >
                                                    {problemText}
                                                </Link>
                                            </td>

                                            {/* Column 5: Lang (Two-line compiler label) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 4px',
                                                fontSize: '12px',
                                                lineHeight: '1.2',
                                                color: '#222222'
                                            }}>
                                                {formatCfLanguage(sub.language)}
                                            </td>

                                            {/* Column 6: Verdict (Exact Codeforces colors & line wrapping) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 4px'
                                            }}>
                                                {formatCfVerdict(sub.verdict, () => {
                                                    if (sub.compileOutput) {
                                                        setActiveCompileError(activeCompileError === sub.id ? null : sub.id);
                                                    }
                                                })}
                                            </td>

                                            {/* Column 7: Time (e.g. 203 ms) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderRight: '1px solid #e1e1e1',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 4px',
                                                fontSize: '12px',
                                                color: '#222222'
                                            }}>
                                                {sub.timeUsedMs !== undefined ? `${sub.timeUsedMs} ms` : '—'}
                                            </td>

                                            {/* Column 8: Memory (e.g. 4800 KB) */}
                                            <td style={{
                                                textAlign: 'center',
                                                borderBottom: '1px solid #e1e1e1',
                                                padding: '6px 4px',
                                                fontSize: '12px',
                                                color: '#222222'
                                            }}>
                                                {sub.memoryUsedKb !== undefined ? `${sub.memoryUsedKb} KB` : '—'}
                                            </td>
                                        </tr>

                                        {/* Expandable Compilation Error Diagnostic */}
                                        {activeCompileError === sub.id && sub.compileOutput && (
                                            <tr>
                                                <td colSpan={8} style={{
                                                    background: '#ffffff',
                                                    borderBottom: '1px solid #e1e1e1',
                                                    padding: '12px 16px'
                                                }}>
                                                    <div style={{ fontWeight: 'bold', color: '#c53030', marginBottom: '6px', fontSize: '12px' }}>
                                                        Compiler Diagnostic Error Output:
                                                    </div>
                                                    <pre style={{
                                                        background: '#ffffff',
                                                        color: '#000000',
                                                        border: '1px solid #b9b9b9',
                                                        padding: '10px 12px',
                                                        borderRadius: '2px',
                                                        fontFamily: 'Consolas, Monaco, "Courier New", Courier, monospace',
                                                        fontSize: '12px',
                                                        lineHeight: '1.4',
                                                        margin: 0,
                                                        whiteSpace: 'pre-wrap',
                                                        maxHeight: '220px',
                                                        overflowY: 'auto'
                                                    }}>
                                                        {sub.compileOutput}
                                                    </pre>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Inspect Submission Source Code Modal */}
            {inspectingSub && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '6px',
                        width: '100%',
                        maxWidth: '820px',
                        maxHeight: '88vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                        overflow: 'hidden',
                        border: '1px solid #b9b9b9'
                    }}>
                        {/* Modal Content */}
                        {(() => {
                            const formaPayload = extractFormaCode(inspectingSub?.code);
                            const isWeb = Boolean(formaPayload) || inspectingSub.language === 'web' || inspectingSub.language === 'forma';
                            const activeFormaCode = formaPayload
                                ? (modalFormaTab === 'css' ? formaPayload.css : (modalFormaTab === 'js' ? formaPayload.js : formaPayload.html))
                                : (inspectingSub.code || '// Source code not available');
                            const activeLabel = formaPayload
                                ? (modalFormaTab === 'css' ? 'CSS Styles:' : (modalFormaTab === 'js' ? 'JavaScript Logic:' : 'HTML Structure:'))
                                : 'Source:';

                            return (
                                <>
                                    {/* Modal Header */}
                                    <div style={{
                                        padding: '10px 16px',
                                        background: 'linear-gradient(to bottom, #f0f0f0 0%, #dfdfdf 100%)',
                                        borderBottom: '1px solid #b9b9b9',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#222222' }}>
                                                Submission #{getDisplaySubmissionId(inspectingSub)}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#555555', marginLeft: '10px' }}>
                                                {inspectingSub.username} — Problem {inspectingSub.problemLetter} ({isWeb ? 'HTML/CSS/JS' : 'C++'})
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setInspectingSub(null)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                fontSize: '18px',
                                                cursor: 'pointer',
                                                color: '#666666',
                                                padding: '0 4px',
                                                lineHeight: 1
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* Modal Body */}
                                    <div style={{ padding: '16px', overflowY: 'auto', flex: 1, background: '#ffffff' }}>
                                        <div style={{
                                            marginBottom: '12px',
                                            padding: '8px 12px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '16px',
                                            fontSize: '12px'
                                        }}>
                                            <span><strong>Verdict:</strong> {formatCfVerdict(inspectingSub.verdict)}</span>
                                            {inspectingSub.isSuperseded && (
                                                <span style={{ color: '#d97706', fontWeight: 'bold' }}>[Superseded by later solution]</span>
                                            )}
                                            <span><strong>Time:</strong> {inspectingSub.timeUsedMs ?? 0} ms</span>
                                            <span><strong>Memory:</strong> {inspectingSub.memoryUsedKb ?? 0} KB</span>
                                            {inspectingSub.pointsAwarded !== undefined && (
                                                <span><strong>Points:</strong> {inspectingSub.pointsAwarded}</span>
                                            )}
                                        </div>

                                        {formaPayload && (
                                            /* Forma HTML / CSS / JS / Preview Tabs */
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setModalFormaTab('html')}
                                                    style={{
                                                        padding: '4px 14px',
                                                        fontSize: '12px',
                                                        fontWeight: modalFormaTab === 'html' ? 'bold' : 'normal',
                                                        background: modalFormaTab === 'html' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: '#000000',
                                                        border: '1px solid #767676',
                                                        borderRadius: '2px',
                                                        cursor: 'pointer',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        boxShadow: modalFormaTab === 'html' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    HTML Structure
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setModalFormaTab('css')}
                                                    style={{
                                                        padding: '4px 14px',
                                                        fontSize: '12px',
                                                        fontWeight: modalFormaTab === 'css' ? 'bold' : 'normal',
                                                        background: modalFormaTab === 'css' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: '#000000',
                                                        border: '1px solid #767676',
                                                        borderRadius: '2px',
                                                        cursor: 'pointer',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        boxShadow: modalFormaTab === 'css' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    CSS Styles
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setModalFormaTab('js')}
                                                    style={{
                                                        padding: '4px 14px',
                                                        fontSize: '12px',
                                                        fontWeight: modalFormaTab === 'js' ? 'bold' : 'normal',
                                                        background: modalFormaTab === 'js' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: '#000000',
                                                        border: '1px solid #767676',
                                                        borderRadius: '2px',
                                                        cursor: 'pointer',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        boxShadow: modalFormaTab === 'js' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    JavaScript Logic
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setModalFormaTab('preview')}
                                                    style={{
                                                        padding: '4px 14px',
                                                        fontSize: '12px',
                                                        fontWeight: modalFormaTab === 'preview' ? 'bold' : 'normal',
                                                        background: modalFormaTab === 'preview' ? '#dedede' : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                        color: '#000000',
                                                        border: '1px solid #767676',
                                                        borderRadius: '2px',
                                                        cursor: 'pointer',
                                                        fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                        boxShadow: modalFormaTab === 'preview' ? 'inset 0 1px 2px rgba(0,0,0,0.15)' : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    Live Preview
                                                </button>
                                            </div>
                                        )}

                                        {formaPayload && modalFormaTab === 'preview' ? (
                                            <div>
                                                <div style={{ fontSize: '11px', color: '#666666', marginBottom: '6px', fontWeight: 'bold' }}>
                                                    Live Rendered Output:
                                                </div>
                                                <div style={{
                                                    border: '1px solid #d4d4d4',
                                                    borderRadius: '4px',
                                                    overflow: 'hidden',
                                                    background: '#ffffff',
                                                    height: '380px'
                                                }}>
                                                    <iframe
                                                        title="Submission Live Preview"
                                                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><style>${formaPayload.css}</style></head><body>${formaPayload.html}<script>${formaPayload.js}<\/script></body></html>`}
                                                        style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                                        sandbox="allow-scripts"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            /* Codeforces Source Code Viewer */
                                            <CodeforcesEditor
                                                label={activeLabel}
                                                value={activeFormaCode}
                                                readOnly={true}
                                                height="380px"
                                            />
                                        )}
                                    </div>

                                    {/* Modal Footer */}
                                    <div style={{
                                        padding: '10px 16px',
                                        background: '#f8fafc',
                                        borderTop: '1px solid #e2e8f0',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                let textToCopy = inspectingSub.code || '';
                                                if (formaPayload) {
                                                    if (modalFormaTab === 'html') textToCopy = formaPayload.html;
                                                    else if (modalFormaTab === 'css') textToCopy = formaPayload.css;
                                                    else if (modalFormaTab === 'js') textToCopy = formaPayload.js;
                                                    else textToCopy = `<!-- HTML -->\n${formaPayload.html}\n\n/* CSS */\n${formaPayload.css}\n\n// JavaScript\n${formaPayload.js}`;
                                                }
                                                if (navigator?.clipboard?.writeText) {
                                                    navigator.clipboard.writeText(textToCopy);
                                                    setCopiedCode(true);
                                                    setTimeout(() => setCopiedCode(false), 2000);
                                                }
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#3b88c3',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                padding: '4px 0',
                                                textDecoration: 'underline',
                                                fontFamily: 'Verdana, sans-serif'
                                            }}
                                        >
                                            {copiedCode ? '✓ Copied to clipboard!' : (formaPayload && modalFormaTab !== 'preview' ? `Copy ${modalFormaTab.toUpperCase()}` : 'Copy Source')}
                                        </button>
                                        <button
                                            onClick={() => setInspectingSub(null)}
                                            style={{
                                                background: 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                                color: '#000000',
                                                border: '1px solid #767676',
                                                padding: '4px 16px',
                                                borderRadius: '2px',
                                                fontSize: '12px',
                                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                cursor: 'pointer',
                                                boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                            }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
