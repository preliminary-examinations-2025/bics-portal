import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { CustomAlertModal } from '../common/CustomAlertModal';

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
  devModeActive,
  suppressCustomModal = false
}) => {
  React.useEffect(() => {
    if (
      examVideoRef?.current && 
      webcamStream && 
      typeof MediaStream !== 'undefined' && 
      webcamStream instanceof MediaStream
    ) {
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

      {/* Custom dialog modal system (rendered here only when root doesn't already mount it) */}
      {!suppressCustomModal && (
        <CustomAlertModal customModal={customModal} setCustomModal={setCustomModal} />
      )}
    </>
  );
};
