import React from 'react';
import { ShieldAlert, Clock, CheckSquare, Flag, HelpCircle, Grid, X } from 'lucide-react';
import { formatTimer } from '../../config/constants';

/**
 * ExamHeader: Renders the top floating bar with test info, candidate badge, timer, and submit CTA.
 * Also renders offline connectivity alerts and webcam proctoring notifications.
 */
export const ExamHeader = ({
  test,
  candidate,
  examTimeLeft,
  isOnline,
  submittingExam,
  handleManualSubmitExam,
  webcamProctorWarning,
  devModeActive
}) => {
  return (
    <>
      {/* Offline Shield Banner Alert */}
      {!isOnline && (
        <div style={{
          backgroundColor: '#ef4444',
          color: '#ffffff',
          padding: '12px 20px',
          fontSize: '9.5pt',
          fontWeight: 'bold',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          margin: '0 0 -10px 0',
          zIndex: 100
        }}>
          <ShieldAlert size={18} style={{ color: '#ffffff', flexShrink: 0 }} />
          <span>Connection Offline: Proctoring telemetry paused. You can continue writing code, and your work will be saved locally. Compilation (Run Code) and Test Submission are locked until connection is restored.</span>
        </div>
      )}

      {/* Floating Header Card */}
      <div className="cf-card" style={{ margin: 0, padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', borderLeft: '5px solid #3b5998', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ fontSize: '12.5pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>{test?.title}</h3>
            {devModeActive && (
              <span style={{ fontSize: '7.5pt', fontWeight: 'bold', backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px' }}>
                DEV MODE
              </span>
            )}
          </div>
          <span style={{ fontSize: '8.5pt', color: '#666' }}>
            Candidate: <strong>{candidate?.name} ({candidate?.studentId})</strong>
          </span>
        </div>

        {/* Timer Display Widget */}
        <div style={{
          padding: '8px 15px',
          borderRadius: '4px',
          backgroundColor: examTimeLeft < 300 ? '#ffe4e6' : '#e0f2fe',
          color: examTimeLeft < 300 ? '#be123c' : '#0369a1',
          border: examTimeLeft < 300 ? '1px solid #fda4af' : '1px solid #7dd3fc',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          fontSize: '11pt',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          justifySelf: 'center'
        }}>
          <Clock size={16} style={{ color: '#ef4444' }} />
          <span>{formatTimer(examTimeLeft)} remaining</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
          <button
            className="cf-btn-primary"
            disabled={submittingExam || examTimeLeft > 300}
            title={examTimeLeft > 300 ? `Manual submission will unlock in the final 5 minutes (${formatTimer(examTimeLeft - 300)} left)` : "Finalize and submit your test"}
            style={{
              borderColor: (submittingExam || examTimeLeft > 300) ? '#cbd5e1' : '#ef4444',
              color: (submittingExam || examTimeLeft > 300) ? '#94a3b8' : '#ef4444',
              background: (submittingExam || examTimeLeft > 300) ? '#f8fafc' : 'transparent',
              fontWeight: 'bold',
              padding: '6px 14px',
              fontSize: '9pt',
              cursor: (submittingExam || examTimeLeft > 300) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={handleManualSubmitExam}
          >
            {examTimeLeft > 300
              ? `Submit (Available in ${Math.ceil((examTimeLeft - 300) / 60)}m)`
              : (submittingExam ? "Submitting..." : "Finalize & Submit Test")}
          </button>
          {examTimeLeft > 300 && (
            <span style={{ fontSize: '7.5pt', color: '#64748b' }}>
              Submission unlocks at 05:00
            </span>
          )}
        </div>
      </div>
    </>
  );
};
