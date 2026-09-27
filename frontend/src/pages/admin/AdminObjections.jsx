import React from 'react';
import { Flag, RefreshCw, Loader2, CheckCircle } from 'lucide-react';

export default function AdminObjections({
  fetchAdminObjections,
  adminObjectionsList,
  adminObjectionsFilter,
  setAdminObjectionsFilter,
  adminObjectionModal,
  setAdminObjectionModal,
  handleResolveObjection
}) {
  return (
    <div>
      <div className="cf-card" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '16pt', color: '#002147', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flag size={20} style={{ color: '#b45309' }} /> Examination Question Objections &amp; Grievances
            </h2>
            <div style={{ fontSize: '9pt', color: '#64748b' }}>
              Review candidate grievances per question, inspect submitted source code and choices, update marks awarded, and post committee resolution feedback.
            </div>
          </div>
          <button className="cf-btn-secondary" onClick={fetchAdminObjections} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh List
          </button>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
          {[
            { id: 'all', label: 'All Objections', count: adminObjectionsList.length },
            { id: 'pending', label: 'Pending Review', count: adminObjectionsList.filter(o => o.status === 'pending').length },
            { id: 'resolved', label: 'Resolved', count: adminObjectionsList.filter(o => o.status === 'resolved').length },
            { id: 'rejected', label: 'Rejected', count: adminObjectionsList.filter(o => o.status === 'rejected').length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAdminObjectionsFilter(tab.id)}
              className={`cf-btn-${adminObjectionsFilter === tab.id ? 'primary' : 'secondary'}`}
              style={{
                padding: '6px 14px',
                fontSize: '8.5pt',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                backgroundColor: adminObjectionsFilter === tab.id ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                color: adminObjectionsFilter === tab.id ? '#ffffff' : '#475569',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '7.5pt'
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Objections Data Table */}
        {(() => {
          const filtered = adminObjectionsList.filter(o => {
            if (adminObjectionsFilter === 'all') return true;
            return o.status === adminObjectionsFilter;
          });

          if (filtered.length === 0) {
            return (
              <div className="cf-alert cf-alert-info">
                No question objections found under the <strong>{adminObjectionsFilter.toUpperCase()}</strong> category.
              </div>
            );
          }

          return (
            <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Candidate</th>
                    <th>Exam &amp; Question</th>
                    <th>Grievance Category</th>
                    <th>Student Comments</th>
                    <th>Raised Date</th>
                    <th>Status</th>
                    <th>Resolution / Marks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(filtered) ? filtered : []).map((obj, oIdx) => (
                    <tr key={oIdx}>
                      <td>
                        <div style={{ fontWeight: 'bold', color: '#002147' }}>{obj.candidateName || 'Candidate'}</div>
                        <div style={{ fontSize: '8pt', color: '#64748b' }}>ID: {obj.studentId || 'N/A'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: '#334155' }}>{obj.testTitle}</div>
                        <span style={{ fontSize: '7.5pt', backgroundColor: '#e2e8f0', color: '#1e293b', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          Question #{Number(obj.questionIndex || 0) + 1}
                        </span>
                      </td>
                      <td style={{ fontSize: '8.5pt', color: '#475569' }}>
                        <strong>{obj.reason}</strong>
                      </td>
                      <td style={{ fontSize: '8.5pt', color: '#334155', maxWidth: '240px' }}>
                        <div style={{ maxHeight: '60px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                          {obj.details}
                        </div>
                      </td>
                      <td style={{ fontSize: '8pt', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {obj.raisedAt ? new Date(obj.raisedAt).toLocaleString() : 'N/A'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '7.5pt',
                          fontWeight: 'bold',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: obj.status === 'resolved' ? '#dcfce7' : (obj.status === 'rejected' ? '#fee2e2' : '#fef3c7'),
                          color: obj.status === 'resolved' ? '#15803d' : (obj.status === 'rejected' ? '#b91c1c' : '#b45309'),
                          border: `1px solid ${obj.status === 'resolved' ? '#86efac' : (obj.status === 'rejected' ? '#fca5a5' : '#fcd34d')}`,
                          display: 'inline-block',
                          textTransform: 'uppercase'
                        }}>
                          {obj.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '8.5pt' }}>
                        {obj.status === 'resolved' ? (
                          <div>
                            <strong style={{ color: '#15803d' }}>Revised: {obj.resolvedMarks ?? 'N/A'} pts</strong>
                            {obj.adminRemarks && <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>{obj.adminRemarks}</div>}
                          </div>
                        ) : obj.status === 'rejected' ? (
                          <div>
                            <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>No Marks Awarded</span>
                            {obj.adminRemarks && <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>{obj.adminRemarks}</div>}
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>Pending Evaluation</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="cf-btn-primary"
                          onClick={() => {
                            setAdminObjectionModal({
                              isOpen: true,
                              objection: obj,
                              status: obj.status === 'pending' ? 'resolved' : obj.status,
                              revisedMarks: obj.resolvedMarks !== undefined ? obj.resolvedMarks : (obj.submittedAnswer?.score || 0),
                              adminRemarks: obj.adminRemarks || '',
                              submitting: false,
                              error: '',
                              success: ''
                            });
                          }}
                          style={{ padding: '4px 10px', fontSize: '8pt', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                        >
                          {obj.status === 'pending' ? 'Review & Resolve' : 'Edit Resolution'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Objection Resolution Modal */}
      {adminObjectionModal.isOpen && adminObjectionModal.objection && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          zIndex: 10000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            maxWidth: '650px',
            width: '100%',
            padding: '25px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '13pt', color: '#002147', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flag size={18} style={{ color: '#b45309' }} />
                <span>Review Objection: Question #{Number(adminObjectionModal.objection.questionIndex || 0) + 1}</span>
              </h3>
              <button
                onClick={() => setAdminObjectionModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '12pt', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            {adminObjectionModal.error && (
              <div className="cf-alert cf-alert-danger" style={{ fontSize: '8.5pt' }}>
                {adminObjectionModal.error}
              </div>
            )}

            {adminObjectionModal.success && (
              <div className="cf-alert cf-alert-success" style={{ fontSize: '8.5pt' }}>
                {adminObjectionModal.success}
              </div>
            )}

            {/* Candidate Grievance Summary Box */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '9pt' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <div><strong>Candidate:</strong> {adminObjectionModal.objection.candidateName} ({adminObjectionModal.objection.studentId})</div>
                <div><strong>Exam:</strong> {adminObjectionModal.objection.testTitle}</div>
              </div>
              <div>
                <strong>Grievance Category:</strong> {adminObjectionModal.objection.reason}
              </div>
              <div>
                <strong>Candidate Explanation:</strong>
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', marginTop: '4px', whiteSpace: 'pre-wrap', color: '#1e293b' }}>
                  {adminObjectionModal.objection.details}
                </div>
              </div>
            </div>

            {/* Candidate Submitted Response Preview */}
            {adminObjectionModal.objection.submittedAnswer && (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#ffffff' }}>
                <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Candidate Submitted Response:
                </div>
                {adminObjectionModal.objection.submittedAnswer.submittedCode ? (
                  <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '10px', borderRadius: '4px', maxHeight: '160px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {adminObjectionModal.objection.submittedAnswer.submittedCode}
                  </pre>
                ) : adminObjectionModal.objection.submittedAnswer.selectedOptionIndex !== undefined ? (
                  <div style={{ fontSize: '9pt', color: '#0f172a' }}>
                    Selected Option: <strong>Option {String.fromCharCode(65 + Number(adminObjectionModal.objection.submittedAnswer.selectedOptionIndex))}</strong>
                  </div>
                ) : (
                  <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                    Current Scored Points: <strong>{adminObjectionModal.objection.submittedAnswer.score ?? 0} pts</strong>
                  </div>
                )}
              </div>
            )}

            {/* Resolution Form */}
            <form onSubmit={handleResolveObjection} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Resolution Decision: *
                  </label>
                  <select
                    value={adminObjectionModal.status}
                    onChange={e => setAdminObjectionModal(prev => ({ ...prev, status: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                  >
                    <option value="resolved">Resolved (Award / Update Credit)</option>
                    <option value="rejected">Rejected (Deny Grievance)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Revised Question Marks:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={adminObjectionModal.revisedMarks}
                    onChange={e => setAdminObjectionModal(prev => ({ ...prev, revisedMarks: Number(e.target.value || 0) }))}
                    disabled={adminObjectionModal.status === 'rejected'}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Committee Resolution Remarks / Technical Feedback: *
                </label>
                <textarea
                  rows="3"
                  required
                  value={adminObjectionModal.adminRemarks}
                  onChange={e => setAdminObjectionModal(prev => ({ ...prev, adminRemarks: e.target.value }))}
                  placeholder="State why the objection was accepted/rejected and any evaluation notes..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="cf-btn-secondary"
                  onClick={() => setAdminObjectionModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={adminObjectionModal.submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cf-btn-primary"
                  disabled={adminObjectionModal.submitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  {adminObjectionModal.submitting ? <Loader2 className="spinner" size={14} /> : <CheckCircle size={14} />}
                  <span>{adminObjectionModal.submitting ? 'Saving...' : 'Save Resolution'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
