import React, { useState, useEffect } from 'react';
import { Code, Plus, Trash2, Edit2, Play, RefreshCw, CheckCircle, AlertCircle, FileText, ChevronRight } from 'lucide-react';

export default function AdminKataManager({ API_BASE, token: propToken }) {
    const token = propToken || (typeof window !== 'undefined' ? (localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token') || '') : '');
    const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'contests' | 'plagiarism'
    const [trackFilter, setTrackFilter] = useState('shin'); // 'shin' | 'forma'
    const [letterFilter, setLetterFilter] = useState('ALL');
    const [questions, setQuestions] = useState([]);
    const [contests, setContests] = useState([]);
    const [plagiarismList, setPlagiarismList] = useState([]);
    const [overrideScores, setOverrideScores] = useState({});
    const [evaluatingAi, setEvaluatingAi] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionMsg, setActionMsg] = useState({ type: '', text: '' });

    // Question Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingQuestionId, setEditingQuestionId] = useState(null);
    const [formData, setFormData] = useState({
        track: 'shin',
        letter: 'A',
        title: '',
        points: 100,
        timeLimit: 1.0,
        memoryLimit: 256,
        statementHtml: '',
        inputFormat: '',
        outputFormat: '',
        sampleInput: '',
        sampleOutput: '',
        note: '',
        hiddenTestCases: [{ input: '', output: '' }]
    });

    const pointMap = { A: 100, B: 200, C: 300, D: 400, E: 500 };

    const fetchQuestions = async () => {
        setLoading(true);
        try {
            const url = `${API_BASE}/kata/admin/questions?track=${trackFilter}${letterFilter !== 'ALL' ? `&letter=${letterFilter}` : ''}`;
            const res = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.success) {
                setQuestions(data.questions || []);
            }
        } catch (err) {
            console.error('Error fetching questions:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchContests = async () => {
        try {
            const res = await fetch(`${API_BASE}/kata/admin/contests`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.success) {
                setContests(data.contests || []);
            }
        } catch (err) {
            console.error('Error fetching admin contests:', err);
        }
    };

    const fetchPlagiarismList = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/kata/admin/plagiarism`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.success) {
                setPlagiarismList(data.submissions || []);
            }
        } catch (err) {
            console.error('Error fetching plagiarism submissions:', err);
        } finally {
            setLoading(false);
        }
    };

    const handlePlagiarismAction = async (subId, actionType, customScore) => {
        try {
            const payload = { action: actionType };
            if (actionType === 'override_score') {
                const val = customScore !== undefined ? customScore : overrideScores[subId];
                payload.score = Math.max(0, Number(val) || 0);
            }
            const res = await fetch(`${API_BASE}/kata/admin/plagiarism/${subId}/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: `Action applied successfully: ${actionType}` });
                fetchPlagiarismList();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to update submission' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure applying plagiarism action' });
        }
    };

    const handleTriggerAiEvaluation = async () => {
        setEvaluatingAi(true);
        setActionMsg({ type: 'success', text: 'Triggering background Gemini AI evaluation cycle...' });
        try {
            const res = await fetch(`${API_BASE}/kata/admin/trigger-ai-evaluation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: data.message || 'AI evaluation cycle completed successfully!' });
                if (activeTab === 'plagiarism') fetchPlagiarismList();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'AI evaluation failed' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure during AI evaluation trigger' });
        } finally {
            setEvaluatingAi(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'questions') {
            fetchQuestions();
        } else if (activeTab === 'contests') {
            fetchContests();
        } else if (activeTab === 'plagiarism') {
            fetchPlagiarismList();
        }
    }, [activeTab, trackFilter, letterFilter]);

    const handleLetterChange = (letter) => {
        setFormData(prev => ({
            ...prev,
            letter,
            points: pointMap[letter] || 100
        }));
    };

    const handleAddHiddenTestCase = () => {
        setFormData(prev => ({
            ...prev,
            hiddenTestCases: [...prev.hiddenTestCases, { input: '', output: '' }]
        }));
    };

    const handleRemoveHiddenTestCase = (idx) => {
        setFormData(prev => ({
            ...prev,
            hiddenTestCases: prev.hiddenTestCases.filter((_, i) => i !== idx)
        }));
    };

    const handleHiddenCaseChange = (idx, field, val) => {
        setFormData(prev => {
            const updated = [...prev.hiddenTestCases];
            updated[idx] = { ...updated[idx], [field]: val };
            return { ...prev, hiddenTestCases: updated };
        });
    };

    const handleOpenCreateModal = () => {
        setEditingQuestionId(null);
        setFormData({
            track: trackFilter,
            letter: letterFilter !== 'ALL' ? letterFilter : 'A',
            title: '',
            points: pointMap[letterFilter !== 'ALL' ? letterFilter : 'A'] || 100,
            timeLimit: 1.0,
            memoryLimit: 256,
            statementHtml: '',
            inputFormat: '',
            outputFormat: '',
            sampleInput: '',
            sampleOutput: '',
            note: '',
            hiddenTestCases: [{ input: '', output: '' }]
        });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (q) => {
        setEditingQuestionId(q.id);
        setFormData({
            track: q.track,
            letter: q.letter,
            title: q.title,
            points: q.points || pointMap[q.letter] || 100,
            timeLimit: q.timeLimit || 1.0,
            memoryLimit: q.memoryLimit || 256,
            statementHtml: q.statementHtml || '',
            inputFormat: q.inputFormat || '',
            outputFormat: q.outputFormat || '',
            sampleInput: q.sampleInput || '',
            sampleOutput: q.sampleOutput || '',
            note: q.note || '',
            hiddenTestCases: q.hiddenTestCases?.length > 0 ? q.hiddenTestCases : [{ input: '', output: '' }]
        });
        setIsModalOpen(true);
    };

    const handleSaveQuestion = async (e) => {
        e.preventDefault();
        try {
            const method = editingQuestionId ? 'PUT' : 'POST';
            const url = editingQuestionId 
                ? `${API_BASE}/kata/admin/questions/${editingQuestionId}` 
                : `${API_BASE}/kata/admin/questions`;

            // Filter out empty hidden test cases
            const cleanedPayload = {
                ...formData,
                hiddenTestCases: formData.hiddenTestCases.filter(tc => tc.input?.trim() && tc.output?.trim())
            };

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(cleanedPayload)
            });

            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: `Question ${editingQuestionId ? 'updated' : 'created'} successfully!` });
                setIsModalOpen(false);
                fetchQuestions();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to save question' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network error saving question' });
        }
    };

    const handleDeleteQuestion = async (id, title) => {
        if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
        try {
            const res = await fetch(`${API_BASE}/kata/admin/questions/${id}`, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: 'Question removed from question bank.' });
                fetchQuestions();
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Failed to delete question' });
        }
    };

    const handleTriggerContestGeneration = async (targetTrack) => {
        try {
            const res = await fetch(`${API_BASE}/kata/admin/generate-contest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ track: targetTrack })
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: `Successfully generated contest ${data.contest.contestId}!` });
                fetchContests();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Contest generation failed' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure during generation' });
        }
    };

    const handleSetSchedule = async (contestId, action) => {
        try {
            const res = await fetch(`${API_BASE}/kata/admin/contests/${contestId}/schedule`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: `Schedule updated: ${contestId} status set to ${action}` });
                fetchContests();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to update schedule' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure updating schedule' });
        }
    };

    const handleReconfigureContest = async (contestId) => {
        if (!window.confirm(`Re-roll all 5 questions (A-E) for ${contestId} from the question bank?`)) return;
        try {
            const res = await fetch(`${API_BASE}/kata/admin/contests/${contestId}/reconfigure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: data.message });
                fetchContests();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to reconfigure contest' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure reconfiguring contest' });
        }
    };

    const handleResetCandidateTimers = async (contestId) => {
        if (!window.confirm(`Reset all candidate 2-hour timers for ${contestId}? Participants can restart their 2-hour window.`)) return;
        try {
            const res = await fetch(`${API_BASE}/kata/admin/contests/${contestId}/reset-timers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: data.message });
                fetchContests();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to reset timers' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure resetting timers' });
        }
    };

    const handleRecalculateRatings = async (contestId) => {
        if (!window.confirm(`Recalculate and update Elo ratings for all participants in ${contestId}?`)) return;
        try {
            const res = await fetch(`${API_BASE}/kata/admin/contests/${contestId}/recalculate-ratings`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: data.message || `Ratings recalculated for ${contestId}` });
                fetchContests();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to recalculate ratings' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure recalculating ratings' });
        }
    };

    const handleTriggerThursdayConfig = async () => {
        try {
            const res = await fetch(`${API_BASE}/kata/admin/trigger-weekly-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            const data = await res.json();
            if (data.success) {
                setActionMsg({ type: 'success', text: data.message });
                fetchContests();
            } else {
                setActionMsg({ type: 'error', text: data.error || 'Failed to trigger weekly configuration' });
            }
        } catch (err) {
            setActionMsg({ type: 'error', text: 'Network failure triggering weekly configuration' });
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* Title & Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#0f172a' }}>
                        Kata Contests & Question Bank Manager
                    </h1>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        Configure the master problem bank (A-E) and control automated Saturday (Shin) & Sunday (Forma) rounds.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => setActiveTab('questions')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            background: activeTab === 'questions' ? '#3b82f6' : '#f1f5f9',
                            color: activeTab === 'questions' ? '#ffffff' : '#475569',
                            border: 'none'
                        }}
                    >
                        Question Bank
                    </button>
                    <button
                        onClick={() => setActiveTab('contests')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            background: activeTab === 'contests' ? '#3b82f6' : '#f1f5f9',
                            color: activeTab === 'contests' ? '#ffffff' : '#475569',
                            border: 'none'
                        }}
                    >
                        Contests & Scheduler
                    </button>
                    <button
                        onClick={() => setActiveTab('plagiarism')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            background: activeTab === 'plagiarism' ? '#dc2626' : '#f1f5f9',
                            color: activeTab === 'plagiarism' ? '#ffffff' : '#475569',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>🛡️ Plagiarism & AI</span>
                        {plagiarismList.length > 0 && (
                            <span style={{
                                background: activeTab === 'plagiarism' ? '#ffffff' : '#dc2626',
                                color: activeTab === 'plagiarism' ? '#dc2626' : '#ffffff',
                                borderRadius: '10px',
                                padding: '1px 6px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}>
                                {plagiarismList.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={handleTriggerAiEvaluation}
                        disabled={evaluatingAi}
                        title="Trigger asynchronous Gemini Direct API evaluation of pending submissions"
                        style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: evaluatingAi ? 'not-allowed' : 'pointer',
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <RefreshCw size={14} className={evaluatingAi ? 'animate-spin' : ''} />
                        {evaluatingAi ? 'Evaluating...' : 'Run AI Evaluation Now'}
                    </button>
                </div>
            </div>

            {/* Notification message */}
            {actionMsg.text && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: actionMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                    color: actionMsg.type === 'success' ? '#166534' : '#991b1b',
                    border: `1px solid ${actionMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                    {actionMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    <span>{actionMsg.text}</span>
                    <button 
                        onClick={() => setActionMsg({ type: '', text: '' })} 
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* TAB 1: QUESTION BANK */}
            {activeTab === 'questions' && (
                <div>
                    {/* Filters & Actions Bar */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        marginBottom: '16px'
                    }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            {/* Track Selector */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>Track:</span>
                                <button
                                    onClick={() => setTrackFilter('shin')}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        border: '1px solid #cbd5e1',
                                        background: trackFilter === 'shin' ? '#10b981' : '#ffffff',
                                        color: trackFilter === 'shin' ? '#ffffff' : '#334155'
                                    }}
                                >
                                    KataShin (Saturday)
                                </button>
                                <button
                                    onClick={() => setTrackFilter('forma')}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        border: '1px solid #cbd5e1',
                                        background: trackFilter === 'forma' ? '#3b82f6' : '#ffffff',
                                        color: trackFilter === 'forma' ? '#ffffff' : '#334155'
                                    }}
                                >
                                    KataForma (Sunday)
                                </button>
                            </div>

                            {/* Letter Tabs */}
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '12px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>Category:</span>
                                {['ALL', 'A', 'B', 'C', 'D', 'E'].map(l => (
                                    <button
                                        key={l}
                                        onClick={() => setLetterFilter(l)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            border: '1px solid #e2e8f0',
                                            background: letterFilter === l ? '#0f172a' : '#f8fafc',
                                            color: letterFilter === l ? '#ffffff' : '#475569'
                                        }}
                                    >
                                        {l === 'ALL' ? 'All (A-E)' : `${l} (${pointMap[l]} pts)`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleOpenCreateModal}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#2563eb',
                                color: '#ffffff',
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: '600',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <Plus size={16} /> Add Question
                        </button>
                    </div>

                    {/* Questions Table */}
                    <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                Loading question bank...
                            </div>
                        ) : questions.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                No questions found in this category. Click "Add Question" to configure one.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                        <th style={{ padding: '10px 14px', width: '60px' }}>Letter</th>
                                        <th style={{ padding: '10px 14px' }}>Title</th>
                                        <th style={{ padding: '10px 14px', width: '80px' }}>Points</th>
                                        <th style={{ padding: '10px 14px', width: '120px' }}>Limits</th>
                                        <th style={{ padding: '10px 14px', width: '130px' }}>Hidden Tests</th>
                                        <th style={{ padding: '10px 14px', width: '100px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {questions.map((q, idx) => (
                                        <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fcfcfc' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 'bold' }}>
                                                <span style={{
                                                    background: '#e0f2fe',
                                                    color: '#0369a1',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '12px'
                                                }}>
                                                    {q.letter}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontWeight: '600', color: '#0f172a' }}>{q.title}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                    {q.track === 'shin' ? 'KataShin (C++)' : 'KataForma (Frontend)'} • Difficulty: {q.difficulty || 'Normal'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 'bold', color: '#16a34a' }}>
                                                {q.points} pts
                                            </td>
                                            <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                                                {q.timeLimit}s / {q.memoryLimit}MB
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <span style={{
                                                    background: '#f1f5f9',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '11px',
                                                    color: '#334155'
                                                }}>
                                                    {q.hiddenTestCasesCount} hidden test{q.hiddenTestCasesCount === 1 ? '' : 's'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleOpenEditModal(q)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', marginRight: '8px' }}
                                                    title="Edit"
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteQuestion(q.id, q.title)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: CONTESTS & AUTOMATED SCHEDULER */}
            {activeTab === 'contests' && (
                <div>
                    {/* Contest Generator Card */}
                    <div style={{
                        background: '#ffffff',
                        padding: '16px 20px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        marginBottom: '20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#0f172a' }}>
                                Weekly Contest Automated Engine
                            </h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                Automated cron runs every Thursday, configuring weekend rounds (Shin on Saturday, Forma on Sunday) from 09:00 to 23:59 IST.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleTriggerThursdayConfig}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#8b5cf6',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                <RefreshCw size={14} /> ⚡ Trigger Thursday Auto-Config
                            </button>
                            <button
                                onClick={() => handleTriggerContestGeneration('shin')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#10b981',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                <Play size={14} /> Generate Shin (Sat)
                            </button>
                            <button
                                onClick={() => handleTriggerContestGeneration('forma')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#3b82f6',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                <Play size={14} /> Generate Forma (Sun)
                            </button>
                        </div>
                    </div>

                    {/* Contests Table */}
                    <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                    <th style={{ padding: '10px 14px', width: '80px' }}>ID</th>
                                    <th style={{ padding: '10px 14px' }}>Title & Track</th>
                                    <th style={{ padding: '10px 14px', width: '150px' }}>Schedule</th>
                                    <th style={{ padding: '10px 14px', width: '90px' }}>Status</th>
                                    <th style={{ padding: '10px 14px', width: '100px' }}>Candidates</th>
                                    <th style={{ padding: '10px 14px', width: '310px', textAlign: 'center' }}>Dev Mode Controls</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contests.map((c, idx) => (
                                    <tr key={c.contestId} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fcfcfc' }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 'bold' }}>
                                            {c.contestId}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <div style={{ fontWeight: '600', color: '#0f172a' }}>{c.title}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                {c.track === 'shin' ? 'Algorithmic (C++)' : 'Web Engineering (HTML/CSS/JS)'} • 5 Problems (1500 pts)
                                            </div>
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#475569' }}>
                                            {new Date(c.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} IST
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                background: c.status === 'running' ? '#dcfce7' : c.status === 'scheduled' ? '#e0f2fe' : '#f1f5f9',
                                                color: c.status === 'running' ? '#15803d' : c.status === 'scheduled' ? '#0369a1' : '#64748b'
                                            }}>
                                                {c.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: '#475569', fontSize: '12px' }}>
                                            {c.registeredCount || 0} registered
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => handleSetSchedule(c.contestId, 'set-live-2h')}
                                                    title="Force contest status to running and window to 2 hours from now"
                                                    style={{
                                                        padding: '3px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 'bold',
                                                        background: '#16a34a',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Set Live Now
                                                </button>
                                                <button
                                                    onClick={() => handleSetSchedule(c.contestId, 'set-ended')}
                                                    title="Mark contest ended and transition to gym / problemset"
                                                    style={{
                                                        padding: '3px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 'bold',
                                                        background: '#64748b',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Set Ended
                                                </button>
                                                <button
                                                    onClick={() => handleReconfigureContest(c.contestId)}
                                                    title="Re-roll problems A-E at random from question bank"
                                                    style={{
                                                        padding: '3px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 'bold',
                                                        background: '#0284c7',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Re-roll A-E
                                                </button>
                                                <button
                                                    onClick={() => handleResetCandidateTimers(c.contestId)}
                                                    title="Reset all candidate timers so they can start fresh 2-hour window"
                                                    style={{
                                                        padding: '3px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 'bold',
                                                        background: '#ea580c',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Reset Timers
                                                </button>
                                                <button
                                                    onClick={() => handleRecalculateRatings(c.contestId)}
                                                    title="Recalculate and persist Elo rating changes for participants in this contest"
                                                    style={{
                                                        padding: '3px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 'bold',
                                                        background: '#8b5cf6',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Recalculate Ratings
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: PLAGIARISM & AI EVALUATION REVIEW */}
            {activeTab === 'plagiarism' && (
                <div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                        background: '#ffffff',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#991b1b' }}>
                                🛡️ Plagiarism & AI Integrity Audits (Gemini Direct API)
                            </h2>
                            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                Submissions with AI plagiarism probability &gt; 60% or flagged for review. Admin decisions directly adjust candidate points.
                            </p>
                        </div>
                        <button
                            onClick={fetchPlagiarismList}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={14} /> Refresh Reports
                        </button>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            Loading integrity reports...
                        </div>
                    ) : plagiarismList.length === 0 ? (
                        <div style={{
                            padding: '40px',
                            textAlign: 'center',
                            background: '#ffffff',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            color: '#64748b'
                        }}>
                            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🛡️</div>
                            <div style={{ fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
                                No Plagiarism Flags Detected
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                                All candidate submissions are within standard algorithmic variations (&le; 60% similarity).
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {plagiarismList.map(sub => (
                                <div
                                    key={sub._id || sub.id}
                                    style={{
                                        background: '#ffffff',
                                        borderRadius: '8px',
                                        border: '1px solid #fecaca',
                                        overflow: 'hidden',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                    }}
                                >
                                    {/* Card Header */}
                                    <div style={{
                                        padding: '12px 16px',
                                        background: '#fef2f2',
                                        borderBottom: '1px solid #fee2e2',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{
                                                background: '#dc2626',
                                                color: '#ffffff',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 'bold'
                                            }}>
                                                Plagiarism: {sub.plagiarismScore || 0}%
                                            </span>
                                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>
                                                {sub.handle || 'Candidate'}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                {sub.contestId} — Problem {sub.problemLetter}
                                            </span>
                                            <span style={{
                                                fontSize: '11px',
                                                padding: '1px 6px',
                                                borderRadius: '3px',
                                                background: sub.track === 'forma' ? '#fef3c7' : '#e0e7ff',
                                                color: sub.track === 'forma' ? '#92400e' : '#3730a3',
                                                fontWeight: '600'
                                            }}>
                                                {sub.track?.toUpperCase() || 'SHIN'}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                                            {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : ''}
                                        </div>
                                    </div>

                                    {/* Card Content */}
                                    <div style={{ padding: '16px' }}>
                                        {/* Gemini AI Reasoning Box */}
                                        <div style={{
                                            background: '#fff1f2',
                                            border: '1px solid #ffe4e6',
                                            borderRadius: '6px',
                                            padding: '10px 14px',
                                            marginBottom: '14px',
                                            fontSize: '12px',
                                            color: '#9f1239'
                                        }}>
                                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                                🤖 Gemini Direct API Audit Verdict:
                                            </div>
                                            <div>
                                                {sub.plagiarismReasoning || 'Candidate solution exhibits patterns characteristic of Large Language Model generation without standard human coding traits.'}
                                            </div>
                                        </div>

                                        {/* Forma Feedback if present */}
                                        {sub.aiEvaluation?.feedback && (
                                            <div style={{
                                                background: '#f0fdf4',
                                                border: '1px solid #dcfce7',
                                                borderRadius: '6px',
                                                padding: '10px 14px',
                                                marginBottom: '14px',
                                                fontSize: '12px',
                                                color: '#166534'
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                                    Forma AI Qualitative Grade: {sub.aiEvaluation.ratingScore} / {sub.pointsAwarded || 100} pts
                                                </div>
                                                <div>{sub.aiEvaluation.feedback}</div>
                                            </div>
                                        )}

                                        {/* Submitted Code Preview */}
                                        <div style={{ marginBottom: '14px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                                                Submitted Source Code ({sub.language || 'cpp'}):
                                            </div>
                                            <pre style={{
                                                margin: 0,
                                                padding: '10px',
                                                background: '#0f172a',
                                                color: '#f8fafc',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                fontFamily: 'Consolas, monospace',
                                                maxHeight: '160px',
                                                overflowY: 'auto'
                                            }}>
                                                {sub.code}
                                            </pre>
                                        </div>

                                        {/* Admin Action Bar */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '12px',
                                            marginTop: '14px',
                                            paddingTop: '12px',
                                            borderTop: '1px solid #f1f5f9'
                                        }}>
                                            {/* Score override input group */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                                                    Score ({sub.pointsAwarded ?? 0} pts):
                                                </span>
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    max="1000"
                                                    placeholder={String(sub.pointsAwarded ?? 0)}
                                                    value={overrideScores[sub._id || sub.id] ?? ''}
                                                    onChange={(e) => setOverrideScores({ ...overrideScores, [sub._id || sub.id]: e.target.value })}
                                                    style={{
                                                        width: '80px',
                                                        padding: '5px 8px',
                                                        fontSize: '12px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #cbd5e1'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handlePlagiarismAction(sub._id || sub.id, 'override_score')}
                                                    style={{
                                                        background: '#475569',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        padding: '6px 12px',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Override Score
                                                </button>
                                            </div>

                                            {/* Primary Verdict Actions */}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => handlePlagiarismAction(sub._id || sub.id, 'correct')}
                                                    style={{
                                                        background: '#f0fdf4',
                                                        color: '#166534',
                                                        border: '1px solid #bbf7d0',
                                                        padding: '6px 14px',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ✓ Mark Correct (Keep Score)
                                                </button>
                                                <button
                                                    onClick={() => handlePlagiarismAction(sub._id || sub.id, 'plagiarism')}
                                                    style={{
                                                        background: '#dc2626',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        padding: '6px 14px',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ✕ Mark Plagiarism (0 Pts)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* CREATE / EDIT QUESTION MODAL */}
            {isModalOpen && (
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
                        borderRadius: '8px',
                        width: '100%',
                        maxWidth: '850px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '24px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                                {editingQuestionId ? 'Edit Problem' : 'Configure New Problem'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveQuestion}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Track:</label>
                                    <select
                                        value={formData.track}
                                        onChange={(e) => setFormData({ ...formData, track: e.target.value })}
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                    >
                                        <option value="shin">KataShin (Saturday C++)</option>
                                        <option value="forma">KataForma (Sunday Frontend)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Category (Letter):</label>
                                    <select
                                        value={formData.letter}
                                        onChange={(e) => handleLetterChange(e.target.value)}
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                    >
                                        <option value="A">A (100 points)</option>
                                        <option value="B">B (200 points)</option>
                                        <option value="C">C (300 points)</option>
                                        <option value="D">D (400 points)</option>
                                        <option value="E">E (500 points)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Points:</label>
                                    <input
                                        type="number"
                                        value={formData.points}
                                        onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Problem Title:</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g. Domino Piling"
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                    required
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Time Limit (seconds):</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.timeLimit}
                                        onChange={(e) => setFormData({ ...formData, timeLimit: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Memory Limit (MB):</label>
                                    <input
                                        type="number"
                                        value={formData.memoryLimit}
                                        onChange={(e) => setFormData({ ...formData, memoryLimit: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                                    Problem Statement (Markdown / LaTeX with $...$):
                                </label>
                                <textarea
                                    value={formData.statementHtml}
                                    onChange={(e) => setFormData({ ...formData, statementHtml: e.target.value })}
                                    rows={5}
                                    placeholder="You are given $M \times N$ board..."
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'monospace' }}
                                    required
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Input Format:</label>
                                    <textarea
                                        value={formData.inputFormat}
                                        onChange={(e) => setFormData({ ...formData, inputFormat: e.target.value })}
                                        rows={3}
                                        placeholder="The first line contains $M, N$..."
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Output Format:</label>
                                    <textarea
                                        value={formData.outputFormat}
                                        onChange={(e) => setFormData({ ...formData, outputFormat: e.target.value })}
                                        rows={3}
                                        placeholder="Output one number..."
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Sample Input (Visible to Candidate):</label>
                                    <textarea
                                        value={formData.sampleInput}
                                        onChange={(e) => setFormData({ ...formData, sampleInput: e.target.value })}
                                        rows={3}
                                        placeholder="2 4"
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'monospace' }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Sample Output (Visible to Candidate):</label>
                                    <textarea
                                        value={formData.sampleOutput}
                                        onChange={(e) => setFormData({ ...formData, sampleOutput: e.target.value })}
                                        rows={3}
                                        placeholder="4"
                                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'monospace' }}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Note / Explanations:</label>
                                <input
                                    type="text"
                                    value={formData.note}
                                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                    placeholder="Total squares 8, fits 4 dominoes."
                                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                                />
                            </div>

                            {/* Hidden Test Cases Section */}
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginBottom: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div>
                                        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>Hidden Test Cases (Strictly Server-Side):</span>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                                            Never leaked via APIs. Used for background grading.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddHiddenTestCase}
                                        style={{
                                            background: '#f1f5f9',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '4px',
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        + Add Test Case
                                    </button>
                                </div>

                                {formData.hiddenTestCases.map((tc, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                        <textarea
                                            value={tc.input}
                                            onChange={(e) => handleHiddenCaseChange(idx, 'input', e.target.value)}
                                            rows={2}
                                            placeholder={`Hidden Input #${idx + 1}`}
                                            style={{ padding: '4px', fontSize: '11px', fontFamily: 'monospace', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        />
                                        <textarea
                                            value={tc.output}
                                            onChange={(e) => handleHiddenCaseChange(idx, 'output', e.target.value)}
                                            rows={2}
                                            placeholder={`Expected Output #${idx + 1}`}
                                            style={{ padding: '4px', fontSize: '11px', fontFamily: 'monospace', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveHiddenTestCase(idx)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{
                                        background: '#f1f5f9',
                                        color: '#334155',
                                        border: '1px solid #cbd5e1',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        background: '#2563eb',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '8px 20px',
                                        borderRadius: '6px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    {editingQuestionId ? 'Update Problem' : 'Save to Bank'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
