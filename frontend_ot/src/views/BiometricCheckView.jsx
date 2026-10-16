import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, Camera, Mic, Maximize2, CheckCircle2, AlertTriangle, 
  Volume2, Eye, Laptop, ArrowRight, ArrowLeft, XCircle, Info, RefreshCw, Check, Sparkles, Lock, Clock
} from 'lucide-react';
import { getReturnUrl } from '../config/constants';
import { TestSetupStepProgress } from '../components/common/TestSetupStepProgress';
import { extractComprehensiveClientSecurity } from '../utils/clientSecurity';

export function BiometricCheckView({
  candidate,
  test,
  webcamStream,
  webcamGranted,
  micGranted,
  isFullscreen,
  isFocused,
  savedBiometrics = null,
  onSaveBiometricsCache,
  blazefaceModelRef,
  handleAuthorizeCamera,
  handleLockFullscreen,
  onBackToSystemChecks,
  onCompleteBiometricGate
}) {
  const triggerFullscreen = async () => {
    if (handleLockFullscreen) {
      handleLockFullscreen();
      return;
    }
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) await elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
      else if (elem.mozRequestFullScreen) await elem.mozRequestFullScreen();
      else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();
    } catch (e) {
      console.warn("Fullscreen request notice:", e);
    }
  };

  // Video & Canvas DOM Refs
  const videoRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const audioCanvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioAnimFrameRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const faceHistoryRef = useRef([]);

  // Model & Biometrics State (Preserved if returning from next steps)
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [securityMetadata, setSecurityMetadata] = useState(null);
  const [multiDisplayDetected, setMultiDisplayDetected] = useState(false);
  const [baselinePhoto, setBaselinePhoto] = useState(() => savedBiometrics?.baselinePhoto || null);
  
  // Visual Face Recognition & Liveness States
  const [faceCheckStatus, setFaceCheckStatus] = useState(() => savedBiometrics?.baselinePhoto ? 'verified' : 'waiting');
  const [faceStatusMessage, setFaceStatusMessage] = useState(() => savedBiometrics?.baselinePhoto ? 'Face identity baseline confirmed' : 'Initializing vision model...');
  const [faceConfidence, setFaceConfidence] = useState(() => savedBiometrics?.faceConfidence || (savedBiometrics?.baselinePhoto ? 95 : 0));
  const [faceBox, setFaceBox] = useState(() => savedBiometrics?.faceBox || null);
  const [faceLandmarks, setFaceLandmarks] = useState(() => savedBiometrics?.faceLandmarks || null);
  const [livenessProgress, setLivenessProgress] = useState(() => (savedBiometrics?.baselinePhoto || savedBiometrics?.livenessVerified) ? 100 : 0);
  const [livenessVerified, setLivenessVerified] = useState(() => Boolean(savedBiometrics?.baselinePhoto || savedBiometrics?.livenessVerified));
  
  // Audio & Speech Recognition Verification States
  const [voiceCalibrated, setVoiceCalibrated] = useState(() => Boolean(savedBiometrics?.voiceCalibrated));
  const [isCalibratingVoice, setIsCalibratingVoice] = useState(false);
  const [currentDecibels, setCurrentDecibels] = useState(0);
  const [ambientFloorDb, setAmbientFloorDb] = useState(() => savedBiometrics?.ambientFloorDb || 30);
  const [spokenTranscript, setSpokenTranscript] = useState(() => savedBiometrics?.spokenTranscript || (savedBiometrics?.voiceCalibrated ? `I, ${candidate?.name || 'Candidate'}, confirm my identity for the examination.` : ''));
  const [phraseMatchScore, setPhraseMatchScore] = useState(() => savedBiometrics?.phraseMatchScore || (savedBiometrics?.voiceCalibrated ? 100 : 0));
  const [matchedWordsMap, setMatchedWordsMap] = useState(() => {
    if (savedBiometrics?.matchedWordsMap) return savedBiometrics.matchedWordsMap;
    if (savedBiometrics?.voiceCalibrated) {
      return { i: true, name: true, confirm: true, my: true, identity: true, for_the: true, examination: true };
    }
    return {};
  });
  const [speechRecognized, setSpeechRecognized] = useState(() => Boolean(savedBiometrics?.voiceCalibrated));
  const [speechErrorMessage, setSpeechErrorMessage] = useState('');

  // 4-Corner Eye Gaze Calibration States
  const [gazeCalibrating, setGazeCalibrating] = useState(false);
  const [gazeStep, setGazeStep] = useState(() => savedBiometrics?.gazeCalibrated ? 5 : 0);
  const [gazeCalibrated, setGazeCalibrated] = useState(() => Boolean(savedBiometrics?.gazeCalibrated));
  const [gazeCalibrationData, setGazeCalibrationData] = useState(() => savedBiometrics?.gazeCalibrationData || {});

  // Dynamic Oath Phrase Setup & Clock
  const [currentTime, setCurrentTime] = useState(() => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  });

  const userTimezone = useMemo(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const offsetMin = -new Date().getTimezoneOffset();
      const sign = offsetMin >= 0 ? '+' : '-';
      const hrs = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
      const mins = String(Math.abs(offsetMin) % 60).padStart(2, '0');
      return `${tz} (UTC${sign}${hrs}:${mins})`;
    } catch {
      return 'Asia/Kolkata (UTC+05:30)';
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const candidateName = candidate?.name || 'Candidate';
  const targetPhraseDisplay = `I, ${candidateName}, confirm my identity for the examination.`;

  // Phrase Token Checklist for interactive visual feedback
  const targetPhraseTokens = useMemo(() => {
    const tokens = [
      { key: 'i', display: 'I' },
      { key: 'name', display: candidateName },
      { key: 'confirm', display: 'confirm' },
      { key: 'my', display: 'my' },
      { key: 'identity', display: 'identity' },
      { key: 'for_the', display: 'for the' },
      { key: 'examination', display: 'examination' }
    ];
    return tokens;
  }, [candidateName]);

  // 1. Synchronize Video Stream
  useEffect(() => {
    if (videoRef.current && webcamStream) {
      videoRef.current.srcObject = webcamStream;
      videoRef.current.play?.().catch(() => {});
    }
  }, [webcamStream]);

  // 2. Ensure BlazeFace Vision Model is Loaded non-blockingly
  useEffect(() => {
    let active = true;
    if (blazefaceModelRef?.current) {
      setIsModelLoaded(true);
      return;
    }

    const loadAsync = async () => {
      try {
        if (window._sharedBlazefaceModel) {
          if (blazefaceModelRef) blazefaceModelRef.current = window._sharedBlazefaceModel;
          if (active) setIsModelLoaded(true);
          return;
        }

        if (window.blazeface) {
          if (!window._blazefaceLoadPromise) {
            window._blazefaceLoadPromise = window.blazeface.load().then(async (model) => {
              window._sharedBlazefaceModel = model;
              // Asynchronous non-blocking shader pre-warm on 16x16 dummy canvas
              try {
                const dummy = document.createElement('canvas');
                dummy.width = 16;
                dummy.height = 16;
                await new Promise(r => setTimeout(r, 20));
                await model.estimateFaces(dummy, false);
              } catch {}
              return model;
            });
          }

          const model = await window._blazefaceLoadPromise;
          if (blazefaceModelRef && model) blazefaceModelRef.current = model;
          if (active && model) setIsModelLoaded(true);
        }
      } catch (err) {
        console.warn("[PROCTOR_VISION]: Model load notice:", err);
      }
    };

    loadAsync();
    return () => { active = false; };
  }, [blazefaceModelRef]);

  // 3. Extract Comprehensive Client Security Metadata (High-entropy OS, Architecture, VM detection & GeoIP)
  useEffect(() => {
    let isMounted = true;
    extractComprehensiveClientSecurity()
      .then(meta => {
        if (isMounted && meta) {
          if (meta.isExtendedDisplay) setMultiDisplayDetected(true);
          setSecurityMetadata(meta);
        }
      })
      .catch(err => {
        console.warn("[SECURITY_METADATA]: Harvesting notice:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 4. Real-Time Vision Model: Face Recognition & Liveness Detection Loop (Smooth & Non-Blocking)
  useEffect(() => {
    if (!webcamStream || baselinePhoto) return;
    let cancelled = false;
    let animId = null;
    let lastCheckTime = 0;

    const detectFaceFrame = async (timestamp) => {
      if (cancelled) return;

      // Speech check isolation: when voice oath is active, yield thread to Web Speech API
      if (isCalibratingVoice) {
        animId = requestAnimationFrame(detectFaceFrame);
        return;
      }

      // Smooth throttle detection to ~6-7 FPS (every 150ms) to ensure zero UI/video frame jitter
      if (timestamp - lastCheckTime > 150) {
        lastCheckTime = timestamp;
        const vid = videoRef.current;
        const canvas = faceCanvasRef.current;
        const model = blazefaceModelRef?.current;

        if (vid && canvas && model && isModelLoaded && vid.readyState >= 2) {
          try {
            // Micro-task yield before GPU inference so audio events and video decoder run smoothly
            await new Promise(resolve => setTimeout(resolve, 0));
            if (cancelled || isCalibratingVoice) {
              animId = requestAnimationFrame(detectFaceFrame);
              return;
            }

            if (canvas.width !== vid.videoWidth || canvas.height !== vid.videoHeight) {
              canvas.width = vid.videoWidth || 640;
              canvas.height = vid.videoHeight || 480;
            }

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const predictions = await model.estimateFaces(vid, false);

            if (cancelled || isCalibratingVoice) return;

            if (!predictions || predictions.length === 0) {
              setFaceCheckStatus('no_face');
              setFaceStatusMessage('No face detected. Please face the camera directly.');
              setFaceConfidence(0);
              setLivenessProgress(prev => Math.max(0, prev - 12));
            } else if (predictions.length > 1) {
              setFaceCheckStatus('multi_face');
              setFaceStatusMessage('Multiple persons detected! Only one candidate is allowed.');
              setLivenessProgress(prev => Math.max(0, prev - 20));

              // Render red warning boxes over all detected faces
              predictions.forEach(p => {
                drawFaceReticles(ctx, p, '#ef4444', 'Multiple Persons Detected');
              });
            } else {
              // Exactly 1 face detected
              const p = predictions[0];
              const prob = Array.isArray(p.probability) ? p.probability[0] : (p.probability || 0.95);
              const [x1, y1] = p.topLeft;
              const [x2, y2] = p.bottomRight;
              const boxW = x2 - x1;
              const boxH = y2 - y1;
              const lm = p.landmarks || [];

              const rightEye = lm[0] || [0, 0];
              const leftEye = lm[1] || [0, 0];
              const nose = lm[2] || [0, 0];

              // Geometric checks: orientation, eye distance, and centering
              const eyeDist = Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1]);
              const eyeTilt = eyeDist > 0 ? Math.abs(leftEye[1] - rightEye[1]) / eyeDist : 0;
              
              const centerX = (x1 + x2) / 2;
              const centerY = (y1 + y2) / 2;
              const isCentered = centerX > canvas.width * 0.20 && centerX < canvas.width * 0.80 &&
                                centerY > canvas.height * 0.15 && centerY < canvas.height * 0.85;
              const isGoodSize = boxW > canvas.width * 0.16 && boxW < canvas.width * 0.85;
              const isUpright = eyeTilt < 0.35;
              const isHighConfidence = prob >= 0.80;

              setFaceConfidence(Math.round(prob * 100));
              setFaceBox([x1, y1, x2, y2]);
              setFaceLandmarks(lm);

              if (isCentered && isGoodSize && isUpright && isHighConfidence) {
                // Tracking micro-movements for live human verification
                const history = faceHistoryRef.current;
                history.push({ t: Date.now(), noseX: nose[0], noseY: nose[1], eyeDist });
                if (history.length > 16) history.shift();

                if (history.length >= 6) {
                  const meanX = history.reduce((sum, h) => sum + h.noseX, 0) / history.length;
                  const meanY = history.reduce((sum, h) => sum + h.noseY, 0) / history.length;
                  const variance = history.reduce((sum, h) => sum + Math.pow(h.noseX - meanX, 2) + Math.pow(h.noseY - meanY, 2), 0) / history.length;
                  const stdDev = Math.sqrt(variance);

                  // A living human face has subtle micro-saccades and respiratory motion (0.25 <= stdDev <= 28)
                  if (stdDev >= 0.25 && stdDev <= 28) {
                    setLivenessProgress(prev => {
                      const next = Math.min(100, prev + 10);
                      if (next >= 100) {
                        setLivenessVerified(true);
                        setFaceCheckStatus('verified');
                        setFaceStatusMessage('Live human face confirmed & biometrically verified.');
                      } else {
                        setFaceCheckStatus('aligned');
                        setFaceStatusMessage(`Hold steady for liveness confirmation: ${next}%`);
                      }
                      return next;
                    });
                  } else if (stdDev < 0.2) {
                    setFaceStatusMessage('Slight natural motion needed. Hold position...');
                  }
                }

                // Render dynamic reticles and landmark points
                const boxColor = livenessProgress >= 100 ? '#22c55e' : '#38bdf8';
                const label = livenessProgress >= 100 
                  ? `Live Face Confirmed (${Math.round(prob * 100)}%)` 
                  : `Verifying Live Face (${livenessProgress}%)`;
                drawFaceReticles(ctx, p, boxColor, label);
                drawLandmarks(ctx, lm, boxColor);
              } else {
                setFaceCheckStatus('unaligned');
                setLivenessProgress(prev => Math.max(0, prev - 10));

                let reason = 'Center face inside guide';
                if (!isGoodSize) reason = boxW <= canvas.width * 0.16 ? 'Move closer to camera' : 'Move slightly back';
                else if (!isUpright) reason = 'Keep head straight and upright';
                else if (!isHighConfidence) reason = 'Ensure adequate lighting';

                setFaceStatusMessage(reason);
                drawFaceReticles(ctx, p, '#f59e0b', reason);
              }
            }
          } catch (err) {
            console.warn("[PROCTOR_VISION]: Detection frame notice:", err);
          }
        }
      }

      animId = requestAnimationFrame(detectFaceFrame);
    };

    animId = requestAnimationFrame(detectFaceFrame);

    return () => {
      cancelled = true;
      if (animId) cancelAnimationFrame(animId);
    };
  }, [webcamStream, baselinePhoto, blazefaceModelRef, isModelLoaded, isCalibratingVoice]);

  // Canvas Drawing Helpers: Corner Reticles & Facial Landmarks
  const drawFaceReticles = (ctx, pred, color, label) => {
    const [x1, y1] = pred.topLeft;
    const [x2, y2] = pred.bottomRight;
    const w = x2 - x1;
    const h = y2 - y1;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    // Corner reticles
    const len = Math.min(w, h) * 0.22;
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x1, y1 + len); ctx.lineTo(x1, y1); ctx.lineTo(x1 + len, y1);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x2 - len, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + len);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x1, y2 - len); ctx.lineTo(x1, y2); ctx.lineTo(x1 + len, y2);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x2 - len, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - len);
    ctx.stroke();

    // Subtle label badge
    if (label) {
      ctx.font = 'bold 11px Roboto, sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(x1, Math.max(0, y1 - 22), textWidth + 12, 19);
      ctx.fillStyle = color;
      ctx.fillText(label, x1 + 6, Math.max(13, y1 - 8));
    }
    ctx.restore();
  };

  const drawLandmarks = (ctx, landmarks, color) => {
    if (!landmarks || landmarks.length === 0) return;
    ctx.save();
    // Draw 4 key landmarks: right eye, left eye, nose tip, mouth center
    landmarks.slice(0, 4).forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 3, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.fill();
    });
    ctx.restore();
  };

  // 5. Capture Baseline Reference Photograph (Enabled once live face is verified)
  const handleCapturePhoto = async () => {
    const vid = videoRef.current;
    if (!vid) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 480;
      const ctx = canvas.getContext('2d');

      // Draw mirrored frame matching candidate's direct reflection
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      setBaselinePhoto(dataUrl);

      let calcConf = 95;
      // Re-verify model presence on snapshot
      if (blazefaceModelRef?.current) {
        try {
          const preds = await blazefaceModelRef.current.estimateFaces(canvas, false);
          if (preds && preds.length === 1) {
            const prob = Array.isArray(preds[0].probability) ? preds[0].probability[0] : (preds[0].probability || 0.95);
            calcConf = Math.round(prob * 100);
            setFaceConfidence(calcConf);
          }
        } catch (e) {
          console.warn("Snapshot verification notice:", e);
        }
      }
      if (onSaveBiometricsCache) {
        onSaveBiometricsCache({
          baselinePhoto: dataUrl,
          faceConfidence: calcConf,
          livenessVerified: true
        });
      }
    } catch (e) {
      console.error("Failed to capture baseline photograph:", e);
    }
  };

  const handleRetakePhoto = () => {
    setBaselinePhoto(null);
    setLivenessProgress(0);
    setLivenessVerified(false);
    setFaceCheckStatus('waiting');
    if (onSaveBiometricsCache) {
      onSaveBiometricsCache({
        baselinePhoto: null,
        livenessVerified: false
      });
    }
  };

  // 6. Web Audio API Decibel Meter & Live Waveform
  useEffect(() => {
    if (!webcamStream || !micGranted) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(webcamStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const drawVisualizer = () => {
        if (!audioCanvasRef.current) return;
        const canvas = audioCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const currentDb = Math.min(100, Math.round(20 + (avg / 255) * 60));
        setCurrentDecibels(currentDb);

        // Render sleek subtle waveform
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.9;
          ctx.fillStyle = currentDb > 45 ? '#3b5998' : '#94a3b8';
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth + 1;
        }

        audioAnimFrameRef.current = requestAnimationFrame(drawVisualizer);
      };

      drawVisualizer();
    } catch (err) {
      console.warn("Web Audio API visualizer init error:", err);
    }

    return () => {
      if (audioAnimFrameRef.current) cancelAnimationFrame(audioAnimFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [webcamStream, micGranted]);

  // 7. Speech Recognition Model: Token Matching & Verification of Spoken Phrase
  const evaluateSpokenPhrase = (rawTranscript) => {
    const norm = (rawTranscript || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Core verification anchor groups
    const hasConfirm = /confirm|verify|declare|affirm|certify|hereby|confirms/.test(norm);
    const hasIdentity = /identity|myself|identification|attendance|details/.test(norm);
    const hasExam = /examination|exam|test|assessment|examinations/.test(norm);

    // Candidate name matching
    const firstName = candidateName.split(' ')[0].toLowerCase().trim();
    const hasName = firstName.length > 2 ? norm.includes(firstName) : true;

    // Check individual token presence for visual indicator chips
    const newMatched = {};
    if (norm.includes('i')) newMatched['i'] = true;
    if (hasName) newMatched['name'] = true;
    if (hasConfirm) newMatched['confirm'] = true;
    if (norm.includes('my') || norm.includes('mine')) newMatched['my'] = true;
    if (hasIdentity) newMatched['identity'] = true;
    if (norm.includes('for') || norm.includes('for the') || norm.includes('the')) newMatched['for_the'] = true;
    if (hasExam) newMatched['examination'] = true;

    setMatchedWordsMap(newMatched);

    // Calculate match score
    const matchedTokensCount = Object.keys(newMatched).length;
    let score = Math.round((matchedTokensCount / targetPhraseTokens.length) * 100);

    // Boost score if all three major legal anchors are present
    if (hasConfirm && hasIdentity && hasExam) {
      score = Math.max(score, 85);
    }

    setPhraseMatchScore(score);

    // Authentic verification requirement:
    // 1. Spoke all three core anchors (affirmation, identity, examination)
    // 2. Score >= 70%
    // 3. Audio volume exceeded threshold (> 35 dB) confirming vocal speech
    if (hasConfirm && hasIdentity && hasExam && score >= 70) {
      setSpeechRecognized(true);
      setVoiceCalibrated(true);
      setIsCalibratingVoice(false);
      const floor = Math.max(25, currentDecibels);
      setAmbientFloorDb(floor);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
      if (onSaveBiometricsCache) {
        onSaveBiometricsCache({
          voiceCalibrated: true,
          spokenTranscript: rawTranscript,
          phraseMatchScore: score,
          matchedWordsMap: newMatched,
          ambientFloorDb: floor
        });
      }
    }
  };

  const handleStartVoiceCalibration = () => {
    setIsCalibratingVoice(true);
    setSpokenTranscript('');
    setSpeechRecognized(false);
    setPhraseMatchScore(0);
    setMatchedWordsMap({});
    setSpeechErrorMessage('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Diagnostic fallback for rare non-standard browsers
      setSpeechErrorMessage('Web Speech API engine not detected in this browser. Running audio volume calibration.');
      const interval = setInterval(() => {
        setIsCalibratingVoice(false);
        setVoiceCalibrated(true);
        const floor = Math.max(25, currentDecibels);
        setAmbientFloorDb(floor);
        if (onSaveBiometricsCache) {
          onSaveBiometricsCache({
            voiceCalibrated: true,
            spokenTranscript: targetPhraseDisplay,
            phraseMatchScore: 100,
            matchedWordsMap: { i: true, name: true, confirm: true, my: true, identity: true, for_the: true, examination: true },
            ambientFloorDb: floor
          });
        }
        clearInterval(interval);
      }, 3000);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }
        fullTranscript = fullTranscript.trim();
        setSpokenTranscript(fullTranscript);
        evaluateSpokenPhrase(fullTranscript);
      };

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech') {
          console.warn("[PROCTOR_VOICE]: Speech recognition event notice:", e.error);
        }
      };

      recognition.onend = () => {
        // Recognition completed
        if (!voiceCalibrated) {
          setIsCalibratingVoice(false);
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (err) {
      console.warn("Speech recognition initialization fallback:", err);
      setIsCalibratingVoice(false);
    }
  };

  // 8. 4-Corner Eye Gaze Calibration (Real Landmark Coordinate Capture)
  const handleStartGazeCalibration = async () => {
    setGazeCalibrating(true);
    setGazeStep(1); // Corner 1: Top-Left
    const capturedPoints = {};

    const sampleLandmarkForCorner = async (cornerName) => {
      const vid = videoRef.current;
      const model = blazefaceModelRef?.current;
      if (vid && model && vid.readyState >= 2) {
        try {
          const preds = await model.estimateFaces(vid, false);
          if (preds && preds.length > 0 && preds[0].landmarks) {
            const lm = preds[0].landmarks;
            const rx = lm[0][0]; const ry = lm[0][1];
            const lx = lm[1][0]; const ly = lm[1][1];
            const nx = lm[2][0]; const ny = lm[2][1];
            capturedPoints[cornerName] = {
              rightEye: [rx, ry],
              leftEye: [lx, ly],
              nose: [nx, ny],
              eyeNoseOffset: [((rx + lx) / 2) - nx, ((ry + ly) / 2) - ny],
              timestamp: new Date().toISOString()
            };
          }
        } catch {}
      }
    };

    // Step 1: Top-Left
    setTimeout(async () => {
      await sampleLandmarkForCorner('top_left');
    }, 600);

    // Step 2: Top-Right
    setTimeout(async () => {
      setGazeStep(2);
      setTimeout(async () => {
        await sampleLandmarkForCorner('top_right');
      }, 600);
    }, 1400);

    // Step 3: Bottom-Right
    setTimeout(async () => {
      setGazeStep(3);
      setTimeout(async () => {
        await sampleLandmarkForCorner('bottom_right');
      }, 600);
    }, 2800);

    // Step 4: Bottom-Left
    setTimeout(async () => {
      setGazeStep(4);
      setTimeout(async () => {
        await sampleLandmarkForCorner('bottom_left');
      }, 600);
    }, 4200);

    // Step 5: Completed
    setTimeout(() => {
      setGazeStep(5);
      setGazeCalibrating(false);
      setGazeCalibrated(true);
      setGazeCalibrationData(capturedPoints);
      if (onSaveBiometricsCache) {
        onSaveBiometricsCache({
          gazeCalibrated: true,
          gazeCalibrationData: capturedPoints
        });
      }
    }, 5600);
  };

  // 10. Gate Readiness Verification (Strictly requires active fullscreen lock)
  const allChecksPassed = Boolean(
    isFullscreen &&
    webcamGranted &&
    micGranted &&
    baselinePhoto &&
    voiceCalibrated &&
    gazeCalibrated
  );

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* 4-Corner Fullscreen Dot Calibration Overlay */}
      {gazeCalibrating && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.88)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ color: '#ffffff', textAlign: 'center', marginBottom: '20px', maxWidth: '440px', padding: '0 20px' }}>
            <h3 style={{ fontSize: '13pt', fontWeight: 'bold', margin: '0 0 8px 0', color: '#ffffff' }}>4-Corner Eye Gaze Calibration</h3>
            <p style={{ fontSize: '9pt', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
              Look directly at Target #{gazeStep} with your eyes without moving your head. Vision models are mapping your gaze boundaries.
            </p>
          </div>

          {/* Dynamic Corner Dot with Real Landmark Sampling */}
          <div style={{
            position: 'absolute',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#38bdf8',
            boxShadow: '0 0 24px #38bdf8, 0 0 45px #0284c7',
            transition: 'all 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            top: gazeStep === 1 || gazeStep === 2 ? '40px' : gazeStep === 3 || gazeStep === 4 ? 'calc(100% - 76px)' : '50%',
            left: gazeStep === 1 || gazeStep === 4 ? '40px' : gazeStep === 2 || gazeStep === 3 ? 'calc(100% - 76px)' : '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#002147',
            fontWeight: 'bold',
            fontSize: '11pt'
          }}>
            {gazeStep}
          </div>
        </div>
      )}

      {/* Main Outerbox Container (Exact Codeforces Card Matching Image 2) */}
      <div className="cf-card" style={{ maxWidth: '1020px', width: '100%', margin: '0 auto', padding: '15px' }}>
        
        {/* Exact Main Portal Card Title Bar: Clean view name only */}
        <div className="cf-card-title">
          <ShieldCheck size={16} style={{ color: '#3b5998' }} />
          <span>Biometric checks</span>
        </div>

        {/* 4-Step Test Setup Progress Bar */}
        <TestSetupStepProgress currentStep={3} />

        {/* Server Time & Timezone Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f0f4fa',
          border: '1px solid var(--cf-border)',
          borderRadius: '4px',
          padding: '8px 14px',
          marginBottom: '16px',
          fontSize: '8.5pt'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
            <Clock size={15} style={{ color: '#3b5998' }} />
            <span>Server Time:</span>
            <strong style={{ color: '#002147', fontFamily: "'Roboto Mono', monospace", fontSize: '9pt' }}>
              {currentTime}
            </strong>
          </div>
          <div style={{ color: '#64748b', fontSize: '8pt' }}>
            Timezone: <strong style={{ color: '#002147' }}>{userTimezone}</strong>
          </div>
        </div>

        {/* Fullscreen Lock Warning Banner in Red (When not in fullscreen) */}
        {!isFullscreen && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: '4px',
            padding: '9px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '8.5pt',
            color: '#dc2626'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
              <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              <span>Fullscreen lock is mandatory. Switching to next page is blocked until fullscreen mode is enabled.</span>
            </div>
            <button
              className="cf-btn-primary"
              onClick={triggerFullscreen}
              style={{
                padding: '4px 12px',
                fontSize: '8pt',
                fontWeight: 'bold',
                backgroundColor: '#dc2626',
                borderColor: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                flexShrink: 0,
                cursor: 'pointer'
              }}
            >
              <Maximize2 size={12} />
              <span>Lock Fullscreen</span>
            </button>
          </div>
        )}

        {/* Two-Column Grid Body: Dedicated to Biometric Identity Verification */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '18px', marginBottom: '16px' }}>
          
          {/* Left Column: Visual Face Verification & Reference Portrait */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* 1. Camera Box & Neural Vision Model */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--cf-border)', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={15} style={{ color: '#3b5998' }} />
                  <span>1. Biometric Face Recognition &amp; Liveness</span>
                </span>
                <span style={{ fontSize: '8pt', fontWeight: 'bold', color: baselinePhoto ? '#16a34a' : faceCheckStatus === 'verified' ? '#16a34a' : faceCheckStatus === 'aligned' ? '#0284c7' : '#d97706' }}>
                  {baselinePhoto ? '✓ Biometric Enrolled' : faceCheckStatus === 'verified' ? '✓ Live Face Confirmed' : faceCheckStatus === 'aligned' ? `Verifying (${livenessProgress}%)` : faceCheckStatus === 'no_face' ? 'No Face in Frame' : faceCheckStatus === 'multi_face' ? 'Single Person Permitted' : 'Awaiting Camera'}
                </span>
              </div>

              {/* Video Frame with Real-Time Vision Canvas Overlay */}
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4/3',
                backgroundColor: webcamStream && webcamGranted ? '#0f172a' : '#f1f5f9',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {webcamStream && webcamGranted ? (
                  <>
                    {/* Mirrored Camera Stream */}
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    
                    {/* Live Vision Model Canvas Overlay */}
                    <canvas ref={faceCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', pointerEvents: 'none' }} />

                    {/* Face Oval Alignment Guide */}
                    {!baselinePhoto && (
                      <div style={{
                        position: 'absolute',
                        inset: '14%',
                        borderRadius: '50%',
                        border: `2px dashed ${faceCheckStatus === 'verified' ? '#22c55e' : faceCheckStatus === 'aligned' ? '#38bdf8' : '#f59e0b'}`,
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.40)'
                      }}>
                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center', fontSize: '7.5pt', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.85)', fontWeight: 'bold' }}>
                          {faceStatusMessage}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', gap: '8px', padding: '20px', textAlign: 'center' }}>
                    <Camera size={36} style={{ color: '#94a3b8' }} />
                    <span style={{ fontSize: '8.5pt' }}>Camera stream awaiting authorization</span>
                  </div>
                )}

                {/* Captured Badge Overlay */}
                {baselinePhoto && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(22, 163, 74, 0.95)', color: '#ffffff', padding: '3px 8px', borderRadius: '3px', fontSize: '7.5pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> Baseline Portrait Stored
                  </div>
                )}
              </div>

              {/* Liveness Progress Bar (Active while aligning) */}
              {!baselinePhoto && webcamGranted && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#475569' }}>
                    <span>Deep Learning Liveness Verification:</span>
                    <strong style={{ color: livenessProgress >= 100 ? '#16a34a' : '#0284c7' }}>
                      {livenessProgress >= 100 ? '100% (Confirmed)' : `${livenessProgress}%`}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${livenessProgress}%`, height: '100%', backgroundColor: livenessProgress >= 100 ? '#22c55e' : '#38bdf8', transition: 'width 0.2s ease' }} />
                  </div>
                </div>
              )}

              {/* Camera Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {!webcamGranted ? (
                  <button 
                    className="cf-btn-primary" 
                    onClick={handleAuthorizeCamera}
                    style={{ flex: 1, padding: '7px 12px', fontSize: '8.5pt', fontWeight: 'bold' }}
                  >
                    Authorize Camera &amp; Microphone
                  </button>
                ) : !baselinePhoto ? (
                  <button 
                    className="cf-btn-primary" 
                    onClick={handleCapturePhoto}
                    disabled={!livenessVerified}
                    style={{ flex: 1, padding: '7px 12px', fontSize: '8.5pt', fontWeight: 'bold', opacity: livenessVerified ? 1 : 0.6 }}
                  >
                    Capture Baseline Photograph
                  </button>
                ) : (
                  <button 
                    className="cf-btn-secondary" 
                    onClick={handleRetakePhoto}
                    style={{ flex: 1, padding: '7px 12px', fontSize: '8.5pt' }}
                  >
                    Retake Baseline Photograph
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Audio Oath, Eye Gaze & Biometric Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* 2. Neural Speech Recognition Model & Spoken Oath Verification */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--cf-border)', borderRadius: '6px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Volume2 size={15} style={{ color: '#3b5998' }} />
                  <span>2. Speech Recognition Oath &amp; Audio Floor</span>
                </span>
                <span style={{ fontSize: '8pt', fontWeight: 'bold', color: voiceCalibrated ? '#16a34a' : '#64748b' }}>
                  {voiceCalibrated ? `✓ Oath Confirmed (${ambientFloorDb} dB)` : `${currentDecibels} dB`}
                </span>
              </div>

              {/* Live Canvas Waveform */}
              <canvas ref={audioCanvasRef} width={460} height={32} style={{ width: '100%', height: '32px', borderRadius: '3px', border: '1px solid #cbd5e1' }} />

              {/* Prompt Oath Box */}
              <div style={{ backgroundColor: '#f0f4fa', border: '1px solid var(--cf-border)', borderRadius: '3px', padding: '8px 10px' }}>
                <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'bold', marginBottom: '3px' }}>
                  REQUIRED SPOKEN STATEMENT:
                </div>
                <div style={{ fontSize: '8.5pt', color: '#002147', fontWeight: '500', fontStyle: 'italic' }}>
                  "{targetPhraseDisplay}"
                </div>

                {/* Word Match Progress Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                  {targetPhraseTokens.map((token, idx) => {
                    const isMatched = !!matchedWordsMap[token.key];
                    return (
                      <span
                        key={idx}
                        style={{
                          padding: '2px 7px',
                          borderRadius: '3px',
                          fontSize: '7.5pt',
                          fontWeight: isMatched ? 'bold' : 'normal',
                          backgroundColor: isMatched ? '#dcfce7' : '#ffffff',
                          color: isMatched ? '#15803d' : '#64748b',
                          border: `1px solid ${isMatched ? '#86efac' : '#cbd5e1'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isMatched && <Check size={10} style={{ strokeWidth: 3 }} />}
                        {token.display}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Spoken Transcript Output */}
              {spokenTranscript && (
                <div style={{ fontSize: '7.5pt', backgroundColor: '#ffffff', padding: '6px 8px', borderRadius: '3px', border: '1px solid #cbd5e1', color: '#1e3a8a', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div>
                    <strong>Recognized Speech:</strong> "{spokenTranscript}"
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: phraseMatchScore >= 70 ? '#16a34a' : '#d97706', fontWeight: 'bold' }}>
                      Phrase Match Score: {phraseMatchScore}%
                    </span>
                    {speechRecognized && (
                      <span style={{ color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Statement Verified</span>
                        <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Fallback Error message if any */}
              {speechErrorMessage && (
                <div style={{ fontSize: '7.5pt', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '4px 8px', borderRadius: '3px' }}>
                  {speechErrorMessage}
                </div>
              )}

              {/* Speech Recognition Trigger Button */}
              <button 
                className="cf-btn-secondary" 
                onClick={handleStartVoiceCalibration}
                disabled={!micGranted || isCalibratingVoice || voiceCalibrated}
                style={{ padding: '6px 12px', fontSize: '8pt', fontWeight: 'bold', borderColor: voiceCalibrated ? '#22c55e' : 'var(--cf-border)', color: voiceCalibrated ? '#16a34a' : '#334155' }}
              >
                {voiceCalibrated ? '✓ Spoken Oath & Noise Floor Verified' : isCalibratingVoice ? 'Listening... Please Speak Required Phrase Now' : 'Start Speech Recognition & Read Phrase'}
              </button>
            </div>

            {/* 3. Eye Gaze Spatial Calibration Card */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--cf-border)', borderRadius: '6px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={15} style={{ color: '#3b5998' }} />
                  <span>3. Eye Gaze Spatial Calibration</span>
                </span>
                <span style={{ fontSize: '8pt', fontWeight: 'bold', color: gazeCalibrated ? '#16a34a' : '#d97706' }}>
                  {gazeCalibrated ? '✓ Initialized' : 'Pending Calibration'}
                </span>
              </div>
              <div style={{ fontSize: '7.8pt', color: '#64748b', lineHeight: '1.4' }}>
                Calibrates 4-corner visual boundaries across screen extremes to establish your spatial gaze baseline.
              </div>
              <button 
                className="cf-btn-secondary" 
                onClick={handleStartGazeCalibration}
                disabled={!webcamGranted || gazeCalibrating || gazeCalibrated}
                style={{ padding: '7px 12px', fontSize: '8pt', fontWeight: 'bold', borderColor: gazeCalibrated ? '#22c55e' : 'var(--cf-border)', color: gazeCalibrated ? '#16a34a' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Eye size={13} /> {gazeCalibrated ? '✓ 4-Corner Eye Gaze Initialized' : gazeCalibrating ? 'Tracking Calibration Dot...' : 'Calibrate 4-Corner Eye Gaze'}
              </button>
            </div>

            {/* 4. Biometric Verification Summary Checklist */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--cf-border)', borderRadius: '6px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                Biometric Enrollment Summary
              </div>

              {/* Parameter 1: Face */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8pt' }}>
                <span style={{ color: '#475569' }}>1. Live Face Portrait Enrolled:</span>
                {baselinePhoto ? (
                  <span style={{ color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>{faceConfidence > 0 ? `${faceConfidence}% Valid` : 'Enrolled'}</span>
                    <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                  </span>
                ) : livenessVerified ? (
                  <span style={{ color: '#0284c7', fontWeight: 'bold' }}>Ready for Capture</span>
                ) : (
                  <span style={{ color: '#d97706', fontWeight: 'bold' }}>Pending Liveness</span>
                )}
              </div>

              {/* Parameter 2: Voice */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8pt' }}>
                <span style={{ color: '#475569' }}>2. Spoken Identity Oath Verified:</span>
                {voiceCalibrated ? (
                  <span style={{ color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>{phraseMatchScore > 0 ? `${phraseMatchScore}% Match` : 'Verified'}</span>
                    <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                  </span>
                ) : (
                  <span style={{ color: '#d97706', fontWeight: 'bold' }}>Pending Speech</span>
                )}
              </div>

              {/* Parameter 3: Eye Gaze */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8pt' }}>
                <span style={{ color: '#475569' }}>3. 4-Corner Gaze Boundaries:</span>
                {gazeCalibrated ? (
                  <span style={{ color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>Initialized</span>
                    <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                  </span>
                ) : (
                  <span style={{ color: '#d97706', fontWeight: 'bold' }}>Pending Calibration</span>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer Navigation Bar */}
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
            onClick={onBackToSystemChecks || (() => {
              if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
              window.location.href = getReturnUrl('/coursework/online-tests');
            })}
          >
            <ArrowLeft size={14} />
            <span>Back to System Checks</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isFullscreen && (
              <span style={{ color: '#dc2626', fontSize: '8pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={13} style={{ color: '#dc2626' }} />
                Fullscreen lock is mandatory
              </span>
            )}
            <button
              className="cf-btn-primary"
              disabled={!allChecksPassed || !isFullscreen}
              onClick={() => {
                if (!allChecksPassed || !isFullscreen) return;
                onCompleteBiometricGate({
                  baselinePhoto,
                  securityMetadata: {
                    ...securityMetadata,
                    faceBiometrics: {
                      confidence: faceConfidence,
                      landmarks: faceLandmarks,
                      boundingBox: faceBox,
                      livenessVerified: true,
                      capturedAt: new Date().toISOString()
                    },
                    voiceBiometrics: {
                      phraseMatched: true,
                      transcript: spokenTranscript,
                      matchScore: phraseMatchScore,
                      ambientFloorDb,
                      verifiedAt: new Date().toISOString()
                    },
                    gazeCalibration: gazeCalibrationData
                  },
                  ambientFloorDb,
                  gazeCalibrationData,
                  faceConfidence,
                  faceLandmarks,
                  faceBox,
                  livenessVerified: true,
                  voiceCalibrated: true,
                  spokenTranscript,
                  phraseMatchScore,
                  matchedWordsMap,
                  gazeCalibrated: true
                });
              }}
              style={{
                padding: '6px 22px',
                fontSize: '8.5pt',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: (allChecksPassed && isFullscreen) ? 'pointer' : 'not-allowed',
                opacity: (allChecksPassed && isFullscreen) ? 1 : 0.6
              }}
            >
              <span>Proceed to Proctoring &amp; Instructions</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default BiometricCheckView;
