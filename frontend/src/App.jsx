import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LedgerUploadForm from './components/LedgerUploadForm';
import RichText from './components/RichText';
import StudentProctorDashboard from './components/StudentProctorDashboard';

import NotFound from './pages/NotFound';
import Login from './pages/Login';
import HomeDashboard from './pages/HomeDashboard';
import StudentRegistration from './pages/StudentRegistration';
import StudentInfo from './pages/StudentInfo';
import ExaminationScheduleView from './pages/ExaminationScheduleView';
import LecturesView from './pages/LecturesView';
import MaterialsView from './pages/MaterialsView';
import OnlineTestsView from './pages/OnlineTestsView';
import SubmissionsView from './pages/SubmissionsView';
import HallTicketView from './pages/HallTicketView';
import SubmissionsVerificationView from './pages/SubmissionsVerificationView';
import SupportTicketView from './pages/SupportTicketView';
import CourseFeedbackView from './pages/CourseFeedbackView';
import StudentCoC from './pages/StudentCoC';
import ExitFormView from './pages/ExitFormView';
import ChangePassword from './pages/ChangePassword';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCandidates from './pages/admin/AdminCandidates';
import AdminCoursework from './pages/admin/AdminCoursework';
import AdminTests from './pages/admin/AdminTests';
import AdminLogs from './pages/admin/AdminLogs';
import AdminProctoring from './pages/admin/AdminProctoring';
import AdminTickets from './pages/admin/AdminTickets';
import AdminSubmissions from './pages/admin/AdminSubmissions';
import AdminObjections from './pages/admin/AdminObjections';
import AdminRecycleBin from './pages/admin/AdminRecycleBin';
import AdminAttendance from './pages/admin/AdminAttendance';
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, X, Bell, User, Lock, LogOut, ChevronDown, ChevronRight, 
  Upload, FileText, CheckCircle, AlertTriangle, HelpCircle, Calendar, ShieldAlert,
  Key, Video, BookOpen, ClipboardList, Settings, Users,
  GraduationCap, MessageSquare, Loader2, Clock, XCircle, Image, FileEdit, Activity,
  Volume2, VolumeX, Eye, Play, Pause, RefreshCw, Trash2, Ticket, Mail, LifeBuoy,
  Check, Plus, Code, Home, Phone, Layers, Printer, ExternalLink, Download, Flag, RotateCcw
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

const API_ACCESS_SECRET = import.meta.env.VITE_API_ACCESS_SECRET || '';

// Automatically attach apiSecret query parameter to all backend API requests
if (typeof window !== 'undefined' && window.fetch && !window.__bics_fetch_patched) {
  window.__bics_fetch_patched = true;
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    const secret = API_ACCESS_SECRET || 
                   localStorage.getItem('portal_api_secret') || 
                   window.__BICS_API_SECRET__ || 
                   'qwertty';

    let urlString = '';
    if (typeof resource === 'string') {
      urlString = resource;
    } else if (resource && typeof resource.url === 'string') {
      urlString = resource.url;
    }

    const isExternal = urlString.includes('tfhub.dev') || 
                       urlString.includes('googleapis.com') || 
                       urlString.includes('jsdelivr.net') || 
                       urlString.includes('unpkg.com') ||
                       urlString.includes('cloudinary.com');

    const isBackendApi = (urlString.startsWith('/api') || 
                          urlString.includes('/api/') || 
                          (typeof API_BASE !== 'undefined' && API_BASE && urlString.startsWith(API_BASE)) ||
                          urlString.startsWith(window.location.origin) ||
                          (!urlString.startsWith('http://') && !urlString.startsWith('https://'))) && !isExternal;

    if (secret && isBackendApi && !urlString.includes('apiSecret=') && !urlString.includes('apiKey=')) {
      const separator = urlString.includes('?') ? '&' : '?';
      const targetUrl = `${urlString}${separator}apiSecret=${encodeURIComponent(secret)}`;
      if (typeof resource === 'string') {
        return originalFetch.call(this, targetUrl, init);
      } else if (resource && typeof resource === 'object') {
        return originalFetch.call(this, new Request(targetUrl, resource), init);
      }
    }
    return originalFetch.call(this, resource, init);
  };
}

const COURSES_LIST = [
  "R526CS01T - Introduction to Computer Science",
  "R526CS02T - Programming Fundamentals with C++",
  "R526CS03T - Basics of Web Development",
  "R526CS04T - Mathematical Thinking",
  "R526CS02L - Programming Fundamentals with C++ Lab",
  "R526CS03L - Basics of Web Development Lab"
];

// Helper component to render KaTeX math expressions + basic bold/italics/code markdown
export default function App() {
  const toLocalISOString = (dateOrStr) => {
    if (!dateOrStr) return '';
    const date = new Date(dateOrStr);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().substring(0, 16);
  };



  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('bics_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() < parsed.expiry) {
          return parsed.user;
        } else {
          localStorage.removeItem('bics_session');
        }
      }
      const temp = sessionStorage.getItem('bics_session');
      if (temp) {
        const parsed = JSON.parse(temp);
        return parsed.user;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });
  const [studentProfile, setStudentProfile] = useState(null); // Full candidate details
  const [ledgerQrData, setLedgerQrData] = useState(null);
  const [systemConfig, setSystemConfig] = useState(null);
  
  // Navigation states
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setViewState] = useState(() => {
    const pathToView = {
      '/': 'login',
      '': 'login',
      '/login': 'login',
      '/home': 'announcements',
      '/student/course-registration': 'register',
      '/student/information': 'info',
      '/student/coc': 'conduct',
      '/student/information/change-password': 'changepassword',
      '/coursework/lectures': 'lectures',
      '/coursework/materials': 'materials',
      '/coursework/online-tests': 'tests',
      '/submissions/classroom': 'submissions',
      '/submissions/verification': 'verification',
      '/examination/schedule': 'schedule',
      '/examination/hall-ticket': 'hallticket',
      '/support/ticket': 'contact',
      '/support/feedback/general': 'contact',
      '/support/feedback': 'midsem',
      '/exit/form': 'exit',
      '/admin/dashboard': 'admin',
      '/admin/candidates': 'admin_candidates',
      '/admin/attendance': 'admin_attendance',
      '/admin/coursework': 'admin_coursework',
      '/admin/logs': 'admin_logs',
      '/admin/proctoring': 'admin_proctoring',
      '/admin/tickets': 'admin_tickets',
      '/admin/submissions': 'admin_submissions',
      '/admin/tests': 'admin_tests',
      '/admin/objections': 'admin_objections',
      '/admin/recyclebin': 'admin_recyclebin'
    };
    const matched = pathToView[location.pathname];
    return matched !== undefined ? matched : 'not_found';
  });

  const viewToPathMap = {
    login: '/login',
    announcements: '/home',
    register: '/student/course-registration',
    info: '/student/information',
    conduct: '/student/coc',
    changepassword: '/student/information/change-password',
    lectures: '/coursework/lectures',
    materials: '/coursework/materials',
    tests: '/coursework/online-tests',
    onlinetest: '/coursework/online-tests',
    submissions: '/submissions/classroom',
    verification: '/submissions/verification',
    schedule: '/examination/schedule',
    hallticket: '/examination/hall-ticket',
    contact: '/support/ticket',
    midsem: '/support/feedback',
    endsem: '/support/feedback',
    exit: '/exit/form',
    admin: '/admin/dashboard',
    admin_candidates: '/admin/candidates',
    admin_attendance: '/admin/attendance',
    admin_coursework: '/admin/coursework',
    admin_logs: '/admin/logs',
    admin_proctoring: '/admin/proctoring',
    admin_tickets: '/admin/tickets',
    admin_submissions: '/admin/submissions',
    admin_tests: '/admin/tests',
    admin_objections: '/admin/objections',
    admin_recyclebin: '/admin/recyclebin'
  };

  const setView = (newView) => {
    setViewState(newView);
    const targetPath = viewToPathMap[newView];
    if (targetPath && targetPath !== location.pathname) {
      navigate(targetPath);
    }
  };

  useEffect(() => {
    const pathToView = {
      '/': 'login',
      '': 'login',
      '/login': 'login',
      '/home': 'announcements',
      '/student/course-registration': 'register',
      '/student/information': 'info',
      '/student/coc': 'conduct',
      '/student/information/change-password': 'changepassword',
      '/coursework/lectures': 'lectures',
      '/coursework/materials': 'materials',
      '/coursework/online-tests': 'tests',
      '/submissions/classroom': 'submissions',
      '/submissions/verification': 'verification',
      '/examination/schedule': 'schedule',
      '/examination/hall-ticket': 'hallticket',
      '/support/ticket': 'contact',
      '/support/feedback/general': 'contact',
      '/support/feedback': 'midsem',
      '/exit/form': 'exit',
      '/admin/dashboard': 'admin',
      '/admin/candidates': 'admin_candidates',
      '/admin/attendance': 'admin_attendance',
      '/admin/coursework': 'admin_coursework',
      '/admin/logs': 'admin_logs',
      '/admin/proctoring': 'admin_proctoring',
      '/admin/tickets': 'admin_tickets',
      '/admin/submissions': 'admin_submissions',
      '/admin/tests': 'admin_tests',
      '/admin/objections': 'admin_objections',
      '/admin/recyclebin': 'admin_recyclebin'
    };
    const matched = pathToView[location.pathname];
    const nextView = matched !== undefined ? matched : 'not_found';

    if (!user) {
      // 2. If not logged in, redirect for any internal path (right or wrong) to /main/login
      if (location.pathname !== '/login' && location.pathname !== '/' && location.pathname !== '') {
        navigate('/login', { replace: true });
        setViewState('login');
        return;
      }
    } else {
      // 1. When logged in, if wrong path, invalid view, or unauthorized path, redirect to role default page
      if (nextView === 'not_found' || nextView === 'login' || !isViewAllowed(nextView)) {
        const defaultPath = user.role === 'admin' ? '/admin/dashboard' : '/home';
        const defaultView = user.role === 'admin' ? 'admin' : 'announcements';
        if (location.pathname !== defaultPath) {
          navigate(defaultPath, { replace: true });
          setViewState(defaultView);
          return;
        }
      }
    }

    if (nextView !== view) {
      setViewState(nextView);
    }
  }, [location.pathname, user]);
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
  const [activeCourseFeedbackIdx, setActiveCourseFeedbackIdx] = useState(0);

  // Admin Examination Attendance Sheet states
  const [attendanceCourseCode, setAttendanceCourseCode] = useState('R526CS01T');
  const [attendanceLabSheetType, setAttendanceLabSheetType] = useState('written'); // 'written' | 'online' | 'viva'
  const [attendanceRoomNo, setAttendanceRoomNo] = useState('AL 001');
  const [attendanceBenchPosition, setAttendanceBenchPosition] = useState('Left');
  const [attendanceEligibilityFilter, setAttendanceEligibilityFilter] = useState('all'); // 'all' | 'eligible_only'
  const [attendanceExamTypeOverride, setAttendanceExamTypeOverride] = useState(''); // '' (auto-synced with adminExamType) | 'MST' | 'ESE'
  const [attendanceMainHeader, setAttendanceMainHeader] = useState('Preliminary Examinations 2026');
  const [attendanceSubHeader, setAttendanceSubHeader] = useState('Basic Introductory Computer Science (BICS) Course');
  const [attendanceDegree, setAttendanceDegree] = useState('Bachelor of Technology');
  const [attendanceProgram, setAttendanceProgram] = useState('Computer Engineering');
  const [attendanceExamName, setAttendanceExamName] = useState('');
  const [attendanceSemester, setAttendanceSemester] = useState('I');
  const [attendanceStudentsPerPage, setAttendanceStudentsPerPage] = useState(18);
  const [attendanceCustomDate, setAttendanceCustomDate] = useState('');
  const [attendanceCustomTime, setAttendanceCustomTime] = useState('');
  const [attendanceCustomMarks, setAttendanceCustomMarks] = useState('');

  // Exit Form state
  const [exitAnswers, setExitAnswers] = useState({ reason: '', recommendation: '', rating: '5' });
  const [exitSuccess, setExitSuccess] = useState('');

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [adminTimetableNotice, setAdminTimetableNotice] = useState('');
  const [adminExamType, setAdminExamType] = useState('midsem');
  const [adminTimetable, setAdminTimetable] = useState([
    { code: "R526CS01T", course: "Introduction to Computer Science", date: '11/09/2026', time: '03:15 PM to 04:45 PM', marks: 100 },
    { code: "R526CS02T", course: "Programming Fundamentals with C++", date: '12/09/2026', time: '03:15 PM to 04:45 PM', marks: 100 },
    { code: "R526CS03T", course: "Basics of Web Development", date: '13/09/2026', time: '03:15 PM to 04:45 PM', marks: 100 },
    { code: "R526CS04T", course: "Mathematical Thinking", date: '14/09/2026', time: '03:15 PM to 04:45 PM', marks: 100 },
    { code: "R526CS02L", course: "Programming Fundamentals with C++ Lab", date: '15/09/2026', time: '02:00 PM to 05:00 PM', marks: 50 },
    { code: "R526CS03L", course: "Basics of Web Development Lab", date: '16/09/2026', time: '02:00 PM to 05:00 PM', marks: 50 }
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

  // Admin Objections states
  const [adminObjectionsList, setAdminObjectionsList] = useState([]);
  const [adminObjectionsFilter, setAdminObjectionsFilter] = useState('all');
  const [adminObjectionModal, setAdminObjectionModal] = useState({
    isOpen: false,
    objection: null,
    status: 'resolved',
    revisedMarks: 0,
    adminRemarks: '',
    submitting: false,
    error: '',
    success: ''
  });

  // Admin Recycle Bin States
  const [recycleBinItems, setRecycleBinItems] = useState([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const [recycleBinError, setRecycleBinError] = useState('');
  const [recycleBinSuccess, setRecycleBinSuccess] = useState('');

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
      setActiveStudentTests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error fetching active student tests:", e);
      setActiveStudentTests([]);
    }
  };

  const fetchAdminTests = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/tests`);
      const data = await res.json();
      setAdminTests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error fetching admin tests:", e);
      setAdminTests([]);
    }
  };

  const fetchSubmittedTestsList = async (candidateId) => {
    try {
      const res = await fetch(`${API_BASE}/tests/submitted?candidateId=${candidateId}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSubmittedTestsList(list);
      if (list.length > 0) {
        setSelectedVerificationTestId(list[0].id || list[0]._id);
      }
    } catch (e) {
      console.error("Failed to retrieve candidate submitted tests:", e);
      setSubmittedTestsList([]);
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
 
      // Redirect to FrontendOT (using port 5174 in development, or /terminal subpath on Netlify)
      const otBaseUrl = window.location.origin.includes('localhost')
        ? 'http://localhost:5174/terminal'
        : `${window.location.origin}/terminal`;
      const examUrl = otBaseUrl.includes('?') 
        ? `${otBaseUrl}&token=${data.token}`
        : `${otBaseUrl}/test?token=${data.token}`;
      
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
      "Move Test to Recycle Bin",
      "Are you sure you want to move this test configuration to the Recycle Bin? All linked candidate submissions will be safely protected and held in the Recycle Bin for 24 hours.",
      async () => {
        try {
          const res = await fetch(`${API_BASE}/admin/tests/${id}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.success) {
            showModalAlert("Moved to Recycle Bin", "The test configuration and linked candidate submissions have been moved to the Recycle Bin (24 Hours Retention).");
            fetchAdminTests();
            if (typeof fetchRecycleBinItems === 'function') fetchRecycleBinItems();
            if (selectedExamSubmission && selectedExamSubmission.testId === id) {
              setSelectedExamSubmission(null);
            }
          }
        } catch (err) {
          console.error(err);
          showModalAlert("Deletion Failure", "Failed to move test configuration to Recycle Bin. Please check connection.");
        }
      },
      "Move to Recycle Bin",
      "Cancel"
    );
  };

  const fetchExamSubmissions = async (testId) => {
    setLoadingMessage("Fetching exam submission details...");
    try {
      const res = await fetch(`${API_BASE}/admin/tests/submissions/${testId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAdminExamSubmissions(data);
      } else if (data && Array.isArray(data.submissions)) {
        setAdminExamSubmissions(data.submissions);
      } else {
        setAdminExamSubmissions([]);
      }
    } catch (err) {
      console.error(err);
      setAdminExamSubmissions([]);
    } finally {
      setLoadingMessage('');
    }
  };

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    if (!selectedExamSubmission) return;

    const testConfig = adminTests.find(t => (t.id || t._id) === selectedExamSubmission.testId);

    // Automatically calculate total coding score from individual fields
    const totalCodingScore = Object.entries(adminGradingAnswers).reduce((sum, [qId, score]) => {
      const ans = selectedExamSubmission.answers?.find(a => a.questionId === qId);
      return (ans && (ans.type === 'coding' || ans.type === 'web')) ? sum + Number(score || 0) : sum;
    }, 0);

    const updatedAnswers = selectedExamSubmission.answers?.map(ans => {
      const questionConfig = testConfig?.questions?.find(q => q.id === ans.questionId);
      const evalRes = codingEvaluationResults[ans.questionId];

      let updatedTestCaseResults = ans.testCaseResults;
      if (evalRes && evalRes.results && Array.isArray(evalRes.results) && evalRes.results.length > 0) {
        updatedTestCaseResults = evalRes.results.map((r, rIdx) => {
          const tc = questionConfig?.testCases?.[rIdx];
          const isAccepted = r.status === 'Accepted';
          const pts = tc ? Number(tc.points || 0) : 0;
          return {
            status: r.status || (isAccepted ? 'Accepted' : 'Wrong Answer'),
            points: pts,
            scoredPoints: isAccepted ? pts : 0
          };
        });
      }

      return {
        ...ans,
        score: (ans.type === 'coding' || ans.type === 'web') ? Number(adminGradingAnswers[ans.questionId] || 0) : ans.score,
        testCaseResults: updatedTestCaseResults || ans.testCaseResults
      };
    });

    try {
      const res = await fetch(`${API_BASE}/admin/tests/evaluate/${selectedExamSubmission.id || selectedExamSubmission._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codingScore: totalCodingScore,
          feedback: adminGradingFeedback,
          reevaluationStatus: selectedExamSubmission.reevaluation?.applied ? adminReevalStatus : undefined,
          resolutionFeedback: selectedExamSubmission.reevaluation?.applied ? adminReevalResolutionFeedback : undefined,
          answers: updatedAnswers
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
        const resultsList = data.results || [];
        setCodingEvaluationResults(prev => ({
          ...prev,
          [questionId]: {
            isRunning: false,
            results: resultsList,
            compileError: data.status === 'Compilation Error' ? data.compileError : null,
            success: data.success
          }
        }));

        // Calculate auto-evaluated score based on compiler testcase verdicts
        let autoPoints = 0;
        resultsList.forEach((r, rIdx) => {
          if (r.status === 'Accepted') {
            autoPoints += Number(testCases[rIdx]?.points || 0);
          }
        });

        // Update score in grading form
        setAdminGradingAnswers(prev => ({
          ...prev,
          [questionId]: autoPoints
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
          if (view === 'login') {
            setView(parsed.user.role === 'admin' ? 'admin' : 'announcements');
          }
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
          if (view === 'login') {
            setView(parsed.user.role === 'admin' ? 'admin' : 'announcements');
          }
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
      if (data) {
        setSystemConfig(prev => ({ ...(prev || {}), ...data }));
      }
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

  const fetchAdminObjections = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/objections`);
      if (res.ok) {
        const data = await res.json();
        setAdminObjectionsList(Array.isArray(data) ? data : (data && Array.isArray(data.objections) ? data.objections : []));
      } else {
        setAdminObjectionsList([]);
      }
    } catch (err) {
      console.error("Failed to fetch admin objections:", err);
      setAdminObjectionsList([]);
    }
  };

  const handleResolveObjection = async (e) => {
    if (e) e.preventDefault();
    if (!adminObjectionModal.objection) return;
    setAdminObjectionModal(prev => ({ ...prev, submitting: true, error: '', success: '' }));
    try {
      const res = await fetch(`${API_BASE}/admin/tests/objection/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: adminObjectionModal.objection.submissionId,
          questionId: adminObjectionModal.objection.questionId,
          questionIndex: adminObjectionModal.objection.questionIndex,
          status: adminObjectionModal.status,
          adminRemarks: adminObjectionModal.adminRemarks,
          revisedMarks: adminObjectionModal.status === 'resolved' ? Number(adminObjectionModal.revisedMarks || 0) : undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminObjectionModal(prev => ({ ...prev, submitting: false, success: 'Objection status and marks updated successfully.' }));
        setTimeout(() => {
          setAdminObjectionModal(prev => ({ ...prev, isOpen: false }));
          fetchAdminObjections();
        }, 1000);
      } else {
        setAdminObjectionModal(prev => ({ ...prev, submitting: false, error: data.error || 'Failed to resolve objection.' }));
      }
    } catch (err) {
      setAdminObjectionModal(prev => ({ ...prev, submitting: false, error: 'Network error communicating with backend.' }));
    }
  };

  const fetchRecycleBinItems = async () => {
    setRecycleBinLoading(true);
    setRecycleBinError('');
    try {
      const res = await fetch(`${API_BASE}/admin/recycle-bin`);
      if (res.ok) {
        const data = await res.json();
        setRecycleBinItems(Array.isArray(data) ? data : []);
      } else {
        setRecycleBinItems([]);
      }
    } catch (err) {
      console.error("Failed to fetch recycle bin items:", err);
      setRecycleBinItems([]);
      setRecycleBinError('Could not connect to backend to fetch recycle bin items.');
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handleRestoreRecycleItem = async (itemId) => {
    try {
      const res = await fetch(`${API_BASE}/admin/recycle-bin/restore/${itemId}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showModalAlert("Item Restored", "Item and all linked candidate submissions have been successfully restored to active status!");
        setRecycleBinSuccess('Item and all linked data restored successfully!');
        setTimeout(() => setRecycleBinSuccess(''), 3000);
        fetchRecycleBinItems();
        fetchAdminTests();
      } else {
        showModalAlert("Restore Error", data.error || 'Failed to restore item.');
      }
    } catch (err) {
      console.error("Error restoring recycle item:", err);
      showModalAlert("Network Error", "Network error occurred while attempting to restore item.");
    }
  };

  const handlePurgeRecycleItem = async (itemId) => {
    showModalConfirm(
      "Permanently Delete Item",
      "Are you sure you want to PERMANENTLY delete this item? This action CANNOT be undone.",
      async () => {
        try {
          const res = await fetch(`${API_BASE}/admin/recycle-bin/purge/${itemId}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok && data.success) {
            showModalAlert("Item Purged", "Item permanently purged from database.");
            setRecycleBinSuccess('Item permanently purged from database.');
            setTimeout(() => setRecycleBinSuccess(''), 3000);
            fetchRecycleBinItems();
          } else {
            showModalAlert("Purge Error", data.error || 'Failed to purge item.');
          }
        } catch (err) {
          console.error("Error purging recycle item:", err);
          showModalAlert("Network Error", "Network error occurred while attempting to purge item.");
        }
      },
      "Yes, Purge Permanently",
      "Cancel"
    );
  };

  const handlePurgeAllRecycleItems = async () => {
    showModalConfirm(
      "Purge All Recycled Items",
      "Are you sure you want to PERMANENTLY delete ALL items in the Recycle Bin? All cascaded student submissions and logs will be permanently erased.",
      async () => {
        try {
          const res = await fetch(`${API_BASE}/admin/recycle-bin/purge-all`, { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.success) {
            showModalAlert("Recycle Bin Cleared", "All recycled items permanently deleted.");
            setRecycleBinSuccess('Recycle bin cleared completely!');
            setTimeout(() => setRecycleBinSuccess(''), 3000);
            fetchRecycleBinItems();
          } else {
            showModalAlert("Clear Error", data.error || 'Failed to clear recycle bin.');
          }
        } catch (err) {
          console.error("Error clearing recycle bin:", err);
          showModalAlert("Network Error", "Network error occurred while attempting to clear recycle bin.");
        }
      },
      "Yes, Purge All",
      "Cancel"
    );
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

    // Validation check across all courses
    let valid = true;
    let missingInfo = '';
    let firstMissingIdx = -1;

    for (let i = 0; i < COURSES_LIST.length; i++) {
      const course = COURSES_LIST[i];
      const q1 = feedbackAnswers[course]?.[0];
      const q2 = feedbackAnswers[course]?.[1];
      const q3 = feedbackAnswers[course]?.[2];
      const q4 = feedbackAnswers[course]?.[3];
      const q5 = feedbackAnswers[course]?.[4];

      if (!q1 || !q2 || !q3 || !q4 || !q5 || q5.trim() === '') {
        valid = false;
        missingInfo = `Please answer all questions and provide general remarks for "${course}".`;
        firstMissingIdx = i;
        break;
      }
    }

    if (!valid) {
      if (firstMissingIdx !== -1) {
        setActiveCourseFeedbackIdx(firstMissingIdx);
      }
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

  const isViewAllowed = (targetView = view) => {
    if (targetView === 'login') return true;
    if (!user) return false;
    if (targetView === 'changepassword') return true;
    if ((targetView === 'onlinetest' || targetView === 'onlinetest_setup') && !allowedTestAccess) return false;
    
    if (user.role === 'admin') {
      return ['admin', 'admin_candidates', 'admin_attendance', 'admin_coursework', 'admin_tests', 'admin_logs', 'admin_proctoring', 'admin_tickets', 'admin_submissions', 'admin_objections', 'admin_recyclebin'].includes(targetView);
    }
    
    if (user.role === 'student') {
      return ['announcements', 'register', 'info', 'conduct', 'schedule', 'hallticket', 'verification', 'contact', 'midsem', 'endsem', 'exit', 'onlinetest', 'onlinetest_setup', 'lectures', 'materials', 'tests', 'submissions'].includes(targetView);
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
                  <button className={`sidebar-item ${view === 'admin_attendance' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_attendance'); setIsMobileSidebarOpen(false); fetchCandidates(); }}>
                    <FileText size={16} /> Examination Attendance
                  </button>
                  <button className={`sidebar-item ${view === 'admin_coursework' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_coursework'); setIsMobileSidebarOpen(false); }}>
                    <BookOpen size={16} /> Coursework
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
                  <button className={`sidebar-item ${view === 'admin_tests' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_tests'); setIsMobileSidebarOpen(false); }}>
                    <ClipboardList size={16} /> Tests Manager
                  </button>
                  <button className={`sidebar-item ${view === 'admin_objections' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_objections'); setIsMobileSidebarOpen(false); fetchAdminObjections(); }}>
                    <Flag size={16} style={{ color: '#b45309' }} /> Examination Objections
                    {adminObjectionsList.filter(o => o.status === 'pending').length > 0 && (
                      <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: '#fff', fontSize: '7.5pt', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                        {adminObjectionsList.filter(o => o.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <button className={`sidebar-item ${view === 'admin_recyclebin' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_recyclebin'); setIsMobileSidebarOpen(false); fetchRecycleBinItems(); }}>
                    <Trash2 size={16} style={{ color: '#ef4444' }} /> Recycle Bin (24h)
                    {recycleBinItems.length > 0 && (
                      <span style={{ marginLeft: 'auto', backgroundColor: '#64748b', color: '#fff', fontSize: '7.5pt', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                        {recycleBinItems.length}
                      </span>
                    )}
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
          
          {/* AUTOMATIC REDIRECT FALLBACKS */}
          {!user && view !== 'login' ? (
            <Login
              loginError={loginError}
              loginCreds={loginCreds}
              setLoginCreds={setLoginCreds}
              captchaCode={captchaCode}
              captchaInput={captchaInput}
              setCaptchaInput={setCaptchaInput}
              generateCaptcha={generateCaptcha}
              rememberMe={rememberMe}
              setRememberMe={setRememberMe}
              handleLoginSubmit={handleLoginSubmit}
            />
          ) : user && (view === 'not_found' || !isViewAllowed()) ? (
            <HomeDashboard
              systemConfig={systemConfig}
            />
          ) : (
            <>
              {view === 'login' && (
                <Login
                  loginError={loginError}
                  loginCreds={loginCreds}
                  setLoginCreds={setLoginCreds}
                  captchaCode={captchaCode}
                  captchaInput={captchaInput}
                  setCaptchaInput={setCaptchaInput}
                  generateCaptcha={generateCaptcha}
                  rememberMe={rememberMe}
                  setRememberMe={setRememberMe}
                  handleLoginSubmit={handleLoginSubmit}
                />
              )}

              {view === 'announcements' && systemConfig && (
                <HomeDashboard
                  systemConfig={systemConfig}
                />
              )}

              {view === 'register' && studentProfile && systemConfig && (
                <StudentRegistration
                  studentProfile={studentProfile}
                  systemConfig={systemConfig}
                  regError={regError}
                  regSuccess={regSuccess}
                  regForm={regForm}
                  setRegForm={setRegForm}
                  handleStudentRegistrationSubmit={handleStudentRegistrationSubmit}
                  handlePhotoChange={handlePhotoChange}
                  handleSigChange={handleSigChange}
                  handleUndertakingChange={handleUndertakingChange}
                />
              )}

              {view === 'info' && studentProfile && (
                <StudentInfo
                  studentProfile={studentProfile}
                />
              )}

              {view === 'schedule' && systemConfig && (
                <ExaminationScheduleView
                  systemConfig={systemConfig}
                />
              )}

              {view === 'lectures' && (
                <LecturesView
                  videoLectures={videoLectures}
                  selectedLecture={selectedLecture}
                  setSelectedLecture={setSelectedLecture}
                  getYouTubeEmbedUrl={getYouTubeEmbedUrl}
                  playgroundMode={playgroundMode}
                  setPlaygroundMode={setPlaygroundMode}
                  playgroundCppCode={playgroundCppCode}
                  setPlaygroundCppCode={setPlaygroundCppCode}
                  terminalLines={terminalLines}
                  setTerminalLines={setTerminalLines}
                  bufferedStdin={bufferedStdin}
                  setBufferedStdin={setBufferedStdin}
                  terminalInput={terminalInput}
                  setTerminalInput={setTerminalInput}
                  isPlayinggroundRunning={isPlayinggroundRunning}
                  handleRunPlaygroundCpp={handleRunPlaygroundCpp}
                  terminalEndRef={terminalEndRef}
                  isTerminalWaiting={isTerminalWaiting}
                  handleTerminalSubmit={handleTerminalSubmit}
                  playgroundWebTab={playgroundWebTab}
                  setPlaygroundWebTab={setPlaygroundWebTab}
                  playgroundWebHtml={playgroundWebHtml}
                  setPlaygroundWebHtml={setPlaygroundWebHtml}
                  playgroundWebCss={playgroundWebCss}
                  setPlaygroundWebCss={setPlaygroundWebCss}
                  playgroundWebJs={playgroundWebJs}
                  setPlaygroundWebJs={setPlaygroundWebJs}
                />
              )}

              {view === 'materials' && (
                <MaterialsView
                  courseMaterials={courseMaterials}
                />
              )}

              {view === 'tests' && (
                <OnlineTestsView
                  systemConfig={systemConfig}
                  activeStudentTests={activeStudentTests}
                  currentTime={currentTime}
                  enteringTestId={enteringTestId}
                  handleStartExam={handleStartExam}
                />
              )}

              {view === 'submissions' && (
                <SubmissionsView
                  ledgerQrData={ledgerQrData}
                  fetchStudentSubmissions={fetchStudentSubmissions}
                  studentProfile={studentProfile}
                  user={user}
                  activeSubmissionTab={activeSubmissionTab}
                  setActiveSubmissionTab={setActiveSubmissionTab}
                  studentSubmissions={studentSubmissions}
                  setContactSubject={setContactSubject}
                  setContactMessage={setContactMessage}
                  setContactSuccess={setContactSuccess}
                  setContactError={setContactError}
                  setContactSubView={setContactSubView}
                  setView={setView}
                />
              )}

              {view === 'hallticket' && studentProfile && systemConfig && (
                <HallTicketView
                  studentProfile={studentProfile}
                  systemConfig={systemConfig}
                  consentSuccess={consentSuccess}
                  consentChecked={consentChecked}
                  setConsentChecked={setConsentChecked}
                  handleSignConsent={handleSignConsent}
                  setView={setView}
                  fetchStudentProfile={fetchStudentProfile}
                  user={user}
                  fetchStudentSubmissions={fetchStudentSubmissions}
                  verificationSuccess={verificationSuccess}
                  verificationError={verificationError}
                  verificationCodeSent={verificationCodeSent}
                  sendingVerificationCode={sendingVerificationCode}
                  handleSendVerificationCode={handleSendVerificationCode}
                  handleVerifyCode={handleVerifyCode}
                  verificationEmailCode={verificationEmailCode}
                  setVerificationEmailCode={setVerificationEmailCode}
                  verifyingCode={verifyingCode}
                />
              )}

              {view === 'verification' && (
                <SubmissionsVerificationView
                  view={view}
                  submittedTestsList={submittedTestsList}
                />
              )}

              {view === 'contact' && studentProfile && (
                <SupportTicketView
                  studentProfile={studentProfile}
                  user={user}
                  contactSubView={contactSubView}
                  setContactSubView={setContactSubView}
                  contactSuccess={contactSuccess}
                  setContactSuccess={setContactSuccess}
                  contactError={contactError}
                  setContactError={setContactError}
                  fetchStudentTickets={fetchStudentTickets}
                  studentTickets={studentTickets}
                  contactCategory={contactCategory}
                  setContactCategory={setContactCategory}
                  contactSubject={contactSubject}
                  setContactSubject={setContactSubject}
                  contactMessage={contactMessage}
                  setContactMessage={setContactMessage}
                  isSubmittingContact={isSubmittingContact}
                  setIsSubmittingContact={setIsSubmittingContact}
                />
              )}

              {(view === 'midsem' || view === 'endsem') && studentProfile && systemConfig && (
                <CourseFeedbackView
                  feedbackType={feedbackType}
                  studentProfile={studentProfile}
                  systemConfig={systemConfig}
                  setView={setView}
                  COURSES_LIST={COURSES_LIST}
                  feedbackAnswers={feedbackAnswers}
                  activeCourseFeedbackIdx={activeCourseFeedbackIdx}
                  setActiveCourseFeedbackIdx={setActiveCourseFeedbackIdx}
                  feedbackSuccess={feedbackSuccess}
                  handleFeedbackSubmit={handleFeedbackSubmit}
                  handleFeedbackValueChange={handleFeedbackValueChange}
                />
              )}

              {view === 'conduct' && (
                <StudentCoC />
              )}

              {view === 'exit' && studentProfile && systemConfig && (
                <ExitFormView
                  systemConfig={systemConfig}
                  studentProfile={studentProfile}
                  exitSuccess={exitSuccess}
                  exitAnswers={exitAnswers}
                  setExitAnswers={setExitAnswers}
                  handleExitSubmit={handleExitSubmit}
                />
              )}

              {view === 'changepassword' && (
                <ChangePassword
                  pwdMessage={pwdMessage}
                  pwdError={pwdError}
                  handleChangePassword={handleChangePassword}
                  user={user}
                  studentProfile={studentProfile}
                  changePasswordCodeSent={changePasswordCodeSent}
                  sendingChangePasswordCode={sendingChangePasswordCode}
                  handleSendChangePasswordCode={handleSendChangePasswordCode}
                  changePasswordEmailCode={changePasswordEmailCode}
                  setChangePasswordEmailCode={setChangePasswordEmailCode}
                  pwdForm={pwdForm}
                  setPwdForm={setPwdForm}
                  changePasswordCaptchaCode={changePasswordCaptchaCode}
                  generateChangePasswordCaptcha={generateChangePasswordCaptcha}
                  changePasswordCaptchaInput={changePasswordCaptchaInput}
                  setChangePasswordCaptchaInput={setChangePasswordCaptchaInput}
                />
              )}

              {view === 'admin' && systemConfig && (
                <AdminDashboard
                  systemConfig={systemConfig}
                  adminMessage={adminMessage}
                  adminError={adminError}
                  handleToggleSetting={handleToggleSetting}
                  handleAddAnnouncement={handleAddAnnouncement}
                  newAnnouncement={newAnnouncement}
                  setNewAnnouncement={setNewAnnouncement}
                  adminExamType={adminExamType}
                  handleUpdateExamType={handleUpdateExamType}
                  handleUpdateTimetableNotice={handleUpdateTimetableNotice}
                  adminTimetableNotice={adminTimetableNotice}
                  setAdminTimetableNotice={setAdminTimetableNotice}
                  handleSaveExamTimetable={handleSaveExamTimetable}
                  handleAddTimetableRow={handleAddTimetableRow}
                  adminTimetable={adminTimetable}
                  handleTimetableCellChange={handleTimetableCellChange}
                  handleRemoveTimetableRow={handleRemoveTimetableRow}
                  handleAddClassTestRow={handleAddClassTestRow}
                  handleSaveClassTests={handleSaveClassTests}
                  adminClassTests={adminClassTests}
                  handleClassTestCellChange={handleClassTestCellChange}
                  handleRemoveClassTestRow={handleRemoveClassTestRow}
                />
              )}

              {view === 'admin_candidates' && systemConfig && (
                <AdminCandidates
                  systemConfig={systemConfig}
                  adminMessage={adminMessage}
                  adminError={adminError}
                  handleRegisterCandidateByAdmin={handleRegisterCandidateByAdmin}
                  newCandidate={newCandidate}
                  setNewCandidate={setNewCandidate}
                  candidatesList={candidatesList}
                  handleToggleEligibility={handleToggleEligibility}
                  setSelectedCandidate={setSelectedCandidate}
                />
              )}

              {view === 'admin_coursework' && systemConfig && (
                <AdminCoursework
                  systemConfig={systemConfig}
                  adminMessage={adminMessage}
                  adminError={adminError}
                  courseworkSuccess={courseworkSuccess}
                  courseworkError={courseworkError}
                  handleAddLecture={handleAddLecture}
                  newLecture={newLecture}
                  setNewLecture={setNewLecture}
                  videoLectures={videoLectures}
                  handleDeleteLecture={handleDeleteLecture}
                  handleAddMaterial={handleAddMaterial}
                  newMaterial={newMaterial}
                  setNewMaterial={setNewMaterial}
                  setMaterialFile={setMaterialFile}
                  courseMaterials={courseMaterials}
                  handleDeleteMaterial={handleDeleteMaterial}
                />
              )}

              {view === 'admin_tests' && systemConfig && (
                <AdminTests
                  systemConfig={systemConfig}
                  adminMessage={adminMessage}
                  adminError={adminError}
                  adminTests={adminTests}
                  fetchExamSubmissions={fetchExamSubmissions}
                  fetchAdminTests={fetchAdminTests}
                  fetchStudentActiveTests={fetchStudentActiveTests}
                  handleCreateTest={handleCreateTest}
                  handleEditTest={handleEditTest}
                  handleDeleteTest={handleDeleteTest}
                  showTestCreator={showTestCreator}
                  setShowTestCreator={setShowTestCreator}
                  creatorStep={creatorStep}
                  setCreatorStep={setCreatorStep}
                  editingQuestionIdx={editingQuestionIdx}
                  setEditingQuestionIdx={setEditingQuestionIdx}
                  editingTestConfigId={editingTestConfigId}
                  setEditingTestConfigId={setEditingTestConfigId}
                  newExamTitle={newExamTitle}
                  setNewExamTitle={setNewExamTitle}
                  newExamMarks={newExamMarks}
                  setNewExamMarks={setNewExamMarks}
                  newExamInstructions={newExamInstructions}
                  setNewExamInstructions={setNewExamInstructions}
                  newExamDuration={newExamDuration}
                  setNewExamDuration={setNewExamDuration}
                  newExamStart={newExamStart}
                  setNewExamStart={setNewExamStart}
                  newExamEnd={newExamEnd}
                  setNewExamEnd={setNewExamEnd}
                  newExamQuestions={newExamQuestions}
                  setNewExamQuestions={setNewExamQuestions}
                  imageUploadingIdx={imageUploadingIdx}
                  handleUploadQuestionImage={handleUploadQuestionImage}
                  adminExamSubmissions={adminExamSubmissions}
                  selectedExamSubmission={selectedExamSubmission}
                  setSelectedExamSubmission={setSelectedExamSubmission}
                  adminGradingCodingScore={adminGradingCodingScore}
                  setAdminGradingCodingScore={setAdminGradingCodingScore}
                  adminGradingFeedback={adminGradingFeedback}
                  setAdminGradingFeedback={setAdminGradingFeedback}
                  adminGradingAnswers={adminGradingAnswers}
                  setAdminGradingAnswers={setAdminGradingAnswers}
                  codingEvaluationResults={codingEvaluationResults}
                  setCodingEvaluationResults={setCodingEvaluationResults}
                  handleSaveEvaluation={handleSaveEvaluation}
                  setAdminReevalStatus={setAdminReevalStatus}
                  setAdminReevalResolutionFeedback={setAdminReevalResolutionFeedback}
                  adminReevalStatus={adminReevalStatus}
                  adminReevalResolutionFeedback={adminReevalResolutionFeedback}
                  adminActiveWebTabs={adminActiveWebTabs}
                  setAdminActiveWebTabs={setAdminActiveWebTabs}
                  runAdminCodeVerification={runAdminCodeVerification}
                  view={view}
                />
              )}

              {view === 'admin_logs' && (
                <AdminLogs
                  fetchSystemLogs={fetchSystemLogs}
                  logFilterActor={logFilterActor}
                  setLogFilterActor={setLogFilterActor}
                  setLogPage={setLogPage}
                  logFilterAction={logFilterAction}
                  setLogFilterAction={setLogFilterAction}
                  logFilterSeverity={logFilterSeverity}
                  setLogFilterSeverity={setLogFilterSeverity}
                  systemLogs={systemLogs}
                  logPage={logPage}
                />
              )}

              {view === 'admin_proctoring' && (
                <AdminProctoring
                  view={view}
                  fetchLiveSubmissions={fetchLiveSubmissions}
                  selectedProctorTest={selectedProctorTest}
                  setSelectedProctorTest={setSelectedProctorTest}
                  adminTests={adminTests}
                  selectedProctorStudent={selectedProctorStudent}
                  setSelectedProctorStudent={setSelectedProctorStudent}
                  liveSubmissions={liveSubmissions}
                />
              )}

              {view === 'admin_tickets' && (
                <AdminTickets
                  fetchAdminTickets={fetchAdminTickets}
                  adminTicketFilterCategory={adminTicketFilterCategory}
                  setAdminTicketFilterCategory={setAdminTicketFilterCategory}
                  adminTicketFilterStatus={adminTicketFilterStatus}
                  setAdminTicketFilterStatus={setAdminTicketFilterStatus}
                  adminTickets={adminTickets}
                  selectedAdminTicket={selectedAdminTicket}
                  setSelectedAdminTicket={setSelectedAdminTicket}
                  adminTicketResolutionFeedback={adminTicketResolutionFeedback}
                  setAdminTicketResolutionFeedback={setAdminTicketResolutionFeedback}
                  adminTicketResolutionStatus={adminTicketResolutionStatus}
                  setAdminTicketResolutionStatus={setAdminTicketResolutionStatus}
                />
              )}

              {view === 'admin_submissions' && (
                <AdminSubmissions
                  webhookSimPayload={webhookSimPayload}
                  setWebhookSimPayload={setWebhookSimPayload}
                  candidatesList={candidatesList}
                  isSubmittingWebhook={isSubmittingWebhook}
                  setIsSubmittingWebhook={setIsSubmittingWebhook}
                  setLoadingMessage={setLoadingMessage}
                  setSubmissionError={setSubmissionError}
                  setSubmissionSuccess={setSubmissionSuccess}
                  fetchAdminSubmissions={fetchAdminSubmissions}
                  adminSubmissions={adminSubmissions}
                  setEditingSubmission={setEditingSubmission}
                  setShowSubmissionModal={setShowSubmissionModal}
                  submissionSuccess={submissionSuccess}
                  submissionError={submissionError}
                  toLocalISOString={toLocalISOString}
                  deleteAdminSubmission={deleteAdminSubmission}
                  showSubmissionModal={showSubmissionModal}
                  editingSubmission={editingSubmission}
                  saveAdminSubmission={saveAdminSubmission}
                />
              )}

              {view === 'admin_objections' && (
                <AdminObjections
                  fetchAdminObjections={fetchAdminObjections}
                  adminObjectionsList={adminObjectionsList}
                  adminObjectionsFilter={adminObjectionsFilter}
                  setAdminObjectionsFilter={setAdminObjectionsFilter}
                  adminObjectionModal={adminObjectionModal}
                  setAdminObjectionModal={setAdminObjectionModal}
                  handleResolveObjection={handleResolveObjection}
                />
              )}

              {view === 'admin_recyclebin' && (
                <AdminRecycleBin
                  fetchRecycleBinItems={fetchRecycleBinItems}
                  recycleBinItems={recycleBinItems}
                  handlePurgeAllRecycleItems={handlePurgeAllRecycleItems}
                  recycleBinSuccess={recycleBinSuccess}
                  recycleBinError={recycleBinError}
                  recycleBinLoading={recycleBinLoading}
                  handleRestoreRecycleItem={handleRestoreRecycleItem}
                  handlePurgeRecycleItem={handlePurgeRecycleItem}
                />
              )}

              {view === 'admin_attendance' && (
                <AdminAttendance
                  user={user}
                  attendanceCourseCode={attendanceCourseCode}
                  setAttendanceCourseCode={setAttendanceCourseCode}
                  adminExamType={adminExamType}
                  attendanceExamTypeOverride={attendanceExamTypeOverride}
                  setAttendanceExamTypeOverride={setAttendanceExamTypeOverride}
                  attendanceExamName={attendanceExamName}
                  setAttendanceExamName={setAttendanceExamName}
                  adminTimetable={adminTimetable}
                  COURSES_LIST={COURSES_LIST}
                  attendanceCustomDate={attendanceCustomDate}
                  setAttendanceCustomDate={setAttendanceCustomDate}
                  attendanceCustomTime={attendanceCustomTime}
                  setAttendanceCustomTime={setAttendanceCustomTime}
                  attendanceCustomMarks={attendanceCustomMarks}
                  setAttendanceCustomMarks={setAttendanceCustomMarks}
                  attendanceLabSheetType={attendanceLabSheetType}
                  setAttendanceLabSheetType={setAttendanceLabSheetType}
                  candidatesList={candidatesList}
                  attendanceEligibilityFilter={attendanceEligibilityFilter}
                  setAttendanceEligibilityFilter={setAttendanceEligibilityFilter}
                  attendanceStudentsPerPage={attendanceStudentsPerPage}
                  setAttendanceStudentsPerPage={setAttendanceStudentsPerPage}
                  attendanceRoomNo={attendanceRoomNo}
                  setAttendanceRoomNo={setAttendanceRoomNo}
                  attendanceBenchPosition={attendanceBenchPosition}
                  setAttendanceBenchPosition={setAttendanceBenchPosition}
                  attendanceDegree={attendanceDegree}
                  setAttendanceDegree={setAttendanceDegree}
                  attendanceProgram={attendanceProgram}
                  setAttendanceProgram={setAttendanceProgram}
                  attendanceMainHeader={attendanceMainHeader}
                  setAttendanceMainHeader={setAttendanceMainHeader}
                  attendanceSubHeader={attendanceSubHeader}
                  setAttendanceSubHeader={setAttendanceSubHeader}
                  attendanceSemester={attendanceSemester}
                  setAttendanceSemester={setAttendanceSemester}
                />
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

