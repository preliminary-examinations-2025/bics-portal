import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Printer, Upload, Loader2, CheckCircle2, FileText, ExternalLink, X } from 'lucide-react';
import { API_BASE } from '../config/constants';

/**
 * EirfFormView: Renders the Emergency Incident Report Form (EIRF) for candidate appeal / telemetry dispute.
 * Phase 2: Supports dynamic LLM-generated inquiry questions (~8 questions: Text, Radio, Checkbox, Proof Upload)
 * with backward compatibility for legacy static sections.
 */
export const EirfFormView = ({
  eirfDetails,
  eirfFileName,
  setEirfFileName,
  eirfFileContent,
  setEirfFileContent,
  eirfDeclarationChecked,
  setEirfDeclarationChecked,
  eirfExplanation,
  setEirfExplanation,
  eirfPrimaryCause,
  eirfAckUnderstand,
  setEirfAckUnderstand,
  eirfWarningCount,
  setEirfWarningCount,
  eirfTabReason,
  setEirfTabReason,
  eirfFullscreenReason,
  setEirfFullscreenReason,
  eirfInterruptions,
  setEirfInterruptions,
  eirfPeripherals,
  setEirfPeripherals,
  submittingEirf,
  setSubmittingEirf,
  eirfErrorMessage,
  setEirfErrorMessage,
  eirfSuccessMessage,
  setEirfSuccessMessage,
  isSubmitBtnHovered,
  setIsSubmitBtnHovered,
  loadEirfDetails
}) => {
  const isExpired = eirfDetails?.isExpired;
  const existingReport = eirfDetails?.existingReport;
  const generatedQuestions = Array.isArray(eirfDetails?.generatedQuestions) ? eirfDetails.generatedQuestions : [];
  const hasDynamicQuestions = generatedQuestions.length > 0;

  // State for dynamic answers keyed by questionId
  const [dynamicAnswers, setDynamicAnswers] = useState({});
  const [uploadingProofFor, setUploadingProofFor] = useState(null);

  // Initialize dynamic answers from existing report if available
  useEffect(() => {
    if (existingReport?.formAnswers && typeof existingReport.formAnswers === 'object') {
      setDynamicAnswers(existingReport.formAnswers);
    }
  }, [existingReport]);

  const handleEirfFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEirfFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setEirfFileContent(event.target.result);
    };
    reader.readAsText(file);
  };

  // Upload proof image/screenshot to server / Cloudinary
  const handleProofUpload = async (questionId, file) => {
    if (!file) return;
    setUploadingProofFor(questionId);
    setEirfErrorMessage('');

    try {
      const token = eirfDetails?.token || new URLSearchParams(window.location.search).get('token') || '';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('submissionId', eirfDetails?.submissionId || 'temp');
      if (token) {
        formData.append('token', token);
      }

      const headers = {};
      if (token) {
        headers['x-eirf-token'] = token;
      }

      const res = await fetch(`${API_BASE}/test/eirf/upload-proof`, {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload proof document.');
      }

      setDynamicAnswers(prev => ({
        ...prev,
        [questionId]: {
          uploaded: true,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType
        }
      }));
    } catch (uploadErr) {
      console.error('Proof upload error:', uploadErr);
      setEirfErrorMessage(`Upload failed: ${uploadErr.message}`);
    } finally {
      setUploadingProofFor(null);
    }
  };

  const removeProofUpload = (questionId) => {
    setDynamicAnswers(prev => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleDynamicCheckboxToggle = (qId, optionText) => {
    setDynamicAnswers(prev => {
      const currentList = Array.isArray(prev[qId]) ? prev[qId] : [];
      let updated;
      if (optionText.toLowerCase().includes('none of the above')) {
        updated = currentList.includes(optionText) ? [] : [optionText];
      } else {
        const withoutNone = currentList.filter(o => !o.toLowerCase().includes('none of the above'));
        updated = withoutNone.includes(optionText)
          ? withoutNone.filter(o => o !== optionText)
          : [...withoutNone, optionText];
      }
      return { ...prev, [qId]: updated };
    });
  };

  const handleEirfSubmit = async () => {
    if (!eirfDeclarationChecked) {
      setEirfErrorMessage("You must check the formal integrity declaration agreement box before submitting.");
      return;
    }

    // Dynamic questionnaire validations
    if (hasDynamicQuestions) {
      for (const q of generatedQuestions) {
        const val = dynamicAnswers[q.questionId];
        const isReq = q.isRequired !== false;

        if (q.questionType === 'TEXT' && isReq) {
          if (!val || typeof val !== 'string' || val.trim().length < 15) {
            setEirfErrorMessage(`Please provide a comprehensive response (at least 15 characters) for Question ${q.questionId}: "${q.questionText.slice(0, 50)}...".`);
            return;
          }
        } else if (q.questionType === 'RADIO' && isReq) {
          if (!val || typeof val !== 'string' || !val.trim()) {
            setEirfErrorMessage(`Please select an option for Question ${q.questionId}: "${q.questionText.slice(0, 50)}...".`);
            return;
          }
        } else if (q.questionType === 'CHECKBOX' && isReq) {
          if (!val || !Array.isArray(val) || val.length === 0) {
            setEirfErrorMessage(`Please select at least one option for Question ${q.questionId}: "${q.questionText.slice(0, 50)}...".`);
            return;
          }
        } else if (q.questionType === 'FILE_UPLOAD' && isReq) {
          if (!val || !val.uploaded) {
            setEirfErrorMessage(`Verification proof document is mandatory for Question ${q.questionId}. Please attach a supporting screenshot or photo.`);
            return;
          }
        }
      }
    } else {
      // Legacy static fallback validation
      if (!eirfExplanation.trim() || eirfExplanation.trim().length < 20) {
        setEirfErrorMessage("Please provide a detailed explanation statement in Section 4 (at least 20 characters) describing your actions during the timestamps in question.");
        return;
      }
    }

    setSubmittingEirf(true);
    setEirfErrorMessage('');
    setEirfSuccessMessage('');

    try {
      const subId = eirfDetails.submissionId;

      // Extract primary cause & explanation for database indexing
      let resolvedPrimaryCause = eirfPrimaryCause || 'Technical Interruption';
      let resolvedExplanation = eirfExplanation || '';

      if (hasDynamicQuestions) {
        const radioQ = generatedQuestions.find(q => q.questionType === 'RADIO');
        if (radioQ && dynamicAnswers[radioQ.questionId]) {
          resolvedPrimaryCause = dynamicAnswers[radioQ.questionId];
        }
        const textQ = generatedQuestions.find(q => q.questionType === 'TEXT');
        if (textQ && dynamicAnswers[textQ.questionId]) {
          resolvedExplanation = dynamicAnswers[textQ.questionId];
        }
      }

      const token = eirfDetails?.token || new URLSearchParams(window.location.search).get('token') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['x-eirf-token'] = token;
      }

      const res = await fetch(`${API_BASE}/test/eirf/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submissionId: subId,
          token,
          primaryCause: resolvedPrimaryCause,
          detailedExplanation: resolvedExplanation,
          formAnswers: {
            ...dynamicAnswers,
            declarationChecked: eirfDeclarationChecked,
            legacySections: {
              section1: { ackUnderstand: eirfAckUnderstand, warningCount: eirfWarningCount },
              section2: { tabReason: eirfTabReason, fullscreenReason: eirfFullscreenReason },
              section3: { interruptions: eirfInterruptions, peripherals: eirfPeripherals }
            }
          },
          technicalContext: {
            ip: 'Client Local Session',
            browser: typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '',
            platform: typeof navigator !== 'undefined' ? (navigator.userAgentData?.platform || navigator.platform || 'Desktop') : 'Desktop',
            os: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Windows') ? 'Windows 10/11 x64' : (navigator.userAgent.includes('Mac') ? 'macOS' : 'Linux')) : 'Unknown OS',
            screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '1920x1080',
            viewportSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '1920x1080',
            hardwareConcurrency: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
            openedApp: eirfTabReason
          },
          additionalAnswers: {
            ackUnderstand: eirfAckUnderstand,
            warningCount: eirfWarningCount,
            tabReason: eirfTabReason,
            fullscreenReason: eirfFullscreenReason,
            interruptions: eirfInterruptions,
            peripherals: eirfPeripherals,
            dynamicAnswers
          },
          encryptedPayload: eirfFileContent || undefined,
          encryptedPayloadFile: eirfFileContent || undefined,
          payloadFileName: eirfFileName || 'local_backup.eirf'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setEirfErrorMessage(data.error || "Failed to submit EIRF report.");
        setSubmittingEirf(false);
        return;
      }

      setEirfSuccessMessage(`EIRF Incident Report filed successfully! Report Ref: ${data.reportId}. Your report is pending committee review.`);
      if (loadEirfDetails) loadEirfDetails(subId);
    } catch (err) {
      console.error("EIRF Submit error:", err);
      setEirfErrorMessage("Network error while submitting report. Please try again.");
    } finally {
      setSubmittingEirf(false);
    }
  };

  return (
    <div
      className="eirf-view-container"
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        padding: '36px 20px 80px 20px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        overflowY: 'auto',
        overflowX: 'hidden',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      <div style={{ maxWidth: '850px', width: '100%', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', padding: '32px 36px', marginBottom: '60px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert size={32} style={{ color: '#0284c7' }} />
            <div>
              <h2 style={{ fontSize: '16pt', fontWeight: 'bold', color: '#002147', margin: 0 }}>Emergency Incident Report Form (EIRF)</h2>
              <span style={{ fontSize: '9pt', color: '#64748b' }}>BICS Examination Integrity &amp; Proctoring Telemetry Verification</span>
            </div>
          </div>
          <span style={{ fontSize: '8.5pt', backgroundColor: '#f0f9ff', color: '#0284c7', padding: '4px 10px', borderRadius: '4px', border: '1px solid #bae6fd', fontWeight: 'bold' }}>
            Official Filing Terminal
          </span>
        </div>

        {/* Submission Info Bar */}
        <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '25px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', fontSize: '9pt' }}>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '8pt' }}>Candidate Name</span>
            <strong style={{ color: '#334155' }}>{eirfDetails?.candidateName}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '8pt' }}>Student ID</span>
            <strong style={{ color: '#334155' }}>{eirfDetails?.studentId}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '8pt' }}>Examination</span>
            <strong style={{ color: '#334155' }}>{eirfDetails?.testTitle}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '8pt' }}>Filing Window Expiry</span>
            <strong style={{ color: isExpired ? '#dc2626' : '#d97706' }}>
              {isExpired ? 'Filing Expired (45-Minute Window Passed)' : (eirfDetails?.expiresAt ? `${new Date(eirfDetails.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'N/A')}
            </strong>
          </div>
        </div>

        {/* Telemetry Alert Summary */}
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '15px 20px', marginBottom: '25px' }}>
          <h4 style={{ fontSize: '10pt', fontWeight: 'bold', color: '#b45309', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} /> Recorded Telemetry Incident Flags
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '9pt', color: '#78350f', lineHeight: 1.6 }}>
            {(eirfDetails?.flaggedReasons || []).map((reason, rIdx) => (
              <li key={rIdx}>{reason}</li>
            ))}
          </ul>
        </div>

        {/* Success Banner */}
        {eirfSuccessMessage && (
          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '15px', borderRadius: '6px', marginBottom: '20px', fontSize: '9.5pt', fontWeight: 'bold' }}>
            {eirfSuccessMessage}
          </div>
        )}

        {/* Error Banner */}
        {eirfErrorMessage && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '15px', borderRadius: '6px', marginBottom: '20px', fontSize: '9.5pt' }}>
            {eirfErrorMessage}
          </div>
        )}

        {/* If Already Submitted */}
        {existingReport ? (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '20px' }}>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                .eirf-print-area, .eirf-print-area * { visibility: visible; }
                .eirf-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
                .no-print { display: none !important; }
              }
            `}</style>
            <div className="eirf-print-area">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                <strong style={{ fontSize: '11pt', color: '#002147' }}>Filed Incident Report Ref: {existingReport.reportId}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="no-print"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#f0f9ff',
                      color: '#0284c7',
                      border: '1px solid #bae6fd',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    <Printer size={14} /> Print Confirmation (PDF)
                  </button>
                  <span style={{
                    fontSize: '8.5pt',
                    fontWeight: 'bold',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    backgroundColor: existingReport.status === 'approved' ? '#ecfdf5' : (existingReport.status === 'rejected' ? '#fef2f2' : '#fffbeb'),
                    color: existingReport.status === 'approved' ? '#047857' : (existingReport.status === 'rejected' ? '#b91c1c' : '#b45309'),
                    border: `1px solid ${existingReport.status === 'approved' ? '#a7f3d0' : (existingReport.status === 'rejected' ? '#fecaca' : '#fde68a')}`
                  }}>
                    Status: {(existingReport.status || 'pending_review').toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '9pt', color: '#334155', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 6px 0' }}><strong>Primary Cause:</strong> {existingReport.primaryCause}</p>
                <p style={{ margin: '0 0 6px 0' }}>
                  <strong>Filed At:</strong> {(() => {
                    const dVal = existingReport.filedAt || existingReport.submittedAt || existingReport.createdAt;
                    return dVal ? `${new Date(dVal).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'N/A';
                  })()}
                </p>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                  <strong>Candidate Written Explanation:</strong>
                  <p style={{ margin: '4px 0 0 0', color: '#475569' }}>{existingReport.detailedExplanation}</p>
                </div>

                {/* Render Submitted Dynamic Question Answers */}
                {existingReport.formAnswers && Object.keys(existingReport.formAnswers).length > 0 && (
                  <div style={{ marginTop: '15px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                    <h5 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', margin: '0 0 10px 0' }}>
                      Detailed Questionnaire Responses:
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {Object.entries(existingReport.formAnswers).map(([k, val]) => {
                        if (k === 'declarationChecked' || k === 'legacySections') return null;
                        const matchedQ = generatedQuestions.find(q => q.questionId === k);
                        const label = matchedQ ? `${k}: ${matchedQ.questionText}` : `Question ${k}`;
                        return (
                          <div key={k} style={{ backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '8.5pt' }}>
                            <strong style={{ color: '#0284c7' }}>{label}</strong>
                            <div style={{ marginTop: '4px', color: '#334155' }}>
                              {typeof val === 'object' && val?.uploaded ? (
                                <a href={val.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0284c7', textDecoration: 'underline' }}>
                                  <FileText size={14} /> View Attached Evidence ({val.fileName}) <ExternalLink size={12} />
                                </a>
                              ) : Array.isArray(val) ? (
                                val.join(', ')
                              ) : (
                                String(val)
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : isExpired ? (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '20px', textAlign: 'center', color: '#b91c1c' }}>
            <strong style={{ fontSize: '11pt', display: 'block', marginBottom: '6px' }}>Incident Report Filing Window Expired</strong>
            <p style={{ fontSize: '9pt', margin: 0 }}>The 45-minute deadline for submitting your official Emergency Incident Report Form has passed. Please contact your examination department or course instructor.</p>
          </div>
        ) : (
          /* Active Form Filing */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

            {/* DYNAMIC QUESTIONNAIRE (Phase 2 LLM Questions) */}
            {hasDynamicQuestions ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ borderBottom: '2px solid #e0f2fe', paddingBottom: '10px' }}>
                  <h3 style={{ fontSize: '12pt', fontWeight: 'bold', color: '#002147', margin: '0 0 4px 0' }}>
                    Incident Investigation Questionnaire ({generatedQuestions.length} Questions)
                  </h3>
                  <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
                    Please answer the following targeted inquiries regarding the security flags recorded on your test session.
                  </span>
                </div>

                {generatedQuestions.map((q, idx) => {
                  const qId = q.questionId || `Q${idx + 1}`;
                  const currentVal = dynamicAnswers[qId];
                  const isUploading = uploadingProofFor === qId;

                  let typeLabel = 'Text Response';
                  if (q.questionType === 'RADIO') typeLabel = 'Single Choice';
                  if (q.questionType === 'CHECKBOX') typeLabel = 'Multiple Selection';
                  if (q.questionType === 'FILE_UPLOAD') typeLabel = 'Evidence Verification';

                  return (
                    <div
                      key={qId}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      {/* Question Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            backgroundColor: '#002147',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '8pt',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            {qId}
                          </span>
                          <span style={{
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                            fontSize: '8pt',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 'bold'
                          }}>
                            {typeLabel}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '8pt',
                          fontWeight: 'bold',
                          color: q.isRequired !== false ? '#b45309' : '#64748b',
                          backgroundColor: q.isRequired !== false ? '#fffbeb' : '#f8fafc',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: `1px solid ${q.isRequired !== false ? '#fde68a' : '#e2e8f0'}`
                        }}>
                          {q.isRequired !== false ? '• Required' : 'Optional'}
                        </span>
                      </div>

                      {/* Question Text */}
                      <label style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#1e293b', display: 'block', marginBottom: '8px', lineHeight: 1.5 }}>
                        {q.questionText}
                      </label>

                      {/* Context / Telemetry Clue */}
                      {q.context && (
                        <div style={{ fontSize: '8pt', color: '#64748b', fontStyle: 'italic', marginBottom: '12px', backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '4px', borderLeft: '3px solid #0284c7' }}>
                          Telemetry Note: {q.context}
                        </div>
                      )}

                      {/* MODALITY 1: TEXT */}
                      {q.questionType === 'TEXT' && (
                        <div>
                          <textarea
                            rows={4}
                            className="cf-input"
                            style={{
                              width: '100%',
                              fontSize: '9pt',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              boxSizing: 'border-box'
                            }}
                            placeholder={q.placeholder || 'Provide your detailed explanation here...'}
                            value={typeof currentVal === 'string' ? currentVal : ''}
                            onChange={e => setDynamicAnswers(prev => ({ ...prev, [qId]: e.target.value }))}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '8pt', color: '#64748b' }}>
                            <span>Minimum 15 characters required.</span>
                            <span>{(typeof currentVal === 'string' ? currentVal.length : 0)} characters</span>
                          </div>
                        </div>
                      )}

                      {/* MODALITY 2: RADIO */}
                      {q.questionType === 'RADIO' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(q.options || []).map((opt, optIdx) => {
                            const isSelected = currentVal === opt;
                            return (
                              <label
                                key={optIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '10px 14px',
                                  borderRadius: '6px',
                                  border: `1px solid ${isSelected ? '#0284c7' : '#e2e8f0'}`,
                                  backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                                  cursor: 'pointer',
                                  fontSize: '9pt',
                                  color: isSelected ? '#002147' : '#334155',
                                  fontWeight: isSelected ? 'bold' : 'normal',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`radio_${qId}`}
                                  value={opt}
                                  checked={isSelected}
                                  onChange={() => setDynamicAnswers(prev => ({ ...prev, [qId]: opt }))}
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* MODALITY 3: CHECKBOX */}
                      {q.questionType === 'CHECKBOX' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                          {(q.options || []).map((opt, optIdx) => {
                            const list = Array.isArray(currentVal) ? currentVal : [];
                            const isChecked = list.includes(opt);
                            return (
                              <label
                                key={optIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '9px 12px',
                                  borderRadius: '6px',
                                  border: `1px solid ${isChecked ? '#0284c7' : '#e2e8f0'}`,
                                  backgroundColor: isChecked ? '#f0f9ff' : '#f8fafc',
                                  cursor: 'pointer',
                                  fontSize: '8.5pt',
                                  color: isChecked ? '#002147' : '#334155',
                                  fontWeight: isChecked ? 'bold' : 'normal',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleDynamicCheckboxToggle(qId, opt)}
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* MODALITY 4: FILE_UPLOAD (Proof) */}
                      {q.questionType === 'FILE_UPLOAD' && (
                        <div>
                          {q.proofGuidance && (
                            <p style={{ fontSize: '8.5pt', color: '#64748b', margin: '0 0 10px 0' }}>
                              {q.proofGuidance}
                            </p>
                          )}

                          {currentVal && currentVal.uploaded ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              borderRadius: '6px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <CheckCircle2 size={20} style={{ color: '#059669' }} />
                                <div>
                                  <strong style={{ fontSize: '9pt', color: '#065f46', display: 'block' }}>
                                    {currentVal.fileName}
                                  </strong>
                                  <span style={{ fontSize: '8pt', color: '#047857' }}>
                                    Uploaded successfully ({Math.round((currentVal.fileSize || 0) / 1024)} KB)
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeProofUpload(qId)}
                                style={{
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '8pt',
                                  fontWeight: 'bold'
                                }}
                              >
                                <X size={14} /> Remove
                              </button>
                            </div>
                          ) : (
                            <div style={{
                              border: '2px dashed #cbd5e1',
                              borderRadius: '6px',
                              padding: '24px 16px',
                              textAlign: 'center',
                              backgroundColor: '#f8fafc'
                            }}>
                              <input
                                type="file"
                                id={`file_input_${qId}`}
                                accept="image/png,image/jpeg,image/jpg,.pdf"
                                style={{ display: 'none' }}
                                disabled={isUploading}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) handleProofUpload(qId, f);
                                }}
                              />
                              <label
                                htmlFor={`file_input_${qId}`}
                                style={{
                                  cursor: isUploading ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  backgroundColor: '#ffffff',
                                  padding: '8px 18px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '9pt',
                                  fontWeight: 'bold',
                                  color: '#0284c7'
                                }}
                              >
                                {isUploading ? (
                                  <>
                                    <Loader2 className="cf-spinner" size={16} /> Uploading Verification Document...
                                  </>
                                ) : (
                                  <>
                                    <Upload size={16} /> Select Screenshot / Image / PDF
                                  </>
                                )}
                              </label>
                              <span style={{ display: 'block', fontSize: '8pt', color: '#64748b', marginTop: '8px' }}>
                                Accepted formats: JPG, PNG, PDF (Max 5MB)
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            ) : (
              /* LEGACY STATIC SECTIONS (Fallback if dynamic questions not generated) */
              <>
                {/* SECTION 1: Incident Acknowledgment */}
                {(() => {
                  const isAutoSub = (eirfDetails?.flaggedReasons || []).some(r => r.toLowerCase().includes('auto-submitted'));
                  const warningOptions = isAutoSub
                    ? ['0 warnings', '1 warning', '2 warnings', '3 warnings (Auto-Submitted)', 'More than 3 warnings']
                    : ['0 warnings', '1 warning', '2 warnings', '3 or more warnings', 'Did not notice warnings'];

                  return (
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
                      <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 14px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                        Section 1: Incident Acknowledgment &amp; Confirmation
                      </h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                            {isAutoSub
                              ? '• Your test attempt was automatically submitted because you reached the maximum allowed navigation warnings. Do you understand why this action was taken?'
                              : '• An automated proctoring alert or navigation interruption was flagged during your examination. Do you understand why this incident was recorded?'}
                          </label>
                          <div style={{ display: 'flex', gap: '15px' }}>
                            {['Yes', 'No'].map(val => (
                              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9pt', cursor: 'pointer', color: '#334155' }}>
                                <input
                                  type="radio"
                                  name="eirfAckUnderstand"
                                  value={val}
                                  checked={eirfAckUnderstand === val}
                                  onChange={e => setEirfAckUnderstand(e.target.value)}
                                />
                                {val}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                            • Prior to the test termination, approximately how many security/proctoring warnings were displayed on your screen?
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                            {warningOptions.map(opt => (
                              <label key={opt} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 10px',
                                borderRadius: '4px',
                                border: `1px solid ${eirfWarningCount === opt ? '#0284c7' : '#cbd5e1'}`,
                                backgroundColor: eirfWarningCount === opt ? '#f0f9ff' : '#ffffff',
                                cursor: 'pointer',
                                fontSize: '8.5pt',
                                color: eirfWarningCount === opt ? '#0284c7' : '#334155',
                                fontWeight: eirfWarningCount === opt ? 'bold' : 'normal'
                              }}>
                                <input
                                  type="radio"
                                  name="eirfWarningCount"
                                  value={opt}
                                  checked={eirfWarningCount === opt}
                                  onChange={e => setEirfWarningCount(e.target.value)}
                                />
                                {opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* SECTION 2: Technical Environment */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
                  <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 14px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    Section 2: Technical Environment &amp; Browser Behavior
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                        • Window Focus: What application or browser tab were you switching to, or what caused the test screen to lose focus?
                      </label>
                      <input
                        type="text"
                        className="cf-input"
                        style={{ width: '100%', fontSize: '9pt', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                        placeholder="e.g. Accidental trackpad swipe, antivirus pop-up, background Slack notification..."
                        value={eirfTabReason}
                        onChange={e => setEirfTabReason(e.target.value)}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                        • Fullscreen Exit: What caused your browser to exit full-screen mode during the exam?
                      </label>
                      <input
                        type="text"
                        className="cf-input"
                        style={{ width: '100%', fontSize: '9pt', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                        placeholder="e.g. Pressed Escape accidentally, system notification forced window minimize..."
                        value={eirfFullscreenReason}
                        onChange={e => setEirfFullscreenReason(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Technical Malfunction Triage */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
                  <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 14px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    Section 3: Technical Malfunction Triage
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '8px' }}>
                        • Hardware/OS Interruptions: Did you experience any unexpected technical interruptions? (Select all that apply)
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                        {[
                          'System notifications / pop-ups (e.g. antivirus, OS updates)',
                          'Accidental keystrokes (e.g. Alt+Tab, Windows key)',
                          'External monitor disconnection',
                          'Browser crash',
                          'Mouse tracking issues',
                          'None of the above'
                        ].map(item => (
                          <label key={item} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '4px',
                            border: `1px solid ${eirfInterruptions.includes(item) ? '#0284c7' : '#e2e8f0'}`,
                            backgroundColor: eirfInterruptions.includes(item) ? '#f0f9ff' : '#f8fafc',
                            cursor: 'pointer',
                            fontSize: '8.5pt',
                            color: '#334155'
                          }}>
                            <input
                              type="checkbox"
                              checked={eirfInterruptions.includes(item)}
                              onChange={() => {
                                if (item === 'None of the above') {
                                  setEirfInterruptions(['None of the above']);
                                } else {
                                  setEirfInterruptions(prev => {
                                    const filtered = prev.filter(i => i !== 'None of the above');
                                    return filtered.includes(item) ? filtered.filter(i => i !== item) : [...filtered, item];
                                  });
                                }
                              }}
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '8px' }}>
                        • Environment Factors: Were you attempting to connect a peripheral device during the exam?
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                        {[
                          'No, no peripherals were connected',
                          'Yes, secondary monitor',
                          'Yes, external keyboard / mouse',
                          'Yes, projector or external display',
                          'Other device'
                        ].map(pOpt => (
                          <label key={pOpt} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 10px',
                            borderRadius: '4px',
                            border: `1px solid ${eirfPeripherals === pOpt ? '#0284c7' : '#cbd5e1'}`,
                            backgroundColor: eirfPeripherals === pOpt ? '#f0f9ff' : '#ffffff',
                            cursor: 'pointer',
                            fontSize: '8.5pt',
                            color: eirfPeripherals === pOpt ? '#0284c7' : '#334155',
                            fontWeight: eirfPeripherals === pOpt ? 'bold' : 'normal'
                          }}>
                            <input
                              type="radio"
                              name="eirfPeripherals"
                              value={pOpt}
                              checked={eirfPeripherals === pOpt}
                              onChange={e => setEirfPeripherals(e.target.value)}
                            />
                            {pOpt}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Open Defense Explanation */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
                  <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 14px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    Section 4: Open Defense Explanation
                  </h3>
                  <div>
                    <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                      • Open Defense Explanation: If you believe these flags were triggered erroneously, please provide a detailed explanation of your actions during the timestamps in question. (Required, min 20 characters)
                    </label>
                    <textarea
                      rows={4}
                      className="cf-input"
                      style={{ width: '100%', fontSize: '9pt', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      placeholder="Provide your complete defense statement and details regarding your testing environment during the session..."
                      value={eirfExplanation}
                      onChange={e => setEirfExplanation(e.target.value)}
                    />
                    <span style={{ fontSize: '8pt', color: '#64748b' }}>Minimum 20 characters required.</span>
                  </div>
                </div>
              </>
            )}

            {/* FORMAL INTEGRITY DECLARATION (Mandatory for both Dynamic and Legacy) */}
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '16px 20px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '9pt', color: '#78350f', cursor: 'pointer', lineHeight: 1.6 }}>
                <input
                  type="checkbox"
                  checked={eirfDeclarationChecked}
                  onChange={e => setEirfDeclarationChecked(e.target.checked)}
                  style={{ marginTop: '3px', width: '16px', height: '16px' }}
                />
                <span>
                  <strong>Formal Academic Integrity Certification:</strong> By submitting this report, I hereby certify on my honor that the explanation and technical statements provided above are completely truthful, accurate, and unmanipulated. I understand that false claims will result in immediate disqualification and disciplinary action by the Academic Examination Committee.
                </span>
              </label>
            </div>

            {/* Attach Encrypted Local Backup (.eirf) - Optional / Deprecated */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
              <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#002147', margin: '0 0 6px 0' }}>
                Attach Encrypted Local Backup (.eirf) <span style={{ fontSize: '8.5pt', fontWeight: 'normal', color: '#64748b' }}>(Optional / Diagnostic)</span>
              </h3>
              <p style={{ fontSize: '8.5pt', color: '#64748b', margin: '0 0 12px 0' }}>
                Your exam answers are automatically preserved in secure client storage and synchronized to the server upon reconnection. If an encrypted payload file (.eirf) was saved to your device, you may attach it below for cross-verification; otherwise, leave this section blank.
              </p>
              <div style={{ border: '2px dashed #cbd5e1', borderRadius: '6px', padding: '16px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
                <input
                  type="file"
                  accept=".eirf,.json"
                  onChange={handleEirfFileUpload}
                  id="eirf-file-input"
                  style={{ display: 'none' }}
                />
                <label htmlFor="eirf-file-input" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff', padding: '7px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', fontWeight: 'bold', color: '#0284c7' }}>
                  <Upload size={14} /> Choose .eirf File
                </label>
                {eirfFileName && (
                  <div style={{ fontSize: '8.5pt', color: '#059669', fontWeight: 'bold', marginTop: '8px' }}>
                    Selected File: {eirfFileName} ({eirfFileContent?.length || 0} bytes loaded)
                  </div>
                )}
              </div>
            </div>

            {/* Submit Action Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px' }}>
              <button
                type="button"
                disabled={submittingEirf}
                onClick={handleEirfSubmit}
                onMouseEnter={() => setIsSubmitBtnHovered(true)}
                onMouseLeave={() => setIsSubmitBtnHovered(false)}
                style={{
                  backgroundColor: submittingEirf ? '#94a3b8' : (isSubmitBtnHovered ? '#38bdf8' : '#0284c7'),
                  borderColor: submittingEirf ? '#94a3b8' : (isSubmitBtnHovered ? '#38bdf8' : '#0284c7'),
                  color: '#ffffff',
                  padding: '12px 28px',
                  borderRadius: '6px',
                  fontSize: '10pt',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: submittingEirf ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSubmitBtnHovered && !submittingEirf ? '0 4px 12px rgba(56, 189, 248, 0.4)' : 'none'
                }}
              >
                {submittingEirf ? (
                  <>
                    <Loader2 className="cf-spinner" size={18} /> Submitting Incident Report...
                  </>
                ) : (
                  'Submit Emergency Incident Report'
                )}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
