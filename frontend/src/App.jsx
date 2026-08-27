import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, X, Bell, User, Lock, LogOut, ChevronDown, ChevronRight, 
  Upload, FileText, CheckCircle, AlertTriangle, HelpCircle, Calendar, ShieldAlert,
  Key, Video, BookOpen, ClipboardList, Settings, Users,
  GraduationCap, MessageSquare, Loader2, Clock, XCircle, Image, FileEdit, Activity,
  Volume2, VolumeX, Eye, Play, Pause, RefreshCw, Trash2, Ticket, Mail, LifeBuoy,
  Check, Plus, Code, Home, Phone, Layers, Printer, ExternalLink, Download
} from 'lucide-react';
import Editor from '@monaco-editor/react';

const API_BASE = import.meta.env.VITE_API_BASE || (() => {
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.hostname.startsWith('192.168.') || 
                  window.location.hostname.startsWith('10.') || 
                  window.location.hostname.startsWith('172.');
  return isLocal ? `http://127.0.0.1:5000/api` : `${window.location.origin}/api`;
})();

const COURSES_LIST = [
  "Introduction to Computer Science",
  "Programming Fundamentals with C++",
  "Basics of Web Development",
  "Mathematical Thinking (Discrete Structures)"
];

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

const LedgerUploadForm = ({ type, studentProfile, fetchStudentProfile, user, fetchStudentSubmissions, setView }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (selected.size > 5 * 1024 * 1024) {
        setUploadError("File size exceeds 5MB limit.");
        setFile(null);
        return;
      }
      setFile(selected);
      setUploadError('');
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setUploadError("Please select a file first.");
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const formData = new FormData();
    formData.append('ledgerFile', file);
    formData.append('type', type);

    try {
      const res = await fetch(`${API_BASE}/candidate/upload-ledger/${studentProfile.id || studentProfile._id}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadSuccess("Signed ledger uploaded successfully!");
        setFile(null);
        fetchStudentProfile();
      } else {
        setUploadError(data.error || "Failed to upload file.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Network connection error. Failed to reach server.");
    } finally {
      setUploading(false);
    }
  };

  const currentLedgerUrl = type === 'mid' ? studentProfile?.midSemLedgerUrl : studentProfile?.endSemLedgerUrl;

  return (
    <div style={{ marginTop: '15px', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', padding: '20px', borderRadius: '6px', textAlign: 'left' }}>
      <h4 style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002147', marginBottom: '10px' }}>
        Upload Scanned Signed Coursework Ledger ({type === 'mid' ? 'Mid' : 'End'} Sem)
      </h4>

      {uploadError && <div className="cf-alert cf-alert-error" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{uploadError}</div>}
      {uploadSuccess && <div className="cf-alert cf-alert-success" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{uploadSuccess}</div>}

      {currentLedgerUrl ? (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontSize: '9pt', fontWeight: 'bold', marginBottom: '10px' }}>
            <CheckCircle size={16} /> Signed ledger is already uploaded.
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
            <a 
              href={currentLedgerUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="cf-btn-secondary" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', textDecoration: 'none', color: '#002147', border: '1px solid #002147', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', backgroundColor: '#fff' }}
            >
              <Eye size={14} /> View Uploaded Document
            </a>
            <span style={{ fontSize: '8.5pt', color: '#64748b' }}>Or upload a new copy below to overwrite it.</span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontSize: '9pt', color: '#475569', margin: 0, lineHeight: '1.5' }}>
            Get your coursework submissions ledger printed and signed by your course instructor, then snap a photo or scan it and upload it here (PNG, JPG, or PDF under 5MB).
          </p>
          <div>
            <button 
              type="button" 
              className="cf-btn-secondary" 
              onClick={() => {
                setView('submissions');
                fetchStudentSubmissions(studentProfile?.studentId || user?.studentId || user?.username || "STU1001");
              }} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', color: '#3b5998', border: '1px solid #3b5998', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', backgroundColor: '#fff', cursor: 'pointer' }}
            >
              <Printer size={14} /> &larr; Go to Ledger to Print
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleUploadSubmit} style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
        <input 
          type="file" 
          onChange={handleFileChange} 
          accept="image/*,.pdf" 
          style={{ 
            fontSize: '9pt', 
            padding: '6px 10px', 
            border: '1px solid #cbd5e1', 
            borderRadius: '4px', 
            backgroundColor: '#fff',
            cursor: 'pointer',
            maxWidth: '280px'
          }} 
          required
          disabled={uploading}
        />

        <button 
          type="submit" 
          className="cf-btn-primary" 
          disabled={!file || uploading}
          style={{ fontSize: '9pt', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', cursor: !file || uploading ? 'not-allowed' : 'pointer' }}
        >
          {uploading ? (
            <>
              <Loader2 className="spinner" size={14} /> Uploading...
            </>
          ) : (
            'Upload & Verify'
          )}
        </button>
      </form>
    </div>
  );
};

export default function App() {
  const toLocalISOString = (dateOrStr) => {
    if (!dateOrStr) return '';
    const date = new Date(dateOrStr);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().substring(0, 16);
  };



  const [user, setUser] = useState(null); // { id, role, name }
  const [studentProfile, setStudentProfile] = useState(null); // Full candidate details
  const [ledgerQrData, setLedgerQrData] = useState(null);
  const [systemConfig, setSystemConfig] = useState(null);
  
  // Navigation states
  const [view, setView] = useState('login'); // login, announcements, register, info, timetable, hallticket, midsem, endsem, exit, admin
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [dropdowns, setDropdowns] = useState({
    student: true,
    coursework: true,
    submissions: true,
    exam: true,
    feedback: true
  });

  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileSidebarOpen]);

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

  useEffect(() => {
    const handlePageShow = (event) => {
      setEnteringTestId(null);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  useEffect(() => {
    const flushPendingLogs = async () => {
      try {
        const queueStr = localStorage.getItem('bics_pending_logs');
        if (!queueStr) return;
        const queue = JSON.parse(queueStr);
        if (queue.length === 0) return;

        let successCount = 0;
        for (let item of queue) {
          const res = await fetch(`${API_BASE}/log-client-error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          });
          if (res.ok) {
            successCount++;
          }
        }
        const remaining = queue.slice(successCount);
        if (remaining.length === 0) {
          localStorage.removeItem('bics_pending_logs');
        } else {
          localStorage.setItem('bics_pending_logs', JSON.stringify(remaining));
        }
      } catch (e) {
        console.warn("Log flushing error:", e);
      }
    };
    flushPendingLogs();
    const interval = setInterval(flushPendingLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync any pending test submissions cached in browser local storage
  useEffect(() => {
    const syncAllPendingSubmissions = async () => {
      if (!navigator.onLine) return;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('bics_pending_submit_')) {
            const cachedPayload = localStorage.getItem(key);
            if (cachedPayload) {
              const payload = JSON.parse(cachedPayload);
              const res = await fetch(`${API_BASE}/tests/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await res.json();
              if (data.success) {
                localStorage.removeItem(key);
                console.log(`Auto-synced pending submission for key: ${key}`);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Global background sync of pending submissions failed:", err);
      }
    };

    syncAllPendingSubmissions();
    window.addEventListener('online', syncAllPendingSubmissions);
    const interval = setInterval(syncAllPendingSubmissions, 30000); // Check every 30s
    return () => {
      window.removeEventListener('online', syncAllPendingSubmissions);
      clearInterval(interval);
    };
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Login inputs
  const [loginCreds, setLoginCreds] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Captcha and session persistence states
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');

  // Email verification state variables
  const [verificationEmailCode, setVerificationEmailCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState('');
  const [sendingVerificationCode, setSendingVerificationCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verificationCodeSent, setVerificationCodeSent] = useState(false);

  // Change Password Security state variables
  const [changePasswordCaptchaCode, setChangePasswordCaptchaCode] = useState('');
  const [changePasswordCaptchaInput, setChangePasswordCaptchaInput] = useState('');
  const [changePasswordEmailCode, setChangePasswordEmailCode] = useState('');
  const [changePasswordCodeSent, setChangePasswordCodeSent] = useState(false);
  const [sendingChangePasswordCode, setSendingChangePasswordCode] = useState(false);

  const generateChangePasswordCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setChangePasswordCaptchaCode(result);
    setChangePasswordCaptchaInput('');
  };

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(result);
    setCaptchaInput('');
  };

  // Admin states
  const [candidatesList, setCandidatesList] = useState([]);
  const [newCandidate, setNewCandidate] = useState({ studentId: '', name: '', username: '', password: '', eligible: false });
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [adminError, setAdminError] = useState('');

  // Student registration inputs
  const [regForm, setRegForm] = useState({
    preferredName: '',
    dob: '',
    permanentAddress: '',
    localAddress: '',
    billingAddress: '',
    emergencyName: '',
    emergencyRelation: '',
    emergencyAddress: '',
    emergencyPhone: '',
    personalPhone: '',
    personalEmail: '',
    collegeEmail: ''
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [sigFile, setSigFile] = useState(null);
  const [undertakingFile, setUndertakingFile] = useState(null);
  const [regSuccess, setRegSuccess] = useState('');
  const [regError, setRegError] = useState('');

  const compressImage = (file, maxBytes, callback) => {
    if (!file || !file.type.startsWith('image/')) {
      callback(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            callback(file);
            return;
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          callback(compressedFile);
        }, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setPhotoFile(null);
      return;
    }
    setRegError('');
    if (file.type.startsWith('image/')) {
      compressImage(file, 2 * 1024 * 1024, (compressed) => {
        if (compressed.size > 2 * 1024 * 1024) {
          setRegError("Profile Photo is too large (exceeds 2 MB limit even after compression). Please upload a smaller image.");
          setPhotoFile(null);
          e.target.value = '';
        } else {
          setPhotoFile(compressed);
        }
      });
    } else {
      if (file.size > 2 * 1024 * 1024) {
        setRegError("Profile Photo file size cannot exceed 2 MB.");
        setPhotoFile(null);
        e.target.value = '';
      } else {
        setPhotoFile(file);
      }
    }
  };

  const handleSigChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setSigFile(null);
      return;
    }
    setRegError('');
    if (file.type.startsWith('image/')) {
      compressImage(file, 2 * 1024 * 1024, (compressed) => {
        if (compressed.size > 2 * 1024 * 1024) {
          setRegError("Signature Image is too large (exceeds 2 MB limit even after compression). Please upload a smaller image.");
          setSigFile(null);
          e.target.value = '';
        } else {
          setSigFile(compressed);
        }
      });
    } else {
      if (file.size > 2 * 1024 * 1024) {
        setRegError("Signature Image file size cannot exceed 2 MB.");
        setSigFile(null);
        e.target.value = '';
      } else {
        setSigFile(file);
      }
    }
  };

  const handleUndertakingChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setUndertakingFile(null);
      return;
    }
    setRegError('');
    if (file.size > 2 * 1024 * 1024) {
      setRegError("Signed Undertaking PDF file size cannot exceed 2 MB. Please compress your PDF before uploading.");
      setUndertakingFile(null);
      e.target.value = '';
    } else {
      setUndertakingFile(file);
    }
  };
  const [showRegConfirmModal, setShowRegConfirmModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  // Consent checkbox
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSuccess, setConsentSuccess] = useState('');

  // Change password inputs
  const [pwdForm, setPwdForm] = useState({ newPassword: '', confirmPassword: '' });
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdError, setPwdError] = useState('');

  // Feedback states (course -> qIndex -> value)
  const [feedbackType, setFeedbackType] = useState('mid');
  const [feedbackAnswers, setFeedbackAnswers] = useState({});
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  // Exit Form state
  const [exitAnswers, setExitAnswers] = useState({ reason: '', recommendation: '', rating: '5' });
  const [exitSuccess, setExitSuccess] = useState('');

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [adminTimetableNotice, setAdminTimetableNotice] = useState('');
  const [adminExamType, setAdminExamType] = useState('midsem');
  const [adminTimetable, setAdminTimetable] = useState([
    { code: "CS-101", course: "Introduction to Computer Science", date: '', time: '', marks: 50 },
    { code: "CS-102", course: "Programming Fundamentals with C++", date: '', time: '', marks: 50 },
    { code: "CS-103", course: "Basics of Web Development", date: '', time: '', marks: 50 },
    { code: "CS-104", course: "Mathematical Thinking (Discrete Structures)", date: '', time: '', marks: 50 }
  ]);
  const [adminClassTests, setAdminClassTests] = useState([]);

  // CourseWork states
  const [videoLectures, setVideoLectures] = useState([]);
  const [courseMaterials, setCourseMaterials] = useState([]);
  const [selectedLecture, setSelectedLecture] = useState(null);

  // Admin System Logs & Live Proctoring Monitoring states
  const [systemLogs, setSystemLogs] = useState([]);
  const [liveSubmissions, setLiveSubmissions] = useState([]);
  const [selectedProctorTest, setSelectedProctorTest] = useState(null);
  const [selectedProctorStudent, setSelectedProctorStudent] = useState(null);
  const [logFilterActor, setLogFilterActor] = useState('');
  const [logFilterAction, setLogFilterAction] = useState('ALL');
  const [logFilterSeverity, setLogFilterSeverity] = useState('ALL');
  const [logPage, setLogPage] = useState(1);

  // Tickets & Contact Helpdesk states
  const [contactCategory, setContactCategory] = useState('suggestion');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSuccess, setContactSuccess] = useState('');
  const [contactError, setContactError] = useState('');
  const [studentTickets, setStudentTickets] = useState([]);
  const [contactSubView, setContactSubView] = useState('form');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const [adminTickets, setAdminTickets] = useState([]);
  const [selectedAdminTicket, setSelectedAdminTicket] = useState(null);
  const [adminTicketResolutionFeedback, setAdminTicketResolutionFeedback] = useState('');
  const [adminTicketResolutionStatus, setAdminTicketResolutionStatus] = useState('resolved');
  const [adminTicketFilterCategory, setAdminTicketFilterCategory] = useState('ALL');
  const [adminTicketFilterStatus, setAdminTicketFilterStatus] = useState('ALL');

  const fetchStudentTickets = async (candidateId) => {
    try {
      const res = await fetch(`${API_BASE}/candidate/tickets/list/${candidateId}`);
      if (res.ok) {
        const data = await res.json();
        setStudentTickets(data.tickets || []);
      }
    } catch (e) {
      console.error("Error fetching student tickets:", e);
    }
  };

  const fetchAdminTickets = async () => {
    setLoadingMessage("Synchronizing helpdesk tickets...");
    try {
      const res = await fetch(`${API_BASE}/admin/tickets`);
      if (res.ok) {
        const data = await res.json();
        setAdminTickets(data.tickets || []);
      }
    } catch (e) {
      console.error("Error fetching admin tickets:", e);
    } finally {
      setLoadingMessage('');
    }
  };

  const fetchSystemLogs = async () => {
    setLoadingMessage("Loading system audit logs...");
    try {
      const res = await fetch(`${API_BASE}/admin/system-logs`);
      if (res.ok) {
        const data = await res.json();
        setSystemLogs(data || []);
      }
    } catch (e) {
      console.error("Error fetching system logs:", e);
    } finally {
      setLoadingMessage('');
    }
  };

  const fetchLiveSubmissions = async () => {
    setLoadingMessage("Loading live exam streams...");
    try {
      let allSubs = [];
      for (let test of adminTests) {
        const testId = test.id || test._id;
        const res = await fetch(`${API_BASE}/admin/tests/submissions/${testId}`);
        if (res.ok) {
          const subs = await res.json();
          allSubs = [...allSubs, ...subs];
        }
      }
      setLiveSubmissions(allSubs);
    } catch (e) {
      console.error("Error fetching live submissions:", e);
    } finally {
      setLoadingMessage('');
    }
  };

  const fetchStudentSubmissions = async (studentId) => {
    setLoadingMessage("Synchronizing Classroom Submissions...");
    try {
      const res = await fetch(`${API_BASE}/student/submissions/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        console.log("DEBUG: Loaded Student Submissions:", data);
        setStudentSubmissions(data || []);
      }
      
      // Fetch corresponding QR verification code details
      const lookupId = studentProfile?.studentId || user?.studentId || studentId;
      const semType = systemConfig?.examType === 'endsem' ? 'end' : 'mid';
      const qrRes = await fetch(`${API_BASE}/candidate/ledger-qr-data/${lookupId}?type=${semType}`);
      if (qrRes.ok) {
        const qrData = await qrRes.json();
        setLedgerQrData(qrData);
      }
    } catch (e) {
      console.error("Error fetching student submissions:", e);
    } finally {
      setLoadingMessage('');
    }
  };

  const fetchAdminSubmissions = async () => {
    setLoadingMessage("Loading Classroom Submissions Ledger...");
    try {
      const res = await fetch(`${API_BASE}/admin/submissions`);
      if (res.ok) {
        const data = await res.json();
        setAdminSubmissions(data || []);
      }
    } catch (e) {
      console.error("Error fetching admin submissions:", e);
    } finally {
      setLoadingMessage('');
    }
  };

  const saveAdminSubmission = async (sub) => {
    setLoadingMessage("Saving submission details...");
    const toUtcString = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const payload = {
      ...sub,
      submissionDate: toUtcString(sub.submissionDate),
      dueDate: toUtcString(sub.dueDate)
    };
    try {
      const res = await fetch(`${API_BASE}/admin/submissions/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          fetchAdminSubmissions();
          setSubmissionSuccess("Submission saved successfully.");
          setShowSubmissionModal(false);
          setEditingSubmission(null);
          setTimeout(() => setSubmissionSuccess(''), 3000);
        } else {
          setSubmissionError(data.error || "Failed to save submission.");
        }
      } else {
        const errData = await res.json();
        setSubmissionError(errData.error || "Server error occurred.");
      }
    } catch (e) {
      console.error("Error saving submission:", e);
      setSubmissionError("Network error: Could not contact server.");
    } finally {
      setLoadingMessage('');
    }
  };

  const deleteAdminSubmission = async (id) => {
    setLoadingMessage("Deleting submission record...");
    try {
      const res = await fetch(`${API_BASE}/admin/submissions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAdminSubmissions();
        setSubmissionSuccess("Submission deleted successfully.");
        setTimeout(() => setSubmissionSuccess(''), 3000);
      }
    } catch (e) {
      console.error("Error deleting submission:", e);
    } finally {
      setLoadingMessage('');
    }
  };

  // Admin CourseWork creation states
  const [newLecture, setNewLecture] = useState({ section: '', title: '', youtubeUrl: '' });
  const [newMaterial, setNewMaterial] = useState({ section: '', title: '', fileUrl: '' });
  const [materialFile, setMaterialFile] = useState(null);
  const [courseworkSuccess, setCourseworkSuccess] = useState('');
  const [courseworkError, setCourseworkError] = useState('');

  // Online Test Module states
  const [allowedTestAccess, setAllowedTestAccess] = useState(false);
  const [activeExam, setActiveExam] = useState(null);
  const [activeSubmission, setActiveSubmission] = useState(null);
  const [examAnswers, setExamAnswers] = useState([]); // Array of { questionId, type, selectedOptionIndex, submittedCode }
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [proctoringWarnings, setProctoringWarnings] = useState({ fullscreenExits: 0, tabSwitches: 0 });
  const [proctoringAlertMessage, setProctoringAlertMessage] = useState('');
  const [showProctoringWarningModal, setShowProctoringWarningModal] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraStream, setCameraStream] = useState(null);
  const [examConsentChecked, setExamConsentChecked] = useState(false);
  const [activeStudentTests, setActiveStudentTests] = useState([]);
  const [enteringTestId, setEnteringTestId] = useState(null);
  const [submittedTestsList, setSubmittedTestsList] = useState([]);
  const [selectedVerificationTestId, setSelectedVerificationTestId] = useState('');

  // Re-evaluation form states
  const [showReevalForm, setShowReevalForm] = useState(false);
  const [reevalComplaintText, setReevalComplaintText] = useState('');
  const [reevalSelectedQuestions, setReevalSelectedQuestions] = useState([]);
  const [reevalProofUrls, setReevalProofUrls] = useState([]);
  const [reevalUploading, setReevalUploading] = useState(false);
  const [reevalSubmitting, setReevalSubmitting] = useState(false);

  // Admin Re-evaluation grading states
  const [adminReevalStatus, setAdminReevalStatus] = useState('pending');
  const [adminReevalResolutionFeedback, setAdminReevalResolutionFeedback] = useState('');
  const [adminGradingAnswers, setAdminGradingAnswers] = useState({});

  // Admin Exam configuration states
  const [adminTests, setAdminTests] = useState([]);
  const [showTestCreator, setShowTestCreator] = useState(false);
  const [creatorStep, setCreatorStep] = useState(1); // 1 = Details, 2 = Questions, 3 = Review
  const [editingQuestionIdx, setEditingQuestionIdx] = useState(null); // null = Question list view, index = specific question editor
  const [editingTestConfigId, setEditingTestConfigId] = useState(null); // null = new, string = existing test ID
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamMarks, setNewExamMarks] = useState(100);
  const [newExamInstructions, setNewExamInstructions] = useState('');
  const [newExamDuration, setNewExamDuration] = useState(60);
  const [newExamStart, setNewExamStart] = useState('');
  const [newExamEnd, setNewExamEnd] = useState('');
  const [newExamQuestions, setNewExamQuestions] = useState([]); // Questions array builder
  const [imageUploadingIdx, setImageUploadingIdx] = useState(-1); // Question image upload loader tracker
  const [adminExamSubmissions, setAdminExamSubmissions] = useState([]);
  const [adminActiveWebTabs, setAdminActiveWebTabs] = useState({});
  const [studentActiveWebTabs, setStudentActiveWebTabs] = useState({});

  // Student exam workspace draft state variables
  // Digital Submission Tracker States
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [adminSubmissions, setAdminSubmissions] = useState([]);
  const [activeSubmissionTab, setActiveSubmissionTab] = useState('all'); // all, assignment, practical, class_test
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null); // null = new, object = editing
  const [submissionError, setSubmissionError] = useState('');
  const [submissionSuccess, setSubmissionSuccess] = useState('');
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);
  const [webhookSimPayload, setWebhookSimPayload] = useState({
    email: 'siyam.bubere@school.edu',
    studentId: 'STU1001',
    courseCode: 'R526CS01T',
    courseName: 'Introduction to Computer Science',
    title: 'Assignment 1: Number Systems & Logic Gates',
    type: 'assignment',
    submissionDate: toLocalISOString(new Date()),
    dueDate: toLocalISOString(new Date(Date.now() + 86400000)),
    score: 18,
    maxScore: 20,
    classroomLink: 'https://classroom.google.com/c/R526CS01T'
  });

  const [draftMCQ, setDraftMCQ] = useState(-1);
  const [draftCode, setDraftCode] = useState('');

  // Auth Loading Mocking State
  const [authLoading, setAuthLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Custom dialog modals
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'OK',
    cancelText: 'Cancel'
  });

  const showModalAlert = (title, message) => {
    setModalState({
      isOpen: true,
      title,
      message,
      onConfirm: null,
      confirmText: 'OK',
      cancelText: 'Cancel'
    });
  };

  const showModalConfirm = (title, message, onConfirm, confirmText = 'Yes, Proceed', cancelText = 'Cancel') => {
    setModalState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      confirmText,
      cancelText
    });
  };
  const [selectedExamSubmission, setSelectedExamSubmission] = useState(null);
  const [adminGradingCodingScore, setAdminGradingCodingScore] = useState(0);
  const [adminGradingFeedback, setAdminGradingFeedback] = useState('');
  const [codingEvaluationResults, setCodingEvaluationResults] = useState({});

  // Interactive Practice Playground States
  const [playgroundMode, setPlaygroundMode] = useState('cpp'); // 'cpp' or 'web'
  const [playgroundCppCode, setPlaygroundCppCode] = useState(
`#include <iostream>
using namespace std;

int main() {
    cout << "Welcome to BICS C++ Playground!" << endl;
    int x;
    if (cin >> x) {
        cout << "Your input multiplied by 2 is: " << (x * 2) << endl;
    } else {
        cout << "Please provide a number in the Stdin input box." << endl;
    }
    return 0;
}
`
  );
  const [terminalLines, setTerminalLines] = useState([
    'Welcome to BICS Terminal Console.',
    'Type your inputs at the prompt below and press Enter to buffer them.',
    'Click "Run C++ Code" to execute.'
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [bufferedStdin, setBufferedStdin] = useState([]);
  const [previousOutputText, setPreviousOutputText] = useState('');
  const [initialOutputText, setInitialOutputText] = useState('');
  const [isTerminalWaiting, setIsTerminalWaiting] = useState(false);
  const [isPlayinggroundRunning, setIsPlaygroundRunning] = useState(false);
  const terminalEndRef = React.useRef(null);

  // Web Playground States
  const [playgroundWebTab, setPlaygroundWebTab] = useState('html'); // 'html', 'css', 'js'
  const [playgroundWebHtml, setPlaygroundWebHtml] = useState('<h1>Welcome to BICS Web Playground!</h1>\n<p>Edit HTML, CSS, or JS and see it update live below.</p>\n<button id="btn" class="pg-btn">Click Me!</button>');
  const [playgroundWebCss, setPlaygroundWebCss] = useState('body {\n  font-family: sans-serif;\n  padding: 20px;\n  text-align: center;\n  background: #f8fafc;\n}\nh1 {\n  color: #3b5998;\n}\n.pg-btn {\n  padding: 8px 16px;\n  background: #3b5998;\n  color: white;\n  border: none;\n  border-radius: 4px;\n  cursor: pointer;\n  transition: background 0.2s;\n}\n.pg-btn:hover {\n  background: #2d4373;\n}');
  const [playgroundWebJs, setPlaygroundWebJs] = useState('document.getElementById("btn").addEventListener("click", () => {\n  alert("Hello from JS!");\n});');

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLines]);

  const getCleanInitialLines = (rawOutput) => {
    return rawOutput.split('\n').filter(l => {
      const lower = l.toLowerCase();
      return !lower.includes('stdin input box') && !lower.includes('provide a number') && l.trim() !== '';
    });
  };

  const getRemainingLines = (initialLines, newOutput) => {
    const currentLines = newOutput.split('\n').filter(l => l.trim() !== '');
    let matchIdx = 0;
    while (matchIdx < initialLines.length && matchIdx < currentLines.length) {
      if (initialLines[matchIdx].trim() === currentLines[matchIdx].trim()) {
        matchIdx++;
      } else {
        break;
      }
    }
    return currentLines.slice(matchIdx);
  };

  const truncateLinesIfNeeded = (lines, maxLines = 1000) => {
    if (lines.length <= maxLines) return lines;
    const truncated = lines.slice(0, maxLines);
    truncated.push(`[Console Output truncated... showing first ${maxLines} lines. Total lines generated: ${lines.length}]`);
    return truncated;
  };

  const handleTerminalSubmit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentInput = terminalInput;
      
      const newStdinList = [...bufferedStdin, currentInput];
      setBufferedStdin(newStdinList);
      setTerminalInput('');
      setIsTerminalWaiting(false);

      const stdin = newStdinList.join('\n');

      try {
        const res = await fetch(`${API_BASE}/tests/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceCode: playgroundCppCode,
            testCases: [{
              input: stdin,
              output: '',
              isSample: true
            }]
          })
        });
        const data = await res.json();
        
        if (res.ok && data.results && data.results[0]) {
          const runRes = data.results[0];
          const newOutput = runRes.actualOutput || '';
          
          const initialLines = getCleanInitialLines(initialOutputText);
          const remaining = getRemainingLines(initialLines, newOutput);
          
          let reconstructed = ['$ ./main', ...initialLines];
          newStdinList.forEach((inputVal) => {
            reconstructed.push(`$ ${inputVal}`);
          });
          reconstructed.push(...remaining);

          const cinCount = (playgroundCppCode.match(/cin\s*>>/g) || []).length;
          const getlineCount = (playgroundCppCode.match(/getline\s*\(\s*cin/g) || []).length;
          const scanfCount = (playgroundCppCode.match(/scanf\s*\(/g) || []).length;
          const totalExpected = cinCount + getlineCount + scanfCount;

          if (newStdinList.length >= totalExpected || newOutput.trim() === previousOutputText.trim()) {
            reconstructed.push('', 'Program exited with status code 0.');
            setTerminalLines(truncateLinesIfNeeded(reconstructed));
            setIsPlaygroundRunning(false);
            setIsTerminalWaiting(false);
          } else {
            setPreviousOutputText(newOutput);
            setTerminalLines(truncateLinesIfNeeded(reconstructed));
            setIsTerminalWaiting(true);
          }
        } else {
          setTerminalLines(prev => [...prev, 'Error: Failed to process input stream.']);
          setIsPlaygroundRunning(false);
          setIsTerminalWaiting(false);
        }
      } catch (err) {
        console.error(err);
        setTerminalLines(prev => [...prev, 'Error: Failed to reach compilation server.']);
        setIsPlaygroundRunning(false);
        setIsTerminalWaiting(false);
      }
    }
  };

  const handleRunPlaygroundCpp = async () => {
    setIsPlaygroundRunning(true);
    setIsTerminalWaiting(false);
    setBufferedStdin([]);
    setPreviousOutputText('');
    setInitialOutputText('');
    
    setTerminalLines(['$ ./main', '[Compiling and executing...]']);

    try {
      const res = await fetch(`${API_BASE}/tests/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode: playgroundCppCode,
          testCases: [{
            input: '',
            output: '',
            isSample: true
          }]
        })
      });
      const data = await res.json();
      
      setTerminalLines(prev => {
        const history = prev.filter(l => l !== '[Compiling and executing...]');
        
        if (res.ok) {
          if (data.status === 'Compilation Error') {
            setIsPlaygroundRunning(false);
            return [
              ...history,
              `Compilation Error:`,
              ...(data.compileError || 'Compilation failed.').split('\n')
            ];
          } else if (data.results && data.results[0]) {
            const runRes = data.results[0];
            if (runRes.status === 'Runtime Error' || runRes.stderr) {
              setIsPlaygroundRunning(false);
              return [
                ...history,
                `Runtime Error:`,
                ...(runRes.stderr || 'Runtime error occurred.').split('\n')
              ];
            } else {
              const stdout = runRes.actualOutput || '';
              setPreviousOutputText(stdout);
              setInitialOutputText(stdout);
              
              const initialLines = getCleanInitialLines(stdout);
              
              const cinCount = (playgroundCppCode.match(/cin\s*>>/g) || []).length;
              const getlineCount = (playgroundCppCode.match(/getline\s*\(\s*cin/g) || []).length;
              const scanfCount = (playgroundCppCode.match(/scanf\s*\(/g) || []).length;
              const totalExpected = cinCount + getlineCount + scanfCount;

              if (totalExpected > 0) {
                setIsTerminalWaiting(true);
                return truncateLinesIfNeeded([
                  ...history,
                  ...initialLines
                ]);
              } else {
                setIsPlaygroundRunning(false);
                return truncateLinesIfNeeded([
                  ...history,
                  ...initialLines,
                  '',
                  'Program exited with status code 0.'
                ]);
              }
            }
          } else {
            setIsPlaygroundRunning(false);
            return [
              ...history,
              `Error: ${data.error || 'Execution returned empty response.'}`
            ];
          }
        } else {
          setIsPlaygroundRunning(false);
          return [
            ...history,
            `Error: ${data.error || 'Failed to run code.'}`
          ];
        }
      });
    } catch (err) {
      console.error(err);
      setIsPlaygroundRunning(false);
      setTerminalLines(prev => {
        const history = prev.filter(l => l !== '[Compiling and executing...]');
        return [
          ...history,
          'Error: Failed to connect to compilation server.'
        ];
      });
    }
  };

  const handlePlaygroundKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.target;
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      
      if (playgroundMode === 'cpp') {
        setPlaygroundCppCode(newValue);
      } else {
        if (playgroundWebTab === 'html') setPlaygroundWebHtml(newValue);
        else if (playgroundWebTab === 'css') setPlaygroundWebCss(newValue);
        else if (playgroundWebTab === 'js') setPlaygroundWebJs(newValue);
      }
      
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = selectionStart + 2;
      }, 0);
    }
  };

  const fetchVideoLectures = async () => {
    try {
      const res = await fetch(`${API_BASE}/video-lectures`);
      const data = await res.json();
      setVideoLectures(data);
      if (data.length > 0 && !selectedLecture) {
        setSelectedLecture(data[0]);
      }
    } catch (e) {
      console.error("Error fetching video lectures:", e);
    }
  };

  const fetchCourseMaterials = async () => {
    try {
      const res = await fetch(`${API_BASE}/course-materials`);
      const data = await res.json();
      setCourseMaterials(data);
    } catch (e) {
      console.error("Error fetching course materials:", e);
    }
  };

  const handleAddLecture = async (e) => {
    e.preventDefault();
    if (!newLecture.section || !newLecture.title || !newLecture.youtubeUrl) {
      setCourseworkError("All lecture fields are required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/video-lectures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLecture)
      });
      const data = await res.json();
      if (data.success) {
        setCourseworkSuccess("Video lecture added successfully!");
        setCourseworkError('');
        setNewLecture({ section: '', title: '', youtubeUrl: '' });
        fetchVideoLectures();
      } else {
        setCourseworkError(data.error || "Failed to add video lecture.");
      }
    } catch (err) {
      console.error(err);
      setCourseworkError("Connection error. Could not add video lecture.");
    }
  };

  const handleDeleteLecture = async (id) => {
    if (!window.confirm("Are you sure you want to delete this lecture?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/video-lectures/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setCourseworkSuccess("Video lecture deleted successfully!");
        setCourseworkError('');
        fetchVideoLectures();
        setSelectedLecture(prev => prev && (prev.id === id || prev._id === id) ? null : prev);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!newMaterial.section || !newMaterial.title || !materialFile) {
      setCourseworkError("Section, Title, and Material Document File are required.");
      return;
    }

    const formData = new FormData();
    formData.append('section', newMaterial.section);
    formData.append('title', newMaterial.title);
    formData.append('materialFile', materialFile);

    try {
      const res = await fetch(`${API_BASE}/admin/course-materials`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setCourseworkSuccess("Course material uploaded to Cloud successfully!");
        setCourseworkError('');
        setNewMaterial({ section: '', title: '', fileUrl: '' });
        setMaterialFile(null);
        e.target.reset();
        fetchCourseMaterials();
      } else {
        setCourseworkError(data.error || "Failed to add course material.");
      }
    } catch (err) {
      console.error(err);
      setCourseworkError("Connection error. Could not add course material.");
    }
  };

  const handleDeleteMaterial = async (id) => {
    if (!window.confirm("Are you sure you want to delete this course material?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/course-materials/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setCourseworkSuccess("Course material deleted successfully!");
        setCourseworkError('');
        fetchCourseMaterials();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getYouTubeEmbedUrl = (url) => {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
  };

  // ONLINE TEST MODULE HELPER FUNCTIONS
  const fetchStudentActiveTests = async () => {
    try {
      const candId = user ? (user.id || user._id) : '';
      const res = await fetch(`${API_BASE}/tests/active?candidateId=${candId}`);
      const data = await res.json();
      setActiveStudentTests(data || []);
    } catch (e) {
      console.error("Error fetching active student tests:", e);
    }
  };

  const fetchAdminTests = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/tests`);
      const data = await res.json();
      setAdminTests(data || []);
    } catch (e) {
      console.error("Error fetching admin tests:", e);
    }
  };

  const fetchSubmittedTestsList = async (candidateId) => {
    try {
      const res = await fetch(`${API_BASE}/tests/submitted?candidateId=${candidateId}`);
      const data = await res.json();
      if (res.ok) {
        setSubmittedTestsList(data || []);
        if (data && data.length > 0) {
          setSelectedVerificationTestId(data[0].id || data[0]._id);
        }
      }
    } catch (e) {
      console.error("Failed to retrieve candidate submitted tests:", e);
    }
  };

  const handleReevalImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setReevalUploading(true);
    const formData = new FormData();
    formData.append('imageFile', file);
    
    try {
      const res = await fetch(`${API_BASE}/admin/upload-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        setReevalProofUrls(prev => [...prev, data.url]);
      } else {
        alert(data.error || "Failed to upload proof image.");
      }
    } catch (err) {
      console.error(err);
      alert("Network Error uploading proof image.");
    } finally {
      setReevalUploading(false);
    }
  };

  const handleApplyReevalSubmit = async (submissionId) => {
    if (!reevalComplaintText.trim()) {
      alert("Please provide a detailed explanation of your complaint.");
      return;
    }
    
    setReevalSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tests/reevaluation/${submissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintText: reevalComplaintText,
          complainedQuestions: reevalSelectedQuestions,
          proofImages: reevalProofUrls
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowReevalForm(false);
        setReevalComplaintText('');
        setReevalSelectedQuestions([]);
        setReevalProofUrls([]);
        if (user) fetchSubmittedTestsList(user.id || user._id);
      } else {
        alert(data.error || "Failed to file re-evaluation claim.");
      }
    } catch (err) {
      console.error(err);
      alert("Network Error filing re-evaluation complaint.");
    } finally {
      setReevalSubmitting(false);
    }
  };

  const handleStartWebcam = async () => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setTimeout(() => {
        const videoElement = document.getElementById('setup-webcam-preview');
        if (videoElement) {
          videoElement.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error("Webcam access denied:", err);
      showModalAlert("Camera Permissions Required", "Proctoring requires active Web camera permissions. Please check your browser privacy preferences and allow camera calibration.");
    }
  };

  const handleStartExam = async (testId) => {
    if (window.innerWidth < 1024) {
      showModalAlert(
        "Desktop View Required",
        "To ensure exam integrity, the Online Test Terminal can only be accessed on desktop screens (monitors or laptops). Mobile and tablet devices are not supported. Please switch to a desktop screen and maximize your window to enter the test."
      );
      return;
    }
    setEnteringTestId(testId);
    try {
      const res = await fetch(`${API_BASE}/tests/generate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: user.id || user._id,
          testId: testId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEnteringTestId(null);
        showModalAlert("Access Denied", data.error || "Failed to generate exam access token.");
        return;
      }
 
      // Redirect to FrontendOT (port 5174 in development or custom Netlify deployment URL)
      const otBaseUrl = import.meta.env.VITE_OT_URL || (
        window.location.origin.includes('localhost')
          ? 'http://localhost:5174'
          : `${window.location.origin.replace('bics-portal', 'ot-bics').replace('bicsportal', 'otbicsexam')}`
      );
      const examUrl = `${otBaseUrl}/?token=${data.token}`;
      
      setTimeout(() => {
        window.location.href = examUrl;
      }, 1200);
    } catch (err) {
      setEnteringTestId(null);
      console.error(err);
      showModalAlert("Connection Failed", "Unable to establish secure tunnel to Exam portal.");
    }
  };

  const updateQuestionAnswer = (value, fieldName) => {
    setExamAnswers(prev => {
      const updated = [...prev];
      const cur = { ...updated[selectedQuestionIndex] };
      if (fieldName === 'mcq') {
        cur.selectedOptionIndex = value;
      } else {
        cur.submittedCode = value;
      }
      updated[selectedQuestionIndex] = cur;
      return updated;
    });
  };

  const submitExamPayload = async (isAuto) => {
    // Automatically capture the current active question's draft selection/code if any
    let finalAnswers = [...examAnswers];
    if (selectedQuestionIndex >= 0 && selectedQuestionIndex < finalAnswers.length) {
      finalAnswers[selectedQuestionIndex] = {
        ...finalAnswers[selectedQuestionIndex],
        selectedOptionIndex: draftMCQ,
        submittedCode: draftCode
      };
    }

    try {
      await fetch(`${API_BASE}/tests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: activeSubmission.id || activeSubmission._id,
          answers: finalAnswers,
          proctoringLog: {
            fullscreenExits: proctoringWarnings.fullscreenExits,
            tabSwitches: proctoringWarnings.tabSwitches,
            webcamStatus: cameraStream ? 'active' : 'failed'
          },
          status: isAuto ? 'auto-submitted' : 'submitted'
        })
      });
    } catch (e) {
      console.error(e);
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(err));
    }

    setAllowedTestAccess(false);
    setActiveExam(null);
    setActiveSubmission(null);
    setExamAnswers([]);
    setExamConsentChecked(false);
    setView('announcements');

    showModalAlert(
      "Submission Complete",
      isAuto
        ? "Your session has closed or the proctoring warnings limit was reached. Your answers were automatically saved."
        : "Congratulations! Your exam was submitted successfully."
    );
  };

  const handleSubmitExam = async (isAuto = false) => {
    if (!activeSubmission) return;

    if (!isAuto) {
      showModalConfirm(
        "Finalize & Submit Exam",
        "Are you sure you want to finalize and submit your answers? Once submitted, you cannot modify this attempt.",
        () => submitExamPayload(false),
        "Yes, Submit Test",
        "Cancel"
      );
    } else {
      await submitExamPayload(true);
    }
  };

  const handleEditorTabKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const value = e.target.value;
      const newValue = value.substring(0, start) + "    " + value.substring(end);
      
      setDraftCode(newValue);
      
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const handleSaveAndNext = () => {
    setExamAnswers(prev => {
      const updated = [...prev];
      updated[selectedQuestionIndex] = {
        ...updated[selectedQuestionIndex],
        selectedOptionIndex: draftMCQ,
        submittedCode: draftCode
      };
      return updated;
    });

    if (selectedQuestionIndex < (activeExam.questions?.length || 1) - 1) {
      setSelectedQuestionIndex(selectedQuestionIndex + 1);
    }
  };

  const handleUploadQuestionImage = async (e, idx) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageUploadingIdx(idx);
    const formData = new FormData();
    formData.append('imageFile', file);

    try {
      const res = await fetch(`${API_BASE}/admin/upload-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        const updated = [...newExamQuestions];
        updated[idx].imageUrl = data.url;
        setNewExamQuestions(updated);
        showModalAlert("Upload Successful", "Image uploaded successfully and linked to the question!");
      } else {
        showModalAlert("Upload Error", data.error || "Failed to upload image.");
      }
    } catch (err) {
      console.error(err);
      showModalAlert("Upload Failure", "Network error occurred while uploading image.");
    } finally {
      setImageUploadingIdx(-1);
    }
  };

  // ADMIN EXAM MANAGEMENT ROUTINES
  const handleCreateTest = async (e) => {
    e.preventDefault();
    if (!newExamTitle || !newExamStart || !newExamEnd || newExamQuestions.length === 0) {
      showModalAlert("Validation Error", "Please fill in Test Title, Access Dates, and configure at least 1 question before saving.");
      return;
    }

    const parseLocalDatetime = (dtStr) => {
      if (!dtStr) return new Date();
      const [datePart, timePart] = dtStr.split('T');
      if (!datePart || !timePart) return new Date(dtStr);
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      return new Date(year, month - 1, day, hour, minute);
    };

    try {
      const res = await fetch(`${API_BASE}/admin/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingTestConfigId,
          title: newExamTitle,
          marks: Number(newExamMarks || 0),
          instructions: newExamInstructions,
          duration: Number(newExamDuration || 60),
          startDate: parseLocalDatetime(newExamStart).toISOString(),
          endDate: parseLocalDatetime(newExamEnd).toISOString(),
          questions: newExamQuestions
        })
      });
      const data = await res.json();
      if (data.success) {
        showModalAlert("Test Configured", editingTestConfigId ? "Online practice test configuration has been updated successfully!" : "Online practice test has been configured and created successfully!");
        setNewExamTitle('');
        setNewExamMarks(100);
        setNewExamInstructions('');
        setNewExamDuration(60);
        setNewExamStart('');
        setNewExamEnd('');
        setNewExamQuestions([]);
        setCreatorStep(1);
        setEditingQuestionIdx(null);
        setEditingTestConfigId(null);
        setShowTestCreator(false);
        fetchAdminTests();
      } else {
        showModalAlert("Configuration Error", data.error || "Failed to save test configuration.");
      }
    } catch (err) {
      console.error(err);
      showModalAlert("Connection Failure", "Error connecting to the server to save test configuration.");
    }
  };

  const handleEditTest = (test) => {
    setEditingTestConfigId(test._id || test.id);
    setNewExamTitle(test.title || '');
    setNewExamMarks(test.marks || 100);
    setNewExamInstructions(test.instructions || '');
    setNewExamDuration(test.duration || 60);
    
    // Parse ISO dates to local format YYYY-MM-DDTHH:mm
    const formatToInputLocal = (isoStr) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    
    setNewExamStart(formatToInputLocal(test.startDate));
    setNewExamEnd(formatToInputLocal(test.endDate));
    setNewExamQuestions(test.questions || []);
    setCreatorStep(1);
    setEditingQuestionIdx(null);
    setShowTestCreator(true);
    
    setTimeout(() => {
      document.getElementById('admin-test-creator-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleDeleteTest = async (id) => {
    showModalConfirm(
      "Confirm Test Deletion",
      "Are you sure you want to delete this test? All candidate answer sheets and grading records will be deleted permanently.",
      async () => {
        try {
          const res = await fetch(`${API_BASE}/admin/tests/${id}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.success) {
            showModalAlert("Test Deleted", "The practice test has been successfully deleted.");
            fetchAdminTests();
            if (selectedExamSubmission && selectedExamSubmission.testId === id) {
              setSelectedExamSubmission(null);
            }
          }
        } catch (err) {
          console.error(err);
          showModalAlert("Deletion Failure", "Failed to delete the practice test. Please check connection.");
        }
      },
      "Yes, Delete Permanently",
      "Cancel"
    );
  };

  const fetchExamSubmissions = async (testId) => {
    setLoadingMessage("Fetching exam submission details...");
    try {
      const res = await fetch(`${API_BASE}/admin/tests/submissions/${testId}`);
      const data = await res.json();
      setAdminExamSubmissions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMessage('');
    }
  };

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    if (!selectedExamSubmission) return;

    // Automatically calculate total coding score from individual fields
    const totalCodingScore = Object.entries(adminGradingAnswers).reduce((sum, [qId, score]) => {
      const ans = selectedExamSubmission.answers?.find(a => a.questionId === qId);
      return (ans && (ans.type === 'coding' || ans.type === 'web')) ? sum + Number(score || 0) : sum;
    }, 0);

    try {
      const res = await fetch(`${API_BASE}/admin/tests/evaluate/${selectedExamSubmission.id || selectedExamSubmission._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codingScore: totalCodingScore,
          feedback: adminGradingFeedback,
          reevaluationStatus: selectedExamSubmission.reevaluation?.applied ? adminReevalStatus : undefined,
          resolutionFeedback: selectedExamSubmission.reevaluation?.applied ? adminReevalResolutionFeedback : undefined,
          answers: selectedExamSubmission.answers?.map(ans => ({
            ...ans,
            score: (ans.type === 'coding' || ans.type === 'web') ? Number(adminGradingAnswers[ans.questionId] || 0) : ans.score
          }))
        })
      });
      const data = await res.json();
      if (data.success) {
        showModalAlert("Evaluation Saved", "Candidate sheet evaluation has been saved successfully! Status marked as evaluated.");
        fetchExamSubmissions(selectedExamSubmission.testId);
        setSelectedExamSubmission(null);
        setAdminGradingCodingScore(0);
        setAdminGradingFeedback('');
      } else {
        showModalAlert("Evaluation Error", data.error || "Failed to save candidate evaluation.");
      }
    } catch (err) {
      console.error(err);
      showModalAlert("Grading Error", "Error connecting to server to save evaluation.");
    }
  };

  const runAdminCodeVerification = async (questionId, sourceCode, testCases) => {
    if (!sourceCode || !testCases || testCases.length === 0) return;
    
    setCodingEvaluationResults(prev => ({
      ...prev,
      [questionId]: { isRunning: true, results: null, compileError: null }
    }));
    
    try {
      const res = await fetch(`${API_BASE}/tests/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCode, testCases })
      });
      const data = await res.json();
      
      if (res.ok) {
        setCodingEvaluationResults(prev => ({
          ...prev,
          [questionId]: {
            isRunning: false,
            results: data.results || [],
            compileError: data.status === 'Compilation Error' ? data.compileError : null,
            success: data.success
          }
        }));
      } else {
        setCodingEvaluationResults(prev => ({
          ...prev,
          [questionId]: {
            isRunning: false,
            results: null,
            compileError: data.error || 'Failed to verify code compilation.',
            success: false
          }
        }));
      }
    } catch (e) {
      console.error(e);
      setCodingEvaluationResults(prev => ({
        ...prev,
        [questionId]: {
          isRunning: false,
          results: null,
          compileError: 'Network error occurred during compilation.',
          success: false
        }
      }));
    }
  };

  useEffect(() => {
    if (!selectedExamSubmission) {
      setCodingEvaluationResults({});
      return;
    }
    
    const testConfig = adminTests.find(t => (t.id || t._id) === selectedExamSubmission.testId);
    if (!testConfig) return;
    
    selectedExamSubmission.answers?.forEach(ans => {
      if (ans.type === 'coding') {
        const questionConfig = testConfig.questions?.find(q => q.id === ans.questionId);
        if (questionConfig && ans.submittedCode) {
          runAdminCodeVerification(ans.questionId, ans.submittedCode, questionConfig.testCases);
        }
      }
    });
  }, [selectedExamSubmission, adminTests]);

  useEffect(() => {
    fetchConfig();
    generateCaptcha();

    // Session restoration
    const stored = localStorage.getItem('bics_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Date.now() < parsed.expiry) {
          setUser(parsed.user);
          setView(parsed.user.role === 'admin' ? 'admin' : 'announcements');
        } else {
          localStorage.removeItem('bics_session');
        }
      } catch (e) {
        localStorage.removeItem('bics_session');
      }
    } else {
      const temp = sessionStorage.getItem('bics_session');
      if (temp) {
        try {
          const parsed = JSON.parse(temp);
          setUser(parsed.user);
          setView(parsed.user.role === 'admin' ? 'admin' : 'announcements');
        } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchVideoLectures();
      fetchCourseMaterials();
      if (user.role === 'admin') {
        fetchCandidates();
        fetchAdminTests();
        fetchAdminSubmissions();
      } else {
        fetchStudentProfile();
        fetchStudentActiveTests();
        fetchStudentSubmissions(studentProfile?.studentId || user?.studentId || user?.username || "STU1001");
      }
    }
  }, [user, view]);

  // Short-polling active student tests status when view === 'tests'
  useEffect(() => {
    if (view !== 'tests' || !user || user.role === 'admin') return;
    
    const interval = setInterval(() => {
      fetchStudentActiveTests();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [view, user]);

  useEffect(() => {
    if (systemConfig) {
      setAdminTimetableNotice(systemConfig.timetableNotice || '');
      if (systemConfig.timetable && systemConfig.timetable.length > 0) {
        setAdminTimetable(systemConfig.timetable);
      }
      if (systemConfig.classTests) {
        setAdminClassTests(systemConfig.classTests);
      }
      if (systemConfig.examType) {
        setAdminExamType(systemConfig.examType);
      }
    }
  }, [systemConfig]);

  // ONLINE TEST - TIMER & PROCTORING LISTENERS EFFECT
  useEffect(() => {
    if (view !== 'onlinetest' || !activeExam) return;

    const timerInterval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          handleSubmitExam(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setProctoringWarnings(prev => {
          const currentTotal = prev.fullscreenExits + prev.tabSwitches + 1;
          if (currentTotal >= 3) {
            clearInterval(timerInterval);
            handleSubmitExam(true);
          } else {
            setProctoringAlertMessage("Malpractice Warning: Fullscreen mode was exited. Fullscreen is mandatory during the exam session.");
            setShowProctoringWarningModal(true);
          }
          return { ...prev, fullscreenExits: prev.fullscreenExits + 1 };
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setProctoringWarnings(prev => {
          const currentTotal = prev.fullscreenExits + prev.tabSwitches + 1;
          if (currentTotal >= 3) {
            clearInterval(timerInterval);
            handleSubmitExam(true);
          } else {
            setProctoringAlertMessage("Malpractice Warning: Tab switch detected. You are strictly forbidden from switching tabs or leaving the examination view.");
            setShowProctoringWarningModal(true);
          }
          return { ...prev, tabSwitches: prev.tabSwitches + 1 };
        });
      }
    };

    const handleWindowBlur = () => {
      if (modalState && modalState.isOpen) return;
      setProctoringWarnings(prev => {
        const currentTotal = prev.fullscreenExits + prev.tabSwitches + 1;
        if (currentTotal >= 3) {
          clearInterval(timerInterval);
          handleSubmitExam(true);
        } else {
          setProctoringAlertMessage("Malpractice Warning: Browser lost focus. Ensure you do not switch active windows.");
          setShowProctoringWarningModal(true);
        }
        return { ...prev, tabSwitches: prev.tabSwitches + 1 };
      });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      clearInterval(timerInterval);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [view, activeExam, examAnswers, proctoringWarnings, modalState]);

  // Sync draft states when selecting a different question
  useEffect(() => {
    if (activeExam && examAnswers && examAnswers[selectedQuestionIndex]) {
      const saved = examAnswers[selectedQuestionIndex];
      setDraftMCQ(saved.selectedOptionIndex !== undefined ? saved.selectedOptionIndex : -1);
      setDraftCode(saved.submittedCode || '');
    }
  }, [selectedQuestionIndex, activeExam, examAnswers]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      const data = await res.json();
      setSystemConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/candidates`);
      const data = await res.json();
      setCandidatesList(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStudentProfile = async () => {
    if (!user || user.role !== 'student') return;
    try {
      const res = await fetch(`${API_BASE}/candidate/profile/${user.id}`);
      const data = await res.json();
      setStudentProfile(data);
      if (data.studentId) {
        fetchStudentSubmissions(data.studentId);
      }
      // Pre-fill student registration form if they have data
      if (data.registrationData && data.registrationSubmitted) {
        setRegForm({
          preferredName: data.registrationData.preferredName || '',
          dob: data.registrationData.dob || '',
          permanentAddress: data.registrationData.permanentAddress || '',
          localAddress: data.registrationData.localAddress || '',
          billingAddress: data.registrationData.billingAddress || '',
          emergencyName: data.registrationData.emergencyContact?.name || '',
          emergencyRelation: data.registrationData.emergencyContact?.relationship || '',
          emergencyAddress: data.registrationData.emergencyContact?.address || '',
          emergencyPhone: data.registrationData.emergencyContact?.phone || '',
          personalPhone: data.registrationData.personalPhone || '',
          personalEmail: data.registrationData.personalEmail || '',
          collegeEmail: data.registrationData.collegeEmail || ''
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (captchaInput.toUpperCase() !== captchaCode) {
      setLoginError("Incorrect CAPTCHA. Please try again.");
      generateCaptcha();
      return;
    }

    setAuthLoading(true);
    setLoadingMessage("Authenticating credentials & securing portal session...");

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginCreds)
      });
      const data = await res.json();
      
      setTimeout(() => {
        setAuthLoading(false);
        if (data.success) {
          setLoginCreds({ username: '', password: '' });
          let userObj = null;
          if (data.role === 'admin') {
            userObj = { id: 'admin', role: 'admin', name: data.name };
          } else {
            userObj = { id: data.id, role: 'student', name: 'Student' };
          }

          setUser(userObj);
          setView(userObj.role === 'admin' ? 'admin' : 'announcements');

          // Store session
          const sessionData = {
            user: userObj,
            expiry: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
          };

          if (rememberMe) {
            localStorage.setItem('bics_session', JSON.stringify(sessionData));
          } else {
            sessionStorage.setItem('bics_session', JSON.stringify(sessionData));
          }
        } else {
          setLoginError(data.error);
          generateCaptcha();
        }
      }, 1000);
    } catch (err) {
      setAuthLoading(false);
      setLoginError("Login connection failed.");
      generateCaptcha();
    }
  };

  const handleLogout = () => {
    setAuthLoading(true);
    setLoadingMessage("Signing out & clearing session cache...");
    
    if (user) {
      fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.name || user.id, role: user.role })
      }).catch(err => console.error(err));
    }
    
    setTimeout(() => {
      setAuthLoading(false);
      setUser(null);
      setStudentProfile(null);
      setView('login');
      setIsMobileSidebarOpen(false);
      localStorage.removeItem('bics_session');
      sessionStorage.removeItem('bics_session');
      setShowLogoutModal(false);
    }, 900);
  };

  // Admin Config triggers
  const handleToggleSetting = async (field, value) => {
    try {
      const body = {};
      body[field] = value;
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddAnnouncement = async (e) => {
    e.preventDefault();
    if (!newAnnouncement.trim()) return;
    const list = [...(systemConfig.announcements || [])];
    list.unshift({
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      text: newAnnouncement
    });
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcements: list })
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
        setNewAnnouncement('');
        setAdminMessage("Announcement added successfully.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegisterCandidateByAdmin = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminMessage('');
    try {
      const res = await fetch(`${API_BASE}/admin/register-candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCandidate)
      });
      const data = await res.json();
      if (data.success) {
        setNewCandidate({ studentId: '', name: '', username: '', password: '', eligible: false });
        setAdminMessage("Candidate registered successfully!");
        fetchCandidates();
      } else {
        setAdminError(data.error);
      }
    } catch (e) {
      setAdminError("Connection to backend failed.");
    }
  };

  const handleToggleEligibility = async (candId, currentStatus) => {
    try {
      const res = await fetch(`${API_BASE}/admin/set-eligibility/${candId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eligible: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchCandidates();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyRegistration = async (candId, status) => {
    try {
      const res = await fetch(`${API_BASE}/admin/verify-registration/${candId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setAdminMessage(`Registration status updated to ${status}`);
        fetchCandidates();
        setSelectedCandidate(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateExamType = async (newType) => {
    setAdminExamType(newType);
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examType: newType })
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
        setAdminMessage(`Active exam type switched to ${newType === 'midsem' ? 'Mid' : 'End'} Semester.`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTimetableNotice = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examType: adminExamType, timetableNotice: adminTimetableNotice })
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
        setAdminMessage("Timetable general notice updated successfully.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveExamTimetable = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examType: adminExamType,
          timetable: adminTimetable
        })
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
        setAdminMessage("Examination schedule and type saved successfully.");
      }
    } catch (e) {
      console.error(e);
      setAdminMessage("Failed to save exam schedule.");
    }
  };

  const handleSaveClassTests = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classTests: adminClassTests
        })
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
        setAdminMessage("Class tests schedule saved successfully.");
      }
    } catch (e) {
      console.error(e);
      setAdminMessage("Failed to save class tests.");
    }
  };

  const handleTimetableCellChange = (index, field, value) => {
    const list = [...adminTimetable];
    list[index][field] = value;
    setAdminTimetable(list);
  };

  const handleAddTimetableRow = () => {
    setAdminTimetable([
      ...adminTimetable,
      { code: "CS-10X", course: "Custom Course Name", date: "", time: "", marks: 50 }
    ]);
  };

  const handleRemoveTimetableRow = (index) => {
    const list = adminTimetable.filter((_, idx) => idx !== index);
    setAdminTimetable(list);
  };

  const handleAddClassTestRow = () => {
    setAdminClassTests([
      ...adminClassTests,
      { id: "ct-" + Date.now(), courseName: "Introduction to Computer Science", date: "", time: "", topic: "Standard Topic Details", marks: 20 }
    ]);
  };

  const handleRemoveClassTestRow = (index) => {
    const list = adminClassTests.filter((_, idx) => idx !== index);
    setAdminClassTests(list);
  };

  const handleClassTestCellChange = (index, field, value) => {
    const list = [...adminClassTests];
    list[index][field] = value;
    setAdminClassTests(list);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdMessage('');

    // Captcha validation
    if (changePasswordCaptchaInput.toUpperCase() !== changePasswordCaptchaCode) {
      setPwdError("Captcha incorrect. Please try again.");
      generateChangePasswordCaptcha();
      return;
    }

    // Email verification validation for student
    if (user.role === 'student' && !changePasswordEmailCode.trim()) {
      setPwdError("Please request and enter your email verification code.");
      return;
    }

    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdError("Passwords do not match.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: user.role,
          id: user.role === 'admin' ? 'admin' : user.id,
          newPassword: pwdForm.newPassword,
          code: user.role === 'student' ? changePasswordEmailCode : undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPwdMessage("Password updated successfully!");
        setPwdForm({ newPassword: '', confirmPassword: '' });
        setChangePasswordEmailCode('');
        setChangePasswordCodeSent(false);
        generateChangePasswordCaptcha();
      } else {
        setPwdError(data.error || "Password update failed.");
        generateChangePasswordCaptcha();
      }
    } catch (e) {
      setPwdError("Connection error to backend.");
      generateChangePasswordCaptcha();
    }
  };

  const handleSendVerificationCode = async () => {
    setSendingVerificationCode(true);
    setVerificationError('');
    setVerificationSuccess('');
    try {
      const res = await fetch(`${API_BASE}/candidate/send-verification-code/${studentProfile.id || studentProfile._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setVerificationCodeSent(true);
        setVerificationSuccess("Verification code sent successfully! Please check your registered email inbox/spam folder.");
      } else {
        setVerificationError(data.error || "Failed to send verification code.");
      }
    } catch (err) {
      console.error(err);
      setVerificationError("Network error. Failed to reach verification server.");
    } finally {
      setSendingVerificationCode(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!verificationEmailCode.trim()) {
      setVerificationError("Please enter the verification code.");
      return;
    }
    setVerifyingCode(true);
    setVerificationError('');
    try {
      const res = await fetch(`${API_BASE}/candidate/verify-code/${studentProfile.id || studentProfile._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: verificationEmailCode, 
          type: systemConfig.examType === 'midsem' ? 'mid' : 'end' 
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVerificationSuccess("Email verified successfully! Unlocking your Hall Ticket...");
        setVerificationEmailCode('');
        setVerificationCodeSent(false);
        fetchStudentProfile();
      } else {
        setVerificationError(data.error || "Verification failed. Invalid or expired code.");
      }
    } catch (err) {
      console.error(err);
      setVerificationError("Network error verifying code.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSendChangePasswordCode = async () => {
    setSendingChangePasswordCode(true);
    setPwdError('');
    setPwdMessage('');
    try {
      const res = await fetch(`${API_BASE}/candidate/send-verification-code/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setChangePasswordCodeSent(true);
        setPwdMessage("Verification code sent to your registered email address.");
      } else {
        setPwdError(data.error || "Failed to send verification code.");
      }
    } catch (err) {
      console.error(err);
      setPwdError("Network error. Failed to reach verification server.");
    } finally {
      setSendingChangePasswordCode(false);
    }
  };

  // Student Actions
  const handleStudentRegistrationSubmit = (e) => {
    e.preventDefault();
    if (!photoFile || !sigFile || !undertakingFile) {
      setRegError("Please select all required files: Profile Photo, Signature image, and Undertaking PDF.");
      return;
    }
    setRegError('');
    setRegSuccess('');
    setShowRegConfirmModal(true);
  };

  const startStudentRegistrationUpload = async () => {
    const formData = new FormData();
    formData.append('preferredName', regForm.preferredName);
    formData.append('dob', regForm.dob);
    formData.append('permanentAddress', regForm.permanentAddress);
    formData.append('localAddress', regForm.localAddress);
    formData.append('billingAddress', regForm.billingAddress);
    formData.append('emergencyName', regForm.emergencyName);
    formData.append('emergencyRelation', regForm.emergencyRelation);
    formData.append('emergencyAddress', regForm.emergencyAddress);
    formData.append('emergencyPhone', regForm.emergencyPhone);
    formData.append('personalPhone', regForm.personalPhone);
    formData.append('personalEmail', regForm.personalEmail);
    formData.append('collegeEmail', regForm.collegeEmail);
    formData.append('courses', JSON.stringify(COURSES_LIST)); // All 4 courses required

    // Append memory-buffers
    formData.append('photo', photoFile);
    formData.append('signature', sigFile);
    formData.append('undertaking', undertakingFile);

    try {
      setRegSuccess("Uploading files and securing registration. Please wait...");
      const res = await fetch(`${API_BASE}/candidate/complete-registration/${user.id}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setRegSuccess("Course Registration completed successfully! Your data is now locked.");
        setRegError('');
        fetchStudentProfile();
      } else {
        setRegSuccess('');
        setRegError(data.error || "Submission failed.");
      }
    } catch (err) {
      setRegSuccess('');
      setRegError("Server connection failed.");
      const queue = JSON.parse(localStorage.getItem('bics_pending_logs') || '[]');
      queue.push({
        actor: user?.name || user?.id || 'candidate',
        action: 'REGISTRATION_CONNECTION_FAILED',
        details: `Candidate encountered connection failure when sending registration: ${err.message || err}`,
        severity: 'error'
      });
      localStorage.setItem('bics_pending_logs', JSON.stringify(queue));
    }
  };

  const handleSignConsent = async () => {
    if (!consentChecked) return;
    try {
      const res = await fetch(`${API_BASE}/candidate/consent/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: systemConfig.examType === 'midsem' ? 'mid' : 'end' })
      });
      const data = await res.json();
      if (data.success) {
        setConsentSuccess("Consent registered. Hall Ticket unlocked.");
        fetchStudentProfile();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFeedbackValueChange = (course, qIndex, val) => {
    setFeedbackAnswers({
      ...feedbackAnswers,
      [course]: {
        ...(feedbackAnswers[course] || {}),
        [qIndex]: val
      }
    });
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setFeedbackSuccess('');

    // Validation check
    let valid = true;
    let missingInfo = '';

    for (let i = 0; i < COURSES_LIST.length; i++) {
      const course = COURSES_LIST[i];
      const q1 = feedbackAnswers[course]?.[0];
      const q2 = feedbackAnswers[course]?.[1];
      const q3 = feedbackAnswers[course]?.[2];
      const q4 = feedbackAnswers[course]?.[3];
      const q5 = feedbackAnswers[course]?.[4];

      if (!q1 || !q2 || !q3 || !q4 || !q5 || q5.trim() === '') {
        valid = false;
        missingInfo = `Please answer all rating questions and provide general comments for "${course}".`;
        break;
      }
    }

    if (!valid) {
      alert(missingInfo);
      return;
    }

    // Format answers map
    const formatted = {};
    COURSES_LIST.forEach(course => {
      formatted[course] = [
        feedbackAnswers[course][0],
        feedbackAnswers[course][1],
        feedbackAnswers[course][2],
        feedbackAnswers[course][3],
        feedbackAnswers[course][4].trim()
      ];
    });

    try {
      const res = await fetch(`${API_BASE}/candidate/feedback/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, feedback: formatted })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackSuccess(`${feedbackType === 'mid' ? 'Mid Sem' : 'End Sem'} Feedback submitted successfully.`);
        fetchStudentProfile();
      } else {
        alert(data.error || "Failed to submit feedback.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to submit feedback due to network connection issues.");
    }
  };

  const handleExitSubmit = async (e) => {
    e.preventDefault();
    setExitSuccess('');
    try {
      const res = await fetch(`${API_BASE}/candidate/exit-form/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: exitAnswers })
      });
      const data = await res.json();
      if (data.success) {
        setExitSuccess("Exit Form submitted successfully. Thank you for completing the course.");
        fetchStudentProfile();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isViewAllowed = () => {
    if (view === 'login') return true;
    if (!user) return false;
    if (view === 'changepassword') return true;
    if ((view === 'onlinetest' || view === 'onlinetest_setup') && !allowedTestAccess) return false;
    
    if (user.role === 'admin') {
      return ['admin', 'admin_candidates', 'admin_coursework', 'admin_tests', 'admin_logs', 'admin_proctoring', 'admin_tickets', 'admin_submissions'].includes(view);
    }
    
    if (user.role === 'student') {
      return ['announcements', 'register', 'info', 'conduct', 'schedule', 'hallticket', 'verification', 'contact', 'midsem', 'endsem', 'exit', 'onlinetest', 'onlinetest_setup', 'lectures', 'materials', 'tests', 'submissions'].includes(view);
    }
    
    return false;
  };

  const ErrorPageView = () => (
    <div className="cf-card" style={{ maxWidth: '600px', margin: '40px auto', padding: '30px', border: '1px solid #ffccd5', backgroundColor: '#fff5f5' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: '#b91c1c', marginBottom: '20px' }}>
        <ShieldAlert size={36} />
        <div>
          <h2 style={{ fontSize: '14pt', color: '#b91c1c', margin: 0 }}>CRITICAL EXCEPTION: ACCESS_DENIED (403/404)</h2>
          <span style={{ fontFamily: 'Fira Code, monospace', fontSize: '8.5pt' }}>Location: src/App.jsx • Thread: Main Render</span>
        </div>
      </div>
      <div style={{ fontFamily: 'Fira Code, monospace', fontSize: '9pt', backgroundColor: '#1e1e1e', color: '#85d585', padding: '15px', borderRadius: '4px', overflowX: 'auto', marginBottom: '20px' }}>
        <p style={{ color: '#ff6b6b', fontWeight: 'bold' }}>[status] compile failed: UNRESOLVED_DEPENDENCY</p>
        <p style={{ color: '#888' }}>------------------------------------------------</p>
        <p>&gt; Checking auth session state... [NULL]</p>
        <p>&gt; Validating permission tokens... [FAILED]</p>
        <p style={{ color: '#ffd700' }}>[warning] Unauthorized attempt to access view: "{view}"</p>
        <p>&gt; Terminating render sequence to prevent memory leaks...</p>
        <p style={{ color: '#ff6b6b' }}>[error] Access to specified namespace is forbidden.</p>
      </div>
      <p style={{ fontSize: '9.5pt', color: '#555', marginBottom: '20px' }}>
        You do not have the required student or administrator credentials to access this section of the BICS Portal, or your session has expired.
      </p>
      <button className="cf-btn-primary" onClick={handleLogout}>
        Return to Sign In Page
      </button>
    </div>
  );

  return (
    <div>
      {/* HEADER */}
      {!(view === 'onlinetest' || view === 'onlinetest_setup' || view === 'login') && (
        <header className="app-header">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {user && (
              <button className="sidebar-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
                {isMobileSidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            )}
            <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '42px', width: '42px', objectFit: 'contain' }} />
            <span className="pixel-logo">BICS Portal</span>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {user && (
              <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#3b5998', fontFamily: 'verdana, arial, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <User size={14} style={{ color: '#3b5998' }} />
                <span>{user.role === 'admin' ? 'Administrator' : (studentProfile?.name || 'Student')}</span>
              </span>
            )}
            <img src="/logo.png" alt="Preliminary Examinations Logo" className="pe-logo" />
          </div>
        </header>
      )}

      {/* DASHBOARD CONTAINER */}
      <div className="app-container">
        {/* SIDEBAR */}
        {user && !(view === 'onlinetest' || view === 'onlinetest_setup' || view === 'login') && (
          <aside className={`app-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
            <nav className="sidebar-menu">
              {user.role === 'admin' ? (
                <>
                  <button className={`sidebar-item ${view === 'admin' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin'); setIsMobileSidebarOpen(false); }}>
                    <Settings size={16} /> Portal Settings
                  </button>
                  <button className={`sidebar-item ${view === 'admin_candidates' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_candidates'); setIsMobileSidebarOpen(false); }}>
                    <Users size={16} /> Candidates
                  </button>
                  <button className={`sidebar-item ${view === 'admin_coursework' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_coursework'); setIsMobileSidebarOpen(false); }}>
                    <BookOpen size={16} /> Coursework
                  </button>
                  <button className={`sidebar-item ${view === 'admin_tests' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_tests'); setIsMobileSidebarOpen(false); }}>
                    <ClipboardList size={16} /> Tests Manager
                  </button>
                  <button className={`sidebar-item ${view === 'admin_logs' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_logs'); setIsMobileSidebarOpen(false); fetchSystemLogs(); }}>
                    <Activity size={16} /> System Logs
                  </button>
                  <button className={`sidebar-item ${view === 'admin_proctoring' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_proctoring'); setIsMobileSidebarOpen(false); fetchLiveSubmissions(); }}>
                    <Video size={16} /> Live Proctoring
                  </button>
                  <button className={`sidebar-item ${view === 'admin_tickets' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_tickets'); setIsMobileSidebarOpen(false); fetchAdminTickets(); }}>
                    <Ticket size={16} /> Tickets
                  </button>
                  <button className={`sidebar-item ${view === 'admin_submissions' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_submissions'); setIsMobileSidebarOpen(false); fetchAdminSubmissions(); }}>
                    <Layers size={16} /> Submissions Tracker
                  </button>
                </>
              ) : (
                <>
                  {/* Candidate Side Navigation Menu items */}
                  <button className={`sidebar-item ${view === 'announcements' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('announcements'); setIsMobileSidebarOpen(false); }}>
                    <Bell size={16} /> Announcements
                  </button>
 
                  <div className="sidebar-category">Student Related</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, student: !dropdowns.student})}>
                    Menu Links {dropdowns.student ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.student && (
                    <div className="dropdown-container">
                      <button className={`dropdown-item ${view === 'register' ? 'active' : ''}`} onClick={() => { setView('register'); setIsMobileSidebarOpen(false); }}>
                        <Upload size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Course Registration
                      </button>
                      <button className={`dropdown-item ${view === 'info' ? 'active' : ''}`} onClick={() => { setView('info'); setIsMobileSidebarOpen(false); }}>
                        <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Student Information
                      </button>
                      <button className={`dropdown-item ${view === 'conduct' ? 'active' : ''}`} onClick={() => { setView('conduct'); setIsMobileSidebarOpen(false); }}>
                        <ShieldAlert size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Code of Conduct
                      </button>
                    </div>
                  )}
 
                  <div className="sidebar-category">CourseWork</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, coursework: !dropdowns.coursework})}>
                    Menu Links {dropdowns.coursework ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.coursework && (
                    <div className="dropdown-container">
                      <button className={`dropdown-item ${view === 'lectures' ? 'active' : ''}`} onClick={() => { setView('lectures'); setIsMobileSidebarOpen(false); }}>
                        <Video size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Lectures
                      </button>
                      <button className={`dropdown-item ${view === 'materials' ? 'active' : ''}`} onClick={() => { setView('materials'); setIsMobileSidebarOpen(false); }}>
                        <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Materials
                      </button>
                      <button className={`dropdown-item ${view === 'tests' ? 'active' : ''}`} onClick={() => { setView('tests'); setIsMobileSidebarOpen(false); }}>
                        <ClipboardList size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Online Tests
                      </button>
                    </div>
                  )}
 
                  <div className="sidebar-category">Submissions</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, submissions: !dropdowns.submissions})}>
                    Menu Links {dropdowns.submissions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                   {dropdowns.submissions && (
                    <div className="dropdown-container">
                      <button className={`dropdown-item ${view === 'submissions' ? 'active' : ''}`} onClick={() => { setView('submissions'); setIsMobileSidebarOpen(false); fetchStudentSubmissions(studentProfile?.studentId || user?.studentId || user?.username || "STU1001"); }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }}>
                          <rect x="2" y="3" width="20" height="18" rx="2" />
                          <rect x="4" y="5" width="16" height="14" rx="1" />
                          <circle cx="12" cy="10" r="2" />
                          <path d="M9.5 16.5a2.5 2.5 0 0 1 5 0" />
                          <circle cx="8" cy="11.5" r="1.5" />
                          <path d="M6 16.5a2 2 0 0 1 3-1.5" />
                          <circle cx="16" cy="11.5" r="1.5" />
                          <path d="M15 15a2 2 0 0 1 3 1.5" />
                          <rect x="14.5" y="16.5" width="3" height="1" rx="0.5" />
                        </svg> Classroom
                      </button>
                      <button className={`dropdown-item ${view === 'verification' ? 'active' : ''}`} onClick={() => { setView('verification'); setIsMobileSidebarOpen(false); if (user) fetchSubmittedTestsList(user.id || user._id); }}>
                        <CheckCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Verification
                      </button>
                    </div>
                  )}
 
                  <div className="sidebar-category">Examination</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, exam: !dropdowns.exam})}>
                    Menu Links {dropdowns.exam ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.exam && (
                    <div className="dropdown-container">
                      <button className={`dropdown-item ${view === 'schedule' ? 'active' : ''}`} onClick={() => { setView('schedule'); setIsMobileSidebarOpen(false); }}>
                        <Calendar size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Schedule
                      </button>
                      <button className={`dropdown-item ${view === 'hallticket' ? 'active' : ''}`} onClick={() => { setView('hallticket'); setIsMobileSidebarOpen(false); setConsentSuccess(''); }}>
                        <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Hall ticket
                      </button>
                    </div>
                  )}
 
                  <div className="sidebar-category">Feedback</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, feedback: !dropdowns.feedback})}>
                    Menu Links {dropdowns.feedback ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.feedback && (
                    <div className="dropdown-container">
                      <button className={`dropdown-item ${view === 'contact' ? 'active' : ''}`} onClick={() => { setView('contact'); setContactSuccess(''); setContactError(''); setContactSubView('form'); setIsMobileSidebarOpen(false); if (user) fetchStudentTickets(user.id || user._id); }}>
                        <Mail size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                        <span>Support Helpdesk</span>
                      </button>
                      <button className={`dropdown-item ${view === 'midsem' ? 'active' : ''}`} onClick={() => { setView('midsem'); setFeedbackType('mid'); setFeedbackSuccess(''); setIsMobileSidebarOpen(false); }}>
                        <MessageSquare size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                        <span>Mid Sem Feedback {systemConfig && !systemConfig.midSemFeedbackActive && <sub style={{ fontSize: '7.5pt', color: '#e11d48', verticalAlign: 'sub', marginLeft: '4px' }}>(Closed)</sub>}</span>
                      </button>
                      <button className={`dropdown-item ${view === 'endsem' ? 'active' : ''}`} onClick={() => { setView('endsem'); setFeedbackType('end'); setFeedbackSuccess(''); setIsMobileSidebarOpen(false); }}>
                        <MessageSquare size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                        <span>End Sem Feedback {systemConfig && !systemConfig.endSemFeedbackActive && <sub style={{ fontSize: '7.5pt', color: '#e11d48', verticalAlign: 'sub', marginLeft: '4px' }}>(Closed)</sub>}</span>
                      </button>
                    </div>
                  )}
 
                  <div className="sidebar-category">Exit Program</div>
                  <button className={`sidebar-item ${view === 'exit' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('exit'); setExitSuccess(''); setIsMobileSidebarOpen(false); }}>
                    <GraduationCap size={16} /> Exit Form
                  </button>
                </>
              )}
 
              <button className={`sidebar-item ${view === 'changepassword' ? 'active' : ''}`} style={{ marginTop: '20px', borderTop: '1px solid #cbd5e1', justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('changepassword'); setIsMobileSidebarOpen(false); setPwdError(''); setPwdMessage(''); setChangePasswordCodeSent(false); setChangePasswordEmailCode(''); generateChangePasswordCaptcha(); }}>
                <Key size={16} /> Change Password
              </button>
 
              <button className="sidebar-item" style={{ color: '#e11d48', justifyContent: 'flex-start', gap: '8px' }} onClick={() => setShowLogoutModal(true)}>
                <LogOut size={16} /> Sign Out
              </button>

            </nav>
          </aside>
        )}

        {/* CONTENT PANEL */}
        <main className="app-content" style={view === 'onlinetest' ? { padding: 0, margin: 0, minHeight: '100vh', width: '100%', maxWidth: '100%', border: 'none', backgroundColor: '#f8fafc' } : {}}>
          
          {/* ACCESS CONTROL SECURITY GUARD */}
          {!isViewAllowed() ? (
            <ErrorPageView />
          ) : (
            <>
              {/* LOGIN LANDING PAGE */}
              {view === 'login' && (
                <div style={{ maxWidth: '400px', margin: '40px auto', width: '100%' }}>
                  
                  {/* PE Logo & Subtitle */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '25px' }}>
                    <img src="/logo.png" alt="Preliminary Examinations 2026 Logo" style={{ height: '80px', objectFit: 'contain', marginBottom: '10px' }} />
                    <h2 style={{ fontSize: '13pt', fontWeight: 'bold', color: '#3b5998' }}>BICS Login</h2>
                  </div>

                  <div className="cf-card">
                    <div className="cf-card-title" style={{ textAlign: 'center' }}>Portal Sign In</div>
                    {loginError && <div className="cf-alert cf-alert-error">{loginError}</div>}
                    
                    <form onSubmit={handleLoginSubmit}>
                      <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                        <label className="cf-label">User Account Name</label>
                        <input type="text" className="cf-input" required value={loginCreds.username} onChange={e => setLoginCreds({...loginCreds, username: e.target.value})} />
                      </div>
                      <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                        <label className="cf-label">Secure Password</label>
                        <input type="password" className="cf-input" required value={loginCreds.password} onChange={e => setLoginCreds({...loginCreds, password: e.target.value})} />
                      </div>

                      {/* Captcha verification section */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                        <div style={{
                          letterSpacing: '5px',
                          fontWeight: 'bold',
                          fontSize: '14pt',
                          color: '#3b5998',
                          backgroundColor: '#e8eff7',
                          padding: '6px 12px',
                          border: '1px solid #b9c9fe',
                          fontFamily: 'Courier New, monospace',
                          textDecoration: 'line-through',
                          userSelect: 'none'
                        }}>
                          {captchaCode}
                        </div>
                        <button type="button" className="cf-btn-secondary" onClick={generateCaptcha} style={{ padding: '3px 8px', fontSize: '8.5pt' }}>
                          Refresh
                        </button>
                      </div>
                      <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                        <label className="cf-label">Enter Captcha Code</label>
                        <input type="text" className="cf-input" required value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} placeholder="Case-insensitive" />
                      </div>

                      {/* Remember Me Checkbox */}
                      <div style={{ marginBottom: '20px' }}>
                        <label className="checkbox-label" style={{ display: 'flex', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '9pt' }}>
                          <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                          Remember me for 7 days
                        </label>
                      </div>

                      <button type="submit" className="cf-btn-primary" style={{ width: '100%', padding: '6px' }}>Login</button>
                    </form>
                  </div>
                </div>
              )}

          {/* ANNOUNCEMENTS PAGE */}
          {view === 'announcements' && systemConfig && (
            <div>
              <div className="cf-card">
                <div className="cf-card-title">Portal Announcements</div>
                {systemConfig.announcements && systemConfig.announcements.length === 0 ? (
                  <p style={{ fontStyle: 'italic', color: '#666' }}>No active announcements.</p>
                ) : (
                  systemConfig.announcements.map((a, idx) => (
                    <div key={idx} style={{ borderBottom: idx !== systemConfig.announcements.length - 1 ? '1px solid #cbd5e1' : 'none', paddingBottom: '12px', marginBottom: '12px' }}>
                      <span className="status-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 6px', fontSize: '7.5pt' }}>{a.date}</span>
                      <p style={{ marginTop: '8px', fontSize: '10pt', color: '#333' }}>{a.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* STUDENT COURSE REGISTRATION */}
          {view === 'register' && studentProfile && systemConfig && (
            <div>
              {studentProfile.registrationSubmitted ? (
                <div className="cf-card">
                  <div className="cf-card-title">Registration Status</div>
                  {studentProfile.registrationStatus === 'Approved' ? (
                    <div className="cf-alert cf-alert-success">
                      Your course registration has been verified and APPROVED by the administrator. Your profile is active.
                    </div>
                  ) : (
                    <div className="cf-alert cf-alert-info">
                      Your course registration has been submitted and locked successfully. It is currently PENDING verification by the administrator.
                    </div>
                  )}
                </div>
              ) : !systemConfig.courseRegistrationActive ? (
                <div className="cf-card">
                  <div className="cf-card-title">Registration Status</div>
                  <div className="cf-alert cf-alert-info">
                    Course Registration is currently closed by the administrator.
                  </div>
                </div>
              ) : (
                <div className="cf-card">
                  <div className="cf-card-title">Course Registration Form</div>
                  {studentProfile.registrationStatus === 'Rejected' && (
                    <div className="cf-alert cf-alert-error" style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} style={{ color: '#dc2626' }} />
                        <strong>Registration Rejected:</strong>
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        Your previous registration attempt was rejected by the administrator. Please review your entries and files and re-submit.
                      </div>
                    </div>
                  )}
                  {regError && <div className="cf-alert cf-alert-error">{regError}</div>}
                  {regSuccess && <div className="cf-alert cf-alert-success">{regSuccess}</div>}

                  <form onSubmit={handleStudentRegistrationSubmit}>
                    
                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={14} />
                      <span>1. Core Personal Information</span>
                    </div>
                    <div className="cf-form-grid">
                      <div className="cf-input-group">
                        <label className="cf-label">Full Legal Name</label>
                        <input type="text" className="cf-input" required value={regForm.preferredName} onChange={e => setRegForm({...regForm, preferredName: e.target.value})} placeholder="As it appears on Government ID" />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Preferred Name</label>
                        <input type="text" className="cf-input" required value={regForm.preferredName} onChange={e => setRegForm({...regForm, preferredName: e.target.value})} placeholder="For email roster list" />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Date of Birth (DOB)</label>
                        <input type="date" className="cf-input" required value={regForm.dob} onChange={e => setRegForm({...regForm, dob: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Student ID (Assigned by Admin)</label>
                        <input type="text" className="cf-input" disabled value={studentProfile.studentId} />
                      </div>
                    </div>

                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Home size={14} /> 2. Address &amp; Contact Information</div>
                    <div className="cf-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                      <div className="cf-input-group">
                        <label className="cf-label">Permanent Address</label>
                        <input type="text" className="cf-input" required value={regForm.permanentAddress} onChange={e => setRegForm({...regForm, permanentAddress: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Local/Current Address</label>
                        <input type="text" className="cf-input" required value={regForm.localAddress} onChange={e => setRegForm({...regForm, localAddress: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Billing Address</label>
                        <input type="text" className="cf-input" required value={regForm.billingAddress} onChange={e => setRegForm({...regForm, billingAddress: e.target.value})} />
                      </div>
                    </div>

                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} /> Emergency Contact Information</div>
                    <div className="cf-form-grid">
                      <div className="cf-input-group">
                        <label className="cf-label">Emergency Name</label>
                        <input type="text" className="cf-input" required value={regForm.emergencyName} onChange={e => setRegForm({...regForm, emergencyName: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Relationship</label>
                        <input type="text" className="cf-input" required value={regForm.emergencyRelation} onChange={e => setRegForm({...regForm, emergencyRelation: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Emergency Address</label>
                        <input type="text" className="cf-input" required value={regForm.emergencyAddress} onChange={e => setRegForm({...regForm, emergencyAddress: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Emergency Phone</label>
                        <input type="tel" className="cf-input" required value={regForm.emergencyPhone} onChange={e => setRegForm({...regForm, emergencyPhone: e.target.value})} />
                      </div>
                    </div>

                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> Contact Methods</div>
                    <div className="cf-form-grid">
                      <div className="cf-input-group">
                        <label className="cf-label">Personal Phone Number</label>
                        <input type="tel" className="cf-input" required value={regForm.personalPhone} onChange={e => setRegForm({...regForm, personalPhone: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Permanent Personal Email</label>
                        <input type="email" className="cf-input" required value={regForm.personalEmail} onChange={e => setRegForm({...regForm, personalEmail: e.target.value})} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Official College Email</label>
                        <input type="email" className="cf-input" required value={regForm.collegeEmail} onChange={e => setRegForm({...regForm, collegeEmail: e.target.value})} />
                      </div>
                    </div>

                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={14} /> 3. List of Courses (All Required for BICS)</div>
                    <div style={{ padding: '5px 12px' }}>
                      {COURSES_LIST.map((course, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <input type="checkbox" checked={true} disabled={true} />
                          <span style={{ fontSize: '9.5pt', color: '#555' }}>{course}</span>
                        </div>
                      ))}
                    </div>

                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={14} /> 4. Upload Documents</div>
                    <div className="cf-form-grid">
                      <div className="cf-input-group">
                        <label className="cf-label">Profile Photo (JPEG/PNG)</label>
                        <input type="file" required onChange={handlePhotoChange} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Signature Image (JPEG/PNG)</label>
                        <input type="file" required onChange={handleSigChange} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Signed Undertaking PDF</label>
                        <input type="file" required onChange={handleUndertakingChange} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
                      <button type="submit" className="cf-btn-primary" style={{ width: 'auto', padding: '6px 20px' }}>
                        Submit
                      </button>
                    </div>

                  </form>
                </div>
              )}
            </div>
          )}

          {/* STUDENT PROFILE INFORMATION VIEW */}
          {view === 'info' && studentProfile && (
            <div className="cf-card">
              <div className="cf-card-title">Student Information Board</div>
              {!studentProfile.registrationSubmitted ? (
                <div className="cf-alert cf-alert-info">
                  Please complete the Course Registration form to display your profile record.
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '25px' }}>
                    <div className="profile-preview-box" style={{ width: '120px', height: '120px' }}>
                      <img src={studentProfile.registrationData.photoUrl} alt="Student Profile Pic" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15pt', color: '#002147' }}>{studentProfile.name}</h3>
                      <p style={{ color: '#666', fontSize: '9.5pt' }}>ID: <strong>{studentProfile.studentId}</strong></p>
                      <p style={{ marginTop: '8px' }}>
                        Eligibility Status: {studentProfile.eligible ? (
                          <span className="status-badge status-eligible">Eligible</span>
                        ) : (
                          <span className="status-badge status-ineligible">Ineligible</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} />
                    <span>Core Personal Information</span>
                  </div>
                  <div className="profile-info-grid">
                    <span className="profile-info-label">Full Legal Name:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.preferredName}</span>
                    <span className="profile-info-label">Preferred Name:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.preferredName}</span>
                    <span className="profile-info-label">Date of Birth:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.dob}</span>
                  </div>

                  <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Home size={14} /> Address &amp; Contact Information</div>
                  <div className="profile-info-grid">
                    <span className="profile-info-label">Permanent:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.permanentAddress}</span>
                    <span className="profile-info-label">Local Address:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.localAddress}</span>
                    <span className="profile-info-label">Billing:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.billingAddress}</span>
                    <span className="profile-info-label">Emergency Call:</span>
                    <span className="profile-info-value">
                      {studentProfile.registrationData.emergencyContact?.name} ({studentProfile.registrationData.emergencyContact?.relationship}) - {studentProfile.registrationData.emergencyContact?.phone}
                    </span>
                    <span className="profile-info-label">Contact Address:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.emergencyContact?.address}</span>
                  </div>

                  <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> Contact Methods</div>
                  <div className="profile-info-grid">
                    <span className="profile-info-label">Personal Phone:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.personalPhone}</span>
                    <span className="profile-info-label">Personal Email:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.personalEmail}</span>
                    <span className="profile-info-label">College Email:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.collegeEmail}</span>
                  </div>

                  <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={14} /> Uploaded Signatures &amp; Documents</div>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '10px' }}>
                    <div>
                      <span className="cf-label" style={{ display: 'block', marginBottom: '5px' }}>Signature Preview</span>
                      <div className="profile-preview-box" style={{ width: '180px', height: '60px' }}>
                        <img src={studentProfile.registrationData.signatureUrl} alt="Signature Upload" style={{ objectFit: 'contain' }} />
                      </div>
                    </div>
                    <div>
                      <span className="cf-label" style={{ display: 'block', marginBottom: '5px' }}>Signed Undertaking</span>
                      <a href={studentProfile.registrationData.undertakingUrl} target="_blank" rel="noreferrer" className="cf-btn-secondary" style={{ display: 'inline-block', lineHeight: '2.0', textAlign: 'center' }}>
                        <FileText size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> View Uploaded Document
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CLASS TESTS SCHEDULE */}
          {view === 'schedule' && systemConfig && (
            <div className="cf-card">
              <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: '#3b5998' }} />
                <span>Class Tests Schedule</span>
              </div>

              {/* Upcoming Weekend Class Tests Card */}
              {(() => {
                const classTestsList = systemConfig.classTests || [];
                // Get Saturday-Sunday tests for current week
                const today = new Date();
                const currentDay = today.getDay();
                const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
                const monday = new Date(today);
                monday.setDate(today.getDate() + diffToMonday);
                monday.setHours(0, 0, 0, 0);
                
                const saturday = new Date(monday);
                saturday.setDate(monday.getDate() + 5);
                saturday.setHours(0, 0, 0, 0);

                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);

                const weekendTests = classTestsList.filter(t => {
                  if (!t.date) return false;
                  const tDate = new Date(t.date);
                  return tDate >= saturday && tDate <= sunday;
                });

                return (
                  <div style={{ marginBottom: '25px' }}>
                    <h3 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
                      This Weekend's Upcoming Class Tests
                    </h3>
                    {weekendTests.length === 0 ? (
                      <div className="cf-alert cf-alert-info" style={{ margin: 0 }}>
                        No class tests scheduled for this upcoming weekend (Saturday-Sunday).
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                        {weekendTests.map(test => (
                          <div key={test.id} style={{ border: '1px solid #b9c9fe', borderRadius: '4px', padding: '15px', backgroundColor: '#f0f4ff', position: 'relative' }}>
                            <span style={{ position: 'absolute', top: '15px', right: '15px', backgroundColor: '#3b5998', color: '#fff', fontSize: '7.5pt', fontWeight: 'bold', padding: '3px 8px', borderRadius: '3px' }}>
                              {test.marks} Marks
                            </span>
                            <h4 style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold', width: '80%', marginBottom: '8px' }}>
                              {test.courseName}
                            </h4>
                            <div style={{ fontSize: '9pt', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span><strong>Topic:</strong> {test.topic}</span>
                              <span><strong>Date:</strong> {test.date} (Weekend)</span>
                              <span><strong>Time:</strong> {test.time}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* All Class Tests History / List */}
              <div>
                <h3 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
                  Comprehensive Class Test Roster
                </h3>
                {(!systemConfig.classTests || systemConfig.classTests.length === 0) ? (
                  <div className="cf-alert cf-alert-info">No class tests scheduled.</div>
                ) : (
                  <div className="cf-table-container">
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Course Name</th>
                          <th>Topic / Module Details</th>
                          <th>Scheduled Date</th>
                          <th>Time Slot</th>
                          <th>Total Marks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemConfig.classTests.map(test => (
                          <tr key={test.id}>
                            <td style={{ fontWeight: 'bold', fontSize: '9pt', color: '#002147' }}>{test.courseName}</td>
                            <td>{test.topic}</td>
                            <td>{test.date}</td>
                            <td>{test.time}</td>
                            <td style={{ fontWeight: 'bold', color: '#3b5998' }}>{test.marks} Marks</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COURSEWORK - LECTURES */}
          {view === 'lectures' && (
            <div className="cf-card">
              <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Video size={18} style={{ color: '#3b5998' }} />
                <span>Course Video Lectures</span>
              </div>
              {videoLectures.length === 0 ? (
                <div className="cf-alert cf-alert-info">No video lectures uploaded yet.</div>
              ) : (
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
                  
                  {/* Lecture Player Viewport */}
                  <div style={{ flex: '2 1 600px', minWidth: '300px' }}>
                    {selectedLecture ? (
                      <div>
                        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#000' }}>
                          <iframe
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                            src={getYouTubeEmbedUrl(selectedLecture.youtubeUrl)}
                            title={selectedLecture.title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          ></iframe>
                        </div>
                        <h3 style={{ marginTop: '15px', color: '#002147', fontSize: '14pt', fontWeight: 'bold' }}>
                          {selectedLecture.title}
                        </h3>
                        <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', display: 'inline-block', marginTop: '5px' }}>
                          {selectedLecture.section}
                        </span>

                        {/* Interactive Practice Playground (Light Mode) */}
                        <div style={{
                          marginTop: '30px',
                          padding: '24px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Code size={18} style={{ color: '#3b5998' }} />
                              <h4 style={{ margin: 0, color: '#002147', fontSize: '12pt', fontWeight: 'bold' }}>
                                BICS Interactive Practice Playground
                              </h4>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => setPlaygroundMode('cpp')}
                                className="cf-btn-secondary"
                                style={{
                                  padding: '4px 12px',
                                  fontSize: '8.5pt',
                                  backgroundColor: playgroundMode === 'cpp' ? '#3b5998' : '#fff',
                                  color: playgroundMode === 'cpp' ? '#fff' : '#475569',
                                  border: '1px solid #cbd5e1'
                                }}
                              >
                                C++ Compiler
                              </button>
                              <button
                                onClick={() => setPlaygroundMode('web')}
                                className="cf-btn-secondary"
                                style={{
                                  padding: '4px 12px',
                                  fontSize: '8.5pt',
                                  backgroundColor: playgroundMode === 'web' ? '#3b5998' : '#fff',
                                  color: playgroundMode === 'web' ? '#fff' : '#475569',
                                  border: '1px solid #cbd5e1'
                                }}
                              >
                                Web Canvas (HTML/CSS/JS)
                              </button>
                            </div>
                          </div>

                          {playgroundMode === 'cpp' ? (
                            <div>
                              {/* C++ Practice mode */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {/* Editor Header */}
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  backgroundColor: '#e2e8f0',
                                  padding: '6px 12px',
                                  borderTopLeftRadius: '6px',
                                  borderTopRightRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  borderBottom: 'none'
                                }}>
                                  <span style={{ fontSize: '8pt', fontFamily: 'monospace', color: '#334155', fontWeight: 'bold' }}>
                                    main.cpp (BICS C++ Editor)
                                  </span>
                                </div>
                                {/* Monaco Editor Wrapper */}
                                <div style={{ border: '1px solid #cbd5e1', borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', overflow: 'hidden' }}>
                                  <Editor
                                    height="400px"
                                    language="cpp"
                                    theme="vs"
                                    value={playgroundCppCode}
                                    onChange={(val) => setPlaygroundCppCode(val || '')}
                                    options={{
                                      minimap: { enabled: false },
                                      fontSize: 13,
                                      lineHeight: 20,
                                      scrollBeyondLastLine: false,
                                      automaticLayout: true,
                                      fontFamily: 'Consolas, Monaco, monospace'
                                    }}
                                  />
                                </div>

                                {/* Controls & Unified Terminal Panel */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                  
                                  {/* Terminal Header & Actions */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <label style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', margin: 0 }}>
                                      BICS Interactive Console Terminal
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <button
                                        onClick={() => {
                                          setTerminalLines([]);
                                          setBufferedStdin([]);
                                          setTerminalInput('');
                                        }}
                                        style={{
                                          padding: '8px 16px',
                                          fontSize: '9pt',
                                          fontWeight: 'bold',
                                          backgroundColor: '#fff',
                                          color: '#475569',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '4px',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Clear
                                      </button>
                                      <button
                                        onClick={handleRunPlaygroundCpp}
                                        disabled={isPlayinggroundRunning}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '8px 20px',
                                          fontSize: '9.5pt',
                                          fontWeight: 'bold',
                                          backgroundColor: '#3b5998',
                                          color: '#ffffff',
                                          border: 'none',
                                          borderRadius: '4px',
                                          cursor: isPlayinggroundRunning ? 'not-allowed' : 'pointer',
                                          boxShadow: '0 2px 4px rgba(59, 89, 152, 0.15)',
                                          transition: 'background-color 0.2s'
                                        }}
                                      >
                                        {isPlayinggroundRunning && (
                                          <Loader2 size={14} className="spinner" style={{ marginRight: '8px' }} />
                                        )}
                                        {isPlayinggroundRunning ? 'Running...' : 'Run C++ Code'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Console Box (Light Color Scheme) */}
                                  <div style={{
                                    backgroundColor: '#f8fafc',
                                    color: '#0f172a',
                                    fontFamily: 'Consolas, Monaco, Courier, monospace',
                                    fontSize: '9.5pt',
                                    padding: '16px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                  }}>
                                    
                                    {/* Terminal Lines Container */}
                                    <div style={{
                                      maxHeight: '240px',
                                      overflowY: 'auto',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '4px'
                                    }}>
                                      {terminalLines.map((line, idx) => {
                                        let lineStyle = { margin: 0, whiteSpace: 'pre-wrap' };
                                        if (line.startsWith('$')) {
                                          lineStyle.color = '#16a34a'; // Green for shell commands and inputs
                                          lineStyle.fontWeight = 'bold';
                                        } else if (line.startsWith('Compilation Error') || line.startsWith('Runtime Error') || line.startsWith('Error:')) {
                                          lineStyle.color = '#dc2626'; // Red for errors
                                        }
                                        return (
                                          <p key={idx} style={lineStyle}>{line}</p>
                                        );
                                      })}
                                      <div ref={terminalEndRef} />
                                    </div>

                                    {/* Input Prompt Row - Active when waiting for input */}
                                    {isTerminalWaiting && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderTop: '1px solid #e2e8f0',
                                        paddingTop: '8px',
                                        marginTop: '4px'
                                      }}>
                                        <span style={{ color: '#16a34a', fontWeight: 'bold', marginRight: '8px', userSelect: 'none' }}>$</span>
                                        <input
                                          type="text"
                                          value={terminalInput}
                                          onChange={(e) => setTerminalInput(e.target.value)}
                                          onKeyDown={handleTerminalSubmit}
                                          disabled={isPlayinggroundRunning && !isTerminalWaiting}
                                          placeholder="Type standard input and press Enter..."
                                          autoFocus
                                          style={{
                                            flex: 1,
                                            background: 'transparent',
                                            color: '#0f172a',
                                            border: 'none',
                                            outline: 'none',
                                            fontFamily: 'Consolas, Monaco, Courier, monospace',
                                            fontSize: '9.5pt',
                                            caretColor: '#0f172a'
                                          }}
                                        />
                                      </div>
                                    )}

                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {/* File tabs */}
                                <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1' }}>
                                  {['html', 'css', 'js'].map((t) => (
                                    <button
                                      key={t}
                                      onClick={() => setPlaygroundWebTab(t)}
                                      style={{
                                        padding: '6px 16px',
                                        fontSize: '8.5pt',
                                        fontWeight: 'bold',
                                        backgroundColor: playgroundWebTab === t ? '#fff' : 'transparent',
                                        color: playgroundWebTab === t ? '#3b5998' : '#64748b',
                                        border: '1px solid transparent',
                                        borderBottomColor: playgroundWebTab === t ? '#fff' : 'transparent',
                                        borderTopLeftRadius: '4px',
                                        borderTopRightRadius: '4px',
                                        marginBottom: '-1px',
                                        zIndex: playgroundWebTab === t ? 1 : 0
                                      }}
                                    >
                                      index.{t.toUpperCase()}
                                    </button>
                                  ))}
                                </div>

                                {/* Web Editor Area */}
                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                  <Editor
                                    height="400px"
                                    language={playgroundWebTab === 'js' ? 'javascript' : playgroundWebTab}
                                    theme="vs"
                                    value={playgroundWebTab === 'html' ? playgroundWebHtml : playgroundWebTab === 'css' ? playgroundWebCss : playgroundWebJs}
                                    onChange={(val) => {
                                      if (playgroundWebTab === 'html') setPlaygroundWebHtml(val || '');
                                      else if (playgroundWebTab === 'css') setPlaygroundWebCss(val || '');
                                      else if (playgroundWebTab === 'js') setPlaygroundWebJs(val || '');
                                    }}
                                    options={{
                                      minimap: { enabled: false },
                                      fontSize: 13,
                                      lineHeight: 20,
                                      scrollBeyondLastLine: false,
                                      automaticLayout: true,
                                      fontFamily: 'Consolas, Monaco, monospace'
                                    }}
                                  />
                                </div>

                                {/* Sandbox Live Preview Iframe */}
                                <div>
                                  <label style={{ display: 'block', fontSize: '9pt', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                                    Live Sandbox Canvas Visual Preview:
                                  </label>
                                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#fff' }}>
                                    <iframe
                                      title="BICS Playground Sandbox Preview"
                                      srcDoc={`
                                        <!DOCTYPE html>
                                        <html>
                                          <head>
                                            <meta charset="utf-8">
                                            <base href="https://invalid-sandbox-origin.invalid/">
                                            <style>${playgroundWebCss}</style>
                                          </head>
                                          <body>
                                            ${playgroundWebHtml}
                                            <script>
                                              try {
                                                ${playgroundWebJs}
                                              } catch (err) {
                                                console.error(err);
                                              }
                                            </script>
                                          </body>
                                        </html>
                                      `}
                                      style={{
                                        width: '100%',
                                        height: '240px',
                                        border: 'none',
                                        backgroundColor: '#fff'
                                      }}
                                      sandbox="allow-scripts"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="cf-alert cf-alert-info">Select a lecture from the side list to begin playing.</div>
                    )}
                  </div>

                  {/* Lecture Navigation Side List */}
                  <div style={{ flex: '1 1 280px', minWidth: '240px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px', maxHeight: '550px', overflowY: 'auto' }}>
                    <h4 style={{ color: '#333', fontWeight: 'bold', marginBottom: '12px', paddingBottom: '5px', borderBottom: '2px solid #3b5998' }}>
                      Lecture Sections
                    </h4>
                    {Array.from(new Set(videoLectures.map(l => l.section))).map((section, sIdx) => (
                      <div key={sIdx} style={{ marginBottom: '20px' }}>
                        <h5 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', marginBottom: '8px', textTransform: 'uppercase' }}>
                          {section}
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {videoLectures.filter(l => l.section === section).map((lect, lIdx) => (
                            <button
                              key={lIdx}
                              onClick={() => setSelectedLecture(lect)}
                              className="cf-btn-secondary"
                              style={{
                                textAlign: 'left',
                                fontSize: '9pt',
                                padding: '8px 10px',
                                width: '100%',
                                border: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                                  ? '2px solid #3b5998'
                                  : '1px solid #e2e8f0',
                                backgroundColor: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                                  ? '#f1f5f9'
                                  : '#fff',
                                fontWeight: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                                  ? 'bold'
                                  : 'normal'
                              }}
                            >
                              {lect.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* COURSEWORK - MATERIALS */}
          {view === 'materials' && (
            <div className="cf-card">
              <div className="cf-card-title">Course Study Materials</div>
              {courseMaterials.length === 0 ? (
                <div className="cf-alert cf-alert-info">No study materials uploaded yet.</div>
              ) : (
                <div style={{ marginTop: '15px' }}>
                  
                  {(() => {
                    const defaultOrder = ["Curriculum", "Textbooks", "External", "Assignments", "Practicals"];
                    const allSections = Array.from(new Set(courseMaterials.map(m => m.section)));
                    const sortedSections = allSections.sort((a, b) => {
                      const idxA = defaultOrder.indexOf(a);
                      const idxB = defaultOrder.indexOf(b);
                      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                      if (idxA !== -1) return -1;
                      if (idxB !== -1) return 1;
                      return a.localeCompare(b);
                    });

                    return sortedSections.map((section, sIdx) => {
                      const sectionMats = courseMaterials.filter(m => m.section === section);
                      if (sectionMats.length === 0) return null;

                      return (
                        <div key={sIdx} style={{ marginBottom: '30px' }}>
                          <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', marginBottom: '10px', paddingBottom: '5px', borderBottom: '2px solid #3b5998', display: 'inline-block' }}>
                            {section}
                          </h4>
                          <table className="cf-table" style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', width: '60%' }}>Material Name</th>
                                <th style={{ textAlign: 'left', width: '25%' }}>Date Uploaded</th>
                                <th style={{ textAlign: 'center', width: '15%' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sectionMats.map((mat, mIdx) => (
                                <tr key={mIdx}>
                                  <td>
                                    <strong>{mat.title}</strong>
                                  </td>
                                  <td style={{ color: '#555', fontSize: '9pt' }}>
                                    {new Date(mat.createdAt).toLocaleDateString()}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <a
                                      href={mat.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="cf-btn-primary"
                                      style={{ padding: '4px 10px', fontSize: '8pt', textDecoration: 'none', display: 'inline-block' }}
                                    >
                                      View/Download
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    });
                  })()}

                </div>
              )}
            </div>
          )}

          {/* COURSEWORK - TESTS */}
          {view === 'tests' && (
            <div className="cf-card">
              <div className="cf-card-title">
                <ClipboardList size={18} style={{ marginRight: '8px', verticalAlign: 'middle', color: '#3b5998' }} /> Online Practice &amp; Exam Tests
              </div>
              {(systemConfig && systemConfig.onlineExamActive === false) ? (
                <div className="cf-alert cf-alert-info" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '25px 20px', borderLeft: '5px solid #3b5998' }}>
                  <Calendar size={48} style={{ color: '#3b5998', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontSize: '12pt', color: '#002147', fontWeight: 'bold', marginBottom: '6px' }}>
                      No online exams are scheduled
                    </h4>
                    <p style={{ fontSize: '9.5pt', lineHeight: '1.6', color: '#475569' }}>
                      The online examination module is currently deactivated. Please check back later or contact the administrator for scheduled session updates.
                    </p>
                  </div>
                </div>
              ) : activeStudentTests.length === 0 ? (
                <div className="cf-alert cf-alert-info" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '25px 20px', borderLeft: '5px solid #3b5998' }}>
                  <Calendar size={48} style={{ color: '#3b5998', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontSize: '12pt', color: '#002147', fontWeight: 'bold', marginBottom: '6px' }}>
                      No active tests at this moment
                    </h4>
                    <p style={{ fontSize: '9.5pt', lineHeight: '1.6', color: '#475569' }}>
                      There are no examinations scheduled or open for access at this time. Once an administrator opens access to a mock quiz or official exam, it will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
                  {activeStudentTests.map((test, idx) => {
                    const startTime = new Date(test.startDate);
                    const endTime = new Date(test.endDate);
                    const isFuture = startTime > currentTime;
                    const isExpired = endTime < currentTime;
                    let countdownStr = '';
                    if (isFuture) {
                      const diffSecs = Math.max(0, Math.floor((startTime.getTime() - currentTime.getTime()) / 1000));
                      const hours = Math.floor(diffSecs / 3600);
                      const minutes = Math.floor((diffSecs % 3600) / 60);
                      const seconds = diffSecs % 60;
                      countdownStr = `${hours}h ${minutes}m ${seconds}s`;
                    }

                    return (
                      <div key={idx} className="cf-alert cf-alert-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', borderLeft: '5px solid #3b5998', padding: '20px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <h4 style={{ fontSize: '12pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>{test.title}</h4>
                            {(test.submissionStatus && test.submissionStatus !== 'started') && (
                              <span style={{ fontSize: '8pt', backgroundColor: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle size={10} /> Completed
                              </span>
                            )}
                            {isFuture && (
                              <span style={{ fontSize: '8pt', backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={10} /> Starts in: {countdownStr}
                              </span>
                            )}
                            {isExpired && !test.submissionStatus && (
                              <span style={{ fontSize: '8pt', backgroundColor: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={10} /> Expired
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '9pt', color: '#555', marginBottom: '4px' }}>
                            Duration: <strong>{test.duration} minutes</strong> | Total Marks: <strong>{test.marks} marks</strong>
                          </p>
                          <p style={{ fontSize: '8.5pt', color: '#888' }}>
                            Open from: {new Date(test.startDate).toLocaleString()} to {new Date(test.endDate).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          {test.submissionStatus ? (
                            <button
                              className="cf-btn-secondary"
                              disabled
                              style={{ cursor: 'not-allowed', backgroundColor: '#cbd5e1', color: '#64748b', borderColor: '#cbd5e1' }}
                            >
                              Already Submitted
                            </button>
                          ) : isFuture ? (
                            <button
                              className="cf-btn-secondary"
                              disabled
                              style={{ cursor: 'not-allowed', backgroundColor: '#cbd5e1', color: '#64748b', borderColor: '#cbd5e1' }}
                            >
                              Locked
                            </button>
                          ) : isExpired ? (
                            <button
                              className="cf-btn-secondary"
                              disabled
                              style={{ cursor: 'not-allowed', backgroundColor: '#fee2e2', color: '#ef4444', borderColor: '#fee2e2', opacity: 0.8 }}
                            >
                              Access Expired
                            </button>
                          ) : (
                            <button
                              className="cf-btn-primary"
                              disabled={enteringTestId !== null}
                              onClick={() => handleStartExam(test.id || test._id)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                            >
                              {(enteringTestId === test.id || enteringTestId === test._id) ? (
                                <>
                                  <Loader2 className="spinner" size={12} style={{ width: '12px', height: '12px', borderWidth: '2px', marginRight: '4px' }} />
                                  Loading Exam...
                                </>
                              ) : (
                                'Enter Test'
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === 'submissions' && (
            <div className="submissions-page-container">
              <style dangerouslySetInnerHTML={{__html: `
                @media print {
                  .app-sidebar, .app-header, .app-footer, .print-hide, .latency-notice {
                    display: none !important;
                  }
                  body, .app-main, .main-content {
                    background: #fff !important;
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                  .cf-card {
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin-bottom: 25px !important;
                  }
                  .cf-table {
                    border: 1px solid #cbd5e1 !important;
                    width: 100% !important;
                  }
                  .cf-table th, .cf-table td {
                    border: 1px solid #cbd5e1 !important;
                    color: #000 !important;
                    padding: 8px !important;
                  }
                  .print-show-block {
                    display: block !important;
                  }
                }
              `}} />

              {/* Title Header */}
              <div className="print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Coursework Submissions Ledger</h2>
                  <p style={{ fontSize: '9pt', color: '#64748b', margin: '4px 0 0 0' }}>Real-time synchronization with Google Classroom</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {ledgerQrData && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                      {(() => {
                        const { success, ...cleanQr } = ledgerQrData;
                        return (
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(JSON.stringify(cleanQr))}`} 
                            alt="Security QR" 
                            style={{ width: '40px', height: '40px', display: 'block' }} 
                          />
                        );
                      })()}
                      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                        <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#0f172a' }}>Verification Seal</span>
                        <span style={{ fontSize: '6.5pt', color: '#64748b', fontFamily: 'monospace' }}>SECURE HMAC QR</span>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      className="cf-btn-secondary" 
                      onClick={() => {
                        fetchStudentSubmissions(studentProfile?.studentId || user?.studentId || user?.username || "STU1001");
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RefreshCw size={14} /> Refresh Ledger
                    </button>
                    <button 
                      className="cf-btn-primary" 
                      onClick={() => window.print()}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Printer size={14} /> Print Ledger
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'none' }} className="print-show-block">
                <div style={{ borderBottom: '2px solid #002147', paddingBottom: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h1 style={{ fontSize: '15pt', color: '#002147', margin: 0 }}>
                      BICS COURSEWORK LEDGER
                      {activeSubmissionTab !== 'all' && (
                        <span style={{ fontSize: '10pt', fontWeight: 'normal', color: '#475569', marginLeft: '6px' }}>
                          ({activeSubmissionTab.replace('_', ' ').toUpperCase()}S)
                        </span>
                      )}
                    </h1>
                    <p style={{ fontSize: '8.5pt', color: '#475569', margin: '2px 0 0 0' }}>Official Student Submission Record Card</p>
                  </div>
                  
                  {/* Secure Cryptographic QR Verification Code */}
                  {ledgerQrData && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginRight: '20px' }}>
                      {(() => {
                        const { success, ...cleanQr } = ledgerQrData;
                        return (
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(JSON.stringify(cleanQr))}`} 
                            alt="Security QR Code" 
                            style={{ width: '80px', height: '80px', border: '1px solid #cbd5e1', padding: '2px', display: 'block' }} 
                          />
                        );
                      })()}
                      <span style={{ fontSize: '6pt', fontFamily: 'monospace', color: '#64748b' }}>SECURITY QR</span>
                    </div>
                  )}

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>{studentProfile?.name || user?.name || 'Siyam Bubere'}</div>
                    <div style={{ fontSize: '9.5pt', color: '#475569' }}>Student ID: {studentProfile?.studentId || user?.studentId || 'STU1001'}</div>
                  </div>
                </div>
              </div>

              {/* Filter Tabs Container */}
              <div className="print-hide" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                {[
                  { id: 'all', label: 'All Submissions' },
                  { id: 'assignment', label: 'Assignments' },
                  { id: 'practical', label: 'Practicals' },
                  { id: 'class_test', label: 'Class Tests' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    className={`cf-btn-${activeSubmissionTab === tab.id ? 'primary' : 'secondary'}`}
                    style={{ padding: '8px 16px', borderRadius: '20px', fontSize: '9pt', fontWeight: 'bold' }}
                    onClick={() => setActiveSubmissionTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Overall Statistics Segment */}
              {(() => {
                const filteredList = studentSubmissions.filter(sub => {
                  if (activeSubmissionTab === 'all') return true;
                  return sub.type === activeSubmissionTab;
                });
                console.log("DEBUG: activeTab =", activeSubmissionTab, "filteredList =", filteredList);

                const total = filteredList.length;
                const onTimeCount = filteredList.filter(s => s.status === 'on_time').length;
                const lateCount = filteredList.filter(s => s.status === 'late').length;
                const excusedCount = filteredList.filter(s => s.status === 'excused').length;
                
                const onTimeRate = total > 0 ? Math.round(((onTimeCount + excusedCount) / total) * 100) : 0;
                
                let totalScoreSum = 0;
                let maxScoreSum = 0;
                filteredList.forEach(s => {
                  if (s.maxScore > 0) {
                    totalScoreSum += s.score || 0;
                    maxScoreSum += s.maxScore;
                  }
                });
                const avgScorePct = maxScoreSum > 0 ? Math.round((totalScoreSum / maxScoreSum) * 100) : 0;

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '25px' }}>
                      <div className="cf-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Total Records</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '24pt', fontWeight: 'bold', color: '#0f172a' }}>{total}</span>
                          <span style={{ fontSize: '9pt', color: '#64748b' }}>Tasks Tracked</span>
                        </div>
                      </div>

                      <div className="cf-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>On-Time Rate</div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                            <span style={{ fontSize: '24pt', fontWeight: 'bold', color: onTimeRate >= 80 ? '#10b981' : '#f59e0b' }}>{onTimeRate}%</span>
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${onTimeRate}%`, backgroundColor: onTimeRate >= 80 ? '#10b981' : '#f59e0b', borderRadius: '3px', transition: 'width 0.5s ease-in-out' }} />
                          </div>
                        </div>
                      </div>

                      <div className="cf-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Late Submissions</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '24pt', fontWeight: 'bold', color: lateCount > 0 ? '#ef4444' : '#10b981' }}>{lateCount}</span>
                          <span style={{ fontSize: '9.5pt', color: lateCount > 0 ? '#ef4444' : '#10b981', fontWeight: '500' }}>
                            {lateCount > 0 ? 'Requires attention' : 'All clear'}
                          </span>
                        </div>
                      </div>

                      <div className="cf-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '110px' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Average Performance</div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                            <span style={{ fontSize: '24pt', fontWeight: 'bold', color: '#3b82f6' }}>{avgScorePct}%</span>
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${avgScorePct}%`, backgroundColor: '#3b82f6', borderRadius: '3px', transition: 'width 0.5s ease-in-out' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Course-wise Tabular Grids */}
                    {(() => {
                      const courses = [
                        { code: 'R526CS01T', name: 'Introduction to Computer Science', category: 'Theory' },
                        { code: 'R526CS02T', name: 'Programming Fundamental with C++', category: 'Theory' },
                        { code: 'R526CS03T', name: 'Basics of Web Development', category: 'Theory' },
                        { code: 'R526CS04T', name: 'Mathematical Thinking', category: 'Theory' },
                        { code: 'R526CS02L', name: 'Programming Fundamental with C++ Lab', category: 'Lab' },
                        { code: 'R526CS03L', name: 'Basics of Web Development Lab', category: 'Lab' }
                      ];

                      let filteredCourses = courses;
                      if (activeSubmissionTab === 'assignment' || activeSubmissionTab === 'class_test') {
                        filteredCourses = courses.filter(c => c.category === 'Theory');
                      } else if (activeSubmissionTab === 'practical') {
                        filteredCourses = courses.filter(c => c.category === 'Lab');
                      }

                      return filteredCourses.map(course => {
                        const courseSubmissions = filteredList.filter(s => 
                          s.courseCode && s.courseCode.trim().toUpperCase() === course.code.trim().toUpperCase()
                        );

                        if (courseSubmissions.length === 0) return null;

                        return (
                          <div key={course.code} className="cf-card" style={{ marginBottom: '25px', pageBreakInside: 'avoid' }}>
                            <div style={{ borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h3 style={{ fontSize: '11.5pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>
                                {course.name} <span style={{ fontSize: '9pt', color: '#64748b', fontWeight: 'normal', marginLeft: '6px' }}>({course.code})</span>
                              </h3>
                              <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 'bold', fontSize: '8pt' }}>
                                {course.category}
                              </span>
                            </div>

                            <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
                              <table className="cf-table">
                                <thead>
                                  <tr>
                                    <th>Task Title / Google Classroom Link</th>
                                    <th>Due Date</th>
                                    <th>Submission Date</th>
                                    <th style={{ width: '130px' }}>Status</th>
                                    <th style={{ width: '120px', textAlign: 'right' }}>Score / Max</th>
                                    <th style={{ width: '150px' }} className="print-hide">Support</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {courseSubmissions.map((sub, sIdx) => {
                                    let badgeBg = '#f1f5f9';
                                    let badgeColor = '#475569';
                                    if (sub.status === 'on_time') {
                                      badgeBg = '#ecfdf5';
                                      badgeColor = '#047857';
                                    } else if (sub.status === 'late') {
                                      badgeBg = '#fef2f2';
                                      badgeColor = '#b91c1c';
                                    } else if (sub.status === 'pending') {
                                      badgeBg = '#eff6ff';
                                      badgeColor = '#1d4ed8';
                                    } else if (sub.status === 'excused') {
                                      badgeBg = '#fffbeb';
                                      badgeColor = '#b45309';
                                    }

                                    return (
                                      <tr key={sIdx}>
                                        <td style={{ fontWeight: '500', fontSize: '9.5pt' }}>
                                          {sub.classroomLink ? (
                                            <a 
                                              href={sub.classroomLink} 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#2563eb', textDecoration: 'none' }}
                                              className="task-title-link"
                                            >
                                              {sub.title} <ExternalLink size={12} />
                                            </a>
                                          ) : (
                                            sub.title
                                          )}
                                        </td>
                                        <td style={{ fontSize: '9pt', color: '#475569' }}>
                                          {sub.dueDate ? new Date(sub.dueDate).toLocaleString() : 'N/A'}
                                        </td>
                                        <td style={{ fontSize: '9pt', color: '#475569' }}>
                                          {sub.submissionDate ? new Date(sub.submissionDate).toLocaleString() : 'Pending'}
                                        </td>
                                        <td>
                                          <span className="status-badge" style={{ backgroundColor: badgeBg, color: badgeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                            {sub.status?.replace('_', ' ')}
                                          </span>
                                        </td>
                                        <td style={{ fontWeight: 'bold', fontSize: '10pt', textAlign: 'right', color: '#0f172a' }}>
                                          {sub.score} / {sub.maxScore}
                                        </td>
                                        <td className="print-hide">
                                          <button
                                            className="cf-btn-secondary"
                                            style={{ margin: 0, padding: '4px 10px', fontSize: '8pt', borderColor: '#cbd5e1' }}
                                            onClick={() => {
                                              setContactSubject(`Google Classroom Submission Inquiry - ${sub.courseCode} - ${sub.title}`);
                                              setContactMessage(`Dear Support,\n\nI am raising an inquiry regarding my submission for "${sub.title}" under course code: ${sub.courseCode} (${sub.courseName}).\n\nSubmission Details:\n- Status: ${sub.status?.toUpperCase()}\n- Score Resolved: ${sub.score}/${sub.maxScore}\n- Due Date: ${sub.dueDate ? new Date(sub.dueDate).toLocaleString() : 'N/A'}\n- Submission Date: ${sub.submissionDate ? new Date(sub.submissionDate).toLocaleString() : 'N/A'}\n\nPlease check if this matches Google Classroom records.\n\nThank you.`);
                                              setContactSuccess('');
                                              setContactError('');
                                              setContactSubView('form');
                                              setView('contact');
                                            }}
                                          >
                                            Raise Ticket
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      });
                    })()}

                    {/* Footnote latency notice */}
                    <div className="latency-notice" style={{ marginTop: '35px', padding: '15px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontStyle: 'italic', fontSize: '9pt', color: '#475569' }}>
                        Submissions will be reflected in a few hours. Please raise a ticket if they are still not reflected after 24 hours.
                      </span>
                      <button
                        className="cf-btn-secondary print-hide"
                        style={{ margin: 0, padding: '6px 12px', fontSize: '8.5pt', fontWeight: 'bold' }}
                        onClick={() => {
                          setContactSubject(`Submission reflecting issue`);
                          setContactMessage(`Dear Support,\n\nMy Google Classroom submissions have not been reflected on my portal ledger. It has been more than 24 hours since my submission.\n\nPlease check my records.\n\nThank you.`);
                          setContactSuccess('');
                          setContactError('');
                          setContactSubView('form');
                          setView('contact');
                        }}
                      >
                        Raise Ticket Shortcut
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {/* EXAMINATION HALL TICKET & CONSENT FORM */}
          {view === 'hallticket' && studentProfile && systemConfig && (
            <div className="cf-card">
              <div className="cf-card-title" style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '12px', marginBottom: '20px' }}>
                Official Hall Ticket Dispatch ({systemConfig.examType === 'midsem' ? 'Mid' : 'End'} Semester)
              </div>
              
              {!systemConfig.hallTicketDownloadActive ? (
                <div className="cf-alert cf-alert-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldAlert size={28} />
                  <div>
                    <strong>Hall Ticket Notice:</strong><br />
                    Hall Ticket download is currently disabled by the administrator.
                  </div>
                </div>
              ) : !studentProfile.eligible ? (
                <div className="cf-alert cf-alert-error" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldAlert size={28} />
                  <div>
                    <strong>Exam Eligibility Notice:</strong><br />
                    You are not eligible to take this examination. Please contact the administrator.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* STEP 1: MALPRACTICE CONSENT */}
                  {((systemConfig.examType === 'midsem' && !studentProfile.midSemConsentSigned) || (systemConfig.examType === 'endsem' && !studentProfile.endSemConsentSigned)) ? (
                    <div className="cf-card" style={{ padding: '20px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', margin: '0' }}>
                      <h4 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <ShieldAlert size={18} style={{ color: '#b91c1c' }} />
                        Step 1: Malpractice & Proctoring Consent Declaration
                      </h4>
                      {consentSuccess && <div className="cf-alert cf-alert-success">{consentSuccess}</div>}
                      <p style={{ fontSize: '9.5pt', lineHeight: '1.6', color: '#334155', margin: '0 0 15px 0' }}>
                        I hereby solemnly declare and promise that I will refrain from any kind of malpractice, cheating, copying, plagiarism, or unauthorized resource usage during the BICS Course Examination 2026. I understand that any violation of this code of conduct will lead to immediate disqualification and cancellation of my candidacy.
                      </p>
                      <div style={{ marginBottom: '15px' }}>
                        <label className="checkbox-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '9.5pt' }}>
                          <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
                          I accept and agree to the declaration statement.
                        </label>
                      </div>
                      <button className="cf-btn-primary" disabled={!consentChecked} onClick={handleSignConsent}>
                        Confirm & Sign Consent
                      </button>
                    </div>
                  ) : ((systemConfig.examType === 'midsem' && (!studentProfile.midSemFeedback || Object.keys(studentProfile.midSemFeedback).length === 0)) || (systemConfig.examType === 'endsem' && (!studentProfile.endSemFeedback || Object.keys(studentProfile.endSemFeedback).length === 0))) ? (
                    
                    /* STEP 2: COURSE FEEDBACK SURVEY */
                    <div className="cf-alert cf-alert-warning" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px', border: '1px solid #d97706', margin: '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FileText size={28} style={{ color: '#d97706' }} />
                        <div>
                          <strong style={{ fontSize: '11pt', color: '#b45309' }}>Step 2: Course Feedback Survey Required</strong><br />
                          <span style={{ fontSize: '9.5pt', color: '#475569' }}>
                            You must complete and submit your {systemConfig.examType === 'midsem' ? 'Mid-Semester' : 'End-Semester'} Course Feedback Questionnaire to unlock the Hall Ticket download.
                          </span>
                        </div>
                      </div>
                      <button className="cf-btn-primary" style={{ alignSelf: 'flex-start', marginTop: '8px' }} onClick={() => setView(systemConfig.examType === 'midsem' ? 'midsem' : 'endsem')}>
                        Go to Feedback Form &rarr;
                      </button>
                    </div>
                  ) : ((systemConfig.examType === 'midsem' && !studentProfile.midSemLedgerUrl) || (systemConfig.examType === 'endsem' && !studentProfile.endSemLedgerUrl)) ? (
                    
                    /* STEP 3: SIGNED COURSEWORK LEDGER */
                    <div className="cf-card" style={{ padding: '25px', border: '1px solid #cbd5e1', backgroundColor: '#fff', margin: '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                        <Upload size={28} style={{ color: '#002147', flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: '11pt', color: '#002147' }}>Step 3: Upload Scanned Signed Coursework Ledger</strong><br />
                          <span style={{ fontSize: '9.5pt', color: '#475569' }}>
                            Print your coursework submissions ledger, obtain your course instructor's physical signature, and upload a digital copy below to unlock the download.
                          </span>
                        </div>
                      </div>
                      <LedgerUploadForm type={systemConfig.examType === 'midsem' ? 'mid' : 'end'} studentProfile={studentProfile} fetchStudentProfile={fetchStudentProfile} user={user} fetchStudentSubmissions={fetchStudentSubmissions} setView={setView} />
                    </div>
                  ) : ((systemConfig.examType === 'midsem' && !studentProfile.midSemEmailVerified) || (systemConfig.examType === 'endsem' && !studentProfile.endSemEmailVerified)) ? (
                    
                    /* STEP 4: EMAIL CODE VERIFICATION */
                    <div className="cf-card" style={{ padding: '25px', border: '1px solid #3b5998', backgroundColor: '#f8fafc', margin: '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                        <ShieldAlert size={28} style={{ color: '#3b5998', flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: '11pt', color: '#002147' }}>Step 4: Secure Email Verification</strong><br />
                          <span style={{ fontSize: '9.5pt', color: '#475569' }}>
                            We must verify your identity. Send a 6-digit secure code to your registered email (<strong>{studentProfile.registrationData?.personalEmail || studentProfile.personalEmail}</strong>) and verify it below.
                          </span>
                        </div>
                      </div>

                      {verificationSuccess && <div className="cf-alert cf-alert-success" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{verificationSuccess}</div>}
                      {verificationError && <div className="cf-alert cf-alert-error" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{verificationError}</div>}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '350px' }}>
                        {!verificationCodeSent ? (
                          <button 
                            type="button" 
                            className="cf-btn-primary" 
                            disabled={sendingVerificationCode}
                            onClick={handleSendVerificationCode}
                            style={{ padding: '8px 16px', fontSize: '9.5pt', fontWeight: 'bold' }}
                          >
                            {sendingVerificationCode ? "Sending Code..." : "Send Verification Code"}
                          </button>
                        ) : (
                          <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="cf-input-group">
                              <label className="cf-label" style={{ fontWeight: 'bold' }}>Enter 6-Digit Code</label>
                              <input 
                                type="text" 
                                className="cf-input" 
                                maxLength={6} 
                                placeholder="e.g. 123456" 
                                required 
                                value={verificationEmailCode} 
                                onChange={e => setVerificationEmailCode(e.target.value.replace(/\D/g, ''))}
                                style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '12pt', fontWeight: 'bold' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button 
                                type="submit" 
                                className="cf-btn-primary" 
                                disabled={verifyingCode} 
                                style={{ flex: '2', padding: '8px', fontWeight: 'bold' }}
                              >
                                Verify & Unlock
                              </button>
                              <button 
                                type="button" 
                                className="cf-btn-secondary" 
                                disabled={sendingVerificationCode} 
                                onClick={handleSendVerificationCode}
                                style={{ flex: '1', padding: '8px', fontSize: '8.5pt' }}
                              >
                                Resend
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  ) : (
                    
                    /* STEP 5: SUCCESS & DOWNLOAD TICKET */
                    <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px solid #16a34a', backgroundColor: '#f0fdf4', borderRadius: '6px' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px auto' }}>
                        <CheckCircle size={36} style={{ color: '#16a34a' }} />
                      </div>
                      <h3 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#14532d', marginBottom: '10px' }}>
                        All Verification Prerequisites Completed!
                      </h3>
                      <p style={{ fontSize: '10pt', color: '#166534', maxWidth: '500px', margin: '0 auto 25px auto', lineHeight: '1.6' }}>
                        Your identity, malpractice undertaking, coursework submissions, and feedback surveys have been verified. Click the button below to retrieve your official dynamic A4 PDF Examination Hall Ticket.
                      </p>
                      
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                        <button 
                          className="cf-btn-primary" 
                          onClick={() => window.open(`${API_BASE}/candidate/generate-hallticket/${studentProfile.id || studentProfile._id}?type=${systemConfig.examType === 'midsem' ? 'mid' : 'end'}`, '_blank')}
                          style={{ padding: '12px 24px', fontSize: '10.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                          <Download size={18} /> Download Official Hall Ticket (PDF)
                        </button>
                        <button 
                          className="cf-btn-secondary" 
                          onClick={() => setView('announcements')}
                          style={{ padding: '12px 24px', fontSize: '10.5pt', fontWeight: 'bold' }}
                        >
                          Back to Dashboard
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}
          {view === 'verification' && (
            <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={16} />
                <span>Evaluated Answer Sheet Verification</span>
              </div>

              {submittedTestsList.length === 0 ? (
                <div className="cf-alert cf-alert-info">
                  No submitted tests or evaluated responses are available on your candidate profile at this moment.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  
                  {/* Select Dropdown */}
                  <div className="cf-input-group">
                    <label className="cf-label" style={{ fontWeight: 'bold' }}>Select Completed Exam:</label>
                    <select
                      className="cf-input"
                      value={selectedVerificationTestId}
                      onChange={(e) => setSelectedVerificationTestId(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '9.5pt' }}
                    >
                      {submittedTestsList.map((st, sIdx) => (
                        <option key={sIdx} value={st.id || st._id}>
                          {st.title} (Submitted: {new Date(st.submission.submittedAt || st.submission.startedAt).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const activeVer = submittedTestsList.find(st => (st.id || st._id) === selectedVerificationTestId);
                    if (!activeVer) return null;

                    if (!activeVer.answersReleased) {
                      return (
                        <div className="cf-alert cf-alert-info" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                          <ShieldAlert size={28} style={{ color: '#0284c7' }} />
                          <div>
                            <strong>Answer Sheets Locked:</strong><br />
                            The administrator has not released the evaluated answer sheets for <strong>{activeVer.title}</strong> yet. Evaluation results will be published once grading is finalized.
                          </div>
                        </div>
                      );
                    }

                    // Render released evaluated answer sheet!
                    const sub = activeVer.submission;
                    return (
                      <div style={{ borderTop: '2px solid #3b5998', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
                        
                        {/* Grades Card */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '6px' }}>
                          <div>
                            <h4 style={{ fontSize: '10pt', color: '#002147', fontWeight: 'bold', margin: '0 0 6px 0' }}>Evaluation Grades Overview:</h4>
                            <div style={{ fontSize: '9pt', color: '#555', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div>MCQ Marks: <strong>{sub.evaluation?.mcqScore || 0} marks</strong></div>
                              <div>Coding Marks: <strong>{sub.evaluation?.codingScore || 0} marks</strong></div>
                              <div>Total Grade: <strong>{Number(sub.evaluation?.mcqScore || 0) + Number(sub.evaluation?.codingScore || 0)} / {activeVer.marks} marks</strong></div>
                            </div>
                          </div>
                          <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '15px' }}>
                            <h4 style={{ fontSize: '10pt', color: '#002147', fontWeight: 'bold', margin: '0 0 6px 0' }}>Proctoring Compliance Log:</h4>
                            <div style={{ fontSize: '9pt', color: '#555', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div>Fullscreen Exits: <strong>{sub.proctoringLog?.fullscreenExits || 0} warnings</strong></div>
                              <div>Tab Switches / Focus Loss: <strong>{sub.proctoringLog?.tabSwitches || 0} warnings</strong></div>
                              <div>Webcam Status: <strong>{sub.proctoringLog?.webcamStatus || 'Active'}</strong></div>
                            </div>
                          </div>
                        </div>

                        {/* RE-EVALUATION FILING AND STATUS GATEWAY */}
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff', marginBottom: '10px' }}>
                          
                          {/* Case 1: Re-evaluation Request is already filed */}
                          {sub.reevaluation?.applied ? (
                            <div>
                              
                              {/* Status Header Bar */}
                              <div style={{
                                padding: '10px 15px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontWeight: 'bold',
                                fontSize: '9.5pt',
                                backgroundColor: sub.reevaluation.status === 'pending' ? '#fef3c7' : sub.reevaluation.status === 'resolved' ? '#d1fae5' : '#fee2e2',
                                color: sub.reevaluation.status === 'pending' ? '#d97706' : sub.reevaluation.status === 'resolved' ? '#065f46' : '#b91c1c',
                                borderBottom: '1px solid #cbd5e1'
                              }}>
                                {sub.reevaluation.status === 'pending' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={15} /> Re-evaluation Claim Filed - Pending Review</span>}
                                {sub.reevaluation.status === 'resolved' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={15} /> Re-evaluation Request Resolved</span>}
                                {sub.reevaluation.status === 'rejected' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><XCircle size={15} /> Re-evaluation Request Rejected</span>}
                              </div>

                              <div style={{ padding: '15px', fontSize: '9pt', display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '1.5' }}>
                                <div>
                                  <span style={{ fontWeight: 'bold', color: '#002147' }}>Date Filed: </span> 
                                  {new Date(sub.reevaluation.appliedAt).toLocaleString()}
                                </div>

                                {sub.reevaluation.complainedQuestions?.length > 0 && (
                                  <div>
                                    <span style={{ fontWeight: 'bold', color: '#002147' }}>Contested Questions: </span>
                                    <span style={{ fontSize: '8.5pt', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                      {sub.reevaluation.complainedQuestions.map(qId => {
                                        const foundQIdx = sub.questions.findIndex(q => q.id === qId);
                                        return foundQIdx !== -1 ? `Q${foundQIdx + 1}` : qId;
                                      }).join(', ')}
                                    </span>
                                  </div>
                                )}

                                <div>
                                  <div style={{ fontWeight: 'bold', color: '#002147', marginBottom: '4px' }}>Candidate Explanation:</div>
                                  <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', color: '#334155' }}>
                                    {sub.reevaluation.complaintText}
                                  </div>
                                </div>

                                {sub.reevaluation.proofImages?.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: 'bold', color: '#002147', marginBottom: '6px' }}>Uploaded Proof Screenshots:</div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                      {sub.reevaluation.proofImages.map((imgUrl, imgIdx) => (
                                        <a key={imgIdx} href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'block', width: '80px', height: '80px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                          <img src={imgUrl} alt={`Proof screenshot ${imgIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {sub.reevaluation.status !== 'pending' && (
                                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '4px' }}>
                                    <div style={{ fontWeight: 'bold', color: sub.reevaluation.status === 'resolved' ? '#065f46' : '#b91c1c', marginBottom: '4px' }}>
                                      {sub.reevaluation.status === 'resolved' ? 'Resolution Comments:' : 'Rejection Comments:'}
                                    </div>
                                    <div style={{ backgroundColor: sub.reevaluation.status === 'resolved' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${sub.reevaluation.status === 'resolved' ? '#bbf7d0' : '#fecaca'}`, padding: '10px', borderRadius: '4px', color: '#333', whiteSpace: 'pre-wrap' }}>
                                      {sub.reevaluation.resolutionFeedback || 'No evaluator resolution comments provided.'}
                                    </div>
                                  </div>
                                )}
                              </div>

                            </div>
                          ) : (
                            <div>
                              
                              {/* Case 2: Apply Form is closed - show Apply Button */}
                              {!showReevalForm ? (
                                <div style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                                  <div style={{ fontSize: '8.5pt', color: '#555', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <HelpCircle size={16} style={{ color: '#64748b' }} />
                                    <span>If you identify discrepancies in the grading keys or evaluation marks, you can apply for verification re-evaluation.</span>
                                  </div>
                                  <button
                                    className="cf-btn-primary"
                                    style={{ padding: '6px 12px', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px', background: '#0f172a', borderColor: '#0f172a', color: '#ffffff' }}
                                    onClick={() => setShowReevalForm(true)}
                                  >
                                    Apply for Re-evaluation
                                  </button>
                                </div>
                              ) : (
                                
                                /* Case 3: Apply Form is open */
                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                  <h4 style={{ fontSize: '10pt', color: '#002147', fontWeight: 'bold', margin: '0 0 5px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileEdit size={16} />
                                    <span>File Re-evaluation Claim: {activeVer.title}</span>
                                  </h4>

                                  {/* Select complained questions */}
                                  <div>
                                    <label className="cf-label" style={{ fontWeight: 'bold', marginBottom: '8px' }}>Select Contested Questions: (Optional)</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                      {(sub.questions || []).map((q, qIdx) => {
                                        const isChecked = reevalSelectedQuestions.includes(q.id);
                                        return (
                                          <label
                                            key={qIdx}
                                            style={{
                                              padding: '8px 12px',
                                              border: '1px solid #cbd5e1',
                                              borderRadius: '4px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              cursor: 'pointer',
                                              fontSize: '8.5pt',
                                              backgroundColor: isChecked ? '#eff6ff' : '#ffffff'
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setReevalSelectedQuestions(prev => [...prev, q.id]);
                                                } else {
                                                  setReevalSelectedQuestions(prev => prev.filter(id => id !== q.id));
                                                }
                                              }}
                                            />
                                            <span>Question {qIdx + 1}: {q.title}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Explanation input */}
                                  <div className="cf-input-group">
                                    <label className="cf-label" style={{ fontWeight: 'bold' }}>Complaint Explanation &amp; Argument: <span style={{ color: '#ef4444' }}>*</span></label>
                                    <textarea
                                      className="cf-input"
                                      rows={4}
                                      value={reevalComplaintText}
                                      onChange={(e) => setReevalComplaintText(e.target.value)}
                                      placeholder="Please explain clearly why you think your response is correct and matches the evaluation criteria..."
                                      style={{ padding: '10px', fontSize: '9pt', fontFamily: 'inherit', resize: 'vertical' }}
                                    />
                                  </div>

                                  {/* Screen proof files upload */}
                                  <div>
                                    <label className="cf-label" style={{ fontWeight: 'bold' }}>Provide Image Proof: (Upload screenshots)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '5px' }}>
                                      <label style={{
                                        padding: '6px 12px',
                                        fontSize: '8.5pt',
                                        fontWeight: 'bold',
                                        backgroundColor: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                      }}>
                                        {reevalUploading ? (
                                          <>
                                            <Loader2 className="spinner" size={14} /> Uploading...
                                          </>
                                        ) : (
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Image size={14} /> Add Screenshot Proof
                                          </span>
                                        )}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          disabled={reevalUploading}
                                          onChange={handleReevalImageUpload}
                                          style={{ display: 'none' }}
                                        />
                                      </label>
                                      <span style={{ fontSize: '8pt', color: '#64748b' }}>PNG, JPG acceptable. Max size 5MB.</span>
                                    </div>

                                    {/* Proof preview grid */}
                                    {reevalProofUrls.length > 0 && (
                                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                                        {reevalProofUrls.map((url, urlIdx) => (
                                          <div key={urlIdx} style={{ position: 'relative', width: '70px', height: '70px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                            <img src={url} alt={`Uploaded proof ${urlIdx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <button
                                              type="button"
                                              onClick={() => setReevalProofUrls(prev => prev.filter((_, idx) => idx !== urlIdx))}
                                              style={{
                                                position: 'absolute',
                                                top: '2px',
                                                right: '2px',
                                                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '16px',
                                                height: '16px',
                                                fontSize: '8px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                              }}
                                            >
                                              
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Actions */}
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '5px' }}>
                                    <button
                                      type="button"
                                      className="cf-btn-secondary"
                                      style={{ padding: '5px 12px', fontSize: '8.5pt' }}
                                      onClick={() => {
                                        setShowReevalForm(false);
                                        setReevalComplaintText('');
                                        setReevalSelectedQuestions([]);
                                        setReevalProofUrls([]);
                                      }}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className="cf-btn-primary"
                                      disabled={reevalSubmitting}
                                      style={{ padding: '5px 15px', fontSize: '8.5pt', fontWeight: 'bold' }}
                                      onClick={() => handleApplyReevalSubmit(sub.id || sub._id)}
                                    >
                                      {reevalSubmitting ? 'Filing Complaint...' : 'Submit Re-evaluation Claim'}
                                    </button>
                                  </div>

                                </div>
                              )}

                            </div>
                          )}

                        </div>

                        {sub.evaluation?.feedback && (
                          <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid #3b5998', padding: '12px 15px', borderRadius: '4px' }}>
                            <h5 style={{ fontSize: '9pt', fontWeight: 'bold', color: '#1e3a8a', margin: '0 0 4px 0' }}>Evaluator Feedback Comments:</h5>
                            <p style={{ fontSize: '9pt', color: '#1e3a8a', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{sub.evaluation.feedback}</p>
                          </div>
                        )}

                        {/* Questions & Responses Details */}
                        <div>
                          <h4 style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold', margin: '0 0 15px 0' }}>Question-wise Evaluation Details:</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {(sub.questions || []).map((q, qIdx) => {
                              const candAns = (sub.answers || []).find(a => String(a.questionId) === String(q.id));
                              
                              return (
                                <div key={qIdx} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                  
                                  {/* Header bar */}
                                  <div style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span>Question {qIdx + 1}:</span>
                                      <RichText text={q.title} style={{ display: 'inline-block' }} />
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      {(() => {
                                        let scored = 0;
                                        if (q.type === 'mcq') {
                                          scored = (candAns && candAns.selectedOptionIndex !== undefined && candAns.selectedOptionIndex !== null)
                                            ? (Number(candAns.selectedOptionIndex) === Number(q.correctOptionIndex) ? q.points : 0)
                                            : 0;
                                        } else {
                                          scored = candAns?.score || 0;
                                        }
                                        
                                        return (
                                          <span style={{
                                            fontSize: '8.5pt',
                                            backgroundColor: scored > 0 ? '#dcfce7' : '#fee2e2',
                                            color: scored > 0 ? '#15803d' : '#b91c1c',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontWeight: 'bold',
                                            border: `1px solid ${scored > 0 ? '#bbf7d0' : '#fecaca'}`
                                          }}>
                                            Scored: {scored} / {q.points || 0} Marks
                                          </span>
                                        );
                                      })()}
                                      <span style={{ fontSize: '8.5pt', backgroundColor: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        Weight: {q.points || 0} Points
                                      </span>
                                    </div>
                                  </div>

                                  {/* Description */}
                                  <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '9pt', lineHeight: '1.5', color: '#333' }}>
                                    
                                    {q.description && (
                                      <RichText
                                        text={q.description}
                                        style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '4px', lineHeight: '1.6' }}
                                      />
                                    )}

                                    {/* MCQ Layout */}
                                    {q.type === 'mcq' && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {q.options?.map((opt, oIdx) => {
                                          const isCorrect = Number(q.correctOptionIndex) === oIdx;
                                          const isSelected = candAns && candAns.selectedOptionIndex !== undefined && candAns.selectedOptionIndex !== null && Number(candAns.selectedOptionIndex) === oIdx;
                                          
                                          let borderCol = '#cbd5e1';
                                          let bgCol = '#fff';
                                          let statusText = '';

                                          if (isCorrect) {
                                            borderCol = '#10b981';
                                            bgCol = '#ecfdf5';
                                            statusText = ' (Correct Answer)';
                                          } else if (isSelected) {
                                            borderCol = '#ef4444';
                                            bgCol = '#fef2f2';
                                            statusText = ' (Your Answer - Incorrect)';
                                          }

                                          if (isCorrect && isSelected) {
                                            statusText = ' (Your Answer - Correct)';
                                          }

                                          return (
                                            <div
                                              key={oIdx}
                                              style={{
                                                padding: '10px 12px',
                                                border: `1px solid ${borderCol}`,
                                                backgroundColor: bgCol,
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                              }}
                                            >
                                              <input
                                                type="radio"
                                                checked={isSelected}
                                                disabled
                                                style={{ cursor: 'default' }}
                                              />
                                              <span style={{ fontWeight: (isCorrect || isSelected) ? 'bold' : 'normal', color: isCorrect ? '#065f46' : isSelected ? '#991b1b' : '#333' }}>
                                                {opt}{statusText}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Coding Layout */}
                                    {q.type === 'coding' && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#64748b' }}>
                                          <span>Submitted Code: (Language: {candAns?.selectedLanguage?.toUpperCase() || 'CPP'})</span>
                                        </div>
                                        <pre style={{
                                          padding: '12px',
                                          backgroundColor: '#1e1e1e',
                                          color: '#d4d4d4',
                                          borderRadius: '4px',
                                          fontFamily: 'Consolas, monospace',
                                          fontSize: '8.5pt',
                                          lineHeight: '1.4',
                                          overflowX: 'auto',
                                          margin: 0
                                        }}>
                                          {candAns?.submittedCode || '// No code response was saved.'}
                                        </pre>

                                        {/* Test Case Execution Output for Candidates */}
                                        {candAns?.testCaseResults && candAns.testCaseResults.length > 0 && (
                                          <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc', padding: '12px' }}>
                                            <h5 style={{ margin: '0 0 10px 0', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <CheckCircle size={14} style={{ color: '#10b981' }} />
                                              <span>Automated Grading Test Cases:</span>
                                            </h5>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                              {candAns.testCaseResults.map((tc, tcIdx) => {
                                                const isPass = tc.status === 'Accepted';
                                                return (
                                                  <div key={tcIdx} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '6px 10px',
                                                    backgroundColor: '#ffffff',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '4px',
                                                    fontSize: '8.5pt'
                                                  }}>
                                                    <span style={{ fontWeight: '500', color: '#334155' }}>
                                                      Test Case {tcIdx + 1}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                      <span style={{
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        fontSize: '7.5pt',
                                                        fontWeight: 'bold',
                                                        backgroundColor: isPass ? '#dcfce7' : '#fee2e2',
                                                        color: isPass ? '#15803d' : '#b91c1c'
                                                      }}>
                                                        {tc.status}
                                                      </span>
                                                      <span style={{ fontWeight: 'bold', color: isPass ? '#166534' : '#991b1b' }}>
                                                        {tc.scoredPoints} / {tc.points} Marks
                                                      </span>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Web Workspace Submitted Answers */}
                                    {q.type === 'web' && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '9pt', color: '#475569' }}>
                                          Your Submitted Web Page Response (HTML/CSS/JS):
                                        </span>
                                        
                                        {/* Tab Switchers */}
                                        <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                          {['html', 'css', 'js', 'preview'].map(tab => (
                                            <button
                                              key={tab}
                                              type="button"
                                              className="cf-btn-secondary"
                                              style={{
                                                padding: '3px 10px',
                                                fontSize: '8pt',
                                                margin: 0,
                                                backgroundColor: (studentActiveWebTabs[q.id] || 'preview') === tab ? '#e2e8f0' : '#ffffff',
                                                fontWeight: (studentActiveWebTabs[q.id] || 'preview') === tab ? 'bold' : 'normal'
                                              }}
                                              onClick={() => setStudentActiveWebTabs(prev => ({ ...prev, [q.id]: tab }))}
                                            >
                                              {tab.toUpperCase()}
                                            </button>
                                          ))}
                                        </div>

                                        {/* Tab Contents */}
                                        {(studentActiveWebTabs[q.id] || 'preview') === 'html' && (
                                          <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {candAns?.submittedHtml || '<!-- No HTML submitted -->'}
                                          </pre>
                                        )}
                                        {(studentActiveWebTabs[q.id] || 'preview') === 'css' && (
                                          <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {candAns?.submittedCss || '/* No CSS submitted */'}
                                          </pre>
                                        )}
                                        {(studentActiveWebTabs[q.id] || 'preview') === 'js' && (
                                          <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {candAns?.submittedJs || '// No JS submitted'}
                                          </pre>
                                        )}
                                        {(studentActiveWebTabs[q.id] || 'preview') === 'preview' && (
                                          <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                            <iframe
                                              title={`Web Sandbox Student Preview ${q.id}`}
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
                                                    <style>${candAns?.submittedCss || ''}</style>
                                                  </head>
                                                  <body>
                                                    ${candAns?.submittedHtml || ''}
                                                    <script>${candAns?.submittedJs || ''}</script>
                                                  </body>
                                                </html>
                                              `}
                                              sandbox="allow-scripts"
                                              style={{ width: '100%', height: '240px', border: 'none', backgroundColor: '#ffffff' }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}

                                  </div>

                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    );
                  })()}

                </div>
              )}

            </div>
          )}

          {/* CONTACT HELPDESK & TICKETS MODULE */}
          {view === 'contact' && studentProfile && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Support Helpdesk</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={`cf-btn-${contactSubView === 'form' ? 'primary' : 'secondary'}`} 
                    onClick={() => { setContactSubView('form'); setContactSuccess(''); setContactError(''); }}
                    style={{ fontSize: '8.5pt', padding: '6px 12px' }}
                  >
                    <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Submit Request
                  </button>
                  <button 
                    className={`cf-btn-${contactSubView === 'history' ? 'primary' : 'secondary'}`} 
                    onClick={() => { setContactSubView('history'); setContactSuccess(''); setContactError(''); fetchStudentTickets(user.id || user._id); }}
                    style={{ fontSize: '8.5pt', padding: '6px 12px' }}
                  >
                    <LifeBuoy size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> My Requests ({studentTickets.length})
                  </button>
                </div>
              </div>

              {contactSubView === 'form' && (
                <div className="cf-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
                  <div className="cf-card-title">Send a Suggestion, Feedback, Complaint, or Open a Ticket</div>
                  
                  {contactSuccess && <div className="cf-alert cf-alert-success" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{contactSuccess}</div>}
                  {contactError && <div className="cf-alert cf-alert-danger" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{contactError}</div>}

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!contactSubject.trim() || !contactMessage.trim()) {
                      setContactError("Please fill out all required fields.");
                      return;
                    }
                    setIsSubmittingContact(true);
                    setContactSuccess('');
                    setContactError('');
                    try {
                      const res = await fetch(`${API_BASE}/candidate/tickets/${user.id || user._id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          category: contactCategory,
                          subject: contactSubject,
                          message: contactMessage
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        setContactSuccess("Your helpdesk request has been successfully submitted!");
                        setContactSubject('');
                        setContactMessage('');
                        fetchStudentTickets(user.id || user._id);
                      } else {
                        setContactError(data.error || "Submission failed.");
                      }
                    } catch (err) {
                      setContactError("Network error. Failed to connect to server.");
                    } finally {
                      setIsSubmittingContact(false);
                    }
                  }}>
                    <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                      <label className="cf-label">Request Category *</label>
                      <select 
                        className="cf-input" 
                        value={contactCategory} 
                        onChange={e => setContactCategory(e.target.value)}
                        required
                      >
                        <option value="suggestion">Suggestion</option>
                        <option value="general_feedback">General Feedback</option>
                        <option value="complaint">Complaint</option>
                        <option value="enquiry">General Enquiry</option>
                        <option value="technical_problem">Technical Problem (Open Ticket)</option>
                      </select>
                    </div>

                    <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                      <label className="cf-label">Subject *</label>
                      <input 
                        type="text" 
                        className="cf-input" 
                        placeholder="Brief summary of your request..."
                        value={contactSubject}
                        onChange={e => setContactSubject(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </div>

                    <div className="cf-input-group" style={{ marginBottom: '20px' }}>
                      <label className="cf-label">Message / Details *</label>
                      <textarea 
                        className="cf-input" 
                        rows="6" 
                        placeholder="Provide details about your query, feedback, or technical issue..."
                        value={contactMessage}
                        onChange={e => setContactMessage(e.target.value)}
                        required
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="cf-btn-primary" 
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      disabled={isSubmittingContact}
                    >
                      {isSubmittingContact ? (
                        <>
                          <Loader2 size={16} className="spinner" /> Submitting Request...
                        </>
                      ) : (
                        contactCategory === 'technical_problem' ? "Open Support Ticket" : "Submit Request"
                      )}
                    </button>
                  </form>
                </div>
              )}

              {contactSubView === 'history' && (
                <div>
                  {studentTickets.length === 0 ? (
                    <div className="cf-card" style={{ padding: '30px', textAlign: 'center', color: '#64748b', borderStyle: 'dashed' }}>
                      <Mail size={40} style={{ color: '#cbd5e1', marginBottom: '10px' }} />
                      <p style={{ margin: 0, fontSize: '9.5pt' }}>You have not submitted any helpdesk requests or support tickets yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {studentTickets.map(t => {
                        const tId = t.id || t._id;
                        let categoryLabel = t.category;
                        if (t.category === 'suggestion') categoryLabel = 'Suggestion';
                        else if (t.category === 'general_feedback') categoryLabel = 'General Feedback';
                        else if (t.category === 'complaint') categoryLabel = 'Complaint';
                        else if (t.category === 'enquiry') categoryLabel = 'Enquiry';
                        else if (t.category === 'technical_problem') categoryLabel = 'Technical Problem';

                        let statusBg = '#f1f5f9';
                        let statusColor = '#475569';
                        if (t.status === 'open') {
                          statusBg = '#eff6ff';
                          statusColor = '#2563eb';
                        } else if (t.status === 'resolved') {
                          statusBg = '#ecfdf5';
                          statusColor = '#059669';
                        } else if (t.status === 'closed') {
                          statusBg = '#f8fafc';
                          statusColor = '#64748b';
                        }

                        return (
                          <div key={tId} className="cf-card" style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                              <div>
                                <span style={{ fontSize: '8pt', color: '#64748b', display: 'block' }}>{new Date(t.createdAt).toLocaleString()}</span>
                                <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '4px 0 0 0' }}>
                                  {t.subject}
                                </h3>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '8pt', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#e2e8f0', color: '#334155', borderRadius: '4px' }}>
                                  {categoryLabel}
                                </span>
                                <span style={{ fontSize: '8pt', fontWeight: 'bold', padding: '2px 8px', backgroundColor: statusBg, color: statusColor, borderRadius: '4px', textTransform: 'uppercase' }}>
                                  {t.status}
                                </span>
                              </div>
                            </div>

                            <p style={{ fontSize: '9pt', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: '1.5', margin: '0 0 15px 0' }}>
                              {t.message}
                            </p>

                            {(t.status === 'resolved' || t.resolutionFeedback) && (
                              <div style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid #10b981', padding: '12px', borderRadius: '4px', marginTop: '10px' }}>
                                <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#065f46', display: 'block', marginBottom: '4px' }}>
                                  Support Resolution Response:
                                </span>
                                <p style={{ fontSize: '9pt', color: '#0f172a', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                  {t.resolutionFeedback || 'This request has been marked as resolved by the portal administrator.'}
                                </p>
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
          )}

          {/* FEEDBACK (MID / END SEMESTER) */}
          {(view === 'midsem' || view === 'endsem') && studentProfile && systemConfig && (() => {
            const isFeedbackSubmitted = feedbackType === 'mid' ? 
              (studentProfile.midSemFeedback && Object.keys(studentProfile.midSemFeedback).length > 0) : 
              (studentProfile.endSemFeedback && Object.keys(studentProfile.endSemFeedback).length > 0);

            const isLedgerUploaded = feedbackType === 'mid' ? 
              !!studentProfile.midSemLedgerUrl : 
              !!studentProfile.endSemLedgerUrl;

            return (
              <div className="cf-card" style={{ padding: '25px' }}>
                <div className="cf-card-title" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                  <span>Course Feedback Survey - {feedbackType === 'mid' ? 'Mid' : 'End'} Semester</span>
                </div>

                {((feedbackType === 'mid' && !systemConfig.midSemFeedbackActive) || (feedbackType === 'end' && !systemConfig.endSemFeedbackActive)) ? (
                  <div className="cf-alert cf-alert-info" style={{ margin: '0' }}>
                    {feedbackType === 'mid' ? 'Mid' : 'End'} Semester Course Feedback is currently closed by the administrator.
                  </div>
                ) : isFeedbackSubmitted ? (
                  /* Completed State: Success Message, No Form */
                  <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px auto' }}>
                      <CheckCircle size={36} style={{ color: '#16a34a' }} />
                    </div>
                    
                    <h2 style={{ fontSize: '15pt', fontWeight: 'bold', color: '#14532d', marginBottom: '10px' }}>
                      Feedback Survey Completed
                    </h2>
                    <p style={{ fontSize: '10pt', color: '#166534', maxWidth: '500px', margin: '0 auto 25px auto', lineHeight: '1.6' }}>
                      You have already successfully completed and submitted your Course Feedback Survey for the {feedbackType === 'mid' ? 'Mid-Semester' : 'End-Semester'} exams. Thank you for your response!
                    </p>

                    <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                      <button 
                        className="cf-btn-primary" 
                        onClick={() => setView('hallticket')}
                        style={{ padding: '10px 24px', fontSize: '10pt', fontWeight: 'bold' }}
                      >
                        Proceed to Hall Ticket &rarr;
                      </button>
                      <button 
                        className="cf-btn-secondary" 
                        onClick={() => setView('announcements')}
                        style={{ padding: '10px 20px', fontSize: '10pt' }}
                      >
                        Back to Dashboard
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Survey Form */
                  <div>
                    <div style={{ marginBottom: '20px', backgroundColor: '#eff6ff', padding: '15px', borderRadius: '6px', borderLeft: '4px solid #3b5998' }}>
                      <p style={{ fontSize: '9.5pt', color: '#1e40af', margin: 0, lineHeight: '1.5' }}>
                        <strong>Feedback Survey Notice:</strong> Please rate your experience across all enrolled course modules. Your honest feedback helps us improve textbook quality, lecture resources, and assignment layout parameters.
                      </p>
                    </div>

                    {feedbackSuccess && <div className="cf-alert cf-alert-success">{feedbackSuccess}</div>}

                    <form onSubmit={handleFeedbackSubmit}>
                      {COURSES_LIST.map((course, cIdx) => (
                        <div key={cIdx} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '25px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', marginBottom: '15px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            📖 {course}
                          </h4>
                          
                          {/* Q1 */}
                          <div className="cf-input-group" style={{ marginBottom: '15px', textAlign: 'left' }}>
                            <label className="cf-label" style={{ fontWeight: '600', color: '#334155' }}>1. Rate the quality of the textbook</label>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', maxWidth: '300px' }}>
                              {[1, 2, 3, 4, 5].map(num => {
                                const isSelected = feedbackAnswers[course]?.[0] === num.toString();
                                let activeColor = '#64748b';
                                if (isSelected) {
                                  if (num === 5) activeColor = '#16a34a';
                                  else if (num === 4) activeColor = '#22c55e';
                                  else if (num === 3) activeColor = '#d97706';
                                  else if (num === 2) activeColor = '#ea580c';
                                  else activeColor = '#dc2626';
                                }
                                return (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleFeedbackValueChange(course, 0, num.toString())}
                                    style={{
                                      flex: '1',
                                      padding: '8px 0',
                                      border: isSelected ? `2px solid ${activeColor}` : '1px solid #cbd5e1',
                                      backgroundColor: isSelected ? `${activeColor}15` : '#fff',
                                      color: isSelected ? activeColor : '#64748b',
                                      fontWeight: 'bold',
                                      fontSize: '10pt',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {num}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Q2 */}
                          <div className="cf-input-group" style={{ marginBottom: '15px', textAlign: 'left' }}>
                            <label className="cf-label" style={{ fontWeight: '600', color: '#334155' }}>2. Rate the usefulness of video lectures</label>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', maxWidth: '300px' }}>
                              {[1, 2, 3, 4, 5].map(num => {
                                const isSelected = feedbackAnswers[course]?.[1] === num.toString();
                                let activeColor = '#64748b';
                                if (isSelected) {
                                  if (num === 5) activeColor = '#16a34a';
                                  else if (num === 4) activeColor = '#22c55e';
                                  else if (num === 3) activeColor = '#d97706';
                                  else if (num === 2) activeColor = '#ea580c';
                                  else activeColor = '#dc2626';
                                }
                                return (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleFeedbackValueChange(course, 1, num.toString())}
                                    style={{
                                      flex: '1',
                                      padding: '8px 0',
                                      border: isSelected ? `2px solid ${activeColor}` : '1px solid #cbd5e1',
                                      backgroundColor: isSelected ? `${activeColor}15` : '#fff',
                                      color: isSelected ? activeColor : '#64748b',
                                      fontWeight: 'bold',
                                      fontSize: '10pt',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {num}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Q3 */}
                          <div className="cf-input-group" style={{ marginBottom: '15px', textAlign: 'left' }}>
                            <label className="cf-label" style={{ fontWeight: '600', color: '#334155' }}>3. Rate the layout and difficulty of Assignments</label>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', maxWidth: '300px' }}>
                              {[1, 2, 3, 4, 5].map(num => {
                                const isSelected = feedbackAnswers[course]?.[2] === num.toString();
                                let activeColor = '#64748b';
                                if (isSelected) {
                                  if (num === 5) activeColor = '#16a34a';
                                  else if (num === 4) activeColor = '#22c55e';
                                  else if (num === 3) activeColor = '#d97706';
                                  else if (num === 2) activeColor = '#ea580c';
                                  else activeColor = '#dc2626';
                                }
                                return (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleFeedbackValueChange(course, 2, num.toString())}
                                    style={{
                                      flex: '1',
                                      padding: '8px 0',
                                      border: isSelected ? `2px solid ${activeColor}` : '1px solid #cbd5e1',
                                      backgroundColor: isSelected ? `${activeColor}15` : '#fff',
                                      color: isSelected ? activeColor : '#64748b',
                                      fontWeight: 'bold',
                                      fontSize: '10pt',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {num}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Q4 */}
                          <div className="cf-input-group" style={{ marginBottom: '15px', textAlign: 'left' }}>
                            <label className="cf-label" style={{ fontWeight: '600', color: '#334155' }}>4. Did the course curriculum meet your expectations?</label>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px', maxWidth: '180px' }}>
                              {['Yes', 'No'].map(opt => {
                                const isSelected = feedbackAnswers[course]?.[3] === opt;
                                const activeColor = opt === 'Yes' ? '#16a34a' : '#dc2626';
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleFeedbackValueChange(course, 3, opt)}
                                    style={{
                                      flex: '1',
                                      padding: '8px 0',
                                      border: isSelected ? `2px solid ${activeColor}` : '1px solid #cbd5e1',
                                      backgroundColor: isSelected ? `${activeColor}15` : '#fff',
                                      color: isSelected ? activeColor : '#64748b',
                                      fontWeight: 'bold',
                                      fontSize: '10pt',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Q5 */}
                          <div className="cf-input-group" style={{ textAlign: 'left' }}>
                            <label className="cf-label" style={{ fontWeight: '600', color: '#334155' }}>5. General Comments / Suggestions</label>
                            <textarea 
                              className="cf-input" 
                              rows="3"
                              placeholder="Type your feedback remarks here..." 
                              value={feedbackAnswers[course]?.[4] || ''} 
                              onChange={e => handleFeedbackValueChange(course, 4, e.target.value)} 
                              style={{ width: '100%', marginTop: '6px', padding: '10px', fontSize: '9.5pt', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                            />
                          </div>
                        </div>
                      ))}
                      
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', textAlign: 'right' }}>
                        <button type="submit" className="cf-btn-primary" style={{ padding: '10px 24px', fontSize: '10pt', fontWeight: 'bold' }}>
                          Submit Course Feedback Survey &rarr;
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })()}

          {/* CODE OF CONDUCT PAGE */}
          {view === 'conduct' && (
            <div className="cf-card">
              <div className="cf-card-title">BICS Course Code of Conduct</div>
              <p style={{ fontSize: '9.5pt', color: '#555', marginBottom: '20px', lineHeight: '1.6' }}>
                All candidates enrolled in the Basic Introductory Computer Science (BICS) Course under the Preliminary Examinations 2026 academic cycle are strictly required to adhere to the following code of academic and professional conduct. By accessing the BICS portal, you consent to these parameters:
              </p>
              
              <div className="cf-form-section">Section 1: Academic Integrity &amp; Originality</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>Candidates must submit only their own independent work for all assignments, practical projects, and exam papers.</li>
                <li>Any form of plagiarism, copying, sharing source code, or copying solutions from peers is strictly prohibited and will result in immediate cancellation of eligibility.</li>
                <li>Use of automated AI coding generators or copying pre-written code without proper citation is strictly forbidden and monitored.</li>
                <li>Sharing login credentials or letting third parties access your BICS portal is a critical violation of student conduct.</li>
              </ul>

              <div className="cf-form-section">⏳ Section 2: Engagement &amp; Timelines</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>Candidates are expected to watch all video lecture modules and read the associated textbook chapters in the sequence provided.</li>
                <li>Assignments must be submitted before the deadlines specified. Requests for extensions require valid medical documentation and admin approval.</li>
                <li>Failure to engage with BICS portal course materials for more than 14 consecutive days without justification may result in account suspension.</li>
                <li>All course registrations, feedback surveys, and exit forms must be completed honestly within active time windows.</li>
              </ul>

              <div className="cf-form-section">Section 3: Professional Communication</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>All interactions on the BICS portal (including course feedback and contact enquiries) must remain constructive, professional, and respectful.</li>
                <li>Harassment, vulgar language, or inappropriate content submission will lead to immediate account suspension and a report to the discipline board.</li>
                <li>Public posting of solutions, leaks, or defamatory comments is strictly forbidden.</li>
              </ul>

              <div className="cf-form-section">Section 4: Examination Ethics &amp; Declaration</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>Downloading the official Hall Ticket requires completing the Malpractice Consent form, certifying compliance with exam rules.</li>
                <li>Any candidate found using unauthorized resources, devices, or communication during the exam will face legal and academic penalties under the Preliminary Examinations 2026 Charter.</li>
                <li>Impersonation or falsifying identification documents during examination validation is classified as a critical offense.</li>
              </ul>

              <div className="cf-form-section">Section 5: Academic Misconduct Procedures</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>Upon reporting a potential breach of code, the administrator will review portal log footprints, uploaded signatures, and source codes.</li>
                <li>A formal warning or suspension notice will be issued. Candidates have 5 working days to present a defense.</li>
                <li>The decision of the Preliminary Examinations 2026 Academic Integrity Board is final and binding for all candidates.</li>
              </ul>

              <div className="cf-form-section">Section 6: User Representation &amp; Documentation</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>All profile uploads (photographs, signature scripts, and signed undertakings) must represent the true legal identity of the candidate.</li>
                <li>Providing false, outdated, or dummy details during registration will trigger an automatic eligibility block.</li>
                <li>Uploaded documents are processed in-memory directly to Cloudinary and remain confidential under data privacy guidelines.</li>
              </ul>
            </div>
          )}

          {/* EXIT FORM PAGE */}
          {view === 'exit' && studentProfile && systemConfig && (
            <div className="cf-card">
              <div className="cf-card-title">BICS Course Exit Questionnaire</div>
              
              {!systemConfig.exitFormActive ? (
                <div className="cf-alert cf-alert-info">
                  Exit form is currently disabled.
                </div>
              ) : studentProfile.exitFormSubmitted ? (
                <div className="cf-alert cf-alert-success">
                  You have successfully submitted your BICS program exit form. Thank you for your feedback!
                </div>
              ) : (
                <div>
                  {exitSuccess && <div className="cf-alert cf-alert-success">{exitSuccess}</div>}
                  <form onSubmit={handleExitSubmit}>
                    <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                      <label className="cf-label">What is your primary reason for exiting the program?</label>
                      <input type="text" className="cf-input" required value={exitAnswers.reason} onChange={e => setExitAnswers({...exitAnswers, reason: e.target.value})} placeholder="Reason for completion/exit" />
                    </div>
                    <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                      <label className="cf-label">Would you recommend the Preliminary Examinations BICS course to others?</label>
                      <input type="text" className="cf-input" required value={exitAnswers.recommendation} onChange={e => setExitAnswers({...exitAnswers, recommendation: e.target.value})} placeholder="Yes/No and reason" />
                    </div>
                    <div className="cf-input-group" style={{ marginBottom: '20px' }}>
                      <label className="cf-label">Overall Program rating (1-10)</label>
                      <select className="cf-input" style={{ maxWidth: '80px' }} value={exitAnswers.rating} onChange={e => setExitAnswers({...exitAnswers, rating: e.target.value})}>
                        {[1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v.toString()}>{v}</option>)}
                      </select>
                    </div>
                    <button type="submit" className="cf-btn-primary">Submit Exit Form</button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* CHANGE PASSWORD VIEW */}
          {view === 'changepassword' && (
            <div className="cf-card" style={{ maxWidth: '400px', margin: '20px auto' }}>
              <div className="cf-card-title">Change Password</div>
              {pwdMessage && <div className="cf-alert cf-alert-success">{pwdMessage}</div>}
              {pwdError && <div className="cf-alert cf-alert-error">{pwdError}</div>}
              <form onSubmit={handleChangePassword}>
                {user.role === 'student' && (
                  <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div style={{ fontSize: '9pt', color: '#475569', marginBottom: '8px' }}>
                      To change your password, you must verify your identity.
                    </div>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', marginBottom: '10px' }}>
                      Email: {studentProfile?.registrationData?.personalEmail || studentProfile?.personalEmail || 'Registered Email'}
                    </div>
                    {!changePasswordCodeSent ? (
                      <button
                        type="button"
                        className="cf-btn-secondary"
                        disabled={sendingChangePasswordCode}
                        onClick={handleSendChangePasswordCode}
                        style={{ fontSize: '8.5pt', padding: '6px 12px' }}
                      >
                        {sendingChangePasswordCode ? "Sending Code..." : "Send Verification Code"}
                      </button>
                    ) : (
                      <div className="cf-input-group" style={{ margin: 0 }}>
                        <label className="cf-label" style={{ fontWeight: 'bold' }}>Enter 6-Digit Email Code</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input
                            type="text"
                            className="cf-input"
                            maxLength={6}
                            required
                            placeholder="e.g. 123456"
                            value={changePasswordEmailCode}
                            onChange={e => setChangePasswordEmailCode(e.target.value.replace(/\D/g, ''))}
                            style={{ flex: '2', letterSpacing: '2px', textAlign: 'center', fontWeight: 'bold' }}
                          />
                          <button
                            type="button"
                            className="cf-btn-secondary"
                            disabled={sendingChangePasswordCode}
                            onClick={handleSendChangePasswordCode}
                            style={{ flex: '1', fontSize: '8pt', padding: '6px' }}
                          >
                            Resend
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                  <label className="cf-label">New Password</label>
                  <input type="password" className="cf-input" required value={pwdForm.newPassword} onChange={e => setPwdForm({...pwdForm, newPassword: e.target.value})} placeholder="At least 4 characters" />
                </div>
                <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                  <label className="cf-label">Confirm New Password</label>
                  <input type="password" className="cf-input" required value={pwdForm.confirmPassword} onChange={e => setPwdForm({...pwdForm, confirmPassword: e.target.value})} />
                </div>

                {/* CAPTCHA Challenge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px', marginTop: '15px' }}>
                  <div style={{
                    letterSpacing: '5px',
                    fontWeight: 'bold',
                    fontSize: '14pt',
                    color: '#3b5998',
                    backgroundColor: '#e8eff7',
                    padding: '6px 12px',
                    border: '1px solid #b9c9fe',
                    fontFamily: 'Courier New, monospace',
                    textDecoration: 'line-through',
                    userSelect: 'none'
                  }}>
                    {changePasswordCaptchaCode}
                  </div>
                  <button type="button" className="cf-btn-secondary" onClick={generateChangePasswordCaptcha} style={{ padding: '3px 8px', fontSize: '8.5pt' }}>
                    Refresh
                  </button>
                </div>
                <div className="cf-input-group" style={{ marginBottom: '20px' }}>
                  <label className="cf-label">Enter Captcha Code</label>
                  <input type="text" className="cf-input" required value={changePasswordCaptchaInput} onChange={e => setChangePasswordCaptchaInput(e.target.value)} placeholder="Case-insensitive" />
                </div>

                <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Update Password</button>
              </form>
            </div>
          )}

          {/* ADMIN VIEW CONTROLS */}
          {view === 'admin' && systemConfig && (
            <div>
              <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Admin Dashboard</h2>
              {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
              {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

              {/* Toggles Panel */}
              <div className="cf-card">
                <div className="cf-card-title">System Settings Controls</div>
                <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="switch">
                      <input type="checkbox" checked={systemConfig.courseRegistrationActive} onChange={e => handleToggleSetting('courseRegistrationActive', e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Course Registrations Active</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="switch">
                      <input type="checkbox" checked={!!systemConfig.midSemFeedbackActive} onChange={e => handleToggleSetting('midSemFeedbackActive', e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Mid Sem Feedback Active</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="switch">
                      <input type="checkbox" checked={!!systemConfig.endSemFeedbackActive} onChange={e => handleToggleSetting('endSemFeedbackActive', e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>End Sem Feedback Active</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="switch">
                      <input type="checkbox" checked={systemConfig.exitFormActive} onChange={e => handleToggleSetting('exitFormActive', e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Exit Form Active</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="switch">
                      <input type="checkbox" checked={!!systemConfig.hallTicketDownloadActive} onChange={e => handleToggleSetting('hallTicketDownloadActive', e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Hall Ticket Downloads Active</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label className="switch">
                      <input type="checkbox" checked={systemConfig ? (systemConfig.onlineExamActive !== false) : true} onChange={e => handleToggleSetting('onlineExamActive', e.target.checked)} />
                      <span className="slider"></span>
                    </label>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Online Practice &amp; Exam Module Active</span>
                  </div>
                </div>
              </div>

              {/* Create Announcement */}
              <div className="cf-card">
                <div className="cf-card-title">Publish System Announcement</div>
                <form onSubmit={handleAddAnnouncement}>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <input type="text" className="cf-input" style={{ flexGrow: 1 }} required value={newAnnouncement} onChange={e => setNewAnnouncement(e.target.value)} placeholder="Type announcement text here..." />
                    <button type="submit" className="cf-btn-primary">Publish</button>
                  </div>
                </form>
              </div>

              {/* Manage Timetable */}
              <div className="cf-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                  <div className="cf-card-title" style={{ margin: 0 }}>Manage Examination Schedule (Mid-Sem / End-Sem)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#475569' }}>Exam Type Selector:</label>
                    <select
                      className="cf-input"
                      style={{ width: '160px', height: '34px', fontSize: '9pt', padding: '5px' }}
                      value={adminExamType}
                      onChange={e => handleUpdateExamType(e.target.value)}
                    >
                      <option value="midsem">Mid Semester</option>
                      <option value="endsem">End Semester</option>
                    </select>
                  </div>
                </div>

                {/* 1. Timetable Notice */}
                <form onSubmit={handleUpdateTimetableNotice} style={{ marginBottom: '25px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid var(--cf-border)' }}>
                  <div className="cf-input-group" style={{ margin: 0 }}>
                    <label className="cf-label">General Timetable Notice (Display Announcement)</label>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <input type="text" className="cf-input" style={{ flexGrow: 1 }} required value={adminTimetableNotice} onChange={e => setAdminTimetableNotice(e.target.value)} />
                      <button type="submit" className="cf-btn-primary">Update Notice</button>
                    </div>
                  </div>
                </form>

                {/* 2. Custom Timetable Creator */}
                <form onSubmit={handleSaveExamTimetable} style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid var(--cf-border)', marginBottom: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>Course Examination Schedule Slots</h3>
                    <button type="button" className="cf-btn-secondary" onClick={handleAddTimetableRow} style={{ padding: '6px 12px', fontSize: '8.5pt' }}>
                      + Add Course Exam Slot
                    </button>
                  </div>
                  
                  <div className="cf-table-container" style={{ marginBottom: '15px' }}>
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Course Code</th>
                          <th>Course Name</th>
                          <th>Exam Date</th>
                          <th>Time Duration Slot</th>
                          <th>Total Marks</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminTimetable.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>No exam slots added yet. Click Add Course Slot to start.</td>
                          </tr>
                        ) : (
                          adminTimetable.map((t, idx) => (
                            <tr key={idx}>
                              <td>
                                <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.code || ''} onChange={e => handleTimetableCellChange(idx, 'code', e.target.value)} placeholder="e.g. CS-101" />
                              </td>
                              <td>
                                <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.course} onChange={e => handleTimetableCellChange(idx, 'course', e.target.value)} placeholder="e.g. C++ Programming" />
                              </td>
                              <td>
                                <input type="date" className="cf-input" style={{ width: '100%' }} required value={t.date} onChange={e => handleTimetableCellChange(idx, 'date', e.target.value)} />
                              </td>
                              <td>
                                <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.time} onChange={e => handleTimetableCellChange(idx, 'time', e.target.value)} placeholder="e.g. 10:00 AM - 01:00 PM" />
                              </td>
                              <td>
                                <input type="number" className="cf-input" style={{ width: '100%' }} required value={t.marks !== undefined ? t.marks : 50} onChange={e => handleTimetableCellChange(idx, 'marks', parseInt(e.target.value) || 0)} />
                              </td>
                              <td>
                                <button type="button" className="cf-btn-primary" style={{ color: '#ef4444', borderColor: '#ef4444', backgroundColor: '#fff', padding: '4px 10px', fontSize: '8.5pt', margin: 0 }} onClick={() => handleRemoveTimetableRow(idx)}>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button type="submit" className="cf-btn-primary">Save Course Timetable Dates</button>
                </form>
              </div>

              {/* Manage Class Tests Scheduler */}
              <div className="cf-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                  <div className="cf-card-title" style={{ margin: 0 }}>Manage Class Tests Schedule</div>
                  <button type="button" className="cf-btn-secondary" onClick={handleAddClassTestRow} style={{ padding: '6px 12px', fontSize: '8.5pt' }}>
                    + Schedule New Class Test
                  </button>
                </div>

                <form onSubmit={handleSaveClassTests} style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid var(--cf-border)' }}>
                  <div className="cf-table-container" style={{ marginBottom: '15px' }}>
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Course Name</th>
                          <th>Topic / Module Details</th>
                          <th>Scheduled Date</th>
                          <th>Time Slot</th>
                          <th>Marks</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminClassTests.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>No class tests scheduled yet. Click Schedule Class Test to start.</td>
                          </tr>
                        ) : (
                          adminClassTests.map((t, idx) => (
                            <tr key={idx}>
                              <td>
                                <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.courseName} onChange={e => handleClassTestCellChange(idx, 'courseName', e.target.value)} placeholder="Course Name" />
                              </td>
                              <td>
                                <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.topic} onChange={e => handleClassTestCellChange(idx, 'topic', e.target.value)} placeholder="Topic e.g. Recursion" />
                              </td>
                              <td>
                                <input type="date" className="cf-input" style={{ width: '100%' }} required value={t.date} onChange={e => handleClassTestCellChange(idx, 'date', e.target.value)} />
                              </td>
                              <td>
                                <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.time} onChange={e => handleClassTestCellChange(idx, 'time', e.target.value)} placeholder="e.g. 09:00 AM - 10:00 AM" />
                              </td>
                              <td>
                                <input type="number" className="cf-input" style={{ width: '100%' }} required value={t.marks} onChange={e => handleClassTestCellChange(idx, 'marks', parseInt(e.target.value) || 0)} />
                              </td>
                              <td>
                                <button type="button" className="cf-btn-primary" style={{ color: '#ef4444', borderColor: '#ef4444', backgroundColor: '#fff', padding: '4px 10px', fontSize: '8.5pt', margin: 0 }} onClick={() => handleRemoveClassTestRow(idx)}>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button type="submit" className="cf-btn-primary">Save Class Tests Schedule</button>
                </form>
              </div>
            </div>
          )}

          {/* ADMIN - CANDIDATES VIEW */}
          {view === 'admin_candidates' && systemConfig && (
            <div>
              <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Candidates Manager</h2>
              {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
              {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

              {/* Register Candidate Form */}
              <div className="cf-card">
                <div className="cf-card-title">Register New Candidate</div>
                <form onSubmit={handleRegisterCandidateByAdmin} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">Student ID</label>
                    <input type="text" className="cf-input" required value={newCandidate.studentId} onChange={e => setNewCandidate({...newCandidate, studentId: e.target.value})} placeholder="e.g. STU1001" />
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">Full Name</label>
                    <input type="text" className="cf-input" required value={newCandidate.name} onChange={e => setNewCandidate({...newCandidate, name: e.target.value})} placeholder="Legal student name" />
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">Username</label>
                    <input type="text" className="cf-input" required value={newCandidate.username} onChange={e => setNewCandidate({...newCandidate, username: e.target.value})} />
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">Password</label>
                    <input type="text" className="cf-input" required value={newCandidate.password} onChange={e => setNewCandidate({...newCandidate, password: e.target.value})} />
                  </div>
                  <div className="cf-input-group" style={{ justifyContent: 'center' }}>
                    <label className="checkbox-label" style={{ display: 'flex', gap: '10px', fontSize: '9pt', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newCandidate.eligible} onChange={e => setNewCandidate({...newCandidate, eligible: e.target.checked})} />
                      Set Eligible
                    </label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Register Student</button>
                  </div>
                </form>
              </div>

              {/* Candidates Table */}
              <div className="cf-card">
                <div className="cf-card-title">Registered Candidates List ({candidatesList.length})</div>
                <div className="cf-table-container">
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Password</th>
                        <th>Registration</th>
                        <th>Malpractice Consent</th>
                        <th>Exam Eligibility</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidatesList.map((c, idx) => (
                        <tr key={idx}>
                          <td>{c.studentId}</td>
                          <td style={{ fontWeight: '600' }}>{c.name}</td>
                          <td>{c.username}</td>
                          <td><code>{c.password}</code></td>
                          <td>
                            {c.registrationSubmitted ? (
                              <div>
                                <span style={{ fontSize: '8pt', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px' }}>Submitted</span><br />
                                <span className={`status-badge ${c.registrationStatus === 'Approved' ? 'status-eligible' : c.registrationStatus === 'Rejected' ? 'status-ineligible' : ''}`} style={{ fontSize: '7.5pt', padding: '1px 4px' }}>
                                  {c.registrationStatus || 'Pending'}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '8pt', backgroundColor: '#fee2e2', padding: '2px 6px', borderRadius: '4px', color: '#b91c1c' }}>Pending Form</span>
                            )}
                          </td>
                          <td style={{ fontSize: '8pt', lineHeight: '1.3' }}>
                            <div>Mid: <span style={{ fontWeight: 'bold', color: c.midSemConsentSigned ? '#16a34a' : '#ef4444' }}>{c.midSemConsentSigned ? "Yes" : "No"}</span></div>
                            <div>End: <span style={{ fontWeight: 'bold', color: c.endSemConsentSigned ? '#16a34a' : '#ef4444' }}>{c.endSemConsentSigned ? "Yes" : "No"}</span></div>
                          </td>
                          <td>
                            <button className={`cf-btn-secondary ${c.eligible ? 'status-eligible' : 'status-ineligible'}`} style={{ border: 'none', padding: '4px 8px', fontSize: '8pt' }} onClick={() => handleToggleEligibility(c.id || c._id, c.eligible)}>
                              {c.eligible ? "Eligible" : "Ineligible"}
                            </button>
                          </td>
                          <td>
                            <button className="cf-btn-secondary" style={{ padding: '4px 8px', fontSize: '8.5pt' }} onClick={() => setSelectedCandidate(c)}>
                              Inspect File
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN - COURSEWORK VIEW */}
          {view === 'admin_coursework' && systemConfig && (
            <div>
              <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Coursework Content Manager</h2>
              {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
              {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

              {/* ADMIN - MANAGE COURSE VIDEO LECTURES */}
              <div className="cf-card">
                <div className="cf-card-title">Course Video Lectures Manager</div>
                {courseworkSuccess && <div className="cf-alert cf-alert-success">{courseworkSuccess}</div>}
                {courseworkError && <div className="cf-alert cf-alert-error">{courseworkError}</div>}
                
                {/* Add Lecture Form */}
                <form onSubmit={handleAddLecture} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #cbd5e1' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">Course Section Name</label>
                    <input
                      type="text"
                      className="cf-input"
                      required
                      value={newLecture.section}
                      onChange={e => setNewLecture({...newLecture, section: e.target.value})}
                      placeholder="e.g. Programming with C++"
                    />
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">Lecture Title</label>
                    <input
                      type="text"
                      className="cf-input"
                      required
                      value={newLecture.title}
                      onChange={e => setNewLecture({...newLecture, title: e.target.value})}
                      placeholder="e.g. Lecture 1: Introduction"
                    />
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">YouTube URL Link</label>
                    <input
                      type="text"
                      className="cf-input"
                      required
                      value={newLecture.youtubeUrl}
                      onChange={e => setNewLecture({...newLecture, youtubeUrl: e.target.value})}
                      placeholder="e.g. https://www.youtube.com/watch?v=..."
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Add Lecture</button>
                  </div>
                </form>

                {/* Lectures List Table */}
                <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Active Video Lectures ({videoLectures.length})</h4>
                {videoLectures.length === 0 ? (
                  <div className="cf-alert cf-alert-info">No lectures added.</div>
                ) : (
                  <div className="cf-table-container">
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>Lecture Title</th>
                          <th>YouTube Link</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videoLectures.map((l, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 'bold' }}>{l.section}</td>
                            <td>{l.title}</td>
                            <td>
                              <a href={l.youtubeUrl} target="_blank" rel="noreferrer" style={{ fontSize: '8.5pt', color: '#3b5998', textDecoration: 'underline' }}>
                                View Link
                              </a>
                            </td>
                            <td>
                              <button
                                className="cf-btn-secondary"
                                style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                                onClick={() => handleDeleteLecture(l.id || l._id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ADMIN - MANAGE COURSE MATERIALS */}
              <div className="cf-card">
                <div className="cf-card-title">Course Study Materials Manager</div>
                
                {/* Add Material Form */}
                <form onSubmit={handleAddMaterial} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #cbd5e1' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">Material Section (Select or Type Custom)</label>
                    <input
                      type="text"
                      className="cf-input"
                      required
                      value={newMaterial.section}
                      onChange={e => setNewMaterial({...newMaterial, section: e.target.value})}
                      placeholder="e.g. Curriculum, Textbooks, Assignments..."
                      list="material-sections-list"
                    />
                    <datalist id="material-sections-list">
                      <option value="Curriculum" />
                      <option value="Textbooks" />
                      <option value="External" />
                      <option value="Assignments" />
                      <option value="Practicals" />
                    </datalist>
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">Material Title</label>
                    <input
                      type="text"
                      className="cf-input"
                      required
                      value={newMaterial.title}
                      onChange={e => setNewMaterial({...newMaterial, title: e.target.value})}
                      placeholder="e.g. BICS C++ Syllabus"
                    />
                  </div>
                  <div className="cf-input-group">
                    <label className="cf-label">Document File Upload</label>
                    <input
                      type="file"
                      className="cf-input"
                      required
                      onChange={e => setMaterialFile(e.target.files[0])}
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Upload &amp; Add Material</button>
                  </div>
                </form>

                {/* Materials List Table */}
                <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Active Course Materials ({courseMaterials.length})</h4>
                {courseMaterials.length === 0 ? (
                  <div className="cf-alert cf-alert-info">No materials added.</div>
                ) : (
                  <div className="cf-table-container">
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>Material Name</th>
                          <th>File/Link Path</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseMaterials.map((m, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 'bold' }}>{m.section}</td>
                            <td>{m.title}</td>
                            <td>
                              <a href={m.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '8.5pt', color: '#3b5998', textDecoration: 'underline' }}>
                                View File
                              </a>
                            </td>
                            <td>
                              <button
                                className="cf-btn-secondary"
                                style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                                onClick={() => handleDeleteMaterial(m.id || m._id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ADMIN - TESTS VIEW */}
          {view === 'admin_tests' && systemConfig && (
            <div>
              <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Exam &amp; Tests Manager</h2>
              {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
              {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

              {/* ADMIN - ONLINE TEST CREATOR & BUILDER */}
              <div className="cf-card">
                <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={18} style={{ color: '#3b82f6' }} />
                  <span>Online Test Configurations Manager</span>
                </div>
                
                {/* Active Test Configurations */}
                <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Configured Examinations ({adminTests.length})</h4>
                {adminTests.length === 0 ? (
                  <div className="cf-alert cf-alert-info">No test configurations created yet.</div>
                ) : (
                  <div className="cf-table-container" style={{ marginBottom: '20px' }}>
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Exam Title</th>
                          <th>Duration</th>
                          <th>Access Window</th>
                          <th>Questions</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminTests.map((t, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 'bold' }}>{t.title}</td>
                            <td>{t.duration} mins</td>
                            <td style={{ fontSize: '8.5pt', color: '#555' }}>
                              {new Date(t.startDate).toLocaleString()} - <br />{new Date(t.endDate).toLocaleString()}
                            </td>
                            <td>{t.questions?.length || 0} items</td>
                            <td>
                              <div style={{ display: 'flex', gap: '5px' }}>
                                <button
                                  className="cf-btn-primary"
                                  style={{ padding: '3px 8px', fontSize: '8pt' }}
                                  onClick={() => {
                                    fetchExamSubmissions(t.id || t._id);
                                    setTimeout(() => {
                                      document.getElementById('admin-submissions-section')?.scrollIntoView({ behavior: 'smooth' });
                                    }, 100);
                                  }}
                                >
                                  Grades ({t.submissionsCount || 'View'})
                                </button>
                                <button
                                  className="cf-btn-primary"
                                  style={{ 
                                    padding: '3px 8px', 
                                    fontSize: '8pt', 
                                    background: t.answersReleased ? '#10b981' : '#64748b', 
                                    borderColor: t.answersReleased ? '#10b981' : '#64748b',
                                    color: '#ffffff' 
                                  }}
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`${API_BASE}/admin/tests/toggle-release/${t.id || t._id}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' }
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        fetchAdminTests();
                                      } else {
                                        alert(data.error || "Failed to toggle answer sheet release state.");
                                      }
                                    } catch (e) {
                                      alert("Network Error: Unable to contact API server.");
                                    }
                                  }}
                                >
                                  {t.answersReleased ? 'Released' : 'Release Sheets'}
                                </button>
                                <button
                                  className="cf-btn-primary"
                                  style={{ 
                                    padding: '3px 8px', 
                                    fontSize: '8pt', 
                                    background: t.isPublished ? '#10b981' : '#64748b', 
                                    borderColor: t.isPublished ? '#10b981' : '#64748b',
                                    color: '#ffffff',
                                    cursor: 'pointer'
                                  }}
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`${API_BASE}/admin/tests/toggle-publish/${t.id || t._id}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' }
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        fetchAdminTests();
                                        fetchStudentActiveTests();
                                      } else {
                                        alert(data.error || "Failed to toggle display status.");
                                      }
                                    } catch (e) {
                                      alert("Network Error: Unable to contact API server.");
                                    }
                                  }}
                                >
                                  {t.isPublished ? 'Displayed' : 'Display Test'}
                                </button>
                                <button
                                  className="cf-btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '8pt' }}
                                  onClick={() => handleEditTest(t)}
                                >
                                  Edit Config
                                </button>
                                <button
                                  className="cf-btn-secondary"
                                  style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                                  onClick={() => handleDeleteTest(t.id || t._id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  type="button"
                  className="cf-btn-primary"
                  onClick={() => {
                    if (showTestCreator) {
                      setEditingTestConfigId(null);
                      setNewExamTitle('');
                      setNewExamMarks(100);
                      setNewExamInstructions('');
                      setNewExamDuration(60);
                      setNewExamStart('');
                      setNewExamEnd('');
                      setNewExamQuestions([]);
                      setCreatorStep(1);
                      setEditingQuestionIdx(null);
                    }
                    setShowTestCreator(!showTestCreator);
                  }}
                  style={{ marginBottom: '15px' }}
                >
                  {showTestCreator 
                    ? (editingTestConfigId ? 'Cancel Edit Mode' : 'Hide Exam Builder Form') 
                    : (editingTestConfigId ? 'Edit Configuration Form' : '+ Create New Online Test Configuration')
                  }
                </button>

                {showTestCreator && (
                  <div id="admin-test-creator-section" style={{ borderTop: '1px solid #cbd5e1', paddingTop: '20px', marginTop: '20px' }}>
                    {/* Stepper Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', backgroundColor: '#f1f5f9', padding: '12px 20px', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', gap: '30px', alignItems: 'center', width: '100%', justifyContent: 'space-around' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: creatorStep === 1 ? '#3b82f6' : '#64748b', fontWeight: creatorStep === 1 ? 'bold' : 'normal' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: creatorStep === 1 ? '#3b82f6' : '#cbd5e1', color: '#fff', fontSize: '9pt' }}>1</span>
                          <span>Details &amp; Schedule</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: creatorStep === 2 ? '#3b82f6' : '#64748b', fontWeight: creatorStep === 2 ? 'bold' : 'normal' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: creatorStep === 2 ? '#3b82f6' : '#cbd5e1', color: '#fff', fontSize: '9pt' }}>2</span>
                          <span>Questions Config ({newExamQuestions.length})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: creatorStep === 3 ? '#3b82f6' : '#64748b', fontWeight: creatorStep === 3 ? 'bold' : 'normal' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: creatorStep === 3 ? '#3b82f6' : '#cbd5e1', color: '#fff', fontSize: '9pt' }}>3</span>
                          <span>Review &amp; Publish</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 1: Details & Schedule */}
                    {creatorStep === 1 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                          <div className="cf-input-group">
                            <label className="cf-label">Test Title</label>
                            <input
                              type="text"
                              className="cf-input"
                              value={newExamTitle}
                              onChange={e => setNewExamTitle(e.target.value)}
                              placeholder="e.g. BICS Mid Semester Coding Test"
                            />
                          </div>
                          <div className="cf-input-group">
                            <label className="cf-label">Time Duration (Minutes)</label>
                            <input
                              type="number"
                              className="cf-input"
                              value={newExamDuration}
                              onChange={e => setNewExamDuration(Number(e.target.value))}
                            />
                          </div>
                          <div className="cf-input-group">
                            <label className="cf-label">Total Marks</label>
                            <input
                              type="number"
                              className="cf-input"
                              value={newExamMarks}
                              onChange={e => setNewExamMarks(Number(e.target.value))}
                            />
                          </div>
                        </div>

                        <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                          <div className="cf-input-group">
                            <label className="cf-label">Starting Access Time</label>
                            <input
                              type="datetime-local"
                              className="cf-input"
                              value={newExamStart}
                              onChange={e => setNewExamStart(e.target.value)}
                            />
                          </div>
                          <div className="cf-input-group">
                            <label className="cf-label">Ending Access Time</label>
                            <input
                              type="datetime-local"
                              className="cf-input"
                              value={newExamEnd}
                              onChange={e => setNewExamEnd(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Initial Candidate Instructions (Markdown Supported)</label>
                          <textarea
                            className="cf-input"
                            rows="4"
                            value={newExamInstructions}
                            onChange={e => setNewExamInstructions(e.target.value)}
                            placeholder="Write pre-test guidelines and code rules here..."
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                          <button type="button" className="cf-btn-secondary" onClick={() => setShowTestCreator(false)}>Cancel</button>
                          <button
                            type="button"
                            className="cf-btn-primary"
                            onClick={() => {
                              if (!newExamTitle || !newExamStart || !newExamEnd) {
                                alert("Please configure Test Title and Access Window dates before continuing.");
                                return;
                              }
                              setCreatorStep(2);
                            }}
                          >
                            Next: Configure Questions
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Questions Editor */}
                    {creatorStep === 2 && (
                      <div>
                        {editingQuestionIdx !== null ? (
                          /* Question Editor Sub-Workspace */
                          <div style={{ border: '1px solid #cbd5e1', padding: '20px', borderRadius: '6px', backgroundColor: '#ffffff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                              <h4 style={{ margin: 0, color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileEdit size={16} /> Edit Question Details (Q{editingQuestionIdx + 1})
                              </h4>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ margin: 0, padding: '4px 10px', fontSize: '8pt' }}
                                onClick={() => setEditingQuestionIdx(null)}
                              >
                                Back to Question Pool
                              </button>
                            </div>

                             <div className="cf-form-grid" style={{ gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr', gap: '15px', marginBottom: '15px' }}>
                              <div className="cf-input-group">
                                <label className="cf-label">Question Title</label>
                                <input
                                  type="text"
                                  className="cf-input"
                                  value={newExamQuestions[editingQuestionIdx]?.title || ''}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].title = e.target.value;
                                    setNewExamQuestions(updated);
                                  }}
                                  placeholder="Enter question task short summary"
                                />
                              </div>
                              <div className="cf-input-group">
                                <label className="cf-label">Section Name (Customizable)</label>
                                <input
                                  type="text"
                                  className="cf-input"
                                  value={newExamQuestions[editingQuestionIdx]?.section || ''}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].section = e.target.value;
                                    setNewExamQuestions(updated);
                                  }}
                                  placeholder="e.g. Section A: Theory"
                                />
                              </div>
                              <div className="cf-input-group">
                                <label className="cf-label">Question Type</label>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                  {[
                                    { value: 'mcq', label: 'MCQ' },
                                    { value: 'coding', label: 'C++ Coding' },
                                    { value: 'web', label: 'Web Coding' }
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => {
                                        const updated = [...newExamQuestions];
                                        const nextType = opt.value;
                                        updated[editingQuestionIdx].type = nextType;
                                        if (nextType === 'mcq') {
                                          updated[editingQuestionIdx].options = ['Option A', 'Option B', 'Option C', 'Option D'];
                                          updated[editingQuestionIdx].correctOptionIndex = 0;
                                        } else if (nextType === 'coding') {
                                          updated[editingQuestionIdx].description = 'Solve the problem.';
                                          updated[editingQuestionIdx].initialTemplate = '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}';
                                          updated[editingQuestionIdx].language = 'cpp';
                                          updated[editingQuestionIdx].testCases = [{ input: '', output: '', isSample: true, points: 10 }];
                                        } else if (nextType === 'web') {
                                          updated[editingQuestionIdx].description = 'Create a webpage.';
                                          updated[editingQuestionIdx].initialHtml = '<h1>Hello World</h1>';
                                          updated[editingQuestionIdx].initialCss = 'h1 {\n  color: red;\n}';
                                          updated[editingQuestionIdx].initialJs = '// Write script here';
                                        }
                                        setNewExamQuestions(updated);
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '7px 10px',
                                        fontSize: '8.5pt',
                                        fontWeight: 'bold',
                                        borderRadius: '4px',
                                        border: '1px solid',
                                        borderColor: newExamQuestions[editingQuestionIdx]?.type === opt.value ? '#3b5998' : '#cbd5e1',
                                        backgroundColor: newExamQuestions[editingQuestionIdx]?.type === opt.value ? '#eff6ff' : '#ffffff',
                                        color: newExamQuestions[editingQuestionIdx]?.type === opt.value ? '#3b5998' : '#64748b',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        textAlign: 'center'
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="cf-input-group">
                                <label className="cf-label">Points Allocation</label>
                                <input
                                  type="number"
                                  className="cf-input"
                                  value={newExamQuestions[editingQuestionIdx]?.points || 0}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].points = Number(e.target.value);
                                    setNewExamQuestions(updated);
                                  }}
                                />
                              </div>
                            </div>

                            {/* Image Uploader */}
                            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                              <label className="cf-label">Reference Image (Optional)</label>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  id={`q-img-upload-wizard`}
                                  onChange={e => handleUploadQuestionImage(e, editingQuestionIdx)}
                                />
                                <label
                                  htmlFor={`q-img-upload-wizard`}
                                  className="cf-btn-secondary"
                                  style={{
                                    margin: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 14px',
                                    fontSize: '8.5pt',
                                    fontWeight: 'bold',
                                    color: '#3b5998',
                                    border: '1px dashed #3b5998',
                                    backgroundColor: '#f0f4ff',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseOver={e => {
                                    e.currentTarget.style.backgroundColor = '#e0e9ff';
                                  }}
                                  onMouseOut={e => {
                                    e.currentTarget.style.backgroundColor = '#f0f4ff';
                                  }}
                                >
                                  <Upload size={14} /> {imageUploadingIdx === editingQuestionIdx ? 'Uploading...' : 'Upload Image'}
                                </label>
                                <input
                                  type="text"
                                  className="cf-input"
                                  placeholder="Or paste direct image URL here"
                                  value={newExamQuestions[editingQuestionIdx]?.imageUrl || ''}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].imageUrl = e.target.value;
                                    setNewExamQuestions(updated);
                                  }}
                                />
                              </div>
                              {newExamQuestions[editingQuestionIdx]?.imageUrl && (
                                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <img
                                    src={newExamQuestions[editingQuestionIdx].imageUrl}
                                    alt="Wizard Preview"
                                    style={{ maxWidth: '100px', maxHeight: '60px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                  />
                                  <button
                                    type="button"
                                    className="cf-btn-secondary"
                                    style={{ padding: '2px 8px', fontSize: '8pt', color: '#ef4444', borderColor: '#ef4444' }}
                                    onClick={() => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].imageUrl = '';
                                      setNewExamQuestions(updated);
                                    }}
                                  >
                                    Remove Image
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* MCQ Sub-Form */}
                            {newExamQuestions[editingQuestionIdx]?.type === 'mcq' && (
                              <div style={{ marginTop: '15px', padding: '15px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                                <label className="cf-label" style={{ fontWeight: 'bold' }}>MCQ Options &amp; Correct Answer Key:</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
                                  {newExamQuestions[editingQuestionIdx]?.options.map((opt, oIdx) => (
                                    <div key={oIdx} className="cf-input-group">
                                      <label className="cf-label">Option {oIdx + 1}</label>
                                      <input
                                        type="text"
                                        className="cf-input"
                                        value={opt}
                                        onChange={e => {
                                          const updated = [...newExamQuestions];
                                          updated[editingQuestionIdx].options[oIdx] = e.target.value;
                                          setNewExamQuestions(updated);
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="cf-input-group" style={{ marginTop: '15px' }}>
                                  <label className="cf-label">Correct Option Index</label>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px', maxWidth: '400px' }}>
                                    {[0, 1, 2, 3].map((num) => (
                                      <button
                                        key={num}
                                        type="button"
                                        onClick={() => {
                                          const updated = [...newExamQuestions];
                                          updated[editingQuestionIdx].correctOptionIndex = num;
                                          setNewExamQuestions(updated);
                                        }}
                                        style={{
                                          flex: 1,
                                          padding: '6px 12px',
                                          fontSize: '8.5pt',
                                          fontWeight: 'bold',
                                          borderRadius: '4px',
                                          border: '1px solid',
                                          borderColor: newExamQuestions[editingQuestionIdx]?.correctOptionIndex === num ? '#10b981' : '#cbd5e1',
                                          backgroundColor: newExamQuestions[editingQuestionIdx]?.correctOptionIndex === num ? '#ecfdf5' : '#ffffff',
                                          color: newExamQuestions[editingQuestionIdx]?.correctOptionIndex === num ? '#10b981' : '#64748b',
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease',
                                          textAlign: 'center'
                                        }}
                                      >
                                        Option {num + 1}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* C++ Coding Sub-Form */}
                            {newExamQuestions[editingQuestionIdx]?.type === 'coding' && (
                              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div className="cf-input-group">
                                  <label className="cf-label">Problem Task Description (Markdown Guidelines)</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    value={newExamQuestions[editingQuestionIdx]?.description || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].description = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                    placeholder="Explain C++ coding rules, specifications, and stdin inputs format details..."
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Preloaded Code Editor Template</label>
                                  <textarea
                                    className="cf-input"
                                    rows="5"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialTemplate || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialTemplate = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>

                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <label className="cf-label" style={{ fontWeight: 'bold', margin: 0 }}>C++ Test Cases Configurations:</label>
                                    <button
                                      type="button"
                                      className="cf-btn-secondary"
                                      style={{ fontSize: '8pt', padding: '4px 10px', margin: 0 }}
                                      onClick={() => {
                                        const updated = [...newExamQuestions];
                                        updated[editingQuestionIdx].testCases = updated[editingQuestionIdx].testCases || [];
                                        updated[editingQuestionIdx].testCases.push({ input: '', output: '', isSample: true, points: 10 });
                                        setNewExamQuestions(updated);
                                      }}
                                    >
                                      + Add Test Case
                                    </button>
                                  </div>

                                  {(!newExamQuestions[editingQuestionIdx]?.testCases || newExamQuestions[editingQuestionIdx]?.testCases.length === 0) ? (
                                    <div style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic', padding: '15px', border: '1px dashed #cbd5e1', borderRadius: '4px', textAlign: 'center' }}>
                                      No test cases configured. At least one test case is required to compile and grade code.
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                      {newExamQuestions[editingQuestionIdx]?.testCases.map((tc, tcIdx) => (
                                        <div key={tcIdx} style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '12px', backgroundColor: '#f8fafc' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e293b' }}>
                                              Test Case #{tcIdx + 1} {!tc.isSample && <span style={{ marginLeft: '6px', fontSize: '7.5pt', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Lock size={10} /> Hidden</span>}
                                            </span>
                                            <button
                                              type="button"
                                              className="cf-btn-secondary"
                                              style={{ fontSize: '8pt', padding: '2px 8px', color: '#dc2626', borderColor: '#fca5a5', margin: 0 }}
                                              onClick={() => {
                                                const updated = [...newExamQuestions];
                                                updated[editingQuestionIdx].testCases.splice(tcIdx, 1);
                                                setNewExamQuestions(updated);
                                              }}
                                            >
                                              Delete Case
                                            </button>
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                                            <div className="cf-input-group">
                                              <label className="cf-label" style={{ fontSize: '7.5pt' }}>Input (stdin)</label>
                                              <textarea
                                                className="cf-input"
                                                rows="2"
                                                style={{ fontFamily: 'monospace', fontSize: '8.5pt' }}
                                                value={tc.input || ''}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].input = e.target.value;
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                            </div>
                                            <div className="cf-input-group">
                                              <label className="cf-label" style={{ fontSize: '7.5pt' }}>Expected Output (stdout)</label>
                                              <textarea
                                                className="cf-input"
                                                rows="2"
                                                style={{ fontFamily: 'monospace', fontSize: '8.5pt' }}
                                                value={tc.output || ''}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].output = e.target.value;
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8pt', color: '#475569', cursor: 'pointer' }}>
                                              <input
                                                type="checkbox"
                                                checked={!!tc.isSample}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].isSample = e.target.checked;
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                              Is Sample Case? (Visible to student running code)
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <label className="cf-label" style={{ fontSize: '8pt', margin: 0 }}>Points:</label>
                                              <input
                                                type="number"
                                                className="cf-input"
                                                style={{ width: '60px', padding: '4px', fontSize: '8.5pt', height: '24px' }}
                                                value={tc.points || 10}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].points = Number(e.target.value);
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* HTML/CSS/JS Web Coding Sub-Form */}
                            {newExamQuestions[editingQuestionIdx]?.type === 'web' && (
                              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div className="cf-input-group">
                                  <label className="cf-label">Web Problem Description &amp; Requirements</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    value={newExamQuestions[editingQuestionIdx]?.description || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].description = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                    placeholder="Explain page formatting, DOM elements requirements, styling specifications..."
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Initial HTML Template Code</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialHtml || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialHtml = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Initial CSS Template Code</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialCss || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialCss = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Initial JavaScript Template Code</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialJs || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialJs = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                              <button
                                type="button"
                                className="cf-btn-primary"
                                onClick={() => setEditingQuestionIdx(null)}
                              >
                                Save &amp; Return to List
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Questions List View (Step 2 Main Panel) */
                          <div style={{ border: '1px solid #cbd5e1', padding: '18px', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                              <h4 style={{ margin: 0, color: '#002147', fontWeight: 'bold' }}>Questions Pool Configurator</h4>
                              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold' }}>
                                Total Points: {newExamQuestions.reduce((acc, curr) => acc + (curr.points || 0), 0)} / {newExamMarks}
                              </div>
                            </div>

                            {newExamQuestions.length === 0 ? (
                              <div style={{ border: '1px dashed #cbd5e1', padding: '30px 15px', borderRadius: '6px', textAlign: 'center', backgroundColor: '#fff', marginBottom: '20px' }}>
                                <HelpCircle size={32} style={{ color: '#94a3b8', margin: '0 auto 10px auto' }} />
                                <p style={{ fontSize: '9.5pt', color: '#64748b', margin: 0 }}>No questions added to this test configuration yet.</p>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                                {newExamQuestions.map((q, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 15px', backgroundColor: '#ffffff' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '8pt', backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                                          {q.type.toUpperCase()}
                                        </span>
                                        <strong style={{ fontSize: '9.5pt', color: '#1e293b' }}>Q{idx + 1}: {q.title}</strong>
                                      </div>
                                      <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
                                        Value: {q.points} points
                                        {q.type === 'coding' && ` | ${q.testCases?.length || 0} C++ testcases`}
                                        {q.type === 'web' && ` | HTML/CSS/JS (Manual Grade)`}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <button
                                        type="button"
                                        className="cf-btn-primary"
                                        style={{ padding: '4px 10px', fontSize: '8pt', margin: 0 }}
                                        onClick={() => setEditingQuestionIdx(idx)}
                                      >
                                        Configure
                                      </button>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '4px 10px', fontSize: '8pt', color: '#dc2626', borderColor: '#fca5a5', margin: 0 }}
                                        onClick={() => {
                                          setNewExamQuestions(prev => prev.filter((_, qIdx) => qIdx !== idx));
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Question Creator Triggers */}
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }}
                                onClick={() => {
                                  const newQ = {
                                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                    type: 'mcq',
                                    title: 'New MCQ Question',
                                    points: 10,
                                    options: ['Option A', 'Option B', 'Option C', 'Option D'],
                                    correctOptionIndex: 0
                                  };
                                  setNewExamQuestions([...newExamQuestions, newQ]);
                                  setEditingQuestionIdx(newExamQuestions.length);
                                }}
                              >
                                <Plus size={14} /> MCQ Question
                              </button>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }}
                                onClick={() => {
                                  const newQ = {
                                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                    type: 'coding',
                                    title: 'C++ Coding Question',
                                    points: 20,
                                    description: 'Write a C++ program to solve...',
                                    initialTemplate: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Code here\n    return 0;\n}',
                                    language: 'cpp',
                                    testCases: [{ input: '', output: '', isSample: true, points: 10 }]
                                  };
                                  setNewExamQuestions([...newExamQuestions, newQ]);
                                  setEditingQuestionIdx(newExamQuestions.length);
                                }}
                              >
                                <Plus size={14} /> C++ Coding Question
                              </button>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }}
                                onClick={() => {
                                  const newQ = {
                                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                    type: 'web',
                                    title: 'Web Design Question',
                                    points: 20,
                                    description: 'Build a responsive card component with HTML and CSS.',
                                    initialHtml: '<div class="card">\n  <h2>Title</h2>\n</div>',
                                    initialCss: '.card {\n  padding: 20px;\n  background: #f1f5f9;\n}',
                                    initialJs: 'console.log("Web card loaded");'
                                  };
                                  setNewExamQuestions([...newExamQuestions, newQ]);
                                  setEditingQuestionIdx(newExamQuestions.length);
                                }}
                              >
                                <Plus size={14} /> HTML/CSS/JS Question
                              </button>
                            </div>

                            {/* Step navigation */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '25px', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                              <button type="button" className="cf-btn-secondary" onClick={() => setCreatorStep(1)}>Back: Details</button>
                              <button
                                type="button"
                                className="cf-btn-primary"
                                onClick={() => {
                                  if (newExamQuestions.length === 0) {
                                    alert("Please configure at least 1 question for the practice test.");
                                    return;
                                  }
                                  setCreatorStep(3);
                                }}
                              >
                                Next: Review Configuration
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 3: Review & Publish */}
                    {creatorStep === 3 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ border: '1px solid #cbd5e1', padding: '18px', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                          <h4 style={{ color: '#002147', fontWeight: 'bold', margin: '0 0 15px 0' }}>Review Test Configuration</h4>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '9.5pt', marginBottom: '20px' }}>
                            <div>
                              <span style={{ color: '#64748b' }}>Test Title:</span> <strong style={{ color: '#002147' }}>{newExamTitle}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Scheduled Duration:</span> <strong>{newExamDuration} mins</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Configured Marks cap:</span> <strong>{newExamMarks} Marks</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Access Window:</span> <span style={{ fontSize: '8.5pt' }}>{new Date(newExamStart).toLocaleString()} - {new Date(newExamEnd).toLocaleString()}</span>
                            </div>
                          </div>

                          <h5 style={{ fontSize: '9pt', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Questions List ({newExamQuestions.length} items):</h5>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                            {newExamQuestions.map((q, idx) => (
                              <div key={idx} style={{ fontSize: '9pt', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                                <span>
                                  Q{idx + 1}: <strong>{q.title}</strong> ({q.type.toUpperCase()})
                                </span>
                                <strong>{q.points} points</strong>
                              </div>
                            ))}
                          </div>
                        </div>

                        <form onSubmit={handleCreateTest} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                          <button type="button" className="cf-btn-secondary" onClick={() => setCreatorStep(2)}>Back: Configure Questions</button>
                          <button type="submit" className="cf-btn-primary">Save &amp; Publish Test</button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ADMIN - CANDIDATE SUBMISSIONS EVALUATION CONSOLE */}
              <div className="cf-card" id="admin-submissions-section">
                <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <GraduationCap size={18} style={{ color: '#10b981' }} />
                  <span>Exam Submissions Evaluation Console</span>
                  {adminExamSubmissions.length > 0 && (
                    <button
                      type="button"
                      className="cf-btn-secondary"
                      style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '8pt', background: '#ffffff', color: '#002147', borderColor: '#cbd5e1', cursor: 'pointer' }}
                      onClick={() => {
                        const firstSub = adminExamSubmissions[0];
                        const testId = firstSub?.testId;
                        if (testId) {
                          fetchExamSubmissions(testId);
                        }
                      }}
                    >
                      Refresh Submissions
                    </button>
                  )}
                </div>
                
                {adminExamSubmissions.length === 0 ? (
                  <div className="cf-alert cf-alert-info">
                    Select an exam from the configured list above to view candidate answers and sheets.
                  </div>
                ) : (
                  <div className="cf-table-container">
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Candidate Name</th>
                          <th>Started</th>
                          <th>Submitted</th>
                          <th>Malpractice Warnings</th>
                          <th>Status</th>
                          <th>Marks</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminExamSubmissions.map((s, idx) => (
                          <tr key={idx}>
                            <td>{s.studentId}</td>
                            <td style={{ fontWeight: 'bold' }}>{s.candidateName}</td>
                            <td style={{ fontSize: '8pt', color: '#555' }}>
                              {new Date(s.startedAt).toLocaleTimeString()}
                            </td>
                            <td style={{ fontSize: '8pt', color: '#555' }}>
                              {s.submittedAt ? new Date(s.submittedAt).toLocaleTimeString() : (s.status === 'evaluated' ? 'Graded' : (s.status === 'submitted' ? 'Submitted' : 'In Progress'))}
                            </td>
                            <td>
                              <span style={{
                                color: (Number(s.proctoringLog?.fullscreenExits || 0) + Number(s.proctoringLog?.tabSwitches || 0)) > 1 ? '#be123c' : '#475569',
                                fontWeight: 'bold'
                              }}>
                                Exits: {s.proctoringLog?.fullscreenExits || 0} • Tabs: {s.proctoringLog?.tabSwitches || 0}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${
                                s.status === 'evaluated' ? 'status-eligible' :
                                s.status === 'submitted' ? 'status-pending' :
                                s.status === 'auto-submitted' ? 'status-pending' : 'status-ineligible'
                              }`} style={{ fontSize: '7.5pt', padding: '1px 5px' }}>
                                {s.status?.toUpperCase() || 'STARTED'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 'bold' }}>
                              {s.status === 'evaluated'
                                ? (Number(s.evaluation?.mcqScore || 0) + Number(s.evaluation?.codingScore || 0))
                                : `${s.evaluation?.mcqScore || 0} (MCQ)`}
                            </td>
                            <td>
                              <button
                                className="cf-btn-primary"
                                style={{ padding: '3px 8px', fontSize: '8pt' }}
                                onClick={() => {
                                  setSelectedExamSubmission(s);
                                  const initialScores = {};
                                  s.answers?.forEach(ans => {
                                    initialScores[ans.questionId] = ans.score || 0;
                                  });
                                  setAdminGradingAnswers(initialScores);
                                  setAdminGradingCodingScore(s.evaluation?.codingScore || 0);
                                  setAdminGradingFeedback(s.evaluation?.feedback || '');
                                  setAdminReevalStatus(s.reevaluation?.status || 'pending');
                                  setAdminReevalResolutionFeedback(s.reevaluation?.resolutionFeedback || '');
                                }}
                              >
                                {s.status === 'evaluated' ? 'Re-Grade' : 'Evaluate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DETAILED CANDIDATE EVALUATION MODAL */}
              {selectedExamSubmission && (() => {
                const testConfig = adminTests.find(t => (t.id || t._id) === selectedExamSubmission.testId);
                return (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
                    <div className="cf-card" style={{ width: '85%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '20px', border: '1px solid #b9c9fe', backgroundColor: '#fff' }}>
                      <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Grade Exam Sheet: {selectedExamSubmission.candidateName} ({selectedExamSubmission.studentId})</span>
                        <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => setSelectedExamSubmission(null)}></button>
                      </div>

                      <div className="cf-alert cf-alert-info" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>Title:</strong> {selectedExamSubmission.testTitle}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertTriangle size={15} style={{ color: '#d97706' }} />
                          <span>Fullscreen Exits: <strong>{selectedExamSubmission.proctoringLog?.fullscreenExits || 0}</strong> • Tab Switches: <strong>{selectedExamSubmission.proctoringLog?.tabSwitches || 0}</strong></span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
                        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', borderBottom: '2px solid #3b5998', paddingBottom: '6px', margin: 0 }}>
                          Candidate Answer Sheets (Full Details)
                        </h4>

                        {selectedExamSubmission.answers?.map((ans, idx) => {
                          const questionConfig = testConfig?.questions?.[idx] || testConfig?.questions?.find(q => q.id === ans.questionId);
                          
                          return (
                            <div key={idx} style={{ padding: '15px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                                <h5 style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002147', margin: 0 }}>
                                  Question {idx + 1}: {ans.type?.toUpperCase()}
                                </h5>
                                <span style={{ fontSize: '8pt', backgroundColor: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                  Points: {questionConfig?.points || 0}
                                </span>
                              </div>

                              {/* Question Title & Description */}
                              <RichText
                                text={questionConfig?.title || "No question title available"}
                                style={{ fontSize: '9.5pt', color: '#333', fontWeight: 'bold', marginBottom: '8px' }}
                              />

                              {questionConfig?.description && (
                                <RichText
                                  text={questionConfig.description}
                                  style={{ fontSize: '9pt', color: '#475569', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '4px', marginBottom: '10px', fontFamily: 'sans-serif', lineHeight: '1.5' }}
                                />
                              )}

                              {/* Render image if present */}
                              {questionConfig?.imageUrl && (
                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', backgroundColor: '#fff', textAlign: 'center', marginBottom: '10px' }}>
                                  <img
                                    src={questionConfig.imageUrl}
                                    alt="Question Layout/Diagram"
                                    style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }}
                                  />
                                </div>
                              )}

                              {/* MCQ Answers Display */}
                              {ans.type === 'mcq' && questionConfig && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                  {questionConfig.options?.map((opt, optIdx) => {
                                    const isCandidateSelect = Number(ans.selectedOptionIndex) === optIdx;
                                    const isCorrectKey = Number(questionConfig.correctOptionIndex) === optIdx;
                                    
                                    let borderStyle = '1px solid #cbd5e1';
                                    let bgStyle = '#fff';
                                    let badgeText = '';

                                    if (isCorrectKey) {
                                      borderStyle = '2px solid #10b981';
                                      bgStyle = '#ecfdf5';
                                      badgeText = 'Correct Answer';
                                    } else if (isCandidateSelect) {
                                      borderStyle = '2px solid #ef4444';
                                      bgStyle = '#fef2f2';
                                      badgeText = 'Candidate Choice (Incorrect)';
                                    }

                                    if (isCorrectKey && isCandidateSelect) {
                                      badgeText = 'Candidate Choice (Correct)';
                                    }

                                    return (
                                      <div
                                        key={optIdx}
                                        style={{
                                          padding: '10px 12px',
                                          borderRadius: '4px',
                                          border: borderStyle,
                                          backgroundColor: bgStyle,
                                          fontSize: '9pt',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center'
                                        }}
                                      >
                                        <span>Option {optIdx + 1}: {opt}</span>
                                        {badgeText && (
                                          <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: isCorrectKey ? '#047857' : '#b91c1c' }}>
                                            {badgeText}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Coding Workspace Submitted Answers */}
                              {ans.type === 'coding' && (
                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <span className="cf-label" style={{ display: 'block', fontWeight: 'bold', fontSize: '9pt' }}>
                                    Candidate Submitted Source Code:
                                  </span>
                                  <pre style={{
                                    backgroundColor: '#1e1e1e',
                                    color: '#d4d4d4',
                                    fontFamily: 'Consolas, monospace',
                                    fontSize: '8.5pt',
                                    padding: '12px',
                                    borderRadius: '4px',
                                    overflowX: 'auto',
                                    maxHeight: '300px',
                                    margin: 0,
                                    whiteSpace: 'pre-wrap'
                                  }}>
                                    {ans.submittedCode || '// No code submitted'}
                                  </pre>

                                  {/* Code Run/Compilation Verification Results */}
                                  <div style={{ marginTop: '10px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                      <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Autograder Verification Status:</span>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '2px 8px', fontSize: '8pt', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                        onClick={() => runAdminCodeVerification(ans.questionId, ans.submittedCode, questionConfig?.testCases)}
                                        disabled={codingEvaluationResults[ans.questionId]?.isRunning}
                                      >
                                        {codingEvaluationResults[ans.questionId]?.isRunning ? (
                                          <>
                                            <Loader2 className="spinner" size={10} style={{ width: '10px', height: '10px' }} /> Re-running...
                                          </>
                                        ) : (
                                          'Run Compiler Test Cases'
                                        )}
                                      </button>
                                    </div>

                                    {codingEvaluationResults[ans.questionId]?.isRunning && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '8.5pt', color: '#64748b', padding: '5px 0' }}>
                                        <Loader2 className="spinner" size={14} style={{ color: '#3b5998', width: '14px', height: '14px' }} />
                                        <span>Compiling source code and executing test cases on host server...</span>
                                      </div>
                                    )}

                                    {!codingEvaluationResults[ans.questionId]?.isRunning && codingEvaluationResults[ans.questionId]?.compileError && (
                                      <div style={{ borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '2px', fontSize: '8.5pt', fontFamily: 'monospace', color: '#b91c1c', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                        <strong>Compilation Error:</strong><br />
                                        {codingEvaluationResults[ans.questionId].compileError}
                                      </div>
                                    )}

                                    {!codingEvaluationResults[ans.questionId]?.isRunning && codingEvaluationResults[ans.questionId]?.results && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {codingEvaluationResults[ans.questionId].results.map((res, rIdx) => {
                                          const isPassed = res.status === 'Accepted';
                                          return (
                                            <div key={rIdx} style={{ fontSize: '8.5pt', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                              <div style={{
                                                padding: '6px 10px',
                                                backgroundColor: isPassed ? '#f0fdf4' : '#fef2f2',
                                                borderBottom: '1px solid #cbd5e1',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                fontWeight: 'bold'
                                              }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isPassed ? '#166534' : '#991b1b' }}>
                                                  {isPassed ? <Check size={14} /> : <X size={14} />}
                                                  <span>Test Case #{rIdx + 1} ({questionConfig?.testCases?.[rIdx]?.isSample ? 'Sample' : 'Hidden'}): {res.status}</span>
                                                </span>
                                                <span style={{ fontSize: '8pt', color: '#64748b' }}>Points: {questionConfig?.testCases?.[rIdx]?.points || 0}</span>
                                              </div>
                                              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '8pt', color: '#475569', fontFamily: 'monospace' }}>
                                                <div><strong>Input:</strong> <code>{res.input || '(empty)'}</code></div>
                                                <div><strong>Expected Output:</strong> <code>{res.expectedOutput || '(empty)'}</code></div>
                                                <div><strong>Candidate Output:</strong> <code style={{ color: isPassed ? '#166534' : '#991b1b' }}>{res.actualOutput || '(empty)'}</code></div>
                                                {res.stderr && <div style={{ color: '#b91c1c' }}><strong>Stderr:</strong> <code>{res.stderr}</code></div>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {!codingEvaluationResults[ans.questionId] && (
                                      <span style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic' }}>Autograder is ready. Click run or wait for background verification.</span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                                    <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Award Score:</span>
                                    <input
                                      type="number"
                                      className="cf-input"
                                      style={{ width: '80px', padding: '4px 8px' }}
                                      value={adminGradingAnswers[ans.questionId] ?? 0}
                                      onChange={(e) => {
                                        const val = Number(e.target.value || 0);
                                        setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: val }));
                                      }}
                                    />
                                    <span style={{ fontSize: '8pt', color: '#64748b' }}>/ {questionConfig?.points || 0} points</span>
                                  </div>
                                </div>
                              )}

                              {/* Web Workspace Submitted Answers */}
                              {ans.type === 'web' && (
                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <span className="cf-label" style={{ display: 'block', fontWeight: 'bold', fontSize: '9pt' }}>
                                    Candidate Submitted Web Page (HTML/CSS/JS):
                                  </span>
                                  
                                  {/* Tab Switchers */}
                                  <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                    {['html', 'css', 'js', 'preview'].map(tab => (
                                      <button
                                        key={tab}
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{
                                          padding: '3px 10px',
                                          fontSize: '8pt',
                                          margin: 0,
                                          backgroundColor: (adminActiveWebTabs[ans.questionId] || 'preview') === tab ? '#e2e8f0' : '#ffffff',
                                          fontWeight: (adminActiveWebTabs[ans.questionId] || 'preview') === tab ? 'bold' : 'normal'
                                        }}
                                        onClick={() => setAdminActiveWebTabs(prev => ({ ...prev, [ans.questionId]: tab }))}
                                      >
                                        {tab.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Tab Contents */}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'html' && (
                                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                      {ans.submittedHtml || '<!-- No HTML submitted -->'}
                                    </pre>
                                  )}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'css' && (
                                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                      {ans.submittedCss || '/* No CSS submitted */'}
                                    </pre>
                                  )}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'js' && (
                                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                      {ans.submittedJs || '// No JS submitted'}
                                    </pre>
                                  )}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'preview' && (
                                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                      <iframe
                                        title="Web Sandbox Grading Preview"
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
                                              <style>${ans.submittedCss || ''}</style>
                                            </head>
                                            <body>
                                              ${ans.submittedHtml || ''}
                                              <script>${ans.submittedJs || ''}</script>
                                            </body>
                                          </html>
                                        `}
                                        sandbox="allow-scripts"
                                        style={{ width: '100%', height: '310px', border: 'none', backgroundColor: '#ffffff' }}
                                      />
                                    </div>
                                  )}

                                  {/* Points input */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                                    <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Award Score:</span>
                                    <input
                                      type="number"
                                      className="cf-input"
                                      style={{ width: '80px', padding: '4px 8px' }}
                                      value={adminGradingAnswers[ans.questionId] ?? 0}
                                      onChange={(e) => {
                                        const val = Number(e.target.value || 0);
                                        setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: val }));
                                      }}
                                    />
                                    <span style={{ fontSize: '8pt', color: '#64748b' }}>/ {questionConfig?.points || 0} points (Manual Grade)</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                    {/* Grading Form */}
                    <form onSubmit={handleSaveEvaluation} style={{ borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                      
                      {/* Contested Re-evaluation Info */}
                      {selectedExamSubmission.reevaluation?.applied && (
                        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '15px', borderRadius: '6px', marginBottom: '20px', fontSize: '9pt', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: '1.5' }}>
                          <h5 style={{ fontWeight: 'bold', color: '#b45309', fontSize: '9.5pt', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldAlert size={16} />
                                    <span>ACTIVE RE-EVALUATION CLAIM FILED</span>
                                  </h5>
                          
                          {selectedExamSubmission.reevaluation.complainedQuestions?.length > 0 && (
                            <div>
                              <span style={{ fontWeight: 'bold', color: '#78350f' }}>Contested Questions: </span>
                              <span style={{ fontSize: '8pt', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                {selectedExamSubmission.reevaluation.complainedQuestions.map(qId => {
                                  const foundQIdx = testConfig?.questions?.findIndex(q => q.id === qId);
                                  return foundQIdx !== -1 ? `Q${foundQIdx + 1}` : qId;
                                }).join(', ')}
                              </span>
                            </div>
                          )}

                          <div>
                            <div style={{ fontWeight: 'bold', color: '#78350f' }}>Candidate Complaint Text:</div>
                            <div style={{ backgroundColor: '#ffffff', padding: '10px', borderRadius: '4px', border: '1px solid #fef3c7', whiteSpace: 'pre-wrap', color: '#333' }}>
                              {selectedExamSubmission.reevaluation.complaintText}
                            </div>
                          </div>

                          {selectedExamSubmission.reevaluation.proofImages?.length > 0 && (
                            <div>
                              <div style={{ fontWeight: 'bold', color: '#78350f', marginBottom: '6px' }}>Candidate Screen Proofs:</div>
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {selectedExamSubmission.reevaluation.proofImages.map((imgUrl, imgIdx) => (
                                  <a key={imgIdx} href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'block', width: '80px', height: '80px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                    <img src={imgUrl} alt={`Proof screenshot ${imgIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', borderTop: '1px solid #fef3c7', paddingTop: '15px' }}>
                            <div className="cf-input-group">
                              <label className="cf-label" style={{ color: '#78350f', fontWeight: 'bold' }}>Re-evaluation Status:</label>
                              <select
                                className="cf-input"
                                value={adminReevalStatus}
                                onChange={e => setAdminReevalStatus(e.target.value)}
                                style={{ padding: '8px 12px', fontSize: '9pt' }}
                              >
                                <option value="pending">Pending Review</option>
                                <option value="resolved">Resolve Claim</option>
                                <option value="rejected">Reject Claim</option>
                              </select>
                            </div>
                            <div className="cf-input-group">
                              <label className="cf-label" style={{ color: '#78350f', fontWeight: 'bold' }}>Resolution Response Remarks:</label>
                              <textarea
                                className="cf-input"
                                rows="2"
                                value={adminReevalResolutionFeedback}
                                onChange={e => setAdminReevalResolutionFeedback(e.target.value)}
                                placeholder="Explain your resolution decision to the candidate..."
                                style={{ padding: '8px 12px', fontSize: '9pt' }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileEdit size={16} />
                        <span>Score Sheet Evaluation</span>
                      </h4>
                      
                      <div className="cf-form-grid" style={{ gridTemplateColumns: '1fr 2fr', gap: '15px', marginBottom: '15px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Scored Coding Marks</label>
                          <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002147', padding: '6px 0' }}>
                            {Object.entries(adminGradingAnswers).reduce((sum, [qId, score]) => {
                              const ans = selectedExamSubmission.answers?.find(a => a.questionId === qId);
                              return (ans && ans.type === 'coding') ? sum + Number(score || 0) : sum;
                            }, 0)} marks (Auto-summed)
                          </div>
                          <span style={{ fontSize: '7.5pt', color: '#888', marginTop: '3px' }}>
                            MCQ Score auto-graded: <strong>{(() => {
                               const relatedTest = adminTests.find(t => (t.id || t._id) === selectedExamSubmission.testId);
                               if (!relatedTest || !selectedExamSubmission.answers) return selectedExamSubmission.evaluation?.mcqScore || 0;
                               let score = 0;
                               selectedExamSubmission.answers.forEach(ans => {
                                 const q = relatedTest.questions?.find(quest => quest.id === ans.questionId);
                                 if (q && q.type === 'mcq') {
                                   if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null) {
                                     if (Number(q.correctOptionIndex) === Number(ans.selectedOptionIndex)) {
                                       score += Number(q.points || 0);
                                     }
                                   }
                                 }
                               });
                               return score;
                             })()}</strong>
                          </span>
                        </div>
                        <div className="cf-input-group">
                          <label className="cf-label">Evaluator Comments &amp; Feedback</label>
                          <textarea
                            className="cf-input"
                            rows="2"
                            required
                            value={adminGradingFeedback}
                            onChange={e => setAdminGradingFeedback(e.target.value)}
                            placeholder="Provide feedback remarks for candidate..."
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" className="cf-btn-secondary" onClick={() => setSelectedExamSubmission(null)}>
                          Cancel
                        </button>
                        <button type="submit" className="cf-btn-primary">
                          Save Candidate Evaluation
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
                );
              })()}

            </div>
          )}

          {view === 'admin_logs' && (
            <div className="cf-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>System Audit & Exception Logs</h2>
                <button className="cf-btn-secondary" onClick={fetchSystemLogs} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RefreshCw size={14} /> Refresh Logs
                </button>
              </div>

              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '1px solid var(--cf-border)' }}>
                <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Search Actor</label>
                  <input
                    type="text"
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px' }}
                    placeholder="Enter actor name..."
                    value={logFilterActor}
                    onChange={e => { setLogFilterActor(e.target.value); setLogPage(1); }}
                  />
                </div>

                <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Action Type</label>
                  <select
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                    value={logFilterAction}
                    onChange={e => { setLogFilterAction(e.target.value); setLogPage(1); }}
                  >
                    <option value="ALL">All Actions</option>
                    <option value="USER_SIGN_IN">USER_SIGN_IN</option>
                    <option value="USER_SIGN_OUT">USER_SIGN_OUT</option>
                    <option value="SIGN_IN_FAILED">SIGN_IN_FAILED</option>
                    <option value="REGISTRATION_COMPLETE">REGISTRATION_COMPLETE</option>
                    <option value="REGISTRATION_FAILED">REGISTRATION_FAILED</option>
                    <option value="REGISTRATION_CONNECTION_FAILED">REGISTRATION_CONNECTION_FAILED</option>
                    <option value="PROCTOR_ALERT_FULLSCREEN_EXIT">PROCTOR_ALERT_FULLSCREEN_EXIT</option>
                    <option value="PROCTOR_ALERT_TAB_SWITCH">PROCTOR_ALERT_TAB_SWITCH</option>
                    <option value="TECHNICAL_ERROR">TECHNICAL_ERROR</option>
                    <option value="TEST_CREATED">TEST_CREATED</option>
                    <option value="TEST_DELETED">TEST_DELETED</option>
                    <option value="CANDIDATE_EVALUATED">CANDIDATE_EVALUATED</option>
                  </select>
                </div>

                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Severity</label>
                  <select
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                    value={logFilterSeverity}
                    onChange={e => { setLogFilterSeverity(e.target.value); setLogPage(1); }}
                  >
                    <option value="ALL">All Severities</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>

              <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th style={{ width: '180px' }}>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Details</th>
                      <th style={{ width: '120px' }}>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let list = [...systemLogs];
                      if (logFilterActor.trim()) {
                        const q = logFilterActor.toLowerCase();
                        list = list.filter(l => l.actor && l.actor.toLowerCase().includes(q));
                      }
                      if (logFilterAction !== 'ALL') {
                        list = list.filter(l => l.action === logFilterAction);
                      }
                      if (logFilterSeverity !== 'ALL') {
                        list = list.filter(l => l.severity === logFilterSeverity);
                      }

                      const limit = 15;
                      const totalCount = list.length;
                      const maxPage = Math.ceil(totalCount / limit) || 1;
                      const pageIndex = Math.min(logPage, maxPage);
                      const paginatedList = list.slice((pageIndex - 1) * limit, pageIndex * limit);

                      if (paginatedList.length === 0) {
                        return (
                          <tr>
                            <td colSpan="5" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b' }}>No system logs match the current filters.</td>
                          </tr>
                        );
                      }

                      return (
                        <>
                          {paginatedList.map((log, idx) => {
                            let badgeBg = '#f1f5f9';
                            let badgeCol = '#475569';
                            if (log.severity === 'warning') {
                              badgeBg = '#fef3c7';
                              badgeCol = '#d97706';
                            } else if (log.severity === 'error') {
                              badgeBg = '#fee2e2';
                              badgeCol = '#dc2626';
                            }
                            return (
                              <tr key={idx}>
                                <td style={{ fontSize: '8.5pt' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                <td style={{ fontWeight: 'bold', fontSize: '9pt', color: '#1e293b' }}>{log.actor}</td>
                                <td style={{ fontSize: '9pt' }}>
                                  <span style={{ fontFamily: 'Fira Code, monospace', padding: '2px 6px', backgroundColor: '#e2e8f0', borderRadius: '4px', fontSize: '8pt', color: '#0f172a' }}>
                                    {log.action}
                                  </span>
                                </td>
                                <td style={{ fontSize: '9pt', color: '#334155', maxWidth: '420px', whiteSpace: 'pre-wrap' }}>{log.details}</td>
                                <td>
                                  <span className="status-badge" style={{ backgroundColor: badgeBg, color: badgeCol, fontWeight: 'bold' }}>
                                    {log.severity?.toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {(() => {
                let list = [...systemLogs];
                if (logFilterActor.trim()) {
                  const q = logFilterActor.toLowerCase();
                  list = list.filter(l => l.actor && l.actor.toLowerCase().includes(q));
                }
                if (logFilterAction !== 'ALL') {
                  list = list.filter(l => l.action === logFilterAction);
                }
                if (logFilterSeverity !== 'ALL') {
                  list = list.filter(l => l.severity === logFilterSeverity);
                }

                const limit = 15;
                const totalCount = list.length;
                const maxPage = Math.ceil(totalCount / limit) || 1;
                const pageIndex = Math.min(logPage, maxPage);
                const startIdx = totalCount === 0 ? 0 : (pageIndex - 1) * limit + 1;
                const endIdx = Math.min(pageIndex * limit, totalCount);

                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '12px', borderTop: '1px solid var(--cf-border)' }}>
                    <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
                      Showing {startIdx} to {endIdx} of {totalCount} log entries
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="cf-btn-secondary"
                        disabled={pageIndex <= 1}
                        onClick={() => setLogPage(pageIndex - 1)}
                        style={{ padding: '4px 10px', fontSize: '8.5pt', margin: 0 }}
                      >
                        Previous
                      </button>
                      <button
                        className="cf-btn-secondary"
                        disabled={pageIndex >= maxPage}
                        onClick={() => setLogPage(pageIndex + 1)}
                        style={{ padding: '4px 10px', fontSize: '8.5pt', margin: 0 }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {view === 'admin_proctoring' && (
            <div>
              {/* TOP HEADER SECTION */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Live Exam Proctoring Terminal</h2>
                <button
                  className="cf-btn-secondary"
                  onClick={fetchLiveSubmissions}
                  style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '8.5pt', margin: 0 }}
                >
                  <RefreshCw size={14} /> Refresh Lists
                </button>
              </div>

              {/* SPACE-SAVING TOP CONTROL BAR */}
              <div style={{
                display: 'flex',
                gap: '20px',
                flexWrap: 'wrap',
                backgroundColor: '#f8fafc',
                padding: '15px',
                borderRadius: '4px',
                marginBottom: '20px',
                border: '1px solid var(--cf-border)',
                alignItems: 'flex-end'
              }}>
                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Select Examination</label>
                  <select
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                    value={selectedProctorTest ? (selectedProctorTest.id || selectedProctorTest._id) : ''}
                    onChange={e => {
                      const found = adminTests.find(t => (t.id || t._id) === e.target.value);
                      setSelectedProctorTest(found || null);
                      setSelectedProctorStudent(null);
                    }}
                  >
                    <option value="">-- Choose Live Access Exam --</option>
                    {adminTests.map(t => (
                      <option key={t.id || t._id} value={t.id || t._id}>{t.title}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Select Examinee</label>
                  <select
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                    value={selectedProctorStudent ? (selectedProctorStudent.id || selectedProctorStudent._id) : ''}
                    onChange={e => {
                      const found = liveSubmissions.find(s => (s.id || s._id) === e.target.value);
                      setSelectedProctorStudent(found || null);
                    }}
                    disabled={!selectedProctorTest}
                  >
                    <option value="">{selectedProctorTest ? "-- Choose Student Support --" : "-- Select an Exam First --"}</option>
                    {selectedProctorTest && (() => {
                      const tId = selectedProctorTest.id || selectedProctorTest._id;
                      const testStudents = liveSubmissions.filter(s => s.testId === tId);
                      return testStudents.map(sub => {
                        const subId = sub.id || sub._id;
                        const isActive = sub.status === 'started';
                        const prefix = isActive ? '[Active] ' : '[Completed] ';
                        return (
                          <option key={subId} value={subId}>
                            {prefix} {sub.candidateName} ({sub.studentId})
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>
              </div>

              {/* MONITOR SCREEN CONTAINER */}
              <div style={{ minHeight: '400px' }}>
                {!selectedProctorStudent ? (
                  <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', color: '#64748b', borderStyle: 'dashed', minHeight: '360px' }}>
                    <Video size={48} style={{ color: '#94a3b8', marginBottom: '15px' }} />
                    <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#334155', margin: '0 0 5px 0' }}>Examinee Session Monitor</h3>
                    <p style={{ fontSize: '8.5pt', color: '#64748b', maxWidth: '380px', margin: 0 }}>
                      Select a configured examination and choose a candidate from the top dropdown selectors to view real-time camera proctoring feeds or review historic logs.
                    </p>
                  </div>
                ) : (
                  <StudentProctorDashboard
                    sub={selectedProctorStudent}
                    onClose={() => setSelectedProctorStudent(null)}
                    fetchLiveSubmissions={fetchLiveSubmissions}
                  />
                )}
              </div>
            </div>
          )}

          {view === 'admin_tickets' && (
            <div className="cf-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Helpdesk Tickets & Requests</h2>
                <button className="cf-btn-secondary" onClick={fetchAdminTickets} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RefreshCw size={14} /> Refresh Tickets
                </button>
              </div>

              {/* Advanced Filter Bar */}
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '1px solid var(--cf-border)' }}>
                <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Category Filter</label>
                  <select
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                    value={adminTicketFilterCategory}
                    onChange={e => setAdminTicketFilterCategory(e.target.value)}
                  >
                    <option value="ALL">All Categories</option>
                    <option value="suggestion">Suggestions</option>
                    <option value="general_feedback">General Feedback</option>
                    <option value="complaint">Complaints</option>
                    <option value="enquiry">Enquiries</option>
                    <option value="technical_problem">Technical Problems</option>
                  </select>
                </div>

                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Status Filter</label>
                  <select
                    className="cf-input"
                    style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
                    value={adminTicketFilterStatus}
                    onChange={e => setAdminTicketFilterStatus(e.target.value)}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Tickets Table */}
              <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th style={{ width: '150px' }}>Submitted Date</th>
                      <th>Candidate Details</th>
                      <th>Category</th>
                      <th>Subject</th>
                      <th style={{ width: '120px' }}>Status</th>
                      <th style={{ width: '140px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let list = [...adminTickets];
                      if (adminTicketFilterCategory !== 'ALL') {
                        list = list.filter(t => t.category === adminTicketFilterCategory);
                      }
                      if (adminTicketFilterStatus !== 'ALL') {
                        list = list.filter(t => t.status === adminTicketFilterStatus);
                      }

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan="6" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b' }}>No helpdesk tickets match the current filters.</td>
                          </tr>
                        );
                      }

                      return (
                        <>
                          {list.map((ticket, idx) => {
                            let statusBg = '#f1f5f9';
                            let statusColor = '#475569';
                            if (ticket.status === 'open') {
                              statusBg = '#eff6ff';
                              statusColor = '#2563eb';
                            } else if (ticket.status === 'resolved') {
                              statusBg = '#ecfdf5';
                              statusColor = '#059669';
                            } else if (ticket.status === 'closed') {
                              statusBg = '#f8fafc';
                              statusColor = '#64748b';
                            }

                            let categoryLabel = ticket.category;
                            if (ticket.category === 'suggestion') categoryLabel = 'Suggestion';
                            else if (ticket.category === 'general_feedback') categoryLabel = 'General Feedback';
                            else if (ticket.category === 'complaint') categoryLabel = 'Complaint';
                            else if (ticket.category === 'enquiry') categoryLabel = 'Enquiry';
                            else if (ticket.category === 'technical_problem') categoryLabel = 'Technical Problem';

                            const tId = ticket.id || ticket._id;

                            return (
                              <tr key={tId || idx}>
                                <td style={{ fontSize: '8.5pt' }}>{new Date(ticket.createdAt).toLocaleString()}</td>
                                <td>
                                  <div style={{ fontWeight: 'bold', fontSize: '9pt', color: '#1e293b' }}>{ticket.candidateName}</div>
                                  <div style={{ fontSize: '7.5pt', color: '#64748b' }}>ID: {ticket.studentId}</div>
                                </td>
                                <td>
                                  <span style={{ fontSize: '8.5pt', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#e2e8f0', color: '#334155', borderRadius: '4px' }}>
                                    {categoryLabel}
                                  </span>
                                </td>
                                <td style={{ fontSize: '9pt', color: '#334155', fontWeight: '500' }}>{ticket.subject}</td>
                                <td>
                                  <span className="status-badge" style={{ backgroundColor: statusBg, color: statusColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    {ticket.status}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="cf-btn-secondary"
                                    onClick={() => {
                                      setSelectedAdminTicket(ticket);
                                      setAdminTicketResolutionFeedback(ticket.resolutionFeedback || '');
                                      setAdminTicketResolutionStatus(ticket.status || 'resolved');
                                    }}
                                    style={{ padding: '4px 10px', fontSize: '8.5pt', margin: 0 }}
                                  >
                                    View / Resolve
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* ADMIN RESOLUTION DETAIL MODAL */}
              {selectedAdminTicket && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  zIndex: 1000
                }}>
                  <div className="cf-card" style={{ width: '90%', maxWidth: '600px', padding: '20px', border: '1px solid #b9c9fe', boxShadow: 'none', backgroundColor: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Ticket Details & Resolution</span>
                      <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => setSelectedAdminTicket(null)}></button>
                    </div>

                    <div style={{ borderBottom: '1px solid var(--cf-border)', paddingBottom: '15px', marginBottom: '15px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '8.5pt', color: '#64748b', marginBottom: '10px' }}>
                        <div><strong>Candidate:</strong> {selectedAdminTicket.candidateName} ({selectedAdminTicket.studentId})</div>
                        <div><strong>Submitted:</strong> {new Date(selectedAdminTicket.createdAt).toLocaleString()}</div>
                        <div><strong>Category:</strong> <span style={{ textTransform: 'capitalize' }}>{selectedAdminTicket.category?.replace('_', ' ')}</span></div>
                        <div><strong>Current Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{selectedAdminTicket.status}</span></div>
                      </div>
                      <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '10px 0 6px 0' }}>
                        Subject: {selectedAdminTicket.subject}
                      </h3>
                      <div style={{ backgroundColor: '#f8fafc', padding: '12px', border: '1px solid var(--cf-border)', borderRadius: '4px', fontSize: '9pt', color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5', maxHeight: '180px', overflowY: 'auto' }}>
                        {selectedAdminTicket.message}
                      </div>
                    </div>

                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const ticketId = selectedAdminTicket.id || selectedAdminTicket._id;
                        const res = await fetch(`${API_BASE}/admin/tickets/resolve/${ticketId}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            status: adminTicketResolutionStatus,
                            resolutionFeedback: adminTicketResolutionFeedback
                          })
                        });
                        const data = await res.json();
                        if (data.success) {
                          setSelectedAdminTicket(null);
                          fetchAdminTickets();
                        } else {
                          alert(data.error || "Failed to update ticket.");
                        }
                      } catch (err) {
                        alert("Network error. Failed to resolve ticket.");
                      }
                    }}>
                      <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                        <label className="cf-label">Update Status *</label>
                        <select
                          className="cf-input"
                          value={adminTicketResolutionStatus}
                          onChange={e => setAdminTicketResolutionStatus(e.target.value)}
                          required
                        >
                          <option value="open">Open</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>

                      <div className="cf-input-group" style={{ marginBottom: '20px' }}>
                        <label className="cf-label">Administrative Response / Comments</label>
                        <textarea
                          className="cf-input"
                          rows="4"
                          placeholder="Provide feedback or resolution details to the candidate..."
                          value={adminTicketResolutionFeedback}
                          onChange={e => setAdminTicketResolutionFeedback(e.target.value)}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" className="cf-btn-secondary" onClick={() => setSelectedAdminTicket(null)}>
                          Cancel
                        </button>
                        <button type="submit" className="cf-btn-primary">
                          Save Resolution
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'admin_submissions' && (
            <div>
              {/* Webhook Simulator Section */}
              <div className="cf-card" style={{ marginBottom: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                  <h2 style={{ fontSize: '14pt', color: '#002147', margin: 0 }}>Google Classroom Webhook Simulator</h2>
                  <span className="status-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 8px', fontWeight: 'bold' }}>SIMULATOR MODE</span>
                </div>
                
                <p style={{ fontSize: '9pt', color: '#475569', marginBottom: '15px', lineHeight: '1.4' }}>
                  This console simulates Google Classroom sync triggers. Select a candidate to populate the email and ID, adjust parameters, and click <strong>Simulate Sync</strong> to post a webhook payload to the backend webhook endpoint.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">Select Student for Mock</label>
                    <select
                      className="cf-input"
                      value={webhookSimPayload.studentId}
                      onChange={e => {
                        const cand = candidatesList.find(c => c.studentId === e.target.value);
                        if (cand) {
                          setWebhookSimPayload({
                            ...webhookSimPayload,
                            studentId: cand.studentId,
                            email: cand.registrationData?.collegeEmail || cand.registrationData?.personalEmail || `${cand.username}@school.edu`,
                            studentName: cand.name
                          });
                        }
                      }}
                    >
                      <option value="STU1001">Siyam Bubere (STU1001)</option>
                      {candidatesList.filter(c => c.studentId !== 'STU1001').map(c => (
                        <option key={c.studentId} value={c.studentId}>{c.name} ({c.studentId})</option>
                      ))}
                    </select>
                  </div>

                  <div className="cf-input-group">
                    <label className="cf-label">Course Code & Name</label>
                    <select
                      className="cf-input"
                      value={webhookSimPayload.courseCode}
                      onChange={e => {
                        const code = e.target.value;
                        let name = '';
                        if (code === 'R526CS01T') name = 'Introduction to Computer Science';
                        else if (code === 'R526CS02T') name = 'Programming Fundamentals with C++';
                        else if (code === 'R526CS03T') name = 'Basics of Web Development';
                        else if (code === 'R526CS04T') name = 'Mathematical Thinking';
                        else if (code === 'R526CS02L') name = 'Programming Fundamentals with C++ Lab';
                        else if (code === 'R526CS03L') name = 'Basics of Web Development Lab';
                        setWebhookSimPayload({ ...webhookSimPayload, courseCode: code, courseName: name });
                      }}
                    >
                      <option value="R526CS01T">R526CS01T - Introduction to Computer Science</option>
                      <option value="R526CS02T">R526CS02T - Programming Fundamental with C++</option>
                      <option value="R526CS03T">R526CS03T - Basics of Web Development</option>
                      <option value="R526CS04T">R526CS04T - Mathematical Thinking</option>
                      <option value="R526CS02L">R526CS02L - Programming Fundamental with C++ Lab</option>
                      <option value="R526CS03L">R526CS03L - Basics of Web Development Lab</option>
                    </select>
                  </div>

                  <div className="cf-input-group">
                    <label className="cf-label">Submission Type</label>
                    <select
                      className="cf-input"
                      value={webhookSimPayload.type}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, type: e.target.value })}
                    >
                      <option value="assignment">Assignment (Theory)</option>
                      <option value="practical">Practical (Lab)</option>
                      <option value="class_test">Class Test (Theory)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">Task Title</label>
                    <input
                      type="text"
                      className="cf-input"
                      value={webhookSimPayload.title}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, title: e.target.value })}
                    />
                  </div>

                  <div className="cf-input-group">
                    <label className="cf-label">Score</label>
                    <input
                      type="number"
                      className="cf-input"
                      value={webhookSimPayload.score}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, score: Number(e.target.value) })}
                    />
                  </div>

                  <div className="cf-input-group">
                    <label className="cf-label">Max Score</label>
                    <input
                      type="number"
                      className="cf-input"
                      value={webhookSimPayload.maxScore}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, maxScore: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '15px', marginBottom: '20px' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">Due Date & Time</label>
                    <input
                      type="datetime-local"
                      className="cf-input"
                      value={webhookSimPayload.dueDate}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, dueDate: e.target.value })}
                    />
                  </div>

                  <div className="cf-input-group">
                    <label className="cf-label">Submission Date & Time</label>
                    <input
                      type="datetime-local"
                      className="cf-input"
                      value={webhookSimPayload.submissionDate}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, submissionDate: e.target.value })}
                    />
                  </div>

                  <div className="cf-input-group">
                    <label className="cf-label">Google Classroom URL</label>
                    <input
                      type="url"
                      className="cf-input"
                      value={webhookSimPayload.classroomLink}
                      onChange={e => setWebhookSimPayload({ ...webhookSimPayload, classroomLink: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    className="cf-btn-primary"
                    disabled={isSubmittingWebhook}
                    onClick={async () => {
                      setIsSubmittingWebhook(true);
                      setLoadingMessage("Simulating Classroom Sync Trigger...");
                      setSubmissionError('');
                      setSubmissionSuccess('');
                      try {
                        const toUtcString = (val) => {
                          if (!val) return null;
                          const d = new Date(val);
                          return isNaN(d.getTime()) ? null : d.toISOString();
                        };
                        const payload = {
                          ...webhookSimPayload,
                          submissionDate: toUtcString(webhookSimPayload.submissionDate),
                          dueDate: toUtcString(webhookSimPayload.dueDate)
                        };
                        const res = await fetch(`${API_BASE}/webhooks/google-classroom/submission`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': 'bics_classroom_secret_key_2026'
                          },
                          body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          setSubmissionSuccess(`Webhook posted successfully. Resolved student ID: ${data.submission.studentId}, tag: ${data.submission.status}`);
                          fetchAdminSubmissions();
                          setTimeout(() => setSubmissionSuccess(''), 5000);
                        } else {
                          setSubmissionError(data.error || "Mock sync failed.");
                        }
                      } catch (err) {
                        setSubmissionError("Network error sending mock payload.");
                      } finally {
                        setIsSubmittingWebhook(false);
                        setLoadingMessage('');
                      }
                    }}
                  >
                    {isSubmittingWebhook ? "Triggering Sync..." : "Simulate Sync / Post Webhook"}
                  </button>
                </div>
              </div>

              {/* Submissions List Section */}
              <div className="cf-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
                  <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Digital Submissions Ledger</h2>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="cf-btn-secondary" onClick={fetchAdminSubmissions}>
                      <RefreshCw size={14} style={{ marginRight: '6px' }} /> Refresh
                    </button>
                    <button
                      className="cf-btn-primary"
                      onClick={() => {
                        setEditingSubmission({
                          studentId: 'STU1001',
                          studentName: 'Siyam Bubere',
                          courseCode: 'R526CS01T',
                          courseName: 'Introduction to Computer Science',
                          title: '',
                          type: 'assignment',
                          submissionDate: '',
                          dueDate: '',
                          status: 'on_time',
                          score: 0,
                          maxScore: 20,
                          classroomLink: ''
                        });
                        setSubmissionError('');
                        setShowSubmissionModal(true);
                      }}
                    >
                      <Plus size={14} style={{ marginRight: '6px' }} /> Add Submission
                    </button>
                  </div>
                </div>

                {submissionSuccess && (
                  <div className="cf-alert cf-alert-success" style={{ marginBottom: '15px' }}>
                    {submissionSuccess}
                  </div>
                )}
                {submissionError && (
                  <div className="cf-alert cf-alert-danger" style={{ marginBottom: '15px' }}>
                    {submissionError}
                  </div>
                )}

                <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Course</th>
                        <th>Task Details</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminSubmissions.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b' }}>No submissions found in ledger. Use the simulator or manual add.</td>
                        </tr>
                      ) : (
                        adminSubmissions.map((sub, idx) => {
                          let badgeBg = '#f1f5f9';
                          let badgeColor = '#475569';
                          if (sub.status === 'on_time') {
                            badgeBg = '#d1fae5';
                            badgeColor = '#065f46';
                          } else if (sub.status === 'late') {
                            badgeBg = '#fee2e2';
                            badgeColor = '#991b1b';
                          } else if (sub.status === 'pending') {
                            badgeBg = '#dbeafe';
                            badgeColor = '#1e40af';
                          } else if (sub.status === 'excused') {
                            badgeBg = '#fef3c7';
                            badgeColor = '#92400e';
                          }

                          return (
                            <tr key={idx}>
                              <td>
                                <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>{sub.studentName}</div>
                                <div style={{ fontSize: '7.5pt', color: '#64748b' }}>{sub.studentId}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '500', fontSize: '8.5pt' }}>{sub.courseCode}</div>
                                <div style={{ fontSize: '7.5pt', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{sub.courseName}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '500', fontSize: '9pt', color: '#1e293b' }}>
                                  {sub.classroomLink ? (
                                    <a href={sub.classroomLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', textDecoration: 'none' }}>
                                      {sub.title} <ExternalLink size={12} />
                                    </a>
                                  ) : sub.title}
                                </div>
                              </td>
                              <td style={{ textTransform: 'capitalize', fontSize: '8.5pt' }}>{sub.type?.replace('_', ' ')}</td>
                              <td style={{ fontSize: '8pt', color: '#475569' }}>
                                <div>Due: {sub.dueDate ? new Date(sub.dueDate).toLocaleString() : 'N/A'}</div>
                                <div>Sub: {sub.submissionDate ? new Date(sub.submissionDate).toLocaleString() : 'Pending'}</div>
                              </td>
                              <td>
                                <span className="status-badge" style={{ backgroundColor: badgeBg, color: badgeColor, textTransform: 'uppercase', fontWeight: 'bold' }}>
                                  {sub.status?.replace('_', ' ')}
                                </span>
                              </td>
                              <td style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>
                                {sub.score} / {sub.maxScore}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    className="cf-btn-secondary"
                                    style={{ padding: '2px 8px', fontSize: '8.5pt', margin: 0 }}
                                    onClick={() => {
                                      setEditingSubmission({
                                        ...sub,
                                        submissionDate: toLocalISOString(sub.submissionDate),
                                        dueDate: toLocalISOString(sub.dueDate)
                                      });
                                      setSubmissionError('');
                                      setShowSubmissionModal(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="cf-btn-secondary"
                                    style={{ padding: '2px 8px', fontSize: '8.5pt', margin: 0, color: '#b91c1c', borderColor: '#fee2e2' }}
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete submission for "${sub.title}"?`)) {
                                        deleteAdminSubmission(sub.title || sub._id);
                                      }
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MANUAL ADD/EDIT MODAL */}
              {showSubmissionModal && editingSubmission && (
                <div style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  zIndex: 1000
                }}>
                  <div className="cf-card" style={{ width: '90%', maxWidth: '650px', padding: '20px', backgroundColor: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{editingSubmission._id ? "Edit Submission Details" : "Record New Submission"}</span>
                      <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => { setShowSubmissionModal(false); setEditingSubmission(null); }}>X</button>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault();
                      saveAdminSubmission(editingSubmission);
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Student ID *</label>
                          <input
                            type="text"
                            className="cf-input"
                            required
                            value={editingSubmission.studentId}
                            onChange={e => {
                              const cand = candidatesList.find(c => c.studentId === e.target.value);
                              setEditingSubmission({
                                ...editingSubmission,
                                studentId: e.target.value,
                                studentName: cand ? cand.name : editingSubmission.studentName
                              });
                            }}
                          />
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Student Name *</label>
                          <input
                            type="text"
                            className="cf-input"
                            required
                            value={editingSubmission.studentName}
                            onChange={e => setEditingSubmission({ ...editingSubmission, studentName: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Course Code *</label>
                          <select
                            className="cf-input"
                            required
                            value={editingSubmission.courseCode}
                            onChange={e => {
                              const code = e.target.value;
                              let name = '';
                              if (code === 'R526CS01T') name = 'Introduction to Computer Science';
                              else if (code === 'R526CS02T') name = 'Programming Fundamentals with C++';
                              else if (code === 'R526CS03T') name = 'Basics of Web Development';
                              else if (code === 'R526CS04T') name = 'Mathematical Thinking';
                              else if (code === 'R526CS02L') name = 'Programming Fundamentals with C++ Lab';
                              else if (code === 'R526CS03L') name = 'Basics of Web Development Lab';
                              setEditingSubmission({ ...editingSubmission, courseCode: code, courseName: name });
                            }}
                          >
                            <option value="R526CS01T">R526CS01T - Introduction to Computer Science</option>
                            <option value="R526CS02T">R526CS02T - Programming Fundamental with C++</option>
                            <option value="R526CS03T">R526CS03T - Basics of Web Development</option>
                            <option value="R526CS04T">R526CS04T - Mathematical Thinking</option>
                            <option value="R526CS02L">R526CS02L - Programming Fundamental with C++ Lab</option>
                            <option value="R526CS03L">R526CS03L - Basics of Web Development Lab</option>
                          </select>
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Submission Type *</label>
                          <select
                            className="cf-input"
                            required
                            value={editingSubmission.type}
                            onChange={e => setEditingSubmission({ ...editingSubmission, type: e.target.value })}
                          >
                            <option value="assignment">Assignment</option>
                            <option value="practical">Practical (Lab)</option>
                            <option value="class_test">Class Test</option>
                          </select>
                        </div>
                      </div>

                      <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                        <label className="cf-label">Task Title *</label>
                        <input
                          type="text"
                          className="cf-input"
                          required
                          value={editingSubmission.title}
                          onChange={e => setEditingSubmission({ ...editingSubmission, title: e.target.value })}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Score *</label>
                          <input
                            type="number"
                            className="cf-input"
                            required
                            value={editingSubmission.score}
                            onChange={e => setEditingSubmission({ ...editingSubmission, score: Number(e.target.value) })}
                          />
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Max Score *</label>
                          <input
                            type="number"
                            className="cf-input"
                            required
                            value={editingSubmission.maxScore}
                            onChange={e => setEditingSubmission({ ...editingSubmission, maxScore: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Due Date</label>
                          <input
                            type="datetime-local"
                            className="cf-input"
                            value={editingSubmission.dueDate}
                            onChange={e => setEditingSubmission({ ...editingSubmission, dueDate: e.target.value })}
                          />
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Submission Date</label>
                          <input
                            type="datetime-local"
                            className="cf-input"
                            value={editingSubmission.submissionDate}
                            onChange={e => setEditingSubmission({ ...editingSubmission, submissionDate: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Override Status (Optional)</label>
                          <select
                            className="cf-input"
                            value={editingSubmission.status}
                            onChange={e => setEditingSubmission({ ...editingSubmission, status: e.target.value })}
                          >
                            <option value="">Auto-tag by Dates</option>
                            <option value="on_time">On-Time</option>
                            <option value="late">Late</option>
                            <option value="pending">Pending</option>
                            <option value="excused">Excused</option>
                          </select>
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Classroom URL</label>
                          <input
                            type="url"
                            className="cf-input"
                            value={editingSubmission.classroomLink}
                            onChange={e => setEditingSubmission({ ...editingSubmission, classroomLink: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" className="cf-btn-secondary" onClick={() => { setShowSubmissionModal(false); setEditingSubmission(null); }}>
                          Cancel
                        </button>
                        <button type="submit" className="cf-btn-primary">
                          Save Submission Record
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="app-footer">
        <span className="footer-line">Basic Introductory Computer Science Course (BICS) Portal</span>
        <span className="footer-line">Managed by Preliminary Examinations 2026</span>
        <span className="footer-line">© 2026 All rights reserved.</span>
      </footer>

      {/* SIGN OUT CONFIRMATION MODAL */}
      {user && showLogoutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="cf-card" style={{ width: '350px', padding: '20px', margin: 0, border: '1px solid #cbd5e1' }}>
            <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', padding: '12px 20px' }}>
              Confirm Exit
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img src="/logo.png" alt="BICS Logo" style={{ height: '70px', objectFit: 'contain', marginBottom: '20px' }} />
              <p style={{ fontSize: '10pt', marginBottom: '20px', color: '#475569', textAlign: 'center', lineHeight: '1.4' }}>
                Are you sure you want to sign out from the BICS Portal?
              </p>
              <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
                <button className="cf-btn-secondary" style={{ flexGrow: 1 }} onClick={() => setShowLogoutModal(false)}>
                  Cancel
                </button>
                <button className="cf-btn-primary" style={{ flexGrow: 1, color: '#e11d48', borderColor: '#e11d48' }} onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* CANDIDATE DETAIL & VERIFICATION MODAL */}
        {selectedCandidate && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div className="cf-card" style={{ width: '80%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '20px', border: '1px solid #b9c9fe', boxShadow: 'none', backgroundColor: '#fff' }}>
              <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Candidate File: {selectedCandidate.name} ({selectedCandidate.studentId})</span>
                <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => setSelectedCandidate(null)}></button>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '25px' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} />
                    <span>Core Personal Information</span>
                  </div>
                  {selectedCandidate.registrationSubmitted ? (
                    <div className="profile-info-grid" style={{ gridTemplateColumns: '120px 1fr' }}>
                      <span className="profile-info-label">Full Name:</span>
                      <span className="profile-info-value">{selectedCandidate.registrationData?.preferredName}</span>
                      <span className="profile-info-label">Date of Birth:</span>
                      <span className="profile-info-value">{selectedCandidate.registrationData?.dob}</span>
                      <span className="profile-info-label">Permanent:</span>
                      <span className="profile-info-value">{selectedCandidate.registrationData?.permanentAddress}</span>
                      <span className="profile-info-label">Local Address:</span>
                      <span className="profile-info-value">{selectedCandidate.registrationData?.localAddress}</span>
                      <span className="profile-info-label">Personal Phone:</span>
                      <span className="profile-info-value">{selectedCandidate.registrationData?.personalPhone}</span>
                      <span className="profile-info-label">College Email:</span>
                      <span className="profile-info-value">{selectedCandidate.registrationData?.collegeEmail}</span>
                    </div>
                  ) : (
                    <p style={{ fontStyle: 'italic', color: '#666' }}>Registration form not submitted yet.</p>
                  )}
                </div>

                {selectedCandidate.registrationSubmitted && (
                  <div style={{ flex: '1 1 250px' }}>
                    <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Image size={14} />
                      <span>Uploaded Attachments</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <span className="cf-label" style={{ display: 'block', marginBottom: '2px' }}>Profile Photo</span>
                        <img src={selectedCandidate.registrationData?.photoUrl} alt="Photo" style={{ width: '80px', height: '80px', objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                      </div>
                      <div>
                        <span className="cf-label" style={{ display: 'block', marginBottom: '2px' }}>Signature</span>
                        <img src={selectedCandidate.registrationData?.signatureUrl} alt="Signature" style={{ width: '120px', height: '40px', objectFit: 'contain', border: '1px solid #cbd5e1', backgroundColor: '#fff' }} />
                      </div>
                      <div>
                        <a href={selectedCandidate.registrationData?.undertakingUrl} target="_blank" rel="noreferrer" className="cf-btn-secondary" style={{ display: 'inline-block', padding: '4px 8px', fontSize: '8.5pt' }}>
                          <FileText size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> View Undertaking Document
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* FEEDBACK RESPONSES SECTION */}
              <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileEdit size={14} />
                <span>Submitted Feedbacks &amp; Exit Forms</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
                
                {/* Mid Sem Feedback */}
                <div style={{ border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
                  <strong style={{ fontSize: '9.5pt', color: '#1e3a8a' }}>Mid-Semester Course Feedback</strong>
                  {selectedCandidate.midSemFeedback && Object.keys(selectedCandidate.midSemFeedback).length > 0 ? (
                    <div style={{ marginTop: '5px', fontSize: '8.5pt', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {Object.entries(selectedCandidate.midSemFeedback).map(([course, answers]) => (
                        <div key={course} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>
                          <strong>{course}</strong>: Rating 1: {answers[0]} • Rating 2: {answers[1]} • Rating 3: {answers[2]} • Recommended: {answers[3]} <br />
                          <span style={{ color: '#555' }}>Comments: {answers[4] || "No comments"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontStyle: 'italic', color: '#666', fontSize: '8.5pt', margin: '3px 0 0 0' }}>Not submitted yet.</p>
                  )}
                </div>

                {/* End Sem Feedback */}
                <div style={{ border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
                  <strong style={{ fontSize: '9.5pt', color: '#1e3a8a' }}>End-Semester Course Feedback</strong>
                  {selectedCandidate.endSemFeedback && Object.keys(selectedCandidate.endSemFeedback).length > 0 ? (
                    <div style={{ marginTop: '5px', fontSize: '8.5pt', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {Object.entries(selectedCandidate.endSemFeedback).map(([course, answers]) => (
                        <div key={course} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>
                          <strong>{course}</strong>: Rating 1: {answers[0]} • Rating 2: {answers[1]} • Rating 3: {answers[2]} • Recommended: {answers[3]} <br />
                          <span style={{ color: '#555' }}>Comments: {answers[4] || "No comments"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontStyle: 'italic', color: '#666', fontSize: '8.5pt', margin: '3px 0 0 0' }}>Not submitted yet.</p>
                  )}
                </div>

                {/* Exit Form */}
                <div style={{ border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
                  <strong style={{ fontSize: '9.5pt', color: '#1e3a8a' }}>Exit Program Form</strong>
                  {selectedCandidate.exitFormSubmitted && selectedCandidate.exitAnswers ? (
                    <div style={{ marginTop: '5px', fontSize: '8.5pt' }}>
                      Rating BICS: <strong>{selectedCandidate.exitAnswers.rating} / 5</strong> <br />
                      Recommendation: <strong>{selectedCandidate.exitAnswers.recommendation}</strong> <br />
                      Reason for exit: <span style={{ color: '#555' }}>{selectedCandidate.exitAnswers.reason}</span>
                    </div>
                  ) : (
                    <p style={{ fontStyle: 'italic', color: '#666', fontSize: '8.5pt', margin: '3px 0 0 0' }}>Not submitted yet.</p>
                  )}
                </div>
              </div>

              {/* VERIFICATION ACTIONS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                <div>
                  <span>Verification Status: </span>
                  <span className={`status-badge ${selectedCandidate.registrationStatus === 'Approved' ? 'status-eligible' : selectedCandidate.registrationStatus === 'Rejected' ? 'status-ineligible' : ''}`} style={{ padding: '3px 8px', fontSize: '9pt' }}>
                    {selectedCandidate.registrationStatus || 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {selectedCandidate.registrationSubmitted && (
                    <>
                      <button className="cf-btn-primary" style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }} onClick={() => handleVerifyRegistration(selectedCandidate.id || selectedCandidate._id, 'Rejected')}>
                        Reject File
                      </button>
                      <button className="cf-btn-primary" style={{ backgroundColor: '#16a34a', borderColor: '#15803d' }} onClick={() => handleVerifyRegistration(selectedCandidate.id || selectedCandidate._id, 'Approved')}>
                        Approve File
                      </button>
                    </>
                  )}
                  <button className="cf-btn-secondary" onClick={() => setSelectedCandidate(null)}>Close File</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REGISTRATION SUBMIT CONFIRMATION MODAL */}
        {showRegConfirmModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div className="cf-card" style={{ width: '380px', padding: '15px', margin: 0, border: '1px solid #b9c9fe', boxWith: 'none' }}>
              <div className="cf-card-title" style={{ marginTop: '-15px', marginLeft: '-15px', marginRight: '-15px', marginBottom: '15px' }}>
                Confirm Registration
              </div>
              <p style={{ fontSize: '9.5pt', marginBottom: '20px', color: '#333', lineHeight: '1.6' }}>
                Are you sure you want to submit your BICS course registration form? Once submitted, your profile will be locked for verification.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="cf-btn-secondary" style={{ flexGrow: 1 }} onClick={() => setShowRegConfirmModal(false)}>
                  Cancel
                </button>
                <button type="button" className="cf-btn-primary" style={{ flexGrow: 1, color: '#3b5998', borderColor: '#3b5998' }} onClick={() => { setShowRegConfirmModal(false); startStudentRegistrationUpload(); }}>
                  Confirm Submit
                </button>
              </div>
            </div>
          </div>
        )}

      {/* AUTHENTICATION LOADING SCREEN */}
      {authLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000000
        }}>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '15px'
          }}>
            <div style={{
              width: '50px',
              height: '50px',
              border: '4px solid rgba(255, 255, 255, 0.1)',
              borderTopColor: '#ffffff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <div style={{
              color: '#ffffff',
              fontSize: '11pt',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
              textAlign: 'center',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {loadingMessage}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DIALOG MODAL SYSTEM */}
      {modalState.isOpen && (
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
            maxWidth: '500px',
            padding: '24px',
            margin: 0,
            border: '1px solid #e2e8f0',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '13pt', color: '#002147', fontWeight: 'bold', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
              {modalState.title}
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '10pt', color: '#475569', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
              {modalState.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {modalState.onConfirm && (
                <button
                  type="button"
                  className="cf-btn-secondary"
                  onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                  style={{ minWidth: '80px', padding: '6px 12px', fontSize: '9pt' }}
                >
                  {modalState.cancelText}
                </button>
              )}
              <button
                type="button"
                className="cf-btn-primary"
                onClick={() => {
                  if (modalState.onConfirm) {
                    modalState.onConfirm();
                  } else {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                  }
                }}
                style={{ minWidth: '80px', padding: '6px 12px', fontSize: '9pt' }}
              >
                {modalState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentProctorDashboard({ sub, onClose, fetchLiveSubmissions }) {
  const [logs, setLogs] = useState(sub.proctoringLog?.events || []);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [status, setStatus] = useState(sub.status || 'started');
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = React.useRef(null);
  const subId = sub.id || sub._id;

  const setVideoRef = React.useCallback((node) => {
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
            {logs.length === 0 ? (
              <div style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>
                No compliance events recorded.
              </div>
            ) : (
              logs.map((log, idx) => {
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
