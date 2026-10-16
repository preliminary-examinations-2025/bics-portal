import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, Camera, Mic, Maximize, AlertTriangle, CheckSquare, Info, Award, Loader2, ArrowRight, Play,
  Check, X, Lock, Eye, Clock, Flag, BookOpen, FileText, Send, HelpCircle, ChevronDown, ExternalLink, ShieldCheck,
  Laptop, Smartphone, Tablet, Terminal, Code, Layers, FileCode, Maximize2, RotateCw, Grid, Copy, Paperclip, CheckCircle, Upload, Printer
} from 'lucide-react';
import Editor from '@monaco-editor/react';

// Modularized Views and Components
import { VerifyLoginView } from './views/VerifyLoginView';
import { LobbyLoadingView } from './views/LobbyLoadingView';
import { TermsConditionsView } from './views/TermsConditionsView';
import { SystemChecksView } from './views/SystemChecksView';
import { BiometricCheckView } from './views/BiometricCheckView';
import { GuidelinesSetupView } from './views/GuidelinesSetupView';
import { ActiveExamView } from './views/ActiveExamView';
import { EirfFormView } from './views/EirfFormView';
import { VerificationReviewView } from './views/VerificationReviewView';
import { FinishedView } from './views/FinishedView';
import { extractComprehensiveClientSecurity } from './utils/clientSecurity';
import { encryptEirfEnvelope, encryptPendingStorage, decryptPendingStorage } from './utils/eirfCrypto';
import { 
  saveOfflineSubmission, 
  getOfflineSubmission, 
  saveOfflineSnapshot, 
  getOfflineSnapshots, 
  clearOfflineSnapshots, 
  saveOfflineEvent, 
  getOfflineEvents, 
  clearOfflineEvents,
  saveOfflineDraft,
  getOfflineDraft
} from './utils/offlineDb';

const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase && !envBase.includes('onrender.com')) {
    return envBase;
  }
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.startsWith('192.168.') || 
    window.location.hostname.startsWith('10.') || 
    window.location.hostname.startsWith('172.')
  );
  return isLocal 
    ? `http://127.0.0.1:5000/api` 
    : (typeof window !== 'undefined' 
        ? `${window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')}/api` 
        : '/api');
})();

const API_ACCESS_SECRET = import.meta.env.VITE_API_ACCESS_SECRET || '';

const getReturnUrl = (targetPath = '/coursework/online-tests') => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.') || 
                  window.location.hostname.startsWith('10.') || 
                  window.location.hostname.startsWith('172.');
  const base = import.meta.env.VITE_DASHBOARD_URL || (
    isLocal
      ? 'http://localhost:5173'
      : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
  );
  const cleanBase = base.replace(/\/+$/, '');
  let subPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  if (!subPath.startsWith('/main/')) {
    subPath = `/main${subPath}`;
  }
  return `${cleanBase}${subPath}`;
};



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
    const codeBlocks = [];
    const imageBlocks = [];
    let placeholderIndex = 0;
    let formatted = String(raw).replace(/\r\n/g, '\n');

    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    // Extract markdown images BEFORE HTML escaping: ![alt](url)
    formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      const placeholder = `%%IMAGEBLOCK${placeholderIndex++}%%`;
      const cleanSrc = (src || '').trim();
      const isSafeUrl = /^(https?:\/\/|\/|data:image\/)/i.test(cleanSrc);
      imageBlocks.push({
        placeholder,
        alt: escapeHtml(alt || 'Question Image'),
        src: isSafeUrl ? escapeHtml(cleanSrc) : 'about:blank'
      });
      return placeholder;
    });

    // Temporarily extract triple-backtick code blocks
    formatted = formatted.replace(/```(?:cpp|c|python|java|html|css|js)?\n?([\s\S]*?)```/gi, (match, code) => {
      const placeholder = `%%CODEBLOCK${placeholderIndex++}%%`;
      codeBlocks.push({ placeholder, code: code.trim() });
      return placeholder;
    });

    // Temporarily extract double-dollar display math blocks with HTML escaping
    formatted = formatted.replace(/\$\$(.*?)\$\$/gs, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `$$${escapeHtml(mathContent)}$$` });
      return placeholder;
    });

    // Temporarily extract single-dollar inline math blocks with HTML escaping
    formatted = formatted.replace(/\$(.*?)\$/g, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `$${escapeHtml(mathContent)}$` });
      return placeholder;
    });

    // Temporarily extract \[...\] display math with HTML escaping
    formatted = formatted.replace(/\\\[(.*?)\\\]/gs, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `\\[${escapeHtml(mathContent)}\\]` });
      return placeholder;
    });

    // Temporarily extract \(...\) inline math with HTML escaping
    formatted = formatted.replace(/\\\((.*?)\\\)/g, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `\\(${escapeHtml(mathContent)}\\)` });
      return placeholder;
    });

    // Escape raw text sections for safety
    formatted = formatted
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Markdown inline styling
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code style="font-family: \'Roboto Mono\', Consolas, monospace; background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 90%; border: 1px solid #cbd5e1; color: #002147; font-weight: 600;">$1</code>');

    // Auto-detect and format raw/escaped HTML tags (excluding img) into markdown code pills
    formatted = formatted.replace(/&lt;(?:\/?(?!img)[a-z1-6]+(?:[\s=][^&>]*?)?)\/?&gt;/gi, (tag) => {
      return `<code style="font-family: 'Roboto Mono', Consolas, monospace; background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 90%; border: 1px solid #cbd5e1; color: #002147; font-weight: 600;">${tag}</code>`;
    });

    // Convert section headers (Input, Output, Note, Constraints, etc.)
    formatted = formatted.replace(/^(?:#{1,6}\s+)?(?:&lt;h[1-6]&gt;)?(?:<strong>)?(Input|Output|Note|Notes|Constraints|Interaction|Sample Input|Sample Output|Explanation|Additional Requirements|Question):?(?:<\/strong>)?(?:&lt;\/h[1-6]&gt;)?$/gim, (m, title) => {
      return `%%SECTIONTITLE%%${title}%%ENDSECTIONTITLE%%`;
    });

    // Parse lines in a paragraph into formatted HTML with tab-indented points
    const parseLinesWithIndentation = (paragraphText) => {
      const lines = paragraphText.split('\n');
      const resultLines = [];

      lines.forEach((line) => {
        const rawLine = line;
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        // Check for sub-bullet (indented with 2+ spaces or tab)
        const subBulletMatch = rawLine.match(/^(\s{2,}|\t+)([-*•])\s+(.*)$/);
        if (subBulletMatch) {
          resultLines.push(`
            <div style="display: flex; gap: 8px; margin: 4px 0 4px 32px; align-items: flex-start;">
              <span style="font-weight: 700; color: #0284c7; font-size: 9pt; margin-top: 1px;">•</span>
              <div style="flex: 1; color: #334155; line-height: 1.65;">${subBulletMatch[3]}</div>
            </div>
          `);
          return;
        }

        // Check for numbered point or bullet point: 1. 2. 1) A. B. - * •
        const listMatch = trimmedLine.match(/^(([0-9]+|[A-Z])[\.\)]|[-*•])\s+(.*)$/);
        if (listMatch) {
          const marker = listMatch[1];
          const content = listMatch[3];
          const isBullet = marker === '-' || marker === '*' || marker === '•';

          resultLines.push(`
            <div style="display: flex; gap: 10px; margin: 6px 0 6px 16px; align-items: flex-start;">
              <span style="font-weight: bold; color: #0284c7; min-width: ${isBullet ? '12px' : '22px'}; font-family: ${isBullet ? 'sans-serif' : '\'Roboto Mono\', monospace'}; text-align: left;">
                ${isBullet ? '•' : marker}
              </span>
              <div style="flex: 1; color: #0f172a; line-height: 1.65; text-align: justify; text-align-last: left;">${content}</div>
            </div>
          `);
          return;
        }

        // Normal paragraph line
        resultLines.push(`<div style="line-height: 1.7; margin-bottom: 4px; text-align: justify; text-align-last: left;">${trimmedLine}</div>`);
      });

      return resultLines.join('');
    };

    // Split by double newlines into clean paragraphs
    const rawParagraphs = formatted.split(/\n\s*\n/);
    const htmlChunks = [];

    rawParagraphs.forEach((p) => {
      const trimmed = p.trim();
      if (!trimmed) return;

      if (trimmed.includes('%%SECTIONTITLE%%')) {
        const parts = trimmed.split(/(%%SECTIONTITLE%%.*?%%ENDSECTIONTITLE%%)/g);
        parts.forEach(part => {
          const pt = part.trim();
          if (!pt) return;
          if (pt.startsWith('%%SECTIONTITLE%%') && pt.endsWith('%%ENDSECTIONTITLE%%')) {
            const titleName = pt.replace('%%SECTIONTITLE%%', '').replace('%%ENDSECTIONTITLE%%', '');
            htmlChunks.push(`<div class="cf-section-title" style="font-weight: bold; color: #002147; font-size: 10.5pt; margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-align: left;">${titleName}</div>`);
          } else {
            const content = parseLinesWithIndentation(pt);
            htmlChunks.push(`<div class="cf-paragraph" style="margin-bottom: 10px; line-height: 1.7; text-align: justify; text-align-last: left;">${content}</div>`);
          }
        });
      } else {
        const content = parseLinesWithIndentation(trimmed);
        htmlChunks.push(`<div class="cf-paragraph" style="margin-bottom: 10px; line-height: 1.7; text-align: justify; text-align-last: left;">${content}</div>`);
      }
    });

    let resultHtml = htmlChunks.length > 0 ? htmlChunks.join('') : parseLinesWithIndentation(formatted);

    // Restore Image Blocks into styled centered cards
    imageBlocks.forEach(({ placeholder, alt, src }) => {
      const imgHtml = `<div style="margin: 14px 0; text-align: center; border: 1px solid #bae6fd; border-radius: 6px; padding: 10px; background-color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><img src="${src}" alt="${alt}" style="max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 4px; display: inline-block;" /><div style="font-size: 8pt; color: #64748b; margin-top: 6px; font-style: italic;">${alt}</div></div>`;
      resultHtml = resultHtml.replace(placeholder, imgHtml);
    });

    // Restore Code Blocks with Light Theme
    codeBlocks.forEach(({ placeholder, code }) => {
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const codeHtml = `<pre style="background-color: #f8fafc; color: #0f172a; padding: 12px 16px; border-radius: 6px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 9.5pt; overflow-x: auto; margin: 12px 0; border: 1px solid #cbd5e1; line-height: 1.5; text-align: left;"><code>${escapedCode}</code></pre>`;
      resultHtml = resultHtml.replace(placeholder, codeHtml);
    });

    // Restore original LaTeX formulas back inside placeholders
    mathBlocks.forEach(({ placeholder, content }) => {
      resultHtml = resultHtml.replace(placeholder, content);
    });

    return resultHtml;
  };

  useEffect(() => {
    const renderMath = () => {
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
  }); // Run math rendering on every render cycle so KaTeX math is always preserved!

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
      zIndex: 10,
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(4, 1fr)',
      opacity: 0.10,
      transform: 'rotate(-15deg) scale(1.2)'
    }}>
      {repeatedEmails.map((e, idx) => (
        <div key={idx} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11pt',
          fontWeight: 'bold',
          color: '#002147',
          fontFamily: 'monospace'
        }}>
          {e}
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

  // Flow views: verify_login, lobby_loading, guidelines_setup, active_exam, finished, eirf_form
  const [flow, setFlow] = useState('verify_login'); 
  const [lobbyMessage, setLobbyMessage] = useState('');

  // EIRF Form State
  const [eirfDetails, setEirfDetails] = useState(null);
  const [eirfPrimaryCause, setEirfPrimaryCause] = useState('FULLSCREEN_EXIT');
  const [eirfAckUnderstand, setEirfAckUnderstand] = useState('Yes');
  const [eirfWarningCount, setEirfWarningCount] = useState('3 warnings (Auto-Submitted)');
  const [eirfTabReason, setEirfTabReason] = useState('');
  const [eirfFullscreenReason, setEirfFullscreenReason] = useState('');
  const [eirfInterruptions, setEirfInterruptions] = useState([]);
  const [eirfPeripherals, setEirfPeripherals] = useState('No, no peripherals were connected');
  const [eirfExplanation, setEirfExplanation] = useState('');
  const [eirfDeclarationChecked, setEirfDeclarationChecked] = useState(false);
  const [eirfFileContent, setEirfFileContent] = useState('');
  const [eirfFileName, setEirfFileName] = useState('');
  const [submittingEirf, setSubmittingEirf] = useState(false);
  const [eirfSuccessMessage, setEirfSuccessMessage] = useState('');
  const [eirfErrorMessage, setEirfErrorMessage] = useState('');
  const [eirfTimeLeft, setEirfTimeLeft] = useState('');
  const [isSubmitBtnHovered, setIsSubmitBtnHovered] = useState(false);

  // Proctoring Duration Tracking Refs
  const fsExitStartTimeRef = useRef(null);
  const tabExitStartTimeRef = useRef(null);

  // Proctoring setup calibration states
  const [webcamGranted, setWebcamGranted] = useState(false);
  const [webcamStream, setWebcamStream] = useState(null);
  const [micGranted, setMicGranted] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentRulesChecked, setConsentRulesChecked] = useState(false);
  const [consentProctoringChecked, setConsentProctoringChecked] = useState(false);
  const [baselinePhoto, setBaselinePhoto] = useState(null);
  const [securityMetadata, setSecurityMetadata] = useState(null);
  const [ambientNoiseFloorDb, setAmbientNoiseFloorDb] = useState(30);
  const [multiDisplayDetected, setMultiDisplayDetected] = useState(false);
  const [systemChecksCompleted, setSystemChecksCompleted] = useState(false);
  const [biometricsCache, setBiometricsCache] = useState(null);

  // Early Client Security Metadata & Display Configuration Detection
  useEffect(() => {
    let isMounted = true;
    extractComprehensiveClientSecurity()
      .then(meta => {
        if (isMounted && meta) {
          if (meta.isExtendedDisplay) setMultiDisplayDetected(true);
          setSecurityMetadata(prev => ({ ...meta, ...(prev || {}) }));
        }
      })
      .catch(err => {
        console.warn("Client security metadata notice:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Active Exam states
  const [examAnswers, setExamAnswers] = useState([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [showQuestionPalette, setShowQuestionPalette] = useState(false);
  const activeQuestionBtnRef = useRef(null);
  const navTrackRef = useRef(null);

  useEffect(() => {
    if (navTrackRef.current && activeQuestionBtnRef.current) {
      const track = navTrackRef.current;
      const btn = activeQuestionBtnRef.current;
      const trackWidth = track.clientWidth;
      const btnLeft = btn.offsetLeft;
      const btnWidth = btn.clientWidth;
      track.scrollTo({
        left: btnLeft - trackWidth / 2 + btnWidth / 2,
        behavior: 'smooth'
      });
    }
  }, [selectedQuestionIndex]);
  const [draftMCQ, setDraftMCQ] = useState(null);
  const [draftCode, setDraftCode] = useState('');
  const [draftLanguage, setDraftLanguage] = useState('cpp');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [draftJs, setDraftJs] = useState('');
  const [draftQIdx, setDraftQIdx] = useState(null);
  const [webActiveTab, setWebActiveTab] = useState('html'); // 'html' | 'css' | 'js'
  const [webConsoleLogs, setWebConsoleLogs] = useState([]); // Console output array
  const [isFullWebStudioOpen, setIsFullWebStudioOpen] = useState(false);
  const [webStudioViewportMode, setWebStudioViewportMode] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [webStudioConsoleOpen, setWebStudioConsoleOpen] = useState(false);
  const [examTimeLeft, setExamTimeLeft] = useState(0);
  const [proctoringWarnings, setProctoringWarnings] = useState({ fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0 });
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showQuestionInfoModal, setShowQuestionInfoModal] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runResults, setRunResults] = useState(null);
  const [compileError, setCompileError] = useState(null);
  const [consoleTab, setConsoleTab] = useState('testcase'); // 'testcase' or 'result'

  // Toast Notification for Blocked Actions & Alerts (Item B6)
  const [toastNotification, setToastNotification] = useState({ visible: false, message: '', title: 'Action Blocked', type: 'error' });
  const toastTimeoutRef = useRef(null);
  const showToast = (message, title = 'Action Blocked', type = 'error') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastNotification({ visible: true, message, title, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastNotification(prev => ({ ...prev, visible: false }));
    }, 4500);
  };

  // Cooldown window refs for Deduplication of Fullscreen Exit & Blur (Item 3.1)
  const lastFullscreenExitTimeRef = useRef(0);
  const lastWindowBlurTimeRef = useRef(0);
  const DEDUPLICATION_WINDOW_MS = 600;

  // Auto-commit draft tracking refs (Item 3)
  const prevSelectedQuestionIndexRef = useRef(0);
  const examAnswersRef = useRef(examAnswers);
  const draftMCQRef = useRef(draftMCQ);
  const draftCodeRef = useRef(draftCode);
  const draftLanguageRef = useRef(draftLanguage);
  const draftHtmlRef = useRef(draftHtml);
  const draftCssRef = useRef(draftCss);
  const draftJsRef = useRef(draftJs);

  useEffect(() => { examAnswersRef.current = examAnswers; }, [examAnswers]);
  useEffect(() => { draftMCQRef.current = draftMCQ; }, [draftMCQ]);
  useEffect(() => { draftCodeRef.current = draftCode; }, [draftCode]);
  useEffect(() => { draftLanguageRef.current = draftLanguage; }, [draftLanguage]);
  useEffect(() => { draftHtmlRef.current = draftHtml; }, [draftHtml]);
  useEffect(() => { draftCssRef.current = draftCss; }, [draftCss]);
  useEffect(() => { draftJsRef.current = draftJs; }, [draftJs]);

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
  const [verificationInstructionsModalOpen, setVerificationInstructionsModalOpen] = useState(false);
  const [verificationConsentChecked, setVerificationConsentChecked] = useState(false);
  const [objectionModal, setObjectionModal] = useState({
    isOpen: false,
    questionIndex: null,
    questionId: '',
    reason: 'Testcase evaluation discrepancy',
    details: '',
    attachments: [],
    uploadingAttachment: false,
    submitting: false,
    error: '',
    success: '',
    submittedObjectionId: null,
    copiedId: false
  });

  const handleCloseObjectionModal = () => {
    setObjectionModal({
      isOpen: false,
      questionIndex: null,
      questionId: '',
      reason: 'Testcase evaluation discrepancy',
      details: '',
      attachments: [],
      uploadingAttachment: false,
      submitting: false,
      error: '',
      success: '',
      submittedObjectionId: null,
      copiedId: false
    });
  };

  const handleCopyObjectionId = (objId) => {
    if (!objId) return;
    try {
      navigator.clipboard.writeText(objId);
      setObjectionModal(prev => ({ ...prev, copiedId: true }));
      setTimeout(() => {
        setObjectionModal(prev => ({ ...prev, copiedId: false }));
      }, 5000);
    } catch (e) {
      console.error("Clipboard copy failed:", e);
    }
  };

  const handleObjectionFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setObjectionModal(prev => ({ ...prev, uploadingAttachment: true }));
    const formData = new FormData();
    formData.append('imageFile', file);
    try {
      const res = await fetch(`${API_BASE}/admin/upload-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        setObjectionModal(prev => ({
          ...prev,
          uploadingAttachment: false,
          attachments: [...(prev.attachments || []), data.url]
        }));
      } else {
        alert(data.error || "Failed to upload supporting document.");
        setObjectionModal(prev => ({ ...prev, uploadingAttachment: false }));
      }
    } catch (err) {
      console.error(err);
      setObjectionModal(prev => ({ ...prev, uploadingAttachment: false }));
    }
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
          details: objectionModal.details,
          attachments: objectionModal.attachments || []
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
            objectionId: data.objectionId || `OBJ-${new Date().getFullYear()}-8F3A1`,
            questionId: String(objectionModal.questionId),
            questionIndex: Number(objectionModal.questionIndex),
            reason: objectionModal.reason,
            details: objectionModal.details,
            attachments: objectionModal.attachments || [],
            status: 'pending',
            raisedAt: new Date()
          }
        ]
      }));

      setObjectionModal(prev => ({
        ...prev,
        submitting: false,
        submittedObjectionId: data.objectionId || `OBJ-${new Date().getFullYear()}-8F3A1`,
        success: 'Objection submitted successfully! Your grievance has been recorded for committee review.'
      }));
    } catch (err) {
      console.error(err);
      setObjectionModal(prev => ({ ...prev, submitting: false, error: 'Network error while submitting objection.' }));
    }
  };
  const [webDevPreviewTabs, setWebDevPreviewTabs] = useState({}); // { [qIndex]: 'html' | 'css' | 'js' | 'preview' }

  // DOM Refs
  const calibVideoRef = useRef(null);
  const examVideoRef = useRef(null);
  const blazefaceModelRef = useRef(null);
  const faceAwayDurationRef = useRef(0);
  const [webcamProctorWarning, setWebcamProctorWarning] = useState('');

  // Computed setup condition
  const setupReady = webcamGranted && micGranted && isFullscreen && isFocused;

  // Set Google ecosystem font starting at the terms page ('terms_conditions') onwards.
  // The login page ('verify_login') strictly retains the main portal's font (verdana, arial, sans-serif).
  useEffect(() => {
    const isProctoringOrLater = ['terms_conditions', 'system_checks', 'biometric_check', 'guidelines_setup', 'active_exam', 'finished', 'verification_review'].includes(flow);
    if (isProctoringOrLater) {
      document.body.classList.add('ot-google-font');
    } else {
      document.body.classList.remove('ot-google-font');
    }
    return () => {
      document.body.classList.remove('ot-google-font');
    };
  }, [flow]);

  // Heartbeat ping loop to keep Render backend awake & fetch config
  useEffect(() => {
    const pingBackend = async () => {
      try {
        await fetch(`${API_BASE}/config`);
      } catch (err) {
        console.warn("Config fetch failed:", err);
      }
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

  // Load BlazeFace Model Failsafe & Pre-warm WebGL Shaders
  useEffect(() => {
    const loadModel = async () => {
      try {
        if (window.blazeface) {
          console.log("[PROCTOR_ML]: Loading BlazeFace model...");
          const model = await window.blazeface.load();
          blazefaceModelRef.current = model;
          console.log("[PROCTOR_ML]: BlazeFace model loaded successfully.");

          // If calibration video is already streaming, pre-warm shaders immediately
          if (calibVideoRef.current && calibVideoRef.current.readyState >= 2) {
            model.estimateFaces(calibVideoRef.current, false)
              .then(() => console.log("[PROCTOR_ML]: BlazeFace shaders pre-warmed on load."))
              .catch(() => {});
          }
        } else {
          console.warn("[PROCTOR_ML]: BlazeFace model CDN not available.");
        }
      } catch (e) {
        console.error("[PROCTOR_ML]: Failed to initialize BlazeFace model:", e);
      }
    };
    loadModel();
  }, []);

  // Pre-warm WebGL shaders when webcam stream connects during guidelines setup
  useEffect(() => {
    if (!webcamStream) return;
    let cancelled = false;

    const warmUp = async () => {
      try {
        const vid = calibVideoRef.current;
        if (!vid) return;

        // Ensure video has received first frame
        if (vid.readyState < 2) {
          await new Promise(resolve => {
            const onLoaded = () => {
              vid.removeEventListener('loadeddata', onLoaded);
              resolve();
            };
            vid.addEventListener('loadeddata', onLoaded);
            setTimeout(resolve, 1500);
          });
        }

        if (cancelled) return;
        const model = blazefaceModelRef.current || (window.blazeface ? await window.blazeface.load() : null);
        if (model && vid && vid.readyState >= 2 && !cancelled) {
          blazefaceModelRef.current = model;
          console.log("[PROCTOR_ML]: Pre-warming WebGL shaders during guidelines setup...");
          await model.estimateFaces(vid, false);
          console.log("[PROCTOR_ML]: BlazeFace WebGL shaders pre-warmed. Start Exam freeze eliminated.");
        }
      } catch (err) {
        console.warn("[PROCTOR_ML]: Shader pre-warming notice:", err?.message || err);
      }
    };

    warmUp();
    return () => { cancelled = true; };
  }, [webcamStream]);

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

      // Check if student has already acknowledged instructions for this submission
      const ackKey = `bics_verif_ack_${subId}`;
      if (!localStorage.getItem(ackKey)) {
        setVerificationInstructionsModalOpen(true);
        setVerificationConsentChecked(false);
      }
    } catch (err) {
      console.error("Verification fetch failed:", err);
      setVerifyError("Network Error: Unable to establish secure link to verify evaluated paper.");
      setLoading(false);
    }
  };

  const loadEirfDetails = async (subId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/test/eirf/details/${subId}`);
      const data = await res.json();
      if (!res.ok || data.error || data.isExpired) {
        setVerifyError(data.error || "The Emergency Incident Report Form (EIRF) is closed, moved, or unavailable at this link.");
        document.title = "EIRF - Link Closed / Unavailable | BICS Portal";
        setLoading(false);
        return;
      }
      setEirfDetails(data);
      setFlow('eirf_form');
      const eTitle = data.testTitle || 'BICS Examination';
      document.title = `Emergency Incident Report Form (EIRF) - ${eTitle} | BICS Portal`;
    } catch (err) {
      console.error("Error loading EIRF details:", err);
      setVerifyError("The Emergency Incident Report Form (EIRF) is closed, moved, or unavailable at this link.");
      document.title = "EIRF - Link Closed / Unavailable | BICS Portal";
    } finally {
      setLoading(false);
    }
  };

  // 1. Initial Load: Parse path and query parameters for test, verification, or EIRF route
  useEffect(() => {
    const rawPath = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const hostname = window.location.hostname;

    const isLocal = hostname === 'localhost' || 
                    hostname === '127.0.0.1' || 
                    hostname.startsWith('192.168.') || 
                    hostname.startsWith('10.') || 
                    hostname.startsWith('172.');

    // 1. Strict Domain Enforcement: Production tests must run strictly on bicsportal.netlify.app
    if (!isLocal && hostname !== 'bicsportal.netlify.app') {
      setVerifyError("You do not have permission to view this directory or page using the credentials that you supplied.");
      setLoading(false);
      return;
    }

    // Normalize path by stripping /terminal prefix if present
    let normPath = rawPath.replace(/^\/terminal/, '') || '/';
    if (!normPath.startsWith('/')) normPath = `/${normPath}`;
    if (normPath.length > 1 && normPath.endsWith('/')) {
      normPath = normPath.slice(0, -1);
    }

    // 2. EIRF route (e.g. /terminal/eirf/:submissionId or /eirf/:submissionId)
    if (normPath.startsWith('/eirf/')) {
      const parts = normPath.split('/').filter(Boolean);
      const eirfSubId = parts[1] || searchParams.get('submissionId') || searchParams.get('id');
      if (eirfSubId) {
        loadEirfDetails(eirfSubId);
        return;
      }
      setVerifyError("You do not have permission to view this directory or page using the credentials that you supplied.");
      setLoading(false);
      return;
    }

    // 3. Submission verification route (e.g. /terminal/verification/:submissionId or /verification/:submissionId)
    if (normPath.startsWith('/verification/') || normPath.startsWith('/submissions/') || normPath.startsWith('/submission/')) {
      const parts = normPath.split('/').filter(Boolean);
      const subId = parts[1] || searchParams.get('submissionId') || searchParams.get('id');
      if (subId) {
        loadSubmissionVerification(subId);
        return;
      }
      setVerifyError("You do not have permission to view this directory or page using the credentials that you supplied.");
      setLoading(false);
      return;
    }

    // 4. Strict Assessment Route: Must be /assessment with valid token query parameter
    if (normPath === '/assessment') {
      const parsedToken = searchParams.get('token');
      const urlAuthToken = searchParams.get('authToken') || searchParams.get('jwt');
      if (urlAuthToken) {
        localStorage.setItem('bics_auth_token', urlAuthToken);
        sessionStorage.setItem('bics_auth_token', urlAuthToken);
        if (typeof window !== 'undefined') window.__BICS_AUTH_TOKEN__ = urlAuthToken;
      }
      if (parsedToken) {
        sessionStorage.setItem('bics_exam_token', parsedToken);
        if (typeof window !== 'undefined') window.__BICS_EXAM_TOKEN__ = parsedToken;
      }
      if (!parsedToken) {
        setVerifyError("You do not have permission to view this directory or page using the credentials that you supplied.");
        setLoading(false);
        return;
      }
      setToken(parsedToken);
      verifyExamToken(parsedToken);
      return;
    }

    // 5. Any other link/path is strictly rejected with server forbidden error
    setVerifyError("You do not have permission to view this directory or page using the credentials that you supplied.");
    setLoading(false);
  }, []);

  // Dynamically update browser tab title based on route and examination/verification state
  useEffect(() => {
    const isEirfRoute = window.location.pathname.includes('/eirf') || flow === 'eirf_form';
    const isSubmissionsRoute = window.location.pathname.startsWith('/submissions') || 
                               window.location.pathname.startsWith('/submission') || 
                               flow === 'verification_review';

    if (verifyError) {
      document.title = "Server Error";
      return;
    }

    if (isEirfRoute) {
      const eTitle = eirfDetails?.testTitle || test?.title;
      document.title = eTitle
        ? `Emergency Incident Report Form (EIRF) - ${eTitle} | BICS Portal`
        : "Emergency Incident Report Form (EIRF) | BICS Portal";
    } else if (isSubmissionsRoute) {
      if (test?.title) {
        document.title = `Answer Sheet Verification - ${test.title} | BICS Portal`;
      } else {
        document.title = "Answer Sheet Verification | BICS Examination Portal";
      }
    } else {
      if (test?.title) {
        document.title = `BICS Terminal - ${test.title} | BICS Portal`;
      } else {
        document.title = "BICS Terminal";
      }
    }
  }, [flow, test, eirfDetails, verifyError]);

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
      window.location.href = getReturnUrl('/coursework/online-tests');
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
      if (data.submission) setSubmission(data.submission);

      if (data.authToken || data.token) {
        const tokenVal = data.authToken || data.token;
        localStorage.setItem('bics_auth_token', tokenVal);
        sessionStorage.setItem('bics_auth_token', tokenVal);
        localStorage.setItem('token', tokenVal);
        if (typeof window !== 'undefined') window.__BICS_AUTH_TOKEN__ = tokenVal;
      }
      
      // Load pre-existing state or localStorage cache tied strictly to unique submission attempt
      const subId = data.submission?.id || data.submission?._id || 'new_attempt';
      const storageKey = `bics_draft_${data.test.id}_${data.candidate.id}_${subId}`;
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
          selectedLanguage: cachedAns ? (cachedAns.selectedLanguage || 'cpp') : 'cpp',
          submittedHtml: cachedAns ? cachedAns.submittedHtml : (q.initialHtml || q.initialCode?.html || ''),
          submittedCss: cachedAns ? cachedAns.submittedCss : (q.initialCss || q.initialCode?.css || ''),
          submittedJs: cachedAns ? cachedAns.submittedJs : (q.initialJs || q.initialCode?.js || '')
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
      "Acquiring examination token credentials...",
      "Validating candidate authorization...",
      "Activating secure testing protocol...",
      "Redirecting to Test Setup (Step 1: Terms and conditions)..."
    ];

    let step = 0;
    setLobbyMessage(messages[0]);
    
    const interval = setInterval(() => {
      step++;
      if (step < messages.length) {
        setLobbyMessage(messages[step]);
      } else {
        clearInterval(interval);
        setFlow('terms_conditions');
      }
    }, 400);
  };

  const handleLockFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) await elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
      else if (elem.mozRequestFullScreen) await elem.mozRequestFullScreen();
      else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();
      setIsFullscreen(true);
    } catch (e) {
      console.warn("Fullscreen request notice:", e);
    }
  };

  const handleCompleteBiometricGate = (data) => {
    const isCurrentlyFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (!isCurrentlyFullscreen) {
      setIsFullscreen(false);
      return;
    }
    const { baselinePhoto: photo, securityMetadata: meta, ambientFloorDb } = data || {};
    if (photo) setBaselinePhoto(photo);
    if (meta) setSecurityMetadata(meta);
    if (ambientFloorDb) setAmbientNoiseFloorDb(ambientFloorDb);
    setBiometricsCache(prev => ({ ...prev, ...data }));
    setFlow('guidelines_setup');
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
          calibVideoRef.current.onloadeddata = () => {
            if (blazefaceModelRef.current) {
              blazefaceModelRef.current.estimateFaces(calibVideoRef.current, false)
                .then(() => console.log("[PROCTOR_ML]: BlazeFace shaders pre-warmed on calib stream ready."))
                .catch(() => {});
            }
          };
        }
      }, 100);
    } catch (err) {
      console.error(err);
      triggerCustomAlert("Access Denied", "Proctoring checks require webcam camera and microphone audio access to verify candidate identity.");
    }
  };

  // Refs to track logged warnings and prevent duplicate logs or duplicate auto-submits
  const lastLoggedWarnings = useRef({ fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0 });
  const isAutoSubmittedRef = useRef(false);
  const proctoringEventsRef = useRef([]);

  const getProctoringLogPayload = (warningsObj) => ({
    fullscreenExits: warningsObj?.fullscreenExits || 0,
    tabSwitches: warningsObj?.tabSwitches || 0,
    inspectAttempts: warningsObj?.inspectAttempts || 0,
    webcamStatus: warningsObj?.webcamStatus || 'active',
    events: proctoringEventsRef.current || []
  });

  // Handle warnings changes (Alerts, logs syncing, and auto-submit)
  useEffect(() => {
    if (flow !== 'active_exam') return;
    
    const { fullscreenExits, tabSwitches, inspectAttempts } = proctoringWarnings;
    const total = (fullscreenExits || 0) + (tabSwitches || 0) + (inspectAttempts || 0);
    if (total === 0) return;

    // Check if we need to auto-submit
    if (total >= 3) {
      if (!isAutoSubmittedRef.current) {
        isAutoSubmittedRef.current = true;
        const newFS = (fullscreenExits || 0) > (lastLoggedWarnings.current.fullscreenExits || 0);
        const newTab = (tabSwitches || 0) > (lastLoggedWarnings.current.tabSwitches || 0);
        const newInspect = (inspectAttempts || 0) > (lastLoggedWarnings.current.inspectAttempts || 0);
        let finalEventType = 'DEVTOOLS_OPENED';
        let finalMsg = `Candidate accessed developer tools / inspect element. Total warnings: 3 / 3 (Auto-Submission Triggered)`;
        if (newFS) {
          finalEventType = 'FULLSCREEN_EXIT';
          finalMsg = `Candidate exited fullscreen mode. Total warnings: 3 / 3 (Auto-Submission Triggered)`;
        } else if (newTab) {
          finalEventType = 'TAB_SWITCH';
          finalMsg = `Candidate switched tab or lost focus. Total warnings: 3 / 3 (Auto-Submission Triggered)`;
        }
        
        lastLoggedWarnings.current.fullscreenExits = fullscreenExits || 0;
        lastLoggedWarnings.current.tabSwitches = tabSwitches || 0;
        lastLoggedWarnings.current.inspectAttempts = inspectAttempts || 0;

        syncProctoringLogs(proctoringWarnings, finalEventType, finalMsg).finally(() => {
          autoSubmitExam(proctoringWarnings);
        });
      }
      return;
    }

    // Check if we have new warnings to log
    const newFS = (fullscreenExits || 0) > (lastLoggedWarnings.current.fullscreenExits || 0);
    const newTab = (tabSwitches || 0) > (lastLoggedWarnings.current.tabSwitches || 0);
    const newInspect = (inspectAttempts || 0) > (lastLoggedWarnings.current.inspectAttempts || 0);

    if (newFS || newTab || newInspect) {
      setShowWarningModal(true);
      if (newFS) {
        lastLoggedWarnings.current.fullscreenExits = fullscreenExits || 0;
        syncProctoringLogs(proctoringWarnings, 'FULLSCREEN_EXIT', `Candidate exited fullscreen mode. Total warnings: ${total} / 3`);
      }
      if (newTab) {
        lastLoggedWarnings.current.tabSwitches = tabSwitches || 0;
        syncProctoringLogs(proctoringWarnings, 'TAB_SWITCH', `Candidate switched tab or lost focus. Total warnings: ${total} / 3`);
      }
      if (newInspect) {
        lastLoggedWarnings.current.inspectAttempts = inspectAttempts || 0;
        syncProctoringLogs(proctoringWarnings, 'DEVTOOLS_OPENED', `Candidate attempted to open developer tools / inspect element. Total warnings: ${total} / 3`);
      }
    }
  }, [proctoringWarnings, flow]);

  // Check Fullscreen state with duration tracking & Deduplication (Item 3.1)
  useEffect(() => {
    const onFSChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      
      if (flow === 'active_exam') {
        if (!fs) {
          const now = Date.now();
          fsExitStartTimeRef.current = now;
          lastFullscreenExitTimeRef.current = now;

          // Deduplication: If a window blur occurred within the last 600ms, merge into a single incident
          const timeSinceBlur = now - lastWindowBlurTimeRef.current;
          if (timeSinceBlur < DEDUPLICATION_WINDOW_MS) {
            console.log(`[Proctoring Deduplication] Fullscreen exit within ${timeSinceBlur}ms of blur. Reconciled as single incident.`);
            syncProctoringLogs(
              proctoringWarnings,
              'FULLSCREEN_EXIT',
              `Candidate exited fullscreen mode (reconciled with window blur incident).`
            );
          } else {
            setProctoringWarnings(prev => ({ ...prev, fullscreenExits: prev.fullscreenExits + 1 }));
          }
        } else if (fsExitStartTimeRef.current) {
          const startTime = fsExitStartTimeRef.current;
          const endTime = Date.now();
          const durationSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));
          fsExitStartTimeRef.current = null;
          syncProctoringLogs(
            proctoringWarnings,
            'FULLSCREEN_EXIT',
            `Candidate returned to fullscreen after ${durationSeconds} seconds.`,
            startTime,
            endTime,
            durationSeconds
          );
        }
      }
    };

    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, [flow, proctoringWarnings]);

  // Check Window Focus state with duration tracking & Deduplication (Item 3.1)
  useEffect(() => {
    const onBlur = () => {
      setIsFocused(false);
      setTimeout(() => {
        const active = document.activeElement;
        if (active && (active.id === 'web-sandbox-preview' || active.tagName === 'IFRAME')) {
          return;
        }
        if (flow === 'active_exam') {
          const now = Date.now();
          tabExitStartTimeRef.current = now;
          lastWindowBlurTimeRef.current = now;

          // Deduplication: If fullscreen was exited within the last 600ms, merge and suppress double-warning
          const timeSinceFS = now - lastFullscreenExitTimeRef.current;
          if (timeSinceFS < DEDUPLICATION_WINDOW_MS) {
            console.log(`[Proctoring Deduplication] Window blur within ${timeSinceFS}ms of fullscreen exit. Suppressed second warning.`);
            syncProctoringLogs(
              proctoringWarnings,
              'TAB_SWITCH',
              `Candidate lost window focus during fullscreen exit transition.`
            );
            return;
          }

          setProctoringWarnings(prev => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }));
        }
      }, 100);
    };
    
    const onFocus = () => {
      setIsFocused(true);
      if (flow === 'active_exam' && tabExitStartTimeRef.current) {
        const startTime = tabExitStartTimeRef.current;
        const endTime = Date.now();
        const durationSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));
        tabExitStartTimeRef.current = null;
        syncProctoringLogs(
          proctoringWarnings,
          'TAB_SWITCH',
          `Candidate returned focus after switching tabs/leaving window for ${durationSeconds} seconds.`,
          startTime,
          endTime,
          durationSeconds
        );
      }
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [flow, proctoringWarnings]);

  // Start active exam and transition (Calls backend to register submission only when Start Test is clicked)
  const handleStartExam = async () => {
    const isCurrentlyFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (!consentRulesChecked || !consentProctoringChecked || !isCurrentlyFullscreen) {
      if (!isCurrentlyFullscreen) setIsFullscreen(false);
      return;
    }
    
    try {
      const activeToken = localStorage.getItem('bics_auth_token') || 
                          sessionStorage.getItem('bics_auth_token') || 
                          localStorage.getItem('token') || 
                          token || '';
      const examSecurityToken = sessionStorage.getItem('bics_exam_token') || 
                                token || 
                                searchParams.get('token') || '';

      const reqHeaders = { 'Content-Type': 'application/json' };
      if (activeToken) reqHeaders['Authorization'] = `Bearer ${activeToken}`;
      if (examSecurityToken) reqHeaders['x-exam-token'] = examSecurityToken;

      const res = await fetch(`${API_BASE}/tests/start/${test.id || test._id}`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          candidateId: candidate.id || candidate._id,
          candidateName: candidate.name,
          studentId: candidate.studentId,
          token: examSecurityToken,
          baselinePhotoUrl: baselinePhoto || '',
          securityMetadata: securityMetadata || {}
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
      logProctoringEvent(data.submission, 'CONSENT_ACCEPTED', 'Malpractice undertaking (Clause 4) & Proctoring consent (Clause 2) accepted.');

      // Upload baseline photograph to server / Cloudinary
      if (baselinePhoto && data.submission) {
        const subId = data.submission.id || data.submission._id;
        fetch(`${API_BASE}/tests/proctoring/snapshot/${subId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: baselinePhoto,
            eventType: 'BASELINE_REFERENCE',
            details: 'Initial biometric reference portrait captured during onboarding.'
          })
        }).catch(err => console.warn("Baseline photo background upload notice:", err));
      }

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

  // Minor proctoring warning counter (Continuous warnings counted per second - Item 3)
  const minorWarningSecondsRef = useRef(0);
  const [minorWarningCount, setMinorWarningCount] = useState(0);
  const hasTriggered40sEirfRef = useRef(false);

  const incrementMinorWarning = (reason = 'minor_violation') => {
    minorWarningSecondsRef.current += 1;
    const count = minorWarningSecondsRef.current;
    setMinorWarningCount(count);

    if (count >= 40 && !hasTriggered40sEirfRef.current) {
      hasTriggered40sEirfRef.current = true;
      console.warn(`[PROCTORING_THRESHOLD]: 40 seconds of cumulative minor proctoring warnings reached (${reason}). Setting EIRF flag to true.`);

      setSubmission(prev => prev ? ({ ...prev, hasEirfFlag: true, eirfStatus: 'pending' }) : prev);

      logProctoringEvent(
        submission,
        'MINOR_WARNINGS_EXCEEDED',
        `Cumulative minor proctoring violations reached threshold: ${count} seconds (${reason}). EIRF incident flag activated.`
      );

      setWebcamProctorWarning(`Proctor Alert: Compliance warning threshold reached (${count}s). An Emergency Incident Report (EIRF) flag has been activated.`);

      if (submission) {
        saveOfflineSubmission({
          submissionId: submission._id || submission.id,
          candidateName: candidate?.name || submission.candidateName,
          studentId: candidate?.studentId || submission.studentId,
          answers: examAnswers || [],
          proctoringLog: getProctoringLogPayload(proctoringWarnings),
          hasEirfFlag: true,
          eirfStatus: 'pending'
        }).catch(() => {});
        downloadEirfBackupFile(submission, candidate, examAnswers, proctoringWarnings);
      }
    }
  };

  // Proctoring snapshot capture helper & violation dispatcher
  const lastSnapshotTimeRef = useRef({});
  const voiceWarningExpiryRef = useRef(0);

  const captureEvidenceSnapshot = (eventType, details) => {
    try {
      if (!submission) return;
      const subId = submission.id || submission._id;
      if (!subId) return;

      const vid = examVideoRef.current;
      if (!vid || vid.readyState < 2) return;

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      // Mirror video frame to match user perspective
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Security watermark band
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, canvas.height - 26, canvas.width, 26);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10.5px Roboto, sans-serif';
      const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const studentLabel = candidate?.studentId || candidate?.name || 'Candidate';
      ctx.fillText(`BICS SECURE PROCTOR [${studentLabel}] • ${eventType} • ${timeStr} UTC`, 12, canvas.height - 9);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      const studentId = candidate?.studentId || submission?.studentId || '';

      if (isOnline) {
        fetch(`${API_BASE}/tests/proctoring/snapshot/${subId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            eventType,
            details,
            studentId
          })
        }).then(res => {
          if (!res.ok) {
            saveOfflineSnapshot({ submissionId: subId, image: dataUrl, eventType, details, studentId }).catch(() => {});
          }
        }).catch(() => {
          saveOfflineSnapshot({ submissionId: subId, image: dataUrl, eventType, details, studentId }).catch(() => {});
        });
      } else {
        saveOfflineSnapshot({ submissionId: subId, image: dataUrl, eventType, details, studentId }).catch(() => {});
      }
    } catch (err) {
      console.warn("Evidence snapshot capture error:", err);
    }
  };

  const logProctoringEvent = async (subObj, type, details, startTime, endTime, durationSeconds) => {
    try {
      const targetSub = subObj || submission;
      if (!targetSub) return;
      const subId = targetSub.id || targetSub._id;

      const evtObj = {
        type,
        details,
        timestamp: new Date().toISOString(),
        startTime: startTime ? new Date(startTime).toISOString() : null,
        endTime: endTime ? new Date(endTime).toISOString() : null,
        durationSeconds: durationSeconds ? Number(durationSeconds) : 0
      };

      if (!proctoringEventsRef.current) proctoringEventsRef.current = [];
      proctoringEventsRef.current.push(evtObj);

      if (isOnline) {
        fetch(`${API_BASE}/tests/proctoring/event/${subId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(evtObj)
        }).catch(() => {
          saveOfflineEvent({ submissionId: subId, ...evtObj }).catch(() => {});
        });
      } else {
        saveOfflineEvent({ submissionId: subId, ...evtObj }).catch(() => {});
      }
    } catch (e) {
      console.error("Failed to log proctoring event:", e);
    }
  };

  // Dispatch violation warning to candidate, take snapshot immediately on first call,
  // and continue taking snapshots every 10s if the warning is continuous.
  const handleProctorViolation = (eventType, warningMessage, logDetails) => {
    setWebcamProctorWarning(warningMessage);
    const now = Date.now();
    const lastTime = lastSnapshotTimeRef.current[eventType] || 0;
    if (lastTime === 0 || now - lastTime >= 10000) {
      lastSnapshotTimeRef.current[eventType] = now;
      captureEvidenceSnapshot(eventType, logDetails);
      logProctoringEvent(submission, eventType, logDetails);
    }
  };

  // Reset violation tracking when resolved so next occurrence triggers snapshot immediately on first call
  const handleProctorResolved = (eventType) => {
    lastSnapshotTimeRef.current[eventType] = 0;
  };

  // Handle major proctoring violations for Inspect / Developer Tools access
  const lastInspectWarningTimeRef = useRef(0);
  const handleInspectViolation = (vector = 'devtools', detail = '') => {
    if (flow !== 'active_exam') return;
    const now = Date.now();
    // 4-second debouncing to prevent multiple strikes for a single inspection action
    if (now - lastInspectWarningTimeRef.current < 4000) return;
    lastInspectWarningTimeRef.current = now;

    showToast(
      "Developer Tools & Inspect Element are strictly forbidden. A major proctoring violation has been recorded.",
      "Proctoring Violation: Inspect Attempt",
      "error"
    );

    captureEvidenceSnapshot('DEVTOOLS_OPENED', `DevTools / Inspect element detected via ${vector}: ${detail}`);
    logProctoringEvent(
      submission,
      'DEVTOOLS_OPENED',
      `Candidate opened or attempted to inspect exam environment via ${vector} (${detail}).`
    );

    setProctoringWarnings(prev => ({
      ...prev,
      inspectAttempts: (prev.inspectAttempts || 0) + 1
    }));
  };

  // ML webcam face proctoring loop
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;
    
    let active = true;
    let frameId;
    
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
            // No face detected! (Continuous per-second warning count)
            faceAwayDurationRef.current += 1;
            incrementMinorWarning('FACE_MISSING');
            
            if (faceAwayDurationRef.current >= 3) { // 3 seconds at 1 FPS
              handleProctorViolation(
                'FACE_MISSING',
                'Proctor Reminder: No face detected. Please ensure you are visible to the webcam.',
                'No face detected in webcam stream.'
              );
            }
          } else if (predictions.length > 1) {
            // Multiple faces detected! (Continuous per-second warning count)
            faceAwayDurationRef.current += 1;
            incrementMinorWarning('MULTI_FACE');
            
            if (faceAwayDurationRef.current >= 3) {
              handleProctorViolation(
                'MULTI_FACE',
                'Proctor Reminder: Multiple faces detected in webcam frame.',
                'Multiple faces detected in webcam stream.'
              );
            }
          } else {
            // Exactly one face detected. Inspect landmarks!
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
                
                // Widescreen monitor recalibration: 0.36 yaw ratio cutoff with >= 4.0s sustained dwell time
                const LOOKING_AWAY_YAW_RATIO = 0.36;
                const LOOKING_AWAY_SUSTAINED_FRAMES = 4;
                if (Math.abs(offsetRatio) > LOOKING_AWAY_YAW_RATIO) {
                  faceAwayDurationRef.current += 1;
                  incrementMinorWarning('LOOKING_AWAY');
                  
                  if (faceAwayDurationRef.current >= LOOKING_AWAY_SUSTAINED_FRAMES) {
                    handleProctorViolation(
                      'LOOKING_AWAY',
                      'Proctor Reminder: Please keep facing forward. Looking away is prohibited.',
                      'Candidate is turned away / looking away from screen.'
                    );
                  }
                } else {
                  // Face is facing forward and valid!
                  faceAwayDurationRef.current = 0;
                  handleProctorResolved('FACE_MISSING');
                  handleProctorResolved('MULTI_FACE');
                  handleProctorResolved('LOOKING_AWAY');
                  setWebcamProctorWarning(prev => {
                    if (prev.includes('face') || prev.includes('facing')) return '';
                    return prev;
                  });
                }
              } else {
                faceAwayDurationRef.current = 0;
                handleProctorResolved('FACE_MISSING');
                handleProctorResolved('MULTI_FACE');
                handleProctorResolved('LOOKING_AWAY');
                setWebcamProctorWarning(prev => {
                  if (prev.includes('face') || prev.includes('facing')) return '';
                  return prev;
                });
              }
            } else {
              faceAwayDurationRef.current = 0;
              handleProctorResolved('FACE_MISSING');
              handleProctorResolved('MULTI_FACE');
              handleProctorResolved('LOOKING_AWAY');
              setWebcamProctorWarning(prev => {
                if (prev.includes('face') || prev.includes('facing')) return '';
                return prev;
              });
            }
          }
        } catch (e) {
          console.warn("[PROCTOR_ML_LOOP_ERROR]: Face prediction loop caught exception:", e.message);
        }
      }

      // Continuous monitor for fullscreen exits and tab switches
      if (!document.fullscreenElement && fsExitStartTimeRef.current) {
        handleProctorViolation('FULLSCREEN_EXIT', 'Proctor Warning: Fullscreen exit detected', 'Candidate is outside fullscreen mode.');
      } else {
        handleProctorResolved('FULLSCREEN_EXIT');
      }

      if (tabExitStartTimeRef.current) {
        handleProctorViolation('TAB_SWITCH', 'Proctor Warning: Window focus lost', 'Candidate switched tabs or window.');
      } else {
        handleProctorResolved('TAB_SWITCH');
      }
      
      if (active) {
        frameId = setTimeout(trackFace, 1000); // 1 FPS check instead of 10 FPS to eliminate GPU & main-thread freezing
      }
    };
    
    // Start loop after a short delay (1.5s) to allow Monaco and UI to finish painting
    const initDelay = setTimeout(trackFace, 1500);
    
    return () => {
      active = false;
      clearTimeout(initDelay);
      clearTimeout(frameId);
    };
  }, [flow, submission, isOnline]);

  // Web Audio API ambient voice proctoring loop during active exam
  useEffect(() => {
    if (flow !== 'active_exam' || !submission || !webcamStream) return;

    let active = true;
    let audioCtx = null;
    let intervalId = null;
    let sustainedVoiceCount = 0;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }

        const resumeAudio = () => {
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
        };
        window.addEventListener('click', resumeAudio);
        window.addEventListener('keydown', resumeAudio);

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;

        // Vocal Bandpass Filtering (300 Hz - 3000 Hz human speech formant isolation - Item 3.3)
        const highpass = audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(300, audioCtx.currentTime);

        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(3000, audioCtx.currentTime);

        const source = audioCtx.createMediaStreamSource(webcamStream);
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Uint8Array(analyser.fftSize);

        // Safe floor baseline: clamp between 20 and 32 dB
        const safeFloor = Math.min(32, Math.max(20, ambientNoiseFloorDb || 26));

        intervalId = setInterval(() => {
          if (!active) return;

          // 1. Time-domain RMS & Peak Amplitude for Crest Factor Impulse Rejection (Item 3.3)
          analyser.getByteTimeDomainData(timeData);
          let sumSquares = 0;
          let peakAmplitude = 0;
          for (let i = 0; i < timeData.length; i++) {
            const norm = Math.abs((timeData[i] - 128) / 128);
            if (norm > peakAmplitude) peakAmplitude = norm;
            sumSquares += norm * norm;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);

          // Crest Factor = Peak / RMS
          // Mechanical keyboard typing & mouse/trackpad clicks create brief sharp impulse spikes (Crest Factor >= 4.5)
          // Voiced human speech exhibits continuous harmonic formants with moderate Crest Factor (2.2 - 3.8)
          const crestFactor = rms > 0.005 ? (peakAmplitude / rms) : 0;
          const isMechanicalImpulse = crestFactor >= 4.5;

          // 2. Speech frequency band energy (bins 3 [~280 Hz] to 32 [~3000 Hz])
          analyser.getByteFrequencyData(freqData);
          let speechSum = 0;
          let speechBinCount = Math.min(32, freqData.length);
          let peakSpeechEnergy = 0;
          for (let i = 3; i < speechBinCount; i++) {
            speechSum += freqData[i];
            if (freqData[i] > peakSpeechEnergy) peakSpeechEnergy = freqData[i];
          }
          const speechAvg = speechSum / Math.max(1, speechBinCount - 3);

          // 3. Calibrated decibel metric (22 dB to 100 dB)
          const currentDb = Math.min(100, Math.round(
            22 + Math.min(78, (rms * 160) + (speechAvg / 255) * 35)
          ));

          // 4. Voice vs Impulse Rejection (Requires continuous non-impulsive human speech)
          const isShouting = !isMechanicalImpulse && (currentDb >= 62 || (rms >= 0.18 && speechAvg >= 70));
          const isVoicedSpeech = !isMechanicalImpulse && (currentDb >= Math.max(48, safeFloor + 16) || (rms >= 0.08 && speechAvg >= 45));

          if (isShouting || isVoicedSpeech) {
            sustainedVoiceCount += isShouting ? 2 : 1;
            // Sustained speech requirement: require >= 1.0s continuous vocal speech (10 intervals of 100ms)
            if (sustainedVoiceCount >= 10) {
              voiceWarningExpiryRef.current = Date.now() + 5000; // Keep visible for at least 5 seconds
              // Increment minor warning counter every continuous second of detected voice (Item 3)
              if (sustainedVoiceCount % 10 === 0) {
                incrementMinorWarning('VOICE_DETECTED');
              }
              handleProctorViolation(
                'VOICE_DETECTED',
                `Proctor Reminder: High voice / ambient noise detected (${currentDb} dB). Strict silence is required.`,
                `High voice detected (${currentDb} dB, RMS: ${rms.toFixed(2)}, Crest Factor: ${crestFactor.toFixed(2)}).`
              );
            }
          } else {
            sustainedVoiceCount = Math.max(0, sustainedVoiceCount - 1);
            if (sustainedVoiceCount === 0 && Date.now() > voiceWarningExpiryRef.current) {
              handleProctorResolved('VOICE_DETECTED');
              setWebcamProctorWarning(prev => (prev.includes('voice detected') || prev.includes('High voice') ? '' : prev));
            }
          }
        }, 100);
      }
    } catch (e) {
      console.warn("Active exam audio proctoring init error:", e);
    }

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [flow, submission, webcamStream, ambientNoiseFloorDb]);

  // Strict Copy-Paste & Right-Click Lockdown during Active Examination (Item B6)
  const clipboardWarningExpiryRef = useRef(0);
  const handleClipboardAttempt = (action = 'clipboard_action') => {
    const actionLabel = (action || 'action').toUpperCase();
    const toastMsg = "Action Blocked: Copy-pasting and dragging external text are strictly prohibited during the active examination environment. This attempt has been logged.";
    showToast(toastMsg, 'Action Blocked', 'error');

    const warningMsg = `CLIPBOARD LOCKDOWN: Copying and pasting is strictly prohibited during the examination. Your ${actionLabel} action was blocked and reported.`;
    clipboardWarningExpiryRef.current = Date.now() + 6000;
    handleProctorViolation(
      'CLIPBOARD_ATTEMPT',
      warningMsg,
      `Candidate attempted unauthorized clipboard or drag-drop operation (${actionLabel}) in active exam workspace.`
    );
  };

  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;

    const blockEvent = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      handleClipboardAttempt(e.type);
      return false;
    };

    const blockDragDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      if (e.type === 'drop') {
        handleClipboardAttempt('drag_drop');
      }
      return false;
    };

    const blockKeydown = (e) => {
      const isModifier = e.ctrlKey || e.metaKey;
      const key = (e.key || '').toLowerCase();
      const isInsert = e.key === 'Insert';

      // Block Inspect / Developer Tools / View Source shortcuts
      if (
        key === 'f12' || e.keyCode === 123 ||
        (isModifier && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k')) ||
        (isModifier && key === 'u') ||
        (isModifier && e.altKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        handleInspectViolation('KEYBOARD_SHORTCUT', e.key || 'DevTools shortcut');
        return false;
      }

      if (
        (isModifier && (key === 'c' || key === 'v' || key === 'x' || isInsert)) ||
        (e.shiftKey && isInsert)
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        const action = (key === 'v' || (e.shiftKey && isInsert)) ? 'paste' : (key === 'x' ? 'cut' : 'copy');
        handleClipboardAttempt(action);
        return false;
      }
    };

    const blockContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    window.addEventListener('copy', blockEvent, true);
    window.addEventListener('cut', blockEvent, true);
    window.addEventListener('paste', blockEvent, true);
    window.addEventListener('dragover', blockDragDrop, true);
    window.addEventListener('dragenter', blockDragDrop, true);
    window.addEventListener('drop', blockDragDrop, true);
    window.addEventListener('keydown', blockKeydown, true);
    window.addEventListener('contextmenu', blockContextMenu, true);

    document.addEventListener('copy', blockEvent, true);
    document.addEventListener('cut', blockEvent, true);
    document.addEventListener('paste', blockEvent, true);
    document.addEventListener('dragover', blockDragDrop, true);
    document.addEventListener('dragenter', blockDragDrop, true);
    document.addEventListener('drop', blockDragDrop, true);
    document.addEventListener('contextmenu', blockContextMenu, true);

    const dismissInterval = setInterval(() => {
      if (clipboardWarningExpiryRef.current && Date.now() > clipboardWarningExpiryRef.current) {
        clipboardWarningExpiryRef.current = 0;
        handleProctorResolved('CLIPBOARD_ATTEMPT');
        setWebcamProctorWarning(prev => (prev.includes('CLIPBOARD LOCKDOWN') ? '' : prev));
      }
    }, 1000);

    return () => {
      window.removeEventListener('copy', blockEvent, true);
      window.removeEventListener('cut', blockEvent, true);
      window.removeEventListener('paste', blockEvent, true);
      window.removeEventListener('dragover', blockDragDrop, true);
      window.removeEventListener('dragenter', blockDragDrop, true);
      window.removeEventListener('drop', blockDragDrop, true);
      window.removeEventListener('keydown', blockKeydown, true);
      window.removeEventListener('contextmenu', blockContextMenu, true);

      document.removeEventListener('copy', blockEvent, true);
      document.removeEventListener('cut', blockEvent, true);
      document.removeEventListener('paste', blockEvent, true);
      document.removeEventListener('dragover', blockDragDrop, true);
      document.removeEventListener('dragenter', blockDragDrop, true);
      document.removeEventListener('drop', blockDragDrop, true);
      document.removeEventListener('contextmenu', blockContextMenu, true);
      clearInterval(dismissInterval);
    };
  }, [flow, submission]);

  // Real-time Developer Tools / Inspect Element Detection (Docked & Undocked)
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;

    let active = true;

    // 1. Docked DevTools Detection via Viewport & Screen Dimension Delta
    const checkDockedDevTools = () => {
      if (!active) return;
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > 160 || heightDelta > 160) {
        handleInspectViolation('DOCKED_DEVTOOLS_WINDOW', `Delta W:${widthDelta} H:${heightDelta}`);
      }
    };

    // 2. Detached / Floating DevTools Console Inspection Trap
    // When DevTools is opened, the browser's console formatting engine evaluates custom toString()
    const devtoolsDetector = /./;
    devtoolsDetector.toString = function() {
      if (active) {
        handleInspectViolation('CONSOLE_INSPECTION_TRAP', 'Console formatting evaluation triggered');
      }
      return '';
    };

    const intervalId = setInterval(() => {
      checkDockedDevTools();
      try {
        console.debug(devtoolsDetector);
      } catch (_) {}
    }, 1000);

    window.addEventListener('resize', checkDockedDevTools);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener('resize', checkDockedDevTools);
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
        const res = await fetch(`${API_BASE}/tests/submitted?id=${candidate?.id || candidate?._id}`);
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

  // Auto-commit previous question draft buffers and sync current question values into draft buffers (Item 3)
  useEffect(() => {
    if (!test || !test.questions) return;

    const prevIndex = prevSelectedQuestionIndexRef.current;
    let currentAnswers = examAnswersRef.current;

    // If switching away from a valid previous question index, auto-commit the active drafts
    if (
      prevIndex !== undefined &&
      prevIndex !== null &&
      prevIndex !== selectedQuestionIndex &&
      test.questions[prevIndex]
    ) {
      const updated = [...currentAnswers];
      if (updated[prevIndex]) {
        updated[prevIndex] = {
          ...updated[prevIndex],
          selectedOptionIndex: draftMCQRef.current,
          submittedCode: draftCodeRef.current,
          selectedLanguage: draftLanguageRef.current,
          submittedHtml: draftHtmlRef.current,
          submittedCss: draftCssRef.current,
          submittedJs: draftJsRef.current
        };
        currentAnswers = updated;
        setExamAnswers(updated);

        // Immediate background cache update in localStorage
        const subId = submission?.id || submission?._id || 'new_attempt';
        const storageKey = `bics_draft_${test.id}_${candidate?.id}_${subId}`;
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (_) {}

        // Auto-save to server draft
        saveServerDraft(updated);
      }
    }

    // Now update prevIndex to current selectedQuestionIndex
    prevSelectedQuestionIndexRef.current = selectedQuestionIndex;

    // Load active question drafts from the latest answers state
    if (test.questions[selectedQuestionIndex]) {
      const activeAns = currentAnswers[selectedQuestionIndex];
      const activeQuest = test.questions[selectedQuestionIndex];
      setDraftMCQ(activeAns?.selectedOptionIndex ?? null);
      setDraftCode(activeAns?.submittedCode ?? '');
      setDraftLanguage(activeAns?.selectedLanguage ?? 'cpp');
      setDraftHtml(activeAns?.submittedHtml ?? (activeQuest.initialHtml || activeQuest.initialCode?.html || ''));
      setDraftCss(activeAns?.submittedCss ?? (activeQuest.initialCss || activeQuest.initialCode?.css || ''));
      setDraftJs(activeAns?.submittedJs ?? (activeQuest.initialJs || activeQuest.initialCode?.js || ''));
      setDraftQIdx(selectedQuestionIndex);
      setWebActiveTab('html');
      setWebConsoleLogs([]);
      setRunResults(null);
      setCompileError(null);
      setConsoleTab('testcase');
    }
  }, [selectedQuestionIndex, test]);

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
      submittedJs: draftJs,
      isSavedByUser: true
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
    
    // Save to localStorage cache using unique submission ID
    const subId = submission?.id || submission?._id || 'new_attempt';
    const storageKey = `bics_draft_${test.id}_${candidate.id}_${subId}`;
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

  // Liveness Heartbeat for Server Dead-Man's Switch (Item 2.4)
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;

    const subId = submission._id || submission.id;
    if (!subId) return;

    const sendHeartbeat = async () => {
      try {
        const res = await fetch(`${API_BASE}/tests/heartbeat/${subId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          // If server finalized submission due to timeout or proctor action, transition to finished
          if (data.status && data.status !== 'started') {
            setFlow('finished');
            setFinishedStep(1);
          }
        }
      } catch (_) {}
    };

    // Immediate ping + periodic 12-second pulse
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 12000);
    return () => clearInterval(interval);
  }, [flow, submission]);

  // Navigator.sendBeacon auto-finalization on browser close / page navigation (Item 2.4)
  useEffect(() => {
    if (flow !== 'active_exam' || !submission) return;

    const subId = submission._id || submission.id;
    if (!subId) return;

    const handleDisconnect = () => {
      try {
        if (navigator.sendBeacon) {
          const payload = JSON.stringify({
            submissionId: subId,
            status: 'auto-submitted',
            reason: 'PAGEHIDE_DISCONNECT',
            answers: examAnswersRef.current,
            proctoringLog: getProctoringLogPayload(proctoringWarnings)
          });
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(`${API_BASE}/tests/beacon-disconnect`, blob);
        }
      } catch (err) {
        console.warn("sendBeacon failed:", err);
      }
    };

    window.addEventListener('pagehide', handleDisconnect);
    window.addEventListener('beforeunload', handleDisconnect);

    return () => {
      window.removeEventListener('pagehide', handleDisconnect);
      window.removeEventListener('beforeunload', handleDisconnect);
    };
  }, [flow, submission, proctoringWarnings]);

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
            const payload = await decryptPendingStorage(cachedPayload, subId);
            if (!payload) throw new Error("Unable to decrypt cached offline payload");
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
          testCases: allCases,
          timeLimitMs: activeQuestion.timeLimitMs || 2000,
          memoryLimitMb: activeQuestion.memoryLimitMb || 128
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'Compilation Error') {
          setCompileError(data.compileError || "Failed to compile C++ code.");
          const formattedErrResults = allCases.map(tc => ({
            status: 'Compilation Error',
            points: Number(tc.points || 0),
            scoredPoints: 0,
            actualOutput: data.compileError || 'Compilation Error',
            expectedOutput: tc.output || '',
            input: tc.input || ''
          }));
          setExamAnswers(prev => {
            const updated = [...prev];
            const qId = activeQuestion.id;
            const existingIdx = updated.findIndex(a => String(a.questionId) === String(qId));
            if (existingIdx !== -1) {
              updated[existingIdx] = {
                ...updated[existingIdx],
                submittedCode: draftCode,
                selectedLanguage: draftLanguage,
                testCaseResults: formattedErrResults,
                score: 0
              };
            }
            return updated;
          });
        } else {
          const rawResults = data.results || [];
          setRunResults(rawResults);
          const formattedResults = rawResults.map((r, rIdx) => {
            const tc = allCases[rIdx] || {};
            const isAccepted = r.status === 'Accepted';
            const pts = Number(tc.points || 0);
            const scored = isAccepted ? pts : 0;
            return {
              status: r.status || 'Failed',
              points: pts,
              scoredPoints: scored,
              actualOutput: r.actualOutput !== undefined ? r.actualOutput : (r.stdout || ''),
              expectedOutput: tc.output || '',
              input: tc.input || ''
            };
          });
          const questionScore = formattedResults.reduce((acc, curr) => acc + curr.scoredPoints, 0);

          setExamAnswers(prev => {
            const updated = [...prev];
            const qId = activeQuestion.id;
            const existingIdx = updated.findIndex(a => String(a.questionId) === String(qId));
            if (existingIdx !== -1) {
              updated[existingIdx] = {
                ...updated[existingIdx],
                submittedCode: draftCode,
                selectedLanguage: draftLanguage,
                testCaseResults: formattedResults,
                score: questionScore
              };
            } else {
              updated.push({
                questionId: qId,
                type: 'coding',
                submittedCode: draftCode,
                selectedLanguage: draftLanguage,
                testCaseResults: formattedResults,
                score: questionScore
              });
            }
            return updated;
          });
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

  const syncProctoringLogs = async (warningsObj, eventType, eventDetails, startTime, endTime, durationSeconds) => {
    try {
      if (!submission) return;
      const subId = submission._id || submission.id;

      if (eventType) {
        await logProctoringEvent(submission, eventType, eventDetails, startTime, endTime, durationSeconds);
      }

      const pLogPayload = getProctoringLogPayload(warningsObj);

      await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId,
          answers: examAnswers,
          proctoringLog: pLogPayload,
          status: 'started'
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualSubmitExam = () => {
    if (examTimeLeft > 300) {
      triggerCustomAlert(
        "Submission Locked",
        "Manual exam submission is only permitted during the final 5 minutes of the examination. Please continue reviewing your questions and solutions."
      );
      return;
    }
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

  const encryptEirfPayloadClient = async (payloadObj, studentId, submissionId) => {
    try {
      return await encryptEirfEnvelope(payloadObj, API_BASE);
    } catch (err) {
      console.error("Client-side asymmetric EIRF payload encryption error:", err);
      return JSON.stringify(payloadObj);
    }
  };

  const downloadEirfBackupFile = async (subObj, candObj, answersArr, pWarnings) => {
    try {
      const subId = subObj?._id || subObj?.id || 'submission';
      const studentId = candObj?.studentId || subObj?.studentId || 'Candidate';
      const pLogPayload = getProctoringLogPayload(pWarnings);

      let encryptedPayloadStr = null;

      // 1. Try server-side generation & encryption first if online
      try {
        const res = await fetch(`${API_BASE}/test/eirf/generate-payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: subId,
            studentId,
            answers: answersArr || [],
            proctoringLog: pLogPayload
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.encryptedPayload) {
            encryptedPayloadStr = typeof data.encryptedPayload === 'string'
              ? data.encryptedPayload
              : JSON.stringify(data.encryptedPayload);
          }
        }
      } catch (apiErr) {
        console.warn("Server EIRF payload generation request failed, using client-side WebCrypto encryption fallback:", apiErr);
      }

      // 2. Fallback to client-side WebCrypto AES-256-GCM encryption if offline / server failed
      if (!encryptedPayloadStr) {
        const payloadData = {
          submissionId: subId,
          studentId,
          candidateName: candObj?.name || subObj?.candidateName || 'Candidate',
          testTitle: subObj?.testTitle || test?.title || 'BICS Online Examination',
          answers: answersArr || [],
          proctoringLog: pLogPayload,
          generatedAt: new Date().toISOString()
        };
        encryptedPayloadStr = await encryptEirfPayloadClient(payloadData, studentId, subId);
      }

      const blob = new Blob([encryptedPayloadStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `EIRF_PAYLOAD_${subId}.eirf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Guarantee EIRF flag is marked true on payload download (Item 7 & 8)
      setSubmission(prev => prev ? ({ ...prev, hasEirfFlag: true, eirfStatus: 'pending' }) : prev);
      saveOfflineSubmission({
        submissionId: subId,
        studentId,
        candidateName: candObj?.name || subObj?.candidateName || 'Candidate',
        testTitle: subObj?.testTitle || test?.title || 'BICS Online Examination',
        answers: answersArr || [],
        proctoringLog: pLogPayload,
        hasEirfFlag: true,
        eirfStatus: 'pending'
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to generate .eirf backup payload file:", err);
    }
  };

  const finalizeExamSubmission = async (answersList, warningsObj, statusVal) => {
    setSubmittingExam(true);
    const subId = submission?._id || submission?.id;
    if (!subId) {
      setSubmittingExam(false);
      return;
    }

    const fullPLog = getProctoringLogPayload(warningsObj);

    // Auto-generate .eirf payload file on network drop or proctoring warning triggers
    const hasWarnings = (warningsObj?.fullscreenExits || 0) > 0 || (warningsObj?.tabSwitches || 0) > 0 || statusVal === 'auto-submitted' || !isOnline;
    if (hasWarnings) {
      downloadEirfBackupFile(submission, candidate, answersList, warningsObj);
    }

    if (!isOnline) {
      const pendingSubmitKey = `bics_pending_submit_${subId}`;
      const payload = {
        submissionId: subId,
        studentId: candidate?.studentId || submission?.studentId || '',
        candidateName: candidate?.name || submission?.candidateName || 'Candidate',
        testTitle: submission?.testTitle || test?.title || 'BICS Examination',
        answers: answersList,
        proctoringLog: fullPLog,
        status: statusVal,
        hasEirfFlag: true,
        eirfStatus: 'pending'
      };

      // 1. High-capacity IndexedDB persistence (Item 8)
      saveOfflineSubmission(payload).catch(() => {});

      // 2. Encrypted fallback in localStorage
      try {
        const encryptedPending = await encryptPendingStorage(payload, subId);
        localStorage.setItem(pendingSubmitKey, encryptedPending);
      } catch (storageErr) {
        localStorage.setItem(pendingSubmitKey, JSON.stringify(payload));
      }
      setHasPendingSubmit(true);
      setSubmission(prev => prev ? ({ ...prev, hasEirfFlag: true, eirfStatus: 'pending' }) : prev);
      
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
          proctoringLog: fullPLog,
          status: statusVal,
          hasEirfFlag: Boolean(submission?.hasEirfFlag || hasWarnings || !isOnline)
        })
      });
      const data = await res.json();
      if (data.success) {
        await logProctoringEvent(submission, 'TEST_SUBMITTED', `Candidate finalized and submitted exam (Status: ${statusVal}).`);
        localStorage.removeItem(`bics_draft_${test.id}_${candidate.id}`);
        await deleteOfflineSubmission(subId).catch(() => {});
        
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
      console.error("Submission fetch crashed, caching payload locally in IndexedDB:", err);
      const pendingSubmitKey = `bics_pending_submit_${subId}`;
      const payload = {
        submissionId: subId,
        studentId: candidate?.studentId || submission?.studentId || '',
        candidateName: candidate?.name || submission?.candidateName || 'Candidate',
        testTitle: submission?.testTitle || test?.title || 'BICS Examination',
        answers: answersList,
        proctoringLog: fullPLog,
        status: statusVal,
        hasEirfFlag: true,
        eirfStatus: 'pending'
      };

      // High-capacity IndexedDB persistence
      saveOfflineSubmission(payload).catch(() => {});
      try {
        const encryptedPending = await encryptPendingStorage(payload, subId);
        localStorage.setItem(pendingSubmitKey, encryptedPending);
      } catch (storageErr) {
        localStorage.setItem(pendingSubmitKey, JSON.stringify(payload));
      }
      setHasPendingSubmit(true);
      setSubmission(prev => prev ? ({ ...prev, hasEirfFlag: true, eirfStatus: 'pending' }) : prev);
      downloadEirfBackupFile(submission, candidate, answersList, warningsObj);
      
      if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      localStorage.removeItem(`bics_draft_${test.id}_${candidate.id}`);

      setFlow('finished');
      setFinishedStep(1);
    } finally {
      setSubmittingExam(false);
    }
  };

  // Active exam network listener: keep proctoring active, download payload, mark EIRF flag, and sync on reconnect (Items 7 & 8)
  useEffect(() => {
    if (!submission) return;
    const subId = submission.id || submission._id;

    const onOnline = () => {
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
    };

    const onOffline = () => {
      if (flow === 'active_exam') {
        logProctoringEvent(submission, 'NETWORK_OFFLINE', 'Candidate network disconnected during active examination session.');
        setSubmission(prev => prev ? ({ ...prev, hasEirfFlag: true, eirfStatus: 'pending' }) : prev);
        downloadEirfBackupFile(submission, candidate, examAnswers, proctoringWarnings);
        setWebcamProctorWarning("Network Offline: Local proctoring remains active. Your answers and proctoring telemetry are secured.");
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [submission, flow, candidate, examAnswers, proctoringWarnings]);

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

  // VIEW: Server Error / Unauthorized access template copied directly from FORBIDDEN_HTML_PAGE in backend/server.js
  if (verifyError) {
    document.title = "Server Error";

    return (
      <div style={{ margin: 0, padding: 0, width: '100%', minHeight: '100vh', backgroundColor: '#e6e6e6', fontFamily: 'Arial, "Segoe UI", sans-serif', boxSizing: 'border-box' }}>
        <div className="header-bar" style={{ backgroundColor: '#505050', color: '#ffffff', fontSize: '20px', fontWeight: 'normal', padding: '10px 20px' }}>
          Server Error
        </div>
        <div className="main-container" style={{ margin: '15px 20px', backgroundColor: '#ffffff', border: '1px solid #d4d4d4', padding: '12px' }}>
          <div className="error-card" style={{ border: '1px solid #dcdcdc', padding: '12px 16px', backgroundColor: '#ffffff' }}>
            <h1 className="error-title" style={{ color: '#cc0000', fontSize: '16px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
              403 - Forbidden: Access is denied.
            </h1>
            <p className="error-message" style={{ color: '#000000', fontSize: '13px', fontWeight: 'bold', margin: 0 }}>
              {verifyError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // VIEW: Login Page
  if (flow === 'verify_login') {
    return (
      <VerifyLoginView
        candidate={candidate}
        handleLoginToTest={handleLoginToTest}
      />
    );
  }

  // VIEW: Lobby Loading Effect
  if (flow === 'lobby_loading') {
    return (
      <LobbyLoadingView
        lobbyMessage={lobbyMessage}
      />
    );
  }

  // VIEW: Step 2 - Terms and Conditions & Undertaking
  if (flow === 'terms_conditions') {
    return (
      <TermsConditionsView
        test={test}
        candidate={candidate}
        consentRulesChecked={consentRulesChecked}
        setConsentRulesChecked={setConsentRulesChecked}
        consentProctoringChecked={consentProctoringChecked}
        setConsentProctoringChecked={setConsentProctoringChecked}
        onProceedToSystemChecks={() => setFlow('system_checks')}
      />
    );
  }

  // VIEW: Step 3 - System & Hardware Compatibility Checks
  if (flow === 'system_checks') {
    return (
      <SystemChecksView
        test={test}
        candidate={candidate}
        securityMetadata={securityMetadata}
        multiDisplayDetected={multiDisplayDetected}
        isFullscreen={isFullscreen}
        isFocused={isFocused}
        webcamGranted={webcamGranted}
        micGranted={micGranted}
        systemChecksCompleted={systemChecksCompleted}
        onCompleteSystemChecks={() => setSystemChecksCompleted(true)}
        handleAuthorizeCamera={handleAuthorizeCamera}
        handleLockFullscreen={handleLockFullscreen}
        onBackToTerms={() => setFlow('terms_conditions')}
        onProceedToBiometrics={() => {
          setSystemChecksCompleted(true);
          setFlow('biometric_check');
        }}
      />
    );
  }

  // VIEW: Step 4 - Biometric & Hardware Verification Gate
  if (flow === 'biometric_check') {
    return (
      <BiometricCheckView
        candidate={candidate}
        test={test}
        webcamStream={webcamStream}
        webcamGranted={webcamGranted}
        micGranted={micGranted}
        isFullscreen={isFullscreen}
        isFocused={isFocused}
        savedBiometrics={biometricsCache}
        onSaveBiometricsCache={(update) => setBiometricsCache(prev => ({ ...prev, ...update }))}
        blazefaceModelRef={blazefaceModelRef}
        handleAuthorizeCamera={handleAuthorizeCamera}
        handleLockFullscreen={handleLockFullscreen}
        onBackToSystemChecks={() => setFlow('system_checks')}
        onCompleteBiometricGate={handleCompleteBiometricGate}
      />
    );
  }

  // VIEW: Step 5 - Guidelines & Proctoring Setup (With 1.00 min holding countdown)
  if (flow === 'guidelines_setup') {
    return (
      <GuidelinesSetupView
        test={test}
        candidate={candidate}
        isFullscreen={isFullscreen}
        handleLockFullscreen={handleLockFullscreen}
        onBackToBiometrics={() => setFlow('biometric_check')}
        handleStartExam={handleStartExam}
      />
    );
  }

  // VIEW: Active Proctoring Examination Workspace (Image 3 style)
  if (flow === 'active_exam') {
    return (
      <>
        <ActiveExamView
          test={test}
          candidate={candidate}
          examTimeLeft={examTimeLeft}
          isOnline={isOnline}
          submittingExam={submittingExam}
          handleManualSubmitExam={handleManualSubmitExam}
          webcamProctorWarning={webcamProctorWarning}
          examVideoRef={examVideoRef}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          showQuestionPalette={showQuestionPalette}
          setShowQuestionPalette={setShowQuestionPalette}
          selectedQuestionIndex={selectedQuestionIndex}
          setSelectedQuestionIndex={setSelectedQuestionIndex}
          examAnswers={examAnswers}
          setExamAnswers={setExamAnswers}
          draftMCQ={draftMCQ}
          setDraftMCQ={setDraftMCQ}
          draftCode={draftCode}
          setDraftCode={setDraftCode}
          draftLanguage={draftLanguage}
          draftQIdx={draftQIdx}
          setDraftQIdx={setDraftQIdx}
          handleLanguageChange={handleLanguageChange}
          webActiveTab={webActiveTab}
          setWebActiveTab={setWebActiveTab}
          draftHtml={draftHtml}
          setDraftHtml={setDraftHtml}
          draftCss={draftCss}
          setDraftCss={setDraftCss}
          draftJs={draftJs}
          setDraftJs={setDraftJs}
          consoleTab={consoleTab}
          setConsoleTab={setConsoleTab}
          isRunningCode={isRunningCode}
          handleRunCode={handleRunCode}
          runResults={runResults}
          compileError={compileError}
          handleSaveAndNext={handleSaveAndNext}
          triggerCustomConfirm={triggerCustomConfirm}
          showQuestionInfoModal={showQuestionInfoModal}
          setShowQuestionInfoModal={setShowQuestionInfoModal}
          showWarningModal={showWarningModal}
          setShowWarningModal={setShowWarningModal}
          proctoringWarnings={proctoringWarnings}
          customModal={customModal}
          setCustomModal={setCustomModal}
          isFullWebStudioOpen={isFullWebStudioOpen}
          setIsFullWebStudioOpen={setIsFullWebStudioOpen}
          webStudioViewportMode={webStudioViewportMode}
          setWebStudioViewportMode={setWebStudioViewportMode}
          webStudioConsoleOpen={webStudioConsoleOpen}
          setWebStudioConsoleOpen={setWebStudioConsoleOpen}
          webConsoleLogs={webConsoleLogs}
          setWebConsoleLogs={setWebConsoleLogs}
          saveServerDraft={saveServerDraft}
          activeQuestionBtnRef={activeQuestionBtnRef}
          navTrackRef={navTrackRef}
          setTest={setTest}
          onClipboardAttempt={handleClipboardAttempt}
        />

        {/* Bottom-right toast notification for blocked actions & proctoring alerts (Item B6) */}
        {toastNotification.visible && (
          <div
            role="alert"
            className="fixed bottom-6 right-6 z-[99999] max-w-md w-full bg-slate-900 border-2 border-red-500 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3.5 animate-bounce-subtle pointer-events-auto transition-all duration-300"
            style={{
              boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.4), 0 8px 10px -6px rgba(239, 68, 68, 0.3)'
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 border border-red-500/30">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-red-400 tracking-wide uppercase">{toastNotification.title}</div>
              <div className="text-xs text-slate-200 mt-1 leading-relaxed font-medium">{toastNotification.message}</div>
            </div>
            <button
              onClick={() => setToastNotification(prev => ({ ...prev, visible: false }))}
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors shrink-0"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </>
    );
  }



  // VIEW: Emergency Incident Report Form (EIRF) Filing Terminal
  if (flow === 'eirf_form') {
    return (
      <EirfFormView
        eirfDetails={eirfDetails}
        eirfFileName={eirfFileName}
        setEirfFileName={setEirfFileName}
        eirfFileContent={eirfFileContent}
        setEirfFileContent={setEirfFileContent}
        eirfDeclarationChecked={eirfDeclarationChecked}
        setEirfDeclarationChecked={setEirfDeclarationChecked}
        eirfExplanation={eirfExplanation}
        setEirfExplanation={setEirfExplanation}
        eirfPrimaryCause={eirfPrimaryCause}
        eirfAckUnderstand={eirfAckUnderstand}
        setEirfAckUnderstand={setEirfAckUnderstand}
        eirfWarningCount={eirfWarningCount}
        setEirfWarningCount={setEirfWarningCount}
        eirfTabReason={eirfTabReason}
        setEirfTabReason={setEirfTabReason}
        eirfFullscreenReason={eirfFullscreenReason}
        setEirfFullscreenReason={setEirfFullscreenReason}
        eirfInterruptions={eirfInterruptions}
        setEirfInterruptions={setEirfInterruptions}
        eirfPeripherals={eirfPeripherals}
        setEirfPeripherals={setEirfPeripherals}
        submittingEirf={submittingEirf}
        setSubmittingEirf={setSubmittingEirf}
        eirfErrorMessage={eirfErrorMessage}
        setEirfErrorMessage={setEirfErrorMessage}
        eirfSuccessMessage={eirfSuccessMessage}
        setEirfSuccessMessage={setEirfSuccessMessage}
        isSubmitBtnHovered={isSubmitBtnHovered}
        setIsSubmitBtnHovered={setIsSubmitBtnHovered}
        loadEirfDetails={loadEirfDetails}
      />
    );
  }



  // VIEW: Evaluated Answer Sheet Verification Review (Long vertically scrollable paper)
  if (flow === 'verification_review') {
    return (
      <VerificationReviewView
        candidate={candidate}
        test={test}
        submission={submission}
        webDevPreviewTabs={webDevPreviewTabs}
        setWebDevPreviewTabs={setWebDevPreviewTabs}
        verificationInstructionsModalOpen={verificationInstructionsModalOpen}
        setVerificationInstructionsModalOpen={setVerificationInstructionsModalOpen}
        verificationConsentChecked={verificationConsentChecked}
        setVerificationConsentChecked={setVerificationConsentChecked}
        handleOpenObjectionModal={handleOpenObjectionModal}
        objectionModal={objectionModal}
        setObjectionModal={setObjectionModal}
        handleCloseObjectionModal={handleCloseObjectionModal}
        handleCopyObjectionId={handleCopyObjectionId}
        handleObjectionFileUpload={handleObjectionFileUpload}
        handleSubmitObjection={handleSubmitObjection}
      />
    );
  }

  // VIEW: Submission Complete screen
  if (flow === 'finished') {
    return (
      <FinishedView
        finishedStep={finishedStep}
        setFinishedStep={setFinishedStep}
        submission={submission}
        hasPendingSubmit={hasPendingSubmit}
        setHasPendingSubmit={setHasPendingSubmit}
        isOnline={isOnline}
        syncStatus={syncStatus}
        setSyncStatus={setSyncStatus}
        triggerCustomAlert={triggerCustomAlert}
      />
    );
  }
}