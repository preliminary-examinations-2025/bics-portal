import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatMediaUrl } from '../../utils/media';
import { API_BASE } from '../../config';

export default function AdminCoursework({
  systemConfig,
  adminMessage,
  adminError,
  courseworkSuccess,
  courseworkError,
  handleAddLecture,
  newLecture,
  setNewLecture,
  videoLectures,
  handleDeleteLecture,
  handleAddMaterial,
  newMaterial,
  setNewMaterial,
  setMaterialFile,
  courseMaterials,
  handleDeleteMaterial
}) {
  // Knowledge Base Worker & Logs State
  const [workerStatus, setWorkerStatus] = useState(null);
  const [workerLogs, setWorkerLogs] = useState([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [retryingLectureId, setRetryingLectureId] = useState(null);
  const [retryFeedback, setRetryFeedback] = useState('');
  const [logFilter, setLogFilter] = useState('all'); // 'all', 'error', 'warning', 'success'
  const [workerLogLimit, setWorkerLogLimit] = useState(100);
  const [workerLogSearch, setWorkerLogSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [newEventsCount, setNewEventsCount] = useState(0);
  const lastEventCountRef = useRef(0);
  const userScrolledUpRef = useRef(false);
  const logContainerRef = useRef(null);

  // Poll Worker Status & Logs (Dynamic limit & meta)
  const fetchWorkerData = async () => {
    try {
      // 1. Fetch Status & Metrics
      const statusRes = await fetch(`${API_BASE}/admin/knowledge-base/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setWorkerStatus(statusData);
      }

      // 2. Fetch Latest Logs (dynamic limit, search, object format)
      const logsRes = await fetch(`${API_BASE}/admin/knowledge-base/logs?limit=${workerLogLimit}&format=object`);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        const incomingLogs = Array.isArray(logsData) ? logsData : (logsData.logs || []);
        setWorkerLogs(incomingLogs);
      }
    } catch (err) {
      console.warn('[Admin Coursework] Worker fetch error:', err.message);
    }
  };

  useEffect(() => {
    fetchWorkerData();
    const interval = setInterval(fetchWorkerData, 6000); // Poll every 6 seconds
    return () => clearInterval(interval);
  }, [workerLogLimit]);

  const handleManualRefresh = async () => {
    setIsRefreshingLogs(true);
    const start = Date.now();
    await fetchWorkerData();
    const elapsed = Date.now() - start;
    if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
    setIsRefreshingLogs(false);
  };

  const handleRetryLecture = async (lectureId) => {
    if (!lectureId) return;
    setRetryingLectureId(lectureId);
    setRetryFeedback('');
    try {
      const res = await fetch(`${API_BASE}/admin/knowledge-base/retry/${lectureId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setRetryFeedback(data.message || 'Lecture re-queued for processing.');
        await fetchWorkerData();
      } else {
        setRetryFeedback(data.error || 'Failed to retry lecture.');
      }
    } catch (err) {
      setRetryFeedback(err.message || 'Network error triggering retry.');
    } finally {
      setRetryingLectureId(null);
    }
  };

  const handleStartWorker = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/knowledge-base/start`, { method: 'POST' });
      const data = await res.json();
      setRetryFeedback(data.message || 'Worker started.');
      await fetchWorkerData();
    } catch (err) {
      setRetryFeedback(err.message || 'Failed to start worker.');
    }
  };

  const handleStopWorker = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/knowledge-base/stop`, { method: 'POST' });
      const data = await res.json();
      setRetryFeedback(data.message || 'Worker shut off successfully.');
      await fetchWorkerData();
    } catch (err) {
      setRetryFeedback(err.message || 'Failed to stop worker.');
    }
  };

  const handleResetLecture = async (lectureId) => {
    if (!lectureId) return;
    if (!window.confirm('Reset this lecture knowledge base and schedule fresh, non-hallucinatory re-ingestion?')) return;
    setRetryingLectureId(lectureId);
    try {
      const res = await fetch(`${API_BASE}/admin/knowledge-base/reset/${lectureId}`, { method: 'POST' });
      const data = await res.json();
      setRetryFeedback(data.message || 'Lecture KB reset.');
      await fetchWorkerData();
    } catch (err) {
      setRetryFeedback(err.message || 'Failed to reset lecture KB.');
    } finally {
      setRetryingLectureId(null);
    }
  };

  const formatCountdown = (totalSec) => {
    if (!totalSec || totalSec <= 0) return '0s';
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  const handleLogContainerScroll = (e) => {
    if (!e.currentTarget) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // If user is scrolled up > 35px from bottom, they are inspecting earlier logs
    const isUp = scrollHeight - scrollTop - clientHeight > 35;
    userScrolledUpRef.current = isUp;
    setUserScrolledUp(isUp);
    if (!isUp) {
      setNewEventsCount(0);
    }
  };

  const filteredLogs = [...workerLogs]
    .filter(log => {
      if (workerLogSearch.trim()) {
        const q = workerLogSearch.toLowerCase();
        const matchTitle = log.lectureTitle && log.lectureTitle.toLowerCase().includes(q);
        const matchMsg = log.message && log.message.toLowerCase().includes(q);
        const matchAction = log.action && log.action.toLowerCase().includes(q);
        const matchSection = log.section && log.section.toLowerCase().includes(q);
        if (!matchTitle && !matchMsg && !matchAction && !matchSection) return false;
      }
      if (logFilter === 'all') return true;
      if (logFilter === 'error') return log.status === 'error' || log.action === 'FAILED_FLAGGED';
      if (logFilter === 'warning') return log.status === 'warning' || log.action === 'RETRYING';
      if (logFilter === 'success') return log.status === 'success' || log.action === 'CHUNK_EXTRACTED' || log.action === 'COMPLETED';
      return true;
    })
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  useEffect(() => {
    if (!logContainerRef.current) return;
    const currentCount = filteredLogs.length;
    const added = Math.max(0, currentCount - lastEventCountRef.current);
    lastEventCountRef.current = currentCount;

    // NEVER yank the scroll position if the user is reading earlier logs (scrolled up) or autoScroll is paused!
    if (autoScroll && !userScrolledUpRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    } else if (userScrolledUpRef.current && added > 0) {
      setNewEventsCount(prev => prev + added);
    }
  }, [workerLogs, logFilter, workerLogSearch, autoScroll]);

  const metrics = workerStatus?.metrics || {
    totalLectures: videoLectures?.length || 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    failed: 0
  };

  const flaggedLectures = workerStatus?.flaggedLectures || [];
  const workerActive = workerStatus?.worker?.isRunning;
  const workerState = workerStatus?.worker?.state || 'idle';

  return (
    <div style={{ paddingBottom: '40px' }}>
      <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Coursework Content &amp; AI Engine Manager</h2>
      {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
      {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

      {/* ========================================================================= */}
      {/* 1. KNOWLEDGE BASE INGESTION WORKER VISUAL DASHBOARD (LIGHT THEMED) */}
      {/* ========================================================================= */}
      <div className="cf-card" style={{ borderTop: '3px solid var(--oxford-blue, #3b5998)', marginBottom: '25px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div>
            <div className="cf-card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13pt' }}>⚙️</span>
              <span style={{ color: '#002147', fontWeight: '700' }}>Cortex Ground Truth Ingestion Worker</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '7.5pt',
                fontWeight: 'bold',
                fontFamily: 'Consolas, "Lucida Console", Courier, monospace',
                backgroundColor: workerState === 'processing' ? '#f0fdf4' : workerState === 'waiting_hourly_quota' ? '#fffbeb' : workerState === 'stopped' ? '#fef2f2' : '#f8fafc',
                color: workerState === 'processing' ? '#166534' : workerState === 'waiting_hourly_quota' ? '#92400e' : workerState === 'stopped' ? '#991b1b' : '#475569',
                border: `1px solid ${workerState === 'processing' ? '#bbf7d0' : workerState === 'waiting_hourly_quota' ? '#fde68a' : workerState === 'stopped' ? '#fecaca' : '#cbd5e1'}`
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: workerState === 'processing' ? '#16a34a' : workerState === 'waiting_hourly_quota' ? '#d97706' : workerState === 'stopped' ? '#dc2626' : '#94a3b8'
                }}></span>
                {workerState === 'processing' ? 'PROCESSING (Active)' : workerState === 'waiting_hourly_quota' ? 'HOURLY PACING (1h)' : workerState === 'stopped' ? 'SHUT OFF (Inactive)' : workerState === 'idle' ? 'IDLE (Synced)' : 'STANDBY'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '8.5pt', color: '#64748b' }}>
              Autonomous extraction via <strong>Direct Google Gemini API</strong> (Strict 1-hour spacing enforced to preserve 20 RPD daily quota).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {workerActive ? (
              <button
                onClick={handleStopWorker}
                className="cf-btn-secondary"
                style={{
                  padding: '5px 12px',
                  fontSize: '8pt',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'Consolas, monospace',
                  backgroundColor: '#fef2f2',
                  borderColor: '#fca5a5',
                  color: '#991b1b'
                }}
              >
                <span>🛑 Shut Off Worker</span>
              </button>
            ) : (
              <button
                onClick={handleStartWorker}
                className="cf-btn-secondary"
                style={{
                  padding: '5px 12px',
                  fontSize: '8pt',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'Consolas, monospace',
                  backgroundColor: '#f0fdf4',
                  borderColor: '#86efac',
                  color: '#166534'
                }}
              >
                <span>▶️ Start Ingestion Worker</span>
              </button>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshingLogs}
              className="cf-btn-secondary"
              style={{ padding: '5px 10px', fontSize: '8pt', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'Consolas, monospace', cursor: isRefreshingLogs ? 'default' : 'pointer' }}
            >
              <RefreshCw size={12} className={isRefreshingLogs ? 'spin-smooth' : ''} />
              <span>{isRefreshingLogs ? 'Refreshing...' : 'Refresh Logs'}</span>
            </button>
          </div>
        </div>

        {retryFeedback && (
          <div className="cf-alert cf-alert-info" style={{ marginBottom: '14px', fontSize: '8.5pt', fontFamily: 'Consolas, monospace' }}>
            {retryFeedback}
          </div>
        )}

        {/* METRICS ROW (SUBTLE LIGHT THEMED) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '16pt', fontWeight: '700', color: '#002147', fontFamily: 'Consolas, monospace' }}>{metrics.totalLectures}</div>
            <div style={{ fontSize: '7.5pt', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Videos</div>
          </div>
          <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
            <div style={{ fontSize: '16pt', fontWeight: '700', color: '#166534', fontFamily: 'Consolas, monospace' }}>{metrics.completed}</div>
            <div style={{ fontSize: '7.5pt', fontWeight: '600', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>KB Ready (Verified)</div>
          </div>
          <div style={{ background: '#eff6ff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
            <div style={{ fontSize: '16pt', fontWeight: '700', color: '#1e40af', fontFamily: 'Consolas, monospace' }}>{metrics.inProgress}</div>
            <div style={{ fontSize: '7.5pt', fontWeight: '600', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>In Progress</div>
          </div>
          <div style={{ background: '#fffbeb', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fde68a', textAlign: 'center' }}>
            <div style={{ fontSize: '16pt', fontWeight: '700', color: '#92400e', fontFamily: 'Consolas, monospace' }}>{metrics.pending}</div>
            <div style={{ fontSize: '7.5pt', fontWeight: '600', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Queue Pending</div>
          </div>
          <div style={{ background: metrics.failed > 0 ? '#fef2f2' : '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${metrics.failed > 0 ? '#fecaca' : '#e2e8f0'}`, textAlign: 'center' }}>
            <div style={{ fontSize: '16pt', fontWeight: '700', color: metrics.failed > 0 ? '#991b1b' : '#94a3b8', fontFamily: 'Consolas, monospace' }}>{metrics.failed}</div>
            <div style={{ fontSize: '7.5pt', fontWeight: '600', color: metrics.failed > 0 ? '#991b1b' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Flagged / Failed</div>
          </div>
        </div>

        {/* HOURLY PACING BANNER */}
        {workerStatus?.worker?.state === 'waiting_hourly_quota' && (
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13pt' }}>⏱️</span>
              <div>
                <div style={{ fontSize: '9pt', fontWeight: '700', color: '#92400e' }}>
                  1-Hour Request Spacing Active &bull; Preserving 20 RPD Free Tier Limit
                </div>
                <div style={{ fontSize: '8pt', color: '#78350f', fontFamily: 'Consolas, monospace' }}>
                  Next Gemini API request scheduled in: <strong>{formatCountdown(workerStatus.worker.countdownSeconds)}</strong>
                  {workerStatus.worker.nextScheduledRequestTime && ` (at ${new Date(workerStatus.worker.nextScheduledRequestTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`}
                </div>
              </div>
            </div>
            <span style={{
              fontSize: '7.5pt',
              fontWeight: '700',
              fontFamily: 'Consolas, monospace',
              color: '#92400e',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              {formatCountdown(workerStatus.worker.countdownSeconds)}
            </span>
          </div>
        )}

        {/* ACTIVE PROCESSING BANNER (SUBTLE LIGHT THEME) */}
        {workerStatus?.worker?.activeLectureTitle && (
          <div style={{
            background: '#f0f4fa',
            border: '1px solid #b9c9fe',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12pt' }}>⏳</span>
              <div>
                <div style={{ fontSize: '9pt', fontWeight: '700', color: '#002147' }}>
                  Currently Ingesting: "{workerStatus.worker.activeLectureTitle}"
                </div>
                <div style={{ fontSize: '8pt', color: '#475569', fontFamily: 'Consolas, monospace' }}>
                  Processing Chunk {workerStatus.worker.activeChunk || 1} of {workerStatus.worker.totalChunks || 1} (~25-min slice via Direct Gemini API)
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '7.5pt', color: '#1e40af', fontWeight: '600', fontFamily: 'Consolas, monospace' }}>
                Cooldown: 16s pacing active
              </span>
            </div>
          </div>
        )}

        {/* FLAGGED LECTURES ALERT SECTION (SUBTLE SOFT ROSE PALETTE) */}
        {flaggedLectures.length > 0 && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '12px 14px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12pt' }}>⚠️</span>
              <span style={{ fontWeight: 'bold', color: '#991b1b', fontSize: '9.5pt' }}>
                Flagged for Admin Review ({flaggedLectures.length} Lectures)
              </span>
              <span style={{ fontSize: '7.5pt', color: '#b91c1c', fontFamily: 'Consolas, monospace' }}>
                (Rejected 10+ times &bull; Worker continues persistent retries)
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {flaggedLectures.map((fl, idx) => (
                <div key={idx} style={{
                  background: '#ffffff',
                  border: '1px solid #fee2e2',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '9pt', color: '#991b1b' }}>
                      [{fl.section || 'General'}] {fl.title}
                    </div>
                    <div style={{ fontSize: '7.5pt', color: '#b91c1c', marginTop: '2px', fontFamily: 'Consolas, monospace' }}>
                      <strong>Last Rejection:</strong> {fl.knowledgeBase?.lastError || 'Service busy'} &bull; Attempts: {fl.knowledgeBase?.attempts || 10}
                    </div>
                  </div>
                  <div>
                    <button
                      className="cf-btn-secondary"
                      style={{
                        padding: '3px 9px',
                        fontSize: '7.5pt',
                        borderRadius: '3px',
                        color: '#991b1b',
                        borderColor: '#fca5a5',
                        fontFamily: 'Consolas, monospace'
                      }}
                      disabled={retryingLectureId === fl._id}
                      onClick={() => handleRetryLecture(fl._id)}
                    >
                      {retryingLectureId === fl._id ? 'Re-queuing...' : '🔄 Force Retry'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* LIGHT-THEMED WORKER ACTIVITY LOGS CONSOLE (CONSOLAS FONT) */}
        {/* ===================================================================== */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '9pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Live Ingestion Terminal Console</span>
                <span style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'normal', fontFamily: 'Consolas, monospace' }}>
                  ({filteredLogs.length} events)
                </span>
              </h4>

              {/* Dynamic Log Limit Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: '600' }}>Limit:</span>
                <select
                  value={workerLogLimit}
                  onChange={(e) => setWorkerLogLimit(Number(e.target.value))}
                  style={{
                    fontSize: '7.5pt',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    fontFamily: 'Consolas, monospace'
                  }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </div>

              {/* Auto-Scroll Toggle */}
              <button
                type="button"
                onClick={() => setAutoScroll(prev => !prev)}
                title={autoScroll ? 'Pause automatic scrolling when new events arrive' : 'Resume automatic scrolling to latest events'}
                style={{
                  fontSize: '7pt',
                  padding: '2px 7px',
                  borderRadius: '12px',
                  border: '1px solid',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontFamily: 'Consolas, monospace',
                  backgroundColor: autoScroll ? '#dcfce7' : '#fee2e2',
                  borderColor: autoScroll ? '#86efac' : '#fca5a5',
                  color: autoScroll ? '#166534' : '#991b1b'
                }}
              >
                Auto-scroll: {autoScroll ? 'ON' : 'PAUSED'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Event Search Box */}
              <input
                type="text"
                value={workerLogSearch}
                onChange={(e) => setWorkerLogSearch(e.target.value)}
                placeholder="Search events..."
                style={{
                  fontSize: '7.5pt',
                  padding: '3px 7px',
                  borderRadius: '3px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#1e293b',
                  width: '130px',
                  fontFamily: 'Consolas, monospace'
                }}
              />

              <div style={{ display: 'flex', gap: '3px' }}>
                {['all', 'error', 'warning', 'success'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setLogFilter(tab)}
                    style={{
                      padding: '2px 6px',
                      fontSize: '7pt',
                      borderRadius: '3px',
                      border: '1px solid',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      fontWeight: logFilter === tab ? 'bold' : 'normal',
                      fontFamily: 'Consolas, "Lucida Console", Courier, monospace',
                      backgroundColor: logFilter === tab ? '#002147' : '#ffffff',
                      color: logFilter === tab ? '#ffffff' : '#475569',
                      borderColor: logFilter === tab ? '#002147' : '#cbd5e1'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={logContainerRef}
            onScroll={handleLogContainerScroll}
            className="mongo-bson-mono"
            style={{
              position: 'relative',
              maxHeight: '280px',
              overflowY: 'auto',
              overflowX: 'auto',
              background: '#f8fafc',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              padding: '10px 14px',
              fontSize: '9.5pt',
              color: '#334155',
              lineHeight: '1.55',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)'
            }}
          >
            {filteredLogs.length === 0 ? (
              <div style={{ color: '#64748b', fontStyle: 'italic', padding: '16px 0', textAlign: 'center', fontSize: '9.5pt' }}>
                No worker events logged yet. Background worker daemon is active and polling.
              </div>
            ) : (
              <table
                className="mongo-bson-mono"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: 'none',
                  fontSize: '9.5pt',
                  lineHeight: '1.55'
                }}
              >
                <tbody>
                  {filteredLogs.map((log, idx) => {
                    const timeStr = log.timestamp ? `${new Date(log.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : '--:--:--';
                    
                    // Subtle, gentle light styles for log tags
                    let tagBg = '#eff6ff';
                    let tagBorder = '#bfdbfe';
                    let tagColor = '#1e40af';
                    let actionLabel = log.action || 'INFO';

                    if (log.status === 'error' || log.action === 'FAILED_FLAGGED') {
                      tagBg = '#fef2f2';
                      tagBorder = '#fecaca';
                      tagColor = '#991b1b';
                    } else if (log.status === 'warning' || log.action === 'RETRYING') {
                      tagBg = '#fffbeb';
                      tagBorder = '#fde68a';
                      tagColor = '#92400e';
                    } else if (log.status === 'success' || log.action === 'CHUNK_EXTRACTED' || log.action === 'COMPLETED') {
                      tagBg = '#f0fdf4';
                      tagBorder = '#bbf7d0';
                      tagColor = '#166534';
                    }

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx < filteredLogs.length - 1 ? '1px solid #e2e8f0' : 'none'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td
                          style={{
                            border: 'none',
                            padding: '6px 12px 6px 2px',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top',
                            color: '#64748b',
                            userSelect: 'none'
                          }}
                        >
                          [{timeStr}]
                        </td>
                        <td
                          style={{
                            border: 'none',
                            padding: '6px 12px 6px 0',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top'
                          }}
                        >
                          <span style={{
                            display: 'inline-block',
                            backgroundColor: tagBg,
                            border: `1px solid ${tagBorder}`,
                            color: tagColor,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '700',
                            fontSize: '8.5pt',
                            lineHeight: '1.35'
                          }}>
                            [{actionLabel}]
                          </span>
                        </td>
                        <td
                          style={{
                            border: 'none',
                            padding: '6px 12px 6px 0',
                            width: '100%',
                            verticalAlign: 'top',
                            color: '#1e293b',
                            wordBreak: 'break-word'
                          }}
                        >
                          {log.lectureTitle ? <strong style={{ color: '#002147' }}>&quot;{log.lectureTitle}&quot;: </strong> : ''}
                          {log.message}
                        </td>
                        <td
                          style={{
                            border: 'none',
                            padding: '6px 2px 6px 0',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top',
                            color: '#64748b',
                            fontSize: '8pt',
                            userSelect: 'none',
                            textAlign: 'right'
                          }}
                        >
                          [gemini-direct]
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Floating Jump to Latest Button when User is Reading Earlier Logs */}
            {userScrolledUp && (
              <button
                type="button"
                onClick={() => {
                  if (logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                  }
                  userScrolledUpRef.current = false;
                  setUserScrolledUp(false);
                  setNewEventsCount(0);
                }}
                style={{
                  position: 'sticky',
                  bottom: '6px',
                  float: 'right',
                  zIndex: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  backgroundColor: '#002147',
                  color: '#ffffff',
                  border: '1px solid #3b82f6',
                  fontSize: '7.5pt',
                  fontWeight: '700',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                  cursor: 'pointer'
                }}
              >
                <span>↓ Jump to latest</span>
                {newEventsCount > 0 && (
                  <span style={{ backgroundColor: '#2563eb', padding: '1px 5px', borderRadius: '8px', fontSize: '7pt' }}>
                    +{newEventsCount} new
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ADMIN - MANAGE COURSE VIDEO LECTURES */}
      {/* ========================================================================= */}
      <div className="cf-card" style={{ marginBottom: '25px' }}>
        <div className="cf-card-title">Course Video Lectures Manager</div>
        {courseworkSuccess && <div className="cf-alert cf-alert-success">{courseworkSuccess}</div>}
        {courseworkError && <div className="cf-alert cf-alert-error">{courseworkError}</div>}
        
        {/* Add Lecture Form */}
        <form onSubmit={handleAddLecture} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #cbd5e1' }}>
          <div className="cf-input-group">
            <label className="cf-label">Course Section Name</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newLecture.section}
              onChange={e => setNewLecture({...newLecture, section: e.target.value})}
              placeholder="e.g. Programming with C++"
            />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Lecture Title</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newLecture.title}
              onChange={e => setNewLecture({...newLecture, title: e.target.value})}
              placeholder="e.g. Lecture 1: Introduction"
            />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">YouTube URL Link</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newLecture.youtubeUrl}
              onChange={e => setNewLecture({...newLecture, youtubeUrl: e.target.value})}
              placeholder="e.g. https://www.youtube.com/watch?v=..."
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Add Lecture</button>
          </div>
        </form>

        {/* Lectures List Table */}
        {(() => {
          const safeLectures = Array.isArray(videoLectures) ? videoLectures : [];
          return (
            <>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Active Video Lectures ({safeLectures.length})</h4>
              {safeLectures.length === 0 ? (
                <div className="cf-alert cf-alert-info">No lectures added.</div>
              ) : (
                <div className="cf-table-container">
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Section</th>
                        <th>Lecture Title</th>
                        <th>YouTube Link</th>
                        <th>Knowledge Base (AI RAG)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeLectures.map((l, idx) => {
                        const kbStatus = l.knowledgeBase?.status || (l.knowledgeBase?.chunks?.length > 0 ? 'completed' : 'pending');
                        const isFlagged = l.knowledgeBase?.flaggedForAdmin || kbStatus === 'failed';
                        const chunksCount = l.knowledgeBase?.chunks?.length || 0;

                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold' }}>{l.section}</td>
                      <td>{l.title}</td>
                      <td>
                        <a href={l.youtubeUrl} target="_blank" rel="noreferrer" style={{ fontSize: '8.5pt', color: '#3b5998', textDecoration: 'underline' }}>
                          View Link
                        </a>
                      </td>
                      <td>
                        {kbStatus === 'completed' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#f0fdf4',
                            color: '#166534',
                            border: '1px solid #bbf7d0',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            fontSize: '7.5pt',
                            fontWeight: 'bold',
                            fontFamily: 'Consolas, "Lucida Console", Courier, monospace'
                          }}>
                            ✓ Ready ({chunksCount} chunks)
                          </span>
                        ) : isFlagged ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              background: '#fef2f2',
                              color: '#991b1b',
                              border: '1px solid #fecaca',
                              padding: '2px 8px',
                              borderRadius: '3px',
                              fontSize: '7.5pt',
                              fontWeight: 'bold',
                              fontFamily: 'Consolas, "Lucida Console", Courier, monospace'
                            }}>
                              ⚠️ Flagged
                            </span>
                            <button
                              onClick={() => handleRetryLecture(l._id || l.id)}
                              style={{
                                background: 'transparent',
                                border: '1px solid #fca5a5',
                                color: '#991b1b',
                                padding: '1px 6px',
                                borderRadius: '3px',
                                fontSize: '7pt',
                                cursor: 'pointer',
                                fontFamily: 'Consolas, monospace'
                              }}
                            >
                              Retry
                            </button>
                          </div>
                        ) : kbStatus === 'in_progress' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#eff6ff',
                            color: '#1e40af',
                            border: '1px solid #bfdbfe',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            fontSize: '7.5pt',
                            fontWeight: 'bold',
                            fontFamily: 'Consolas, "Lucida Console", Courier, monospace'
                          }}>
                            ⏳ In Progress
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#fffbeb',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            fontSize: '7.5pt',
                            fontWeight: 'bold',
                            fontFamily: 'Consolas, "Lucida Console", Courier, monospace'
                          }}>
                            ⏱ In Queue
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            className="cf-btn-secondary"
                            title="Reset knowledge base to wipe hallucinations and re-ingest"
                            style={{
                              color: '#92400e',
                              borderColor: '#fde68a',
                              backgroundColor: '#fffbeb',
                              padding: '3px 8px',
                              fontSize: '7.5pt',
                              fontFamily: 'Consolas, monospace',
                              border: '1px solid #fde68a'
                            }}
                            onClick={() => handleResetLecture(l.id || l._id)}
                          >
                            ↻ Reset KB
                          </button>
                          <button
                            className="cf-btn-secondary"
                            style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                            onClick={() => handleDeleteLecture(l.id || l._id)}
                          >
                            Delete
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
      </>
    );
  })()}
</div>

      {/* ========================================================================= */}
      {/* 3. ADMIN - MANAGE COURSE MATERIALS */}
      {/* ========================================================================= */}
      <div className="cf-card">
        <div className="cf-card-title">Course Study Materials Manager</div>
        
        {/* Add Material Form */}
        <form onSubmit={handleAddMaterial} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #cbd5e1' }}>
          <div className="cf-input-group">
            <label className="cf-label">Material Section (Select or Type Custom)</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newMaterial.section}
              onChange={e => setNewMaterial({...newMaterial, section: e.target.value})}
              placeholder="e.g. Curriculum, Textbooks, Assignments..."
              list="material-sections-list"
            />
            <datalist id="material-sections-list">
              <option value="Curriculum" />
              <option value="Textbooks" />
              <option value="External" />
              <option value="Assignments" />
              <option value="Practicals" />
            </datalist>
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Material Title</label>
            <input
              type="text"
              className="cf-input"
              required
              value={newMaterial.title}
              onChange={e => setNewMaterial({...newMaterial, title: e.target.value})}
              placeholder="e.g. BICS C++ Syllabus"
            />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Document File Upload</label>
            <input
              type="file"
              className="cf-input"
              required
              onChange={e => setMaterialFile(e.target.files[0])}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Upload &amp; Add Material</button>
          </div>
        </form>

        {/* Materials List Table */}
        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Active Course Materials ({courseMaterials.length})</h4>
        {courseMaterials.length === 0 ? (
          <div className="cf-alert cf-alert-info">No materials added.</div>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Material Name</th>
                  <th>File/Link Path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {courseMaterials.map((m, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'bold' }}>{m.section}</td>
                    <td>{m.title}</td>
                    <td>
                      <a href={formatMediaUrl(m.fileUrl)} target="_blank" rel="noreferrer" style={{ fontSize: '8.5pt', color: '#3b5998', textDecoration: 'underline' }}>
                        View File
                      </a>
                    </td>
                    <td>
                      <button
                        className="cf-btn-secondary"
                        style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                        onClick={() => handleDeleteMaterial(m.id || m._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
