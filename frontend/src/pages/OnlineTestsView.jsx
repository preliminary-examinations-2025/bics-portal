import React from 'react';
import { ClipboardList, Calendar, CheckCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react';

export default function OnlineTestsView({
  systemConfig,
  activeStudentTests,
  currentTime,
  enteringTestId,
  handleStartExam
}) {
  return (
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
      ) : (!Array.isArray(activeStudentTests) || activeStudentTests.length === 0) ? (
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
          {(Array.isArray(activeStudentTests) ? activeStudentTests : []).map((test, idx) => {
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
  );
}
