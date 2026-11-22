import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import {
  QrCode,
  ShieldCheck,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Camera,
  RefreshCw,
  Copy,
  Check,
  FileText,
  MapPin,
  Laptop,
  BookOpen,
  Award,
  Info,
  Flashlight,
  ClipboardPaste,
  ChevronRight
} from 'lucide-react';

export default function DigitalAttendanceView({ candidate, user, timetable = [], coursesList = [] }) {
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'records' | 'schedule'
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { success, trackingCode, message, record }
  const [copiedCode, setCopiedCode] = useState(false);
  const [myRecords, setMyRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const streamRef = useRef(null);

  // Play audio tone on successful scan
  const playScanBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.18);
    } catch (e) {
      // Audio autoplay policy might restrict; fail gracefully
    }
  };

  // Trigger haptic vibration on mobile
  const triggerHaptic = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 80]);
      }
    } catch (e) {}
  };

  // Fetch student's own attendance records
  const fetchMyRecords = async () => {
    setLoadingRecords(true);
    try {
      const authToken = localStorage.getItem('token') || sessionStorage.getItem('token');
      const candidateId = candidate?.studentId || candidate?.username || user?.username;

      const res = await fetch('/api/attendance/my-records', {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMyRecords(data.records || []);
        }
      }
    } catch (err) {
      console.error('Failed to load my digital attendance records:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    fetchMyRecords();
  }, [candidate?.studentId, user?.username]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError('');
    setScanResult(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your current browser.');
      return;
    }

    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check if torch is supported
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        setHasTorch(!!capabilities.torch);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        setCameraActive(true);
        animationFrameId.current = requestAnimationFrame(scanTick);
      }
    } catch (err) {
      console.error('getUserMedia error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera detected on this device. You can paste your Paper Token manually below.');
      } else {
        setCameraError(`Camera initialisation failed: ${err.message || 'Unknown error'}`);
      }
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopCamera();
    setTimeout(() => {
      startCamera();
    }, 200);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      try {
        const nextTorch = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: nextTorch }] });
        setTorchOn(nextTorch);
      } catch (err) {
        console.warn('Torch toggle failed:', err);
      }
    }
  };

  // Continuous frame scanner via jsQR
  const scanTick = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameId.current = requestAnimationFrame(scanTick);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) {
      animationFrameId.current = requestAnimationFrame(scanTick);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      const scannedText = String(code.data).trim();
      if (scannedText.length > 20) {
        // Successful QR scan!
        playScanBeep();
        triggerHaptic();
        stopCamera();
        processToken(scannedText);
        return;
      }
    }

    animationFrameId.current = requestAnimationFrame(scanTick);
  };

  // Process and verify the scanned or manually entered attendance token
  const processToken = async (tokenStr) => {
    setIsSubmitting(true);
    setScanResult(null);

    try {
      const authToken = localStorage.getItem('token') || sessionStorage.getItem('token');
      const payload = {
        token: tokenStr,
        candidateId: candidate?.studentId || candidate?.username || user?.username,
        rollNo: candidate?.rollNo || candidate?.studentId,
        studentName: candidate?.name || user?.name || 'Verified Candidate'
      };

      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setScanResult({
          success: true,
          trackingCode: data.trackingCode,
          message: data.message || 'Digital attendance successfully logged and cryptographically signed!',
          record: data.record,
          payload: data.payload
        });
        setManualToken('');
        fetchMyRecords();
      } else {
        setScanResult({
          success: false,
          message: data.error || data.message || 'Could not verify attendance token.'
        });
      }
    } catch (err) {
      setScanResult({
        success: false,
        message: 'Network error communicating with the attendance server.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    processToken(manualToken.trim());
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) setManualToken(text.trim());
      }
    } catch {
      // Clipboard read permission might be blocked; fallback to normal input
    }
  };

  const handleCopyCode = () => {
    if (scanResult?.trackingCode) {
      navigator.clipboard.writeText(scanResult.trackingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Helper to format category badge with subtle, elegant colors
  const renderCategoryBadge = (cat) => {
    const c = String(cat || 'theory').toLowerCase();
    if (c === 'online') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '2px 7px', borderRadius: '3px', fontSize: '7.5pt', fontWeight: 'bold' }}>
          <Laptop size={11} /> Online Exam
        </span>
      );
    }
    if (c === 'practical') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#fefce8', color: '#713f12', border: '1px solid #fef08a', padding: '2px 7px', borderRadius: '3px', fontSize: '7.5pt', fontWeight: 'bold' }}>
          <Award size={11} /> Practical Exam
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: '3px', fontSize: '7.5pt', fontWeight: 'bold' }}>
        <BookOpen size={11} /> Written / Theory
      </span>
    );
  };

  return (
    <div className="cf-card">
      {/* Standard BICS Candidate Outer Card Title */}
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <QrCode size={16} style={{ color: '#3b5998' }} />
        <span>Digital Examination Attendance</span>
      </div>

      {/* Embedded Responsive CSS Styles */}
      <style>{`
        .da-candidate-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 10px 14px;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          margin-bottom: 15px;
        }
        .da-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 15px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .da-tab-btn {
          flex: 1;
          min-width: 105px;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 8.5pt;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
        }
        .da-tab-btn:hover {
          background: #f8fafc;
          color: #1e293b;
        }
        .da-tab-btn.active {
          background-color: #e8eff7;
          border-color: #94a3b8;
          color: #1e3a8a;
          font-weight: 700;
          box-shadow: none;
        }
        .da-viewport {
          position: relative;
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
          aspect-ratio: 1 / 1;
          max-height: 350px;
          background-color: #1e293b;
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #cbd5e1;
        }
        .da-laser-line {
          position: absolute;
          left: 15%;
          right: 15%;
          height: 2px;
          background: #10b981;
          box-shadow: 0 0 8px 1px rgba(16, 185, 129, 0.6);
          animation: scanLaser 2.4s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes scanLaser {
          0% { top: 15%; opacity: 0.8; }
          50% { top: 85%; opacity: 1; }
          100% { top: 15%; opacity: 0.8; }
        }
        .da-corner-bracket {
          position: absolute;
          width: 20px;
          height: 20px;
          pointer-events: none;
        }
        .da-tl { top: 0; left: 0; border-top: 2.5px solid #10b981; border-left: 2.5px solid #10b981; border-top-left-radius: 4px; }
        .da-tr { top: 0; right: 0; border-top: 2.5px solid #10b981; border-right: 2.5px solid #10b981; border-top-right-radius: 4px; }
        .da-bl { bottom: 0; left: 0; border-bottom: 2.5px solid #10b981; border-left: 2.5px solid #10b981; border-bottom-left-radius: 4px; }
        .da-br { bottom: 0; right: 0; border-bottom: 2.5px solid #10b981; border-right: 2.5px solid #10b981; border-bottom-right-radius: 4px; }
        .da-desktop-table { display: none; }
        .da-mobile-cards { display: flex; flex-direction: column; gap: 10px; }
        @media (min-width: 680px) {
          .da-desktop-table { display: block; }
          .da-mobile-cards { display: none; }
        }
      `}</style>

      {/* Subtle Candidate Context Strip */}
      <div className="da-candidate-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <ShieldCheck size={16} style={{ color: '#475569' }} />
          <span style={{ fontSize: '9pt', color: '#334155' }}>
            Candidate: <strong style={{ color: '#0f172a' }}>{candidate?.name || user?.name || 'Verified Candidate'}</strong>
          </span>
          <span style={{ fontSize: '8pt', color: '#64748b' }}>
            (ID: <strong style={{ color: '#334155' }}>{candidate?.studentId || candidate?.username || user?.username || '2025001'}</strong>{candidate?.rollNo ? ` | Roll: ${candidate.rollNo}` : ''})
          </span>
        </div>
        <div style={{ fontSize: '7.5pt', color: '#475569' }}>
          Status: <strong style={{ color: '#16a34a' }}>Registered & Verified</strong>
        </div>
      </div>

      {/* Subtle Tab Navigation */}
      <div className="da-tabs">
        <button
          type="button"
          className={`da-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
          onClick={() => setActiveTab('scanner')}
        >
          <Camera size={14} />
          <span>Scanner</span>
        </button>

        <button
          type="button"
          className={`da-tab-btn ${activeTab === 'records' ? 'active' : ''}`}
          onClick={() => { stopCamera(); setActiveTab('records'); }}
        >
          <ShieldCheck size={14} />
          <span>My Records</span>
        </button>

        <button
          type="button"
          className={`da-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => { stopCamera(); setActiveTab('schedule'); }}
        >
          <Calendar size={14} />
          <span>Schedule</span>
        </button>
      </div>

      {/* TAB 1: SCANNER INTERFACE */}
      {activeTab === 'scanner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Subtle Exam Hall Instruction Callout */}
          <div className="cf-alert cf-alert-info" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '8.5pt', margin: 0 }}>
            <Info size={16} style={{ color: '#475569', flexShrink: 0 }} />
            <div>
              <strong>Exam Hall Instructions:</strong> Point your camera at the <strong>Digital Attendance QR Code</strong> printed on the bottom right of the official Attendance Sheet. Write the returned <strong>10-Digit Digital Ticket No.</strong> on your physical attendance register and answer booklet.
            </div>
          </div>

          {/* Scanner Box */}
          <div style={{ padding: '16px 14px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
              <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155' }}>
                Live Attendance Scanner
              </div>
              <div style={{ fontSize: '8pt', color: cameraActive ? '#16a34a' : '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: cameraActive ? '#16a34a' : '#94a3b8' }} />
                {cameraActive ? 'Camera Live' : 'Camera Ready'}
              </div>
            </div>

            {/* Viewport Box */}
            <div className="da-viewport">
              <video
                ref={videoRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraActive ? 'block' : 'none'
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {!cameraActive && (
                <div style={{ padding: '20px', color: '#94a3b8' }}>
                  <Camera size={40} style={{ margin: '0 auto 10px auto', display: 'block', opacity: 0.7 }} />
                  <p style={{ margin: '0 0 12px 0', fontSize: '8.5pt', color: '#cbd5e1' }}>
                    Tap below to launch camera scanner
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="cf-btn-primary"
                    style={{ padding: '8px 18px', fontSize: '8.5pt', borderRadius: '4px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Camera size={14} /> Open Camera Scanner
                  </button>
                </div>
              )}

              {/* Viewport Laser & Reticle Brackets */}
              {cameraActive && (
                <>
                  <div className="da-laser-line" />
                  <div style={{
                    position: 'absolute',
                    width: '68%',
                    height: '68%',
                    pointerEvents: 'none'
                  }}>
                    <div className="da-corner-bracket da-tl" />
                    <div className="da-corner-bracket da-tr" />
                    <div className="da-corner-bracket da-bl" />
                    <div className="da-corner-bracket da-br" />
                    <div style={{
                      position: 'absolute',
                      bottom: '-26px',
                      left: 0,
                      right: 0,
                      textAlign: 'center',
                      color: '#ffffff',
                      fontSize: '7.5pt',
                      fontWeight: '600',
                      textShadow: '0 1px 3px rgba(0,0,0,0.9)'
                    }}>
                      Align QR inside frame
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Controls (Flip, Torch, Close) */}
            {cameraActive && (
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="cf-btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '8pt', borderRadius: '4px' }}
                >
                  <RefreshCw size={12} /> Flip ({facingMode === 'environment' ? 'Rear' : 'Front'})
                </button>

                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className="cf-btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', fontSize: '8pt', borderRadius: '4px', backgroundColor: torchOn ? '#fefce8' : '#ffffff' }}
                  >
                    <Flashlight size={12} color={torchOn ? '#ca8a04' : '#64748b'} /> {torchOn ? 'Torch On' : 'Torch'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopCamera}
                  className="cf-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '8pt', color: '#dc2626', borderColor: '#fca5a5', borderRadius: '4px' }}
                >
                  Close Camera
                </button>
              </div>
            )}

            {cameraError && (
              <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '8pt', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '4px', textAlign: 'left' }}>
                {cameraError}
              </div>
            )}

            {/* Manual Token Entry Fallback */}
            <div style={{ marginTop: '18px', borderTop: '1px solid #e2e8f0', paddingTop: '14px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '8pt', fontWeight: 'bold', color: '#475569' }}>
                  Manual Paper Token Entry:
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  style={{ background: 'none', border: 'none', color: '#475569', fontSize: '7.5pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}
                >
                  <ClipboardPaste size={12} /> Paste
                </button>
              </div>
              <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Paste or type encoded paper token..."
                  value={manualToken}
                  onChange={e => setManualToken(e.target.value)}
                  className="cf-input"
                  style={{ flex: 1, fontSize: '8.5pt', padding: '7px 10px', borderRadius: '4px' }}
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !manualToken.trim()}
                  className="cf-btn-primary"
                  style={{ padding: '7px 16px', fontSize: '8.5pt', borderRadius: '4px', whiteSpace: 'nowrap' }}
                >
                  {isSubmitting ? 'Checking...' : 'Submit'}
                </button>
              </form>
            </div>
          </div>

          {/* SCAN RESULT RECEIPT */}
          {scanResult && (
            <div style={{
              padding: '16px',
              backgroundColor: scanResult.success ? '#f0fdf4' : '#fef2f2',
              borderRadius: '4px',
              border: `1px solid ${scanResult.success ? '#bbf7d0' : '#fecaca'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {scanResult.success ? (
                  <CheckCircle2 size={26} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <AlertCircle size={26} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '11pt', fontWeight: 'bold', color: scanResult.success ? '#15803d' : '#b91c1c' }}>
                    {scanResult.success ? 'Attendance Verified & Signed!' : 'Attendance Registration Blocked'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '8.5pt', color: scanResult.success ? '#166534' : '#991b1b', lineHeight: '1.4' }}>
                    {scanResult.message}
                  </p>

                  {scanResult.success && scanResult.trackingCode && (
                    <div style={{ marginTop: '12px', backgroundColor: '#ffffff', padding: '12px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 'bold' }}>
                        Your Official 10-Digit Digital Ticket No.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 'clamp(16pt, 5vw, 20pt)', fontWeight: '900', letterSpacing: '2px', fontFamily: 'monospace', color: '#0f172a', wordBreak: 'break-all' }}>
                          {scanResult.trackingCode}
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          className="cf-btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '8pt', borderRadius: '4px' }}
                        >
                          {copiedCode ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                          <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div style={{ marginTop: '8px', padding: '8px 10px', backgroundColor: '#fefce8', borderRadius: '4px', border: '1px solid #fef08a', fontSize: '7.5pt', color: '#854d0e', fontWeight: '600', lineHeight: '1.35' }}>
                        ACTION REQUIRED: Write this 10-digit number on your <strong>physical Attendance Sheet</strong> and your <strong>Answer Booklet</strong>.
                      </div>

                      {scanResult.record && (
                        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', fontSize: '7.5pt', color: '#475569' }}>
                          <div>Course: <strong>{scanResult.record.courseCode}</strong></div>
                          <div>Category: <strong>{scanResult.record.examCategory?.toUpperCase()}</strong></div>
                          <div>Date: <strong>{scanResult.record.examDate}</strong></div>
                          <div>Time: <strong>{new Date(scanResult.record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setScanResult(null)}
                      className="cf-btn-secondary"
                      style={{ padding: '5px 12px', fontSize: '8pt', borderRadius: '4px' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY DIGITALLY SIGNED ATTENDANCE RECORDS */}
      {activeTab === 'records' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '10pt', fontWeight: 'bold', color: '#1e293b' }}>
                My Verified Exam Attendance
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '8pt', color: '#64748b' }}>
                Cryptographically signed ledger of all examinations verified and attended.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchMyRecords}
              className="cf-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '8pt', borderRadius: '4px' }}
            >
              <RefreshCw size={12} className={loadingRecords ? 'spin-smooth' : ''} />
              Refresh
            </button>
          </div>

          {/* Desktop Table */}
          <div className="da-desktop-table cf-table-container" style={{ width: '100%', overflowX: 'auto', marginBottom: '10px' }}>
            <table className="cf-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Exam Date</th>
                  <th>Course Code & Title</th>
                  <th>Category</th>
                  <th>10-Digit Digital Ticket No.</th>
                  <th>Logged Timestamp</th>
                  <th>Signature Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingRecords ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      Loading verified attendance records...
                    </td>
                  </tr>
                ) : myRecords.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                      No digital attendance records found yet. Use the scanner above on the day of your examination.
                    </td>
                  </tr>
                ) : (
                  myRecords.map((rec, idx) => (
                    <tr key={rec._id || idx}>
                      <td style={{ fontWeight: 'bold' }}>{rec.examDate}</td>
                      <td>
                        <strong>{rec.courseCode}</strong> - {rec.courseTitle || rec.courseCode}
                      </td>
                      <td>
                        {renderCategoryBadge(rec.examCategory)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '9pt', fontWeight: 'bold', color: '#0f172a' }}>
                        {rec.trackingCode}
                      </td>
                      <td style={{ color: '#475569' }}>
                        {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 'bold', fontSize: '7.5pt' }}>
                          <CheckCircle2 size={12} /> Signed
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (Phones <= 680px) */}
          <div className="da-mobile-cards">
            {loadingRecords ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '8.5pt' }}>
                Loading verified attendance records...
              </div>
            ) : myRecords.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '8.5pt', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                No digital attendance records found yet. Use the scanner on your exam day.
              </div>
            ) : (
              myRecords.map((rec, idx) => (
                <div key={rec._id || idx} style={{ padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9pt', color: '#0f172a' }}>
                      {rec.courseCode}
                    </span>
                    {renderCategoryBadge(rec.examCategory)}
                  </div>
                  <div style={{ fontSize: '8pt', color: '#475569', marginBottom: '8px' }}>
                    {rec.courseTitle || rec.courseCode}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase' }}>Ticket No.</div>
                      <div style={{ fontSize: '10.5pt', fontWeight: 'bold', fontFamily: 'monospace', color: '#0f172a' }}>
                        {rec.trackingCode}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#64748b' }}>
                      <div>{rec.examDate}</div>
                      <div>{new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#16a34a', fontWeight: 'bold', fontSize: '7.5pt' }}>
                      <CheckCircle2 size={12} /> Signed
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EXAMINATION TIMETABLE SCHEDULE */}
      {activeTab === 'schedule' && (
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '10pt', fontWeight: 'bold', color: '#1e293b' }}>
            Official Examination Schedule
          </h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '8pt', color: '#64748b' }}>
            Schedule of courses, categories, timings, and reporting instructions.
          </p>

          {/* Desktop Table */}
          <div className="da-desktop-table cf-table-container" style={{ width: '100%', overflowX: 'auto', marginBottom: '10px' }}>
            <table className="cf-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Category</th>
                  <th>Exam Date</th>
                  <th>Time Duration Slot</th>
                  <th>Report Time</th>
                  <th>Mode</th>
                  <th>Total Marks</th>
                </tr>
              </thead>
              <tbody>
                {timetable.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      No examination schedule slots released yet.
                    </td>
                  </tr>
                ) : (
                  timetable.map((slot, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold' }}>{slot.code}</td>
                      <td>{slot.course}</td>
                      <td>
                        {renderCategoryBadge(slot.category)}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{slot.date}</td>
                      <td>{slot.time}</td>
                      <td style={{ color: '#475569' }}>{slot.reportTime || '30 mins before'}</td>
                      <td>{slot.mode || 'Offline'}</td>
                      <td style={{ fontWeight: 'bold' }}>{slot.marks !== undefined ? slot.marks : 50}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (Phones <= 680px) */}
          <div className="da-mobile-cards">
            {timetable.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '8.5pt', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                No examination schedule slots released yet.
              </div>
            ) : (
              timetable.map((slot, idx) => (
                <div key={idx} style={{ padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9pt', color: '#0f172a' }}>
                      {slot.code}
                    </span>
                    {renderCategoryBadge(slot.category)}
                  </div>
                  <div style={{ fontSize: '8.5pt', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
                    {slot.course}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '7.5pt', backgroundColor: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Date:</span> <strong>{slot.date || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Reporting:</span> <strong>{slot.reportTime || '30 min prior'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Timing:</span> <strong>{slot.time || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Marks:</span> <strong>{slot.marks !== undefined ? slot.marks : 50}</strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
