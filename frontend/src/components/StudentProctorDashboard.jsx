import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Video, Loader2, VolumeX, Volume2, ClipboardList } from 'lucide-react';
import { API_BASE } from '../config';

export default function StudentProctorDashboard({ sub, onClose, fetchLiveSubmissions }) {
  const [logs, setLogs] = useState(sub.proctoringLog?.events || []);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [status, setStatus] = useState(sub.status || 'started');
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null);
  const subId = sub.id || sub._id;

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
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: isCompleted ? '#f1f5f9' : (connectionStatus === 'Connected' ? '#ecfdf5' : '#fffbeb'),
            color: isCompleted ? '#64748b' : (connectionStatus === 'Connected' ? '#059669' : '#d97706'),
            fontSize: '8.5pt',
            fontWeight: 'bold',
            padding: '4px 10px',
            borderRadius: '4px'
          }}>
            <Video size={14} /> {connectionStatus}
          </span>
          <button onClick={onClose} className="cf-btn-secondary" style={{ padding: '4px 8px', fontSize: '8.5pt', margin: 0 }}>Close</button>
        </div>
      </div>

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
    </div>
  );
}
