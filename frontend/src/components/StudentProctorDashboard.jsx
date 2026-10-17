import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Video, Loader2, VolumeX, Volume2, ClipboardList, Camera, Eye, 
  ZoomIn, X, ShieldAlert, Laptop, CheckCircle2, Clock, Image as ImageIcon, ExternalLink, AlertTriangle
} from 'lucide-react';
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

const resolveSnapshotUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const backendBase = (API_BASE || '').replace(/\/api\/?$/, '');
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function StudentProctorDashboard({ sub, onClose, fetchLiveSubmissions }) {
  const [activeTab, setActiveTab] = useState('proctoring'); // 'proctoring' | 'eirf'
  const [logs, setLogs] = useState(sub.proctoringLog?.events || []);
  const [snapshots, setSnapshots] = useState(sub.proctoringLog?.snapshots || []);
  const [baselinePhotoUrl, setBaselinePhotoUrl] = useState(sub.baselinePhotoUrl || '');
  const [securityMetadata, setSecurityMetadata] = useState(sub.securityMetadata || null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [logViewMode, setLogViewMode] = useState('timeline'); // 'timeline' | 'gallery'
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
  const [resolutionCategory, setResolutionCategory] = useState('');
  const [remediationAction, setRemediationAction] = useState('');
  const [reviewerName, setReviewerName] = useState('Academic Integrity Board Convener');
  const [reviewerTitle, setReviewerTitle] = useState('Convener, Examination Disciplinary Committee');
  const [submittingAction, setSubmittingAction] = useState(false);
  const pcRef = useRef(null);
  const subId = sub.id || sub._id;

  const fetchEirfDetails = async () => {
    setEirfLoading(true);
    try {
      const res = await fetch(`${API_BASE}/test/eirf/details/${subId}?role=admin`);
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
    const defaultCategory = targetStatus === 'approved' 
      ? 'Technical Glitch / Environmental Disruption' 
      : 'Unexplained Window Deviation Confirmed';
    const defaultRemediation = targetStatus === 'approved'
      ? 'Provisional Assessment Restored & Validated'
      : 'Examination Score Annulled (Zero Points)';

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
          adminRemarks: adminRemarks || `Marked as ${targetStatus.toUpperCase()} by administration.`,
          resolutionCategory: resolutionCategory || defaultCategory,
          remediationAction: remediationAction || defaultRemediation,
          reviewerName: reviewerName || 'Academic Integrity Board Convener',
          reviewerTitle: reviewerTitle || 'Convener, Examination Disciplinary Committee'
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
              if (Array.isArray(match.proctoringLog.snapshots)) {
                setSnapshots(match.proctoringLog.snapshots);
              }
            }
            if (match.baselinePhotoUrl) {
              setBaselinePhotoUrl(match.baselinePhotoUrl);
            }
            if (match.securityMetadata) {
              setSecurityMetadata(match.securityMetadata);
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

      {/* Lightbox Modal for Snapshot Inspection */}
      {selectedSnapshot && (
        <div 
          onClick={() => setSelectedSnapshot(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              maxWidth: '720px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              border: '1px solid #cbd5e1'
            }}
          >
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold', color: '#002147' }}>
                  Proctoring Evidence Snapshot: {selectedSnapshot.type}
                </h4>
                <span style={{ fontSize: '8pt', color: '#64748b' }}>
                  Captured: {new Date(selectedSnapshot.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                </span>
              </div>
              <button 
                onClick={() => setSelectedSnapshot(null)}
                className="cf-btn-secondary"
                style={{ padding: '4px 8px', fontSize: '8pt', margin: 0 }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ backgroundColor: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '360px' }}>
              <img 
                src={resolveSnapshotUrl(selectedSnapshot.url)} 
                alt="Proctoring Snapshot" 
                style={{ maxWidth: '100%', maxHeight: '520px', objectFit: 'contain' }}
              />
            </div>
            {selectedSnapshot.details && (
              <div style={{ padding: '12px 18px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '8.5pt', color: '#334155' }}>
                <strong>Details:</strong> {selectedSnapshot.details}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'proctoring' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: "'Roboto', -apple-system, sans-serif" }}>
          
          {/* Top Monitoring Panel: Compact Camera, Baseline Photo & Security Profile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '16px', alignItems: 'stretch' }}>
            
            {/* 1. Compact Live Camera Window (Desktop Size: 240px x 180px) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Video size={13} /> Live Camera Feed
                </span>
                <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: isCompleted ? '#64748b' : connectionStatus === 'Connected' ? '#16a34a' : '#d97706' }}>
                  {isCompleted ? 'Offline' : connectionStatus}
                </span>
              </div>

              <div style={{
                width: '240px',
                height: '180px',
                backgroundColor: '#0f172a',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                border: '1px solid #cbd5e1'
              }}>
                {isCompleted ? (
                  <div style={{ color: '#cbd5e1', textAlign: 'center', padding: '10px' }}>
                    <Video size={28} style={{ color: '#64748b', marginBottom: '6px' }} />
                    <div style={{ fontSize: '8.5pt', color: '#94a3b8' }}>Session Completed</div>
                  </div>
                ) : connectionStatus !== 'Connected' ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '10px' }}>
                    <Loader2 className="cf-spinner" size={24} style={{ color: '#38bdf8', marginBottom: '8px' }} />
                    <div style={{ fontSize: '8pt', color: '#cbd5e1' }}>Awaiting Stream...</div>
                  </div>
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
                        bottom: '8px',
                        right: '8px',
                        backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '3px 8px',
                        fontSize: '7.5pt',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      {isMuted ? 'Muted' : 'Live'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 2. Baseline Reference Portrait Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Camera size={13} /> Baseline Identity Photo
              </span>

              <div style={{
                width: '180px',
                height: '180px',
                backgroundColor: '#f1f5f9',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                {baselinePhotoUrl ? (
                  <>
                    <img 
                      src={resolveSnapshotUrl(baselinePhotoUrl)} 
                      alt="Baseline Identity" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      onClick={() => setSelectedSnapshot({ url: baselinePhotoUrl, type: 'BASELINE_REFERENCE', timestamp: sub.startedAt || new Date(), details: 'Initial onboarding baseline identity photograph.' })}
                      style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '6px',
                        backgroundColor: 'rgba(0, 33, 71, 0.85)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '2px 6px',
                        fontSize: '7pt',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <ZoomIn size={10} /> Zoom
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '10px' }}>
                    <Camera size={24} style={{ marginBottom: '4px' }} />
                    <div style={{ fontSize: '7.5pt' }}>No Baseline Photo</div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Candidate Security & Integrity Overview */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '10pt', fontWeight: '700', color: '#002147', margin: 0 }}>Candidate Session Profile</h4>
                    <span style={{ fontSize: '8pt', color: '#64748b' }}>Exam: {sub.testTitle} • Started: {new Date(sub.startedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                  </div>
                  
                  <span style={{
                    fontSize: '8pt',
                    fontWeight: 'bold',
                    padding: '3px 8px',
                    borderRadius: '3px',
                    backgroundColor: isCompleted ? '#f1f5f9' : '#ecfdf5',
                    color: isCompleted ? '#475569' : '#15803d',
                    border: `1px solid ${isCompleted ? '#cbd5e1' : '#bbf7d0'}`
                  }}>
                    {isCompleted ? 'Finished' : 'In Progress'}
                  </span>
                </div>

                {/* Security Metrics Pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '8pt' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b', fontSize: '7pt' }}>Fullscreen Exits</div>
                    <strong style={{ color: sub.proctoringLog?.fullscreenExits > 0 ? '#b91c1c' : '#334155', fontSize: '9pt' }}>
                      {sub.proctoringLog?.fullscreenExits || 0} / 3
                    </strong>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b', fontSize: '7pt' }}>Tab Switches / Blurs</div>
                    <strong style={{ color: sub.proctoringLog?.tabSwitches > 0 ? '#b91c1c' : '#334155', fontSize: '9pt' }}>
                      {sub.proctoringLog?.tabSwitches || 0} / 3
                    </strong>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b', fontSize: '7pt' }}>Clipboard Lockdown</div>
                    <strong style={{ color: (sub.proctoringLog?.clipboardAttempts > 0) ? '#b91c1c' : '#15803d', fontSize: '9pt' }}>
                      {sub.proctoringLog?.clipboardAttempts || 0} Blocked
                    </strong>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#64748b', fontSize: '7pt' }}>Evidence Snapshots</div>
                    <strong style={{ color: '#002147', fontSize: '9pt' }}>
                      {snapshots.length} Captured
                    </strong>
                  </div>

                  {securityMetadata && (
                    <div style={{ backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                      <div style={{ color: '#64748b', fontSize: '7pt' }}>Client Environment &amp; Network Telemetry</div>
                      <div style={{ color: '#334155', fontWeight: 'bold', fontSize: '8pt', marginTop: '2px' }}>
                        {securityMetadata.osDetails?.osVersion || securityMetadata.operatingSystem} ({securityMetadata.osDetails?.architecture || '64-bit'}) • {securityMetadata.browser}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '7.5pt', marginTop: '2px' }}>
                        IP: {securityMetadata.network?.publicIp || securityMetadata.ip}
                        {securityMetadata.network?.city ? ` (${securityMetadata.network.city}, ${securityMetadata.network.country})` : ''}
                        {securityMetadata.network?.isp ? ` • ISP: ${securityMetadata.network.isp}` : ''}
                        {securityMetadata.network?.isProxyOrVpn ? <span style={{ color: '#dc2626', fontWeight: 'bold', marginLeft: '6px' }}>[VPN / Proxy Detected]</span> : ''}
                        {securityMetadata.osDetails?.isVirtualMachineDetected ? <span style={{ color: '#dc2626', fontWeight: 'bold', marginLeft: '6px' }}>[⚠️ {securityMetadata.osDetails.vmIndicator}]</span> : ''}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!isCompleted && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    onClick={handleTerminateExam}
                    className="cf-btn-primary"
                    style={{ padding: '6px 14px', fontSize: '8.5pt', backgroundColor: '#dc2626', borderColor: '#dc2626', fontWeight: 'bold' }}
                  >
                    Disqualify Candidate
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Bottom Section: Forensic Audit Timeline & Snapshot Evidence Gallery */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={16} style={{ color: '#002147' }} />
                <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>
                  Compliance Audit &amp; Violation Evidence Feed
                </span>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setLogViewMode('timeline')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '8pt',
                    borderRadius: '3px',
                    border: '1px solid',
                    borderColor: logViewMode === 'timeline' ? '#002147' : '#cbd5e1',
                    backgroundColor: logViewMode === 'timeline' ? '#002147' : '#ffffff',
                    color: logViewMode === 'timeline' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Timeline Log ({logs.length})
                </button>
                <button
                  onClick={() => setLogViewMode('gallery')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '8pt',
                    borderRadius: '3px',
                    border: '1px solid',
                    borderColor: logViewMode === 'gallery' ? '#002147' : '#cbd5e1',
                    backgroundColor: logViewMode === 'gallery' ? '#002147' : '#ffffff',
                    color: logViewMode === 'gallery' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Evidence Snapshots ({snapshots.length})
                </button>
              </div>
            </div>

            {logViewMode === 'timeline' ? (
              <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '12px' }}>
                {(!Array.isArray(logs) || logs.length === 0) ? (
                  <div style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '24px', fontSize: '8.5pt' }}>
                    No compliance events recorded for this candidate.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {logs.map((log, idx) => {
                      const isWarning = log.type?.includes('ALERT') || log.type?.includes('EXIT') || log.type?.includes('DISQUALIFIED') || log.type?.includes('WARNING') || log.type?.includes('VOICE') || log.type?.includes('CLIPBOARD');
                      
                      // Match snapshot by time or category if available
                      const matchingSnapshots = snapshots.filter(s => {
                        const typeMatches = s.type === log.type || 
                          (s.type === 'FULLSCREEN_EXIT' && (log.type?.includes('FULLSCREEN') || log.type?.includes('EXIT'))) ||
                          (s.type === 'TAB_SWITCH' && (log.type?.includes('TAB') || log.type?.includes('FOCUS'))) ||
                          (s.type === 'DEVTOOLS_OPENED' && (log.type?.includes('DEVTOOLS') || log.type?.includes('INSPECT'))) ||
                          (s.type === 'CLIPBOARD_ATTEMPT' && (log.type?.includes('CLIPBOARD') || log.type?.includes('COPY'))) ||
                          (s.type === 'VOICE_DETECTED' && log.type?.includes('VOICE')) ||
                          (s.type === 'FACE_MISSING' && log.type?.includes('FACE_MISSING')) ||
                          (s.type === 'MULTI_FACE' && log.type?.includes('MULTI_FACE')) ||
                          (s.type === 'LOOKING_AWAY' && log.type?.includes('LOOKING_AWAY')) ||
                          (s.type === 'MINOR_WARNINGS_EXCEEDED' && log.type?.includes('MINOR_WARNINGS'));
                        if (!typeMatches) return false;
                        const timeDiff = Math.abs(new Date(s.timestamp).getTime() - new Date(log.timestamp).getTime());
                        return timeDiff < 60000;
                      });

                      let matchingSnapshot = null;
                      if (matchingSnapshots.length > 0) {
                        matchingSnapshot = matchingSnapshots.reduce((closest, curr) => {
                          const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - new Date(log.timestamp).getTime());
                          const currDiff = Math.abs(new Date(curr.timestamp).getTime() - new Date(log.timestamp).getTime());
                          return currDiff < closestDiff ? curr : closest;
                        });
                      }

                      return (
                        <div 
                          key={idx} 
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            backgroundColor: isWarning ? '#fff7ed' : '#f8fafc',
                            border: `1px solid ${isWarning ? '#fed7aa' : '#e2e8f0'}`,
                            borderRadius: '4px',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                            <span style={{
                              fontSize: '7.5pt',
                              fontWeight: 'bold',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              backgroundColor: isWarning ? '#ffedd5' : '#e2e8f0',
                              color: isWarning ? '#9a3412' : '#334155'
                            }}>
                              {log.type}
                            </span>
                            <span style={{ fontSize: '8.5pt', color: '#1e293b' }}>
                              {log.details}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                            {matchingSnapshot && (
                              <button
                                onClick={() => setSelectedSnapshot(matchingSnapshot)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '7.5pt',
                                  color: '#002147',
                                  backgroundColor: '#ffffff',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '3px',
                                  padding: '2px 6px',
                                  cursor: 'pointer'
                                }}
                              >
                                <ImageIcon size={12} /> View Snapshot
                              </button>
                            )}

                            <span style={{ fontSize: '7.5pt', color: '#64748b', minWidth: '70px', textAlign: 'right' }}>
                              {new Date(log.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Snapshot Gallery View */
              <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '16px' }}>
                {snapshots.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '24px', fontSize: '8.5pt' }}>
                    No violation evidence snapshots recorded for this candidate.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                    {snapshots.map((snap, sIdx) => (
                      <div 
                        key={sIdx}
                        onClick={() => setSelectedSnapshot(snap)}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          backgroundColor: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        <div style={{ width: '100%', height: '110px', backgroundColor: '#0f172a', overflow: 'hidden' }}>
                          <img 
                            src={resolveSnapshotUrl(snap.url)} 
                            alt={snap.type} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#002147' }}>{snap.type}</span>
                          <span style={{ fontSize: '7pt', color: '#64748b' }}>
                            {new Date(snap.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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

            {/* Resolution Classification Category */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                Resolution Category:
              </label>
              {pendingActionType === 'approve' ? (
                <select
                  value={resolutionCategory || 'Technical Glitch / Environmental Disruption'}
                  onChange={(e) => setResolutionCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}
                >
                  <option value="Technical Glitch / Environmental Disruption">Technical Glitch / Environmental Disruption</option>
                  <option value="Hardware / Network Connectivity Latency">Hardware / Network Connectivity Latency</option>
                  <option value="Approved Academic Accommodation Exception">Approved Academic Accommodation Exception</option>
                  <option value="Inadvertent Focus Loss (Zero Malpractice Intent)">Inadvertent Focus Loss (Zero Malpractice Intent)</option>
                </select>
              ) : (
                <select
                  value={resolutionCategory || 'Unexplained Window Deviation Confirmed'}
                  onChange={(e) => setResolutionCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}
                >
                  <option value="Unexplained Window Deviation Confirmed">Unexplained Window Deviation Confirmed</option>
                  <option value="Proctoring Rule Breach / Secondary Application Access">Proctoring Rule Breach / Secondary Application Access</option>
                  <option value="Defense Disproven by Objective System Telemetry">Defense Disproven by Objective System Telemetry</option>
                  <option value="Repeated Fullscreen Evasion Beyond Allowed Limit">Repeated Fullscreen Evasion Beyond Allowed Limit</option>
                </select>
              )}
            </div>

            {/* Remediation Action / Penalty */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                {pendingActionType === 'approve' ? 'Remediation Action:' : 'Disciplinary Penalty:'}
              </label>
              {pendingActionType === 'approve' ? (
                <select
                  value={remediationAction || 'Provisional Assessment Restored & Validated'}
                  onChange={(e) => setRemediationAction(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}
                >
                  <option value="Provisional Assessment Restored & Validated">Provisional Assessment Restored & Validated</option>
                  <option value="Full Retake Authorized Under Supervised Proctoring">Full Retake Authorized Under Supervised Proctoring</option>
                  <option value="Docked Points Overridden (Manual Normalization)">Docked Points Overridden (Manual Normalization)</option>
                </select>
              ) : (
                <select
                  value={remediationAction || 'Examination Score Annulled (Zero Points)'}
                  onChange={(e) => setRemediationAction(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}
                >
                  <option value="Examination Score Annulled (Zero Points)">Examination Score Annulled (Zero Points)</option>
                  <option value="Course Failure (Grade F) Pending Committee Escalation">Course Failure (Grade F) Pending Committee Escalation</option>
                  <option value="Referral to University Academic Integrity Board">Referral to University Academic Integrity Board</option>
                </select>
              )}
            </div>

            {/* Human Adjudicator Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Reviewer Name:
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Reviewer Title:
                </label>
                <input
                  type="text"
                  value={reviewerTitle}
                  onChange={(e) => setReviewerTitle(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '8.5pt', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

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
