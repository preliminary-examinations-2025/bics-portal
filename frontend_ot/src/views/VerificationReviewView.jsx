import React from 'react';
import { 
  Lock, ShieldCheck, BookOpen, Check, X, Flag, ShieldAlert, Clock, Award, ArrowRight 
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { getReturnUrl } from '../config/constants';
import { RichText } from '../components/common/RichText';
import { CenteredFooter } from '../components/common/CenteredFooter';
import { ObjectionModal } from '../components/verification/ObjectionModal';

export function VerificationReviewView({
  candidate,
  test,
  submission,
  webDevPreviewTabs,
  setWebDevPreviewTabs,
  verificationInstructionsModalOpen,
  setVerificationInstructionsModalOpen,
  verificationConsentChecked,
  setVerificationConsentChecked,
  handleOpenObjectionModal,
  objectionModal,
  setObjectionModal,
  handleCloseObjectionModal,
  handleCopyObjectionId,
  handleObjectionFileUpload,
  handleSubmitObjection
}) {
  const dashboardUrl = getReturnUrl('/submissions/verification');

  const questions = test?.questions || [];
  const answers = submission?.answers || [];
  const objections = submission?.objections || [];
  
  // Dynamic Score Helper (respects official admin objection resolution marks)
  const getQuestionScore = (q, idx) => {
    const ans = answers.find(a => String(a.questionId) === String(q.id)) || answers[idx] || {};
    const obj = objections.find(o => o.questionIndex === idx || (q.id && String(o.questionId) === String(q.id)));
    
    if (obj && obj.status === 'resolved' && obj.resolvedMarks !== undefined && obj.resolvedMarks !== null && !isNaN(obj.resolvedMarks)) {
      return Number(obj.resolvedMarks);
    }
    
    if (ans.score !== undefined && ans.score !== null && !isNaN(ans.score)) {
      return Number(ans.score);
    }
    
    if (q.type === 'mcq') {
      return (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null && Number(ans.selectedOptionIndex) === Number(q.correctOptionIndex)) ? Number(q.points || 0) : 0;
    }
    
    return 0;
  };

  // Calculate totals
  const totalMax = questions.reduce((sum, q) => sum + Number(q.points || 0), 0);
  const totalScored = questions.length > 0 
    ? questions.reduce((sum, q, idx) => sum + getQuestionScore(q, idx), 0)
    : ((submission?.evaluation?.mcqScore || 0) + (submission?.evaluation?.codingScore || 0));
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
          <img 
            src={`${import.meta.env.BASE_URL}bics_logo.png`} 
            onError={(e) => { e.currentTarget.src = '/bics_logo.png'; }} 
            alt="BICS Logo" 
            style={{ height: '36px', width: '36px', objectFit: 'contain' }} 
          />
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
            onClick={() => {
              setVerificationInstructionsModalOpen(true);
              setVerificationConsentChecked(true);
            }}
            style={{
              backgroundColor: '#ffffff',
              color: '#002147',
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
            <BookOpen size={14} style={{ color: '#002147' }} /> Instructions &amp; Rules
          </button>

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
              <div><strong>Submission Date:</strong> {submission?.submittedAt ? `${new Date(submission.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'Recorded'}</div>
              <div><strong>Evaluation Status:</strong> <span style={{ color: test?.verificationStatus === 'closed' ? '#475569' : '#166534', fontWeight: 'bold' }}>{test?.verificationStatus === 'closed' ? 'Finalized (Verification Closed)' : 'Finalized & Verification Open'}</span></div>
            </div>
          </div>

          {/* Quick jump to question navigation chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Jump to Question:</span>
            {questions.map((q, idx) => {
              const qScore = getQuestionScore(q, idx);
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
          const obj = objections.find(o => o.questionIndex === idx || (q.id && String(o.questionId) === String(q.id)));
          const qScore = getQuestionScore(q, idx);
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
                <h3 style={{ fontSize: '11.5pt', color: '#0f172a', fontWeight: 'bold', margin: '0 0 8px 0', lineHeight: 1.5 }}>
                  <RichText text={q.title || `Question #${idx + 1}`} />
                </h3>
                {(q.description || q.questionText || q.statement) && (
                  <div style={{ fontSize: '10pt', color: '#334155', lineHeight: 1.6, marginBottom: '10px' }}>
                    <RichText text={q.description || q.questionText || q.statement} />
                  </div>
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
                        Raised on: {new Date(obj.raisedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
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
                        backgroundColor: '#fffbeb',
                        fontFamily: 'verdana, arial, sans-serif'
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
                    const isCandidateChoice = ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== undefined && Number(ans.selectedOptionIndex) === optIdx;
                    const isOfficialCorrect = q.correctOptionIndex !== null && q.correctOptionIndex !== undefined && Number(q.correctOptionIndex) === optIdx;

                    let borderColor = '#e2e8f0';
                    let bgColor = '#ffffff';
                    let badge = null;

                    if (isCandidateChoice && isOfficialCorrect) {
                      borderColor = '#22c55e';
                      bgColor = '#f0fdf4';
                      badge = <span style={{ color: '#166534', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>Your Choice (Correct)</span>;
                    } else if (isCandidateChoice && !isOfficialCorrect) {
                      borderColor = '#ef4444';
                      bgColor = '#fef2f2';
                      badge = <span style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>Your Selection (Incorrect)</span>;
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
                          <RichText text={opt} style={{ fontSize: '9.5pt', color: '#334155' }} />
                        </div>
                        {badge}
                      </div>
                    );
                  })}

                  {/* Official Solution Explanation */}
                  {q.explanation && (
                    <div style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid #3b5998', padding: '14px 18px', borderRadius: '4px', marginTop: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '9pt', color: '#002147', marginBottom: '4px' }}>
                        Official Rationale &amp; Solution Explanation:
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
                    <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                      <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', textAlign: 'left', border: '1px solid #cbd5e1' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                            <th style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>Testcase ID</th>
                            <th style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>Input</th>
                            <th style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>Expected Output</th>
                            <th style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>Your Output</th>
                            <th style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>Evaluation Verdict</th>
                            <th style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>Points</th>
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
                            const displayVerdict = tcRes.status ? (isPassed ? `${tcRes.status}` : `${tcRes.status}`) : (isPassed ? 'Accepted (Passed)' : 'Failed / Mismatch');

                            const expectedVal = tc.output !== undefined && tc.output !== null ? tc.output : (tcRes.expectedOutput || '');
                            const actualVal = tcRes.actualOutput !== undefined && tcRes.actualOutput !== null && tcRes.actualOutput !== ''
                              ? tcRes.actualOutput
                              : (isPassed ? (tc.output || '(matched expected)') : (tcRes.status || '(no output)'));

                            const renderOutputBox = (val, fallback = '(empty)') => {
                              if (val === undefined || val === null || String(val).trim() === '') {
                                return <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '8pt' }}>{fallback}</span>;
                              }
                              const str = String(val);
                              const isVeryLong = str.length > 80;
                              const displayText = isVeryLong ? str.slice(0, 80) + '...' : str;

                              return (
                                <div
                                  title={str}
                                  style={{
                                    maxWidth: '220px',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre',
                                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                                    fontSize: '8pt',
                                    backgroundColor: '#f8fafc',
                                    padding: '4px 6px',
                                    borderRadius: '4px',
                                    border: '1px solid #cbd5e1',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  {displayText}
                                </div>
                              );
                            };

                            return (
                              <tr key={tcIdx}>
                                <td style={{ padding: '8px 12px', fontWeight: 'bold', fontFamily: 'monospace', border: '1px solid #cbd5e1' }}>
                                  2026{String(idx + 1).padStart(2, '0')}{String(tcIdx + 1).padStart(2, '0')}
                                </td>
                                <td style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>
                                  {renderOutputBox(tc.input !== undefined && tc.input !== null ? tc.input : tcRes.input, '(stdin empty)')}
                                </td>
                                <td style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>
                                  {renderOutputBox(expectedVal, '(no output)')}
                                </td>
                                <td style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>
                                  {renderOutputBox(actualVal, '(no output)')}
                                </td>
                                <td style={{ padding: '8px 12px', border: '1px solid #cbd5e1' }}>
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
                                <td style={{ padding: '8px 12px', fontWeight: 'bold', border: '1px solid #cbd5e1' }}>
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
            <span>Proctoring Integrity Audit &amp; Telemetry Log</span>
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
                Active &amp; Matched
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Objection Modal Dialog */}
      <ObjectionModal
        objectionModal={objectionModal}
        setObjectionModal={setObjectionModal}
        handleCloseObjectionModal={handleCloseObjectionModal}
        handleCopyObjectionId={handleCopyObjectionId}
        handleObjectionFileUpload={handleObjectionFileUpload}
        handleSubmitObjection={handleSubmitObjection}
      />

      {/* Important Instructions & Grievance Protocol Modal */}
      {verificationInstructionsModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 10001,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            maxWidth: '820px',
            width: '100%',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.2)',
            border: '1px solid #cbd5e1',
            overflow: 'hidden'
          }}>
            {/* Header matching OT Verification Page */}
            <div style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img 
                  src={`${import.meta.env.BASE_URL}bics_logo.png`} 
                  onError={(e) => { e.currentTarget.src = '/bics_logo.png'; }} 
                  alt="BICS Logo" 
                  style={{ height: '34px', width: '34px', objectFit: 'contain' }} 
                />
                <div>
                  <div style={{ fontSize: '11pt', fontWeight: 'bold', color: '#0f172a', letterSpacing: '0.2px' }}>
                    BICS Examination Portal
                  </div>
                  <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                    Evaluated Candidate Script Verification • Guidelines &amp; Grievance Protocol
                  </div>
                </div>
              </div>
              <div style={{
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '7.5pt',
                fontWeight: 'bold',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                Candidate Guidelines
              </div>
            </div>

            {/* Scrollable Content */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '9pt', color: '#334155', lineHeight: '1.6' }}>
              
              {/* Examination Banner */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderLeft: '4px solid #64748b',
                borderRadius: '4px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Examination Assessment</div>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#0f172a' }}>{test?.title || 'Academic Examination'}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '8pt', color: '#64748b' }}>
                  <div><strong>Candidate:</strong> {candidate?.name || 'Candidate'} ({candidate?.studentId || 'N/A'})</div>
                  <div><strong>Status:</strong> Evaluated Script Verification</div>
                </div>
              </div>

              {/* Section 1: Verification Window & Scope */}
              <div>
                <h4 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={15} style={{ color: '#475569' }} />
                  <span>1. 48-Hour Verification Window &amp; Academic Scope</span>
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '8.5pt' }}>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Strict 48-Hour Timeline:</strong> The Answer Script Verification and Grievance Window remains accessible strictly for <strong>48 hours</strong> from the timestamp of result publication. Once this deadline elapses, the verification portal is permanently locked, and all evaluated marks stand final and immutable.
                  </li>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Evaluated Script Access:</strong> Candidates are provided complete visibility into their submitted responses, official MCQ answer keys, compiler logs, and testcase pass/fail execution matrices.
                  </li>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Standardized Evaluation Matrix:</strong> All objective and programming submissions are processed against pre-verified benchmark criteria and sandboxed compiler environments under strict CPU time and memory boundaries.
                  </li>
                </ul>
              </div>

              {/* Section 2: Objection Procedure */}
              <div>
                <h4 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Flag size={15} style={{ color: '#d97706' }} />
                  <span>2. Grievance Lodging Protocol &amp; Requirements</span>
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '8.5pt' }}>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Per-Question Challenge:</strong> If you identify an evaluation anomaly or answer key ambiguity, navigate to that specific question card and click <strong>"Raise Objection"</strong>.
                  </li>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Specific Technical Substantiation:</strong> Objections must be accompanied by explicit technical reasoning (e.g., citing counter-examples, standard textbook formulas, benchmark output discrepancies, or specific line-level algorithmic logic).
                  </li>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Single Active Record:</strong> Only one grievance can remain active per question. Submitting modified remarks before the 48-hour window closes will overwrite any prior filing for that question.
                  </li>
                  <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.6' }}>
                    <strong>Official Portal Only:</strong> No grievances submitted via email, phone, or in-person will be recognized; all requests must be submitted through this portal.
                  </li>
                </ul>
              </div>

              {/* Section 3: Evaluation Criteria */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px' }}>
                <h4 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={15} style={{ color: '#059669' }} />
                  <span>3. Evaluation Committee Review: Criteria for Resolution &amp; Grounds for Rejection</span>
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderTop: '3px solid #16a34a', borderRadius: '4px', padding: '10px 12px' }}>
                    <div style={{ fontWeight: 'bold', color: '#166534', fontSize: '8pt', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={13} /> Grounds for Favorable Resolution (Marks Revision):
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '7.5pt', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.5' }}>Established typographical, computational, or answer-key inaccuracies in official benchmark data.</li>
                      <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.5' }}>Valid, mathematically correct alternative algorithms satisfying all time, memory, and boundary constraints.</li>
                      <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.5' }}>Autograder environment or compiler runtime anomalies verified by the Academic Board.</li>
                    </ul>
                  </div>

                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderTop: '3px solid #dc2626', borderRadius: '4px', padding: '10px 12px' }}>
                    <div style={{ fontWeight: 'bold', color: '#991b1b', fontSize: '8pt', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <X size={13} /> Grounds for Summary Rejection:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '7.5pt', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.5' }}>Vague, generic appeals or requests for sympathetic/grace marks without technical merit.</li>
                      <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.5' }}>Code failures due to Time Limit Exceeded (TLE), memory limit exceed, syntax errors, or unhandled corner cases.</li>
                      <li style={{ textAlign: 'justify', textJustify: 'inter-word', lineHeight: '1.5' }}>Claims logged after the conclusion of the 48-hour verification window.</li>
                    </ul>
                  </div>
                </div>

                <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '10px', fontStyle: 'italic', textAlign: 'justify' }}>
                  * In the event of an official key revision or question annulment, score corrections will cascade automatically to all affected candidate transcripts across the institution.
                </div>
              </div>

              {/* Section 4: Mandatory Undertaking */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderLeft: '4px solid #64748b',
                borderRadius: '4px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="verificationUndertakingConsent"
                  checked={verificationConsentChecked}
                  onChange={(e) => setVerificationConsentChecked(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px', flexShrink: 0 }}
                />
                <label htmlFor="verificationUndertakingConsent" style={{ fontSize: '8pt', color: '#334155', cursor: 'pointer', lineHeight: '1.5', fontWeight: '500', textAlign: 'justify', textJustify: 'inter-word' }}>
                  <strong>Candidate Undertaking:</strong> I hereby declare that I have carefully read and understood the Answer Script Verification &amp; Objection Protocol. I undertake to submit only bona fide, technically substantiated academic grievances and agree to abide unconditionally by the final determination of the Academic Evaluation Committee.
                </label>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <button
                type="button"
                onClick={() => window.location.href = dashboardUrl}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '7px 16px',
                  borderRadius: '4px',
                  fontSize: '8.5pt',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                ← Return to Student Portal
              </button>

              <button
                type="button"
                disabled={!verificationConsentChecked}
                onClick={() => {
                  if (!verificationConsentChecked) return;
                  setVerificationInstructionsModalOpen(false);
                  const subId = submission?._id || submission?.id;
                  if (subId) {
                    localStorage.setItem(`bics_verif_ack_${subId}`, 'true');
                  }
                }}
                style={{
                  backgroundColor: verificationConsentChecked ? '#ffffff' : '#f8fafc',
                  color: verificationConsentChecked ? '#0f172a' : '#94a3b8',
                  border: `1px solid ${verificationConsentChecked ? '#64748b' : '#cbd5e1'}`,
                  padding: '7px 18px',
                  borderRadius: '4px',
                  fontSize: '8.5pt',
                  fontWeight: '600',
                  cursor: verificationConsentChecked ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: verificationConsentChecked ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Accept Undertaking &amp; View Script</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>
        </div>
      )}

      <CenteredFooter />
    </div>
  );
}

export default VerificationReviewView;
