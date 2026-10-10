import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Video, Loader2, VolumeX, Volume2, ClipboardList } from 'lucide-react';
import { API_BASE } from '../config';

const PRESET_COURSES = [
  { code: 'R526CS01T', name: 'Introduction to Computer Science (Theory)' },
  { code: 'R526CS02T', name: 'Programming Fundamentals with C++ (Theory)' },
  { code: 'R526CS03T', name: 'Basics of Web Development (Theory)' },
  { code: 'R526CS04T', name: 'Mathematical Thinking (Theory)' },
  { code: 'R526CS02L', name: 'Programming Fundamentals with C++ Lab' },
  { code: 'R526CS03L', name: 'Basics of Web Development Lab' },
  { code: 'CUSTOM', name: 'Other / Custom Course Code...' }
];

export default function StudentProctorDashboard({ sub, onClose, fetchLiveSubmissions }) {
  const [activeTab, setActiveTab] = useState('proctoring'); // 'proctoring' | 'eirf'
  const [logs, setLogs] = useState(sub.proctoringLog?.events || []);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [status, setStatus] = useState(sub.status || 'started');
  const [remoteStream, setRemoteStream] = useState(null);
  const [eirfData, setEirfData] = useState(null);
  const [eirfLoading, setEirfLoading] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [pendingActionType, setPendingActionType] = useState('approve');
  const [selectedCourseCode, setSelectedCourseCode] = useState('R526CS01T');
  const [selectedCourseName, setSelectedCourseName] = useState('Introduction to Computer Science (Theory)');
  const [customCourseCode, setCustomCourseCode] = useState('');
  const [customCourseName, setCustomCourseName] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const pcRef = useRef(null);
  const subId = sub.id || sub._id;

  const fetchEirfDetails = async () => {
    setEirfLoading(true);
    try {
      const res = await fetch(`${API_BASE}/test/eirf/details/${subId}`);
      if (res.ok) {
        const data = await res.json();
        setEirfData(data);
      }
    } catch (e) {
      console.error("Failed to load EIRF details for admin dashboard:", e);
    } finally {
      setEirfLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'eirf' || sub.hasEirfFlag || sub.eirfStatus) {
      fetchEirfDetails();
    }
  }, [subId, activeTab]);

  const handleAdminEirfAction = async (actionType, courseCodeVal, courseNameVal) => {
    if (!eirfData?.existingReport?.reportId) return;
    const targetStatus = (actionType === 'approve' || actionType === 'approved') ? 'approved' : 'rejected';
    
    const finalCourseCode = courseCodeVal === 'CUSTOM' ? customCourseCode : (courseCodeVal || selectedCourseCode);
    const finalCourseName = courseCodeVal === 'CUSTOM' ? customCourseName : (courseNameVal || selectedCourseName);

    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/admin/eirf/action/${eirfData.existingReport.reportId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          action: targetStatus,
          courseCode: finalCourseCode || 'R526CS01T',
          courseName: finalCourseName || 'Introduction to Computer Science (Theory)',
          adminRemarks: adminRemarks || `Marked as ${targetStatus.toUpperCase()} by administration.`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`EIRF Report ${targetStatus === 'approved' ? 'Approved' : 'Rejected'} successfully! Official PDF generated & verdict email dispatched.`);
        setIsCourseModalOpen(false);
        fetchEirfDetails();
        if (fetchLiveSubmissions) fetchLiveSubmissions();
      } else {
        alert(data.error || "Failed to update EIRF report status.");
      }
    } catch (err) {
      console.error("Admin EIRF action error:", err);
      alert("Network error while updating EIRF status.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const setVideoRef = useCallback((node) => {
    if (node && remoteStream) {
      node.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/tests/submissions/${sub.testId}`);
        if (res.ok && active) {
          const subs = await res.json();
          const match = subs.find(s => (s.id || s._id) === subId);
          if (match) {
            if (match.proctoringLog) {
              setLogs(match.proctoringLog.events || []);
            }
            if (match.status) {
              if (match.status !== status) {
                setStatus(match.status);
                fetchLiveSubmissions();
              }
              if (match.status !== 'started') {
                if (pcRef.current) {
                  if (pcRef.current.pollInterval) {
                    clearInterval(pcRef.current.pollInterval);
                  }
                  pcRef.current.close();
                  pcRef.current = null;
                }
                setConnectionStatus('Offline (Session Completed)');
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [subId, sub.testId]);

  const startWebRTC = async () => {
    try {
      setConnectionStatus('Connecting...');
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        setConnectionStatus('Connected');
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected') {
          setConnectionStatus('Disconnected');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(`${API_BASE}/tests/proctoring/signal/${subId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: 'admin', type: 'ice', data: JSON.stringify(event.candidate) })
          }).catch(err => console.error(err));
        }
      };

      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      await fetch(`${API_BASE}/tests/proctoring/signal/${subId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'admin', type: 'sdp', data: JSON.stringify(offer) })
      });

      let processedEventIds = new Set();
      let pendingIceCandidates = [];
      const pollAnswer = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/tests/proctoring/signal/${subId}?sender=candidate`);
          if (res.ok) {
            const data = await res.json();
            const signals = data.signals || [];
            for (let sig of signals) {
              const sigId = sig.id || sig._id || sig.timestamp || sig.data;
              if (processedEventIds.has(sigId)) continue;
              processedEventIds.add(sigId);

              if (sig.type === 'sdp') {
                if (pc.signalingState === 'stable' || pc.remoteDescription) {
                  continue;
                }
                const answer = JSON.parse(sig.data);
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                for (let cand of pendingIceCandidates) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn("WebRTC: Error adding queued candidate:", e);
                  }
                }
                pendingIceCandidates = [];
              } else if (sig.type === 'ice') {
                const candidate = JSON.parse(sig.data);
                if (pc.remoteDescription && pc.remoteDescription.type) {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                  pendingIceCandidates.push(candidate);
                }
              }
            }
          }
        } catch (e) {
          console.error("Polling WebRTC answer error:", e);
        }
      }, 2000);

      pc.pollInterval = pollAnswer;

    } catch (err) {
      console.error("WebRTC Error:", err);
      setConnectionStatus('Failed');
    }
  };

  useEffect(() => {
    if (sub.status === 'started') {
      startWebRTC();
    } else {
      setConnectionStatus('Offline (Session Completed)');
    }
    return () => {
      if (pcRef.current) {
        if (pcRef.current.pollInterval) {
          clearInterval(pcRef.current.pollInterval);
        }
        pcRef.current.close();
      }
    };
  }, [subId]);

  const handleTerminateExam = async () => {
    if (!window.confirm(`Are you absolutely sure you want to terminate ${sub.candidateName || 'this student'}'s exam attempt?`)) return;
    try {
      await fetch(`${API_BASE}/tests/proctoring/event/${subId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DISQUALIFIED',
          details: 'Exam terminated remotely by Administrator'
        })
      });
      await fetch(`${API_BASE}/admin/tests/evaluate/${subId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codingScore: 0,
          feedback: 'Candidate disqualified due to proctoring violations.',
          answers: sub.answers
        })
      });
      onClose();
      fetchLiveSubmissions();
    } catch (e) {
      console.error(e);
    }
  };

  const isCompleted = status === 'submitted' || status === 'auto-submitted';

  return (
    <div className="cf-card" style={{ padding: '20px', margin: 0, border: '1px solid var(--cf-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '12pt', fontWeight: 'bold', color: '#002147', margin: 0 }}>{sub.candidateName}</h3>
          <span style={{ fontSize: '8.5pt', color: '#64748b' }}>Candidate ID: {sub.studentId} • {sub.testTitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('proctoring')}
            className="cf-btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '8.5pt',
              margin: 0,
              backgroundColor: activeTab === 'proctoring' ? '#e0f2fe' : '#ffffff',
              borderColor: activeTab === 'proctoring' ? '#0284c7' : '#cbd5e1',
              color: activeTab === 'proctoring' ? '#0284c7' : '#475569',
              fontWeight: 'bold'
            }}
          >
            Live Proctoring Stream
          </button>
          <button
            onClick={() => setActiveTab('eirf')}
            className="cf-btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '8.5pt',
              margin: 0,
              backgroundColor: activeTab === 'eirf' ? '#fffbeb' : '#ffffff',
              borderColor: activeTab === 'eirf' ? '#fde68a' : '#cbd5e1',
              color: activeTab === 'eirf' ? '#b45309' : '#475569',
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            EIRF Forensic Center {
              (sub.eirfStatus === 'approved' || eirfData?.existingReport?.status === 'approved') ? (
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }} title="EIRF Report Approved" />
              ) : (sub.hasEirfFlag || eirfData?.existingReport) ? (
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#d97706' }} title="EIRF Review Pending" />
              ) : null
            }
          </button>
          <button onClick={onClose} className="cf-btn-secondary" style={{ padding: '4px 8px', fontSize: '8.5pt', margin: 0 }}>Close</button>
        </div>
      </div>

      {activeTab === 'proctoring' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {isCompleted ? (
              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '4px',
                overflow: 'hidden',
                aspectRatio: '4/3',
                width: '100%',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                border: '1px solid var(--cf-border)',
                color: '#cbd5e1',
                padding: '40px 20px',
                textAlign: 'center'
              }}>
                <Video size={48} style={{ color: '#64748b', marginBottom: '15px' }} />
                <strong style={{ fontSize: '11pt', color: '#fff', marginBottom: '4px' }}>Exam Session Completed</strong>
                <span style={{ fontSize: '8.5pt', color: '#94a3b8', maxWidth: '320px' }}>
                  This candidate has finalized and submitted their exam answers. Live camera feed is offline. Historic activity logs are preserved.
                </span>
              </div>
            ) : (
              <div style={{
                backgroundColor: '#0f172a',
                borderRadius: '4px',
                overflow: 'hidden',
                aspectRatio: '4/3',
                width: '100%',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                border: '1px solid var(--cf-border)',
                color: '#94a3b8',
                padding: connectionStatus === 'Connected' ? '0' : '40px 20px',
                textAlign: 'center'
              }}>
                <style>{`
                  @keyframes cf-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  .cf-spinner {
                    animation: cf-spin 1s linear infinite;
                  }
                `}</style>
                {connectionStatus !== 'Connected' ? (
                  <>
                    <Loader2 className="cf-spinner" size={32} style={{ color: '#38bdf8', marginBottom: '15px' }} />
                    <strong style={{ fontSize: '10.5pt', color: '#f1f5f9', marginBottom: '4px' }}>Waiting for Candidate Stream...</strong>
                    <span style={{ fontSize: '8pt', color: '#64748b', maxWidth: '280px' }}>
                      Establishing secure WebRTC channel. Ensure the candidate has started the test lobby and allowed media access.
                    </span>
                  </>
                ) : (
                  <>
                    <video
                      ref={setVideoRef}
                      autoPlay
                      playsInline
                      muted={isMuted}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                    />
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        right: '12px',
                        backgroundColor: isMuted ? '#ef4444' : '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '8.5pt',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      {isMuted ? 'Muted' : 'Audible'}
                    </button>
                  </>
                )}
              </div>
            )}

            {!isCompleted && (
              <button
                onClick={handleTerminateExam}
                className="cf-btn-primary"
                style={{ width: '100%', padding: '10px', fontSize: '9.5pt', backgroundColor: '#dc2626', borderColor: '#dc2626', fontWeight: 'bold' }}
              >
                Disqualify Candidate
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ClipboardList size={16} /> Compliance Warnings & Alerts
            </h4>
            <div style={{
              flexGrow: 1,
              overflowY: 'auto',
              border: '1px solid #cbd5e1',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: '#f8fafc',
              fontSize: '8pt',
              maxHeight: '380px',
              minHeight: '260px'
            }}>
              {(!Array.isArray(logs) || logs.length === 0) ? (
                <div style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>
                  No compliance events recorded.
                </div>
              ) : (
                (Array.isArray(logs) ? logs : []).map((log, idx) => {
                  const isWarning = log.type?.includes('ALERT') || log.type?.includes('EXIT') || log.type?.includes('DISQUALIFIED');
                  const isCode = log.type?.includes('CODE_RUN') || log.type?.includes('CODE_SAVED');
                  const isMcq = log.type?.includes('OPTION_MARKED');
                  const logColor = isWarning ? '#dc2626' : (isCode ? '#2563eb' : (isMcq ? '#059669' : '#1e293b'));
                  return (
                    <div key={idx} style={{ borderBottom: '1px dotted #e2e8f0', paddingBottom: '6px', marginBottom: '6px', color: logColor }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '7.5pt', marginBottom: '2px' }}>
                        <span>{log.type}</span>
                        <span style={{ color: '#64748b' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: '8pt' }}>{log.details}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* EIRF Forensic Center View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {eirfLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <Loader2 className="cf-spinner" size={24} style={{ marginBottom: '8px' }} />
              <div>Loading EIRF Forensic Audit Data...</div>
            </div>
          ) : !eirfData ? (
            <div style={{ padding: '30px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
              No EIRF records found for this submission.
            </div>
          ) : (
            <>
              {/* Telemetry Overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ backgroundColor: '#fffbeb', padding: '12px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '8pt', color: '#b45309', fontWeight: 'bold' }}>Max Fullscreen Exit Duration</div>
                  <div style={{ fontSize: '14pt', fontWeight: 'bold', color: eirfData.proctoringTelemetry?.maxFullscreenSeconds > 5 ? '#b91c1c' : '#15803d' }}>
                    {eirfData.proctoringTelemetry?.maxFullscreenSeconds || 0} seconds
                  </div>
                </div>

                <div style={{ backgroundColor: '#fffbeb', padding: '12px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '8pt', color: '#b45309', fontWeight: 'bold' }}>Max Tab Switch Duration</div>
                  <div style={{ fontSize: '14pt', fontWeight: 'bold', color: eirfData.proctoringTelemetry?.maxTabSwitchSeconds > 5 ? '#b91c1c' : '#15803d' }}>
                    {eirfData.proctoringTelemetry?.maxTabSwitchSeconds || 0} seconds
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '8pt', color: '#64748b', fontWeight: 'bold' }}>Report Filing Status</div>
                  <div style={{ fontSize: '11pt', fontWeight: 'bold', color: eirfData.existingReport ? '#0284c7' : ((eirfData.hasEirfFlag || eirfData.eirfNoticeEmailSent || sub.hasEirfFlag) ? '#d97706' : '#166534'), marginTop: '4px' }}>
                    {eirfData.existingReport 
                      ? (eirfData.existingReport.verificationStatus || eirfData.existingReport.status) 
                      : ((eirfData.hasEirfFlag || eirfData.eirfNoticeEmailSent || sub.hasEirfFlag) ? 'Filing Pending' : 'Not Flagged')}
                  </div>
                </div>
              </div>

              {/* Submitted EIRF Report Audit */}
              {!eirfData.existingReport ? (
                (eirfData.hasEirfFlag || eirfData.eirfNoticeEmailSent || sub.hasEirfFlag) ? (
                  <div style={{ padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bae6fd', color: '#0369a1', fontSize: '9pt' }}>
                    <strong>Filing Link Sent via Email:</strong> The candidate has been flagged for proctoring review (&gt;5s violation or emergency trigger). An official EIRF filing link was dispatched to the candidate's email. The candidate has not yet submitted their written report statement.
                  </div>
                ) : (
                  <div style={{ padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '4px', border: '1px solid #bbf7d0', color: '#166534', fontSize: '9pt' }}>
                    <strong>No EIRF Flag Triggered:</strong> The candidate completed the examination session within standard proctoring parameters (no &gt;5s violations or auto-submission triggers). No emergency incident report filing link was required or dispatched.
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                      <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Report Ref: {eirfData.existingReport.reportId}</span>
                      <span style={{
                        fontSize: '8pt',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' ? '#ecfdf5' : '#fef2f2',
                        color: eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' ? '#047857' : '#b91c1c',
                        border: `1px solid ${eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' ? '#a7f3d0' : '#fecaca'}`
                      }}>
                        {eirfData.existingReport.verificationStatus}
                      </span>
                    </div>

                    <div style={{ fontSize: '8.5pt', color: '#334155', marginBottom: '12px' }}>
                      <strong>Primary Trigger / Cause:</strong> <span style={{ color: '#0284c7', fontWeight: 'bold' }}>{eirfData.existingReport.primaryCause}</span>
                    </div>

                    {/* Payload Verification Match Card */}
                    <div style={{
                      backgroundColor: eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' ? '#f0fdf4' : (eirfData.existingReport.verificationStatus === 'PAYLOAD_MISSING' ? '#fffbeb' : '#fef2f2'),
                      border: `1px solid ${eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' ? '#bbf7d0' : (eirfData.existingReport.verificationStatus === 'PAYLOAD_MISSING' ? '#fde68a' : '#fecaca')}`,
                      borderRadius: '6px',
                      padding: '12px 14px',
                      marginBottom: '15px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '8.5pt', color: eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' ? '#166534' : (eirfData.existingReport.verificationStatus === 'PAYLOAD_MISSING' ? '#b45309' : '#991b1b') }}>
                          Payload Cross-Verification Status: {eirfData.existingReport.verificationStatus}
                        </strong>
                      </div>
                      <p style={{ fontSize: '8pt', margin: 0, color: '#475569', lineHeight: 1.4 }}>
                        {eirfData.existingReport.verificationStatus === 'VERIFIED_MATCH' && "Local client payload match verified against server submission telemetry."}
                        {eirfData.existingReport.verificationStatus === 'PAYLOAD_MISSING' && "Candidate did not attach an encrypted local payload file (.eirf). Verification evaluated via server telemetry."}
                        {eirfData.existingReport.verificationStatus === 'DISCREPANCY_FLAGGED' && "Discrepancy detected between uploaded client payload and server submission record."}
                        {eirfData.existingReport.verificationStatus === 'DECRYPTION_FAILED' && "Failed to decrypt uploaded payload file using system secret key."}
                      </p>
                      {eirfData.existingReport.verificationDetails?.discrepancies?.length > 0 && (
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '8pt', color: '#b91c1c' }}>
                          {eirfData.existingReport.verificationDetails.discrepancies.map((dItem, dIdx) => (
                            <li key={dIdx}>{dItem}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Candidate Questionnaire Answers (4 Sections) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Section 1 */}
                      <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '8.5pt' }}>
                        <strong style={{ color: '#002147', display: 'block', marginBottom: '4px' }}>1. Incident Acknowledgment & Confirmation:</strong>
                        <div style={{ color: '#334155', lineHeight: 1.5 }}>
                          <div>• Aware why action was taken: <strong>{eirfData.existingReport.formAnswers?.section1?.ackUnderstand || eirfData.existingReport.additionalAnswers?.ackUnderstand || 'Yes'}</strong></div>
                          <div>• Exact warnings remembered: <strong>{eirfData.existingReport.formAnswers?.section1?.warningCount || eirfData.existingReport.additionalAnswers?.warningCount || '3 warnings'}</strong></div>
                        </div>
                      </div>

                      {/* Section 2 */}
                      <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '8.5pt' }}>
                        <strong style={{ color: '#002147', display: 'block', marginBottom: '4px' }}>2. Context Behind Navigation Violations:</strong>
                        <div style={{ color: '#334155', lineHeight: 1.5 }}>
                          <div>• Tab / Focus Loss Context: <p style={{ margin: '2px 0 6px 0', color: '#475569' }}>{eirfData.existingReport.formAnswers?.section2?.tabReason || eirfData.existingReport.additionalAnswers?.tabReason || eirfData.existingReport.technicalContext?.openedApp || 'None specified'}</p></div>
                          <div>• Full-Screen Exits Explanation: <p style={{ margin: '2px 0 0 0', color: '#475569' }}>{eirfData.existingReport.formAnswers?.section2?.fullscreenReason || eirfData.existingReport.additionalAnswers?.fullscreenReason || 'None specified'}</p></div>
                        </div>
                      </div>

                      {/* Section 3 */}
                      <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '8.5pt' }}>
                        <strong style={{ color: '#002147', display: 'block', marginBottom: '4px' }}>3. Technical Malfunction Triage:</strong>
                        <div style={{ color: '#334155', lineHeight: 1.5 }}>
                          <div>• Reported Technical Interruptions: <strong>{Array.isArray(eirfData.existingReport.formAnswers?.section3?.interruptions) ? eirfData.existingReport.formAnswers.section3.interruptions.join(', ') : (Array.isArray(eirfData.existingReport.additionalAnswers?.interruptions) ? eirfData.existingReport.additionalAnswers.interruptions.join(', ') : 'None reported')}</strong></div>
                          <div>• Peripheral Connection Status: <strong>{eirfData.existingReport.formAnswers?.section3?.peripherals || eirfData.existingReport.additionalAnswers?.peripherals || 'No, no peripherals were connected'}</strong></div>
                        </div>
                      </div>

                      {/* Section 4 */}
                      <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '8.5pt' }}>
                        <strong style={{ color: '#002147', display: 'block', marginBottom: '4px' }}>4. Integrity Declaration & Final Statement:</strong>
                        <div style={{ color: '#334155', lineHeight: 1.5 }}>
                          <p style={{ margin: '2px 0 6px 0', color: '#475569' }}>{eirfData.existingReport.detailedExplanation || eirfData.existingReport.formAnswers?.section4?.explanation}</p>
                          <div style={{ fontSize: '8pt', color: '#059669', fontWeight: 'bold' }}>
                            Formal Integrity Declaration: Certified & Agreed
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Admin Decision Actions */}
                  <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Committee Review & Action</div>
                    {actionSuccess && (
                      <div style={{ padding: '8px 12px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: '4px', fontSize: '8.5pt', fontWeight: 'bold' }}>
                        {actionSuccess}
                      </div>
                    )}
                    <textarea
                      placeholder="Add administrative remarks or committee notes..."
                      value={adminRemarks}
                      onChange={e => setAdminRemarks(e.target.value)}
                      rows={2}
                      className="cf-input"
                      style={{ fontSize: '8.5pt', padding: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => {
                          setPendingActionType('approve');
                          setIsCourseModalOpen(true);
                        }}
                        className="cf-btn-primary"
                        style={{ flex: 1, backgroundColor: '#059669', borderColor: '#059669', padding: '8px', fontSize: '8.5pt', fontWeight: 'bold' }}
                      >
                        Approve EIRF Report
                      </button>
                      <button
                        onClick={() => {
                          setPendingActionType('reject');
                          setIsCourseModalOpen(true);
                        }}
                        className="cf-btn-primary"
                        style={{ flex: 1, backgroundColor: '#dc2626', borderColor: '#dc2626', padding: '8px', fontSize: '8.5pt', fontWeight: 'bold' }}
                      >
                        Reject EIRF Report
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Admin Course Selection & Verdict Confirmation Modal */}
      {isCourseModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxWidth: '480px',
            width: '100%',
            padding: '20px',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '11pt', color: '#002147', fontWeight: 'bold' }}>
              Select Academic Course for EIRF Verdict PDF
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '8.5pt', color: '#64748b', lineHeight: 1.4 }}>
              Specify the course code and title for this examination. This metadata will be embedded into the candidate's official BICS Verdict PDF document and verification QR code.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                Course Preset Selection:
              </label>
              <select
                value={selectedCourseCode}
                onChange={(e) => {
                  const selected = e.target.value;
                  setSelectedCourseCode(selected);
                  const match = PRESET_COURSES.find(c => c.code === selected);
                  if (match && match.code !== 'CUSTOM') {
                    setSelectedCourseName(match.name);
                  }
                }}
                style={{ width: '100%', padding: '8px', fontSize: '9pt', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}
              >
                {PRESET_COURSES.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            {selectedCourseCode === 'CUSTOM' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Custom Course Code:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CS-301"
                    value={customCourseCode}
                    onChange={(e) => setCustomCourseCode(e.target.value)}
                    style={{ width: '100%', padding: '8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Custom Course Name:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Advanced Operating Systems"
                    value={customCourseName}
                    onChange={(e) => setCustomCourseName(e.target.value)}
                    style={{ width: '100%', padding: '8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>
            )}

            <div style={{ backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '4px', marginBottom: '16px', fontSize: '8pt', color: '#334155' }}>
              <div><strong>Verdict Action:</strong> <span style={{ color: pendingActionType === 'approve' ? '#059669' : '#dc2626', fontWeight: 'bold' }}>{pendingActionType.toUpperCase()}</span></div>
              <div><strong>Committee Remarks:</strong> {adminRemarks || 'Standard administrative verdict notice attached.'}</div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                disabled={submittingAction}
                onClick={() => setIsCourseModalOpen(false)}
                style={{ padding: '8px 16px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', color: '#475569' }}
              >
                Cancel
              </button>
              <button
                disabled={submittingAction}
                onClick={() => handleAdminEirfAction(pendingActionType)}
                style={{
                  padding: '8px 18px',
                  fontSize: '8.5pt',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: pendingActionType === 'approve' ? '#059669' : '#dc2626',
                  color: '#ffffff',
                  cursor: submittingAction ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submittingAction && <Loader2 className="animate-spin" size={14} />}
                {submittingAction ? 'Processing...' : `Confirm & ${pendingActionType === 'approve' ? 'Approve EIRF' : 'Reject EIRF'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
