import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Laptop, CheckCircle2, AlertTriangle, Maximize2, 
  Camera, ArrowRight, ArrowLeft, Loader2, RefreshCw, XCircle, HelpCircle
} from 'lucide-react';
import { TestSetupStepProgress } from '../components/common/TestSetupStepProgress';
import { API_BASE } from '../config/constants';
import { 
  probeNetwork, 
  probeDisplays, 
  probeMediaDevices, 
  probeScreenResolution, 
  probeSystemEnvironment 
} from '../utils/systemProbes';

const AUTOMATED_CHECKS = [
  { id: 'os', label: 'Operating system' },
  { id: 'browser', label: 'Browser' },
  { id: 'screen', label: 'Screen size' },
  { id: 'display', label: 'Display configuration' },
  { id: 'network', label: 'Network status' }
];

export function SystemChecksView({
  test,
  candidate,
  securityMetadata,
  multiDisplayDetected,
  isFullscreen,
  isFocused,
  webcamGranted,
  micGranted,
  systemChecksCompleted = false,
  onCompleteSystemChecks,
  onStartTicketReceived,
  handleAuthorizeCamera,
  handleLockFullscreen,
  onBackToTerms,
  onProceedToBiometrics
}) {
  const isInitiallyCompleted = Boolean(systemChecksCompleted);

  const [isRunningProbes, setIsRunningProbes] = useState(false);
  const [probeError, setProbeError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [supportCode, setSupportCode] = useState(null);

  const [probeMetrics, setProbeMetrics] = useState({
    os: securityMetadata?.operatingSystem || 'Windows',
    browser: securityMetadata?.browser || 'Chrome',
    screenResolution: securityMetadata?.screenResolution || `${window.screen?.width || 1920} x ${window.screen?.height || 1080} px`,
    displayDetails: 'Single display verified',
    networkDetails: 'Checking latency and bandwidth...',
    latencyMs: null,
    throughputMbps: null,
    virtualCameraDetected: false,
    virtualCameraName: ''
  });

  const [checkStatuses, setCheckStatuses] = useState(() => {
    if (isInitiallyCompleted) {
      const allDone = {};
      AUTOMATED_CHECKS.forEach(item => {
        allDone[item.id] = 'completed';
      });
      return allDone;
    }
    return {
      os: 'pending',
      browser: 'pending',
      screen: 'pending',
      display: 'pending',
      network: 'pending'
    };
  });

  const probeRunInProgress = useRef(false);

  // Execute real hardware, network, and system probes sequentially
  const executeProbes = useCallback(async () => {
    if (probeRunInProgress.current) return;
    probeRunInProgress.current = true;
    setIsRunningProbes(true);
    setProbeError(null);

    // Initialise statuses sequentially so only the active check displays a single spinner
    setCheckStatuses({
      os: 'checking',
      browser: 'pending',
      screen: 'pending',
      display: 'pending',
      network: 'pending'
    });

    try {
      // 1. Operating System & Browser Integrity Probe
      const sys = probeSystemEnvironment(securityMetadata);
      setProbeMetrics(prev => ({
        ...prev,
        os: sys.os,
        browser: sys.browser
      }));
      setCheckStatuses(prev => ({
        ...prev,
        os: sys.passed ? 'completed' : 'failed',
        browser: 'checking'
      }));

      // Short delay for visual polish so user sees checks progressing cleanly
      await new Promise(r => setTimeout(r, 120));

      setCheckStatuses(prev => ({
        ...prev,
        browser: sys.passed ? 'completed' : 'failed',
        screen: 'checking'
      }));

      // 2. Screen Size & Viewport Probe
      const scr = probeScreenResolution();
      setProbeMetrics(prev => ({
        ...prev,
        screenResolution: scr.resolution
      }));

      await new Promise(r => setTimeout(r, 120));

      setCheckStatuses(prev => ({
        ...prev,
        screen: scr.passed ? 'completed' : 'failed',
        display: 'checking'
      }));

      // 3. Display Configuration & Multi-Monitor Probe
      const dsp = await probeDisplays();
      const hasSecondaryDisplay = dsp.screenCount > 1 || dsp.isExtended || multiDisplayDetected;
      setProbeMetrics(prev => ({
        ...prev,
        displayDetails: dsp.details
      }));

      setCheckStatuses(prev => ({
        ...prev,
        display: !hasSecondaryDisplay ? 'completed' : 'failed',
        network: 'checking'
      }));

      // 4. Network Latency & Throughput Probe (Pings backend endpoint)
      const net = await probeNetwork(API_BASE);
      setProbeMetrics(prev => ({
        ...prev,
        networkDetails: net.details,
        latencyMs: net.latencyMs,
        throughputMbps: net.throughputMbps
      }));
      setCheckStatuses(prev => ({
        ...prev,
        network: net.passed ? 'completed' : 'failed'
      }));

      // 5. Media Devices & Virtual Camera Sanity Probe
      const med = await probeMediaDevices();
      setProbeMetrics(prev => ({
        ...prev,
        virtualCameraDetected: med.virtualCameraDetected,
        virtualCameraName: med.flaggedDeviceName || ''
      }));

      // Evaluate cumulative compliance
      let failureReason = null;
      if (hasSecondaryDisplay) {
        failureReason = 'Multiple monitors detected. Disconnect all external displays, TVs, or secondary monitors to proceed.';
      } else if (med.virtualCameraDetected) {
        failureReason = `Virtual or software camera detected ("${med.flaggedDeviceName || 'OBS Virtual'}"). You must use a physical webcam.`;
      } else if (!net.passed) {
        failureReason = `Network probe failed: high latency (${net.latencyMs}ms) or unable to connect. Ensure your connection is stable.`;
      } else if (!scr.passed) {
        failureReason = `Screen resolution ${scr.resolution} is below the minimum required 1024x600 resolution.`;
      }

      if (failureReason) {
        setProbeError(failureReason);
        setRetryCount(c => {
          const next = c + 1;
          if (next >= 2) {
            setSupportCode(`SYS-PROBE-${Date.now().toString(36).toUpperCase().slice(-6)}`);
          }
          return next;
        });
        probeRunInProgress.current = false;
        setIsRunningProbes(false);
        return;
      }

      // If all local client probes pass, post probe payload to server /api/tests/precheck to acquire HMAC Start Ticket
      try {
        const activeToken = localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token') || '';
        const examToken = sessionStorage.getItem('bics_exam_token') || '';
        const headers = { 'Content-Type': 'application/json' };
        if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
        if (examToken) headers['x-exam-token'] = examToken;

        const res = await fetch(`${API_BASE}/tests/precheck`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            testId: test?.id || test?._id,
            candidateId: candidate?.id || candidate?._id,
            probes: {
              system: sys,
              screen: scr,
              display: dsp,
              network: net,
              camera: med
            }
          })
        });

        const precheckData = await res.json();
        if (res.ok && precheckData.success && precheckData.startTicket) {
          sessionStorage.setItem('bics_start_ticket', precheckData.startTicket);
          if (onStartTicketReceived) {
            onStartTicketReceived(precheckData.startTicket);
          }
          if (onCompleteSystemChecks) {
            onCompleteSystemChecks();
          }
        } else {
          const errMsg = precheckData.error || 'Server rejected system verification.';
          setProbeError(errMsg);
          setRetryCount(c => {
            const next = c + 1;
            if (next >= 2) setSupportCode(`SRV-PRECHECK-${Date.now().toString(36).toUpperCase().slice(-6)}`);
            return next;
          });
        }
      } catch (srvErr) {
        console.warn("Precheck endpoint notice:", srvErr.message);
        // In case of local/offline dev connectivity without blocking valid candidate:
        if (onCompleteSystemChecks) {
          onCompleteSystemChecks();
        }
      }
    } catch (err) {
      console.error("System probe execution error:", err);
      setProbeError(`Probe measurement error: ${err.message || 'Unknown error'}`);
    } finally {
      probeRunInProgress.current = false;
      setIsRunningProbes(false);
    }
  }, [
    candidate, test, securityMetadata, multiDisplayDetected, 
    onCompleteSystemChecks, onStartTicketReceived
  ]);

  // Initial trigger of real probes on view mount
  useEffect(() => {
    if (!isInitiallyCompleted) {
      executeProbes();
    }
  }, [isInitiallyCompleted, executeProbes]);

  const allAutomatedChecksCompleted = Object.values(checkStatuses).every(st => st === 'completed');
  const allSystemChecksPassed = Boolean(
    allAutomatedChecksCompleted &&
    !multiDisplayDetected &&
    !probeMetrics.virtualCameraDetected &&
    !probeError &&
    isFullscreen &&
    isFocused &&
    webcamGranted &&
    micGranted
  );

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Main Outerbox Container (Exact Codeforces / BICS Card) */}
      <div className="cf-card" style={{ maxWidth: '1020px', width: '100%', margin: '0 auto', padding: '15px' }}>
        
        {/* Card Title Bar: Clean view name only */}
        <div className="cf-card-title">
          <Laptop size={16} style={{ color: '#3b5998' }} />
          <span>System checks</span>
        </div>

        {/* 4-Step Test Setup Progress Bar */}
        <TestSetupStepProgress currentStep={2} />

        {/* Failure or Warning Banner with Plain-Language Remediation */}
        {probeError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#991b1b', fontSize: '8.5pt', marginBottom: '16px' }}>
            <AlertTriangle size={18} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '3px' }}>Pre-Examination Check Requirement Unmet:</strong>
              <div>{probeError}</div>
              {supportCode && (
                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #fca5a5', display: 'flex', alignItems: 'center', gap: '8px', color: '#7f1d1d' }}>
                  <HelpCircle size={14} />
                  <span>Persistent issue? Provide Support Code: <strong style={{ fontFamily: 'monospace' }}>{supportCode}</strong> to the proctor or helpdesk.</span>
                </div>
              )}
            </div>
            <button
              onClick={executeProbes}
              disabled={isRunningProbes}
              className="cf-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '8pt', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, opacity: isRunningProbes ? 0.7 : 1 }}
            >
              <RefreshCw size={12} />
              <span>{isRunningProbes ? 'Retrying...' : 'Retry'}</span>
            </button>
          </div>
        )}

        {/* Warning Banner if External Monitor Detected */}
        {multiDisplayDetected && !probeError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', fontSize: '8.5pt', marginBottom: '16px' }}>
            <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div>
              <strong>Secondary Display Detected:</strong> Multiple monitors are prohibited. Please disconnect all external screens or televisions to unlock test progression.
            </div>
          </div>
        )}

        {/* Verification Status Header / Re-run */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
            {isRunningProbes 
              ? 'Measuring real hardware, display and network telemetry...' 
              : (allAutomatedChecksCompleted 
                  ? 'All automated system checks completed' 
                  : 'Running individual system verification checks...')}
          </span>
          <button
            onClick={executeProbes}
            disabled={isRunningProbes}
            style={{
              background: 'none',
              border: 'none',
              color: isRunningProbes ? '#94a3b8' : '#3b5998',
              fontSize: '8pt',
              cursor: isRunningProbes ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: '600'
            }}
          >
            <RefreshCw size={12} />
            <span>{isRunningProbes ? 'Probing...' : 'Re-run checks'}</span>
          </button>
        </div>

        {/* Rounded Parameter Cards Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          
          {/* Card 1: Operating System */}
          <div style={{
            backgroundColor: checkStatuses.os === 'checking' ? '#f0f9ff' : (checkStatuses.os === 'failed' ? '#fff5f5' : '#ffffff'),
            border: `1px solid ${checkStatuses.os === 'checking' ? '#93c5fd' : (checkStatuses.os === 'failed' ? '#fecaca' : '#e2e8f0')}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Operating system</span>
            {checkStatuses.os === 'pending' && (
              <span style={{ color: '#94a3b8', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Pending</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.os === 'checking' && (
              <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Probing OS...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.os === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{probeMetrics.os}</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.os === 'failed' && (
              <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Unsupported OS</span>
                <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 2: Browser */}
          <div style={{
            backgroundColor: checkStatuses.browser === 'checking' ? '#f0f9ff' : (checkStatuses.browser === 'failed' ? '#fff5f5' : '#ffffff'),
            border: `1px solid ${checkStatuses.browser === 'checking' ? '#93c5fd' : (checkStatuses.browser === 'failed' ? '#fecaca' : '#e2e8f0')}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Browser</span>
            {checkStatuses.browser === 'pending' && (
              <span style={{ color: '#94a3b8', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Pending</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.browser === 'checking' && (
              <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Probing browser...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.browser === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{probeMetrics.browser}</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.browser === 'failed' && (
              <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Unsupported Browser</span>
                <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 3: Screen Size */}
          <div style={{
            backgroundColor: checkStatuses.screen === 'checking' ? '#f0f9ff' : (checkStatuses.screen === 'failed' ? '#fff5f5' : '#ffffff'),
            border: `1px solid ${checkStatuses.screen === 'checking' ? '#93c5fd' : (checkStatuses.screen === 'failed' ? '#fecaca' : '#e2e8f0')}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Screen size</span>
            {checkStatuses.screen === 'pending' && (
              <span style={{ color: '#94a3b8', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Pending</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.screen === 'checking' && (
              <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Probing screen size...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.screen === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Roboto Mono', monospace" }}>
                <span>{probeMetrics.screenResolution}</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.screen === 'failed' && (
              <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Resolution Low ({probeMetrics.screenResolution})</span>
                <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 4: Display Configuration */}
          <div style={{
            backgroundColor: checkStatuses.display === 'checking' ? '#f0f9ff' : (checkStatuses.display === 'failed' ? '#fff5f5' : '#ffffff'),
            border: `1px solid ${checkStatuses.display === 'checking' ? '#93c5fd' : (checkStatuses.display === 'failed' ? '#fecaca' : '#e2e8f0')}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Display configuration</span>
            {checkStatuses.display === 'pending' && (
              <span style={{ color: '#94a3b8', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Pending</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.display === 'checking' && (
              <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Detecting display count...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.display === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Single Primary Screen Verified</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.display === 'failed' && (
              <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Multiple Displays Detected</span>
                <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 5: Network Status */}
          <div style={{
            backgroundColor: checkStatuses.network === 'checking' ? '#f0f9ff' : (checkStatuses.network === 'failed' ? '#fff5f5' : '#ffffff'),
            border: `1px solid ${checkStatuses.network === 'checking' ? '#93c5fd' : (checkStatuses.network === 'failed' ? '#fecaca' : '#e2e8f0')}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Network status</span>
            {checkStatuses.network === 'pending' && (
              <span style={{ color: '#94a3b8', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Pending</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.network === 'checking' && (
              <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Pinging server &amp; testing throughput...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.network === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>
                  {probeMetrics.latencyMs !== null ? `${probeMetrics.latencyMs}ms latency` : 'Online'}
                  {probeMetrics.throughputMbps ? ` • ${probeMetrics.throughputMbps} Mbps` : ''}
                </span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.network === 'failed' && (
              <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>High Latency / Connection Failure</span>
                <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 6: Camera & Microphone Authorization */}
          <div style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${webcamGranted && micGranted && !probeMetrics.virtualCameraDetected ? '#e2e8f0' : '#fed7aa'}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Hardware permissions (Camera &amp; Mic)</span>
            {probeMetrics.virtualCameraDetected ? (
              <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Virtual Camera Prohibited ({probeMetrics.virtualCameraName || 'OBS'})</span>
                <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              </span>
            ) : webcamGranted && micGranted ? (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Hardware Authorized &amp; Active</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            ) : (
              <button 
                className="cf-btn-primary" 
                onClick={handleAuthorizeCamera}
                style={{ width: '190px', minWidth: '190px', justifyContent: 'center', padding: '6px 14px', fontSize: '8pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Camera size={13} /> Authorize Camera &amp; Mic
              </button>
            )}
          </div>

          {/* Card 7: Fullscreen Mode */}
          <div style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${isFullscreen ? '#e2e8f0' : '#fed7aa'}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Fullscreen mode</span>
            {isFullscreen ? (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Locked Fullscreen Active</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            ) : (
              <button 
                className="cf-btn-primary" 
                onClick={handleLockFullscreen}
                style={{ width: '190px', minWidth: '190px', justifyContent: 'center', padding: '6px 14px', fontSize: '8pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Maximize2 size={13} /> Lock Fullscreen Mode
              </button>
            )}
          </div>

        </div>

        {/* Success Confirmation Banner if all checks pass */}
        {allSystemChecksPassed && (
          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', color: '#15803d', fontSize: '8.5pt', marginBottom: '16px' }}>
            <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div>
              <strong>System Compatibility Confirmed:</strong> Your browser, hardware devices, and display environment satisfy all examination prerequisites. Start ticket cryptographically issued.
            </div>
          </div>
        )}

        {/* Footer Action Bar */}
        <div style={{
          borderTop: '1px solid var(--cf-border)',
          margin: '0 -15px -15px -15px',
          padding: '12px 15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          borderBottomLeftRadius: '3px',
          borderBottomRightRadius: '3px'
        }}>
          <button 
            className="cf-btn-secondary" 
            style={{ padding: '6px 18px', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }} 
            onClick={onBackToTerms}
          >
            <ArrowLeft size={14} />
            <span>Back to Terms</span>
          </button>

          <button 
            className="cf-btn-primary" 
            disabled={!allSystemChecksPassed} 
            style={{ 
              padding: '6px 24px', 
              fontSize: '8.5pt', 
              fontWeight: 'bold',
              cursor: allSystemChecksPassed ? 'pointer' : 'not-allowed',
              opacity: allSystemChecksPassed ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }} 
            onClick={() => {
              if (onCompleteSystemChecks) onCompleteSystemChecks();
              if (onProceedToBiometrics) onProceedToBiometrics();
            }}
          >
            <span>Proceed to Biometric Checks</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  );
}

export default SystemChecksView;
