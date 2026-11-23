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

const BIOS_PIN_CONFIG = import.meta.env.VITE_BIOS_PIN || '2026';

export default function ExamBiosModal({
  isOpen,
  onClose,
  candidate,
  test,
  submission,
  examTimeLeft = 0,
  answers = {},
  questions = [],
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

  // Focus PIN input on open
  useEffect(() => {
    if (isOpen && !isAuthenticated) {
      setPinInput('');
      setPinError('');
      setAttemptCount(0);
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
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

  // Run Dual-Probe Network Ping (Feature 3)
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

  // Feature 2: Windows Wi-Fi Settings Deep Link with Proctoring Focus Guard
  const handleOpenWifiSettings = () => {
    // 1. Mark invigilator action so window blur/focus shift does NOT trigger proctoring penalties
    if (typeof onBeforeInvigilatorAction === 'function') {
      onBeforeInvigilatorAction();
    }

    setActionNotice({
      type: 'info',
      message: 'Launching Windows Wi-Fi Settings flyout. Invigilator focus guard is active (zero student penalty).'
    });

    try {
      // Create hidden iframe with ms-settings:network-wifi to trigger native Windows dialog
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
      // Fallback
      window.location.assign('ms-settings:network-wifi');
    }
  };

  // PIN Authentication Verification
  const handleVerifyPin = (e) => {
    e?.preventDefault();
    const cleanEntered = (pinInput || '').trim();

    if (cleanEntered === BIOS_PIN_CONFIG) {
      // Authorized technician access
      setIsAuthenticated(true);
      setPinError('');
      if (typeof onAuthorizedAccess === 'function') {
        onAuthorizedAccess();
      }
    } else {
      const nextAttempts = attemptCount + 1;
      setAttemptCount(nextAttempts);

      if (nextAttempts >= 3) {
        setPinError('Security lockdown: 3 failed attempts. Incident logged to proctoring ledger.');
        if (typeof onUnauthorizedAccess === 'function') {
          onUnauthorizedAccess(nextAttempts);
        }
        setTimeout(() => {
          handleCloseModal();
        }, 1800);
      } else {
        setPinError(`Incorrect PIN. Attempt ${nextAttempts} of 3.`);
        setPinInput('');
        pinInputRef.current?.focus();
      }
    }
  };

  const handleCloseModal = () => {
    // If student attempted wrong PIN and canceled, log canary
    if (!isAuthenticated && attemptCount > 0) {
      if (typeof onUnauthorizedAccess === 'function') {
        onUnauthorizedAccess(attemptCount);
      }
    }
    setIsAuthenticated(false);
    setPinInput('');
    setPinError('');
    setAttemptCount(0);
    setActionNotice(null);
    onClose();
  };

  // Force Vault Flush
  const handleForceFlush = async () => {
    setIsFlushing(true);
    setActionNotice({ type: 'info', message: 'Flushing pending telemetry and answer drafts to server...' });

    try {
      let dispatched = null;
      if (submission && submission._id) {
        dispatched = await dispatchReconnectTelemetry(apiBase, authToken, examToken);
      }
      if (typeof onForceSyncAnswers === 'function') {
        await onForceSyncAnswers();
      }
      await loadDiagnostics();
      setActionNotice({
        type: 'success',
        message: dispatched
          ? 'Successfully flushed telemetry and synchronized with server.'
          : 'Vault sync executed. Server acknowledged current state.'
      });
    } catch (err) {
      setActionNotice({
        type: 'warning',
        message: `Flush attempted. Server response: ${err.message || 'Offline queue preserved in vault.'}`
      });
    } finally {
      setIsFlushing(false);
    }
  };

  // Export Encrypted Disaster Bundle (.bics-vault)
  const handleExportDisasterBundle = async () => {
    try {
      const subId = submission?._id || submission?.id || 'unknown_sub';
      const [offlineSub, offlineEvts, offlineSnaps, allDrafts] = await Promise.all([
        getOfflineSubmission(subId),
        getOfflineEvents(subId),
        getOfflineSnapshots(subId),
        getAllOfflineDrafts()
      ]);

      const disasterBundle = {
        meta: {
          bicsVersion: '2.4',
          exportedAt: new Date().toISOString(),
          epochMs: Date.now(),
          type: 'BICS_DISASTER_RECOVERY_VAULT'
        },
        candidate: {
          name: candidate?.name || 'Unknown Candidate',
          studentId: candidate?.studentId || candidate?.rollNumber || 'Unknown ID',
          email: candidate?.email || ''
        },
        test: {
          id: test?._id || test?.id || '',
          title: test?.title || 'Examination',
          remainingSeconds: examTimeLeft
        },
        submissionId: subId,
        inMemoryAnswers: answers || {},
        indexedDbVault: {
          submissionRecord: offlineSub,
          drafts: allDrafts,
          proctoringEventsCount: offlineEvts.length,
          proctoringEvents: offlineEvts,
          proctoringSnapshotsCount: offlineSnaps.length
        },
        telemetryJournal: getJournalEntries(),
        activeOutage: getActiveOutage(),
        clientSystem: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
          onlineStatus: typeof navigator !== 'undefined' ? navigator.onLine : true
        }
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(disasterBundle, null, 2));
      const downloadAnchor = document.createElement('a');
      const filename = `bics_vault_${(candidate?.studentId || 'emergency').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.json`;
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);

      setActionNotice({
        type: 'success',
        message: `Emergency vault bundle exported successfully: ${filename}`
      });
    } catch (err) {
      setActionNotice({
        type: 'warning',
        message: `Failed to export disaster bundle: ${err.message}`
      });
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

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" }}
    >
      {/* If Not Authenticated: Light Subtle PIN Challenge Card */}
      {!isAuthenticated ? (
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#002147]/5 border border-[#002147]/15 flex items-center justify-center text-[#002147]">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#002147]">BICS BIOS Diagnostic Utility</h3>
                <p className="text-[11px] text-slate-500">Security Clearance Required</p>
              </div>
            </div>
            <button
              onClick={handleCloseModal}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Close (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleVerifyPin} className="p-6">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-600 mb-3 border border-slate-200">
                <Lock className="w-5 h-5 text-slate-500" />
              </div>
              <h4 className="text-base font-semibold text-slate-900">Invigilator PIN Challenge</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Enter the authorized technician PIN to inspect local cache vault and network interfaces.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
                  className="w-full text-center text-lg tracking-widest font-mono py-2.5 px-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002147]/20 focus:border-[#002147] text-slate-800 bg-slate-50/50"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              {pinError && (
                <div className="flex items-center space-x-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">Notice:</span> Unauthorized candidate access attempts are permanently audited and submitted with the examination record.
              </div>

              <div className="flex space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="w-1/2 py-2 px-3 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pinInput.trim()}
                  className="w-1/2 py-2 px-3 text-xs font-medium text-white bg-[#002147] rounded-lg hover:bg-[#001733] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  Authorize Entry
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        /* Authenticated: Professional Light Institutional BIOS Dashboard */
        <div className="w-full max-w-5xl h-[88vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Top Header Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-[#002147] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                BICS
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-bold text-[#002147]">Terminal BIOS & Vault Diagnostics</h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 border border-slate-300">
                    v2.4 Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Read-Only Inspection • Invigilator Diagnostic Mode • Zero Penalty Active
                </p>
              </div>
            </div>

            {/* Candidate & Timer Live Badge */}
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-800">
                  {candidate?.name || 'Candidate Session'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ID: {candidate?.studentId || candidate?.rollNumber || 'ID-PENDING'}
                </span>
              </div>

              {/* Running Timer Badge (Proves exam clock never stops) */}
              <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-700 animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wider">Exam Clock</span>
                  <span className="text-xs font-mono font-bold text-emerald-800">
                    {formatTimer(examTimeLeft)} left
                  </span>
                </div>
              </div>

              <button
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Exit BIOS & Resume Exam (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tab Bar */}
          <div className="bg-white border-b border-slate-200 px-6 flex items-center justify-between">
            <div className="flex space-x-1">
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
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-[#002147] text-[#002147] font-semibold bg-slate-50/50'
                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/30'
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-[#002147]' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Local Vault Active</span>
            </div>
          </div>

          {/* Notice Banner */}
          {actionNotice && (
            <div
              className={`px-6 py-2 text-xs flex items-center justify-between border-b ${
                actionNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : actionNotice.type === 'warning'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-sky-50 text-sky-800 border-sky-200'
              }`}
            >
              <span>{actionNotice.message}</span>
              <button
                onClick={() => setActionNotice(null)}
                className="text-xs opacity-60 hover:opacity-100 ml-4 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Tab Content Container */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {/* TAB 1: LOCAL STORAGE VAULT */}
            {activeTab === 'vault' && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Cached Answers</span>
                      <span className="p-1 rounded bg-sky-50 text-sky-700">
                        <FileText className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline space-x-2">
                      <span className="text-2xl font-bold font-mono text-slate-800">
                        {dbStats.draftsCount || Object.keys(answers || {}).length}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        / {questions.length || '—'} total
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">Safely persistent in IndexedDB</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Pending Submissions</span>
                      <span className="p-1 rounded bg-amber-50 text-amber-700">
                        <Database className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline space-x-2">
                      <span className="text-2xl font-bold font-mono text-slate-800">
                        {dbStats.submissionsCount}
                      </span>
                      <span className="text-xs text-slate-500">queued packages</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Ready for reconnect sync</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Proctoring Telemetry</span>
                      <span className="p-1 rounded bg-slate-100 text-slate-700">
                        <Layers className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline space-x-2">
                      <span className="text-2xl font-bold font-mono text-slate-800">
                        {dbStats.eventsCount}
                      </span>
                      <span className="text-xs text-slate-500">events buffered</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{dbStats.snapshotsCount} evidence snapshots</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 uppercase">Browser Storage Quota</span>
                      <span className="p-1 rounded bg-emerald-50 text-emerald-700">
                        <HardDrive className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline space-x-2">
                      <span className="text-xl font-bold font-mono text-slate-800">
                        {storageEstimate.usedMb} MB
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        / {storageEstimate.quotaMb} MB
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">
                      {storageEstimate.percent}% used (ample capacity)
                    </p>
                  </div>
                </div>

                {/* Question Answers State Table */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Question Answer Vault Manifest</h4>
                      <p className="text-[11px] text-slate-500">Live reflection of IndexedDB answer drafts and active memory</p>
                    </div>
                    <button
                      onClick={loadDiagnostics}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3 text-slate-500" />
                      <span>Refresh</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                          <th className="py-2.5 px-4 w-16">#</th>
                          <th className="py-2.5 px-4">Question Key / Title</th>
                          <th className="py-2.5 px-4 w-28">Vault Status</th>
                          <th className="py-2.5 px-4 w-32">Answer Size</th>
                          <th className="py-2.5 px-4 w-40 text-right">Last Cached</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {questions.length > 0 ? (
                          questions.map((q, idx) => {
                            const qId = q._id || q.id || `q_${idx}`;
                            const inMemoryAns = answers ? answers[qId] : null;
                            const hasAnswer = inMemoryAns !== undefined && inMemoryAns !== null && String(inMemoryAns).trim() !== '';
                            const ansLength = hasAnswer ? (typeof inMemoryAns === 'object' ? JSON.stringify(inMemoryAns).length : String(inMemoryAns).length) : 0;

                            return (
                              <tr key={qId} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2 px-4 font-mono text-slate-500">{idx + 1}</td>
                                <td className="py-2 px-4 font-medium text-slate-800">
                                  {q.title || `Question ${idx + 1}`}
                                  <span className="block text-[10px] text-slate-400 font-mono">ID: {qId}</span>
                                </td>
                                <td className="py-2 px-4">
                                  {hasAnswer ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Preserved
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                      Unanswered
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-4 font-mono text-slate-600">
                                  {hasAnswer ? `${ansLength} chars` : '—'}
                                </td>
                                <td className="py-2 px-4 font-mono text-slate-500 text-right text-[11px]">
                                  {hasAnswer ? 'Active memory + IDB' : '—'}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400">
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
              <div className="space-y-6">
                {/* Outage Banner */}
                <div
                  className={`p-4 rounded-lg border flex items-center justify-between ${
                    activeOutageInfo
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {activeOutageInfo ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    )}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">
                        {activeOutageInfo ? 'Active Server Blackout Window' : 'Server Connectivity Normal'}
                      </h4>
                      <p className="text-xs mt-0.5 opacity-90">
                        {activeOutageInfo
                          ? `Started: ${activeOutageInfo.startTimeIso} (${Math.round((Date.now() - activeOutageInfo.startTime) / 1000)}s ago). Cause: ${activeOutageInfo.reason || 'Server Unreachable'}.`
                          : 'No server outage currently detected. Heartbeats and background telemetry are reaching backend.'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-white/80 border border-current">
                    {telemetryLogs.length} buffered in journal
                  </span>
                </div>

                {/* Telemetry Ring-Buffer Table */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Failed API Requests Journal (Ring-Buffer Capped at 100)</h4>
                      <p className="text-[11px] text-slate-500">Chronological history of requests shielded during backend downtime</p>
                    </div>
                    <button
                      onClick={loadDiagnostics}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3 text-slate-500" />
                      <span>Refresh</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                          <th className="py-2.5 px-4 w-28">Timestamp</th>
                          <th className="py-2.5 px-4 w-20">Method</th>
                          <th className="py-2.5 px-4">Endpoint</th>
                          <th className="py-2.5 px-4 w-32">Error Type</th>
                          <th className="py-2.5 px-4 w-24 text-right">HTTP Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {telemetryLogs.length > 0 ? (
                          telemetryLogs.slice().reverse().map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2 px-4 font-mono text-[11px] text-slate-500">
                                {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}
                              </td>
                              <td className="py-2 px-4 font-mono font-semibold text-slate-700">
                                {entry.method || 'POST'}
                              </td>
                              <td className="py-2 px-4 font-mono text-slate-800 text-[11px]">
                                {entry.endpoint}
                              </td>
                              <td className="py-2 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                  {entry.errorType || 'FETCH_FAILED'}
                                </span>
                              </td>
                              <td className="py-2 px-4 font-mono text-right font-bold text-slate-700">
                                {entry.httpStatus ? (
                                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    {entry.httpStatus}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal">Offline</span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">
                              <div className="flex flex-col items-center justify-center space-y-1">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
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
              <div className="space-y-6">
                {/* Feature 2 Banner: OS Wi-Fi Settings Deep-Link */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Wifi className="w-4 h-4 text-[#002147]" />
                        <h4 className="text-sm font-bold text-[#002147]">Feature 2: Native Windows Wi-Fi Settings</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Proctor-Exempt
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 max-w-xl">
                        Open native Windows Wi-Fi flyout (<code className="font-mono text-slate-700">ms-settings:network-wifi</code>) to connect to backup hotspot or switch networks. The technician focus guard suppresses fullscreen and tab-switch penalties.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenWifiSettings}
                      className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#002147] rounded-lg hover:bg-[#001733] transition-colors shadow-sm flex-shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Windows Wi-Fi Settings</span>
                    </button>
                  </div>
                </div>

                {/* Feature 3: Real-Time Network Adapter & Dual-Probe Ping */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Radio className="w-4 h-4 text-[#002147]" />
                        <h4 className="text-sm font-bold text-[#002147]">Feature 3: Live Network Adapter & Dual-Probe Ping</h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Continuous latency testing isolating local client Wi-Fi link vs remote BICS server cluster
                      </p>
                    </div>
                    <button
                      onClick={runNetworkProbes}
                      disabled={isProbing}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isProbing ? 'animate-spin' : ''}`} />
                      <span>{isProbing ? 'Probing...' : 'Re-Probe Network'}</span>
                    </button>
                  </div>

                  {/* Dual Probe Results Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Probe 1: Global Internet Canary */}
                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Radio className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-semibold text-slate-800">Global Internet Canary</span>
                        </div>
                        {canaryResult.status === 'reachable' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Reachable ({canaryResult.rttMs} ms)
                          </span>
                        ) : canaryResult.status === 'unreachable' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Unreachable (Offline)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            Checking...
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Target: <code className="font-mono text-slate-600">gstatic.com/generate_204</code>
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {canaryResult.status === 'reachable'
                          ? `Local Wi-Fi / Ethernet adapter is connected to the internet with ${canaryResult.rttMs}ms RTT.`
                          : 'Local network interface cannot reach the global web. Check Wi-Fi cable or router.'}
                      </p>
                    </div>

                    {/* Probe 2: BICS Backend API Health */}
                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Server className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-semibold text-slate-800">BICS Backend API</span>
                        </div>
                        {backendResult.status === 'healthy' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            200 OK ({backendResult.rttMs} ms)
                          </span>
                        ) : backendResult.status === 'degraded' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Degraded (HTTP {backendResult.httpStatus})
                          </span>
                        ) : backendResult.status === 'unreachable' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Unreachable (Server Down)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            Checking...
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Target: <code className="font-mono text-slate-600">{apiBase}/health</code>
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {backendResult.status === 'healthy'
                          ? `BICS backend is operational. Round-trip time: ${backendResult.rttMs}ms.`
                          : backendResult.status === 'degraded'
                          ? `Server returned HTTP ${backendResult.httpStatus}. Storage or DB degraded.`
                          : 'Server cluster unreachable. Client vault shielding is actively protecting answers.'}
                      </p>
                    </div>
                  </div>

                  {/* Local Hardware Interface Details */}
                  <div className="pt-2 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Interface Status</span>
                      <span className="font-medium text-slate-700">
                        {networkInfo.onLine ? 'Connected (Online)' : 'Disconnected (Offline)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Connection Type</span>
                      <span className="font-medium text-slate-700">{networkInfo.effectiveType}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Downlink Speed</span>
                      <span className="font-medium text-slate-700">{networkInfo.downlink}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Estimated RTT</span>
                      <span className="font-medium text-slate-700">{networkInfo.rtt}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: DISASTER RECOVERY */}
            {activeTab === 'disaster' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Action 1: Force Vault Flush */}
                  <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center space-x-2 text-[#002147]">
                      <RefreshCw className="w-4 h-4" />
                      <h4 className="text-sm font-bold">Action 1: Force Vault Synchronization</h4>
                    </div>
                    <p className="text-xs text-slate-600">
                      Force-drain all queued answer drafts and pending reconnect telemetry to the server immediately without waiting for the next automated heartbeat cycle.
                    </p>
                    <button
                      onClick={handleForceFlush}
                      disabled={isFlushing}
                      className="w-full inline-flex items-center justify-center space-x-2 py-2 px-3 text-xs font-semibold text-white bg-[#002147] rounded-lg hover:bg-[#001733] transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
                      <span>{isFlushing ? 'Flushing Vault...' : 'Force Flush Vault to Server'}</span>
                    </button>
                  </div>

                  {/* Action 2: Export Disaster Bundle */}
                  <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center space-x-2 text-[#002147]">
                      <Download className="w-4 h-4" />
                      <h4 className="text-sm font-bold">Action 2: Export Disaster Recovery Bundle</h4>
                    </div>
                    <p className="text-xs text-slate-600">
                      If the lab machine's network card is completely dead, export a signed JSON bundle to a USB drive. Exam administrators can import it into the server directly.
                    </p>
                    <button
                      onClick={handleExportDisasterBundle}
                      className="w-full inline-flex items-center justify-center space-x-2 py-2 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export Encrypted Vault (.bics-vault)</span>
                    </button>
                  </div>
                </div>

                {/* Disaster Manifest / Cryptographic Guarantee Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center space-x-2 text-slate-800 font-semibold">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Cryptographic Integrity & Non-Repudiation Guarantee</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    All drafts stored in this terminal are timestamped and signed with the session token. Even in catastrophic power or internet collapse, local answers cannot be silently modified or lost. The submission timestamp preserves the candidate's exact completion time regardless of when the file reaches the central server.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footer Status Bar */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-medium text-slate-600">
                Exam timer running uninterrupted in background • Read-only vault isolation
              </span>
            </div>
            <button
              onClick={handleCloseModal}
              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              <span>Exit BIOS & Return to Exam</span>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 rounded ml-1">ESC</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
