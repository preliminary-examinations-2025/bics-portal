import React from 'react';
import { BookOpen, CheckCircle, Lock, ShieldAlert, ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { getAuthToken } from '../api/client';

export default function SubmissionsVerificationView({
  view,
  submittedTestsList,
  submittedTestsLoading = false,
  submittedTestsError = '',
  onRetrySubmittedTests
}) {
  return (
    <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="cf-card-title">
        <BookOpen size={16} style={{ color: '#3b5998' }} />
        <span>Evaluated Answer Sheet Verification</span>
        {typeof onRetrySubmittedTests === 'function' && (
          <button
            type="button"
            className="cf-btn-secondary"
            onClick={onRetrySubmittedTests}
            disabled={submittedTestsLoading}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '8pt', padding: '3px 10px' }}
          >
            <RefreshCw size={12} className={submittedTestsLoading ? 'spin-smooth' : ''} />
            <span>{submittedTestsLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        )}
      </div>

      <p style={{ fontSize: '9.5pt', color: '#475569', margin: 0, lineHeight: 1.5 }}>
        Official evaluated examination answer sheets, score distributions, and answer keys are accessible here. You can click <strong>Verify Evaluated Paper</strong> to review your complete evaluated submission in the dedicated Online Test Review Terminal.
      </p>

      {submittedTestsError && (!Array.isArray(submittedTestsList) || submittedTestsList.length === 0) ? (
        <div className="cf-alert cf-alert-error" style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <AlertTriangle size={16} />
            <span>Unable to Load Submitted Answer Sheets</span>
          </div>
          <p style={{ margin: 0, fontSize: '9.5pt', lineHeight: '1.5' }}>{submittedTestsError}</p>
          {typeof onRetrySubmittedTests === 'function' && (
            <button type="button" className="cf-btn-primary" onClick={onRetrySubmittedTests} disabled={submittedTestsLoading}>
              {submittedTestsLoading ? 'Retrying...' : 'Retry Connection'}
            </button>
          )}
        </div>
      ) : submittedTestsLoading && (!Array.isArray(submittedTestsList) || submittedTestsList.length === 0) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 8px', color: '#475569', fontSize: '9.5pt' }}>
          <Loader2 size={18} className="spinner" style={{ color: '#3b5998' }} />
          <span>Loading evaluated answer sheet verification records...</span>
        </div>
      ) : (!Array.isArray(submittedTestsList) || submittedTestsList.length === 0) ? (
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
            const isAnnulled = sub.verificationStatus === 'annulled' || sub.eirfStatus === 'rejected';
            let totalScored = 0;
            if (!isAnnulled) {
              const resolvedObjections = (sub.objections || []).filter(o =>
                (o.status === 'resolved' || o.status === 'resolved_accepted') &&
                o.resolvedMarks !== undefined && o.resolvedMarks !== null
              );
              const matchedObjIndices = new Set();
              if (resolvedObjections.length > 0 && Array.isArray(sub.answers) && sub.answers.length > 0) {
                totalScored = sub.answers.reduce((sum, a, idx) => {
                  const resObjIdx = resolvedObjections.findIndex(o =>
                    o.questionIndex === idx || (o.questionId && String(o.questionId) === String(a.questionId))
                  );
                  if (resObjIdx !== -1) matchedObjIndices.add(resObjIdx);
                  const resObj = resObjIdx !== -1 ? resolvedObjections[resObjIdx] : null;
                  const aScore = resObj
                    ? Number(resObj.resolvedMarks)
                    : (a.isManuallyGraded
                        ? Number(a.score || 0)
                        : ((a.aiEvaluation?.isEvaluated === true || a.aiEvaluation?.status === 'completed') && a.aiEvaluation?.score !== undefined
                            ? Number(a.aiEvaluation.score)
                            : Number(a.score || 0)));
                  return sum + aScore;
                }, 0);
                // Include resolved objections on unanswered questions not present in sub.answers
                resolvedObjections.forEach((ro, rIdx) => {
                  if (!matchedObjIndices.has(rIdx)) {
                    totalScored += Number(ro.resolvedMarks || 0);
                  }
                });
              } else if (sub.evaluation?.totalScore !== undefined && sub.evaluation?.totalScore !== null) {
                totalScored = Number(sub.evaluation.totalScore);
              } else if (sub.totalScore !== undefined && sub.totalScore !== null) {
                totalScored = Number(sub.totalScore);
              } else if (sub.score !== undefined && sub.score !== null) {
                totalScored = Number(sub.score);
              } else if (sub.answers && Array.isArray(sub.answers) && sub.answers.length > 0) {
                totalScored = sub.answers.reduce((sum, a) => {
                  const pts = ((a.aiEvaluation?.isEvaluated === true || a.aiEvaluation?.status === 'completed') && a.aiEvaluation?.score !== undefined)
                    ? Number(a.aiEvaluation.score)
                    : Number(a.score || 0);
                  return sum + pts;
                }, 0);
              } else {
                totalScored = Number(sub.evaluation?.mcqScore || 0) + Number(sub.evaluation?.codingScore || 0) + Number(sub.evaluation?.webScore || 0);
              }
              if (totalMax > 0) {
                totalScored = Math.min(totalScored, totalMax);
              }
            }
            const percentage = totalMax > 0 ? Math.round((totalScored / totalMax) * 100) : 0;
            const objectionsCount = (sub.objections || []).length;

            const otBase = window.location.origin.includes('localhost')
              ? 'http://localhost:5174/assessment'
              : `${window.location.origin}/assessment`;

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
                      Submitted on: {new Date(sub.submittedAt || sub.startedAt || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
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
                        onClick={() => {
                          const userToken = getAuthToken() || '';
                          const authParam = userToken ? `?authToken=${encodeURIComponent(userToken)}` : '';
                          const subId = sub.bicsId || sub.id || sub._id;
                          window.location.href = `${otBase}/evaluation/answer-sheet/${subId}${authParam}`;
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 18px',
                          fontSize: '9pt',
                          fontWeight: 'bold'
                        }}
                      >
                        <ExternalLink size={15} /> Inspect Evaluated Paper →
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
