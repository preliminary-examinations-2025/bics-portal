import React from 'react';
import { ShieldAlert, Loader2, Check, X, Play } from 'lucide-react';
import { API_BASE } from '../config/constants';
import { CenteredFooter } from '../components/common/CenteredFooter';
import { 
  getOfflineSubmission, 
  deleteOfflineSubmission, 
  getOfflineSnapshots, 
  clearOfflineSnapshots, 
  getOfflineEvents, 
  clearOfflineEvents 
} from '../utils/offlineDb';

export function FinishedView({
  finishedStep,
  setFinishedStep,
  submission,
  hasPendingSubmit,
  setHasPendingSubmit,
  isOnline,
  syncStatus,
  setSyncStatus,
  triggerCustomAlert
}) {
  const subId = submission?._id || submission?.id;
  const pendingSubmitKey = subId ? `bics_pending_submit_${subId}` : '';
  const isPendingSubmit = hasPendingSubmit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <header className="app-header">
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img 
            src={`${import.meta.env.BASE_URL}bics_logo.png`} 
            onError={(e) => { e.currentTarget.src = '/bics_logo.png'; }} 
            alt="BICS Logo" 
            style={{ height: '34px', width: '34px', objectFit: 'contain' }} 
          />
          <span className="pixel-logo">BICS Terminal</span>
        </div>
        <div className="header-right">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png`} 
            onError={(e) => { e.currentTarget.src = '/logo.png'; }} 
            alt="Portal Logo" 
            className="pe-logo" 
            style={{ height: '34px' }} 
          />
        </div>
      </header>

      <div style={{ display: 'flex', flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div className="cf-card" style={{ maxWidth: '500px', width: '100%', padding: '40px', border: '1px solid var(--cf-border)', textAlign: 'center' }}>
          
          {finishedStep === 1 ? (
            isPendingSubmit ? (
              <>
                <style>{`
                  @keyframes cf-pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(0.96); }
                  }
                  .cf-pulse-icon {
                    animation: cf-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                  }
                `}</style>
                <div className="cf-pulse-icon" style={{ color: '#f59e0b', display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                  <ShieldAlert size={64} style={{ color: '#f59e0b' }} />
                </div>

                <h2 style={{ fontSize: '16pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
                  Submission Cached Locally
                </h2>

                {/* Connection Status Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: isOnline ? '#22c55e' : '#ef4444',
                    boxShadow: isOnline ? '0 0 8px #22c55e' : '0 0 8px #ef4444'
                  }} />
                  <span style={{ fontSize: '9.5pt', fontWeight: 'bold', color: isOnline ? '#166534' : '#991b1b' }}>
                    Browser Status: {isOnline ? 'Online (Ready to Sync)' : 'Offline (No Connection)'}
                  </span>
                </div>

                <div style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb', padding: '12px 15px', color: '#78350f', fontSize: '9pt', borderRadius: '4px', marginBottom: '20px', textAlign: 'left', lineHeight: '1.5' }}>
                  <strong>Connection Lost:</strong> We were unable to reach the BICS server to record your submission. Your answers and proctoring telemetry are <strong>fully secured locally</strong> in your browser.
                </div>
                
                {/* Critical warning message against closures/refreshes */}
                <p style={{ fontSize: '10pt', color: '#ef4444', lineHeight: 1.6, marginBottom: '20px', fontWeight: 'bold', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                  Do not close this tab or refresh the browser. Refreshing or closing this tab while sync is in progress will interrupt the session upload.
                </p>

                {/* Sync Progress Indicator */}
                {syncStatus && (
                  <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '20px', textAlign: 'left' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '9.5pt', fontWeight: 'bold', color: '#334155' }}>
                      Synchronization Progress:
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '8.5pt' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '15px', height: '15px' }}>
                          { syncStatus === 'initiating' ? (
                            <Loader2 className="spinner" size={13} style={{ color: '#2563eb' }} />
                          ) : (
                            <Check size={13} style={{ color: '#10b981', strokeWidth: 3 }} />
                          )}
                        </span>
                        <span style={{ color: syncStatus === 'initiating' ? '#1e40af' : '#166534', fontWeight: syncStatus === 'initiating' ? 'bold' : 'normal' }}>
                          1. Connecting to BICS Backend Servers...
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '15px', height: '15px' }}>
                          { syncStatus === 'uploading' ? (
                            <Loader2 className="spinner" size={13} style={{ color: '#2563eb' }} />
                          ) : (syncStatus === 'initiating' ? (
                            <span style={{ fontSize: '7pt', color: '#94a3b8' }}>○</span>
                          ) : (
                            <Check size={13} style={{ color: '#10b981', strokeWidth: 3 }} />
                          ))}
                        </span>
                        <span style={{ 
                          color: syncStatus === 'uploading' ? '#1e40af' : ((syncStatus === 'processing' || syncStatus === 'completed') ? '#166534' : '#64748b'), 
                          fontWeight: syncStatus === 'uploading' ? 'bold' : 'normal' 
                        }}>
                          2. Transferring secure offline answers payload...
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '15px', height: '15px' }}>
                          { syncStatus === 'processing' ? (
                            <Loader2 className="spinner" size={13} style={{ color: '#2563eb' }} />
                          ) : ((syncStatus === 'initiating' || syncStatus === 'uploading') ? (
                            <span style={{ fontSize: '7pt', color: '#94a3b8' }}>○</span>
                          ) : (
                            <Check size={13} style={{ color: '#10b981', strokeWidth: 3 }} />
                          ))}
                        </span>
                        <span style={{ 
                          color: syncStatus === 'processing' ? '#1e40af' : (syncStatus === 'completed' ? '#166534' : '#64748b'), 
                          fontWeight: syncStatus === 'processing' ? 'bold' : 'normal' 
                        }}>
                          3. Executing unit test cases & proctoring ledgers...
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '15px', height: '15px' }}>
                          { syncStatus === 'completed' ? (
                            <Check size={13} style={{ color: '#10b981', strokeWidth: 3 }} />
                          ) : (syncStatus === 'failed' ? (
                            <X size={13} style={{ color: '#ef4444', strokeWidth: 3 }} />
                          ) : (
                            <span style={{ fontSize: '7pt', color: '#94a3b8' }}>○</span>
                          ))}
                        </span>
                        <span style={{ 
                          color: syncStatus === 'completed' ? '#166534' : (syncStatus === 'failed' ? '#991b1b' : '#64748b'), 
                          fontWeight: (syncStatus === 'completed' || syncStatus === 'failed') ? 'bold' : 'normal' 
                        }}>
                          {syncStatus === 'completed' ? '4. Synced successfully! Redirecting...' : (syncStatus === 'failed' ? '4. Sync Failed. Please retry.' : '4. Finalizing database entry...')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <button
                  type="button"
                  className="cf-btn-primary"
                  disabled={syncStatus === 'initiating' || syncStatus === 'uploading' || syncStatus === 'processing'}
                  onClick={async () => {
                    let payload = null;
                    try {
                      const idbPayload = await getOfflineSubmission(subId);
                      if (idbPayload) payload = idbPayload;
                    } catch {}

                    if (!payload) {
                      const cachedPayload = localStorage.getItem(pendingSubmitKey);
                      if (cachedPayload) {
                        try { payload = JSON.parse(cachedPayload); } catch {}
                      }
                    }

                    if (!payload) {
                      triggerCustomAlert("No Cached Data", "No pending offline submission was found in local storage.");
                      return;
                    }

                    setSyncStatus('initiating');
                    try {
                      // Ensure hasEirfFlag is explicitly true for offline recovery pipeline (Item 7)
                      const finalPayload = {
                        ...payload,
                        hasEirfFlag: true
                      };

                      setSyncStatus('uploading');
                      const res = await fetch(`${API_BASE}/tests/submit`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(finalPayload)
                      });
                      setSyncStatus('processing');
                      const data = await res.json();
                      if (data.success) {
                        localStorage.removeItem(pendingSubmitKey);
                        await deleteOfflineSubmission(subId).catch(() => {});

                        // Drain queued offline proctoring events
                        getOfflineEvents(subId).then(events => {
                          if (events && events.length > 0) {
                            events.forEach(ev => {
                              fetch(`${API_BASE}/tests/proctoring/event/${subId}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(ev)
                              }).catch(() => {});
                            });
                            clearOfflineEvents(subId);
                          }
                        });

                        // Drain queued offline proctoring snapshots
                        getOfflineSnapshots(subId).then(snapshots => {
                          if (snapshots && snapshots.length > 0) {
                            snapshots.forEach(snap => {
                              fetch(`${API_BASE}/tests/proctoring/snapshot/${subId}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(snap)
                              }).catch(() => {});
                            });
                            clearOfflineSnapshots(subId);
                          }
                        });

                        setSyncStatus('completed');
                        setHasPendingSubmit(false);
                        setFinishedStep(1);
                        triggerCustomAlert("Sync Successful", "Your exam has been successfully synchronized and submitted to the server.");
                      } else {
                        setSyncStatus('failed');
                        triggerCustomAlert("Sync Failed", data.error || "Server rejected submission. Please try again.");
                      }
                    } catch (e) {
                      setSyncStatus('failed');
                      triggerCustomAlert("Sync Failed", "Unable to establish secure tunnel connection to server. Please verify your internet.");
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    fontWeight: 'bold',
                    border: 'none',
                    background: (syncStatus === 'initiating' || syncStatus === 'uploading' || syncStatus === 'processing') ? '#cbd5e1' : '#3b5998',
                    color: (syncStatus === 'initiating' || syncStatus === 'uploading' || syncStatus === 'processing') ? '#64748b' : '#fff',
                    borderRadius: '4px',
                    cursor: (syncStatus === 'initiating' || syncStatus === 'uploading' || syncStatus === 'processing') ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Play size={14} />
                  <span>{ (syncStatus === 'initiating' || syncStatus === 'uploading' || syncStatus === 'processing') ? 'Syncing...' : 'Force Sync Submission' }</span>
                </button>
              </>
            ) : (
              <>
                {/* CSS Animated Checkmark */}
                <div className="checkmark-wrapper">
                  <svg className="animated-checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                    <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                  </svg>
                </div>

                <h2 style={{ fontSize: '16pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
                  The test is successfully submitted.
                </h2>
                <p style={{ fontSize: '10pt', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>
                  Your BICS Course Examination paper has been successfully submitted and stored in the database.
                </p>
              </>
            )
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <Loader2 className="spinner" size={48} style={{ color: '#3b5998' }} />
              </div>
              <h2 style={{ fontSize: '16pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
                Redirection to candidate dashboard
              </h2>
              <p style={{ fontSize: '10pt', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>
                Exiting proctored exam workspace session...
              </p>
            </>
          )}
        </div>
      </div>
      <CenteredFooter />
    </div>
  );
}

export default FinishedView;
