import React, { useState, useEffect } from 'react';
import { 
  Menu, X, Bell, User, Lock, LogOut, ChevronDown, ChevronRight, 
  Upload, FileText, CheckCircle, AlertTriangle, HelpCircle, Calendar, ShieldAlert,
  Key, Video, BookOpen, ClipboardList, Settings, Users,
  GraduationCap, MessageSquare, Loader2, Clock, XCircle, Image, FileEdit
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || (window.location.origin.includes('localhost') ? 'http://localhost:5000/api' : `${window.location.origin}/api`);

const COURSES_LIST = [
  "Introduction to Computer Science",
  "Programming Fundamentals with C++",
  "Basics of Web Development",
  "Mathematical Thinking (Discrete Structures)"
];

export default function App() {
  const [user, setUser] = useState(null); // { id, role, name }
  const [studentProfile, setStudentProfile] = useState(null); // Full candidate details
  const [systemConfig, setSystemConfig] = useState(null);
  
  // Navigation states
  const [view, setView] = useState('login'); // login, announcements, register, info, timetable, hallticket, midsem, endsem, exit, admin
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [dropdowns, setDropdowns] = useState({
    student: true,
    coursework: true,
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

  useEffect(() => {
    const handlePageShow = (event) => {
      setEnteringTestId(null);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
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
  const [adminTimetable, setAdminTimetable] = useState([
    { course: "Introduction to Computer Science", date: '', time: '' },
    { course: "Programming Fundamentals with C++", date: '', time: '' },
    { course: "Basics of Web Development", date: '', time: '' },
    { course: "Mathematical Thinking (Discrete Structures)", date: '', time: '' }
  ]);

  // CourseWork states
  const [videoLectures, setVideoLectures] = useState([]);
  const [courseMaterials, setCourseMaterials] = useState([]);
  const [selectedLecture, setSelectedLecture] = useState(null);

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
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamMarks, setNewExamMarks] = useState(100);
  const [newExamInstructions, setNewExamInstructions] = useState('');
  const [newExamDuration, setNewExamDuration] = useState(60);
  const [newExamStart, setNewExamStart] = useState('');
  const [newExamEnd, setNewExamEnd] = useState('');
  const [newExamQuestions, setNewExamQuestions] = useState([]); // Questions array builder
  const [imageUploadingIdx, setImageUploadingIdx] = useState(-1); // Question image upload loader tracker
  const [adminExamSubmissions, setAdminExamSubmissions] = useState([]);

  // Student exam workspace draft state variables
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
        showModalAlert("Test Configured", "Online practice test has been configured and created successfully!");
        setNewExamTitle('');
        setNewExamMarks(100);
        setNewExamInstructions('');
        setNewExamDuration(60);
        setNewExamStart('');
        setNewExamEnd('');
        setNewExamQuestions([]);
        setShowTestCreator(false);
        fetchAdminTests();
      } else {
        showModalAlert("Configuration Error", data.error || "Failed to create test configuration.");
      }
    } catch (err) {
      console.error(err);
      showModalAlert("Connection Failure", "Error connecting to the server to create test configuration.");
    }
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
    try {
      const res = await fetch(`${API_BASE}/admin/tests/submissions/${testId}`);
      const data = await res.json();
      setAdminExamSubmissions(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    if (!selectedExamSubmission) return;

    // Automatically calculate total coding score from individual fields
    const totalCodingScore = Object.entries(adminGradingAnswers).reduce((sum, [qId, score]) => {
      const ans = selectedExamSubmission.answers?.find(a => a.questionId === qId);
      return (ans && ans.type === 'coding') ? sum + Number(score || 0) : sum;
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
            score: ans.type === 'coding' ? Number(adminGradingAnswers[ans.questionId] || 0) : ans.score
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
      } else {
        fetchStudentProfile();
        fetchStudentActiveTests();
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

  const handleUpdateTimetableNotice = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timetableNotice: adminTimetableNotice })
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

  const handleUpdateTimetableDates = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timetable: adminTimetable })
      });
      const data = await res.json();
      if (data.success) {
        setSystemConfig(data.config);
        setAdminMessage("Course timetable dates updated successfully.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTimetableCellChange = (index, field, value) => {
    const list = [...adminTimetable];
    list[index][field] = value;
    setAdminTimetable(list);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdMessage('');
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
          newPassword: pwdForm.newPassword
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPwdMessage("Password updated successfully!");
        setPwdForm({ newPassword: '', confirmPassword: '' });
      } else {
        setPwdError(data.error || "Password update failed.");
      }
    } catch (e) {
      setPwdError("Connection error to backend.");
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
    }
  };

  const handleSignConsent = async () => {
    if (!consentChecked) return;
    try {
      const res = await fetch(`${API_BASE}/candidate/consent/${user.id}`, { method: 'POST' });
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
    // Format answers map
    const formatted = {};
    COURSES_LIST.forEach(course => {
      formatted[course] = [
        feedbackAnswers[course]?.[0] || '3',
        feedbackAnswers[course]?.[1] || '3',
        feedbackAnswers[course]?.[2] || '3',
        feedbackAnswers[course]?.[3] || 'Yes',
        feedbackAnswers[course]?.[4] || ''
      ];
    });

    try {
      const res = await fetch(`${API_BASE}/candidate/feedback/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, feedback: formatted })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackSuccess(`${feedbackType === 'mid' ? 'Mid Sem' : 'End Sem'} Feedback submitted successfully.`);
        fetchStudentProfile();
      }
    } catch (e) {
      console.error(e);
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
    if (user.role === 'admin' && (view === 'admin' || view === 'admin_candidates' || view === 'admin_coursework' || view === 'admin_tests')) return true;
    if (user.role === 'student' && view !== 'admin') return true;
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
      <button className="cf-btn-primary" onClick={() => setView('login')}>
        Return to Sign In Page
      </button>
    </div>
  );

  return (
    <div>
      {/* HEADER */}
      {!(view === 'onlinetest' || view === 'onlinetest_setup') && (
        <header className="app-header">
          <div className="header-left">
            {user && (
              <button className="sidebar-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
                {isMobileSidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            )}
            <span className="pixel-logo">BICS Portal</span>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {user && (
              <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#3b5998', fontFamily: 'verdana, arial, sans-serif' }}>
                👤 {user.role === 'admin' ? 'Administrator' : (studentProfile?.name || 'Student')}
              </span>
            )}
            <img src="/logo.png" alt="Preliminary Examinations Logo" className="pe-logo" />
          </div>
        </header>
      )}

      {/* DASHBOARD CONTAINER */}
      <div className="app-container">
        {/* SIDEBAR */}
        {user && !(view === 'onlinetest' || view === 'onlinetest_setup') && (
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
 
                  <div className="sidebar-category">Examination</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, exam: !dropdowns.exam})}>
                    Menu Links {dropdowns.exam ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.exam && (
                    <div className="dropdown-container">
                      <button className={`dropdown-item ${view === 'timetable' ? 'active' : ''}`} onClick={() => { setView('timetable'); setIsMobileSidebarOpen(false); }}>
                        <Calendar size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Time-table
                      </button>
                      <button className={`dropdown-item ${view === 'hallticket' ? 'active' : ''}`} onClick={() => { setView('hallticket'); setIsMobileSidebarOpen(false); setConsentSuccess(''); }}>
                        <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Hall ticket
                      </button>
                      <button className={`dropdown-item ${view === 'verification' ? 'active' : ''}`} onClick={() => { setView('verification'); setIsMobileSidebarOpen(false); if (user) fetchSubmittedTestsList(user.id || user._id); }}>
                        <CheckCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Verification
                      </button>
                    </div>
                  )}
 
                  <div className="sidebar-category">Feedback</div>
                  <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, feedback: !dropdowns.feedback})}>
                    Menu Links {dropdowns.feedback ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.feedback && (
                    <div className="dropdown-container">
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
 
              <button className={`sidebar-item ${view === 'changepassword' ? 'active' : ''}`} style={{ marginTop: '20px', borderTop: '1px solid #cbd5e1', justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('changepassword'); setIsMobileSidebarOpen(false); }}>
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
                      ⚠️ <strong>Registration Rejected:</strong> Your previous registration attempt was rejected by the administrator. Please review your entries and files and re-submit.
                    </div>
                  )}
                  {regError && <div className="cf-alert cf-alert-error">{regError}</div>}
                  {regSuccess && <div className="cf-alert cf-alert-success">{regSuccess}</div>}

                  <form onSubmit={handleStudentRegistrationSubmit}>
                    
                    <div className="cf-form-section">👤 1. Core Personal Information</div>
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

                    <div className="cf-form-section">🏠 2. Address &amp; Contact Information</div>
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

                    <div className="cf-form-section">📞 Emergency Contact Information</div>
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

                    <div className="cf-form-section">📧 Contact Methods</div>
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

                    <div className="cf-form-section">📚 3. List of Courses (All Required for BICS)</div>
                    <div style={{ padding: '5px 12px' }}>
                      {COURSES_LIST.map((course, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <input type="checkbox" checked={true} disabled={true} />
                          <span style={{ fontSize: '9.5pt', color: '#555' }}>{course}</span>
                        </div>
                      ))}
                    </div>

                    <div className="cf-form-section">📤 4. Upload Documents</div>
                    <div className="cf-form-grid">
                      <div className="cf-input-group">
                        <label className="cf-label">Profile Photo (JPEG/PNG)</label>
                        <input type="file" required onChange={e => setPhotoFile(e.target.files[0])} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Signature Image (JPEG/PNG)</label>
                        <input type="file" required onChange={e => setSigFile(e.target.files[0])} />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Signed Undertaking PDF</label>
                        <input type="file" required onChange={e => setUndertakingFile(e.target.files[0])} />
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

                  <div className="cf-form-section">👤 Core Personal Information</div>
                  <div className="profile-info-grid">
                    <span className="profile-info-label">Full Legal Name:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.preferredName}</span>
                    <span className="profile-info-label">Preferred Name:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.preferredName}</span>
                    <span className="profile-info-label">Date of Birth:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.dob}</span>
                  </div>

                  <div className="cf-form-section">🏠 Address &amp; Contact Information</div>
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

                  <div className="cf-form-section">📧 Contact Methods</div>
                  <div className="profile-info-grid">
                    <span className="profile-info-label">Personal Phone:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.personalPhone}</span>
                    <span className="profile-info-label">Personal Email:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.personalEmail}</span>
                    <span className="profile-info-label">College Email:</span>
                    <span className="profile-info-value">{studentProfile.registrationData.collegeEmail}</span>
                  </div>

                  <div className="cf-form-section">🖋️ Uploaded Signatures &amp; Documents</div>
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

          {/* EXAMINATION TIMETABLE */}
          {view === 'timetable' && systemConfig && (
            <div className="cf-card">
              <div className="cf-card-title">Examination Timetable</div>
              
              {systemConfig.timetableNotice && (
                <div className="cf-alert cf-alert-info" style={{ fontWeight: 'bold', margin: 0, borderLeft: '4px solid #3b5998' }}>
                  📢 {systemConfig.timetableNotice}
                </div>
              )}
            </div>
          )}

          {/* COURSEWORK - LECTURES */}
          {view === 'lectures' && (
            <div className="cf-card">
              <div className="cf-card-title">🎥 Course Video Lectures</div>
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
                          📁 {selectedLecture.section}
                        </span>
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
                          📚 {section}
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
              <div className="cf-card-title">📚 Course Study Materials</div>
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
                            📁 {section}
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
                    const isFuture = startTime > currentTime;
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

          {/* EXAMINATION HALL TICKET & CONSENT FORM */}
          {view === 'hallticket' && studentProfile && systemConfig && (
            <div className="cf-card">
              <div className="cf-card-title">Hall Ticket Dispatch</div>
              
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
              ) : studentProfile.signedConsent ? (
                <div>
                  <div className="cf-alert cf-alert-success">
                    Declaration Signed. Your Hall Ticket is unlocked.
                  </div>
                  <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                    <a href={systemConfig.hallTicketUrl} target="_blank" rel="noreferrer" className="cf-btn-primary" style={{ textDecoration: 'none' }}>
                      Download Official Hall Ticket
                    </a>
                  </div>
                </div>
              ) : (
                <div>
                  {consentSuccess && <div className="cf-alert cf-alert-success">{consentSuccess}</div>}
                  <div className="consent-panel">
                    <div className="consent-title">Consent declaration to refrain from malpractices</div>
                    <p style={{ fontSize: '9.5pt', lineHeight: '1.6', color: '#555' }}>
                      I hereby solemnly declare and promise that I will refrain from any kind of malpractice, cheating, copying, plagiarism, or unauthorized resource usage during the BICS Course Examination 2026. I understand that any violation of this code of conduct will lead to immediate disqualification and cancellation of my candidacy.
                    </p>
                    <div style={{ marginTop: '15px' }}>
                      <label className="checkbox-label" style={{ display: 'flex', gap: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                        <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
                        I accept and agree to the declaration statement.
                      </label>
                    </div>
                  </div>
                  <button className="cf-btn-primary" disabled={!consentChecked} onClick={handleSignConsent}>
                    Confirm Declaration
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ANSWERS COPY VERIFICATION VIEW */}
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
                                      {sub.reevaluation.status === 'resolved' ? '✓ Resolution Comments:' : '✗ Rejection Comments:'}
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
                                              ✕
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
                              const candAns = (sub.answers || []).find(a => a.questionId === q.id);
                              
                              return (
                                <div key={qIdx} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                  
                                  {/* Header bar */}
                                  <div style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147' }}>
                                      Question {qIdx + 1}: {q.title}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      {(() => {
                                        let scored = 0;
                                        if (q.type === 'mcq') {
                                          scored = candAns?.selectedOptionIndex === q.correctOptionIndex ? q.points : 0;
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
                                      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                                        {q.description}
                                      </div>
                                    )}

                                    {/* MCQ Layout */}
                                    {q.type === 'mcq' && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {q.options?.map((opt, oIdx) => {
                                          const isCorrect = q.correctOptionIndex === oIdx;
                                          const isSelected = candAns?.selectedOptionIndex === oIdx;
                                          
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

          {/* FEEDBACK (MID / END SEMESTER) */}
          {(view === 'midsem' || view === 'endsem') && studentProfile && systemConfig && (
            <div className="cf-card">
              <div className="cf-card-title">Course Feedback Form - {feedbackType === 'mid' ? 'Mid' : 'End'} Semester</div>
              
              {((feedbackType === 'mid' && !systemConfig.midSemFeedbackActive) || (feedbackType === 'end' && !systemConfig.endSemFeedbackActive)) ? (
                <div className="cf-alert cf-alert-info">
                  {feedbackType === 'mid' ? 'Mid' : 'End'} Semester Course Feedback is currently closed by the administrator.
                </div>
              ) : (
                <div>
                  {feedbackSuccess && <div className="cf-alert cf-alert-success">{feedbackSuccess}</div>}
                  <form onSubmit={handleFeedbackSubmit}>
                    {COURSES_LIST.map((course, cIdx) => (
                      <div key={cIdx} style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '20px', marginBottom: '25px' }}>
                        <h4 style={{ color: '#002147', fontWeight: 'bold', marginBottom: '15px' }}>📚 {course}</h4>
                        
                        <div className="cf-input-group" style={{ marginBottom: '12px' }}>
                          <label className="cf-label">1. Rate the quality of the textbook (1-5)</label>
                          <select className="cf-input" style={{ maxWidth: '100px' }} value={feedbackAnswers[course]?.[0] || '3'} onChange={e => handleFeedbackValueChange(course, 0, e.target.value)}>
                            <option value="5">5 - Excellent</option>
                            <option value="4">4 - Good</option>
                            <option value="3">3 - Satisfactory</option>
                            <option value="2">2 - Needs Improvement</option>
                            <option value="1">1 - Poor</option>
                          </select>
                        </div>

                        <div className="cf-input-group" style={{ marginBottom: '12px' }}>
                          <label className="cf-label">2. Rate the usefulness of video lectures (1-5)</label>
                          <select className="cf-input" style={{ maxWidth: '100px' }} value={feedbackAnswers[course]?.[1] || '3'} onChange={e => handleFeedbackValueChange(course, 1, e.target.value)}>
                            <option value="5">5 - Excellent</option>
                            <option value="4">4 - Good</option>
                            <option value="3">3 - Satisfactory</option>
                            <option value="2">2 - Needs Improvement</option>
                            <option value="1">1 - Poor</option>
                          </select>
                        </div>

                        <div className="cf-input-group" style={{ marginBottom: '12px' }}>
                          <label className="cf-label">3. Rate the layout and difficulty of Assignments (1-5)</label>
                          <select className="cf-input" style={{ maxWidth: '100px' }} value={feedbackAnswers[course]?.[2] || '3'} onChange={e => handleFeedbackValueChange(course, 2, e.target.value)}>
                            <option value="5">5 - Excellent</option>
                            <option value="4">4 - Good</option>
                            <option value="3">3 - Satisfactory</option>
                            <option value="2">2 - Needs Improvement</option>
                            <option value="1">1 - Poor</option>
                          </select>
                        </div>

                        <div className="cf-input-group" style={{ marginBottom: '12px' }}>
                          <label className="cf-label">4. Did the course curriculum meet your expectations?</label>
                          <select className="cf-input" style={{ maxWidth: '100px' }} value={feedbackAnswers[course]?.[3] || 'Yes'} onChange={e => handleFeedbackValueChange(course, 3, e.target.value)}>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">5. General Comments / Suggestions</label>
                          <input type="text" className="cf-input" placeholder="Feedback remarks" value={feedbackAnswers[course]?.[4] || ''} onChange={e => handleFeedbackValueChange(course, 4, e.target.value)} />
                        </div>
                      </div>
                    ))}
                    <button type="submit" className="cf-btn-primary">Submit Feedback</button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* CODE OF CONDUCT PAGE */}
          {view === 'conduct' && (
            <div className="cf-card">
              <div className="cf-card-title">BICS Course Code of Conduct</div>
              <p style={{ fontSize: '9.5pt', color: '#555', marginBottom: '20px', lineHeight: '1.6' }}>
                All candidates enrolled in the Basic Introductory Computer Science (BICS) Course under the Preliminary Examinations 2026 academic cycle are strictly required to adhere to the following code of academic and professional conduct. By accessing the BICS portal, you consent to these parameters:
              </p>
              
              <div className="cf-form-section">⚖️ Section 1: Academic Integrity &amp; Originality</div>
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

              <div className="cf-form-section">🎓 Section 3: Professional Communication</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>All interactions on the BICS portal (including course feedback and contact enquiries) must remain constructive, professional, and respectful.</li>
                <li>Harassment, vulgar language, or inappropriate content submission will lead to immediate account suspension and a report to the discipline board.</li>
                <li>Public posting of solutions, leaks, or defamatory comments is strictly forbidden.</li>
              </ul>

              <div className="cf-form-section">🛡️ Section 4: Examination Ethics &amp; Declaration</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>Downloading the official Hall Ticket requires completing the Malpractice Consent form, certifying compliance with exam rules.</li>
                <li>Any candidate found using unauthorized resources, devices, or communication during the exam will face legal and academic penalties under the Preliminary Examinations 2026 Charter.</li>
                <li>Impersonation or falsifying identification documents during examination validation is classified as a critical offense.</li>
              </ul>

              <div className="cf-form-section">📜 Section 5: Academic Misconduct Procedures</div>
              <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
                <li>Upon reporting a potential breach of code, the administrator will review portal log footprints, uploaded signatures, and source codes.</li>
                <li>A formal warning or suspension notice will be issued. Candidates have 5 working days to present a defense.</li>
                <li>The decision of the Preliminary Examinations 2026 Academic Integrity Board is final and binding for all candidates.</li>
              </ul>

              <div className="cf-form-section">💬 Section 6: User Representation &amp; Documentation</div>
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
                <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                  <label className="cf-label">New Password</label>
                  <input type="password" className="cf-input" required value={pwdForm.newPassword} onChange={e => setPwdForm({...pwdForm, newPassword: e.target.value})} placeholder="At least 4 characters" />
                </div>
                <div className="cf-input-group" style={{ marginBottom: '20px' }}>
                  <label className="cf-label">Confirm New Password</label>
                  <input type="password" className="cf-input" required value={pwdForm.confirmPassword} onChange={e => setPwdForm({...pwdForm, confirmPassword: e.target.value})} />
                </div>
                <button type="submit" className="cf-btn-primary">Update Password</button>
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
                <div className="cf-card-title">Manage Examination Timetable</div>
                
                {/* 1. Timetable Notice */}
                <form onSubmit={handleUpdateTimetableNotice} style={{ marginBottom: '25px' }}>
                  <div className="cf-input-group">
                    <label className="cf-label">General Timetable Notice (Display Announcement)</label>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <input type="text" className="cf-input" style={{ flexGrow: 1 }} required value={adminTimetableNotice} onChange={e => setAdminTimetableNotice(e.target.value)} />
                      <button type="submit" className="cf-btn-primary">Update Notice</button>
                    </div>
                  </div>
                </form>

                {/* 2. Course Timetable Slots */}
                <form onSubmit={handleUpdateTimetableDates}>
                  <div className="cf-table-container" style={{ marginBottom: '15px' }}>
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Course Name</th>
                          <th>Exam Date</th>
                          <th>Time Duration Slot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminTimetable.map((t, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: '600', fontSize: '9pt' }}>{t.course}</td>
                            <td>
                              <input type="date" className="cf-input" style={{ width: '100%' }} required value={t.date} onChange={e => handleTimetableCellChange(idx, 'date', e.target.value)} />
                            </td>
                            <td>
                              <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.time} onChange={e => handleTimetableCellChange(idx, 'time', e.target.value)} placeholder="e.g. 10:00 AM - 01:00 PM" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="submit" className="cf-btn-primary">Save Course Timetable Dates</button>
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
                          <td>{c.signedConsent ? "Accepted" : "Pending"}</td>
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
                <div className="cf-card-title">🎥 Course Video Lectures Manager</div>
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
                <div className="cf-card-title">📚 Course Study Materials Manager</div>
                
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
                <div className="cf-card-title">🏆 Online Test Configurations Manager</div>
                
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
                                  {t.answersReleased ? '✓ Released' : 'Release Sheets'}
                                </button>
                                <button
                                  className="cf-btn-primary"
                                  style={{ 
                                    padding: '3px 8px', 
                                    fontSize: '8pt', 
                                    background: t.isPublished ? '#10b981' : '#64748b', 
                                    borderColor: t.isPublished ? '#10b981' : '#64748b',
                                    color: '#ffffff' 
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
                  onClick={() => setShowTestCreator(!showTestCreator)}
                  style={{ marginBottom: '15px' }}
                >
                  {showTestCreator ? 'Hide Exam Builder Form' : '+ Create New Online Test Configuration'}
                </button>

                {showTestCreator && (
                  <form onSubmit={handleCreateTest} className="cf-form-grid" style={{ gridTemplateColumns: '1fr', gap: '20px', borderTop: '1px solid #cbd5e1', paddingTop: '20px' }}>
                    <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <div className="cf-input-group">
                        <label className="cf-label">Test Title</label>
                        <input
                          type="text"
                          className="cf-input"
                          required
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
                          required
                          value={newExamDuration}
                          onChange={e => setNewExamDuration(e.target.value)}
                        />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Total Marks</label>
                        <input
                          type="number"
                          className="cf-input"
                          required
                          value={newExamMarks}
                          onChange={e => setNewExamMarks(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <div className="cf-input-group">
                        <label className="cf-label">Starting Access Time</label>
                        <input
                          type="datetime-local"
                          className="cf-input"
                          required
                          value={newExamStart}
                          onChange={e => setNewExamStart(e.target.value)}
                        />
                      </div>
                      <div className="cf-input-group">
                        <label className="cf-label">Ending Access Time</label>
                        <input
                          type="datetime-local"
                          className="cf-input"
                          required
                          value={newExamEnd}
                          onChange={e => setNewExamEnd(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cf-input-group">
                      <label className="cf-label">Initial Candidate Instructions (Displays pre-test)</label>
                      <textarea
                        className="cf-input"
                        rows="3"
                        value={newExamInstructions}
                        onChange={e => setNewExamInstructions(e.target.value)}
                        placeholder="Write pre-test guidelines and code rules here..."
                      />
                    </div>

                    {/* Question Array Builder */}
                    <div style={{ border: '1px solid #cbd5e1', padding: '15px', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
                      <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '15px' }}>
                        Questions Pool Configuration ({newExamQuestions.length} added)
                      </h4>

                      {newExamQuestions.map((q, idx) => (
                        <div key={idx} style={{ padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#fff', marginBottom: '15px', position: 'relative' }}>
                          <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '8pt', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                            {q.type.toUpperCase()} Question
                          </span>
                          <h5 style={{ fontSize: '9.5pt', fontWeight: 'bold', margin: '0 0 8px 0', color: '#002147' }}>
                            Q{idx + 1}: {q.title} <span style={{ color: '#666', fontWeight: 'normal' }}>({q.points} points)</span>
                          </h5>
                          
                          {q.type === 'mcq' && (
                            <div style={{ fontSize: '8.5pt', paddingLeft: '10px' }}>
                              {q.options.map((opt, oIdx) => (
                                <div key={oIdx} style={{ color: oIdx === q.correctOptionIndex ? '#16a34a' : '#555', fontWeight: oIdx === q.correctOptionIndex ? 'bold' : 'normal' }}>
                                  o Option {oIdx + 1}: {opt} {oIdx === q.correctOptionIndex && '(Correct Key)'}
                                </div>
                              ))}
                            </div>
                          )}

                          {q.type === 'coding' && (
                            <div style={{ fontSize: '8.5pt', color: '#555', paddingLeft: '10px' }}>
                              Language: <strong>{q.language?.toUpperCase() || 'C++'}</strong> <br />
                              Test Cases Count: <strong>{q.testCases?.length || 0} cases</strong>
                            </div>
                          )}

                          <button
                            type="button"
                            className="cf-btn-secondary"
                            style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '2px 8px', fontSize: '7.5pt', marginTop: '10px' }}
                            onClick={() => {
                              setNewExamQuestions(prev => prev.filter((_, qIdx) => qIdx !== idx));
                            }}
                          >
                            Remove Question
                          </button>
                        </div>
                      ))}

                      {/* Add MCQ Question Panel */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '15px' }}>
                        <button
                          type="button"
                          className="cf-btn-secondary"
                          onClick={() => {
                            const newQ = {
                              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                              type: 'mcq',
                              title: 'New MCQ Question Statement',
                              points: 10,
                              options: ['Option A', 'Option B', 'Option C', 'Option D'],
                              correctOptionIndex: 0
                            };
                            setNewExamQuestions([...newExamQuestions, newQ]);
                          }}
                        >
                          + Add MCQ Question
                        </button>
                        <button
                          type="button"
                          className="cf-btn-secondary"
                          onClick={() => {
                            const newQ = {
                              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                              type: 'coding',
                              title: 'Coding Task Title',
                              points: 20,
                              description: 'Write a program to solve...',
                              initialTemplate: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Code here\n    return 0;\n}',
                              language: 'cpp',
                              testCases: [{ input: 'Input variable', output: 'Expected output variable' }]
                            };
                            setNewExamQuestions([...newExamQuestions, newQ]);
                          }}
                        >
                          + Add Coding Question
                        </button>
                      </div>

                      {/* Editing forms for added questions */}
                      {newExamQuestions.length > 0 && (
                        <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '20px', paddingTop: '15px' }}>
                          <h5 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', marginBottom: '15px' }}>✍️ Edit Question Details</h5>
                          {newExamQuestions.map((q, idx) => (
                            <div key={idx} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
                              <strong style={{ fontSize: '9pt', color: '#333' }}>Edit Q{idx + 1}:</strong>
                              <div className="cf-form-grid" style={{ gridTemplateColumns: '3fr 1fr', gap: '10px', marginTop: '8px' }}>
                                <div className="cf-input-group">
                                  <label className="cf-label">Question Text / Title</label>
                                  <input
                                    type="text"
                                    className="cf-input"
                                    value={q.title}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[idx].title = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Points</label>
                                  <input
                                    type="number"
                                    className="cf-input"
                                    value={q.points}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[idx].points = Number(e.target.value);
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="cf-input-group" style={{ marginTop: '8px', marginBottom: '10px' }}>
                                <label className="cf-label">Question Image (Optional - perfect for HTML/CSS layout mockups)</label>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    id={`q-img-upload-${idx}`}
                                    onChange={e => handleUploadQuestionImage(e, idx)}
                                  />
                                  <label
                                    htmlFor={`q-img-upload-${idx}`}
                                    className="cf-btn-primary"
                                    style={{ margin: 0, display: 'inline-block', padding: '6px 12px', fontSize: '8.5pt', background: '#3b5998', color: '#fff', borderColor: '#3b5998', cursor: 'pointer' }}
                                  >
                                    📤 {imageUploadingIdx === idx ? 'Uploading to Cloudinary...' : 'Upload Image to Cloudinary'}
                                  </label>

                                  <input
                                    type="text"
                                    className="cf-input"
                                    style={{ flexGrow: 1, minWidth: '200px' }}
                                    placeholder="Cloudinary secure URL displays here after upload"
                                    value={q.imageUrl || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[idx].imageUrl = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                                {q.imageUrl && (
                                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <img
                                      src={q.imageUrl}
                                      alt="Thumbnail preview"
                                      style={{ maxWidth: '80px', maxHeight: '50px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '2px' }}
                                    />
                                    <button
                                      type="button"
                                      className="cf-btn-secondary"
                                      style={{ padding: '2px 8px', fontSize: '8pt', color: '#ef4444', borderColor: '#ef4444' }}
                                      onClick={() => {
                                        const updated = [...newExamQuestions];
                                        updated[idx].imageUrl = '';
                                        setNewExamQuestions(updated);
                                      }}
                                    >
                                      Remove Image
                                    </button>
                                  </div>
                                )}
                              </div>

                              {q.type === 'mcq' && (
                                <div style={{ marginTop: '10px', paddingLeft: '10px', borderLeft: '3px solid #cbd5e1' }}>
                                  <span className="cf-label" style={{ fontWeight: 'bold' }}>MCQ Options &amp; Correct Answer Key:</span>
                                  <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '5px' }}>
                                    {q.options.map((opt, oIdx) => (
                                      <div key={oIdx} className="cf-input-group">
                                        <label className="cf-label">Option {oIdx + 1}</label>
                                        <input
                                          type="text"
                                          className="cf-input"
                                          value={opt}
                                          onChange={e => {
                                            const updated = [...newExamQuestions];
                                            updated[idx].options[oIdx] = e.target.value;
                                            setNewExamQuestions(updated);
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="cf-input-group" style={{ marginTop: '10px', maxWidth: '200px' }}>
                                    <label className="cf-label">Correct Option Index</label>
                                    <select
                                      className="cf-input"
                                      value={q.correctOptionIndex}
                                      onChange={e => {
                                        const updated = [...newExamQuestions];
                                        updated[idx].correctOptionIndex = Number(e.target.value);
                                        setNewExamQuestions(updated);
                                      }}
                                    >
                                      <option value="0">Option 1</option>
                                      <option value="1">Option 2</option>
                                      <option value="2">Option 3</option>
                                      <option value="3">Option 4</option>
                                    </select>
                                  </div>
                                </div>
                              )}

                              {q.type === 'coding' && (
                                <div style={{ marginTop: '10px', paddingLeft: '10px', borderLeft: '3px solid #cbd5e1' }}>
                                  <span className="cf-label" style={{ fontWeight: 'bold' }}>Coding Description &amp; Workspace Presets:</span>
                                  <div className="cf-input-group" style={{ marginTop: '8px' }}>
                                    <label className="cf-label">Detailed Markdown Description</label>
                                    <textarea
                                      className="cf-input"
                                      rows="3"
                                      value={q.description}
                                      onChange={e => {
                                        const updated = [...newExamQuestions];
                                        updated[idx].description = e.target.value;
                                        setNewExamQuestions(updated);
                                      }}
                                    />
                                  </div>
                                  <div className="cf-input-group" style={{ marginTop: '8px' }}>
                                    <label className="cf-label">Preloaded Code Template</label>
                                    <textarea
                                      className="cf-input"
                                      rows="4"
                                      style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                      value={q.initialTemplate}
                                      onChange={e => {
                                        const updated = [...newExamQuestions];
                                        updated[idx].initialTemplate = e.target.value;
                                        setNewExamQuestions(updated);
                                      }}
                                    />
                                  </div>
                                  <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '10px' }}>
                                    <div className="cf-input-group">
                                      <label className="cf-label">Expected Input Variable</label>
                                      <input
                                        type="text"
                                        className="cf-input"
                                        value={q.testCases[0]?.input || ''}
                                        onChange={e => {
                                          const updated = [...newExamQuestions];
                                          updated[idx].testCases[0] = {
                                            input: e.target.value,
                                            output: updated[idx].testCases[0]?.output || ''
                                          };
                                          setNewExamQuestions(updated);
                                        }}
                                      />
                                    </div>
                                    <div className="cf-input-group">
                                      <label className="cf-label">Expected Output Variable</label>
                                      <input
                                        type="text"
                                        className="cf-input"
                                        value={q.testCases[0]?.output || ''}
                                        onChange={e => {
                                          const updated = [...newExamQuestions];
                                          updated[idx].testCases[0] = {
                                            input: updated[idx].testCases[0]?.input || '',
                                            output: e.target.value
                                          };
                                          setNewExamQuestions(updated);
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    </div>

                    <button type="submit" className="cf-btn-primary" style={{ marginTop: '10px' }}>Save Test Configuration</button>
                  </form>
                )}
              </div>

              {/* ADMIN - CANDIDATE SUBMISSIONS EVALUATION CONSOLE */}
              <div className="cf-card" id="admin-submissions-section">
                <div className="cf-card-title">
                  <span>📝 Exam Submissions Evaluation Console</span>
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
                      🔄 Refresh Submissions
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
                              {s.submittedAt ? new Date(s.submittedAt).toLocaleTimeString() : 'In Progress'}
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
                        <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => setSelectedExamSubmission(null)}>✕</button>
                      </div>

                      <div className="cf-alert cf-alert-info" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <span>📋 Title: <strong>{selectedExamSubmission.testTitle}</strong></span>
                        <span>⚠️ Fullscreen Exits: <strong>{selectedExamSubmission.proctoringLog?.fullscreenExits || 0}</strong> • Tab Switches: <strong>{selectedExamSubmission.proctoringLog?.tabSwitches || 0}</strong></span>
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
                              <div style={{ fontSize: '9.5pt', color: '#333', fontWeight: 'bold', marginBottom: '8px' }}>
                                {questionConfig?.title || "No question title available"}
                              </div>

                              {questionConfig?.description && (
                                <div style={{ fontSize: '9pt', color: '#475569', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '4px', marginBottom: '10px', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif' }}>
                                  {questionConfig.description}
                                </div>
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
                                      badgeText = '✅ Correct Answer';
                                    } else if (isCandidateSelect) {
                                      borderStyle = '2px solid #ef4444';
                                      bgStyle = '#fef2f2';
                                      badgeText = '❌ Candidate Choice (Incorrect)';
                                    }

                                    if (isCorrectKey && isCandidateSelect) {
                                      badgeText = '✅ Candidate Choice (Correct)';
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
                            MCQ Score auto-graded: <strong>{selectedExamSubmission.evaluation?.mcqScore || 0}</strong>
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
          <div className="cf-card" style={{ width: '350px', padding: '15px', margin: 0, border: '1px solid #b9c9fe', boxWith: 'none' }}>
            <div className="cf-card-title" style={{ marginTop: '-15px', marginLeft: '-15px', marginRight: '-15px', marginBottom: '15px' }}>
              Confirm Exit
            </div>
            <p style={{ fontSize: '9.5pt', marginBottom: '20px', color: '#333' }}>
              Are you sure you want to sign out from the BICS Portal?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="cf-btn-secondary" style={{ flexGrow: 1 }} onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
              <button className="cf-btn-primary" style={{ flexGrow: 1, color: '#e11d48', borderColor: '#e11d48' }} onClick={handleLogout}>
                Sign Out
              </button>
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
                <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => setSelectedCandidate(null)}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '25px' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <div className="cf-form-section">👤 Core Personal Information</div>
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
                    <div className="cf-form-section">🖼️ Uploaded Attachments</div>
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
                          📄 View Undertaking Document
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* FEEDBACK RESPONSES SECTION */}
              <div className="cf-form-section">📝 Submitted Feedbacks &amp; Exit Forms</div>
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
