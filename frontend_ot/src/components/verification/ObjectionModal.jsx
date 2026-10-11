import React from 'react';
import { Flag, X, CheckCircle, Copy, Check, ExternalLink, Paperclip } from 'lucide-react';
import { getReturnUrl } from '../../config/constants';

export function ObjectionModal({
  objectionModal,
  setObjectionModal,
  handleCloseObjectionModal,
  handleCopyObjectionId,
  handleObjectionFileUpload,
  handleSubmitObjection
}) {
  if (!objectionModal?.isOpen) return null;

  return (
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
        maxWidth: '520px',
        width: '100%',
        padding: '25px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '13pt', color: '#002147', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flag size={18} style={{ color: '#b45309' }} />
            <span>Raise Objection: Question {objectionModal.questionIndex !== null ? objectionModal.questionIndex + 1 : ''}</span>
          </h3>
          <button
            onClick={handleCloseObjectionModal}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        {objectionModal.submittedObjectionId ? (
          /* POST-SUBMISSION SUCCESS VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center', padding: '10px 5px' }}>
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '50%', padding: '12px', display: 'inline-flex' }}>
              <CheckCircle size={32} style={{ color: '#166534' }} />
            </div>

            <div>
              <h4 style={{ fontSize: '12.5pt', color: '#002147', fontWeight: 'bold', margin: '0 0 6px 0' }}>
                Objection Logged Successfully
              </h4>
              <p style={{ fontSize: '9pt', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                Your academic grievance has been recorded for Question #{objectionModal.questionIndex !== null ? objectionModal.questionIndex + 1 : ''}. The evaluation panel will review your submitted rationale.
              </p>
            </div>

            {/* Objection ID Copy Pill */}
            <div style={{
              width: '100%',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{ fontSize: '8pt', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Reference Objection ID
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13pt', fontWeight: 'bold', fontFamily: 'monospace', color: '#002147', letterSpacing: '1px' }}>
                  {objectionModal.submittedObjectionId}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyObjectionId(objectionModal.submittedObjectionId)}
                  title="Copy Objection ID to Clipboard"
                  style={{
                    background: objectionModal.copiedId ? '#dcfce7' : '#ffffff',
                    border: `1px solid ${objectionModal.copiedId ? '#86efac' : '#cbd5e1'}`,
                    borderRadius: '6px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '8.5pt',
                    fontWeight: 'bold',
                    color: objectionModal.copiedId ? '#15803d' : '#334155',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {objectionModal.copiedId ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                  <span>{objectionModal.copiedId ? 'Copied!' : 'Copy ID'}</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '5px' }}>
              <button
                type="button"
                onClick={handleCloseObjectionModal}
                style={{
                  flex: 1,
                  padding: '9px 16px',
                  fontSize: '8.5pt',
                  fontWeight: 'bold',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close Window
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCloseObjectionModal();
                  window.location.href = getReturnUrl('/examination/objections');
                }}
                style={{
                  flex: 1,
                  padding: '9px 16px',
                  fontSize: '8.5pt',
                  fontWeight: 'bold',
                  backgroundColor: '#002147',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>View My Objections</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* OBJECTION FORM VIEW */
          <>
            {objectionModal.error && (
              <div style={{
                color: '#dc2626',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '9pt',
                fontWeight: '500'
              }}>
                {objectionModal.error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Select Objection Category:
                </label>
                <select
                  value={objectionModal.reason}
                  onChange={(e) => setObjectionModal(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                >
                  <option value="Testcase evaluation discrepancy">Testcase evaluation discrepancy / Hidden testcase error</option>
                  <option value="MCQ answer key discrepancy">MCQ answer key discrepancy / Alternate correct option</option>
                  <option value="Partial marks allocation request">Partial marks allocation request</option>
                  <option value="Compiler runtime or format discrepancy">Compiler runtime or output format discrepancy</option>
                  <option value="Other grievance">Other academic grievance</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Detailed Remarks &amp; Explanation:
                </label>
                <textarea
                  rows={4}
                  value={objectionModal.details}
                  onChange={(e) => setObjectionModal(prev => ({ ...prev, details: e.target.value }))}
                  placeholder="Provide clear technical rationale why your answer or logic deserves credit..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Supporting Proof / Documents (Optional):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '8.5pt',
                    color: '#334155',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}>
                    <Paperclip size={14} style={{ color: '#0284c7' }} />
                    <span>{objectionModal.uploadingAttachment ? 'Uploading...' : 'Attach Image / PDF / Doc'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      onChange={handleObjectionFileUpload}
                      disabled={objectionModal.uploadingAttachment}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                {Array.isArray(objectionModal.attachments) && objectionModal.attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {objectionModal.attachments.map((att, aIdx) => (
                      <div 
                        key={aIdx} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          backgroundColor: '#f0fdf4', 
                          border: '1px solid #bbf7d0', 
                          borderRadius: '4px', 
                          padding: '3px 8px', 
                          fontSize: '8pt', 
                          color: '#166534' 
                        }}
                      >
                        <Paperclip size={12} />
                        <span>Attachment #{aIdx + 1}</span>
                        <button 
                          type="button" 
                          onClick={() => setObjectionModal(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== aIdx) }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#991b1b', display: 'inline-flex' }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                className="cf-btn-secondary"
                onClick={handleCloseObjectionModal}
                disabled={objectionModal.submitting}
                style={{ padding: '7px 16px', fontSize: '8.5pt', backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', fontFamily: 'verdana, arial, sans-serif' }}
              >
                Cancel
              </button>
              <button
                className="cf-btn-primary"
                onClick={handleSubmitObjection}
                disabled={objectionModal.submitting}
                style={{ padding: '7px 18px', fontSize: '8.5pt', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #64748b', fontWeight: '600', fontFamily: 'verdana, arial, sans-serif' }}
              >
                {objectionModal.submitting ? 'Submitting...' : 'Submit Grievance'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ObjectionModal;
