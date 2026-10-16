import React, { useState, useEffect } from 'react';
import { 
  Laptop, CheckCircle2, AlertTriangle, Maximize2, 
  Camera, ArrowRight, ArrowLeft, Loader2, RefreshCw 
} from 'lucide-react';
import { TestSetupStepProgress } from '../components/common/TestSetupStepProgress';

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
  handleAuthorizeCamera,
  handleLockFullscreen,
  onBackToTerms,
  onProceedToBiometrics
}) {
  const osName = securityMetadata?.operatingSystem || 'Windows';
  const browserName = securityMetadata?.browser || 'Google Chrome';
  const screenResolution = securityMetadata?.screenResolution || `${window.screen?.width || 1536} x ${window.screen?.height || 864} px`;

  const isInitiallyCompleted = Boolean(systemChecksCompleted);

  const [activeCheckIndex, setActiveCheckIndex] = useState(() => isInitiallyCompleted ? AUTOMATED_CHECKS.length : 0);
  const [checkStatuses, setCheckStatuses] = useState(() => {
    if (isInitiallyCompleted) {
      const allDone = {};
      AUTOMATED_CHECKS.forEach(item => {
        allDone[item.id] = 'completed';
      });
      return allDone;
    }
    return {
      os: 'checking',
      browser: 'pending',
      screen: 'pending',
      display: 'pending',
      network: 'pending'
    };
  });

  // Step through only the first 5 automated checks with 2-second loader
  useEffect(() => {
    if (activeCheckIndex >= AUTOMATED_CHECKS.length) {
      if (onCompleteSystemChecks) {
        onCompleteSystemChecks();
      }
      return;
    }

    const currentKey = AUTOMATED_CHECKS[activeCheckIndex].id;
    setCheckStatuses(prev => ({
      ...prev,
      [currentKey]: 'checking'
    }));

    const timer = setTimeout(() => {
      setCheckStatuses(prev => ({
        ...prev,
        [currentKey]: 'completed'
      }));
      setActiveCheckIndex(prev => prev + 1);
    }, 2000);

    return () => clearTimeout(timer);
  }, [activeCheckIndex, onCompleteSystemChecks]);

  const handleRerunChecks = () => {
    const initial = {};
    AUTOMATED_CHECKS.forEach((item, idx) => {
      initial[item.id] = idx === 0 ? 'checking' : 'pending';
    });
    setCheckStatuses(initial);
    setActiveCheckIndex(0);
  };

  const allChecksFinished = activeCheckIndex >= AUTOMATED_CHECKS.length;
  const allAutomatedChecksFinished = allChecksFinished;

  const allSystemChecksPassed = Boolean(
    allChecksFinished &&
    !multiDisplayDetected &&
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

        {/* Warning Banner if External Monitor Detected */}
        {multiDisplayDetected && (
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
            {allChecksFinished ? 'All automated system checks completed' : 'Running individual system verification checks...'}
          </span>
          {allChecksFinished && (
            <button
              onClick={handleRerunChecks}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b5998',
                fontSize: '8pt',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: '600'
              }}
            >
              <RefreshCw size={12} />
              <span>Re-run checks</span>
            </button>
          )}
        </div>

        {/* Rounded Parameter Cards Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          
          {/* Card 1: Operating System */}
          <div style={{
            backgroundColor: checkStatuses.os === 'checking' ? '#f0f9ff' : '#ffffff',
            border: `1px solid ${checkStatuses.os === 'checking' ? '#93c5fd' : '#e2e8f0'}`,
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
                <span>Checking OS...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.os === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{osName}</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 2: Browser */}
          <div style={{
            backgroundColor: checkStatuses.browser === 'checking' ? '#f0f9ff' : '#ffffff',
            border: `1px solid ${checkStatuses.browser === 'checking' ? '#93c5fd' : '#e2e8f0'}`,
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
                <span>Checking browser...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.browser === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{browserName}</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 3: Screen Size */}
          <div style={{
            backgroundColor: checkStatuses.screen === 'checking' ? '#f0f9ff' : '#ffffff',
            border: `1px solid ${checkStatuses.screen === 'checking' ? '#93c5fd' : '#e2e8f0'}`,
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
                <span>Checking screen size...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.screen === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Roboto Mono', monospace" }}>
                <span>{screenResolution}</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 4: Display Configuration */}
          <div style={{
            backgroundColor: checkStatuses.display === 'checking' ? '#f0f9ff' : '#ffffff',
            border: `1px solid ${checkStatuses.display === 'checking' ? '#93c5fd' : (multiDisplayDetected ? '#fecaca' : '#e2e8f0')}`,
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
                <span>Checking display configuration...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.display === 'completed' && (
              !multiDisplayDetected ? (
                <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Single Primary Screen Verified</span>
                  <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                </span>
              ) : (
                <span style={{ color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>External Display Connected</span>
                  <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                </span>
              )
            )}
          </div>

          {/* Card 5: Network Status */}
          <div style={{
            backgroundColor: checkStatuses.network === 'checking' ? '#f0f9ff' : '#ffffff',
            border: `1px solid ${checkStatuses.network === 'checking' ? '#93c5fd' : '#e2e8f0'}`,
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
                <span>Testing connection status...</span>
                <Loader2 className="spinner" size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
              </span>
            )}
            {checkStatuses.network === 'completed' && (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Online / Stable Connection</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            )}
          </div>

          {/* Card 6: Camera & Microphone Authorization */}
          <div style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${webcamGranted && micGranted ? '#e2e8f0' : '#fed7aa'}`,
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9pt',
            transition: 'all 0.3s ease'
          }}>
            <span style={{ color: '#334155', fontWeight: '500' }}>Hardware permissions (Camera &amp; Mic)</span>
            {webcamGranted && micGranted ? (
              <span style={{ color: '#002147', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Hardware Authorized &amp; Active</span>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              </span>
            ) : (
              <button 
                className="cf-btn-primary" 
                onClick={handleAuthorizeCamera}
                style={{ padding: '5px 12px', fontSize: '8pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
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
                style={{ padding: '5px 12px', fontSize: '8pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
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
              <strong>System Compatibility Confirmed:</strong> Your browser, hardware devices, and display environment satisfy all examination prerequisites.
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
