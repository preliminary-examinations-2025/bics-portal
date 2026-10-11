import React from 'react';
import { getReturnUrl } from '../config/constants';

export function GuidelinesSetupView({
  test,
  consentChecked,
  setConsentChecked,
  setupReady,
  webcamGranted,
  webcamStream,
  calibVideoRef,
  micGranted,
  micStream,
  isFocused,
  isFullscreen,
  handleAuthorizeCamera,
  handleStartExam
}) {
  return (
    <div style={{ padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="cf-card" style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '0', overflow: 'hidden' }}>
        
        {/* Card Header Bar */}
        <div className="cf-card-title" style={{ fontSize: '10.5pt', margin: 0, borderBottom: '1px solid var(--cf-border)', padding: '10px 15px' }}>
          Proctoring Verification &amp; Setup: {test?.title}
        </div>
        
        {/* Important Notice */}
        <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid #3b5998', padding: '12px 15px', color: '#1e3a8a', fontSize: '9.5pt', margin: '20px', borderRadius: '4px', lineHeight: '1.5' }}>
          <strong>Important Notice:</strong> This examination session is strictly proctored. You must authorize your webcam stream, enable fullscreen lock, and satisfy all security check status parameters below.
        </div>

        {/* Guidelines Body side-by-side splits */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '25px', padding: '0 20px 20px 20px' }}>
          
          {/* Left guidelines column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', margin: 0 }}>Examination Guidelines:</h4>
            <ul style={{ listStyleType: 'disc', paddingLeft: '20px', fontSize: '9pt', color: '#333', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>The time limit for this exam is <strong>{test?.duration} minutes</strong>.</li>
              <li>Exiting <strong>Fullscreen Mode</strong> will trigger a warning. Exiting more than 3 times will result in <strong>automatic submission</strong>.</li>
              <li>Changing browser tabs, closing the window, or losing window focus is tracked and classified as a malpractice violation.</li>
              <li>Ensure your web camera is active, unblocked, and captures your face clearly at all times.</li>
              <li>You must click <strong>Save &amp; Next</strong> to record each answer. Draft options or code changes are not submitted unless explicitly saved.</li>
              <li>All actions are logged in real-time. Do not open developer tools or attempt to copy-paste test questions.</li>
            </ul>

            <div style={{ marginTop: '10px' }}>
              <h5 style={{ fontSize: '9pt', color: '#002147', fontWeight: 'bold', marginBottom: '6px' }}>Initial Instructions:</h5>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', fontSize: '9pt', color: '#555', minHeight: '50px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                {test?.instructions || 'No instructions provided.'}
              </div>
            </div>

            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', marginTop: '15px', fontSize: '9pt', fontWeight: 'bold', color: '#333' }}>
              <input 
                type="checkbox" 
                checked={consentChecked} 
                disabled={!setupReady} 
                onChange={e => setConsentChecked(e.target.checked)} 
              />
              <span style={{ color: setupReady ? '#333' : '#94a3b8' }}>
                I accept and agree to the examination terms, proctoring consent, and code of conduct parameters.
              </span>
            </label>
          </div>

          {/* Right webcam stream calibration column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', margin: 0 }}>Camera Calibration:</h4>
            
            <div style={{ backgroundColor: '#000', borderRadius: '4px', overflow: 'hidden', aspectRatio: '4/3', width: '100%', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid var(--cf-border)' }}>
              {webcamStream && webcamGranted ? (
                <video ref={calibVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              ) : (
                <div style={{ color: '#fff', fontSize: '9.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
                  Stream Not Calibrated
                </div>
              )}
            </div>

            {/* Proctoring Verification Parameters Checklist */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h5 style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', margin: '0 0 4px 0' }}>System Check Indicators:</h5>
              
              {/* Parameter 1: Focus */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                <span style={{ color: '#555' }}>1. Focus (No other tabs/apps):</span>
                {isFocused ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>Verified</span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Focus Lost!</span>
                )}
              </div>

              {/* Parameter 2: Camera */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                <span style={{ color: '#555' }}>2. Camera Proctored:</span>
                {webcamGranted ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>Active</span>
                ) : (
                  <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>Awaiting Access</span>
                )}
              </div>

              {/* Parameter 3: Microphone */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                <span style={{ color: '#555' }}>3. Microphone Proctored:</span>
                {micGranted ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>Active</span>
                ) : (
                  <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>Awaiting Access</span>
                )}
              </div>

              {/* Parameter 4: Fullscreen */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                <span style={{ color: '#555' }}>4. Fullscreen Mode:</span>
                {isFullscreen ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>Locked</span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Not Fullscreen</span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button 
                className="cf-btn-primary" 
                style={{ padding: '8px 10px', fontSize: '8.5pt', fontWeight: 'bold', border: '1px solid #ccc' }} 
                onClick={handleAuthorizeCamera}
              >
                Authorize Cam &amp; Mic
              </button>
              <button 
                className="cf-btn-primary" 
                style={{ padding: '8px 10px', fontSize: '8.5pt', fontWeight: 'bold', border: '1px solid #ccc' }} 
                onClick={async () => {
                  const elem = document.documentElement;
                  if (elem.requestFullscreen) {
                    await elem.requestFullscreen().catch(err => console.warn(err));
                  }
                }}
              >
                Lock Fullscreen Mode
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions row inside the card */}
        <div style={{ borderTop: '1px solid var(--cf-border)', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc' }}>
          <button className="cf-btn-secondary" style={{ padding: '6px 20px', fontSize: '9pt' }} onClick={() => {
            if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
            if (micStream) micStream.getTracks().forEach(t => t.stop());
            window.location.href = getReturnUrl('/coursework/online-tests');
          }}>
            Cancel
          </button>
          <button 
            className="cf-btn-primary" 
            disabled={!consentChecked || !setupReady} 
            style={{ padding: '6px 20px', fontSize: '9pt', fontWeight: 'bold' }} 
            onClick={handleStartExam}
          >
            Start Test
          </button>
        </div>
      </div>
    </div>
  );
}

export default GuidelinesSetupView;
