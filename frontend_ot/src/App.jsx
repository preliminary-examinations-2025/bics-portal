import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, Camera, Mic, Maximize, AlertTriangle, CheckSquare, Info, Award, Loader2, ArrowRight
} from 'lucide-react';
import Editor from '@monaco-editor/react';

const API_BASE = import.meta.env.VITE_API_BASE || (
  window.location.origin.includes('localhost')
    ? 'http://localhost:5000/api'
    : `${window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')}/api`
);

const DEFAULT_TEMPLATES = {
  c: ``,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your C++ code here\n    return 0;\n}`,
  python: ``,
  java: ``
};

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
  const [examTimeLeft, setExamTimeLeft] = useState(0);
  const [proctoringWarnings, setProctoringWarnings] = useState({ fullscreenExits: 0, tabSwitches: 0 });
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);

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

  // Check Fullscreen state
  useEffect(() => {
    const onFSChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      
      if (flow === 'active_exam' && !fs) {
        setProctoringWarnings(prev => {
          const val = { ...prev, fullscreenExits: prev.fullscreenExits + 1 };
          if (val.fullscreenExits + val.tabSwitches >= 3) {
            autoSubmitExam(val);
          } else {
            setShowWarningModal(true);
            syncProctoringLogs(val);
          }
          return val;
        });
      }
    };

    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, [flow]);

  // Check Window Focus state
  useEffect(() => {
    const onBlur = () => {
      setIsFocused(false);
      if (flow === 'active_exam') {
        setProctoringWarnings(prev => {
          const val = { ...prev, tabSwitches: prev.tabSwitches + 1 };
          if (val.fullscreenExits + val.tabSwitches >= 3) {
            autoSubmitExam(val);
          } else {
            setShowWarningModal(true);
            syncProctoringLogs(val);
          }
          return val;
        });
      }
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

  // Sync current question values into draft buffers
  useEffect(() => {
    if (test && test.questions?.[selectedQuestionIndex]) {
      const activeAns = examAnswers[selectedQuestionIndex];
      setDraftMCQ(activeAns?.selectedOptionIndex ?? null);
      setDraftCode(activeAns?.submittedCode ?? '');
      setDraftLanguage(activeAns?.selectedLanguage ?? 'cpp');
    }
  }, [selectedQuestionIndex, test, examAnswers]);

  // Sync draft buffers into global answers list
  const handleSaveAndNext = () => {
    const updated = [...examAnswers];
    updated[selectedQuestionIndex] = {
      ...updated[selectedQuestionIndex],
      selectedOptionIndex: draftMCQ,
      submittedCode: draftCode,
      selectedLanguage: draftLanguage
    };
    setExamAnswers(updated);
    
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
          status: 'submitted'
        })
      });
    } catch (e) {
      console.warn("Failed to sync background draft with database:", e);
    }
  };

  const syncProctoringLogs = async (warningsObj) => {
    try {
      if (!submission) return;
      await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission._id || submission.id,
          answers: examAnswers,
          proctoringLog: warningsObj,
          status: 'submitted'
        })
      });
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
          <div className="header-left">
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
          <div className="header-left">
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
            🏆 Proctoring Verification &amp; Setup: {test?.title}
          </div>
          
          {/* Important Notice */}
          <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid #3b5998', padding: '12px 15px', color: '#1e3a8a', fontSize: '9.5pt', margin: '20px', borderRadius: '4px', lineHeight: '1.5' }}>
            <strong>Important Notice:</strong> This examination session is strictly proctored. You must authorize your webcam stream, enable fullscreen lock, and satisfy all security check status parameters below.
          </div>

          {/* Guidelines Body side-by-side splits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '25px', padding: '0 20px 20px 20px' }}>
            
            {/* Left guidelines column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', margin: 0 }}>📄 Examination Guidelines:</h4>
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
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', margin: 0 }}>📷 Camera Calibration:</h4>
              
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
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Verified</span>
                  ) : (
                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ Focus Lost!</span>
                  )}
                </div>

                {/* Parameter 2: Camera */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                  <span style={{ color: '#555' }}>2. Camera Proctored:</span>
                  {webcamGranted ? (
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Active</span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>Awaiting Access</span>
                  )}
                </div>

                {/* Parameter 3: Microphone */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                  <span style={{ color: '#555' }}>3. Microphone Proctored:</span>
                  {micGranted ? (
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Active</span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>Awaiting Access</span>
                  )}
                </div>

                {/* Parameter 4: Fullscreen */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt' }}>
                  <span style={{ color: '#555' }}>4. Fullscreen Mode:</span>
                  {isFullscreen ? (
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Locked</span>
                  ) : (
                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ Not Fullscreen</span>
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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', padding: '20px', gap: '20px' }}>
        
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
            ⏱️ {formatTimer(examTimeLeft)} remaining
          </div>

          <div>
            <button className="cf-btn-primary" style={{ borderColor: '#ef4444', color: '#ef4444', fontWeight: 'bold', padding: '6px 12px', fontSize: '9pt' }} onClick={handleManualSubmitExam}>
              Finalize &amp; Submit Test
            </button>
          </div>
        </div>

        {/* Split Screen Workspace */}
        <div style={{ display: 'flex', gap: '20px', flexGrow: 1, minHeight: 'calc(100vh - 180px)' }}>
          
          {/* Left Pane: Question Description */}
          <div className="cf-card" style={{ flex: '1 1 40%', margin: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3b5998', paddingBottom: '8px' }}>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
                Question {selectedQuestionIndex + 1} of {test.questions.length}
              </h4>
              <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '8pt', fontWeight: 'bold' }}>
                POINTS: {test.questions[selectedQuestionIndex].points || 0}
              </span>
            </div>

            <div style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#333', lineHeight: '1.5' }}>
              {test.questions[selectedQuestionIndex].title}
            </div>

            {test.questions[selectedQuestionIndex].imageUrl && (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', backgroundColor: '#fff', textAlign: 'center' }}>
                <img
                  src={test.questions[selectedQuestionIndex].imageUrl}
                  alt="Question Diagram Context"
                  style={{ maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '2px' }}
                />
              </div>
            )}

            {/* If Coding Question, render description and example test cases */}
            {test.questions[selectedQuestionIndex].type === 'coding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '9.5pt', color: '#555', whiteSpace: 'pre-wrap', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  {test.questions[selectedQuestionIndex].description}
                </div>

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

            {/* If MCQ, statement is on left and options on right - so left panel only shows statement details */}
            {test.questions[selectedQuestionIndex].type === 'mcq' && (
              <div style={{ fontSize: '9.5pt', color: '#555', whiteSpace: 'pre-wrap', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                {test.questions[selectedQuestionIndex].description || "Please select the correct option response to the question on the right workspace panel."}
              </div>
            )}

            {/* Left Pane bottom footer question grid switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '15px', marginTop: 'auto', alignItems: 'center' }}>
              <button
                className="cf-btn-secondary"
                disabled={selectedQuestionIndex === 0}
                onClick={() => setSelectedQuestionIndex(selectedQuestionIndex - 1)}
                style={{ padding: '6px 12px', fontSize: '9pt' }}
              >
                ← Previous
              </button>
              
              <div style={{ display: 'flex', gap: '5px' }}>
                {test.questions.map((_, qIdx) => (
                  <button
                    key={qIdx}
                    onClick={() => setSelectedQuestionIndex(qIdx)}
                    className={selectedQuestionIndex === qIdx ? 'cf-btn-primary' : 'cf-btn-secondary'}
                    style={{
                      minWidth: '32px',
                      height: '32px',
                      padding: '0',
                      fontSize: '9pt',
                      fontWeight: selectedQuestionIndex === qIdx ? 'bold' : 'normal',
                      border: selectedQuestionIndex === qIdx ? '2px solid #3b5998' : '1px solid #cbd5e1'
                    }}
                  >
                    {qIdx + 1}
                  </button>
                ))}
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
          <div className="cf-card" style={{ flex: '1 1 60%', margin: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ borderBottom: '2px solid #3b5998', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
                {test.questions[selectedQuestionIndex].type === 'mcq' ? 'Select Option' : 'Workspace Editor'}
              </h4>
            </div>

            {test.questions[selectedQuestionIndex].type === 'mcq' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
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
                      <span style={{ fontSize: '9.5pt', fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#1e3a8a' : '#333' }}>
                        {opt}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                
                {/* Professional Language Selection Tabs & Reset Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #cbd5e1', paddingBottom: '0', marginBottom: '15px' }}>
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
                  <div style={{ paddingBottom: '4px' }}>
                    <button
                      className="cf-btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '8pt', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#ffffff', cursor: 'pointer' }}
                      onClick={() => {
                        triggerCustomConfirm(
                          "Reset Code Template?",
                          "Are you sure you want to reset the editor content? This will overwrite your current progress for this question.",
                          () => {
                            setDraftCode(test.questions[selectedQuestionIndex].initialTemplate || DEFAULT_TEMPLATES[draftLanguage]);
                          }
                        );
                      }}
                    >
                      Reset Template
                    </button>
                  </div>
                </div>

                {/* Professional Monaco Editor workspace */}
                <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', minHeight: '380px', backgroundColor: '#ffffff' }}>
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
                      suggestOnTriggerCharacters: true,
                      acceptSuggestionOnEnter: 'on',
                      snippetSuggestions: 'inline',
                      scrollbar: {
                        vertical: 'auto',
                        horizontal: 'auto'
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Save & Next button at the bottom right */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #cbd5e1', paddingTop: '15px', marginTop: 'auto' }}>
              <button
                type="button"
                className="cf-btn-primary"
                style={{ background: '#10b981', borderColor: '#10b981', color: '#ffffff', padding: '8px 16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer' }}
                onClick={handleSaveAndNext}
              >
                💾 Save &amp; {selectedQuestionIndex === test.questions.length - 1 ? 'Finish Question' : 'Next Question'}
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
              <div style={{ color: '#e11d48', fontSize: '32pt', marginBottom: '10px' }}>🚨</div>
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
      </div>
    );
  }

  // VIEW: Submission Complete screen
  if (flow === 'finished') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <header className="app-header">
          <div className="header-left">
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
