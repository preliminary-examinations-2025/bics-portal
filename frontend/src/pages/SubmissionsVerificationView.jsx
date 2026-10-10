import React from 'react';
import { BookOpen, CheckCircle, Lock, ShieldAlert, Flag, ExternalLink } from 'lucide-react';

export default function SubmissionsVerificationView({ view, submittedTestsList }) {
  return (
    <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BookOpen size={18} style={{ color: '#3b5998' }} />
        <span>Evaluated Answer Sheet Verification</span>
      </div>

      <p style={{ fontSize: '9.5pt', color: '#475569', margin: 0, lineHeight: 1.5 }}>
        Official evaluated examination answer sheets, score distributions, and answer keys are accessible here. You can click <strong>Verify Evaluated Paper</strong> to review your complete evaluated submission in the dedicated Online Test Review Terminal.
      </p>

      {(!Array.isArray(submittedTestsList) || submittedTestsList.length === 0) ? (
        <div className="cf-alert cf-alert-info">
          No submitted tests found for verification view.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(() => {
            const list = Array.isArray(submittedTestsList) ? [...submittedTestsList] : [];
            const getTime = (st) => {
              const sub = st?.submission || {};
              const dateVal = sub.submittedAt || sub.createdAt || sub.startedAt || st?.startDate || st?.endDate;
              if (dateVal) {
                const t = new Date(dateVal).getTime();
                if (!isNaN(t) && t > 0) return t;
              }
              const idStr = String(sub.id || sub._id || st?.id || st?._id || '');
              if (idStr.length === 24) {
                const timestamp = parseInt(idStr.substring(0, 8), 16) * 1000;
                if (!isNaN(timestamp) && timestamp > 0) return timestamp;
              }
              return 0;
            };
            list.sort((a, b) => getTime(b) - getTime(a));
            return list;
          })().map((st, sIdx) => {
            const sub = st.submission || {};
            const vStatus = st.verificationStatus || (st.answersReleased ? 'released' : 'not_released');
            const isReleased = (vStatus === 'released' || vStatus === 'closed');
            const totalMax = Number(st.marks || 0);
            let totalScored = 0;
            if (sub.answers && Array.isArray(sub.answers) && sub.answers.length > 0) {
              totalScored = sub.answers.reduce((sum, a, idx) => {
                const resObj = (sub.objections || []).find(o => 
                  (o.status === 'resolved' || o.status === 'resolved_accepted') &&
                  (o.questionIndex === idx || (o.questionId && String(o.questionId) === String(a.questionId)))
                );
                const aScore = (resObj && resObj.resolvedMarks !== undefined && resObj.resolvedMarks !== null) 
                  ? Number(resObj.resolvedMarks) 
                  : Number(a.score || 0);
                return sum + aScore;
              }, 0);
            } else if (sub.totalScore !== undefined && sub.totalScore !== null) {
              totalScored = Number(sub.totalScore);
            } else if (sub.evaluation?.totalScore !== undefined && sub.evaluation?.totalScore !== null) {
              totalScored = Number(sub.evaluation.totalScore);
            } else if (sub.score !== undefined && sub.score !== null) {
              totalScored = Number(sub.score);
            } else {
              totalScored = Number(sub.evaluation?.mcqScore || 0) + Number(sub.evaluation?.codingScore || 0);
            }
            if (totalMax > 0) {
              totalScored = Math.min(totalScored, totalMax);
            }
            const percentage = totalMax > 0 ? Math.round((totalScored / totalMax) * 100) : 0;
            const objectionsCount = (sub.objections || []).length;

            const otBase = window.location.origin.includes('localhost')
              ? 'http://localhost:5174/terminal'
              : `${window.location.origin}/terminal`;

            return (
              <div
                key={sIdx}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: `1px solid ${isReleased ? '#cbd5e1' : '#e2e8f0'}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '12pt', color: '#002147', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                      {st.title}
                    </h3>
                    <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                      Submitted on: {new Date(sub.submittedAt || sub.startedAt || Date.now()).toLocaleString()}
                    </div>
                  </div>

                  {/* Status Pill */}
                  <div>
                    {vStatus === 'released' ? (
                      <span style={{
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        border: '1px solid #86efac',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '8.5pt',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <CheckCircle size={14} /> Verification Active &amp; Open
                      </span>
                    ) : vStatus === 'closed' ? (
                      <span style={{
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '8.5pt',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Lock size={14} /> Verification Window Closed
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: '#fef3c7',
                        color: '#b45309',
                        border: '1px solid #fcd34d',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '8.5pt',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <ShieldAlert size={14} /> Evaluation Pending Release
                      </span>
                    )}
                  </div>
                </div>

                {/* Scores & Details Row */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '15px'
                }}>
                  <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', fontSize: '9pt' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Total Score: </span>
                      <strong style={{ color: (vStatus === 'released' || vStatus === 'closed') ? '#002147' : '#94a3b8' }}>
                        {(vStatus === 'released' || vStatus === 'closed') ? `${totalScored} / ${totalMax} Marks (${percentage}%)` : `-- / ${totalMax} Marks`}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: '#64748b' }}>Submission Mode: </span>
                      <strong style={{ textTransform: 'capitalize' }}>{sub.status || 'Submitted'}</strong>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div style={{ marginLeft: 'auto' }}>
                    {vStatus === 'released' ? (
                      <button
                        className="cf-btn-primary"
                        onClick={() => { window.location.href = `${otBase}/verification/${sub.id || sub._id}`; }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 18px',
                          fontSize: '9pt',
                          fontWeight: 'bold'
                        }}
                      >
                        <ExternalLink size={15} /> Verify Evaluated Paper →
                      </button>
                    ) : vStatus === 'closed' ? (
                      <button
                        className="cf-btn-secondary"
                        disabled
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          fontSize: '9pt',
                          opacity: 0.7,
                          cursor: 'not-allowed',
                          color: '#475569',
                          backgroundColor: '#f1f5f9',
                          borderColor: '#cbd5e1'
                        }}
                      >
                        <Lock size={14} /> Verification Window Closed
                      </button>
                    ) : (
                      <button
                        className="cf-btn-secondary"
                        disabled
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          fontSize: '9pt',
                          opacity: 0.6,
                          cursor: 'not-allowed'
                        }}
                      >
                        <Lock size={14} /> Answer Sheets Locked
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
