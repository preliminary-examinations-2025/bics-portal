import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, ArrowLeft, ArrowRight, Save, Send, X, MessageSquare } from 'lucide-react';

// Theory Course Evaluation Rubric (10 Dimensions)
const THEORY_QUESTIONS = [
  {
    id: 0,
    dim: "Syllabus & Structure",
    title: "1. Curriculum Organization & Roadmap",
    prompt: "How well-structured, clear, and comprehensive was the course syllabus and module roadmap?",
    scale: [
      { val: "1", label: "Unsatisfactory" },
      { val: "2", label: "Needs Work" },
      { val: "3", label: "Satisfactory" },
      { val: "4", label: "Very Good" },
      { val: "5", label: "Excellent" }
    ]
  },
  {
    id: 1,
    dim: "Lecture Delivery",
    title: "2. Lecture Quality & Conceptual Clarity",
    prompt: "Rate the conceptual clarity, depth of explanation, and audiovisual delivery of the video lectures.",
    scale: [
      { val: "1", label: "Unclear" },
      { val: "2", label: "Below Average" },
      { val: "3", label: "Adequate" },
      { val: "4", label: "Clear & Lucid" },
      { val: "5", label: "Exceptional" }
    ]
  },
  {
    id: 2,
    dim: "Study Materials",
    title: "3. Textbook & Reference Notes",
    prompt: "How useful, accurate, and comprehensive were the study notes, textbooks, and documentation?",
    scale: [
      { val: "1", label: "Poor" },
      { val: "2", label: "Incomplete" },
      { val: "3", label: "Fair" },
      { val: "4", label: "Thorough" },
      { val: "5", label: "Comprehensive" }
    ]
  },
  {
    id: 3,
    dim: "Assignments & Rigor",
    title: "4. Assignments & Problem Sets",
    prompt: "How relevant, intellectually challenging, and engaging were the weekly assignments and exercises?",
    scale: [
      { val: "1", label: "Low Rigor" },
      { val: "2", label: "Moderate" },
      { val: "3", label: "Balanced" },
      { val: "4", label: "Challenging" },
      { val: "5", label: "Stimulating" }
    ]
  },
  {
    id: 4,
    dim: "Pacing & Workload",
    title: "5. Pacing & Weekly Workload",
    prompt: "Was the delivery pacing and weekly assignment workload manageable alongside your other coursework?",
    scale: [
      { val: "1", label: "Overwhelming" },
      { val: "2", label: "Heavy" },
      { val: "3", label: "Manageable" },
      { val: "4", label: "Well Paced" },
      { val: "5", label: "Optimal" }
    ]
  },
  {
    id: 5,
    dim: "Mentorship & Helpdesk",
    title: "6. Doubt Resolution & Support",
    prompt: "Rate the timeliness, responsiveness, and helpfulness of instructors and mentors in answering questions.",
    scale: [
      { val: "1", label: "Unresponsive" },
      { val: "2", label: "Delayed" },
      { val: "3", label: "Adequate" },
      { val: "4", label: "Helpful" },
      { val: "5", label: "Highly Responsive" }
    ]
  },
  {
    id: 6,
    dim: "Skill Acquisition",
    title: "7. Foundational CS Intuition",
    prompt: "Did this course enhance your foundational understanding and core problem-solving intuition?",
    scale: [
      { val: "1", label: "Not at all" },
      { val: "2", label: "Slightly" },
      { val: "3", label: "Moderately" },
      { val: "4", label: "Substantially" },
      { val: "5", label: "Extensively" }
    ]
  },
  {
    id: 7,
    dim: "Objectives Met",
    title: "8. Learning Objectives Fulfilled",
    prompt: "Were the promised module competencies and syllabus learning goals achieved effectively?",
    scale: [
      { val: "1", label: "Not Achieved" },
      { val: "2", label: "Marginally" },
      { val: "3", label: "Moderately" },
      { val: "4", label: "Substantially" },
      { val: "5", label: "Fully Achieved" }
    ]
  },
  {
    id: 8,
    dim: "Overall Module Rating",
    title: "9. Overall Theory Course Evaluation",
    prompt: "What is your overall academic evaluation of this theory course module?",
    scale: [
      { val: "1", label: "Unsatisfactory" },
      { val: "2", label: "Fair" },
      { val: "3", label: "Good" },
      { val: "4", label: "Very Good" },
      { val: "5", label: "Outstanding" }
    ]
  },
  {
    id: 9,
    dim: "Constructive Feedback",
    title: "10. Written Suggestions & Recommendations",
    prompt: "Please provide specific constructive feedback, topic requests, or areas for curriculum improvement.",
    isText: true,
    chips: [
      "Well-structured syllabus and clear progression",
      "Lecture explanations were lucid and insightful",
      "Add more worked problem examples",
      "Workload and pacing were well balanced",
      "Provide additional practice assignments",
      "Doubt clearing was prompt and helpful"
    ]
  }
];

// Practical Laboratory Evaluation Rubric (10 Dimensions)
const LAB_QUESTIONS = [
  {
    id: 0,
    dim: "Lab Documentation",
    title: "1. Lab Manual & Problem Statements",
    prompt: "How clear, detailed, and structured were the lab worksheets, problem statements, and instructions?",
    scale: [
      { val: "1", label: "Unclear" },
      { val: "2", label: "Needs Work" },
      { val: "3", label: "Clear" },
      { val: "4", label: "Very Clear" },
      { val: "5", label: "Exemplary" }
    ]
  },
  {
    id: 1,
    dim: "Hands-on Practice",
    title: "2. Hands-on Coding & Implementation",
    prompt: "Did the practical exercises provide meaningful, real-world coding and programming experience?",
    scale: [
      { val: "1", label: "Minimal" },
      { val: "2", label: "Basic Only" },
      { val: "3", label: "Good Practice" },
      { val: "4", label: "Very Practical" },
      { val: "5", label: "Deep Hands-on" }
    ]
  },
  {
    id: 2,
    dim: "Tooling & Environment",
    title: "3. Compiler, Editor & Tooling Setup",
    prompt: "Rate the reliability and ease of using compilers, code execution tools, and development setups.",
    scale: [
      { val: "1", label: "Problematic" },
      { val: "2", label: "Cumbersome" },
      { val: "3", label: "Usable" },
      { val: "4", label: "Smooth" },
      { val: "5", label: "Seamless" }
    ]
  },
  {
    id: 3,
    dim: "Demonstrator Support",
    title: "4. Lab Demonstrator / TA Support",
    prompt: "How supportive and accessible were lab demonstrators/TAs during debugging sessions and error resolution?",
    scale: [
      { val: "1", label: "Unhelpful" },
      { val: "2", label: "Slow" },
      { val: "3", label: "Helpful" },
      { val: "4", label: "Very Helpful" },
      { val: "5", label: "Exceptional" }
    ]
  },
  {
    id: 4,
    dim: "Progression Curve",
    title: "5. Difficulty Progression",
    prompt: "How effectively did the lab tasks progress from elementary syntax to advanced algorithms?",
    scale: [
      { val: "1", label: "Erratic" },
      { val: "2", label: "Disjointed" },
      { val: "3", label: "Reasonable" },
      { val: "4", label: "Smooth" },
      { val: "5", label: "Optimal Pacing" }
    ]
  },
  {
    id: 5,
    dim: "Validation Rigor",
    title: "6. Test Suites & Automated Checks",
    prompt: "How effective were test cases, edge cases, and automated validation checks in testing code robustness?",
    scale: [
      { val: "1", label: "Ineffective" },
      { val: "2", label: "Basic" },
      { val: "3", label: "Adequate" },
      { val: "4", label: "Thorough" },
      { val: "5", label: "Rigorous" }
    ]
  },
  {
    id: 6,
    dim: "Coding Confidence",
    title: "7. Practical Problem-Solving Skill",
    prompt: "Did these practical lab sessions build your confidence in writing clean, modular software programs?",
    scale: [
      { val: "1", label: "Not at all" },
      { val: "2", label: "Slightly" },
      { val: "3", label: "Moderately" },
      { val: "4", label: "Substantially" },
      { val: "5", label: "Extensively" }
    ]
  },
  {
    id: 7,
    dim: "Time Adequacy",
    title: "8. Lab Time Allocation & Deliverables",
    prompt: "Was sufficient time allocated to implement, test, and submit your practical lab deliverables?",
    scale: [
      { val: "1", label: "Insufficient" },
      { val: "2", label: "Rushed" },
      { val: "3", label: "Adequate" },
      { val: "4", label: "Well Timed" },
      { val: "5", label: "Generous" }
    ]
  },
  {
    id: 8,
    dim: "Overall Lab Rating",
    title: "9. Overall Practical Lab Evaluation",
    prompt: "What is your overall practical evaluation of this laboratory course module?",
    scale: [
      { val: "1", label: "Unsatisfactory" },
      { val: "2", label: "Fair" },
      { val: "3", label: "Good" },
      { val: "4", label: "Very Good" },
      { val: "5", label: "Outstanding" }
    ]
  },
  {
    id: 9,
    dim: "Constructive Feedback",
    title: "10. Written Lab Recommendations",
    prompt: "Suggestions for future lab exercises, software environments, or live coding challenges.",
    isText: true,
    chips: [
      "Excellent hands-on practical lab sessions",
      "Compilers and tools operated smoothly",
      "Add more algorithmic challenge problems",
      "Lab demonstrators were attentive and helpful",
      "Test cases were thorough and comprehensive",
      "Provide more guidance on debugging edge cases"
    ]
  }
];

export default function CourseFeedbackView({
  feedbackType,
  studentProfile,
  systemConfig,
  setView,
  user,
  COURSES_LIST,
  feedbackAnswers,
  setFeedbackAnswers,
  activeCourseFeedbackIdx,
  setActiveCourseFeedbackIdx,
  feedbackSuccess,
  handleFeedbackSubmit,
  handleFeedbackValueChange
}) {
  const activeCandidateId = studentProfile?._id || studentProfile?.id || user?.id;
  const activeFeedbackType = feedbackType === 'end' ? 'end' : 'mid';

  const isFeedbackSubmitted = activeFeedbackType === 'mid' ? 
    (studentProfile?.midSemFeedback && Object.keys(studentProfile.midSemFeedback).length > 0) : 
    (studentProfile?.endSemFeedback && Object.keys(studentProfile.endSemFeedback).length > 0);

  // Modal States
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showResetDraftModal, setShowResetDraftModal] = useState(false);
  const [validationModal, setValidationModal] = useState({ isOpen: false, missingCourses: [] });
  const [errorModal, setErrorModal] = useState({ isOpen: false, message: '' });

  // Subtle toast notification
  const [toastMessage, setToastMessage] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Strict scope validation: Candidate ID and feedbackType ('mid' | 'end') must be verified
  const hasValidScope = Boolean(
    activeCandidateId && 
    (activeFeedbackType === 'mid' || activeFeedbackType === 'end')
  );
  const currentScope = hasValidScope ? `${String(activeCandidateId)}_${activeFeedbackType}` : null;
  const draftKey = hasValidScope ? `bics_fb_draft_v3_${currentScope}` : null;

  // Hydration guards to prevent race conditions or cross-candidate leakage
  const isHydratedRef = useRef(false);
  const activeScopeRef = useRef(null);

  // Purge legacy, unversioned, or cross-contaminated draft keys from localStorage
  const purgeLegacyDrafts = () => {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('bics_feedback_draft_') || k.startsWith('bics_fb_draft_'))) {
          // Keep only current active v3 key
          if (k !== draftKey) {
            if (
              !k.startsWith('bics_fb_draft_v3_') ||
              k.includes('undefined') ||
              k.includes('null') ||
              k.endsWith('_candidate_mid') ||
              k.endsWith('_candidate_end')
            ) {
              keysToRemove.push(k);
            }
          }
        }
      }
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
  };

  // Helper to completely purge draft cache for this candidate and feedbackType
  const deleteDraftCache = () => {
    isHydratedRef.current = false;
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch (_) {}
    }
    if (activeCandidateId && activeFeedbackType) {
      try {
        localStorage.removeItem(`bics_fb_draft_v3_${activeCandidateId}_${activeFeedbackType}`);
        localStorage.removeItem(`bics_fb_draft_v2_${activeCandidateId}_${activeFeedbackType}`);
        localStorage.removeItem(`bics_feedback_draft_${activeCandidateId}_${activeFeedbackType}`);
        localStorage.removeItem(`bics_fb_draft_${activeCandidateId}_${activeFeedbackType}`);
      } catch (_) {}
    }
    if (user?.id && activeFeedbackType) {
      try {
        localStorage.removeItem(`bics_fb_draft_v3_${user.id}_${activeFeedbackType}`);
        localStorage.removeItem(`bics_fb_draft_v2_${user.id}_${activeFeedbackType}`);
        localStorage.removeItem(`bics_feedback_draft_${user.id}_${activeFeedbackType}`);
        localStorage.removeItem(`bics_fb_draft_${user.id}_${activeFeedbackType}`);
      } catch (_) {}
    }
    if (setFeedbackAnswers) {
      setFeedbackAnswers({});
    }
    setDraftSavedAt(null);
  };

  // Restore draft strictly matching current candidate and feedbackType
  useEffect(() => {
    purgeLegacyDrafts();

    // Reset hydration state on scope change
    isHydratedRef.current = false;
    activeScopeRef.current = currentScope;

    // Strict guard: Do not load if candidate identity or feedback type is unverified
    if (!hasValidScope || !draftKey) {
      if (setFeedbackAnswers) setFeedbackAnswers({});
      setDraftSavedAt(null);
      return;
    }

    // If feedback is already submitted in database, delete any stale local cache immediately
    if (isFeedbackSubmitted) {
      deleteDraftCache();
      return;
    }

    // Load draft ONLY if it strictly matches this candidate AND feedbackType
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          parsed.version === 3 &&
          String(parsed.candidateId) === String(activeCandidateId) &&
          parsed.feedbackType === activeFeedbackType &&
          parsed.answers &&
          typeof parsed.answers === 'object'
        ) {
          if (setFeedbackAnswers) {
            setFeedbackAnswers(parsed.answers);
          }
          if (parsed.updatedAt) {
            setDraftSavedAt(new Date(parsed.updatedAt));
          }
          isHydratedRef.current = true;
          return;
        } else {
          // Stale, malformed, or mismatched draft -> purge
          localStorage.removeItem(draftKey);
        }
      }
    } catch (_) {
      try { localStorage.removeItem(draftKey); } catch (_) {}
    }

    // Fresh empty state if no valid draft exists for this scope
    if (setFeedbackAnswers) {
      setFeedbackAnswers({});
    }
    setDraftSavedAt(null);
    isHydratedRef.current = true;
  }, [currentScope, isFeedbackSubmitted]);

  // Save draft function strictly scoped to candidate and feedbackType
  const saveDraftToStorage = () => {
    if (!hasValidScope || !draftKey || isFeedbackSubmitted) return;
    if (!isHydratedRef.current) return;
    if (activeScopeRef.current !== currentScope) return;
    if (!feedbackAnswers || typeof feedbackAnswers !== 'object') return;

    const hasAnyAnswers = Object.values(feedbackAnswers).some(
      ans => ans && typeof ans === 'object' && Object.keys(ans).length > 0
    );
    if (!hasAnyAnswers) return;

    try {
      const now = new Date();
      const payload = {
        version: 3,
        candidateId: String(activeCandidateId),
        studentId: studentProfile?.studentId || user?.username || '',
        feedbackType: activeFeedbackType,
        updatedAt: now.toISOString(),
        answers: feedbackAnswers
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
      setDraftSavedAt(now);
    } catch (_) {}
  };

  // Auto-save on answer change ONLY AFTER HYDRATION HAS COMPLETED
  // Note: Dependency array strictly contains [feedbackAnswers] so scope changes never auto-write
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (activeScopeRef.current !== currentScope) return;
    if (isFeedbackSubmitted) return;

    saveDraftToStorage();
  }, [feedbackAnswers]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Helpers to check course questions and completion
  const getCourseQuestions = (course) => {
    const isLab = course.toLowerCase().includes('lab') || course.includes('02L') || course.includes('03L');
    return isLab ? LAB_QUESTIONS : THEORY_QUESTIONS;
  };

  const getMissingQuestionsForCourse = (course) => {
    const questions = getCourseQuestions(course);
    const a = feedbackAnswers?.[course] || {};
    const missing = [];

    questions.forEach(q => {
      const val = a[q.id];
      const isAnswered = q.isText ? (val && val.trim() !== '') : Boolean(val);
      if (!isAnswered) {
        missing.push({
          num: `Q${q.id + 1}`,
          dim: q.dim,
          title: q.title
        });
      }
    });

    return missing;
  };

  const getAnsweredCount = (course) => {
    const a = feedbackAnswers?.[course];
    if (!a) return 0;
    let count = 0;
    for (let i = 0; i < 9; i++) {
      if (a[i]) count++;
    }
    if (a[9] && a[9].trim() !== '') count++;
    return count;
  };

  const isCourseComplete = (course) => {
    return getAnsweredCount(course) === 10;
  };

  const totalPossible = COURSES_LIST.length * 10;
  const totalAnswered = COURSES_LIST.reduce((acc, c) => acc + getAnsweredCount(c), 0);
  const overallPct = Math.round((totalAnswered / totalPossible) * 100);
  const allCoursesComplete = COURSES_LIST.every(isCourseComplete);

  const currentCourse = COURSES_LIST[activeCourseFeedbackIdx] || COURSES_LIST[0];
  const currentQuestions = getCourseQuestions(currentCourse);
  const currentAnswers = feedbackAnswers?.[currentCourse] || {};
  const currentAnsweredCount = getAnsweredCount(currentCourse);

  const currentCode = currentCourse.split(' - ')[0] || currentCourse;
  const currentTitle = currentCourse.split(' - ')[1] || currentCourse;
  const isLastCourse = activeCourseFeedbackIdx === COURSES_LIST.length - 1;

  // Save Draft & Next handler for all courses except the last
  const handleSaveDraftAndNext = () => {
    saveDraftToStorage();
    setToastMessage(`Draft saved for Module 0${activeCourseFeedbackIdx + 1}. Proceeding to Module 0${activeCourseFeedbackIdx + 2}...`);
    setActiveCourseFeedbackIdx(prev => Math.min(COURSES_LIST.length - 1, prev + 1));
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  // Submit trigger handler for the last course
  const handleFinalSubmitClick = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    saveDraftToStorage();

    if (!allCoursesComplete) {
      // Find all incomplete courses and their specific missing questions
      const missing = COURSES_LIST.map((course, idx) => {
        const missingList = getMissingQuestionsForCourse(course);
        return {
          course,
          idx,
          missingList,
          remaining: missingList.length
        };
      }).filter(c => c.remaining > 0);

      setValidationModal({
        isOpen: true,
        missingCourses: missing
      });
      return;
    }

    // All complete -> show pre-submission review modal
    setShowReviewModal(true);
  };

  // Execute submission from review modal and delete local cache upon success
  const handleConfirmFinalSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSubmitting(true);
    setShowReviewModal(false);

    try {
      const res = await handleFeedbackSubmit(e, activeFeedbackType);
      if (res && res.success) {
        // DELETE LOCAL CACHE UPON SUCCESSFUL SUBMISSION
        deleteDraftCache();
        setShowSuccessModal(true);
      } else {
        setErrorModal({
          isOpen: true,
          message: res?.error || "Failed to submit feedback. Please check your connection and try again."
        });
      }
    } catch (err) {
      setErrorModal({
        isOpen: true,
        message: err.message || "An unexpected error occurred during feedback submission."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cf-card">
      {/* Outer Box Header matching Portal Institutional Style */}
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <MessageSquare size={16} style={{ color: '#3b5998' }} />
        <span>Course Feedback Survey — {activeFeedbackType === 'mid' ? 'Mid' : 'End'} Semester</span>

        {!isFeedbackSubmitted && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
            {draftSavedAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '8pt', color: '#64748b', fontWeight: 'normal' }}>
                <Save size={12} color="#16a34a" />
                <span>Draft saved</span>
                <button
                  type="button"
                  onClick={() => setShowResetDraftModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '7.5pt',
                    padding: 0
                  }}
                  title="Click to reset draft answers"
                >
                  (reset)
                </button>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '8pt', fontWeight: 600, color: '#475569' }}>
                Progress: {totalAnswered} / {totalPossible} ({overallPct}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div style={{
          marginBottom: '14px',
          padding: '9px 14px',
          backgroundColor: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          color: '#334155',
          fontSize: '8.5pt',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle size={14} color="#16a34a" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Closed by Admin Notification */}
      {((feedbackType === 'mid' && !systemConfig?.midSemFeedbackActive) || (feedbackType === 'end' && !systemConfig?.endSemFeedbackActive)) ? (
        <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontSize: '9pt' }}>
          <strong>Notice:</strong> {feedbackType === 'mid' ? 'Mid' : 'End'} Semester Course Feedback is currently closed by the examination authority.
        </div>
      ) : isFeedbackSubmitted ? (
        /* SIMPLE SUCCESS VIEW — STRICTLY NO READ ACCESS, NO PDF PRINT (PER USER DIRECTIVE) */
        <div style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '560px', margin: '10px auto' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 16px auto' }}>
            <CheckCircle size={28} color="#16a34a" />
          </div>
          
          <h2 style={{ fontSize: '13pt', fontWeight: 700, color: '#002147', marginBottom: '8px' }}>
            Feedback Survey Submitted
          </h2>
          <p style={{ fontSize: '9pt', color: '#475569', lineHeight: 1.6, margin: '0 auto 24px auto' }}>
            You have successfully completed and submitted your Course Feedback Survey for the {feedbackType === 'mid' ? 'Mid-Semester' : 'End-Semester'} exams. Your evaluations are securely recorded and sealed. Thank you for your valuable academic feedback!
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              type="button"
              onClick={() => setView('hallticket')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                fontSize: '9pt',
                fontWeight: 600,
                backgroundColor: '#ffffff',
                color: '#002147',
                border: '1.5px solid #002147',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              Proceed to Hall Ticket &rarr;
            </button>
            <button 
              type="button"
              onClick={() => setView('announcements')}
              style={{
                padding: '8px 18px',
                fontSize: '9pt',
                backgroundColor: '#ffffff',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        /* ACTIVE SURVEY VIEW */
        <div>
          {feedbackSuccess && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#166534', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={15} color="#16a34a" />
              <span>{feedbackSuccess}</span>
            </div>
          )}

          {/* Subtle Light Course Stepper Navigation */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '20px' }}>
            {COURSES_LIST.map((course, idx) => {
              const isSelected = activeCourseFeedbackIdx === idx;
              const count = getAnsweredCount(course);
              const done = count === 10;
              const code = course.split(' - ')[0] || course;
              const title = course.split(' - ')[1] || course;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveCourseFeedbackIdx(idx)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '9px 11px',
                    borderRadius: '4px',
                    border: isSelected ? '1px solid #94a3b8' : '1px solid #e2e8f0',
                    borderTop: isSelected ? '2.5px solid #002147' : '2.5px solid transparent',
                    backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.12s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '3px' }}>
                    <span style={{ fontSize: '7.5pt', fontWeight: 600, color: isSelected ? '#002147' : '#64748b', textTransform: 'uppercase' }}>
                      Module 0{idx + 1}
                    </span>
                    {done ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '7pt', color: '#166534', fontWeight: 600 }}>
                        <CheckCircle size={11} color="#16a34a" /> 10/10
                      </span>
                    ) : (
                      <span style={{ fontSize: '7pt', color: count > 0 ? '#b45309' : '#94a3b8', fontWeight: 500 }}>
                        {count}/10
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '8.5pt', fontWeight: 600, color: '#0f172a', lineHeight: 1.2, marginBottom: '2px' }}>
                    {code}
                  </div>
                  <div style={{ fontSize: '7pt', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }} title={title}>
                    {title}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Course Card & 10 Dimensions Questionnaire */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '20px' }}>
            {/* Course Header Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '18px' }}>
              <div>
                <div style={{ display: 'inline-block', backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontSize: '7.5pt', fontWeight: 600, padding: '2px 7px', borderRadius: '3px', marginBottom: '4px' }}>
                  {currentCode} &bull; {currentCourse.toLowerCase().includes('lab') ? 'Practical Laboratory' : 'Core Theory'}
                </div>
                <h3 style={{ margin: 0, fontSize: '11.5pt', fontWeight: 700, color: '#002147' }}>
                  {currentTitle}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '8pt', color: '#64748b' }}>
                  Course {activeCourseFeedbackIdx + 1} of {COURSES_LIST.length}
                </span>
                {currentAnsweredCount === 10 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#f8fafc', color: '#166534', border: '1px solid #cbd5e1', fontSize: '7.5pt', fontWeight: 600, padding: '2px 7px', borderRadius: '3px' }}>
                    <CheckCircle size={11} color="#16a34a" /> 10 / 10 Completed
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontSize: '7.5pt', fontWeight: 500, padding: '2px 7px', borderRadius: '3px' }}>
                    {currentAnsweredCount} / 10 Answered
                  </span>
                )}
              </div>
            </div>

            {/* Questions 1 to 10 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {currentQuestions.map((q) => {
                const currentVal = currentAnswers[q.id];
                const isAnswered = q.isText ? (currentVal && currentVal.trim() !== '') : Boolean(currentVal);

                return (
                  <div 
                    key={q.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderLeft: isAnswered ? '3px solid #64748b' : '3px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '14px 16px',
                      transition: 'border-color 0.12s ease'
                    }}
                  >
                    {/* Dimension Tag & Question Title */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '9pt', fontWeight: 600, color: '#0f172a' }}>
                        {q.title}
                      </span>
                      <span style={{ fontSize: '7pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                        {q.dim}
                      </span>
                    </div>

                    <p style={{ fontSize: '8.5pt', color: '#475569', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                      {q.prompt}
                    </p>

                    {/* Subtle Light Likert Scale (Q1 - Q9) */}
                    {!q.isText && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        {q.scale.map((item) => {
                          const isSelected = currentVal === item.val;

                          return (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => handleFeedbackValueChange(currentCourse, q.id, item.val)}
                              style={{
                                height: '44px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                border: isSelected ? '1.5px solid #475569' : '1px solid #cbd5e1',
                                backgroundColor: isSelected ? '#f1f5f9' : '#ffffff',
                                color: isSelected ? '#0f172a' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.12s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.backgroundColor = '#f8fafc';
                                  e.currentTarget.style.borderColor = '#94a3b8';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.backgroundColor = '#ffffff';
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                }
                              }}
                            >
                              <span style={{ fontSize: '10pt', fontWeight: 700, lineHeight: 1 }}>
                                {item.val}
                              </span>
                              <span style={{ fontSize: '6.5pt', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#334155' : '#64748b', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.2px', textAlign: 'center', padding: '0 2px' }}>
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Text Suggestions & Textarea (Q10) */}
                    {q.isText && (
                      <div>
                        {/* Quick tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                          {q.chips.map((chip, chipIdx) => (
                            <button
                              key={chipIdx}
                              type="button"
                              onClick={() => {
                                const prev = currentAnswers[9] || '';
                                if (prev.includes(chip)) return;
                                const updated = prev ? `${prev}. ${chip}` : chip;
                                handleFeedbackValueChange(currentCourse, 9, updated);
                              }}
                              style={{
                                fontSize: '7.5pt',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                borderRadius: '3px',
                                padding: '2px 8px',
                                cursor: 'pointer',
                                transition: 'all 0.1s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                              title="Click to insert into remarks"
                            >
                              + {chip}
                            </button>
                          ))}
                        </div>

                        <textarea
                          rows="3"
                          placeholder="Type your constructive suggestions or remarks for this course..."
                          value={currentAnswers[9] || ''}
                          onChange={(e) => handleFeedbackValueChange(currentCourse, 9, e.target.value)}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '9px 11px',
                            fontSize: '9pt',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            color: '#0f172a',
                            resize: 'vertical',
                            minHeight: '70px',
                            fontFamily: 'inherit'
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Stepper Footer Controls — Subtle & Light Buttons Matching Theme */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveCourseFeedbackIdx(prev => Math.max(0, prev - 1))}
                disabled={activeCourseFeedbackIdx === 0}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '9pt',
                  fontWeight: 500,
                  backgroundColor: '#ffffff',
                  color: activeCourseFeedbackIdx === 0 ? '#94a3b8' : '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  opacity: activeCourseFeedbackIdx === 0 ? 0.45 : 1,
                  cursor: activeCourseFeedbackIdx === 0 ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => { if (activeCourseFeedbackIdx > 0) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                <ArrowLeft size={14} /> Previous Course
              </button>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* FOR ALL MODULES EXCEPT THE LAST: SUBTLE LIGHT "SAVE DRAFT & NEXT ->" BUTTON */}
                {!isLastCourse && (
                  <button
                    type="button"
                    onClick={handleSaveDraftAndNext}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 18px',
                      fontSize: '9pt',
                      fontWeight: 600,
                      backgroundColor: '#ffffff',
                      color: '#002147',
                      border: '1px solid #94a3b8',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#002147'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                  >
                    <Save size={14} color="#002147" /> Save Draft &amp; Next &rarr;
                  </button>
                )}

                {/* FOR THE LAST MODULE ONLY: SUBTLE LIGHT "REVIEW & SUBMIT SURVEY ->" BUTTON */}
                {isLastCourse && (
                  <button
                    type="button"
                    onClick={handleFinalSubmitClick}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 22px',
                      fontSize: '9pt',
                      fontWeight: 700,
                      backgroundColor: '#ffffff',
                      color: '#002147',
                      border: '1.5px solid #002147',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                  >
                    <Send size={14} color="#002147" /> Review &amp; Submit Survey &rarr;
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. CUSTOM VALIDATION ERROR MODAL — LISTS REMAINING QUESTIONS ON A NEW LINE */}
      {validationModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            border: '1px solid #cbd5e1',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} color="#b45309" />
                <h3 style={{ margin: 0, fontSize: '10.5pt', fontWeight: 700, color: '#002147' }}>
                  Incomplete Survey Evaluation
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setValidationModal({ isOpen: false, missingCourses: [] })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '8.5pt', color: '#475569', lineHeight: 1.45 }}>
                Please answer all 10 evaluation dimensions before submitting. The following module(s) require attention:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {validationModal.missingCourses.map((item) => (
                  <div 
                    key={item.idx}
                    style={{
                      padding: '11px 13px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px'
                    }}
                  >
                    {/* Module Title, Remaining Count & Subtle Jump Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#0f172a' }}>
                          Module 0{item.idx + 1}: {item.course.split(' - ')[0]}
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '1px' }}>
                          {item.course.split(' - ')[1]}
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#b45309', fontWeight: 600, marginTop: '3px' }}>
                          {item.remaining} of 10 evaluation questions remaining
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveCourseFeedbackIdx(item.idx);
                          setValidationModal({ isOpen: false, missingCourses: [] });
                          window.scrollTo({ top: 120, behavior: 'smooth' });
                        }}
                        style={{
                          padding: '5px 12px',
                          fontSize: '8pt',
                          fontWeight: 600,
                          backgroundColor: '#ffffff',
                          color: '#002147',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      >
                        Jump to Course &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setValidationModal({ isOpen: false, missingCourses: [] })}
                style={{
                  padding: '6px 16px',
                  fontSize: '8.5pt',
                  fontWeight: 500,
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                Close &amp; Review Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. CUSTOM GENERAL ERROR MODAL */}
      {errorModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            border: '1px solid #cbd5e1',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: '10.5pt', fontWeight: 700, color: '#dc2626' }}>
                  Submission Error
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setErrorModal({ isOpen: false, message: '' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={17} />
              </button>
            </div>
            <div style={{ padding: '16px 18px', fontSize: '8.5pt', color: '#334155', lineHeight: 1.5 }}>
              {errorModal.message}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setErrorModal({ isOpen: false, message: '' })}
                style={{
                  padding: '6px 16px',
                  fontSize: '8.5pt',
                  fontWeight: 600,
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PRE-SUBMISSION CONFIRMATION / REVIEW MODAL */}
      {showReviewModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            border: '1px solid #cbd5e1',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '11pt', fontWeight: 700, color: '#002147' }}>
                  Review Feedback Submission — {feedbackType === 'mid' ? 'Mid' : 'End'} Semester
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '8pt', color: '#64748b' }}>
                  Please confirm your evaluation before locking. Responses cannot be edited after final submission.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowReviewModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '7px 6px', fontWeight: 600 }}>Course Module</th>
                    <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'center' }}>Completion</th>
                    <th style={{ padding: '7px 6px', fontWeight: 600, textAlign: 'center' }}>Avg Rating</th>
                    <th style={{ padding: '7px 6px', fontWeight: 600 }}>Remarks Excerpt</th>
                  </tr>
                </thead>
                <tbody>
                  {COURSES_LIST.map((course, idx) => {
                    const a = feedbackAnswers?.[course] || {};
                    const isDone = isCourseComplete(course);
                    const numRatings = [a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]]
                      .map(v => parseFloat(v))
                      .filter(v => !isNaN(v));
                    const avg = numRatings.length > 0 ? (numRatings.reduce((x, y) => x + y, 0) / numRatings.length).toFixed(1) : '-';
                    const remark = a[9] ? (a[9].length > 35 ? `${a[9].substring(0, 35)}...` : a[9]) : '(No remarks)';

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 6px', fontWeight: 600, color: '#0f172a' }}>
                          {course.split(' - ')[0]}
                          <div style={{ fontSize: '7.5pt', fontWeight: 400, color: '#64748b' }}>
                            {course.split(' - ')[1]}
                          </div>
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                          {isDone ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#166534', fontWeight: 600, fontSize: '7.5pt', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                              <CheckCircle size={11} color="#16a34a" /> 10 / 10
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#b45309', fontWeight: 600, fontSize: '7.5pt', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '2px 7px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                              Incomplete
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 700, color: '#002147' }}>
                          {avg !== '-' ? `${avg} / 5` : '-'}
                        </td>
                        <td style={{ padding: '9px 6px', color: '#475569', fontStyle: 'italic' }}>
                          "{remark}"
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: '14px', padding: '9px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '8pt', color: '#475569' }}>
                <strong>Institutional Confirmation:</strong> By clicking "Confirm &amp; Finalize Submission", you certify that this survey represents your honest and independent evaluation.
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmitting}
                style={{
                  padding: '7px 16px',
                  fontSize: '8.5pt',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmFinalSubmit}
                disabled={isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 20px',
                  fontSize: '8.5pt',
                  fontWeight: 700,
                  backgroundColor: '#ffffff',
                  color: '#002147',
                  border: '1.5px solid #002147',
                  borderRadius: '4px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  opacity: isSubmitting ? 0.7 : 1
                }}
                onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm & Finalize Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. CUSTOM SUCCESS MODAL — SIMPLE INSTITUTIONAL CONFIRMATION PER USER DIRECTIVE */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            maxWidth: '420px',
            width: '100%',
            padding: '24px 22px',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            border: '1px solid #cbd5e1'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}>
              <CheckCircle size={24} color="#16a34a" />
            </div>

            <p style={{ fontSize: '9.5pt', color: '#0f172a', fontWeight: 600, lineHeight: 1.5, margin: '0 0 18px 0' }}>
              Your {activeFeedbackType === 'mid' ? 'mid' : 'end'} sem course feedback has been successfully submitted.
            </p>

            <button
              type="button"
              onClick={() => {
                setShowSuccessModal(false);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '7px 24px',
                fontSize: '8.5pt',
                fontWeight: 600,
                backgroundColor: '#ffffff',
                color: '#002147',
                border: '1px solid #94a3b8',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 5. CUSTOM RESET DRAFT CONFIRMATION MODAL (ZERO BROWSER DIALOGS) */}
      {showResetDraftModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            maxWidth: '440px',
            width: '100%',
            padding: '24px 26px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            border: '1px solid #cbd5e1'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <AlertCircle size={20} color="#e11d48" />
              <h3 style={{ margin: 0, fontSize: '11pt', fontWeight: 700, color: '#002147' }}>
                Clear Drafted Answers?
              </h3>
            </div>
            <p style={{ margin: '0 0 18px 0', fontSize: '8.5pt', color: '#475569', lineHeight: 1.5 }}>
              Are you sure you want to clear your saved draft for this {activeFeedbackType === 'mid' ? 'Mid' : 'End'} Semester survey? This will reset all questions for this module.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowResetDraftModal(false)}
                style={{
                  padding: '7px 16px',
                  fontSize: '8.5pt',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDraftCache();
                  setShowResetDraftModal(false);
                  setToastMessage("Local draft cache deleted. Form reset.");
                }}
                style={{
                  padding: '7px 18px',
                  fontSize: '8.5pt',
                  fontWeight: 600,
                  backgroundColor: '#ffffff',
                  color: '#e11d48',
                  border: '1px solid #e11d48',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fff1f2'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                Clear Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
