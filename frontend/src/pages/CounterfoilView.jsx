import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, AlertTriangle, ShieldAlert } from 'lucide-react';

const API_BASE = 'https://bics-portal.onrender.com';

const STANDARD_COURSES = [
  { code: 'R526CS01T', name: 'Introduction to Computer Science' },
  { code: 'R526CS02T', name: 'Programming Fundamentals with C++' },
  { code: 'R526CS03T', name: 'Basics of Web Development' },
  { code: 'R526CS04T', name: 'Mathematical Thinking' },
  { code: 'R526CS02L', name: 'Programming Fundamentals with C++ Lab' },
  { code: 'R526CS03L', name: 'Basics of Web Development Lab' }
];

export default function CounterfoilView({ user, studentProfile, systemConfig }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCourseCode, setActiveCourseCode] = useState('R526CS01T');
  const [marks, setMarks] = useState({});
  const [notice, setNotice] = useState({ type: '', msg: '' });

  const studentId = studentProfile?.studentId || user?.studentId || user?.username || 'STU1001';
  const studentName = studentProfile?.preferredName || studentProfile?.name || user?.name || 'Demo Candidate';

  const isCounterfoilActive = systemConfig?.counterfoilActive !== false;
  const examType = systemConfig?.examType === 'endsem' ? 'endsem' : 'midsem';
  const examName = examType === 'midsem' 
    ? 'Mid-Semester Examination 2026 (MST)' 
    : 'End-Semester Examination 2026 (ESE)';

  const questionCount = examType === 'midsem' ? 4 : 5;
  const maxPerQuestion = examType === 'midsem' ? 10 : 20;
  const maxTotalScore = questionCount * maxPerQuestion;

  // Fetch candidate's submissions
  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/counterfoil/my-submissions/${encodeURIComponent(studentId)}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch counterfoil submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [studentId]);

  // Load marks state when active course changes or submissions update
  useEffect(() => {
    const existingSub = submissions.find(
      s => s.courseCode === activeCourseCode && s.examType === examType
    );

    const initialMarks = {};
    for (let i = 1; i <= questionCount; i++) {
      if (existingSub?.questionMarks) {
        const qm = existingSub.questionMarks.find(q => q.questionNo === i);
        initialMarks[`q${i}`] = qm ? qm.obtainedMarks : '';
      } else {
        initialMarks[`q${i}`] = '';
      }
    }
    setMarks(initialMarks);
    setNotice({ type: '', msg: '' });
  }, [activeCourseCode, submissions, examType, questionCount]);

  const activeCourse = STANDARD_COURSES.find(c => c.code === activeCourseCode) || {
    code: activeCourseCode,
    name: 'Course'
  };

  const currentSubmission = submissions.find(
    s => s.courseCode === activeCourseCode && s.examType === examType
  );

  const isApproved = currentSubmission?.status === 'approved';
  const isPending = currentSubmission?.status === 'pending_approval';
  const isRejected = currentSubmission?.status === 'rejected';

  // Calculate live total score
  const liveTotalObtained = Object.values(marks).reduce((sum, val) => {
    const num = parseFloat(val);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  const handleMarkChange = (qKey, value) => {
    if (isApproved) return;
    if (value === '') {
      setMarks(prev => ({ ...prev, [qKey]: '' }));
      return;
    }
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;
    if (numVal < 0) return;
    if (numVal > maxPerQuestion) {
      setNotice({
        type: 'error',
        msg: `Marks for Question ${qKey.toUpperCase()} cannot exceed ${maxPerQuestion}`
      });
      return;
    }
    setNotice({ type: '', msg: '' });
    setMarks(prev => ({ ...prev, [qKey]: numVal }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isApproved) return;

    // Validate that all questions have entry
    const questionMarksPayload = [];
    for (let i = 1; i <= questionCount; i++) {
      const val = marks[`q${i}`];
      if (val === '' || val === undefined || val === null) {
        setNotice({
          type: 'error',
          msg: `Please enter marks for Question Q${i} before submitting.`
        });
        return;
      }
      questionMarksPayload.push({
        questionNo: i,
        obtainedMarks: Number(val),
        maxMarks: maxPerQuestion
      });
    }

    try {
      setSaving(true);
      setNotice({ type: '', msg: '' });
      const res = await fetch(`${API_BASE}/api/counterfoil/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName,
          courseCode: activeCourse.code,
          courseName: activeCourse.name,
          examType,
          examinationName: examName,
          questionMarks: questionMarksPayload
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setNotice({
          type: 'success',
          msg: `Counterfoil for ${activeCourse.code} submitted successfully! Awaiting admin approval.`
        });
        await fetchSubmissions();
      } else {
        setNotice({
          type: 'error',
          msg: resData.error || 'Failed to submit counterfoil marks.'
        });
      }
    } catch (err) {
      console.error('Submit error:', err);
      setNotice({
        type: 'error',
        msg: 'Server connection error. Please try again later.'
      });
    } finally {
      setSaving(false);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status) => {
    if (!status) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '8pt',
          fontWeight: 'bold',
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          border: '1px solid #cbd5e1'
        }}>
          Not Submitted
        </span>
      );
    }
    if (status === 'approved') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '8pt',
          fontWeight: 'bold',
          backgroundColor: '#d1fae5',
          color: '#047857',
          border: '1px solid #a7f3d0'
        }}>
          <CheckCircle size={12} /> Approved
        </span>
      );
    }
    if (status === 'pending_approval') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '8pt',
          fontWeight: 'bold',
          backgroundColor: '#fef3c7',
          color: '#b45309',
          border: '1px solid #fde68a'
        }}>
          <Clock size={12} /> Pending Approval
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '8pt',
          fontWeight: 'bold',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          border: '1px solid #fca5a5'
        }}>
          <AlertTriangle size={12} /> Rejected
        </span>
      );
    }
    return null;
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* HEADER CARD */}
      <div style={{
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              fontSize: '7.5pt',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              backgroundColor: '#e0f2fe',
              color: '#0284c7',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              Official Examination Portal
            </span>
            <span style={{ fontSize: '8.5pt', color: '#64748b' }}>Academic Session 2026</span>
          </div>
          <h1 style={{ fontSize: '18pt', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px 0' }}>
            Counterfoil Self-Reported Marks Entry
          </h1>
          <p style={{ fontSize: '9.5pt', color: '#475569', margin: 0 }}>
            Submit your candidate counterfoil marks for verification and administrative approval.
          </p>
        </div>

        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #bae6fd',
          borderRadius: '6px',
          padding: '10px 16px',
          textAlign: 'right',
          minWidth: '210px'
        }}>
          <div style={{ fontSize: '8pt', color: '#64748b', fontWeight: '500' }}>Active Exam Mode</div>
          <div style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#0284c7', marginTop: '2px' }}>{examName}</div>
          <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2px' }}>
            {examType === 'midsem' ? '4 Questions • 10 Marks Each' : '5 Questions • 20 Marks Each'}
          </div>
        </div>
      </div>

      {/* DEACTIVATED NOTICE */}
      {!isCounterfoilActive && (
        <div style={{
          backgroundColor: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: '8px',
          padding: '24px',
          textAlign: 'center'
        }}>
          <ShieldAlert size={36} style={{ color: '#d48806', margin: '0 auto 10px auto' }} />
          <h2 style={{ fontSize: '13pt', fontWeight: 'bold', color: '#873800', margin: '0 0 6px 0' }}>
            Counterfoil Entry Deactivated
          </h2>
          <p style={{ fontSize: '9.5pt', color: '#ad4e00', maxWidth: '500px', margin: '0 auto', lineHeight: '1.5' }}>
            Counterfoil Marks Entry is currently closed by the Examination Department administration. 
            Please contact the portal administration desk if you believe this is an error.
          </p>
        </div>
      )}

      {isCounterfoilActive && (
        <>
          {/* CANDIDATE SUMMARY BAR */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px'
          }}>
            <div>
              <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Candidate Name</span>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>{studentName}</div>
            </div>
            <div>
              <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Student ID / Reg. No.</span>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#0284c7', fontFamily: 'Fira Code, monospace', marginTop: '2px' }}>{studentId}</div>
            </div>
            <div>
              <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Examination</span>
              <div style={{ fontSize: '9.5pt', fontWeight: '600', color: '#334155', marginTop: '2px' }}>{examName}</div>
            </div>
            <div>
              <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max Total Marks</span>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>{maxTotalScore} Marks</div>
            </div>
          </div>

          {/* COURSE SELECTOR TABS */}
          <div>
            <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              Select Registered Course
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px'
            }}>
              {STANDARD_COURSES.map(course => {
                const sub = submissions.find(s => s.courseCode === course.code && s.examType === examType);
                const isSelected = activeCourseCode === course.code;

                return (
                  <button
                    key={course.code}
                    type="button"
                    onClick={() => setActiveCourseCode(course.code)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(2, 132, 199, 0.12)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{
                        fontSize: '8pt',
                        fontWeight: 'bold',
                        color: '#0284c7',
                        backgroundColor: '#e0f2fe',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {course.code}
                      </span>
                      {renderStatusBadge(sub?.status)}
                    </div>
                    <div style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#0f172a', lineHeight: '1.3' }}>
                      {course.name}
                    </div>
                    {sub && (
                      <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Obtained Score:</span>
                        <strong style={{ color: '#0f172a' }}>{sub.totalObtained} / {sub.totalMax}</strong>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* MAIN FORM CARD */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {/* CARD TITLE BAR */}
            <div style={{
              backgroundColor: '#f0f9ff',
              padding: '16px 20px',
              borderBottom: '1px solid #bae6fd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div>
                <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Counterfoil Entry Sheet
                </span>
                <h2 style={{ fontSize: '13pt', fontWeight: 'bold', color: '#0f172a', margin: '2px 0 0 0' }}>
                  {activeCourse.code} — {activeCourse.name}
                </h2>
              </div>
              <div>
                {renderStatusBadge(currentSubmission?.status)}
              </div>
            </div>

            {/* NOTICES */}
            {isRejected && (
              <div style={{
                margin: '16px 20px 0 20px',
                padding: '14px 16px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '6px',
                fontSize: '9pt',
                color: '#991b1b'
              }}>
                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <AlertTriangle size={16} /> Submission Rejected by Administrator
                </div>
                <div style={{ fontSize: '8.5pt', color: '#b91c1c' }}>
                  Remarks: <strong>{currentSubmission.adminRemarks || 'Please review your marks entry and resubmit.'}</strong>
                </div>
                <div style={{ fontSize: '8.5pt', color: '#7f1d1d', marginTop: '4px' }}>
                  You can modify your marks below and click "Submit Counterfoil for Approval" to resubmit.
                </div>
              </div>
            )}

            {isApproved && (
              <div style={{
                margin: '16px 20px 0 20px',
                padding: '14px 16px',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '6px',
                fontSize: '9pt',
                color: '#065f46'
              }}>
                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <CheckCircle size={16} /> Counterfoil Submission Approved &amp; Locked
                </div>
                <div style={{ fontSize: '8.5pt', color: '#047857' }}>
                  Approved Total Score: <strong>{currentSubmission.totalObtained} / {currentSubmission.totalMax}</strong>
                  {currentSubmission.approvedAt && ` on ${new Date(currentSubmission.approvedAt).toLocaleDateString()}`}
                </div>
              </div>
            )}

            {notice.msg && (
              <div style={{
                margin: '16px 20px 0 20px',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '9pt',
                fontWeight: '500',
                backgroundColor: notice.type === 'error' ? '#fef2f2' : '#ecfdf5',
                border: `1px solid ${notice.type === 'error' ? '#fca5a5' : '#a7f3d0'}`,
                color: notice.type === 'error' ? '#991b1b' : '#065f46'
              }}>
                {notice.msg}
              </div>
            )}

            {/* FORM */}
            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              
              {/* READ-ONLY INFO GRID */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div>
                  <span style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: '500', display: 'block' }}>Candidate Name</span>
                  <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a' }}>{studentName}</span>
                </div>
                <div>
                  <span style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: '500', display: 'block' }}>Student ID</span>
                  <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0284c7', fontFamily: 'Fira Code, monospace' }}>{studentId}</span>
                </div>
                <div>
                  <span style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: '500', display: 'block' }}>Course Code</span>
                  <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0284c7' }}>{activeCourse.code}</span>
                </div>
                <div>
                  <span style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: '500', display: 'block' }}>Examination</span>
                  <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a' }}>{examName}</span>
                </div>
              </div>

              {/* QUESTIONS TABLE */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '10pt', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                    Question-wise Marks Entry
                  </h3>
                  <span style={{ fontSize: '8pt', color: '#64748b' }}>
                    Max Marks per Question: <strong>{maxPerQuestion}</strong>
                  </span>
                </div>

                <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f0f9ff', borderBottom: '1px solid #bae6fd', color: '#0369a1', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <th style={{ padding: '10px 14px', width: '25%' }}>Question No.</th>
                        <th style={{ padding: '10px 14px', width: '25%' }}>Max Marks</th>
                        <th style={{ padding: '10px 14px', width: '35%' }}>Marks Obtained by Student</th>
                        <th style={{ padding: '10px 14px', width: '15%', textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: questionCount }, (_, idx) => {
                        const qNum = idx + 1;
                        const qKey = `q${qNum}`;
                        const currentVal = marks[qKey];

                        return (
                          <tr key={qKey} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                              Question {qNum}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>
                              {maxPerQuestion} Marks
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '180px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  max={maxPerQuestion}
                                  step="0.5"
                                  disabled={isApproved}
                                  value={currentVal !== undefined ? currentVal : ''}
                                  onChange={(e) => handleMarkChange(qKey, e.target.value)}
                                  placeholder={`0 - ${maxPerQuestion}`}
                                  style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    fontSize: '9pt',
                                    fontWeight: 'bold',
                                    color: '#0f172a',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    outline: 'none',
                                    backgroundColor: isApproved ? '#f1f5f9' : '#ffffff'
                                  }}
                                />
                                <span style={{ fontSize: '8.5pt', color: '#94a3b8' }}>/ {maxPerQuestion}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '8pt' }}>
                              {currentVal !== '' && currentVal !== undefined ? (
                                <span style={{ color: '#047857', fontWeight: 'bold' }}>✓ Recorded</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#f0f9ff', borderTop: '2px solid #bae6fd', fontWeight: 'bold' }}>
                        <td style={{ padding: '12px 14px', fontSize: '9.5pt', color: '#0f172a' }}>TOTAL SCORE</td>
                        <td style={{ padding: '12px 14px', fontSize: '9pt', color: '#475569' }}>{maxTotalScore} Marks</td>
                        <td style={{ padding: '12px 14px', fontSize: '11pt', color: '#0284c7' }}>
                          {liveTotalObtained} / {maxTotalScore}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '8pt',
                            fontWeight: 'bold',
                            color: '#0284c7',
                            backgroundColor: '#ffffff',
                            border: '1px solid #bae6fd',
                            padding: '3px 8px',
                            borderRadius: '12px'
                          }}>
                            {((liveTotalObtained / maxTotalScore) * 100).toFixed(1)}% Score
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* FOOTER ACTION BAR */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: '8pt', color: '#64748b' }}>
                  {isApproved ? (
                    <span>This counterfoil has been verified and locked.</span>
                  ) : (
                    <span>Verify all marks carefully before submitting for administrative approval.</span>
                  )}
                </div>

                {!isApproved && (
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '8px 20px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      fontSize: '9pt',
                      fontWeight: 'bold',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      opacity: saving ? 0.6 : 1,
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    {saving ? 'Submitting Counterfoil...' : isPending || isRejected ? 'Resubmit Counterfoil Marks' : 'Submit Counterfoil for Approval'}
                  </button>
                )}
              </div>

            </form>
          </div>
        </>
      )}

    </div>
  );
}
