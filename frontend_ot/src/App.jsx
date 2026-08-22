import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, Camera, Mic, Maximize, AlertTriangle, CheckSquare, Info, Award, Loader2, ArrowRight, Play,
  Check, X, Lock, Eye, Clock
} from 'lucide-react';
import Editor from '@monaco-editor/react';

const API_BASE = import.meta.env.VITE_API_BASE || (() => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.') || 
                  window.location.hostname.startsWith('10.') || 
                  window.location.hostname.startsWith('172.');
  return isLocal 
    ? `http://127.0.0.1:5000/api` 
    : `${window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')}/api`;
})();

const DEFAULT_TEMPLATES = {
  c: ``,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your C++ code here\n    return 0;\n}`,
  python: ``,
  java: ``
};

// Helper component to render KaTeX math expressions + basic bold/italics/code markdown
const RichText = React.memo(function RichText({ text, style, className }) {
  const containerRef = useRef(null);

  const formatText = (raw) => {
    if (!raw) return '';

    const mathBlocks = [];
    let formatted = raw;

    let placeholderIndex = 0;

    // Temporarily extract double-dollar display math blocks
    formatted = formatted.replace(/\$\$(.*?)\$\$/gs, (match) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: match });
      return placeholder;
    });

    // Temporarily extract single-dollar inline math blocks
    formatted = formatted.replace(/\$(.*?)\$/g, (match) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: match });
      return placeholder;
    });

    // Escape raw text sections for safety
    formatted = formatted
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Markdown conversion rules
    formatted = formatted.replace(/\n/g, '<br />');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code style="font-family: monospace; background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 90%;">$1</code>');

    // Restore original LaTeX formulas back inside placeholders
    mathBlocks.forEach(({ placeholder, content }) => {
      formatted = formatted.replace(placeholder, content);
    });

    return formatted;
  };

  useEffect(() => {
    let active = true;
    const renderMath = () => {
      if (!active) return;
      if (containerRef.current && window.renderMathInElement) {
        try {
          window.renderMathInElement(containerRef.current, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
          });
        } catch (err) {
          console.error("KaTeX auto-render failed:", err);
        }
      } else if (!window.renderMathInElement) {
        setTimeout(renderMath, 100);
      }
    };

    renderMath();
    return () => {
      active = false;
    };
  }, [text]);

  return (
    <div
      ref={containerRef}
      style={style}
      className={className}
      dangerouslySetInnerHTML={{ __html: formatText(text) }}
    />
  );
}, (prevProps, nextProps) => {
  if (prevProps.text !== nextProps.text) return false;
  if (prevProps.className !== nextProps.className) return false;
  const s1 = prevProps.style || {};
  const s2 = nextProps.style || {};
  const keys1 = Object.keys(s1);
  const keys2 = Object.keys(s2);
  if (keys1.length !== keys2.length) return false;
  for (let key of keys1) {
    if (s1[key] !== s2[key]) return false;
  }
  return true;
});

// Low-opacity, repeating, rotated candidate email watermark overlay
function CandidateWatermark({ email }) {
  if (!email) return null;
  
  // We can repeat the email in a grid pattern
  const repeatedEmails = Array(12).fill(email);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      userSelect: 'none',
      overflow: 'hidden',
      zIndex: 10,
      opacity: 0.05,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(4, 1fr)',
      gap: '40px 20px',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      {repeatedEmails.map((text, idx) => (
        <div key={idx} style={{
          transform: 'rotate(-25deg)',
          fontSize: '10pt',
          fontWeight: 'bold',
          color: '#000000',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          alignSelf: 'center'
        }}>
          {text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifyError, setVerifyError] = useState('');
  
  // Authenticated states
  const [candidate, setCandidate] = useState(null);
  const [test, setTest] = useState(null);
  const [submission, setSubmission] = useState(null);

  // Flow views: verify_login, lobby_loading, guidelines_setup, active_exam, finished
  const [flow, setFlow] = useState('verify_login'); 
  const [lobbyMessage, setLobbyMessage] = useState('');

  // Proctoring setup calibration states
  const [webcamGranted, setWebcamGranted] = useState(false);
  const [webcamStream, setWebcamStream] = useState(null);
  const [micGranted, setMicGranted] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [consentChecked, setConsentChecked] = useState(false);

  // Active Exam states
  const [examAnswers, setExamAnswers] = useState([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [draftMCQ, setDraftMCQ] = useState(null);
  const [draftCode, setDraftCode] = useState('');
  const [draftLanguage, setDraftLanguage] = useState('cpp');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [draftJs, setDraftJs] = useState('');
  const [webActiveTab, setWebActiveTab] = useState('html'); // 'html' | 'css' | 'js'
  const [webConsoleLogs, setWebConsoleLogs] = useState([]); // Console output array
  const [examTimeLeft, setExamTimeLeft] = useState(0);
  const [proctoringWarnings, setProctoringWarnings] = useState({ fullscreenExits: 0, tabSwitches: 0 });
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runResults, setRunResults] = useState(null);
  const [compileError, setCompileError] = useState(null);
  const [consoleTab, setConsoleTab] = useState('testcase'); // 'testcase' or 'result'

  // Custom Modal dialog system (replaces browser alert/confirm to prevent fullscreen loss)
  const [customModal, setCustomModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    onConfirm: null,
    isAlert: false
  });

  // Finished flow step (1: Test Submitted (5s), 2: Redirecting to candidate dashboard (2s))
  const [finishedStep, setFinishedStep] = useState(1);

  // Auto-kickout timer when verifyError is set (unauthorized view)
  const [kickoutCount, setKickoutCount] = useState(5);

  // DOM Refs
  const calibVideoRef = useRef(null);
  const examVideoRef = useRef(null);

  // Computed setup condition
  const setupReady = webcamGranted && micGranted && isFullscreen && isFocused;

  // Heartbeat ping loop to keep Render backend awake
  useEffect(() => {
    const pingBackend = async () => {
      try {
        await fetch(`${API_BASE}/health`);
      } catch (err) {
        console.warn("Backend heartbeat ping failed:", err);
      }
    };
    pingBackend();
    const interval = setInterval(pingBackend, 300000);
    return () => clearInterval(interval);
  }, []);

  // Helper trigger methods for custom modal system
  const triggerCustomAlert = (title, message) => {
    setCustomModal({
      isOpen: true,
      title,
      message,
      confirmText: 'Close',
      cancelText: '',
      onConfirm: null,
      isAlert: true
    });
  };

  const triggerCustomConfirm = (title, message, onConfirmCallback) => {
    setCustomModal({
      isOpen: true,
      title,
      message,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: onConfirmCallback,
      isAlert: false
    });
  };

  // 1. Initial Load: Parse token and check connection
  useEffect(() => {
    const parsedToken = new URLSearchParams(window.location.search).get('token');
    if (!parsedToken) {
      setVerifyError("Authorization Token Missing. Direct portal access is prohibited.");
      setLoading(false);
      return;
    }
    setToken(parsedToken);
    verifyExamToken(parsedToken);
  }, []);

  // Auto-kickout timer when verifyError is active
  useEffect(() => {
    if (!verifyError) return;
    
    const timer = setInterval(() => {
      setKickoutCount(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || (
            window.location.origin.includes('localhost')
              ? 'http://localhost:5173/'
              : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
          );
          window.location.href = dashboardUrl;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [verifyError]);

  // Auto-redirect timer when flow === 'finished' (keeps fullscreen until redirection)
  useEffect(() => {
    if (flow !== 'finished') return;
    
    const t1 = setTimeout(() => {
      setFinishedStep(2);
    }, 5000);

    const t2 = setTimeout(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.warn(err));
      }
      const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || (
        window.location.origin.includes('localhost')
          ? 'http://localhost:5173/'
          : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
      );
      window.location.href = dashboardUrl;
    }, 7000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [flow]);

  const verifyExamToken = async (tokenStr) => {
    try {
      const res = await fetch(`${API_BASE}/tests/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenStr })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVerifyError(data.error || "Failed to verify exam security token.");
        setLoading(false);
        return;
      }

      setCandidate(data.candidate);
      setTest(data.test);
      
      // Load pre-existing state or sessionStorage cache
      const storageKey = `bics_draft_${data.test.id}_${data.candidate.id}`;
      const cached = sessionStorage.getItem(storageKey);
      
      let answersArr = [];
      if (cached) {
        try {
          answersArr = JSON.parse(cached);
        } catch (e) {
          console.warn("Failed to parse cached sessionStorage answers:", e);
        }
      }

      const initialAnswers = data.test.questions.map(q => {
        const cachedAns = answersArr.find(a => a.questionId === q.id);
        
        return {
          questionId: q.id,
          type: q.type,
          selectedOptionIndex: cachedAns ? cachedAns.selectedOptionIndex : null,
          submittedCode: cachedAns ? cachedAns.submittedCode : (q.initialTemplate || DEFAULT_TEMPLATES.cpp),
          selectedLanguage: cachedAns ? (cachedAns.selectedLanguage || 'cpp') : 'cpp'
        };
      });

      setExamAnswers(initialAnswers);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setVerifyError("Network Error: Unable to establish secure link to database.");
      setLoading(false);
    }
  };

  // 2. Perform Mock Verification Loader Delay
  const handleLoginToTest = () => {
    setFlow('lobby_loading');
    
    const messages = [
      "Securing network routing tunnel...",
      "Acquiring biometric authorization credentials...",
      "Syncing facial verification hashes...",
      "Activating real-time telemetry logs...",
      "Redirecting candidate to proctoring setup..."
    ];

    let step = 0;
    setLobbyMessage(messages[0]);
    
    const interval = setInterval(() => {
      step++;
      if (step < messages.length) {
        setLobbyMessage(messages[step]);
      } else {
        clearInterval(interval);
        setFlow('guidelines_setup');
      }
    }, 450);
  };

  // 3. Proctoring Permissions Setup (Requests camera and microphone concurrently)
  const handleAuthorizeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
      setWebcamStream(stream);
      setWebcamGranted(true);
      setMicGranted(true); // Grant microphone concurrently as well
      setTimeout(() => {
        if (calibVideoRef.current) {
          calibVideoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error(err);
      triggerCustomAlert("Access Denied", "Proctoring checks require webcam camera and microphone audio access to verify candidate identity.");
    }
  };

  // Refs to track logged warnings and prevent duplicate logs or duplicate auto-submits
  const lastLoggedWarnings = useRef({ fullscreenExits: 0, tabSwitches: 0 });
  const isAutoSubmittedRef = useRef(false);

  // Handle warnings changes (Alerts, logs syncing, and auto-submit)
  useEffect(() => {
    if (flow !== 'active_exam') return;
    
    const { fullscreenExits, tabSwitches } = proctoringWarnings;
    const total = fullscreenExits + tabSwitches;
    if (total === 0) return;

    // Check if we need to auto-submit
    if (total >= 3) {
      if (!isAutoSubmittedRef.current) {
        isAutoSubmittedRef.current = true;
        autoSubmitExam(proctoringWarnings);
      }
      return;
    }

    // Check if we have new warnings to log
    const newFS = fullscreenExits > lastLoggedWarnings.current.fullscreenExits;
    const newTab = tabSwitches > lastLoggedWarnings.current.tabSwitches;

    if (newFS || newTab) {
      setShowWarningModal(true);
      if (newFS) {
        lastLoggedWarnings.current.fullscreenExits = fullscreenExits;
        syncProctoringLogs(proctoringWarnings, 'FULLSCREEN_EXIT', `Candidate exited fullscreen mode. Total warnings: ${total} / 3`);
      } else if (newTab) {
        lastLoggedWarnings.current.tabSwitches = tabSwitches;
        syncProctoringLogs(proctoringWarnings, 'TAB_SWITCH', `Candidate switched tab or lost focus. Total warnings: ${total} / 3`);
      }
    }
  }, [proctoringWarnings, flow]);

  // Check Fullscreen state
  useEffect(() => {
    const onFSChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      
      if (flow === 'active_exam' && !fs) {
        setProctoringWarnings(prev => ({ ...prev, fullscreenExits: prev.fullscreenExits + 1 }));
      }
    };

    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, [flow]);

  // Check Window Focus state
  useEffect(() => {
    const onBlur = () => {
      setIsFocused(false);
      // Wait a fraction of a second to check if the new focused element is the preview iframe!
      setTimeout(() => {
        const active = document.activeElement;
        if (active && (active.id === 'web-sandbox-preview' || active.tagName === 'IFRAME')) {
          // The user clicked inside the visual preview sandbox iframe, this is normal behavior!
          return;
        }
        if (flow === 'active_exam') {
          setProctoringWarnings(prev => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }));
        }
      }, 100);
    };
    
    const onFocus = () => {
      setIsFocused(true);
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [flow]);

  // Start active exam and transition (Calls backend to register submission only when Start Test is clicked)
  const handleStartExam = async () => {
    if (!setupReady || !consentChecked) return;
    
    try {
      const res = await fetch(`${API_BASE}/tests/start/${test.id || test._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: candidate.id || candidate._id,
          candidateName: candidate.name,
          studentId: candidate.studentId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerCustomAlert("Initialization Blocked", data.error || "Failed to initialize secure exam attempt. Re-attempts are prohibited.");
        return;
      }
      
      setSubmission(data.submission);
      setExamTimeLeft(Number(test.duration) * 60);

      // Log initial proctoring events
      logProctoringEvent(data.submission, 'TEST_STARTED', `${candidate.name || 'Candidate'} started the test.`);
      logProctoringEvent(data.submission, 'PROCTORING_ALLOWED', 'Webcam and microphone access allowed.');
      logProctoringEvent(data.submission, 'CONSENT_ACCEPTED', 'Malpractice undertaking consent accepted.');

      setFlow('active_exam');
      setTimeout(() => {
        if (examVideoRef.current && webcamStream) {
          examVideoRef.current.srcObject = webcamStream;
        }
      }, 100);
    } catch (err) {
      console.error(err);
      triggerCustomAlert("Security Sync Error", "Unable to sync starting attempt with database. Verify your connection.");
    }
  };

  // 4. Timer Countdown hook
  useEffect(() => {
    if (flow !== 'active_exam') return;

    const timer = setInterval(() => {
      setExamTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          autoSubmitExam(proctoringWarnings);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [flow, proctoringWarnings]);

  // WebRTC Live stream proctoring signal responder (for Admin Live Monitor)
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;

    let active = true;
    let pc = null;
    const subId = submission.id || submission._id;
    let processedEventIds = new Set();
    let pendingIceCandidates = [];

    const checkAdminSignals = async () => {
      try {
        const res = await fetch(`${API_BASE}/tests/proctoring/signal/${subId}?sender=admin`);
        if (res.ok && active) {
          const data = await res.json();
          const signals = data.signals || [];
          for (let sig of signals) {
            const sigId = sig.id || sig._id || sig.timestamp || sig.data;
            if (processedEventIds.has(sigId)) continue;
            processedEventIds.add(sigId);

            if (sig.type === 'sdp') {
              console.log("WebRTC: Received Admin Connection request.");
              const offer = JSON.parse(sig.data);

              if (pc) {
                pc.close();
              }

              pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
              });

              if (webcamStream) {
                webcamStream.getTracks().forEach(track => {
                  pc.addTrack(track, webcamStream);
                });
              }

              // Send candidate generated local ICE candidates
              pc.onicecandidate = (event) => {
                if (event.candidate) {
                  fetch(`${API_BASE}/tests/proctoring/signal/${subId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sender: 'candidate', type: 'ice', data: JSON.stringify(event.candidate) })
                  }).catch(err => console.error(err));
                }
              };

              await pc.setRemoteDescription(new RTCSessionDescription(offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              // Post SDP answer back
              await fetch(`${API_BASE}/tests/proctoring/signal/${subId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender: 'candidate', type: 'sdp', data: JSON.stringify(answer) })
              });

              // Process any pending ICE candidates received before remote description was set
              for (let cand of pendingIceCandidates) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                  console.warn("WebRTC: Error adding queued ICE candidate:", e);
                }
              }
              pendingIceCandidates = [];
            } else if (sig.type === 'ice') {
              // Add Admin ICE candidate
              const candidate = JSON.parse(sig.data);
              if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                pendingIceCandidates.push(candidate);
              }
            }
          }
        }
      } catch (err) {
        console.error("WebRTC responder error:", err);
      }
    };

    const interval = setInterval(checkAdminSignals, 3000);

    return () => {
      active = false;
      clearInterval(interval);
      if (pc) {
        pc.close();
      }
    };
  }, [flow, submission, webcamStream]);

  // Poll candidate submission status for admin warning and disqualification events
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;

    let active = true;
    const subId = submission.id || submission._id;
    let checkedEventIds = new Set();

    const checkAdminMessages = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/tests/submitted?candidateId=${candidate?.id || candidate?._id}`);
        if (res.ok && active) {
          const subs = await res.json();
          const match = subs.find(s => (s.submission?.id || s.submission?._id) === subId);
          if (match && match.submission) {
            const pLog = match.submission.proctoringLog || {};
            const events = pLog.events || [];
            
            const hasDisqualified = events.some(e => e.type === 'DISQUALIFIED');
            if (hasDisqualified) {
              clearInterval(checkAdminMessages);
              triggerCustomAlert("Malpractice Terminated", "This exam attempt has been terminated remotely by the Administrator due to proctoring/malpractice violations.");
              setFlow('finished');
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.warn(err));
              }
              return;
            }

            events.forEach(e => {
              const eventId = e._id || e.timestamp;
              if (e.type === 'ADMIN_WARNING' && !checkedEventIds.has(eventId)) {
                checkedEventIds.add(eventId);
                triggerCustomAlert("ADMINISTRATOR WARNING", `Message from Proctor: "${e.details}"`);
              }
            });
          }
        }
      } catch (e) {
        console.error("Warning checker error:", e);
      }
    }, 4000);

    return () => {
      active = false;
      clearInterval(checkAdminMessages);
    };
  }, [flow, submission, candidate]);

  // Sync current question values into draft buffers
  useEffect(() => {
    if (test && test.questions?.[selectedQuestionIndex]) {
      const activeAns = examAnswers[selectedQuestionIndex];
      const activeQuest = test.questions[selectedQuestionIndex];
      setDraftMCQ(activeAns?.selectedOptionIndex ?? null);
      setDraftCode(activeAns?.submittedCode ?? '');
      setDraftLanguage(activeAns?.selectedLanguage ?? 'cpp');
      setDraftHtml(activeAns?.submittedHtml ?? (activeQuest.initialHtml || ''));
      setDraftCss(activeAns?.submittedCss ?? (activeQuest.initialCss || ''));
      setDraftJs(activeAns?.submittedJs ?? (activeQuest.initialJs || ''));
      setWebActiveTab('html');
      setWebConsoleLogs([]);
      setRunResults(null);
      setCompileError(null);
    }
  }, [selectedQuestionIndex, test, examAnswers]);

  // Listen for iframe log and error events from HTML/CSS/JS preview
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data && e.data.type === 'IFRAME_CONSOLE_LOG') {
        setWebConsoleLogs(prev => [...prev, { level: e.data.level, text: e.data.text }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Sync draft buffers into global answers list
  const handleSaveAndNext = () => {
    const updated = [...examAnswers];
    updated[selectedQuestionIndex] = {
      ...updated[selectedQuestionIndex],
      selectedOptionIndex: draftMCQ,
      submittedCode: draftCode,
      selectedLanguage: draftLanguage,
      submittedHtml: draftHtml,
      submittedCss: draftCss,
      submittedJs: draftJs
    };
    setExamAnswers(updated);

    const activeQuestion = test.questions?.[selectedQuestionIndex];
    if (activeQuestion) {
      const qNum = selectedQuestionIndex + 1;
      if (activeQuestion.type === 'mcq' && draftMCQ !== null) {
        const optionLetter = String.fromCharCode(65 + draftMCQ);
        logProctoringEvent(submission, 'OPTION_MARKED', `Marked option ${optionLetter} for Q${qNum}.`);
      } else if (activeQuestion.type === 'coding') {
        logProctoringEvent(submission, 'CODE_SAVED', `Saved C++ code for Q${qNum}.`);
      }
    }
    
    // Save to sessionStorage cache
    const storageKey = `bics_draft_${test.id}_${candidate.id}`;
    sessionStorage.setItem(storageKey, JSON.stringify(updated));

    // Auto-save to server draft
    saveServerDraft(updated);

    if (selectedQuestionIndex < (test.questions?.length || 1) - 1) {
      setSelectedQuestionIndex(selectedQuestionIndex + 1);
    }
  };

  // Switch editor language and auto-populate default templates if editor is blank/default
  const handleLanguageChange = (newLang) => {
    setDraftLanguage(newLang);
    
    // Normalize code text values for comparison
    const norm = (str) => (str || '').replace(/\r\n/g, '\n').trim();
    
    const currentNorm = norm(draftCode);
    const cppDefaultNorm = norm(DEFAULT_TEMPLATES.cpp);
    const initialTemplateNorm = norm(test?.questions?.[selectedQuestionIndex]?.initialTemplate);
    
    // Check if the current code is default or empty
    const isCurrentlyDefault = 
      currentNorm === '' || 
      currentNorm === cppDefaultNorm || 
      currentNorm === initialTemplateNorm ||
      Object.values(DEFAULT_TEMPLATES).some(tpl => norm(tpl) === currentNorm);
      
    if (isCurrentlyDefault) {
      setDraftCode(DEFAULT_TEMPLATES[newLang]);
    }
  };

  const saveServerDraft = async (answersList) => {
    try {
      if (!submission) return;
      await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission._id || submission.id,
          answers: answersList,
          proctoringLog: proctoringWarnings,
          status: 'started'
        })
      });
    } catch (e) {
      console.warn("Failed to sync background draft with database:", e);
    }
  };

  const logProctoringEvent = async (subObj, type, details) => {
    try {
      const targetSub = subObj || submission;
      if (!targetSub) return;
      const subId = targetSub.id || targetSub._id;
      await fetch(`${API_BASE}/tests/proctoring/event/${subId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, details })
      });
    } catch (e) {
      console.error("Failed to log proctoring event:", e);
    }
  };

  const handleRunCode = async () => {
    const activeQuestion = test?.questions?.[selectedQuestionIndex];
    if (!activeQuestion) return;
    const allCases = activeQuestion.testCases || [];
    if (allCases.length === 0) {
      triggerCustomAlert("No Test Cases", "This coding question does not have any test cases configured by the administrator.");
      return;
    }

    setIsRunningCode(true);
    setConsoleTab('result');
    setRunResults(null);
    setCompileError(null);
    logProctoringEvent(submission, 'CODE_RUN', `Ran C++ compilation for Q${selectedQuestionIndex + 1}.`);

    try {
      const res = await fetch(`${API_BASE}/tests/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode: draftCode,
          testCases: allCases
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'Compilation Error') {
          setCompileError(data.compileError || "Failed to compile C++ code.");
        } else {
          setRunResults(data.results || []);
        }
      } else {
        setCompileError(data.error || "Execution failed. Server error.");
      }
    } catch (err) {
      console.error(err);
      setCompileError("Network error. Failed to communicate with compiler.");
    } finally {
      setIsRunningCode(false);
    }
  };

  const syncProctoringLogs = async (warningsObj, eventType, eventDetails) => {
    try {
      if (!submission) return;
      const subId = submission._id || submission.id;
      await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId,
          answers: examAnswers,
          proctoringLog: warningsObj,
          status: 'started'
        })
      });

      if (eventType) {
        await fetch(`${API_BASE}/tests/proctoring/event/${subId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: eventType,
            details: eventDetails
          })
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualSubmitExam = () => {
    triggerCustomConfirm(
      "Submit Examination?",
      "Are you sure you want to finalize and submit your exam answers? You will not be able to re-enter this exam.",
      () => {
        finalizeExamSubmission(examAnswers, proctoringWarnings, 'submitted');
      }
    );
  };

  const autoSubmitExam = (warningsObj) => {
    finalizeExamSubmission(examAnswers, warningsObj, 'auto-submitted');
  };

  const finalizeExamSubmission = async (answersList, warningsObj, statusVal) => {
    setSubmittingExam(true);
    try {
      if (!submission) return;
      const res = await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission._id || submission.id,
          answers: answersList,
          proctoringLog: warningsObj,
          status: statusVal
        })
      });
      const data = await res.json();
      if (data.success) {
        await logProctoringEvent(submission, 'TEST_SUBMITTED', `Candidate finalized and submitted exam (Status: ${statusVal}).`);
        // Clear sessionStorage cache on successful submit
        sessionStorage.removeItem(`bics_draft_${test.id}_${candidate.id}`);
        
        // Stop webcam/mic streams
        if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        
        // Do NOT exit fullscreen here (retained in fullscreen during submission screens)
        setFlow('finished');
        setFinishedStep(1);
      } else {
        triggerCustomAlert("Submission Failed", data.error || "An error occurred during submission. Please try again.");
      }
    } catch (err) {
      console.error(err);
      triggerCustomAlert("Network Error", "Unable to establish connection to BICS server. Verify your internet link and try again.");
    } finally {
      setSubmittingExam(false);
    }
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Center 3-line Footer element helper
  const CenteredFooter = () => (
    <footer className="app-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '20px 10px', fontSize: '8.5pt', lineHeight: '1.4', width: '100%', borderTop: '1px solid var(--cf-border)', backgroundColor: '#ffffff' }}>
      <div style={{ fontWeight: 'bold', color: '#002147' }}>BICS Online Test Module</div>
      <div style={{ color: '#555' }}>Managed by Preliminary Examinations 2026</div>
      <div style={{ color: '#777', fontSize: '8pt' }}>All rights reserved © 2026</div>
    </footer>
  );

  // VIEW: Loader spinner
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <Loader2 className="spinner" size={48} />
        <span style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#333', marginTop: '15px' }}>Verifying Examination Security Tunnel...</span>
      </div>
    );
  }

  // VIEW: Error / Direct Access unauthorized gateway landing page
  if (verifyError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
        <header className="app-header">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '34px', width: '34px', objectFit: 'contain' }} />
            <span className="pixel-logo">Online Test BICS Terminal</span>
          </div>
          <div className="header-right">
            <img src="/logo.png" alt="Portal Logo" className="pe-logo" style={{ height: '34px' }} />
          </div>
        </header>
        
        <div style={{ display: 'flex', flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: '40px 20px' }}>
          <div className="cf-card" style={{ maxWidth: '650px', width: '100%', padding: '0', border: '1px solid #cbd5e1', backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
            
            {/* Header banner */}
            <div style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '15px 25px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={24} style={{ color: '#be123c' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <h3 style={{ fontSize: '10.5pt', color: '#be123c', fontWeight: 'bold', margin: 0 }}>UNAUTHORIZED PORTAL ACCESS</h3>
                <span style={{ fontSize: '7.5pt', color: '#64748b', fontFamily: 'monospace' }}>You are not authorized to access this (STATUS_CODE: 403_ACCESS_FORBIDDEN)</span>
              </div>
            </div>

            {/* Error Body */}
            <div style={{ padding: '25px' }}>
              <div style={{ borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2', padding: '12px 15px', color: '#991b1b', fontSize: '9pt', borderRadius: '4px', marginBottom: '20px', lineHeight: '1.5' }}>
                <strong>Access Blocked:</strong> {verifyError}
              </div>

              <h4 style={{ fontSize: '9.5pt', color: '#002147', fontWeight: 'bold', margin: '0 0 10px 0' }}>Why did this happen?</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '8.5pt', color: '#475569', lineHeight: '1.5', marginBottom: '20px' }}>
                <p>
                  1. <strong>Token Missing or Expired</strong>: The secure authentication hand-shake link is only valid for 120 seconds. If you refresh the page or manually copy-paste the URL, the link is discarded automatically for integrity protection.
                </p>
                <p>
                  2. <strong>No Direct Access permitted</strong>: Candidates are prohibited from accessing the proctoring client playground workspace directly without logging into their main student dashboard account first.
                </p>
                <p>
                  3. <strong>Malpractice Lockout</strong>: If you have already started or submitted this examination, re-entrance tokens are blocked by the database session gate.
                </p>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <h5 style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 'bold', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Gateway Connection Log:</h5>
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '10px 12px', fontFamily: 'monospace', fontSize: '8pt', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>GATEWAY_IP: 127.0.0.1 (Local Client)</div>
                  <div>SECURE_TUNNEL: ACTIVE (BICS_SECURE_TUNNEL_v2.0)</div>
                  <div>SESSION_LOG: PROCTORING_PENDING_DISCARDED</div>
                </div>
              </div>

              {/* Redirection Progress Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', marginTop: '25px' }}>
                <Loader2 className="spinner" size={24} style={{ color: '#1e40af' }} />
                <div style={{ textAlign: 'left' }}>
                  <h5 style={{ fontSize: '9pt', fontWeight: 'bold', color: '#1e40af', margin: '0 0 2px 0' }}>Automatic Portal Redirection</h5>
                  <p style={{ fontSize: '8.5pt', color: '#1e3a8a', margin: 0 }}>
                    Transferring session back to candidate dashboard homepage in <strong>{kickoutCount} seconds</strong>...
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
        
        <CenteredFooter />
      </div>
    );
  }

  // VIEW: Login Page
  if (flow === 'verify_login') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <header className="app-header">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '34px', width: '34px', objectFit: 'contain' }} />
            <span className="pixel-logo">Online Test BICS Terminal</span>
          </div>
          <div className="header-right">
            <img src="/logo.png" alt="Portal Logo" className="pe-logo" style={{ height: '34px' }} />
          </div>
        </header>
        <div style={{ display: 'flex', flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="cf-card" style={{ maxWidth: '400px', width: '100%', padding: '30px', border: '1px solid var(--cf-border)' }}>
            <div className="cf-card-title" style={{ justifyContent: 'center' }}>Secure Exam Identity Sign In</div>
            
            {/* Registration Photo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <div style={{ width: '120px', height: '150px', border: '2px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#cbd5e1' }}>
                <img src={candidate?.photoUrl} alt="Candidate Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>

            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
              <label className="cf-label">Candidate Name</label>
              <input type="text" className="cf-input" disabled value={candidate?.name || ''} />
            </div>
            <div className="cf-input-group" style={{ marginBottom: '25px' }}>
              <label className="cf-label">Student ID</label>
              <input type="text" className="cf-input" disabled value={candidate?.studentId || ''} />
            </div>

            <button className="cf-btn-primary" style={{ width: '100%', padding: '10px' }} onClick={handleLoginToTest}>
              Login to Test
            </button>
          </div>
        </div>
        <CenteredFooter />
      </div>
    );
  }

  // VIEW: Lobby Loading Effect
  if (flow === 'lobby_loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <Loader2 className="spinner" size={48} />
        <span style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', marginTop: '20px' }}>
          {lobbyMessage}
        </span>
      </div>
    );
  }

  // VIEW: Guidelines & Calibration Setup (Image 2 style with active proctor checking list)
  if (flow === 'guidelines_setup') {
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
              const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || (
                window.location.origin.includes('localhost')
                  ? 'http://localhost:5173/'
                  : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
              );
              window.location.href = dashboardUrl;
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

  // VIEW: Active Proctoring Examination Workspace (Image 3 style)
  if (flow === 'active_exam') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', padding: '20px', gap: '20px', overflow: 'hidden', boxSizing: 'border-box' }}>
        
        {/* Hidden video tracker */}
        <div style={{ display: 'none' }}>
          <video ref={examVideoRef} autoPlay playsInline muted />
        </div>

        {/* Floating Header Card */}
        <div className="cf-card" style={{ margin: 0, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '5px solid #3b5998', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div>
            <h3 style={{ fontSize: '12.5pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>{test?.title}</h3>
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
            gap: '6px'
          }}>
            <Clock size={16} style={{ color: '#ef4444' }} />
            <span>{formatTimer(examTimeLeft)} remaining</span>
          </div>

          <div>
            <button
              className="cf-btn-primary"
              disabled={submittingExam}
              style={{
                borderColor: submittingExam ? '#cbd5e1' : '#ef4444',
                color: submittingExam ? '#64748b' : '#ef4444',
                background: submittingExam ? '#cbd5e1' : 'transparent',
                fontWeight: 'bold',
                padding: '6px 12px',
                fontSize: '9pt',
                cursor: submittingExam ? 'not-allowed' : 'pointer'
              }}
              onClick={handleManualSubmitExam}
            >
              Finalize &amp; Submit Test
            </button>
          </div>
        </div>

        {/* Split Screen Workspace */}
        <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
          {/* Left Pane: Question Description */}
          <div className="cf-card" style={{ flex: '1 1 40%', margin: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', minHeight: 0, position: 'relative' }}>
            <CandidateWatermark email={candidate?.email || candidate?.studentId || candidate?.name} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3b5998', paddingBottom: '8px', zIndex: 11 }}>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
                Question {selectedQuestionIndex + 1} of {test.questions.length}
              </h4>
              <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '8pt', fontWeight: 'bold' }}>
                POINTS: {test.questions[selectedQuestionIndex].points || 0}
              </span>
            </div>

            <RichText
              text={test.questions[selectedQuestionIndex].title}
              style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#333', lineHeight: '1.5', zIndex: 11 }}
            />

            {test.questions[selectedQuestionIndex].imageUrl && (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', backgroundColor: '#fff', textAlign: 'center', zIndex: 11 }}>
                <img
                  src={test.questions[selectedQuestionIndex].imageUrl}
                  alt="Question Diagram Context"
                  style={{ maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '2px' }}
                />
              </div>
            )}

            {/* Render question description and examples for coding / web / mcq types */}
            <div style={{ zIndex: 11, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {test.questions[selectedQuestionIndex].type !== 'mcq' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <RichText
                    text={test.questions[selectedQuestionIndex].description}
                    style={{ fontSize: '9.5pt', color: '#555', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />

                  {test.questions[selectedQuestionIndex].testCases?.length > 0 && (
                    <div>
                      <h5 style={{ fontSize: '9pt', color: '#002147', fontWeight: 'bold', marginBottom: '6px' }}>Example Inputs &amp; Outputs:</h5>
                      <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ textAlign: 'left', width: '50%', padding: '6px 8px' }}>Sample Input</th>
                            <th style={{ textAlign: 'left', width: '50%', padding: '6px 8px' }}>Expected Output</th>
                          </tr>
                        </thead>
                        <tbody>
                          {test.questions[selectedQuestionIndex].testCases.slice(0, 2).map((tc, tcIdx) => (
                            <tr key={tcIdx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '6px 8px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f8fafc' }}>{tc.input}</td>
                              <td style={{ padding: '6px 8px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f8fafc' }}>{tc.output}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <RichText
                  text={test.questions[selectedQuestionIndex].description || "Please select the correct option response to the question on the right workspace panel."}
                  style={{ fontSize: '9.5pt', color: '#555', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                />
              )}
            </div>

            {/* Left Pane bottom footer question grid switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '15px', marginTop: 'auto', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <button
                className="cf-btn-secondary"
                disabled={selectedQuestionIndex === 0}
                onClick={() => setSelectedQuestionIndex(selectedQuestionIndex - 1)}
                style={{ padding: '6px 12px', fontSize: '9pt' }}
              >
                ← Previous
              </button>
              
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {test.questions.map((q, qIdx) => {
                  const ans = examAnswers[qIdx];
                  let isAnswered = false;
                  if (ans) {
                    if (q.type === 'mcq') {
                      isAnswered = ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== undefined;
                    } else if (q.type === 'coding') {
                      const currentCode = ans.submittedCode || '';
                      const initialCode = q.initialTemplate || DEFAULT_TEMPLATES.cpp || '';
                      isAnswered = currentCode.trim() !== '' && currentCode.trim() !== initialCode.trim();
                    } else if (q.type === 'web') {
                      const currentHtml = ans.submittedHtml || '';
                      const initialHtml = q.initialHtml || '';
                      const currentCss = ans.submittedCss || '';
                      const initialCss = q.initialCss || '';
                      const currentJs = ans.submittedJs || '';
                      const initialJs = q.initialJs || '';
                      isAnswered = (currentHtml.trim() !== '' && currentHtml.trim() !== initialHtml.trim()) ||
                                   (currentCss.trim() !== '' && currentCss.trim() !== initialCss.trim()) ||
                                   (currentJs.trim() !== '' && currentJs.trim() !== initialJs.trim());
                    }
                  }

                  const isActive = selectedQuestionIndex === qIdx;

                  let bgColor = '#fff';
                  let textColor = '#64748b';
                  let borderColor = '#cbd5e1';

                  if (isActive) {
                    bgColor = isAnswered ? '#16a34a' : '#3b5998';
                    textColor = '#fff';
                    borderColor = isAnswered ? '#16a34a' : '#3b5998';
                  } else if (isAnswered) {
                    bgColor = '#dcfce7'; // light green
                    textColor = '#15803d'; // green text
                    borderColor = '#86efac'; // green border
                  }

                  return (
                    <button
                      key={qIdx}
                      onClick={() => setSelectedQuestionIndex(qIdx)}
                      style={{
                        minWidth: '32px',
                        height: '32px',
                        padding: '0',
                        fontSize: '9pt',
                        fontWeight: isActive ? 'bold' : 'normal',
                        backgroundColor: bgColor,
                        color: textColor,
                        border: isActive ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {qIdx + 1}
                    </button>
                  );
                })}
              </div>

              <button
                className="cf-btn-secondary"
                disabled={selectedQuestionIndex === test.questions.length - 1}
                onClick={() => setSelectedQuestionIndex(selectedQuestionIndex + 1)}
                style={{ padding: '6px 12px', fontSize: '9pt' }}
              >
                Next →
              </button>
            </div>
          </div>

          {/* Right Pane: Workspace / Monaco Editor / MCQ Options Display */}
          {/* Right Pane: Workspace / Monaco Editor / MCQ Options Display */}
          <div className="cf-card" style={{
            flex: '1 1 60%',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            maxHeight: '100%',
            overflow: 'hidden',
            padding: '15px'
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

            <div style={{ borderBottom: '2px solid #3b5998', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
                {test.questions[selectedQuestionIndex].type === 'mcq' ? 'Select Option' : 'Workspace Editor'}
              </h4>
            </div>

            {test.questions[selectedQuestionIndex].type === 'mcq' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px', overflowY: 'auto', minHeight: 0 }}>
                {test.questions[selectedQuestionIndex].options?.map((opt, oIdx) => {
                  const isSelected = draftMCQ === oIdx;
                  return (
                    <div
                      key={oIdx}
                      onClick={() => setDraftMCQ(oIdx)}
                      style={{
                        padding: '15px',
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #3b5998' : '1px solid #cbd5e1',
                        backgroundColor: isSelected ? '#eff6ff' : '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'all 0.2s',
                        userSelect: 'none'
                      }}
                    >
                      <input
                        type="radio"
                        name={`mcq_${selectedQuestionIndex}`}
                        checked={isSelected}
                        readOnly
                        style={{ cursor: 'pointer' }}
                      />
                      <RichText
                        text={opt}
                        style={{ fontSize: '9.5pt', fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#1e3a8a' : '#333' }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
                
                {/* Professional Language Selection Tabs & Reset Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #cbd5e1', paddingBottom: '0', marginBottom: '10px', height: '40px' }}>
                  {test.questions[selectedQuestionIndex].type === 'coding' ? (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {[
                        { id: 'c', label: 'C' },
                        { id: 'cpp', label: 'C++' },
                        { id: 'python', label: 'Python' },
                        { id: 'java', label: 'Java' }
                      ].map(lang => {
                        const isActive = draftLanguage === lang.id;
                        return (
                          <button
                            key={lang.id}
                            type="button"
                            onClick={() => handleLanguageChange(lang.id)}
                            style={{
                              padding: '6px 16px',
                              fontSize: '9pt',
                              fontWeight: 'bold',
                              borderRadius: '4px 4px 0 0',
                              border: '1px solid #cbd5e1',
                              borderBottom: isActive ? '1px solid #ffffff' : '1px solid #cbd5e1',
                              backgroundColor: isActive ? '#ffffff' : '#f8fafc',
                              color: isActive ? '#002147' : '#64748b',
                              cursor: 'pointer',
                              marginBottom: '-1px',
                              zIndex: isActive ? 2 : 1,
                              transition: 'all 0.15s ease-in-out'
                            }}
                          >
                            {lang.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {[
                        { id: 'html', label: 'index.html' },
                        { id: 'css', label: 'style.css' },
                        { id: 'js', label: 'script.js' }
                      ].map(tab => {
                        const isActive = webActiveTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setWebActiveTab(tab.id)}
                            style={{
                              padding: '6px 16px',
                              fontSize: '9pt',
                              fontWeight: 'bold',
                              borderRadius: '4px 4px 0 0',
                              border: '1px solid #cbd5e1',
                              borderBottom: isActive ? '1px solid #ffffff' : '1px solid #cbd5e1',
                              backgroundColor: isActive ? '#ffffff' : '#f8fafc',
                              color: isActive ? '#002147' : '#64748b',
                              cursor: 'pointer',
                              marginBottom: '-1px',
                              zIndex: isActive ? 2 : 1,
                              transition: 'all 0.15s ease-in-out'
                            }}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ paddingBottom: '4px' }}>
                    <button
                      className="cf-btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '8pt', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#ffffff', cursor: 'pointer' }}
                      onClick={() => {
                        triggerCustomConfirm(
                          "Reset Code Template?",
                          "Are you sure you want to reset the editor content? This will overwrite your current progress for this question.",
                          () => {
                            if (test.questions[selectedQuestionIndex].type === 'coding') {
                              setDraftCode(test.questions[selectedQuestionIndex].initialTemplate || DEFAULT_TEMPLATES[draftLanguage]);
                            } else {
                              const activeQuest = test.questions[selectedQuestionIndex];
                              if (webActiveTab === 'html') setDraftHtml(activeQuest.initialHtml || '');
                              if (webActiveTab === 'css') setDraftCss(activeQuest.initialCss || '');
                              if (webActiveTab === 'js') setDraftJs(activeQuest.initialJs || '');
                            }
                          }
                        );
                      }}
                    >
                      Reset Template
                    </button>
                  </div>
                </div>

                {/* Professional Monaco Editor workspace */}
                <div style={{ flex: 1, minHeight: '150px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                  {test.questions[selectedQuestionIndex].type === 'coding' ? (
                    <Editor
                      height="100%"
                      language={draftLanguage}
                      theme="vs-light"
                      value={draftCode}
                      onChange={(value) => setDraftCode(value || '')}
                      loading={<div style={{ padding: '20px', fontSize: '9pt', color: '#64748b', fontFamily: 'monospace' }}>Loading Monaco IDE Engine...</div>}
                      options={{
                        fontSize: 13,
                        fontFamily: 'Consolas, Courier New, monospace',
                        minimap: { enabled: false },
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        automaticLayout: true,
                        tabSize: 4,
                        cursorBlinking: 'blink',
                        padding: { top: 10, bottom: 10 },
                        scrollbar: { vertical: 'auto', horizontal: 'auto' }
                      }}
                    />
                  ) : (
                    <Editor
                      height="100%"
                      language={webActiveTab === 'js' ? 'javascript' : webActiveTab}
                      theme="vs-light"
                      value={webActiveTab === 'html' ? draftHtml : (webActiveTab === 'css' ? draftCss : draftJs)}
                      onChange={(value) => {
                        if (webActiveTab === 'html') setDraftHtml(value || '');
                        if (webActiveTab === 'css') setDraftCss(value || '');
                        if (webActiveTab === 'js') setDraftJs(value || '');
                      }}
                      loading={<div style={{ padding: '20px', fontSize: '9pt', color: '#64748b', fontFamily: 'monospace' }}>Loading Monaco Web Editor...</div>}
                      options={{
                        fontSize: 13,
                        fontFamily: 'Consolas, Courier New, monospace',
                        minimap: { enabled: false },
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        automaticLayout: true,
                        tabSize: 4,
                        cursorBlinking: 'blink',
                        padding: { top: 10, bottom: 10 },
                        scrollbar: { vertical: 'auto', horizontal: 'auto' }
                      }}
                    />
                  )}
                </div>

                {/* LeetCode-Style Split Console Panel */}
                <div style={{
                  marginTop: '12px',
                  borderTop: '1px solid #cbd5e1',
                  paddingTop: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: test.questions[selectedQuestionIndex].type === 'web' ? '1.2 1 0%' : '1 1 0%',
                  minHeight: '180px',
                  overflow: 'hidden'
                }}>
                  {/* Console Tabs */}
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', borderBottom: '1px solid #cbd5e1' }}>
                    {test.questions[selectedQuestionIndex].type === 'coding' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConsoleTab('testcase')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '8.5pt',
                            fontWeight: 'bold',
                            borderRadius: '4px 4px 0 0',
                            border: '1px solid #cbd5e1',
                            borderBottom: consoleTab === 'testcase' ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                            backgroundColor: consoleTab === 'testcase' ? '#f8fafc' : '#ffffff',
                            color: consoleTab === 'testcase' ? '#002147' : '#64748b',
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            zIndex: consoleTab === 'testcase' ? 2 : 1
                          }}
                        >
                          Testcase
                        </button>
                        <button
                          type="button"
                          onClick={() => setConsoleTab('result')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '8.5pt',
                            fontWeight: 'bold',
                            borderRadius: '4px 4px 0 0',
                            border: '1px solid #cbd5e1',
                            borderBottom: consoleTab === 'result' ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                            backgroundColor: consoleTab === 'result' ? '#f8fafc' : '#ffffff',
                            color: consoleTab === 'result' ? '#002147' : '#64748b',
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            zIndex: consoleTab === 'result' ? 2 : 1
                          }}
                        >
                          &gt;_ Test Result
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConsoleTab('testcase')} // Map to Live Preview
                          style={{
                            padding: '6px 14px',
                            fontSize: '8.5pt',
                            fontWeight: 'bold',
                            borderRadius: '4px 4px 0 0',
                            border: '1px solid #cbd5e1',
                            borderBottom: (consoleTab === 'testcase' || consoleTab === 'preview') ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                            backgroundColor: (consoleTab === 'testcase' || consoleTab === 'preview') ? '#f8fafc' : '#ffffff',
                            color: (consoleTab === 'testcase' || consoleTab === 'preview') ? '#002147' : '#64748b',
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            zIndex: 2
                          }}
                        >
                          Live Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setConsoleTab('result')} // Map to Console Logs
                          style={{
                            padding: '6px 14px',
                            fontSize: '8.5pt',
                            fontWeight: 'bold',
                            borderRadius: '4px 4px 0 0',
                            border: '1px solid #cbd5e1',
                            borderBottom: consoleTab === 'result' ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                            backgroundColor: consoleTab === 'result' ? '#f8fafc' : '#ffffff',
                            color: consoleTab === 'result' ? '#002147' : '#64748b',
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            zIndex: 2
                          }}
                        >
                          &gt;_ Console Logs
                        </button>
                      </>
                    )}
                  </div>

                  {/* Console Body Area */}
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0
                  }}>
                    {test.questions[selectedQuestionIndex].type === 'coding' ? (
                      /* C++ Coding Console contents */
                      consoleTab === 'testcase' ? (
                        <div>
                          {(() => {
                            const activeQuestion = test?.questions?.[selectedQuestionIndex];
                            const sampleCases = (activeQuestion?.testCases || []).filter(tc => tc.isSample);
                            if (sampleCases.length === 0) {
                              return <div style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic' }}>No sample test cases configured for this question.</div>;
                            }
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {sampleCases.map((tc, tcIdx) => (
                                  <div key={tcIdx} style={{ fontSize: '8.5pt', borderBottom: '1px dashed #cbd5e1', paddingBottom: '6px' }}>
                                    <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '2px' }}>Case #{tcIdx + 1}:</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                      <div>
                                        <span style={{ color: '#64748b' }}>Input: </span>
                                        <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace' }}>{tc.input || '(empty)'}</code>
                                      </div>
                                      <div>
                                        <span style={{ color: '#64748b' }}>Expected: </span>
                                        <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace' }}>{tc.output || '(empty)'}</code>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div>
                          {isRunningCode ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px', gap: '8px' }}>
                              <Loader2 className="cf-spinner" size={24} style={{ color: '#3b5998' }} />
                              <span style={{ fontSize: '9pt', color: '#475569', fontFamily: 'monospace' }}>Compiling &amp; Running Code...</span>
                            </div>
                          ) : (!runResults && !compileError) ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', fontSize: '9.5pt', color: '#94a3b8', fontStyle: 'italic' }}>
                              You must run your C++ code first
                            </div>
                          ) : (
                            <div>
                              {/* Compile Error */}
                              {compileError && (
                                <div style={{
                                  backgroundColor: '#fef2f2',
                                  border: '1px solid #fee2e2',
                                  borderRadius: '4px',
                                  padding: '10px',
                                  color: '#991b1b',
                                  fontFamily: 'monospace',
                                  fontSize: '8.5pt',
                                  whiteSpace: 'pre-wrap'
                                }}>
                                  <strong>Compilation Error:</strong>
                                  <div style={{ marginTop: '5px' }}>{compileError}</div>
                                </div>
                              )}

                              {/* Run Results */}
                              {runResults && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {runResults.map((res, rIdx) => {
                                    const isPassed = res.status === 'Accepted';
                                    const activeQuest = test?.questions?.[selectedQuestionIndex];
                                    const isSample = activeQuest?.testCases?.[rIdx]?.isSample;
                                    return (
                                      <div key={rIdx} style={{
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff',
                                        overflow: 'hidden'
                                      }}>
                                        <div style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          padding: '5px 10px',
                                          borderBottom: isSample ? '1px solid #cbd5e1' : 'none',
                                          backgroundColor: isPassed ? '#f0fdf4' : '#fef2f2'
                                        }}>
                                          <span style={{
                                            fontSize: '8.5pt',
                                            fontWeight: 'bold',
                                            color: isPassed ? '#15803d' : '#b91c1c',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                          }}>
                                            {isPassed ? (
                                              <Check size={14} style={{ color: '#15803d' }} />
                                            ) : (
                                              <X size={14} style={{ color: '#b91c1c' }} />
                                            )}
                                            <span>{isPassed ? 'Passed' : (res.status || 'Wrong Answer')} - {isSample ? `Test Case #${rIdx + 1}` : `Hidden Test Case #${rIdx + 1}`}</span>
                                          </span>
                                        </div>
                                        {isSample && (
                                          <div style={{ padding: '6px 10px', fontSize: '8pt', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div>
                                              <strong>Input:</strong> <code style={{ fontFamily: 'monospace' }}>{res.input || '(empty)'}</code>
                                            </div>
                                            <div>
                                              <strong>Expected:</strong> <code style={{ color: '#15803d', fontFamily: 'monospace' }}>{res.expectedOutput || '(empty)'}</code>
                                            </div>
                                            <div>
                                              <strong>Your Output:</strong> <code style={{ color: isPassed ? '#15803d' : '#b91c1c', fontFamily: 'monospace' }}>{res.actualOutput || '(empty)'}</code>
                                            </div>
                                            {res.stderr && (
                                              <div style={{ color: '#b91c1c', marginTop: '2px' }}>
                                                <strong>Error:</strong> <pre style={{ display: 'inline', fontFamily: 'monospace', margin: 0 }}>{res.stderr}</pre>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      /* HTML/CSS/JS Web Console contents */
                      (consoleTab === 'testcase' || consoleTab === 'preview') ? (
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', flex: 1, minHeight: 0, backgroundColor: '#ffffff' }}>
                          <iframe
                            id="web-sandbox-preview"
                            title="Web Sandbox Preview"
                            srcDoc={`
                              <!DOCTYPE html>
                              <html>
                                <head>
                                  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
                                  <base href="https://invalid-sandbox-origin.invalid/">
                                  <style>
                                    html, body {
                                      margin: 0;
                                      padding: 10px;
                                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                      word-wrap: break-word;
                                      word-break: break-word;
                                      overflow-x: hidden;
                                      box-sizing: border-box;
                                    }
                                    *, *:before, *:after {
                                      box-sizing: inherit;
                                    }
                                    img, video, iframe, canvas {
                                      max-width: 100%;
                                      height: auto;
                                      display: block;
                                    }
                                    pre, code {
                                      white-space: pre-wrap;
                                      word-break: break-all;
                                    }
                                  </style>
                                  <style>${draftCss}</style>
                                  <script>
                                    window.onerror = function(message, source, lineno, colno, error) {
                                      window.parent.postMessage({
                                        type: 'IFRAME_CONSOLE_LOG',
                                        level: 'error',
                                        text: message + ' (line ' + lineno + ')'
                                      }, '*');
                                      return true;
                                    };
                                    const _log = console.log;
                                    const _error = console.error;
                                    console.log = function(...args) {
                                      _log.apply(console, args);
                                      window.parent.postMessage({
                                        type: 'IFRAME_CONSOLE_LOG',
                                        level: 'log',
                                        text: args.join(' ')
                                      }, '*');
                                    };
                                    console.error = function(...args) {
                                      _error.apply(console, args);
                                      window.parent.postMessage({
                                        type: 'IFRAME_CONSOLE_LOG',
                                        level: 'error',
                                        text: args.join(' ')
                                      }, '*');
                                    };
                                  </script>
                                </head>
                                <body>
                                  ${draftHtml}
                                  <script>${draftJs}</script>
                                </body>
                              </html>
                            `}
                            sandbox="allow-scripts"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          backgroundColor: '#1e1e1e',
                          color: '#f8fafc',
                          fontFamily: 'monospace',
                          fontSize: '8.5pt',
                          padding: '10px',
                          borderRadius: '4px',
                          flex: 1,
                          minHeight: 0,
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}>
                          {webConsoleLogs.length === 0 ? (
                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>Console is clean. No logs captured.</span>
                          ) : (
                            webConsoleLogs.map((log, lIdx) => (
                              <div key={lIdx} style={{ display: 'flex', gap: '6px' }}>
                                <span style={{ color: log.level === 'error' ? '#f87171' : '#64748b', fontWeight: 'bold' }}>
                                  {log.level === 'error' ? '[error]' : '[log]'}
                                </span>
                                <span style={{ color: log.level === 'error' ? '#fca5a5' : '#e2e8f0' }}>{log.text}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Save & Next button at the bottom right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '15px', marginTop: 'auto', height: '50px' }}>
              {test.questions[selectedQuestionIndex].type === 'coding' ? (
                <button
                  type="button"
                  className="cf-btn-secondary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '9pt',
                    fontWeight: 'bold',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: isRunningCode ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    margin: 0
                  }}
                  onClick={handleRunCode}
                  disabled={isRunningCode}
                >
                  {isRunningCode ? <Loader2 className="cf-spinner" size={14} /> : <Play size={14} />}
                  {isRunningCode ? 'Running...' : 'Run Code'}
                </button>
              ) : (
                <div></div>
              )}
              <button
                type="button"
                className="cf-btn-primary"
                style={{ background: '#10b981', borderColor: '#10b981', color: '#ffffff', padding: '8px 16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer', margin: 0 }}
                onClick={handleSaveAndNext}
              >
                <CheckSquare size={14} />
                <span>Save &amp; {selectedQuestionIndex === test.questions.length - 1 ? 'Finish Question' : 'Next Question'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Warning proctor alert modal */}
        {showWarningModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000
          }}>
            <div className="cf-card" style={{ maxWidth: '450px', padding: '25px', textAlign: 'center', border: '2px solid #e11d48' }}>
              <div style={{ color: '#e11d48', display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><ShieldAlert size={48} /></div>
              <h3 style={{ fontSize: '13pt', color: '#b91c1c', fontWeight: 'bold', marginBottom: '10px' }}>
                PROCTORING WARNING: WINDOW ACCESS DETECTED
              </h3>
              <p style={{ fontSize: '9.5pt', color: '#333', marginBottom: '15px', lineHeight: 1.5 }}>
                The system logged a tab switch or fullscreen escape. Candidates are forbidden from accessing external pages or resizing this window during the test.
              </p>
              <div style={{ padding: '10px', backgroundColor: '#ffe4e6', color: '#be123c', border: '1px solid #fda4af', borderRadius: '4px', fontSize: '9.5pt', fontWeight: 'bold', marginBottom: '20px' }}>
                Total Warnings: {proctoringWarnings.fullscreenExits + proctoringWarnings.tabSwitches} / 3. Exceeding 3 will force automatic submission.
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

        {/* CUSTOM DIALOG MODAL SYSTEM */}
        {customModal.isOpen && (
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

        {/* SUBMITTING OVERLAY LOADER */}
        {submittingExam && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 200000,
            color: '#ffffff',
            flexDirection: 'column',
            gap: '15px'
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
            <Loader2 className="cf-spinner" size={48} style={{ color: '#38bdf8' }} />
            <h3 style={{ fontSize: '14pt', fontWeight: 'bold', margin: 0 }}>Submitting Examination...</h3>
            <p style={{ fontSize: '10pt', color: '#94a3b8', margin: 0, maxWidth: '320px', textAlign: 'center', lineHeight: '1.5' }}>
              We are compiling and executing your coding solutions against all automated grading test cases. Please do not close or refresh this tab.
            </p>
          </div>
        )}
      </div>
    );
  }

  // VIEW: Submission Complete screen
  if (flow === 'finished') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <header className="app-header">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '34px', width: '34px', objectFit: 'contain' }} />
            <span className="pixel-logo">Online Test BICS Terminal</span>
          </div>
          <div className="header-right">
            <img src="/logo.png" alt="Portal Logo" className="pe-logo" style={{ height: '34px' }} />
          </div>
        </header>

        <div style={{ display: 'flex', flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="cf-card" style={{ maxWidth: '500px', width: '100%', padding: '40px', border: '1px solid var(--cf-border)', textAlign: 'center' }}>
            
            {finishedStep === 1 ? (
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
}
