import React from 'react';
import { ShieldAlert, AlertTriangle, Printer, Upload, Loader2 } from 'lucide-react';
import { API_BASE } from '../config/constants';

/**
 * EirfFormView: Renders the Emergency Incident Report Form (EIRF) for candidate appeal / telemetry dispute.
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

  const handleEirfSubmit = async () => {
    if (!eirfDeclarationChecked) {
      setEirfErrorMessage("You must check the formal integrity declaration agreement box in Section 4 before submitting.");
      return;
    }

    if (!eirfExplanation.trim() || eirfExplanation.trim().length < 20) {
      setEirfErrorMessage("Please provide a detailed explanation statement in Section 4 (at least 20 characters) describing your actions during the timestamps in question.");
      return;
    }

    setSubmittingEirf(true);
    setEirfErrorMessage('');
    setEirfSuccessMessage('');

    try {
      const subId = eirfDetails.submissionId;
      const res = await fetch(`${API_BASE}/test/eirf/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId,
          primaryCause: eirfPrimaryCause,
          detailedExplanation: eirfExplanation,
          formAnswers: {
            section1: {
              ackUnderstand: eirfAckUnderstand,
              warningCount: eirfWarningCount
            },
            section2: {
              tabReason: eirfTabReason,
              fullscreenReason: eirfFullscreenReason
            },
            section3: {
              interruptions: eirfInterruptions,
              peripherals: eirfPeripherals
            },
            section4: {
              explanation: eirfExplanation,
              declarationChecked: eirfDeclarationChecked
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
            peripherals: eirfPeripherals
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
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', padding: '30px 20px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
      <div style={{ maxWidth: '850px', width: '100%', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', padding: '30px' }}>
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
            Official Filing Link
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
              {isExpired ? 'Filing Expired (24h Limit Passed)' : (eirfDetails?.expiresAt ? `${new Date(eirfDetails.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : 'N/A')}
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
              </div>
            </div>
          </div>
        ) : isExpired ? (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '20px', textAlign: 'center', color: '#b91c1c' }}>
            <strong style={{ fontSize: '11pt', display: 'block', marginBottom: '6px' }}>Incident Report Filing Window Expired</strong>
            <p style={{ fontSize: '9pt', margin: 0 }}>The 24-hour deadline for submitting your official Emergency Incident Report Form has passed. Please contact your examination department or course instructor.</p>
          </div>
        ) : (
          /* Active Form Filing */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
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
                        • Please confirm the exact number of warning pop-ups or navigation alerts you remember seeing on your screen during your examination session.
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
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

            {/* SECTION 2: Context Behind Navigation Violations */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 14px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                Section 2: Context Behind Navigation Violations
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                    • Tab Switching / Focus Loss: The system detected that your browser window lost focus or that another tab/application was opened. Please specify exactly what application or browser tab you were attempting to access and why.
                  </label>
                  <textarea
                    rows={3}
                    className="cf-input"
                    style={{ width: '100%', fontSize: '9pt', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    placeholder="Specify application (e.g. Antivirus popup, PDF reader, IDE) and exact reason for focus loss..."
                    value={eirfTabReason}
                    onChange={e => setEirfTabReason(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                    • Full-Screen Exits: You exited full-screen mode multiple times. Was this action intentional? If yes, please describe what you needed to adjust or view outside the testing window.
                  </label>
                  <textarea
                    rows={3}
                    className="cf-input"
                    style={{ width: '100%', fontSize: '9pt', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    placeholder="Describe why full-screen mode was exited (e.g. screen resolution adjustment, OS notification, unintentional Esc key)..."
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
                    • Hardware/OS Interruptions: Did you experience any of the following unexpected technical interruptions during your test? (Select all that apply)
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
                    • Environment Factors: Were you attempting to connect a peripheral device (like a secondary monitor, projector, or external keyboard) during the examination period?
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

            {/* SECTION 4: Integrity Declaration & Final Statement */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 14px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                Section 4: Integrity Declaration &amp; Final Statement
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '12px 16px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '8.5pt', color: '#78350f', cursor: 'pointer', lineHeight: 1.5 }}>
                    <input
                      type="checkbox"
                      checked={eirfDeclarationChecked}
                      onChange={e => setEirfDeclarationChecked(e.target.checked)}
                      style={{ marginTop: '2px' }}
                    />
                    <span>
                      <strong>Formal Declaration:</strong> By submitting this form, I certify that my explanation is truthful and accurate. I understand that this data, along with the screen recordings and webcam logs, will be forwarded to the exam board for a final integrity review.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Upload Encrypted Payload (.eirf) */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '20px' }}>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '0 0 8px 0' }}>
                Attach Encrypted Local Backup (.eirf)
              </h3>
              <p style={{ fontSize: '8.5pt', color: '#64748b', margin: '0 0 14px 0' }}>
                If an encrypted payload file (.eirf) was downloaded to your device when the proctoring auto-submission triggered, please attach it below for in-memory server cross-verification.
              </p>
              <div style={{ border: '2px dashed #cbd5e1', borderRadius: '6px', padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
                <input
                  type="file"
                  accept=".eirf,.json"
                  onChange={handleEirfFileUpload}
                  id="eirf-file-input"
                  style={{ display: 'none' }}
                />
                <label htmlFor="eirf-file-input" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff', padding: '8px 16px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: 'bold', color: '#0284c7' }}>
                  <Upload size={16} /> Choose .eirf File
                </label>
                {eirfFileName && (
                  <div style={{ fontSize: '8.5pt', color: '#059669', fontWeight: 'bold', marginTop: '10px' }}>
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
