import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Video, FileText, AlertCircle, Clock, CheckCircle2, 
  Search, Copy, Check, ExternalLink, ShieldAlert, ArrowRight, Eye, ShieldCheck, XCircle
} from 'lucide-react';
import { API_BASE } from '../../config';
import StudentProctorDashboard from '../../components/StudentProctorDashboard';

export default function AdminProctoring({
  view,
  fetchLiveSubmissions,
  selectedProctorTest,
  setSelectedProctorTest,
  adminTests,
  selectedProctorStudent,
  setSelectedProctorStudent,
  liveSubmissions
}) {
  const [adminTab, setAdminTab] = useState('feeds'); // 'feeds' | 'eirf_queue'
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [eirfList, setEirfList] = useState([]);
  const [loadingEirf, setLoadingEirf] = useState(false);
  const [eirfFilter, setEirfFilter] = useState('ALL'); // 'ALL' | 'UNDER_REVIEW' | 'AWAITING_EIRF' | 'EXPIRED' | 'VERDICT_ISSUED'
  const [eirfSearch, setEirfSearch] = useState('');
  const [dashboardInitialTab, setDashboardInitialTab] = useState('proctoring');
  const [copiedBicsId, setCopiedBicsId] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // 1-second interval to keep live statutory filing countdowns tick-accurate
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchEirfQueue = async () => {
    setLoadingEirf(true);
    try {
      const res = await fetch(`${API_BASE}/admin/eirf/list`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEirfList(data);
        }
      }
    } catch (err) {
      console.error("Failed to load EIRF queue:", err);
    } finally {
      setLoadingEirf(false);
    }
  };

  useEffect(() => {
    fetchEirfQueue();
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const start = Date.now();
    try {
      if (adminTab === 'eirf_queue') {
        await fetchEirfQueue();
      } else {
        if (fetchLiveSubmissions) {
          if (selectedProctorTest) {
            const tId = selectedProctorTest.id || selectedProctorTest._id;
            await fetchLiveSubmissions(tId);
          } else {
            await fetchLiveSubmissions();
          }
        }
        await fetchEirfQueue();
      }
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (fetchLiveSubmissions) {
      if (selectedProctorTest) {
        const tId = selectedProctorTest.id || selectedProctorTest._id;
        fetchLiveSubmissions(tId);
      } else {
        fetchLiveSubmissions();
      }
    }
  }, [selectedProctorTest]);

  const handleLaunchAudit = (row) => {
    const matchedSub = (Array.isArray(liveSubmissions) ? liveSubmissions : []).find(
      s => String(s.id || s._id) === String(row.rawSubmissionId) || String(s.id || s._id) === String(row.submissionId)
    ) || {
      id: row.rawSubmissionId,
      _id: row.rawSubmissionId,
      studentId: row.studentId,
      candidateName: row.candidateName,
      testId: row.testId,
      testTitle: row.testTitle,
      hasEirfFlag: true,
      eirfStatus: row.eirfStatus,
      pipelineStatus: row.pipelineStatus,
      status: 'submitted',
      proctoringLog: { events: [], snapshots: [] }
    };

    const matchedTest = (Array.isArray(adminTests) ? adminTests : []).find(
      t => String(t.id || t._id) === String(row.testId)
    );
    if (matchedTest) {
      setSelectedProctorTest(matchedTest);
    }

    setSelectedProctorStudent(matchedSub);
    setDashboardInitialTab('eirf');
    setAdminTab('feeds');
  };

  const handleCopyBicsId = (id) => {
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedBicsId(id);
      setTimeout(() => setCopiedBicsId(null), 2000);
    }).catch(() => {});
  };

  const getRemainingTime = (expiresAt) => {
    if (!expiresAt) return '45:00';
    const diffMs = new Date(expiresAt).getTime() - currentTime;
    if (diffMs <= 0) return 'Expired';
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // KPI Calculations
  const countUnderReview = eirfList.filter(item => item.pipelineStatus === 'UNDER_REVIEW').length;
  const countAwaiting = eirfList.filter(item => item.pipelineStatus === 'AWAITING_EIRF').length;
  const countExpired = eirfList.filter(item => item.pipelineStatus === 'EXPIRED').length;
  const countVerdict = eirfList.filter(item => item.pipelineStatus === 'VERDICT_ISSUED').length;
  const countTotal = eirfList.length;

  // Filtered List
  const filteredList = eirfList.filter(item => {
    if (eirfFilter !== 'ALL' && item.pipelineStatus !== eirfFilter) {
      return false;
    }
    if (eirfSearch.trim()) {
      const q = eirfSearch.toLowerCase();
      const matchName = (item.candidateName || '').toLowerCase().includes(q);
      const matchId = (item.studentId || '').toLowerCase().includes(q);
      const matchBics = (item.bicsId || '').toLowerCase().includes(q);
      const matchExam = (item.testTitle || '').toLowerCase().includes(q);
      const matchRep = (item.reportId || '').toLowerCase().includes(q);
      return matchName || matchId || matchBics || matchExam || matchRep;
    }
    return true;
  });

  return (
    <div>
      {/* TOP HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '18pt', color: '#002147', margin: '0 0 4px 0' }}>Examination Proctoring &amp; Forensic Review</h2>
          <p style={{ margin: 0, fontSize: '8.5pt', color: '#64748b' }}>
            Continuous real-time examinee telemetry, WebRTC surveillance &amp; statutory incident report adjudication center.
          </p>
        </div>
        <button
          className="cf-btn-secondary"
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '8.5pt', margin: 0, cursor: isRefreshing ? 'default' : 'pointer' }}
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin-smooth' : ''} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Records'}</span>
        </button>
      </div>

      {/* TOP-LEVEL NAVIGATION TABS */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '20px'
      }}>
        <button
          type="button"
          onClick={() => setAdminTab('feeds')}
          style={{
            padding: '10px 18px',
            fontSize: '9pt',
            fontWeight: 'bold',
            border: 'none',
            borderBottom: adminTab === 'feeds' ? '2px solid #0284c7' : '2px solid transparent',
            marginBottom: '-2px',
            backgroundColor: adminTab === 'feeds' ? '#ffffff' : 'transparent',
            color: adminTab === 'feeds' ? '#0284c7' : '#64748b',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <Video size={16} /> Live Proctoring Feeds
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminTab('eirf_queue');
            fetchEirfQueue();
          }}
          style={{
            padding: '10px 18px',
            fontSize: '9pt',
            fontWeight: 'bold',
            border: 'none',
            borderBottom: adminTab === 'eirf_queue' ? '2px solid #0284c7' : '2px solid transparent',
            marginBottom: '-2px',
            backgroundColor: adminTab === 'eirf_queue' ? '#ffffff' : 'transparent',
            color: adminTab === 'eirf_queue' ? '#0284c7' : '#64748b',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <FileText size={16} /> EIRF Incident Adjudication Queue
          {countUnderReview > 0 && (
            <span style={{
              backgroundColor: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              fontSize: '7.5pt',
              padding: '1px 7px',
              borderRadius: '10px',
              fontWeight: 'bold'
            }}>
              {countUnderReview} Action Required
            </span>
          )}
        </button>
      </div>

      {adminTab === 'feeds' ? (
        <>
          {/* SPACE-SAVING TOP CONTROL BAR */}
          <div style={{
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            backgroundColor: '#f8fafc',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '20px',
            border: '1px solid var(--cf-border)',
            alignItems: 'flex-end'
          }}>
            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Select Examination</label>
              <select
                className="cf-input"
                style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                value={selectedProctorTest ? (selectedProctorTest.id || selectedProctorTest._id) : ''}
                onChange={e => {
                  const val = e.target.value;
                  const found = (Array.isArray(adminTests) ? adminTests : []).find(t => (t.id || t._id) === val);
                  setSelectedProctorTest(found || null);
                  setSelectedProctorStudent(null);
                  if (fetchLiveSubmissions) {
                    fetchLiveSubmissions(val || null);
                  }
                }}
              >
                <option value="">-- Choose Live Access Exam --</option>
                {(Array.isArray(adminTests) ? adminTests : []).map(t => (
                  <option key={t.id || t._id} value={t.id || t._id}>{t.title}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Select Examinee</label>
              <select
                className="cf-input"
                style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                value={selectedProctorStudent ? (selectedProctorStudent.id || selectedProctorStudent._id) : ''}
                onChange={e => {
                  const found = (Array.isArray(liveSubmissions) ? liveSubmissions : []).find(s => (s.id || s._id) === e.target.value);
                  setSelectedProctorStudent(found || null);
                  setDashboardInitialTab('proctoring');
                }}
                disabled={!selectedProctorTest}
              >
                <option value="">{selectedProctorTest ? "-- Choose Student Support --" : "-- Select an Exam First --"}</option>
                {selectedProctorTest && (() => {
                  const tId = selectedProctorTest.id || selectedProctorTest._id;
                  const currentSubs = Array.isArray(liveSubmissions) ? liveSubmissions : [];
                  const testStudents = currentSubs.filter(s => String(s.testId) === String(tId));
                  return testStudents.map(sub => {
                    const subId = sub.id || sub._id;
                    const isActive = sub.status === 'started';
                    const hasEirf = sub.hasEirfFlag || sub.eirfStatus;
                    const prefix = isActive ? '[Active] ' : '[Completed] ';
                    const eirfBadge = hasEirf ? ' ⚠️ [EIRF]' : '';
                    return (
                      <option key={subId} value={subId}>
                        {prefix} {sub.candidateName} ({sub.studentId}){eirfBadge}
                      </option>
                    );
                  });
                })()}
              </select>
            </div>
          </div>

          {/* MONITOR SCREEN CONTAINER */}
          <div style={{ minHeight: '400px' }}>
            {!selectedProctorStudent ? (
              <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', color: '#64748b', borderStyle: 'dashed', minHeight: '360px' }}>
                <Video size={48} style={{ color: '#94a3b8', marginBottom: '15px' }} />
                <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#334155', margin: '0 0 5px 0' }}>Examinee Session Monitor</h3>
                <p style={{ fontSize: '8.5pt', color: '#64748b', maxWidth: '380px', margin: 0 }}>
                  Select a configured examination and choose a candidate from the top dropdown selectors to view real-time camera proctoring feeds or review historic logs.
                </p>
              </div>
            ) : (
              <StudentProctorDashboard
                sub={selectedProctorStudent}
                onClose={() => setSelectedProctorStudent(null)}
                fetchLiveSubmissions={fetchLiveSubmissions}
                initialTab={dashboardInitialTab}
              />
            )}
          </div>
        </>
      ) : (
        /* EIRF INCIDENT ADJUDICATION QUEUE VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* KPI CARDS BAR */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px'
          }}>
            <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '8pt', color: '#0369a1', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Total Flagged Incidents
              </div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#0c4a6e', marginTop: '4px' }}>
                {countTotal}
              </div>
              <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                Across all preliminary examinations
              </div>
            </div>

            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '8pt', color: '#b45309', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={13} /> Needs Committee Action
              </div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#b45309', marginTop: '4px' }}>
                {countUnderReview}
              </div>
              <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                Filed EIRFs awaiting verdict
              </div>
            </div>

            <div style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '8pt', color: '#7e22ce', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} /> Awaiting Candidate
              </div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#6b21a8', marginTop: '4px' }}>
                {countAwaiting}
              </div>
              <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                Within 45-minute statutory window
              </div>
            </div>

            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '8pt', color: '#b91c1c', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <XCircle size={13} /> Window Expired
              </div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#991b1b', marginTop: '4px' }}>
                {countExpired}
              </div>
              <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                No filing within 45 minutes
              </div>
            </div>

            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '8pt', color: '#15803d', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} /> Verdict Issued
              </div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#166534', marginTop: '4px' }}>
                {countVerdict}
              </div>
              <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                Official signed certificates sealed
              </div>
            </div>
          </div>

          {/* FILTER & SEARCH BAR */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            border: '1px solid var(--cf-border)',
            borderRadius: '6px',
            padding: '12px 16px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: `All Incidents (${countTotal})` },
                { id: 'UNDER_REVIEW', label: `Needs Review (${countUnderReview})` },
                { id: 'AWAITING_EIRF', label: `Awaiting Filing (${countAwaiting})` },
                { id: 'EXPIRED', label: `Expired (${countExpired})` },
                { id: 'VERDICT_ISSUED', label: `Verdict Issued (${countVerdict})` }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setEirfFilter(f.id)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '8pt',
                    fontWeight: eirfFilter === f.id ? 'bold' : 'normal',
                    backgroundColor: eirfFilter === f.id ? '#e0f2fe' : '#ffffff',
                    color: eirfFilter === f.id ? '#0369a1' : '#475569',
                    border: `1px solid ${eirfFilter === f.id ? '#7dd3fc' : '#cbd5e1'}`,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search candidate, BICS ID, course..."
                value={eirfSearch}
                onChange={e => setEirfSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  fontSize: '8.5pt',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          </div>

          {/* TABLE SECTION */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
            {loadingEirf ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={24} className="spin-smooth" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '9pt', fontWeight: 'bold' }}>Loading Incident Adjudication Registry...</div>
              </div>
            ) : filteredList.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                <ShieldCheck size={36} style={{ color: '#10b981', marginBottom: '10px' }} />
                <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#1e293b' }}>No Incident Records Matching Current Filter</div>
                <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '4px' }}>
                  All candidates under this category are clear, or no incidents were registered.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '8.5pt' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '12px 14px' }}>Examinee</th>
                      <th style={{ padding: '12px 14px' }}>BICS ID &amp; Ref</th>
                      <th style={{ padding: '12px 14px' }}>Examination Title</th>
                      <th style={{ padding: '12px 14px' }}>Incident Trigger</th>
                      <th style={{ padding: '12px 14px' }}>Statutory Window</th>
                      <th style={{ padding: '12px 14px' }}>Pipeline Status</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((row, idx) => {
                      const isExpired = row.pipelineStatus === 'EXPIRED' || row.isExpired;
                      const isAwaiting = row.pipelineStatus === 'AWAITING_EIRF';
                      const isReview = row.pipelineStatus === 'UNDER_REVIEW';
                      const isVerdict = row.pipelineStatus === 'VERDICT_ISSUED';

                      return (
                        <tr
                          key={row._id || idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                            transition: 'background-color 0.1s ease'
                          }}
                        >
                          {/* Examinee */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 'bold', color: '#002147' }}>{row.candidateName}</div>
                            <div style={{ fontSize: '7.5pt', color: '#64748b' }}>ID: {row.studentId}</div>
                          </td>

                          {/* BICS ID */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                fontFamily: 'monospace',
                                fontSize: '8pt',
                                backgroundColor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                color: '#1e293b'
                              }}>
                                {row.bicsId || 'N/A'}
                              </span>
                              <button
                                type="button"
                                title="Copy BICS ID"
                                onClick={() => handleCopyBicsId(row.bicsId)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: copiedBicsId === row.bicsId ? '#10b981' : '#94a3b8' }}
                              >
                                {copiedBicsId === row.bicsId ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                            <div style={{ fontSize: '7pt', color: '#94a3b8', marginTop: '2px' }}>
                              Ref: {row.reportId}
                            </div>
                          </td>

                          {/* Exam Title */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: '500', color: '#334155', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.testTitle}>
                              {row.testTitle}
                            </div>
                            <div style={{ fontSize: '7pt', color: '#94a3b8' }}>
                              Submitted: {row.submittedAt ? new Date(row.submittedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'N/A'} IST
                            </div>
                          </td>

                          {/* Trigger */}
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              fontSize: '7.5pt',
                              fontWeight: 'bold',
                              color: '#b91c1c',
                              backgroundColor: '#fef2f2',
                              border: '1px solid #fecaca',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <ShieldAlert size={11} /> {row.triggerViolation || 'Proctoring Alert'}
                            </span>
                          </td>

                          {/* Statutory Window */}
                          <td style={{ padding: '12px 14px' }}>
                            {isAwaiting ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#7e22ce', fontWeight: 'bold', fontSize: '8pt' }}>
                                <Clock size={13} className="spin-smooth" />
                                <span>{getRemainingTime(row.expiresAt)}</span>
                              </div>
                            ) : isExpired ? (
                              <span style={{ fontSize: '7.5pt', color: '#b91c1c', fontWeight: 'bold' }}>
                                Window Expired
                              </span>
                            ) : isReview ? (
                              <span style={{ fontSize: '7.5pt', color: '#0369a1', fontWeight: '500' }}>
                                Filed by Examinee
                              </span>
                            ) : (
                              <span style={{ fontSize: '7.5pt', color: '#15803d', fontWeight: '500' }}>
                                Adjudicated
                              </span>
                            )}
                          </td>

                          {/* Pipeline Status Pill */}
                          <td style={{ padding: '12px 14px' }}>
                            {isReview ? (
                              <span style={{
                                fontSize: '7.5pt',
                                fontWeight: 'bold',
                                backgroundColor: '#fffbeb',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <AlertCircle size={11} /> UNDER REVIEW
                              </span>
                            ) : isAwaiting ? (
                              <span style={{
                                fontSize: '7.5pt',
                                fontWeight: 'bold',
                                backgroundColor: '#faf5ff',
                                color: '#7e22ce',
                                border: '1px solid #e9d5ff',
                                padding: '3px 8px',
                                borderRadius: '12px'
                              }}>
                                AWAITING EIRF
                              </span>
                            ) : isExpired ? (
                              <span style={{
                                fontSize: '7.5pt',
                                fontWeight: 'bold',
                                backgroundColor: '#fef2f2',
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                padding: '3px 8px',
                                borderRadius: '12px'
                              }}>
                                EXPIRED
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '7.5pt',
                                fontWeight: 'bold',
                                backgroundColor: row.status === 'approved' ? '#ecfdf5' : '#fef2f2',
                                color: row.status === 'approved' ? '#047857' : '#b91c1c',
                                border: `1px solid ${row.status === 'approved' ? '#a7f3d0' : '#fecaca'}`,
                                padding: '3px 8px',
                                borderRadius: '12px'
                              }}>
                                {row.status === 'approved' ? 'APPROVED' : 'REJECTED'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                              {isVerdict && (
                                <a
                                  href={`${API_BASE}/test/eirf/verdict-pdf/${row.reportId || row.rawSubmissionId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Download Signed PDF Certificate"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '7.5pt',
                                    fontWeight: 'bold',
                                    padding: '4px 8px',
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    color: '#0369a1',
                                    textDecoration: 'none'
                                  }}
                                >
                                  <ExternalLink size={11} /> Verdict PDF
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => handleLaunchAudit(row)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '7.5pt',
                                  fontWeight: 'bold',
                                  padding: '5px 10px',
                                  backgroundColor: isReview ? '#fffbeb' : '#f0f9ff',
                                  border: `1px solid ${isReview ? '#fde68a' : '#bae6fd'}`,
                                  borderRadius: '4px',
                                  color: isReview ? '#b45309' : '#0369a1',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Eye size={12} /> {isReview ? 'Adjudicate Now' : 'Forensic Audit'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}