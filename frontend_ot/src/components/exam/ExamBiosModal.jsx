import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  Unlock,
  Wifi,
  WifiOff,
  Database,
  Activity,
  HardDrive,
  RefreshCw,
  Download,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  FileText,
  X,
  Server,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  getOfflineDbStats,
  getAllOfflineDrafts,
  getOfflineSubmission,
  getOfflineEvents,
  getOfflineSnapshots
} from '../../utils/offlineDb';
import {
  getJournalEntries,
  getActiveOutage,
  dispatchReconnectTelemetry
} from '../../utils/telemetryJournal';
import { isQuestionAnswered as checkIsQuestionAnswered } from '../../utils/examAnswerStatus';

const getStoredBiosAttemptCount = () => {
  try {
    return parseInt(sessionStorage.getItem('bics_bios_attempt_count') || '0', 10) || 0;
  } catch (_) {
    return 0;
  }
};

const setStoredBiosAttemptCount = (count) => {
  try {
    sessionStorage.setItem('bics_bios_attempt_count', String(count));
  } catch (_) {}
};

const cleanCodeStr = (str) => (str || '').replace(/\r\n/g, '\n').trim();

/**
 * Resolves whether a question has been answered by the candidate.
 * Strictly checks actually stored values according to the question type.
 * Handles Array format (examAnswers[idx]), Dictionary format (answers[qId]),
 * and live in-progress active drafts.
 */
export function resolveQuestionAnswer(q, idx, answers, cachedDrafts, activeDraft) {
  if (!q) return { hasAnswer: false, summary: '—', raw: null };
  const qId = q._id || q.id || `q_${idx}`;

  // 1. Locate answer object from memory (Authoritative truth)
  let ans = null;
  if (Array.isArray(answers)) {
    ans = answers.find(a => a && (String(a.questionId) === String(qId) || String(a.questionId) === String(q._id) || String(a.questionId) === String(q.id))) ?? answers[idx];
  } else if (answers && typeof answers === 'object') {
    ans = answers[qId] ?? answers[q._id] ?? answers[q.id] ?? answers[idx] ?? answers[String(idx)];
  }

  // Clone or initialize answer object
  let workingAns = ans && typeof ans === 'object' ? { ...ans } : (ans !== undefined && ans !== null ? { answer: ans } : {});

  // 2. If activeDraft matches this question, overlay live activeDraft values
  let draftsMap = {};
  if (activeDraft && (activeDraft.qIndex === idx || String(activeDraft.questionId) === String(qId))) {
    draftsMap = {
      draftMCQ: activeDraft.draftMCQ,
      draftCode: activeDraft.draftCode,
      draftLanguage: activeDraft.draftLanguage,
      draftHtml: activeDraft.draftHtml,
      draftCss: activeDraft.draftCss,
      draftJs: activeDraft.draftJs
    };

    if (activeDraft.draftMCQ !== undefined) {
      if (activeDraft.draftMCQ === null) {
        workingAns.selectedOptionIndex = null;
        workingAns.selectedOptionIndices = [];
      } else if (Array.isArray(activeDraft.draftMCQ)) {
        workingAns.selectedOptionIndices = activeDraft.draftMCQ;
        workingAns.selectedOptionIndex = activeDraft.draftMCQ.length > 0 ? activeDraft.draftMCQ[0] : null;
      } else if (typeof activeDraft.draftMCQ === 'number') {
        workingAns.selectedOptionIndex = activeDraft.draftMCQ;
        workingAns.selectedOptionIndices = [activeDraft.draftMCQ];
      }
    }
    if (activeDraft.draftCode !== undefined) workingAns.submittedCode = activeDraft.draftCode;
    if (activeDraft.draftLanguage) workingAns.selectedLanguage = activeDraft.draftLanguage;
    if (activeDraft.draftHtml !== undefined) workingAns.submittedHtml = activeDraft.draftHtml;
    if (activeDraft.draftCss !== undefined) workingAns.submittedCss = activeDraft.draftCss;
    if (activeDraft.draftJs !== undefined) workingAns.submittedJs = activeDraft.draftJs;
  }

  // 3. Evaluate strictly by question type against actually stored values
  const isMCC = Boolean(q.type === 'mcc' || q.isMultiChoice === true || (Array.isArray(q.correctOptionIndices) && q.correctOptionIndices.length > 1));
  const isMCQ = Boolean(q.type === 'mcq' || q.type === 'scc' || (Array.isArray(q.options) && q.options.length > 0)) && !isMCC;
  const isWeb = q.type === 'web';
  const isCoding = q.type === 'coding' || (!isMCQ && !isMCC && !isWeb);

  // 3A. Multi-Choice Multi-Correct (MCC)
  if (isMCC) {
    const rawOpts = (draftsMap.draftMCQ !== undefined && Array.isArray(draftsMap.draftMCQ))
      ? draftsMap.draftMCQ
      : (Array.isArray(workingAns.selectedOptionIndices) && workingAns.selectedOptionIndices.length > 0
          ? workingAns.selectedOptionIndices
          : (Array.isArray(workingAns.selectedOptionIndex) ? workingAns.selectedOptionIndex : []));
    const validOpts = rawOpts.filter(o => typeof o === 'number' && o >= 0 && o < (q.options?.length || 26));
    if (validOpts.length === 0) {
      return { hasAnswer: false, summary: '—', raw: workingAns };
    }
    const labels = validOpts.map(o => String.fromCharCode(65 + Number(o))).join(', ');
    return { hasAnswer: true, summary: `Selected [${labels}]`, raw: workingAns };
  }

  // 3B. Single-Choice Single-Correct (MCQ / SCC)
  if (isMCQ) {
    const rawOpt = (draftsMap.draftMCQ !== undefined && typeof draftsMap.draftMCQ === 'number')
      ? draftsMap.draftMCQ
      : ((typeof workingAns.selectedOptionIndex === 'number' && workingAns.selectedOptionIndex >= 0)
          ? workingAns.selectedOptionIndex
          : (Array.isArray(workingAns.selectedOptionIndices) && workingAns.selectedOptionIndices.length > 0 && typeof workingAns.selectedOptionIndices[0] === 'number'
              ? workingAns.selectedOptionIndices[0]
              : null));
    if (rawOpt === null || rawOpt === undefined || rawOpt < 0 || rawOpt >= (q.options?.length || 26)) {
      return { hasAnswer: false, summary: '—', raw: workingAns };
    }
    return { hasAnswer: true, summary: `Option ${String.fromCharCode(65 + Number(rawOpt))}`, raw: workingAns };
  }

  // 3C. Web Development
  if (isWeb) {
    const isAnswered = checkIsQuestionAnswered(q, workingAns, draftsMap);
    if (!isAnswered) {
      return { hasAnswer: false, summary: '—', raw: workingAns };
    }
    const curH = cleanCodeStr(draftsMap.draftHtml !== undefined ? draftsMap.draftHtml : workingAns.submittedHtml);
    const curC = cleanCodeStr(draftsMap.draftCss !== undefined ? draftsMap.draftCss : workingAns.submittedCss);
    const curJ = cleanCodeStr(draftsMap.draftJs !== undefined ? draftsMap.draftJs : workingAns.submittedJs);
    const totalChars = curH.length + curC.length + curJ.length;
    return { hasAnswer: true, summary: `Web code (${totalChars} chars)`, raw: workingAns };
  }

  // 3D. Algorithmic Coding
  if (isCoding) {
    const isAnswered = checkIsQuestionAnswered(q, workingAns, draftsMap);
    if (!isAnswered) {
      return { hasAnswer: false, summary: '—', raw: workingAns };
    }
    const code = cleanCodeStr(draftsMap.draftCode !== undefined ? draftsMap.draftCode : workingAns.submittedCode);
    const lang = draftsMap.draftLanguage || workingAns.selectedLanguage || workingAns.language || 'cpp';
    return { hasAnswer: true, summary: `${lang} (${code.length} chars)`, raw: workingAns };
  }

  // 3E. Free-text response
  if (typeof workingAns.answer === 'string' && workingAns.answer.trim().length > 0) {
    return { hasAnswer: true, summary: `${workingAns.answer.trim().length} chars`, raw: workingAns };
  }

  return { hasAnswer: false, summary: '—', raw: workingAns };
}

export default function ExamBiosModal({
  isOpen,
  onClose,
  candidate,
  test,
  submission,
  examTimeLeft = 0,
  answers = [],
  questions = [],
  activeDraft = null,
  apiBase = 'http://127.0.0.1:5000/api',
  authToken = '',
  examToken = '',
  onUnauthorizedAccess,
  onAuthorizedAccess,
  onBeforeInvigilatorAction,
  onForceSyncAnswers
}) {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' | 'journal' | 'network' | 'disaster'

  // Diagnostic Data State
  const [dbStats, setDbStats] = useState({
    submissionsCount: 0,
    eventsCount: 0,
    snapshotsCount: 0,
    draftsCount: 0
  });
  const [storageEstimate, setStorageEstimate] = useState({ usedMb: '0.00', quotaMb: '0.00', percent: '0' });
  const [cachedDrafts, setCachedDrafts] = useState([]);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [activeOutageInfo, setActiveOutageInfo] = useState(null);

  // Network Dual-Probe State
  const [isProbing, setIsProbing] = useState(false);
  const [networkInfo, setNetworkInfo] = useState({
    onLine: typeof navigator !== 'undefined' ? navigator.onLine : true,
    effectiveType: 'unknown',
    downlink: 'unknown',
    rtt: 'unknown'
  });
  const [canaryResult, setCanaryResult] = useState({ status: 'pending', rttMs: null, checkedAt: null });
  const [backendResult, setBackendResult] = useState({ status: 'pending', rttMs: null, checkedAt: null, httpStatus: null });

  // Action status feedback
  const [actionNotice, setActionNotice] = useState(null);
  const [isFlushing, setIsFlushing] = useState(false);

  const pinInputRef = useRef(null);

  // Reset authentication and input state whenever modal is closed (Prevents PIN bypass on reopen)
  useEffect(() => {
    if (!isOpen) {
      setIsAuthenticated(false);
      setPinInput('');
      setPinError('');
      setIsVerifyingPin(false);
      setActionNotice(null);
    }
  }, [isOpen]);

  // Focus PIN input on open and restore session-persisted attempt count
  useEffect(() => {
    if (isOpen && !isAuthenticated) {
      setPinInput('');
      const savedAttempts = getStoredBiosAttemptCount();
      setAttemptCount(savedAttempts);
      if (savedAttempts >= 3) {
        setPinError('Security lockdown: 3 failed attempts. Terminal BIOS locked. Contact administrator.');
      } else {
        setPinError('');
        setTimeout(() => {
          pinInputRef.current?.focus();
        }, 100);
      }
    }
  }, [isOpen, isAuthenticated]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAuthenticated, attemptCount]);

  // Load diagnostics once authenticated
  const loadDiagnostics = async () => {
    try {
      // 1. IndexedDB Statistics
      const stats = await getOfflineDbStats();
      setDbStats(stats);

      // 2. Drafts
      const drafts = await getAllOfflineDrafts();
      setCachedDrafts(drafts);

      // 3. Storage Quota
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          const usedMb = (estimate.usage / (1024 * 1024)).toFixed(2);
          const quotaMb = (estimate.quota / (1024 * 1024)).toFixed(0);
          const percent = ((estimate.usage / (estimate.quota || 1)) * 100).toFixed(1);
          setStorageEstimate({ usedMb, quotaMb, percent });
        } catch (e) {
          // ignore
        }
      }

      // 4. Telemetry Journal
      const logs = getJournalEntries();
      setTelemetryLogs(logs);

      // 5. Active Outage status
      const outage = getActiveOutage();
      setActiveOutageInfo(outage);

      // 6. Network status
      checkNetworkStatus();
    } catch (err) {
      console.warn('[ExamBiosModal] Error loading diagnostics:', err);
    }
  };

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadDiagnostics();
      runNetworkProbes();
    }
  }, [isOpen, isAuthenticated]);

  const checkNetworkStatus = () => {
    if (typeof navigator === 'undefined') return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    setNetworkInfo({
      onLine: navigator.onLine,
      effectiveType: conn ? conn.effectiveType || 'unknown' : 'standard',
      downlink: conn ? (conn.downlink ? `${conn.downlink} Mbps` : 'unknown') : 'standard',
      rtt: conn ? (conn.rtt ? `${conn.rtt} ms` : 'unknown') : 'standard'
    });
  };

  // Run Dual-Probe Network Ping
  const runNetworkProbes = async () => {
    setIsProbing(true);
    checkNetworkStatus();

    // 1. Global Internet Canary Probe (gstatic 204)
    const canaryStart = performance.now();
    try {
      await fetch(`https://www.gstatic.com/generate_204?t=${Date.now()}`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(3500)
      });
      const canaryRtt = Math.round(performance.now() - canaryStart);
      setCanaryResult({
        status: 'reachable',
        rttMs: canaryRtt,
        checkedAt: new Date().toLocaleTimeString()
      });
    } catch (e) {
      setCanaryResult({
        status: 'unreachable',
        rttMs: null,
        checkedAt: new Date().toLocaleTimeString(),
        error: e.message
      });
    }

    // 2. BICS Backend API Health Probe
    const backendStart = performance.now();
    try {
      const cleanBase = (apiBase || '').replace(/\/api\/?$/, '');
      const healthUrl = `${cleanBase}/api/health?t=${Date.now()}`;
      const res = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(4000)
      });
      const backendRtt = Math.round(performance.now() - backendStart);
      if (res.ok) {
        setBackendResult({
          status: 'healthy',
          httpStatus: res.status,
          rttMs: backendRtt,
          checkedAt: new Date().toLocaleTimeString()
        });
      } else {
        setBackendResult({
          status: 'degraded',
          httpStatus: res.status,
          rttMs: backendRtt,
          checkedAt: new Date().toLocaleTimeString()
        });
      }
    } catch (e) {
      setBackendResult({
        status: 'unreachable',
        httpStatus: null,
        rttMs: null,
        checkedAt: new Date().toLocaleTimeString(),
        error: e.message
      });
    }

    setIsProbing(false);
  };

  // Windows Wi-Fi Settings Deep Link with Proctoring Focus Guard
  const handleOpenWifiSettings = () => {
    if (typeof onBeforeInvigilatorAction === 'function') {
      onBeforeInvigilatorAction();
    }

    setActionNotice({
      type: 'info',
      message: 'Launching Windows Wi-Fi Settings flyout. Invigilator focus guard is active (zero student penalty).'
    });

    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'ms-settings:network-wifi';
      document.body.appendChild(iframe);
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (e) {}
      }, 2500);
    } catch (e) {
      window.location.assign('ms-settings:network-wifi');
    }
  };

  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // PIN Authentication Verification via Backend API (Fail-Closed, Rate-Limited, Server-Authoritative)
  const handleVerifyPin = async (e) => {
    e?.preventDefault();
    if (isVerifyingPin) return;

    const currentAttempts = getStoredBiosAttemptCount();
    if (currentAttempts >= 3) {
      setPinError('Security lockdown: 3 failed attempts. Terminal BIOS locked. Contact administrator to reset.');
      return;
    }

    const cleanEntered = (pinInput || '').trim();
    if (!cleanEntered) {
      setPinError('Please enter the 4-digit access PIN.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError('');

    try {
      const subId = submission?._id || submission?.id || '';
      const response = await fetch(`${apiBase}/tests/bios/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          ...(examToken ? { 'x-exam-token': examToken } : {})
        },
        body: JSON.stringify({
          pin: cleanEntered,
          submissionId: subId
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.authorized) {
        setIsAuthenticated(true);
        setPinError('');
        setStoredBiosAttemptCount(0);
        setAttemptCount(0);
        if (typeof onAuthorizedAccess === 'function') {
          onAuthorizedAccess(data.sessionExpirySeconds || 180);
        }
      } else {
        if (data.lockedOut) {
          setStoredBiosAttemptCount(3);
          setAttemptCount(3);
          setPinError(data.error || 'Security lockdown: 3 failed attempts. Terminal BIOS locked. Contact administrator to reset.');
          if (typeof onUnauthorizedAccess === 'function') {
            onUnauthorizedAccess(3);
          }
          setTimeout(() => {
            handleCloseModal();
          }, 2000);
        } else {
          const nextAttempts = data.attemptsRemaining !== undefined ? (3 - data.attemptsRemaining) : (currentAttempts + 1);
          setStoredBiosAttemptCount(nextAttempts);
          setAttemptCount(nextAttempts);

          if (nextAttempts >= 3) {
            setPinError('Security lockdown: 3 failed attempts. Incident logged to proctoring ledger.');
            if (typeof onUnauthorizedAccess === 'function') {
              onUnauthorizedAccess(nextAttempts);
            }
            setTimeout(() => {
              handleCloseModal();
            }, 2000);
          } else {
            const errMsg = data.error || `Incorrect PIN. Attempt ${nextAttempts} of 3.`;
            setPinError(errMsg);
            setPinInput('');
            pinInputRef.current?.focus();
          }
        }
      }
    } catch (err) {
      console.error('[BICS BIOS] PIN verification network error:', err);
      setPinError('Verification failed: Server unreachable or offline.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleCloseModal = () => {
    setIsAuthenticated(false);
    setPinInput('');
    setPinError('');
    setActionNotice(null);
    onClose();
  };

  // Force Vault Flush with Truthful Status Feedback
  const handleForceFlush = async () => {
    setIsFlushing(true);
    setActionNotice({ type: 'info', message: 'Flushing pending telemetry and answer drafts to server...' });

    try {
      let dispatched = null;
      if (submission && submission._id) {
        dispatched = await dispatchReconnectTelemetry(apiBase, authToken, examToken);
      }
      
      let syncResult = null;
      if (typeof onForceSyncAnswers === 'function') {
        syncResult = await onForceSyncAnswers();
      }
      await loadDiagnostics();

      if (syncResult && syncResult.success) {
        setActionNotice({
          type: 'success',
          message: `Successfully synchronized ${syncResult.answersCount ?? 'all'} answer(s) and telemetry with central server.`
        });
      } else if (syncResult && syncResult.error) {
        setActionNotice({
          type: 'warning',
          message: `Server status: ${syncResult.error}. Answers preserved in local vault.`
        });
      } else {
        setActionNotice({
          type: dispatched ? 'success' : 'info',
          message: dispatched
            ? 'Successfully flushed telemetry and synchronized with server.'
            : 'Vault state refreshed. Answers preserved in local vault.'
        });
      }
    } catch (err) {
      setActionNotice({
        type: 'warning',
        message: `Flush attempted: ${err.message || 'Server unreachable'}. All drafts preserved in local vault.`
      });
    } finally {
      setIsFlushing(false);
    }
  };

  if (!isOpen) return null;

  // Format seconds into MM:SS
  const formatTimer = (seconds) => {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Calculate actual answered count from questions
  const answeredCount = questions.length > 0
    ? questions.filter((q, idx) => resolveQuestionAnswer(q, idx, answers, cachedDrafts, activeDraft).hasAnswer).length
    : (Array.isArray(answers) ? answers.filter(a => a && (a.isSavedByUser || (a.selectedOptionIndex !== null && a.selectedOptionIndex !== undefined))).length : 0);

  return (
    <>
      <style>{`
        .bics-bios-root,
        .bics-bios-root * {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          box-sizing: border-box;
        }
        .bics-bios-btn-subtle {
          background-color: #f0f7ff !important;
          border: 1.5px solid #93c5fd !important;
          color: #1d4ed8 !important;
          transition: all 0.15s ease !important;
        }
        .bics-bios-btn-subtle:hover:not(:disabled) {
          background-color: #e0f2fe !important;
          border-color: #60a5fa !important;
          color: #1e40af !important;
        }
        .bics-bios-btn-secondary {
          background-color: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          color: #475569 !important;
          transition: all 0.15s ease !important;
        }
        .bics-bios-btn-secondary:hover {
          background-color: #f8fafc !important;
          border-color: #94a3b8 !important;
          color: #1e293b !important;
        }
      `}</style>
      <div
        className="bics-bios-root"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999999,
          padding: '16px',
          boxSizing: 'border-box',
          userSelect: 'none'
        }}
      >
        {/* If Not Authenticated: Subtle, Light PIN Challenge Card */}
        {!isAuthenticated ? (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              border: '1px solid #e2e8f0',
              width: '100%',
              maxWidth: '430px',
              overflow: 'hidden',
              textAlign: 'left'
            }}
          >
            {/* Header with BICS Logo */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={`${import.meta.env.BASE_URL}bics_logo.png`}
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'true'; e.currentTarget.src = '/bics_logo.png'; } }}
                  alt="BICS Logo"
                  style={{ width: '28px', height: '28px', objectFit: 'contain', flexShrink: 0 }}
                />
                <div>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#1e293b', lineHeight: 1.25 }}>
                    BICS BIOS Diagnostic Utility
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                    Security Clearance Required
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                title="Close (ESC)"
                className="bics-bios-btn-secondary"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '5px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleVerifyPin} style={{ padding: '24px 22px', margin: 0 }}>
              <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    color: '#2563eb'
                  }}
                >
                  <Lock size={20} />
                </div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                  Invigilator PIN Challenge
                </h4>
                <p style={{ margin: '6px auto 0', fontSize: '12px', color: '#64748b', maxWidth: '300px', lineHeight: '1.45' }}>
                  Enter the authorized technician PIN to inspect local cache vault and network interfaces.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#475569',
                      marginBottom: '6px'
                    }}
                  >
                    4-Digit Access PIN
                  </label>
                  <input
                    ref={pinInputRef}
                    type="password"
                    maxLength={8}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      if (pinError) setPinError('');
                    }}
                    placeholder="••••"
                    autoComplete="off"
                    autoFocus
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      textAlign: 'center',
                      fontSize: '22px',
                      letterSpacing: '0.35em',
                      fontFamily: 'monospace',
                      padding: '10px 14px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '8px',
                      outline: 'none',
                      color: '#0f172a',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.15s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#2563eb';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {pinError && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11.5px',
                      color: '#be123c',
                      backgroundColor: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      padding: '9px 12px'
                    }}
                  >
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{pinError}</span>
                  </div>
                )}

                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '11px',
                    color: '#64748b',
                    lineHeight: '1.45'
                  }}
                >
                  <span style={{ fontWeight: '700', color: '#334155' }}>Notice:</span> Unauthorized candidate access attempts are permanently audited and submitted with the examination record.
                </div>

                <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="bics-bios-btn-secondary"
                    style={{
                      flex: 1,
                      padding: '9px 14px',
                      fontSize: '12px',
                      fontWeight: '600',
                      borderRadius: '7px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!pinInput.trim() || isVerifyingPin}
                    className="bics-bios-btn-subtle"
                    style={{
                      flex: 1,
                      padding: '9px 14px',
                      fontSize: '12px',
                      fontWeight: '600',
                      borderRadius: '7px',
                      cursor: pinInput.trim() && !isVerifyingPin ? 'pointer' : 'not-allowed',
                      opacity: pinInput.trim() && !isVerifyingPin ? 1 : 0.5,
                      boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)'
                    }}
                  >
                    {isVerifyingPin ? 'Verifying...' : 'Authorize Entry'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          /* Authenticated: Professional Light Institutional BIOS Dashboard */
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              border: '1px solid #cbd5e1',
              width: '95%',
              maxWidth: '1040px',
              height: '86vh',
              maxHeight: '860px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              textAlign: 'left'
            }}
          >
            {/* Top Header Bar with BICS Logo */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={`${import.meta.env.BASE_URL}bics_logo.png`}
                  onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = 'true'; e.currentTarget.src = '/bics_logo.png'; } }}
                  alt="BICS Logo"
                  style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0 }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                      Terminal BIOS & Vault Diagnostics
                    </h2>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1'
                      }}
                    >
                      v2.4 Live
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                    Read-Only Inspection • Invigilator Diagnostic Mode • Zero Penalty Active
                  </p>
                </div>
              </div>

              {/* Candidate & Timer Live Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>
                    {candidate?.name || 'Candidate Session'}
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'monospace' }}>
                    ID: {candidate?.studentId || candidate?.rollNumber || 'ID-PENDING'}
                  </span>
                </div>

                {/* Running Timer Badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    padding: '5px 12px'
                  }}
                >
                  <Clock size={14} style={{ color: '#047857' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '9px', fontWeight: '600', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Exam Clock
                    </span>
                    <span style={{ fontSize: '11.5px', fontFamily: 'monospace', fontWeight: '700', color: '#065f46' }}>
                      {formatTimer(examTimeLeft)} left
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  title="Exit BIOS & Resume Exam (ESC)"
                  className="bics-bios-btn-secondary"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Navigation Tab Bar with Subtle Light Colors */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                padding: '0 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { id: 'vault', label: 'Local Storage Vault', icon: HardDrive },
                  { id: 'journal', label: 'Telemetry Journal', icon: Activity },
                  { id: 'network', label: 'Network & Wi-Fi Tools', icon: Wifi },
                  { id: 'disaster', label: 'Disaster Recovery', icon: ShieldCheck }
                ].map((tab) => {
                  const IconComponent = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '11px 16px',
                        fontSize: '12px',
                        fontWeight: isActive ? '700' : '500',
                        color: isActive ? '#1d4ed8' : '#64748b',
                        backgroundColor: isActive ? '#eff6ff' : 'transparent',
                        border: 'none',
                        borderBottom: isActive ? '2.5px solid #2563eb' : '2.5px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <IconComponent size={14} style={{ color: isActive ? '#2563eb' : '#94a3b8' }} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                <span>Local Vault Active</span>
              </div>
            </div>

            {/* Notice Banner */}
            {actionNotice && (
              <div
                style={{
                  padding: '9px 20px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${
                    actionNotice.type === 'success' ? '#a7f3d0' : actionNotice.type === 'warning' ? '#fde68a' : '#bae6fd'
                  }`,
                  backgroundColor:
                    actionNotice.type === 'success' ? '#ecfdf5' : actionNotice.type === 'warning' ? '#fffbeb' : '#f0f9ff',
                  color:
                    actionNotice.type === 'success' ? '#065f46' : actionNotice.type === 'warning' ? '#92400e' : '#0369a1',
                  flexShrink: 0
                }}
              >
                <span>{actionNotice.message}</span>
                <button
                  type="button"
                  onClick={() => setActionNotice(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    padding: '2px 6px',
                    opacity: 0.7
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Tab Content Container */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                backgroundColor: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}
            >
              {/* TAB 1: LOCAL STORAGE VAULT */}
              {activeTab === 'vault' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Metric Summary Cards */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '14px'
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                          Cached Answers
                        </span>
                        <span style={{ padding: '4px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#2563eb' }}>
                          <FileText size={15} />
                        </span>
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b' }}>
                          {answeredCount}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                          / {questions.length || '—'} answered
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#059669', fontWeight: '500' }}>
                        Safely persistent in IndexedDB
                      </p>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                          Pending Submissions
                        </span>
                        <span style={{ padding: '4px', borderRadius: '4px', backgroundColor: '#fffbeb', color: '#d97706' }}>
                          <Database size={15} />
                        </span>
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b' }}>
                          {dbStats.submissionsCount}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>queued packages</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                        Ready for reconnect sync
                      </p>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                          Proctoring Telemetry
                        </span>
                        <span style={{ padding: '4px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569' }}>
                          <Layers size={15} />
                        </span>
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b' }}>
                          {dbStats.eventsCount}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>events buffered</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                        {dbStats.snapshotsCount} evidence snapshots
                      </p>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                          Browser Storage Quota
                        </span>
                        <span style={{ padding: '4px', borderRadius: '4px', backgroundColor: '#ecfdf5', color: '#059669' }}>
                          <HardDrive size={15} />
                        </span>
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'monospace', color: '#1e293b' }}>
                          {storageEstimate.usedMb} MB
                        </span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          / {storageEstimate.quotaMb} MB
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#059669', fontWeight: '500' }}>
                        {storageEstimate.percent}% used (ample capacity)
                      </p>
                    </div>
                  </div>

                  {/* Question Answers State Table with Real Answer Status */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 18px',
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <h4 style={{ margin: 0, fontSize: '12.5px', fontWeight: '700', color: '#1e293b' }}>
                          Question Answer Vault Manifest
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                          Live reflection of IndexedDB answer drafts and active memory
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadDiagnostics}
                        className="bics-bios-btn-secondary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 10px',
                          fontSize: '11.5px',
                          fontWeight: '500',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <RefreshCw size={12} style={{ color: '#64748b' }} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: '600' }}>
                            <th style={{ padding: '9px 16px', width: '60px' }}>#</th>
                            <th style={{ padding: '9px 16px' }}>Question Key / Title</th>
                            <th style={{ padding: '9px 16px', width: '120px' }}>Vault Status</th>
                            <th style={{ padding: '9px 16px', width: '180px' }}>Answer Summary</th>
                            <th style={{ padding: '9px 16px', width: '160px', textAlign: 'right' }}>Storage Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questions.length > 0 ? (
                            questions.map((q, idx) => {
                              const qId = q._id || q.id || `q_${idx}`;
                              const status = resolveQuestionAnswer(q, idx, answers, cachedDrafts, activeDraft);

                              return (
                                <tr
                                  key={qId}
                                  style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    transition: 'background-color 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                                >
                                  <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: '#64748b' }}>{idx + 1}</td>
                                  <td style={{ padding: '9px 16px', fontWeight: '500', color: '#1e293b' }}>
                                    {q.title || `Question ${idx + 1}`}
                                    <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                      ID: {qId}
                                    </span>
                                  </td>
                                  <td style={{ padding: '9px 16px' }}>
                                    {status.hasAnswer ? (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '10.5px',
                                          fontWeight: '600',
                                          backgroundColor: '#ecfdf5',
                                          color: '#047857',
                                          border: '1px solid #a7f3d0'
                                        }}
                                      >
                                        Preserved
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '10.5px',
                                          fontWeight: '600',
                                          backgroundColor: '#f8fafc',
                                          color: '#64748b',
                                          border: '1px solid #e2e8f0'
                                        }}
                                      >
                                        Unanswered
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: status.hasAnswer ? '#1e293b' : '#94a3b8', fontSize: '11px' }}>
                                    {status.summary}
                                  </td>
                                  <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: '#64748b', textAlign: 'right', fontSize: '11px' }}>
                                    {status.hasAnswer ? 'Active memory + IDB' : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                                No active questions loaded in context.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TELEMETRY JOURNAL */}
              {activeTab === 'journal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Outage Banner */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '8px',
                      border: `1px solid ${activeOutageInfo ? '#fde68a' : '#a7f3d0'}`,
                      backgroundColor: activeOutageInfo ? '#fffbeb' : '#ecfdf5',
                      color: activeOutageInfo ? '#92400e' : '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {activeOutageInfo ? (
                        <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0 }} />
                      ) : (
                        <CheckCircle2 size={20} style={{ color: '#059669', flexShrink: 0 }} />
                      )}
                      <div>
                        <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {activeOutageInfo ? 'Active Server Blackout Window' : 'Server Connectivity Normal'}
                        </h4>
                        <p style={{ margin: '3px 0 0', fontSize: '11.5px', opacity: 0.9 }}>
                          {activeOutageInfo
                            ? `Started: ${activeOutageInfo.startTimeIso} (${Math.round((Date.now() - activeOutageInfo.startTime) / 1000)}s ago). Cause: ${activeOutageInfo.reason || 'Server Unreachable'}.`
                            : 'No server outage currently detected. Heartbeats and background telemetry are reaching backend.'}
                        </p>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: '600',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        border: '1px solid currentColor',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {telemetryLogs.length} buffered in journal
                    </span>
                  </div>

                  {/* Telemetry Ring-Buffer Table */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 18px',
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <h4 style={{ margin: 0, fontSize: '12.5px', fontWeight: '700', color: '#1e293b' }}>
                          Failed API Requests Journal (Ring-Buffer Capped at 100)
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                          Chronological history of requests shielded during backend downtime
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadDiagnostics}
                        className="bics-bios-btn-secondary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 10px',
                          fontSize: '11.5px',
                          fontWeight: '500',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <RefreshCw size={12} style={{ color: '#64748b' }} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: '600' }}>
                            <th style={{ padding: '9px 16px', width: '120px' }}>Timestamp</th>
                            <th style={{ padding: '9px 16px', width: '80px' }}>Method</th>
                            <th style={{ padding: '9px 16px' }}>Endpoint</th>
                            <th style={{ padding: '9px 16px', width: '140px' }}>Error Type</th>
                            <th style={{ padding: '9px 16px', width: '100px', textAlign: 'right' }}>HTTP Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {telemetryLogs.length > 0 ? (
                            telemetryLogs.slice().reverse().map((entry) => (
                              <tr
                                key={entry.id}
                                style={{
                                  borderBottom: '1px solid #f1f5f9',
                                  transition: 'background-color 0.15s ease'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                              >
                                <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                                  {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}
                                </td>
                                <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontWeight: '600', color: '#334155' }}>
                                  {entry.method || 'POST'}
                                </td>
                                <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: '#0f172a', fontSize: '11.5px' }}>
                                  {entry.endpoint}
                                </td>
                                <td style={{ padding: '9px 16px' }}>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontSize: '10.5px',
                                      fontWeight: '600',
                                      backgroundColor: '#fff1f2',
                                      color: '#be123c',
                                      border: '1px solid #fecdd3'
                                    }}
                                  >
                                    {entry.errorType || 'FETCH_FAILED'}
                                  </span>
                                </td>
                                <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '700' }}>
                                  {entry.httpStatus ? (
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: '#fffbeb',
                                        color: '#b45309',
                                        border: '1px solid #fde68a'
                                      }}
                                    >
                                      {entry.httpStatus}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>Offline</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                  <CheckCircle2 size={20} style={{ color: '#10b981' }} />
                                  <span>No failed requests recorded. All API transactions succeeded.</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: NETWORK & WI-FI TOOLS (FEATURES 2 & 3) */}
              {activeTab === 'network' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Feature 2 Banner: OS Wi-Fi Settings Deep-Link with Subtle Light Button */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      padding: '18px 20px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Wifi size={16} style={{ color: '#2563eb' }} />
                          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', color: '#0f172a' }}>
                            Feature 2: Native Windows Wi-Fi Settings
                          </h4>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600',
                              backgroundColor: '#ecfdf5',
                              color: '#047857',
                              border: '1px solid #a7f3d0'
                            }}
                          >
                            Proctor-Exempt
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: '#475569', maxWidth: '580px', lineHeight: '1.45' }}>
                          Open native Windows Wi-Fi flyout (<code style={{ fontFamily: 'monospace', backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', color: '#0f172a' }}>ms-settings:network-wifi</code>) to connect to backup hotspot or switch networks. The technician focus guard suppresses fullscreen and tab-switch penalties.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleOpenWifiSettings}
                        className="bics-bios-btn-subtle"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 18px',
                          fontSize: '12px',
                          fontWeight: '600',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)',
                          flexShrink: 0
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Open Windows Wi-Fi Settings</span>
                      </button>
                    </div>
                  </div>

                  {/* Feature 3: Real-Time Network Adapter & Dual-Probe Ping */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      padding: '18px 20px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Radio size={16} style={{ color: '#2563eb' }} />
                          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: '700', color: '#0f172a' }}>
                            Feature 3: Live Network Adapter & Dual-Probe Ping
                          </h4>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                          Continuous latency testing isolating local client Wi-Fi link vs remote BICS server cluster
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={runNetworkProbes}
                        disabled={isProbing}
                        className="bics-bios-btn-secondary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          borderRadius: '6px',
                          cursor: isProbing ? 'not-allowed' : 'pointer',
                          opacity: isProbing ? 0.6 : 1
                        }}
                      >
                        <RefreshCw size={13} style={{ color: '#64748b' }} className={isProbing ? 'animate-spin' : ''} />
                        <span>{isProbing ? 'Probing...' : 'Re-Probe Network'}</span>
                      </button>
                    </div>

                    {/* Dual Probe Results Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                      {/* Probe 1: Global Internet Canary */}
                      <div
                        style={{
                          padding: '14px 16px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#f8fafc',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Radio size={15} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                              Global Internet Canary
                            </span>
                          </div>
                          {canaryResult.status === 'reachable' ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0'
                              }}
                            >
                              Reachable ({canaryResult.rttMs} ms)
                            </span>
                          ) : canaryResult.status === 'unreachable' ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#fff1f2',
                                color: '#be123c',
                                border: '1px solid #fecdd3'
                              }}
                            >
                              Unreachable (Offline)
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #e2e8f0'
                              }}
                            >
                              Checking...
                            </span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                          Target: <code style={{ fontFamily: 'monospace', color: '#334155' }}>gstatic.com/generate_204</code>
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#475569', lineHeight: '1.4' }}>
                          {canaryResult.status === 'reachable'
                            ? `Local Wi-Fi / Ethernet adapter is connected to the internet with ${canaryResult.rttMs}ms RTT.`
                            : 'Local network interface cannot reach the global web. Check Wi-Fi cable or router.'}
                        </p>
                      </div>

                      {/* Probe 2: BICS Backend API Health */}
                      <div
                        style={{
                          padding: '14px 16px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#f8fafc',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Server size={15} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                              BICS Backend API
                            </span>
                          </div>
                          {backendResult.status === 'healthy' ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0'
                              }}
                            >
                              200 OK ({backendResult.rttMs} ms)
                            </span>
                          ) : backendResult.status === 'degraded' ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#fffbeb',
                                color: '#b45309',
                                border: '1px solid #fde68a'
                              }}
                            >
                              Degraded (HTTP {backendResult.httpStatus})
                            </span>
                          ) : backendResult.status === 'unreachable' ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#fff1f2',
                                color: '#be123c',
                                border: '1px solid #fecdd3'
                              }}
                            >
                              Unreachable (Server Down)
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: '600',
                                backgroundColor: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #e2e8f0'
                              }}
                            >
                              Checking...
                            </span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                          Target: <code style={{ fontFamily: 'monospace', color: '#334155' }}>{apiBase}/health</code>
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#475569', lineHeight: '1.4' }}>
                          {backendResult.status === 'healthy'
                            ? `BICS backend is operational. Round-trip time: ${backendResult.rttMs}ms.`
                            : backendResult.status === 'degraded'
                            ? `Server returned HTTP ${backendResult.httpStatus}. Storage or DB degraded.`
                            : 'Server cluster unreachable. Client vault shielding is actively protecting answers.'}
                        </p>
                      </div>
                    </div>

                    {/* Local Hardware Interface Details */}
                    <div
                      style={{
                        paddingTop: '10px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '12px',
                        fontSize: '12px'
                      }}
                    >
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>
                          Interface Status
                        </span>
                        <span style={{ fontWeight: '600', color: '#334155' }}>
                          {networkInfo.onLine ? 'Connected (Online)' : 'Disconnected (Offline)'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>
                          Connection Type
                        </span>
                        <span style={{ fontWeight: '600', color: '#334155' }}>{networkInfo.effectiveType}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>
                          Downlink Speed
                        </span>
                        <span style={{ fontWeight: '600', color: '#334155' }}>{networkInfo.downlink}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>
                          Estimated RTT
                        </span>
                        <span style={{ fontWeight: '600', color: '#334155' }}>{networkInfo.rtt}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DISASTER RECOVERY */}
              {activeTab === 'disaster' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Action 1: Force Vault Flush with Subtle Light Button */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      padding: '20px 22px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb' }}>
                        <RefreshCw size={18} />
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                          Force Vault Synchronization & Reconnect Flush
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={handleForceFlush}
                        disabled={isFlushing}
                        className="bics-bios-btn-subtle"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '10px 18px',
                          fontSize: '12.5px',
                          fontWeight: '600',
                          borderRadius: '7px',
                          cursor: isFlushing ? 'not-allowed' : 'pointer',
                          opacity: isFlushing ? 0.6 : 1,
                          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)'
                        }}
                      >
                        <RefreshCw size={13} className={isFlushing ? 'animate-spin' : ''} />
                        <span>{isFlushing ? 'Flushing Vault...' : 'Force Flush Vault to Server'}</span>
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: '1.5', maxWidth: '750px' }}>
                      Force-drain all queued answer drafts and pending reconnect telemetry to the server immediately without waiting for the next automated heartbeat cycle. If the server is reachable, all buffered candidate entries are synced atomically.
                    </p>
                  </div>

                  {/* Disaster Manifest / Cryptographic Guarantee Card */}
                  <div
                    style={{
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '14px 18px',
                      fontSize: '12px',
                      color: '#475569',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: '600' }}>
                      <ShieldCheck size={16} style={{ color: '#059669' }} />
                      <span>Cryptographic Integrity & Non-Repudiation Guarantee</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', lineHeight: '1.5' }}>
                      All drafts stored in this terminal are timestamped and signed with the session token. Even in catastrophic power or internet collapse, local answers cannot be silently modified or lost. The submission timestamp preserves the candidate's exact completion time regardless of when the file reaches the central server.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Footer Status Bar */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#64748b',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                <span style={{ fontWeight: '500', color: '#475569' }}>
                  Exam timer running uninterrupted in background • Read-only vault isolation
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="bics-bios-btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: '600',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <span>Exit BIOS & Return to Exam</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    color: '#64748b',
                    backgroundColor: '#f1f5f9',
                    padding: '1px 5px',
                    borderRadius: '3px'
                  }}
                >
                  ESC
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
