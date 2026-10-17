import React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

/**
 * ExamProctorOverlay: Handles hidden video element, proctoring warning modal (tab switches/fullscreen exits),
 * and general custom prompt/alert confirmation dialogs.
 */
export const ExamProctorOverlay = ({
  examVideoRef,
  webcamStream,
  showWarningModal,
  setShowWarningModal,
  proctoringWarnings,
  customModal,
  setCustomModal,
  devModeActive
}) => {
  React.useEffect(() => {
    if (examVideoRef?.current && webcamStream) {
      if (examVideoRef.current.srcObject !== webcamStream) {
        examVideoRef.current.srcObject = webcamStream;
      }
      examVideoRef.current.play().catch(() => {});
    }
  }, [examVideoRef, webcamStream]);

  return (
    <>
      {/* Offscreen video tracker - continuously active for BlazeFace ML and forensic evidence snapshots */}
      <div style={{ position: 'fixed', top: -9999, left: -9999, width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', zIndex: -100 }}>
        <video 
          ref={examVideoRef} 
          autoPlay 
          playsInline 
          muted 
          onLoadedMetadata={(e) => {
            e.target.play().catch(() => {});
          }}
          style={{ width: '640px', height: '480px' }} 
        />
      </div>

      {/* Warning proctor alert modal */}
      {showWarningModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 500000
        }}>
          <div className="cf-card" style={{ maxWidth: '450px', padding: '25px', textAlign: 'center', border: '2px solid #e11d48' }}>
            <div style={{ color: '#e11d48', display: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <ShieldAlert size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3 style={{ fontSize: '13pt', color: '#b91c1c', fontWeight: 'bold', marginBottom: '10px' }}>
              PROCTORING WARNING: MAJOR VIOLATION DETECTED
            </h3>
            <p style={{ fontSize: '9.5pt', color: '#333', marginBottom: '15px', lineHeight: 1.5 }}>
              The system logged a major proctoring violation (tab switch, fullscreen escape, or unauthorized developer tools / inspect element attempt). Candidates are strictly forbidden from leaving fullscreen, opening external tabs, or inspecting code during the test.
            </p>
            <div style={{ padding: '10px', backgroundColor: '#ffe4e6', color: '#be123c', border: '1px solid #fda4af', borderRadius: '4px', fontSize: '9.5pt', fontWeight: 'bold', marginBottom: '20px' }}>
              Total Warnings: {(proctoringWarnings?.fullscreenExits || 0) + (proctoringWarnings?.tabSwitches || 0) + (proctoringWarnings?.inspectAttempts || 0)} / 3. {devModeActive ? '⚡ (Dev Mode: Auto-submit bypassed for testing)' : 'Exceeding 3 will force automatic submission.'}
            </div>
            <button
              className="cf-btn-primary"
              style={{ width: '100%', color: '#ef4444', borderColor: '#ef4444' }}
              onClick={async () => {
                setShowWarningModal(false);
                const elem = document.documentElement;
                if (!document.fullscreenElement) {
                  if (elem.requestFullscreen) await elem.requestFullscreen().catch(err => console.warn(err));
                }
              }}
            >
              I Understand, Return to Test
            </button>
          </div>
        </div>
      )}

      {/* Custom dialog modal system */}
      {customModal?.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100000
        }}>
          <div className="cf-card" style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '90%',
            maxWidth: '450px',
            padding: '24px',
            margin: 0,
            border: '1px solid #e2e8f0',
            textAlign: 'left'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '12pt', color: '#002147', fontWeight: 'bold', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              {customModal.title}
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '9.5pt', color: '#475569', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
              {customModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {!customModal.isAlert && (
                <button
                  type="button"
                  onClick={() => setCustomModal(prev => ({ ...prev, isOpen: false }))}
                  style={{
                    minWidth: '80px',
                    padding: '6px 12px',
                    fontSize: '9pt',
                    background: '#ffffff',
                    border: '1px solid #ccc',
                    color: '#333',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {customModal.cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCustomModal(prev => ({ ...prev, isOpen: false }));
                  if (customModal.onConfirm) {
                    customModal.onConfirm();
                  }
                }}
                style={{
                  minWidth: '80px',
                  padding: '6px 12px',
                  fontSize: '9pt',
                  background: '#e11d48',
                  border: '1px solid #e11d48',
                  color: '#ffffff',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {customModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
