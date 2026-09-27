import React from 'react';
import { RefreshCw, Printer, ExternalLink, Loader2 } from 'lucide-react';

export default function SubmissionsView({
  submissionsLoading,
  ledgerQrData,
  fetchStudentSubmissions,
  studentProfile,
  user,
  activeSubmissionTab,
  setActiveSubmissionTab,
  studentSubmissions,
  setContactSubject,
  setContactMessage,
  setContactSuccess,
  setContactError,
  setContactSubView,
  setView
}) {
  return (
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
                fetchStudentSubmissions(studentProfile?.studentId || user?.studentId || user?.username);
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
      {submissionsLoading && (!studentSubmissions || studentSubmissions.length === 0) ? (
        <div className="cf-card" style={{ padding: '50px 20px', textAlign: 'center', margin: '20px 0' }}>
          <Loader2 className="spinner" size={32} style={{ color: '#3b5998', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', margin: '0 0 6px 0' }}>
            Synchronizing Classroom Submissions
          </h3>
          <p style={{ fontSize: '9pt', color: '#64748b', margin: 0 }}>
            Fetching real-time submission records from Google Classroom ledger...
          </p>
        </div>
      ) : (() => {
        const filteredList = studentSubmissions.filter(sub => {
          if (activeSubmissionTab === 'all') return true;
          return sub.type === activeSubmissionTab;
        });

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
          <div key="loaded-content" className="cf-smooth-fade">
            <style>{`
              @keyframes cfFadeIn {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .cf-smooth-fade {
                animation: cfFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>
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
          </div>
        );
      })()}
    </div>
  );
}
