import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertTriangle, Search, Filter, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../../config';

export default function AdminCounterfoilView({ systemConfig, setSystemConfig, handleToggleSetting }) {
  const [counterfoils, setCounterfoils] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionRemarks, setActionRemarks] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, pending_approval, approved, rejected
  const [examTypeFilter, setExamTypeFilter] = useState('ALL'); // ALL, midsem, endsem

  const fetchCounterfoils = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/counterfoil/list`);
      if (res.ok) {
        const data = await res.json();
        setCounterfoils(data || []);
      }
    } catch (e) {
      console.error('Failed to fetch counterfoil submissions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounterfoils();
  }, []);

  const handleAction = async (id, status) => {
    const remarks = actionRemarks[id] || '';
    try {
      setProcessingId(id);
      setMsg({ type: '', text: '' });
      const res = await fetch(`${API_BASE}/admin/counterfoil/action/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminRemarks: remarks })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `Counterfoil mark entry ${status === 'approved' ? 'Approved' : 'Rejected'} successfully!` });
        fetchCounterfoils();
      } else {
        setMsg({ type: 'error', text: data.error || 'Failed to update status.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Server connection error.' });
    } finally {
      setProcessingId(null);
    }
  };

  // Filter logic
  const filteredCounterfoils = counterfoils.filter(cf => {
    const matchesSearch = 
      (cf.studentName && cf.studentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cf.studentId && cf.studentId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cf.courseCode && cf.courseCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cf.courseName && cf.courseName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || cf.status === statusFilter;
    const matchesExamType = examTypeFilter === 'ALL' || cf.examType === examTypeFilter;

    return matchesSearch && matchesStatus && matchesExamType;
  });

  const pendingCount = counterfoils.filter(c => c.status === 'pending_approval').length;
  const approvedCount = counterfoils.filter(c => c.status === 'approved').length;
  const rejectedCount = counterfoils.filter(c => c.status === 'rejected').length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* HEADER CARD */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div>
          <h1 style={{ fontSize: '18pt', fontWeight: 'bold', color: '#002147', margin: '0 0 4px 0' }}>
            Candidate Counterfoil Approvals Dashboard
          </h1>
          <p style={{ fontSize: '9.5pt', color: '#475569', margin: 0 }}>
            Review, verify, and approve candidate self-reported MST / ESE marks entry sheets.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Quick Toggle */}
          {systemConfig && handleToggleSetting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '6px' }}>
              <label className="switch" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={systemConfig.counterfoilActive !== false}
                  onChange={e => handleToggleSetting('counterfoilActive', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
              <span style={{ fontWeight: 'bold', fontSize: '9pt', color: '#0f172a' }}>
                Counterfoil Active: {systemConfig.counterfoilActive !== false ? 'ON' : 'OFF'}
              </span>
            </div>
          )}

          <button className="cf-btn-secondary" onClick={fetchCounterfoils} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh List
          </button>
        </div>
      </div>

      {msg.text && (
        <div className={`cf-alert ${msg.type === 'error' ? 'cf-alert-error' : 'cf-alert-success'}`}>
          {msg.text}
        </div>
      )}

      {/* METRICS SUMMARY & FILTERS BAR */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Status Count Pills */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setStatusFilter('ALL')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '8.5pt',
              fontWeight: 'bold',
              border: statusFilter === 'ALL' ? '2px solid #002147' : '1px solid #cbd5e1',
              backgroundColor: statusFilter === 'ALL' ? '#f0f4fa' : '#ffffff',
              color: '#002147',
              cursor: 'pointer'
            }}
          >
            All Submissions ({counterfoils.length})
          </button>

          <button
            onClick={() => setStatusFilter('pending_approval')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '8.5pt',
              fontWeight: 'bold',
              border: statusFilter === 'pending_approval' ? '2px solid #b45309' : '1px solid #fde68a',
              backgroundColor: '#fef3c7',
              color: '#b45309',
              cursor: 'pointer'
            }}
          >
            ⏳ Pending ({pendingCount})
          </button>

          <button
            onClick={() => setStatusFilter('approved')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '8.5pt',
              fontWeight: 'bold',
              border: statusFilter === 'approved' ? '2px solid #047857' : '1px solid #a7f3d0',
              backgroundColor: '#d1fae5',
              color: '#047857',
              cursor: 'pointer'
            }}
          >
            ✓ Approved ({approvedCount})
          </button>

          <button
            onClick={() => setStatusFilter('rejected')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '8.5pt',
              fontWeight: 'bold',
              border: statusFilter === 'rejected' ? '2px solid #b91c1c' : '1px solid #fca5a5',
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              cursor: 'pointer'
            }}
          >
            ✕ Rejected ({rejectedCount})
          </button>
        </div>

        {/* Search & Exam Type Filter */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="cf-input"
              style={{ paddingLeft: '36px' }}
              placeholder="Search by student name, ID, or course code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="cf-input"
            value={examTypeFilter}
            onChange={e => setExamTypeFilter(e.target.value)}
          >
            <option value="ALL">Filter by Exam: All Types</option>
            <option value="midsem">MST (Mid-Semester Test)</option>
            <option value="endsem">ESE (End-Semester Exam)</option>
          </select>
        </div>
      </div>

      {/* TABLE CARD */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Candidate &amp; Student ID</th>
                <th>Course Code &amp; Name</th>
                <th>Exam Mode</th>
                <th>Question Marks Breakdown</th>
                <th>Total Score</th>
                <th>Status</th>
                <th style={{ minWidth: '220px' }}>Admin Action &amp; Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading candidate counterfoil records...
                  </td>
                </tr>
              ) : filteredCounterfoils.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No counterfoil records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredCounterfoils.map(cf => (
                  <tr key={cf._id || cf.id}>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{cf.studentName}</strong>
                      <div style={{ fontFamily: 'Fira Code, monospace', fontSize: '8pt', color: '#0284c7', marginTop: '2px' }}>{cf.studentId}</div>
                    </td>
                    <td>
                      <strong style={{ color: '#002147' }}>{cf.courseCode}</strong>
                      <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2px' }}>{cf.courseName}</div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '8pt',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        color: cf.examType === 'midsem' ? '#0284c7' : '#0369a1',
                        backgroundColor: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {cf.examType === 'midsem' ? 'MST (Midsem)' : 'ESE (Endsem)'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {cf.questionMarks?.map(q => (
                          <span key={q.questionNo} style={{ fontSize: '8pt', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px' }}>
                            Q{q.questionNo}: <strong style={{ color: '#0f172a' }}>{q.obtainedMarks}</strong>/{q.maxMarks}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: '10.5pt', color: '#0f172a' }}>{cf.totalObtained} / {cf.totalMax}</strong>
                    </td>
                    <td>
                      {cf.status === 'approved' && (
                        <span className="status-badge" style={{ backgroundColor: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' }}>✓ Approved</span>
                      )}
                      {cf.status === 'pending_approval' && (
                        <span className="status-badge" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>⏳ Pending</span>
                      )}
                      {cf.status === 'rejected' && (
                        <span className="status-badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>✕ Rejected</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="Admin remarks..."
                          disabled={processingId === cf._id}
                          value={actionRemarks[cf._id] !== undefined ? actionRemarks[cf._id] : (cf.adminRemarks || '')}
                          onChange={e => setActionRemarks({ ...actionRemarks, [cf._id]: e.target.value })}
                          style={{ fontSize: '8.5pt', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            disabled={processingId === cf._id || cf.status === 'approved'}
                            onClick={() => handleAction(cf._id, 'approved')}
                            className="cf-btn-primary"
                            style={{ padding: '3px 10px', fontSize: '8.5pt', backgroundColor: '#0284c7' }}
                          >
                            Approve
                          </button>
                          <button
                            disabled={processingId === cf._id}
                            onClick={() => handleAction(cf._id, 'rejected')}
                            className="cf-btn-secondary"
                            style={{ padding: '3px 10px', fontSize: '8.5pt', color: '#b91c1c', borderColor: '#fca5a5' }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
