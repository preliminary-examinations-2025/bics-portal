import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, Camera, Mic, Maximize, AlertTriangle, CheckSquare, Info, Award, Loader2, ArrowRight, Play,
  Check, X, Lock, Eye, Clock, Flag, BookOpen, FileText, Send, HelpCircle, ChevronDown, ExternalLink, ShieldCheck
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
      opacity: 0.12,
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

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasPendingSubmit, setHasPendingSubmit] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(true);
    const handleOfflineStatus = () => setIsOnline(false);

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOfflineStatus);
    };
  }, []);
  
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

  // Verification Review & Objection States (for /submissions/:id view)
  const [objectionModal, setObjectionModal] = useState({
    isOpen: false,
    questionIndex: null,
    questionId: '',
    reason: 'Testcase evaluation discrepancy',
    details: '',
    submitting: false,
    error: '',
    success: ''
  });
  const [webDevPreviewTabs, setWebDevPreviewTabs] = useState({}); // { [qIndex]: 'html' | 'css' | 'js' | 'preview' }

  // DOM Refs
  const calibVideoRef = useRef(null);
  const examVideoRef = useRef(null);
  const blazefaceModelRef = useRef(null);
  const faceAwayDurationRef = useRef(0);
  const [webcamProctorWarning, setWebcamProctorWarning] = useState('');

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

  // Load BlazeFace Model Failsafe
  useEffect(() => {
    const loadModel = async () => {
      try {
        if (window.blazeface) {
          console.log("[PROCTOR_ML]: Loading BlazeFace model...");
          const model = await window.blazeface.load();
          blazefaceModelRef.current = model;
          console.log("[PROCTOR_ML]: BlazeFace model loaded successfully.");
        } else {
          console.warn("[PROCTOR_ML]: BlazeFace model CDN not available.");
        }
      } catch (e) {
        console.error("[PROCTOR_ML]: Failed to initialize BlazeFace model:", e);
      }
    };
    loadModel();
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

  // Fetch evaluated answer sheet verification for /submissions/:id
  const loadSubmissionVerification = async (subId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tests/submission-verification/${subId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVerifyError(data.error || "Unable to access evaluated answer sheet verification.");
        setLoading(false);
        return;
      }

      setCandidate(data.candidate);
      setTest(data.test);
      setSubmission(data.submission);
      setFlow('verification_review');
      setLoading(false);
    } catch (err) {
      console.error("Verification fetch failed:", err);
      setVerifyError("Network Error: Unable to establish secure link to verify evaluated paper.");
      setLoading(false);
    }
  };

  // 1. Initial Load: Parse path and query parameters for test or verification route
  useEffect(() => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    // Check if route is for submission verification (e.g. /submissions/6a92..., /submission/6a92..., /submissions?id=6a92...)
    let subId = null;
    if (path.startsWith('/submissions/') || path.startsWith('/submission/')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[1]) {
        subId = parts[1];
      }
    }
    if (!subId) {
      subId = searchParams.get('submissionId') || searchParams.get('id');
      if (path.startsWith('/submissions') && !subId) {
        subId = searchParams.get('id') || searchParams.get('submissionId');
      }
    }

    if (path.startsWith('/submissions') || path.startsWith('/submission') || (subId && !searchParams.get('token'))) {
      if (!subId) {
        setVerifyError("Invalid Submission Link. Missing examination submission reference.");
        setLoading(false);
        return;
      }
      loadSubmissionVerification(subId);
      return;
    }

    // Online Exam Route (handles /test?token=..., /?token=..., /test/?token=...)
    const parsedToken = searchParams.get('token');
    if (!parsedToken) {
      setVerifyError("Authorization Token Missing. Online tests must be launched from your Student Portal dashboard.");
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

  // Dynamically update browser tab title based on route and examination/verification state
  useEffect(() => {
    const isSubmissionsRoute = window.location.pathname.startsWith('/submissions') || 
                               window.location.pathname.startsWith('/submission') || 
                               flow === 'verification_review';

    if (isSubmissionsRoute) {
      if (test?.title) {
        document.title = `Answer Sheet Verification - ${test.title} | BICS Portal`;
      } else {
        document.title = "Answer Sheet Verification | BICS Examination Portal";
      }
    } else {
      if (test?.title) {
        document.title = `Online Examination Terminal - ${test.title} | BICS Portal`;
      } else {
        document.title = "Online Examination Terminal - BICS Portal";
      }
    }
  }, [flow, test?.title]);

  // Auto-redirect timer when flow === 'finished' (keeps fullscreen until redirection)
  useEffect(() => {
    if (flow !== 'finished' || hasPendingSubmit) return;
    
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
  }, [flow, hasPendingSubmit]);

  // Objection modal actions for verification paper review
  const handleOpenObjectionModal = (qIndex, qId) => {
    setObjectionModal({
      isOpen: true,
      questionIndex: qIndex,
      questionId: qId,
      reason: 'Testcase evaluation discrepancy',
      details: '',
      submitting: false,
      error: '',
      success: ''
    });
  };

  const handleCloseObjectionModal = () => {
    setObjectionModal({
      isOpen: false,
      questionIndex: null,
      questionId: '',
      reason: 'Testcase evaluation discrepancy',
      details: '',
      submitting: false,
      error: '',
      success: ''
    });
  };

  const handleSubmitObjection = async () => {
    if (!objectionModal.details.trim()) {
      setObjectionModal(prev => ({ ...prev, error: 'Please provide detailed remarks explaining your grievance.' }));
      return;
    }

    setObjectionModal(prev => ({ ...prev, submitting: true, error: '' }));
    try {
      const res = await fetch(`${API_BASE}/tests/objection/${submission.id || submission._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: objectionModal.questionId,
          questionIndex: objectionModal.questionIndex,
          reason: objectionModal.reason,
          details: objectionModal.details
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setObjectionModal(prev => ({ ...prev, submitting: false, error: data.error || 'Failed to submit objection.' }));
        return;
      }

      setSubmission(prev => ({
        ...prev,
        objections: data.objections || [
          ...(prev.objections || []).filter(o => o.questionIndex !== objectionModal.questionIndex),
          {
            questionId: String(objectionModal.questionId),
            questionIndex: Number(objectionModal.questionIndex),
            reason: objectionModal.reason,
            details: objectionModal.details,
            status: 'pending',
            raisedAt: new Date()
          }
        ]
      }));

      setObjectionModal(prev => ({
        ...prev,
        submitting: false,
        success: 'Objection submitted successfully! The academic evaluation committee will review your remarks.'
      }));

      setTimeout(() => {
        handleCloseObjectionModal();
      }, 1600);
    } catch (err) {
      console.error(err);
      setObjectionModal(prev => ({ ...prev, submitting: false, error: 'Network error while submitting objection.' }));
    }
  };

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
      
      // Load pre-existing state or localStorage cache
      const storageKey = `bics_draft_${data.test.id}_${data.candidate.id}`;
      const cached = localStorage.getItem(storageKey);
      
      let answersArr = [];
      if (cached) {
        try {
          answersArr = JSON.parse(cached);
        } catch (e) {
          console.warn("Failed to parse cached localStorage answers:", e);
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

  // ML webcam face proctoring loop
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;
    
    let active = true;
    let frameId;
    let lastLogTime = 0; // Throttle server proctoring warning logs
    
    const trackFace = async () => {
      if (!active) return;
      
      const video = examVideoRef.current;
      const model = blazefaceModelRef.current;
      
      if (video && model && video.readyState === 4) {
        try {
          // Detect faces in the video frame
          const predictions = await model.estimateFaces(video, false);
          
          if (!active) return;
          
          if (predictions.length === 0) {
            // No face detected!
            faceAwayDurationRef.current += 1;
            
            if (faceAwayDurationRef.current > 30) { // ~3 seconds at 10 FPS
              setWebcamProctorWarning("Proctor Reminder: No face detected. Please ensure you are visible to the webcam.");
              
              // Throttle database logging
              const now = Date.now();
              if (now - lastLogTime > 15000) {
                logProctoringEvent(submission, 'PROCTOR_WARNING', 'No face detected in webcam stream.');
                lastLogTime = now;
              }
            }
          } else if (predictions.length > 1) {
            // Multiple faces detected!
            faceAwayDurationRef.current += 1;
            
            if (faceAwayDurationRef.current > 30) {
              setWebcamProctorWarning("Proctor Reminder: Multiple faces detected in webcam frame.");
              
              const now = Date.now();
              if (now - lastLogTime > 15000) {
                logProctoringEvent(submission, 'PROCTOR_WARNING', 'Multiple faces detected in webcam stream.');
                lastLogTime = now;
              }
            }
          } else {
            // Exactly one face detected. Let's inspect landmarks!
            const prediction = predictions[0];
            const landmarks = prediction.landmarks; // [right_eye, left_eye, nose, mouth, right_ear, left_ear]
            
            if (landmarks && landmarks.length >= 3) {
              const rightEye = landmarks[0];
              const leftEye = landmarks[1];
              const nose = landmarks[2];
              
              const eyeCenterX = (rightEye[0] + leftEye[0]) / 2;
              const eyeDistance = Math.abs(rightEye[0] - leftEye[0]);
              
              if (eyeDistance > 0) {
                const offsetRatio = (nose[0] - eyeCenterX) / eyeDistance;
                
                // If nose offset is too far left or right (looking away)
                if (Math.abs(offsetRatio) > 0.25) {
                  faceAwayDurationRef.current += 1;
                  
                  if (faceAwayDurationRef.current > 30) {
                    setWebcamProctorWarning("Proctor Reminder: Please keep facing forward. Looking away is prohibited.");
                    
                    const now = Date.now();
                    if (now - lastLogTime > 15000) {
                      logProctoringEvent(submission, 'PROCTOR_WARNING', 'Candidate is turned away / looking away from screen.');
                      lastLogTime = now;
                    }
                  }
                } else {
                  // Face is facing forward and valid!
                  faceAwayDurationRef.current = 0;
                  setWebcamProctorWarning('');
                }
              } else {
                faceAwayDurationRef.current = 0;
                setWebcamProctorWarning('');
              }
            } else {
              faceAwayDurationRef.current = 0;
              setWebcamProctorWarning('');
            }
          }
        } catch (e) {
          console.warn("[PROCTOR_ML_LOOP_ERROR]: Face prediction loop caught exception:", e.message);
        }
      }
      
      if (active) {
        frameId = setTimeout(trackFace, 100);
      }
    };
    
    // Start loop after a short delay
    const initDelay = setTimeout(trackFace, 1000);
    
    return () => {
      active = false;
      clearTimeout(initDelay);
      clearTimeout(frameId);
    };
  }, [flow, submission]);

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
    
    // Save to localStorage cache
    const storageKey = `bics_draft_${test.id}_${candidate.id}`;
    localStorage.setItem(storageKey, JSON.stringify(updated));

    // Auto-save to server draft
    saveServerDraft(updated);

    if (selectedQuestionIndex < (test.questions?.length || 1) - 1) {
      setSelectedQuestionIndex(selectedQuestionIndex + 1);
    }
  };

  // Auto-save active progress to localStorage every 3 seconds to recover from crashes
  useEffect(() => {
    if (!test || !candidate || examAnswers.length === 0) return;

    const interval = setInterval(() => {
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
      
      const storageKey = `bics_draft_${test.id}_${candidate.id}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }, 3000);

    return () => clearInterval(interval);
  }, [test, candidate, examAnswers, selectedQuestionIndex, draftMCQ, draftCode, draftLanguage, draftHtml, draftCss, draftJs]);

  // Auto-sync pending submissions when connection comes back online
  useEffect(() => {
    if (!submission) return;
    
    const subId = submission._id || submission.id;
    const pendingSubmitKey = `bics_pending_submit_${subId}`;
    const cachedPayload = localStorage.getItem(pendingSubmitKey);
    
    if (cachedPayload) {
      setHasPendingSubmit(true);
      
      if (isOnline) {
        const syncDraft = async () => {
          setSyncStatus('initiating');
          try {
            const payload = JSON.parse(cachedPayload);
            setSyncStatus('uploading');
            const res = await fetch(`${API_BASE}/tests/submit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            setSyncStatus('processing');
            const data = await res.json();
            if (data.success) {
              localStorage.removeItem(pendingSubmitKey);
              setSyncStatus('completed');
              setHasPendingSubmit(false);
              setFlow('finished');
              setFinishedStep(1);
            } else {
              setSyncStatus('failed');
            }
          } catch (err) {
            setSyncStatus('failed');
            console.warn("Auto-sync background submission failed:", err.message);
          }
        };
        syncDraft();
      }
    } else {
      setHasPendingSubmit(false);
    }
  }, [isOnline, submission]);

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
    const subId = submission?._id || submission?.id;
    if (!subId) {
      setSubmittingExam(false);
      return;
    }

    if (!isOnline) {
      const pendingSubmitKey = `bics_pending_submit_${subId}`;
      const payload = {
        submissionId: subId,
        answers: answersList,
        proctoringLog: warningsObj,
        status: statusVal
      };
      localStorage.setItem(pendingSubmitKey, JSON.stringify(payload));
      setHasPendingSubmit(true);
      
      if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      localStorage.removeItem(`bics_draft_${test.id}_${candidate.id}`);

      setFlow('finished');
      setFinishedStep(1);
      setSubmittingExam(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId,
          answers: answersList,
          proctoringLog: warningsObj,
          status: statusVal
        })
      });
      const data = await res.json();
      if (data.success) {
        await logProctoringEvent(submission, 'TEST_SUBMITTED', `Candidate finalized and submitted exam (Status: ${statusVal}).`);
        localStorage.removeItem(`bics_draft_${test.id}_${candidate.id}`);
        
        if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        
        // Clean up any lingering offline pending submit items
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('bics_pending_submit_')) {
            localStorage.removeItem(k);
          }
        }
        setHasPendingSubmit(false);

        setFlow('finished');
        setFinishedStep(1);
      } else {
        triggerCustomAlert("Submission Failed", data.error || "An error occurred during submission. Please try again.");
      }
    } catch (err) {
      console.error("Submission fetch crashed, caching payload locally:", err);
      const pendingSubmitKey = `bics_pending_submit_${subId}`;
      const payload = {
        submissionId: subId,
        answers: answersList,
        proctoringLog: warningsObj,
        status: statusVal
      };
      localStorage.setItem(pendingSubmitKey, JSON.stringify(payload));
      setHasPendingSubmit(true);
      
      if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      localStorage.removeItem(`bics_draft_${test.id}_${candidate.id}`);

      setFlow('finished');
      setFinishedStep(1);
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

  // VIEW: Screen Size Blocker (Desktop Check)
  if (!isDesktop) {
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
          <div className="cf-card" style={{ maxWidth: '600px', width: '100%', padding: '0', border: '1px solid #cbd5e1', backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
            
            <div style={{ backgroundColor: '#fef2f2', borderBottom: '1px solid #fee2e2', padding: '15px 25px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={24} style={{ color: '#ef4444' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <h3 style={{ fontSize: '11pt', color: '#b91c1c', fontWeight: 'bold', margin: 0 }}>DESKTOP VIEWPORT REQUIRED</h3>
                <span style={{ fontSize: '7.5pt', color: '#7f1d1d', fontFamily: 'monospace' }}>Device validation check failed (SCREEN_WIDTH &lt; 1024px)</span>
              </div>
            </div>

            <div style={{ padding: '25px', textAlign: 'center' }}>
              <div style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#fef3c7', padding: '12px 15px', color: '#78350f', fontSize: '9pt', borderRadius: '4px', marginBottom: '20px', textAlign: 'left', lineHeight: '1.5' }}>
                <strong>Access Blocked:</strong> To ensure exam integrity and support the coding compiler's code-editor layouts, the Online Test Terminal can only be accessed on desktop screens (monitors or laptops). Mobile and tablet viewports are strictly blocked.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '8px', backgroundColor: '#f8fafc', marginBottom: '20px' }}>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#1e293b' }}>
                  Your Current Resolution: {window.innerWidth}px x {window.innerHeight}px
                </div>
                <p style={{ fontSize: '8.5pt', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                  Please switch to a desktop or laptop device, or maximize your browser window if you are already on a computer, to automatically unlock the terminal.
                </p>
              </div>

              <div style={{ fontSize: '8pt', color: '#94a3b8' }}>
                Waiting for screen resize detection...
              </div>
            </div>

          </div>
        </div>
        
        <CenteredFooter />
      </div>
    );
  }

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
            gap: '6px',
            justifySelf: 'center'
          }}>
            <Clock size={16} style={{ color: '#ef4444' }} />
            <span>{formatTimer(examTimeLeft)} remaining</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

        {webcamProctorWarning && (
          <div style={{
            backgroundColor: '#fffbeb',
            borderLeft: '5px solid #d97706',
            color: '#b45309',
            padding: '12px 15px',
            fontSize: '9.5pt',
            fontWeight: 'bold',
            borderRadius: '4px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            margin: '0 0 -10px 0',
            zIndex: 100
          }}>
            <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
            <span>{webcamProctorWarning}</span>
          </div>
        )}

        {/* Split Screen Workspace */}
        <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                    {/* Floating Questions Panel Overlay Card */}
          {isSidebarOpen && (
            <div className="cf-card" style={{
              position: 'absolute',
              top: '15px',
              left: '15px',
              width: '280px',
              maxHeight: 'calc(100% - 30px)',
              margin: 0,
              padding: '15px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
              zIndex: 1500,
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              borderRadius: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
                <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '9.5pt', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions Panel</h4>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', margin: 0, padding: 0 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Group questions by section */}
              {(() => {
                const groups = {};
                (test?.questions || []).forEach((q, idx) => {
                  const sec = q.section || 'General Questions';
                  if (!groups[sec]) groups[sec] = [];
                  groups[sec].push({ ...q, originalIndex: idx });
                });

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {Object.entries(groups).map(([sectionTitle, list]) => {
                      if (list.length === 0) return null;
                      return (
                        <div key={sectionTitle} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <h5 style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 'bold', margin: '5px 0 2px 0' }}>{sectionTitle}</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                            {list.map((q) => {
                              const isCurrent = selectedQuestionIndex === q.originalIndex;
                              const ans = examAnswers[q.originalIndex];
                              const isSaved = (() => {
                                if (q.type === 'mcq') {
                                  return q.originalIndex === selectedQuestionIndex
                                    ? (draftMCQ !== null && draftMCQ !== undefined)
                                    : (ans?.selectedOptionIndex !== null && ans?.selectedOptionIndex !== undefined);
                                } else if (q.type === 'web') {
                                  const initHtml = q.initialHtml || '';
                                  const initCss = q.initialCss || '';
                                  const initJs = q.initialJs || '';
                                  return q.originalIndex === selectedQuestionIndex
                                    ? (draftHtml !== initHtml || draftCss !== initCss || draftJs !== initJs)
                                    : (ans?.submittedHtml !== undefined && (ans.submittedHtml !== initHtml || ans.submittedCss !== initCss || ans.submittedJs !== initJs));
                                } else {
                                  const initCode = q.initialTemplate || DEFAULT_TEMPLATES.cpp;
                                  return q.originalIndex === selectedQuestionIndex
                                    ? (draftCode && draftCode.trim().length > 0 && draftCode !== initCode)
                                    : (ans?.submittedCode && ans.submittedCode.trim().length > 0 && ans.submittedCode !== initCode);
                                }
                              })();
                              const isFlagged = q.flaggedForReview;

                              return (
                                <button
                                  key={q.originalIndex}
                                  type="button"
                                  onClick={() => {
                                    // Sync current changes before switching
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
                                    saveServerDraft(updated);
                                    setSelectedQuestionIndex(q.originalIndex);
                                  }}
                                  style={{
                                    padding: '8px 0',
                                    fontSize: '8.5pt',
                                    fontWeight: 'bold',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    border: isCurrent 
                                      ? '2px solid #a855f7' 
                                      : (isFlagged ? '1px solid #c084fc' : '1px solid #cbd5e1'),
                                    backgroundColor: isCurrent 
                                      ? '#f3e8ff' 
                                      : (isSaved ? '#10b981' : (isFlagged ? '#faf5ff' : '#f8fafc')),
                                    color: isCurrent 
                                      ? '#6b21a8' 
                                      : (isSaved ? '#ffffff' : (isFlagged ? '#7e22ce' : '#475569')),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative'
                                  }}
                                  title={`Question ${q.originalIndex + 1}: ${q.type.toUpperCase()}`}
                                >
                                  {q.originalIndex + 1}
                                  {isFlagged && (
                                    <span style={{
                                      position: 'absolute',
                                      top: '2px',
                                      right: '2px',
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '50%',
                                      backgroundColor: '#a855f7'
                                    }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              
              {/* Legend guide */}
              <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '7.5pt', color: '#64748b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#dbeafe', border: '1px solid #2563eb' }} />
                  <span>Current</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#10b981' }} />
                  <span>Attempted</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#faf5ff', border: '1px solid #a855f7' }} />
                  <span>Flagged</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }} />
                  <span>Unvisited</span>
                </div>
              </div>
            </div>
          )}

          {/* Left Pane: Question Description */}
          <div className="cf-card" style={{ flex: '0 0 calc(50% - 10px)', margin: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', minHeight: 0, position: 'relative' }}>
            <CandidateWatermark email={candidate?.email || candidate?.studentId || candidate?.name} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3b5998', paddingBottom: '8px', zIndex: 11 }}>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
                Question {selectedQuestionIndex + 1} of {test.questions.length}
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    fontSize: '8.5pt',
                    fontWeight: 'bold',
                    backgroundColor: isSidebarOpen ? '#faf5ff' : '#ffffff',
                    border: isSidebarOpen ? '2px solid #a855f7' : '1px solid #cbd5e1',
                    color: '#7e22ce',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    margin: 0
                  }}
                  title={isSidebarOpen ? "Close Questions Panel" : "Open Questions Panel"}
                >
                  <CheckSquare size={13} style={{ color: '#7e22ce' }} />
                  <span>Questions Panel</span>
                </button>
                {(() => {
                  const isFlagged = test?.questions?.[selectedQuestionIndex]?.flaggedForReview || false;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const updatedQuestions = [...test.questions];
                        updatedQuestions[selectedQuestionIndex].flaggedForReview = !isFlagged;
                        setTest({ ...test, questions: updatedQuestions });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '8.5pt',
                        fontWeight: 'bold',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: '1px solid #c084fc',
                        backgroundColor: isFlagged ? '#a855f7' : '#ffffff',
                        color: isFlagged ? '#ffffff' : '#7e22ce',
                        transition: 'all 0.2s ease-in-out',
                        margin: 0
                      }}
                      title={isFlagged ? "Remove Flag" : "Flag for Review"}
                    >
                      <Flag size={13} fill={isFlagged ? '#ffffff' : 'none'} style={{ color: isFlagged ? '#ffffff' : '#7e22ce' }} />
                      <span>{isFlagged ? 'Flagged for Review' : 'Flag for Review'}</span>
                    </button>
                  );
                })()}
                <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '8pt', fontWeight: 'bold' }}>
                  POINTS: {test.questions[selectedQuestionIndex].points || 0}
                </span>
              </div>
            </div>

            {/* If MCQ, show selection instruction box before the question */}
            {test.questions[selectedQuestionIndex].type === 'mcq' && (
              <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: '4px', zIndex: 11 }}>
                <RichText
                  text="Please select the correct option response to the question on the right workspace panel."
                  style={{ fontSize: '9.5pt', color: '#555', lineHeight: '1.6' }}
                />
              </div>
            )}

            {/* Question Title / Header */}
            <RichText
              text={test.questions[selectedQuestionIndex].questionText || test.questions[selectedQuestionIndex].title || test.questions[selectedQuestionIndex].description || test.questions[selectedQuestionIndex].question || ''}
              style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', lineHeight: '1.5', zIndex: 11 }}
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

            {/* Render question description and examples for coding / web types */}
            {test.questions[selectedQuestionIndex].type !== 'mcq' && (
              <div style={{ zIndex: 11, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <RichText
                  text={test.questions[selectedQuestionIndex].description || test.questions[selectedQuestionIndex].questionText || ''}
                  style={{ fontSize: '9.5pt', color: '#334155', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
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
            )}

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
          <div className="cf-card" style={{
            flex: '0 0 calc(50% - 10px)',
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
                                    <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '2px' }}>Case 26{String(selectedQuestionIndex + 1).padStart(2, '0')}{String(tcIdx + 1).padStart(2, '0')}:</div>
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
                                            <span>{isPassed ? 'Passed' : (res.status || 'Wrong Answer')} - 26{String(selectedQuestionIndex + 1).padStart(2, '0')}{String(rIdx + 1).padStart(2, '0')} ({isSample ? 'Sample' : 'Hidden'})</span>
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
                    cursor: (isRunningCode || !isOnline) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    margin: 0,
                    opacity: !isOnline ? 0.6 : 1
                  }}
                  onClick={handleRunCode}
                  disabled={isRunningCode || !isOnline}
                >
                  {isRunningCode ? <Loader2 className="cf-spinner" size={14} /> : <Play size={14} />}
                  {!isOnline ? 'Compiler Offline' : (isRunningCode ? 'Running...' : 'Run Code')}
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

  // VIEW: Evaluated Answer Sheet Verification Review (Long vertically scrollable paper)
  if (flow === 'verification_review') {
    const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || (
      window.location.origin.includes('localhost')
        ? 'http://localhost:5173/'
        : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
    );

    const questions = test?.questions || [];
    const answers = submission?.answers || [];
    const objections = submission?.objections || [];
    
    // Calculate totals
    const totalMax = questions.reduce((sum, q) => sum + Number(q.points || 0), 0);
    const totalScored = (submission?.evaluation?.mcqScore || 0) + (submission?.evaluation?.codingScore || 0);
    const percentage = totalMax > 0 ? Math.round((totalScored / totalMax) * 100) : 0;

    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        color: '#1e293b'
      }}>
        {/* Anti-screenshot Watermark */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: 0.045,
          backgroundImage: `radial-gradient(#002147 0.75px, transparent 0.75px), radial-gradient(#002147 0.75px, #f1f5f9 0.75px)`,
          backgroundSize: '30px 30px',
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'space-around',
          justifyContent: 'space-around',
          overflow: 'hidden',
          userSelect: 'none'
        }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={i} style={{ transform: 'rotate(-25deg)', fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '25px' }}>
              {candidate?.studentId || 'BICS'} • {candidate?.email || 'verified'}
            </span>
          ))}
        </div>

        {/* Sticky Top Header Bar */}
        <header style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          backgroundColor: '#ffffff',
          color: '#0f172a',
          padding: '12px 28px',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '36px', width: '36px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '11pt', fontWeight: 'bold', color: '#0f172a', letterSpacing: '0.2px' }}>
                BICS Examination Portal
              </div>
              <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                Evaluated Candidate Script Verification • {test?.title || 'Academic Assessment'}
              </div>
            </div>
          </div>

          {/* Center Score & Verification Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '6px 14px',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '7pt', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', letterSpacing: '0.5px' }}>Overall Score</div>
              <div style={{ fontSize: '12.5pt', fontWeight: 'bold', color: '#0f172a' }}>
                {totalScored} <span style={{ fontSize: '9pt', color: '#64748b', fontWeight: 'normal' }}>/ {totalMax} Marks ({percentage}%)</span>
              </div>
            </div>

            {test?.verificationStatus === 'closed' ? (
              <div style={{
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '8.5pt',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Lock size={15} /> Verification Closed
              </div>
            ) : (
              <div style={{
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '8.5pt',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <ShieldCheck size={16} /> Verification Active
              </div>
            )}
          </div>

          {/* Right Profile & Return Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right', fontSize: '8.5pt' }}>
              <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{candidate?.name || 'Candidate'}</div>
              <div style={{ color: '#64748b' }}>ID: {candidate?.studentId || 'N/A'}</div>
            </div>

            <button
              onClick={() => window.location.href = dashboardUrl}
              style={{
                backgroundColor: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '8.5pt',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ← Return to Student Portal
            </button>
          </div>
        </header>

        {/* Main Continuous Document Container */}
        <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '30px 20px', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Exam Paper Title Header Card */}
          <div className="cf-card" style={{ padding: '24px 28px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '15px' }}>
              <div>
                <h1 style={{ fontSize: '15pt', color: '#0f172a', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                  {test?.title || "BICS Examination Paper"}
                </h1>
                <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                  Basic Introductory Computer Science • Academic Script Verification
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#475569' }}>
                <div><strong>Submission Date:</strong> {submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString() : 'Recorded'}</div>
                <div><strong>Evaluation Status:</strong> <span style={{ color: test?.verificationStatus === 'closed' ? '#475569' : '#166534', fontWeight: 'bold' }}>{test?.verificationStatus === 'closed' ? 'Finalized (Verification Closed)' : 'Finalized & Verification Open'}</span></div>
              </div>
            </div>

            {/* Quick jump to question navigation chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Jump to Question:</span>
              {questions.map((q, idx) => {
                const ans = answers.find(a => String(a.questionId) === String(q.id)) || answers[idx] || {};
                const qScore = ans.score !== undefined ? ans.score : (q.type === 'mcq' ? (Number(ans.selectedOptionIndex) === Number(q.correctOptionIndex) ? (q.points || 0) : 0) : 0);
                const isFull = qScore === Number(q.points || 0);
                const isPartial = qScore > 0 && qScore < Number(q.points || 0);

                return (
                  <a
                    key={idx}
                    href={`#question-${idx + 1}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      textDecoration: 'none',
                      backgroundColor: isFull ? '#dcfce7' : (isPartial ? '#fef3c7' : '#fee2e2'),
                      color: isFull ? '#15803d' : (isPartial ? '#b45309' : '#b91c1c'),
                      border: `1px solid ${isFull ? '#86efac' : (isPartial ? '#fcd34d' : '#fca5a5')}`
                    }}
                  >
                    Q{idx + 1} ({qScore}/{q.points})
                  </a>
                );
              })}
            </div>
          </div>

          {/* Notice banner if verification is closed */}
          {test?.verificationStatus === 'closed' && (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderLeft: '4px solid #64748b',
              borderRadius: '6px',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '9pt',
              color: '#334155'
            }}>
              <Lock size={18} style={{ color: '#64748b', flexShrink: 0 }} />
              <div>
                <strong>Verification &amp; Objection Window Closed:</strong> The verification period for this examination has concluded. You can inspect your evaluated answer script, official solutions, and final awarded scores below in read-only mode.
              </div>
            </div>
          )}

          {/* Questions Render Loop */}
          {questions.map((q, idx) => {
            const ans = answers.find(a => String(a.questionId) === String(q.id)) || answers[idx] || {};
            const obj = objections.find(o => o.questionIndex === idx || String(o.questionId) === String(q.id));
            const qScore = ans.score !== undefined ? ans.score : (q.type === 'mcq' ? (Number(ans.selectedOptionIndex) === Number(q.correctOptionIndex) ? (q.points || 0) : 0) : 0);
            const isFull = qScore === Number(q.points || 0);
            const isPartial = qScore > 0 && qScore < Number(q.points || 0);

            const activeWebTab = webDevPreviewTabs[idx] || 'html';

            return (
              <div
                key={q.id || idx}
                id={`question-${idx + 1}`}
                className="cf-card"
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  padding: '25px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px'
                }}
              >
                {/* Question Header Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{
                      backgroundColor: '#002147',
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontSize: '9.5pt',
                      padding: '4px 12px',
                      borderRadius: '4px'
                    }}>
                      Question {idx + 1}
                    </span>
                    <span style={{ fontSize: '9pt', color: '#64748b', fontWeight: 'bold' }}>
                      Section: {q.section || (q.type === 'mcq' ? 'Multiple Choice' : (q.type === 'coding' ? 'C++ Algorithm' : 'Web Development'))}
                    </span>
                    <span style={{ fontSize: '8pt', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                      {q.type}
                    </span>
                  </div>

                  {/* Score Pill */}
                  <div style={{
                    backgroundColor: isFull ? '#dcfce7' : (isPartial ? '#fef3c7' : '#fee2e2'),
                    color: isFull ? '#15803d' : (isPartial ? '#b45309' : '#b91c1c'),
                    border: `1px solid ${isFull ? '#86efac' : (isPartial ? '#fcd34d' : '#fca5a5')}`,
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontWeight: 'bold',
                    fontSize: '9.5pt',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {isFull ? <Check size={15} /> : (isPartial ? <span>~</span> : <X size={15} />)}
                    <span>Score: {qScore} / {q.points} Points</span>
                  </div>
                </div>

                {/* Question Text & Description */}
                <div>
                  {q.type === 'mcq' ? (
                    <div style={{ fontSize: '11pt', color: '#0f172a', fontWeight: 'bold', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                      <RichText text={q.questionText || q.title || q.description || q.question || q.statement || `Question #${idx + 1}`} />
                    </div>
                  ) : (
                    <>
                      <h3 style={{ fontSize: '11.5pt', color: '#0f172a', fontWeight: 'bold', margin: '0 0 8px 0', lineHeight: 1.5 }}>
                        {q.title || `Problem Statement #${idx + 1}`}
                      </h3>
                      {(q.description || q.questionText) && (
                        <div style={{ fontSize: '10pt', color: '#334155', lineHeight: 1.6 }}>
                          <RichText text={q.description || q.questionText} />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Objection Status or Action Button */}
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 16px' }}>
                  {obj ? (
                    <div style={{
                      backgroundColor: obj.status === 'resolved' ? '#f0fdf4' : (obj.status === 'rejected' ? '#fef2f2' : '#fffbeb'),
                      border: `1px solid ${obj.status === 'resolved' ? '#86efac' : (obj.status === 'rejected' ? '#fca5a5' : '#fcd34d')}`,
                      borderRadius: '6px',
                      padding: '12px 15px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Flag size={16} style={{ color: obj.status === 'resolved' ? '#166534' : (obj.status === 'rejected' ? '#991b1b' : '#b45309') }} />
                          <strong style={{ fontSize: '9.5pt', color: obj.status === 'resolved' ? '#166534' : (obj.status === 'rejected' ? '#991b1b' : '#b45309') }}>
                            Objection Filed on Q{idx + 1} ({obj.status.toUpperCase()})
                          </strong>
                        </div>
                        <span style={{ fontSize: '8pt', color: '#64748b' }}>
                          Raised on: {new Date(obj.raisedAt).toLocaleString()}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '9pt', color: '#334155' }}>
                        <strong>Reason:</strong> {obj.reason}<br />
                        <strong>Candidate Comments:</strong> {obj.details}
                      </div>

                      {obj.adminRemarks && (
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.7)', borderLeft: '3px solid #3b5998', padding: '8px 12px', fontSize: '8.5pt', marginTop: '4px' }}>
                          <strong>Committee Resolution Remarks:</strong> {obj.adminRemarks}
                          {obj.resolvedMarks !== undefined && (
                            <div style={{ color: '#166534', fontWeight: 'bold', marginTop: '2px' }}>
                              Revised Marks Awarded: {obj.resolvedMarks} / {q.points}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : test?.verificationStatus === 'closed' ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic' }}>
                        Verification &amp; objection window is closed. Marks for this question are finalized.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ fontSize: '9pt', color: '#64748b' }}>
                        Disagree with the automated evaluation or marks awarded for this question?
                      </div>
                      <button
                        className="cf-btn-secondary"
                        onClick={() => handleOpenObjectionModal(idx, q.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          fontSize: '8.5pt',
                          fontWeight: 'bold',
                          color: '#b45309',
                          borderColor: '#fcd34d',
                          backgroundColor: '#fffbeb'
                        }}
                      >
                        <Flag size={14} /> Raise Objection on Q{idx + 1}
                      </button>
                    </div>
                  )}
                </div>

                {/* Submitted Content Display: MCQ vs Coding vs Web */}
                {q.type === 'mcq' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                      Options Evaluation:
                    </div>
                    {(q.options || []).map((opt, optIdx) => {
                      const isCandidateChoice = Number(ans.selectedOptionIndex) === optIdx;
                      const isOfficialCorrect = Number(q.correctOptionIndex) === optIdx;

                      let borderColor = '#e2e8f0';
                      let bgColor = '#ffffff';
                      let badge = null;

                      if (isCandidateChoice && isOfficialCorrect) {
                        borderColor = '#22c55e';
                        bgColor = '#f0fdf4';
                        badge = <span style={{ color: '#166534', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>✓ Your Choice (Correct)</span>;
                      } else if (isCandidateChoice && !isOfficialCorrect) {
                        borderColor = '#ef4444';
                        bgColor = '#fef2f2';
                        badge = <span style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>✗ Your Selection (Incorrect)</span>;
                      } else if (isOfficialCorrect) {
                        borderColor = '#22c55e';
                        bgColor = '#f0fdf4';
                        badge = <span style={{ color: '#166534', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>★ Official Answer Key</span>;
                      }

                      return (
                        <div
                          key={optIdx}
                          style={{
                            border: `2px solid ${borderColor}`,
                            backgroundColor: bgColor,
                            borderRadius: '6px',
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '15px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '9.5pt' }}>
                            <span style={{ fontWeight: 'bold', color: '#64748b', width: '20px' }}>
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span>{opt}</span>
                          </div>
                          {badge}
                        </div>
                      );
                    })}

                    {/* Official Solution Explanation */}
                    {q.explanation && (
                      <div style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid #3b5998', padding: '14px 18px', borderRadius: '4px', marginTop: '10px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '9pt', color: '#002147', marginBottom: '4px' }}>
                          Official Rationale & Solution Explanation:
                        </div>
                        <div style={{ fontSize: '9.5pt', color: '#334155', lineHeight: 1.6 }}>
                          <RichText text={q.explanation} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {q.type === 'coding' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                      Your Submitted C++ Source Code:
                    </div>
                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                      <Editor
                        height="260px"
                        language="cpp"
                        theme="vs-light"
                        value={ans.submittedCode || "// No code was submitted for this problem."}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 13,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          automaticLayout: true
                        }}
                      />
                    </div>

                    {/* Testcase Results Matrix */}
                    <div>
                      <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Automated Testcase Evaluation Matrix:
                      </div>
                      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                              <th style={{ padding: '8px 12px' }}>Testcase</th>
                              <th style={{ padding: '8px 12px' }}>Type</th>
                              <th style={{ padding: '8px 12px' }}>Input</th>
                              <th style={{ padding: '8px 12px' }}>Expected Output</th>
                              <th style={{ padding: '8px 12px' }}>Evaluation Verdict</th>
                              <th style={{ padding: '8px 12px' }}>Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(q.testCases || []).map((tc, tcIdx) => {
                              const tcRes = ans.testCaseResults?.[tcIdx] || {};
                              const statusLower = String(tcRes.status || '').toLowerCase();
                              const isAcceptedStatus = statusLower === 'accepted' || statusLower === 'passed' || statusLower.includes('accept');
                              const isPassed = isAcceptedStatus || (tcRes.scoredPoints !== undefined && Number(tcRes.scoredPoints) > 0) || (isFull && (!ans.testCaseResults || ans.testCaseResults.length === 0));
                              
                              const pointsScored = tcRes.scoredPoints !== undefined ? Number(tcRes.scoredPoints) : (isPassed ? Number(tc.points || 15) : 0);
                              const maxPoints = tc.points !== undefined ? Number(tc.points) : (tcRes.points !== undefined ? Number(tcRes.points) : 15);
                              const displayVerdict = tcRes.status ? (isPassed ? `✓ ${tcRes.status}` : `✗ ${tcRes.status}`) : (isPassed ? '✓ Accepted (Passed)' : '✗ Failed / Mismatch');

                              return (
                                <tr key={tcIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                    26{String(idx + 1).padStart(2, '0')}{String(tcIdx + 1).padStart(2, '0')}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{ fontSize: '7.5pt', padding: '2px 6px', borderRadius: '3px', backgroundColor: tc.isSample ? '#e0e7ff' : '#f1f5f9', color: tc.isSample ? '#4338ca' : '#475569' }}>
                                      {tc.isSample ? 'Sample' : 'Hidden'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{tc.input || '(stdin empty)'}</td>
                                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{tc.output || '(no output)'}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{
                                      fontSize: '8pt',
                                      fontWeight: 'bold',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      backgroundColor: isPassed ? '#dcfce7' : '#fee2e2',
                                      color: isPassed ? '#15803d' : '#b91c1c'
                                    }}>
                                      {displayVerdict}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>
                                    {pointsScored} / {maxPoints}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {q.type === 'web' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                        Submitted Web Solution:
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['html', 'css', 'js', 'preview'].map(tab => (
                          <button
                            key={tab}
                            onClick={() => setWebDevPreviewTabs(prev => ({ ...prev, [idx]: tab }))}
                            style={{
                              padding: '5px 12px',
                              fontSize: '8.5pt',
                              fontWeight: 'bold',
                              borderRadius: '4px',
                              border: activeWebTab === tab ? '1px solid #3b5998' : '1px solid #cbd5e1',
                              backgroundColor: activeWebTab === tab ? '#3b5998' : '#ffffff',
                              color: activeWebTab === tab ? '#ffffff' : '#475569',
                              cursor: 'pointer'
                            }}
                          >
                            {tab.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeWebTab === 'preview' ? (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', height: '280px', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                        <iframe
                          title={`web-preview-${idx}`}
                          sandbox="allow-scripts"
                          srcDoc={`<!DOCTYPE html><html><head><style>${ans.submittedCss || ''}</style></head><body>${ans.submittedHtml || ''}<script>${ans.submittedJs || ''}<\/script></body></html>`}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                        <Editor
                          height="240px"
                          language={activeWebTab === 'html' ? 'html' : (activeWebTab === 'css' ? 'css' : 'javascript')}
                          theme="vs-light"
                          value={activeWebTab === 'html' ? (ans.submittedHtml || '') : (activeWebTab === 'css' ? (ans.submittedCss || '') : (ans.submittedJs || ''))}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            automaticLayout: true
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Proctoring Audit Integrity Card */}
          <div className="cf-card" style={{ padding: '20px 25px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <h4 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} style={{ color: '#3b5998' }} />
              <span>Proctoring Integrity Audit & Telemetry Log</span>
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', fontSize: '9pt' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ color: '#64748b' }}>Fullscreen Exits Recorded:</div>
                <div style={{ fontSize: '12pt', fontWeight: 'bold', color: (submission?.proctoringLog?.fullscreenExits || 0) > 0 ? '#b91c1c' : '#15803d' }}>
                  {submission?.proctoringLog?.fullscreenExits || 0} Exits
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ color: '#64748b' }}>Window Focus Losses / Tab Switches:</div>
                <div style={{ fontSize: '12pt', fontWeight: 'bold', color: (submission?.proctoringLog?.tabSwitches || 0) > 0 ? '#b91c1c' : '#15803d' }}>
                  {submission?.proctoringLog?.tabSwitches || 0} Switches
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ color: '#64748b' }}>Webcam AI Biometric Telemetry:</div>
                <div style={{ fontSize: '12pt', fontWeight: 'bold', color: '#15803d' }}>
                  Active & Matched
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Objection Modal Dialog */}
        {objectionModal.isOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '520px',
              width: '100%',
              padding: '25px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <h3 style={{ fontSize: '13pt', color: '#002147', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Flag size={18} style={{ color: '#b45309' }} />
                  <span>Raise Objection: Question {objectionModal.questionIndex !== null ? objectionModal.questionIndex + 1 : ''}</span>
                </h3>
                <button
                  onClick={handleCloseObjectionModal}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={18} />
                </button>
              </div>

              {objectionModal.error && (
                <div style={{
                  color: '#dc2626',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  fontSize: '9pt',
                  fontWeight: '500'
                }}>
                  {objectionModal.error}
                </div>
              )}

              {objectionModal.success && (
                <div className="cf-alert cf-alert-success" style={{ fontSize: '8.5pt' }}>
                  {objectionModal.success}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Select Objection Category:
                  </label>
                  <select
                    value={objectionModal.reason}
                    onChange={(e) => setObjectionModal(prev => ({ ...prev, reason: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                  >
                    <option value="Testcase evaluation discrepancy">Testcase evaluation discrepancy / Hidden testcase error</option>
                    <option value="MCQ answer key discrepancy">MCQ answer key discrepancy / Alternate correct option</option>
                    <option value="Partial marks allocation request">Partial marks allocation request</option>
                    <option value="Compiler runtime or format discrepancy">Compiler runtime or output format discrepancy</option>
                    <option value="Other grievance">Other academic grievance</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Detailed Remarks & Explanation:
                  </label>
                  <textarea
                    rows={4}
                    value={objectionModal.details}
                    onChange={(e) => setObjectionModal(prev => ({ ...prev, details: e.target.value }))}
                    placeholder="Provide clear technical rationale why your answer or logic deserves credit..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  className="cf-btn-secondary"
                  onClick={handleCloseObjectionModal}
                  disabled={objectionModal.submitting}
                  style={{ padding: '8px 16px', fontSize: '9pt' }}
                >
                  Cancel
                </button>
                <button
                  className="cf-btn-primary"
                  onClick={handleSubmitObjection}
                  disabled={objectionModal.submitting}
                  style={{ padding: '8px 18px', fontSize: '9pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {objectionModal.submitting ? <Loader2 className="spinner" size={14} /> : <Send size={14} />}
                  <span>{objectionModal.submitting ? 'Submitting...' : 'Submit Objection'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <CenteredFooter />
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
              (() => {
                const subId = submission?._id || submission?.id;
                const pendingSubmitKey = subId ? `bics_pending_submit_${subId}` : '';
                const isPendingSubmit = hasPendingSubmit;

                if (isPendingSubmit) {
                  return (
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
                        ⚠️ Do not close this tab or refresh the browser. Refreshing or closing this tab while sync is in progress will interrupt the session upload.
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
                          const cachedPayload = localStorage.getItem(pendingSubmitKey);
                          if (!cachedPayload) return;
                          setSyncStatus('initiating');
                          try {
                            const payload = JSON.parse(cachedPayload);
                            setSyncStatus('uploading');
                            const res = await fetch(`${API_BASE}/tests/submit`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload)
                            });
                            setSyncStatus('processing');
                            const data = await res.json();
                            if (data.success) {
                              localStorage.removeItem(pendingSubmitKey);
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
                  );
                }

                return (
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
                );
              })()
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
