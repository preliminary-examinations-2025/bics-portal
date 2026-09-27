import React from 'react';
import { ShieldAlert, FileText, Upload, CheckCircle, Download } from 'lucide-react';
import LedgerUploadForm from '../components/LedgerUploadForm';
import { API_BASE } from '../config';

export default function HallTicketView({
  studentProfile,
  systemConfig,
  consentSuccess,
  consentChecked,
  setConsentChecked,
  handleSignConsent,
  setView,
  fetchStudentProfile,
  user,
  fetchStudentSubmissions,
  verificationSuccess,
  verificationError,
  verificationCodeSent,
  sendingVerificationCode,
  handleSendVerificationCode,
  handleVerifyCode,
  verificationEmailCode,
  setVerificationEmailCode,
  verifyingCode
}) {
  return (
    <div className="cf-card">
      <div className="cf-card-title" style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '12px', marginBottom: '20px' }}>
        Official Hall Ticket Dispatch ({systemConfig.examType === 'midsem' ? 'Mid' : 'End'} Semester)
      </div>
      
      {!systemConfig.hallTicketDownloadActive ? (
        <div className="cf-alert cf-alert-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} />
          <div>
            <strong>Hall Ticket Notice:</strong><br />
            Hall Ticket download is currently disabled by the administrator.
          </div>
        </div>
      ) : !studentProfile.eligible ? (
        <div className="cf-alert cf-alert-error" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} />
          <div>
            <strong>Exam Eligibility Notice:</strong><br />
            You are not eligible to take this examination. Please contact the administrator.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* STEP 1: MALPRACTICE CONSENT */}
          {((systemConfig.examType === 'midsem' && !studentProfile.midSemConsentSigned) || (systemConfig.examType === 'endsem' && !studentProfile.endSemConsentSigned)) ? (
            <div className="cf-card" style={{ padding: '20px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', margin: '0' }}>
              <h4 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <ShieldAlert size={18} style={{ color: '#b91c1c' }} />
                Step 1: Malpractice & Proctoring Consent Declaration
              </h4>
              {consentSuccess && <div className="cf-alert cf-alert-success">{consentSuccess}</div>}
              <p style={{ fontSize: '9.5pt', lineHeight: '1.6', color: '#334155', margin: '0 0 15px 0' }}>
                I hereby solemnly declare and promise that I will refrain from any kind of malpractice, cheating, copying, plagiarism, or unauthorized resource usage during the BICS Course Examination 2026. I understand that any violation of this code of conduct will lead to immediate disqualification and cancellation of my candidacy.
              </p>
              <div style={{ marginBottom: '15px' }}>
                <label className="checkbox-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '9.5pt' }}>
                  <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} />
                  I accept and agree to the declaration statement.
                </label>
              </div>
              <button className="cf-btn-primary" disabled={!consentChecked} onClick={handleSignConsent}>
                Confirm & Sign Consent
              </button>
            </div>
          ) : ((systemConfig.examType === 'midsem' && (!studentProfile.midSemFeedback || Object.keys(studentProfile.midSemFeedback).length === 0)) || (systemConfig.examType === 'endsem' && (!studentProfile.endSemFeedback || Object.keys(studentProfile.endSemFeedback).length === 0))) ? (
            
            /* STEP 2: COURSE FEEDBACK SURVEY */
            <div className="cf-alert cf-alert-warning" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px', border: '1px solid #d97706', margin: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FileText size={28} style={{ color: '#d97706' }} />
                <div>
                  <strong style={{ fontSize: '11pt', color: '#b45309' }}>Step 2: Course Feedback Survey Required</strong><br />
                  <span style={{ fontSize: '9.5pt', color: '#475569' }}>
                    You must complete and submit your {systemConfig.examType === 'midsem' ? 'Mid-Semester' : 'End-Semester'} Course Feedback Questionnaire to unlock the Hall Ticket download.
                  </span>
                </div>
              </div>
              <button className="cf-btn-primary" style={{ alignSelf: 'flex-start', marginTop: '8px' }} onClick={() => setView(systemConfig.examType === 'midsem' ? 'midsem' : 'endsem')}>
                Go to Feedback Form &rarr;
              </button>
            </div>
          ) : ((systemConfig.examType === 'midsem' && !studentProfile.midSemLedgerUrl) || (systemConfig.examType === 'endsem' && !studentProfile.endSemLedgerUrl)) ? (
            
            /* STEP 3: SIGNED COURSEWORK LEDGER */
            <div className="cf-card" style={{ padding: '25px', border: '1px solid #cbd5e1', backgroundColor: '#fff', margin: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                <Upload size={28} style={{ color: '#002147', flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '11pt', color: '#002147' }}>Step 3: Upload Scanned Signed Coursework Ledger</strong><br />
                  <span style={{ fontSize: '9.5pt', color: '#475569' }}>
                    Print your coursework submissions ledger, obtain your course instructor's physical signature, and upload a digital copy below to unlock the download.
                  </span>
                </div>
              </div>
              <LedgerUploadForm type={systemConfig.examType === 'midsem' ? 'mid' : 'end'} studentProfile={studentProfile} fetchStudentProfile={fetchStudentProfile} user={user} fetchStudentSubmissions={fetchStudentSubmissions} setView={setView} />
            </div>
          ) : ((systemConfig.examType === 'midsem' && !studentProfile.midSemEmailVerified) || (systemConfig.examType === 'endsem' && !studentProfile.endSemEmailVerified)) ? (
            
            /* STEP 4: EMAIL CODE VERIFICATION */
            <div className="cf-card" style={{ padding: '25px', border: '1px solid #3b5998', backgroundColor: '#f8fafc', margin: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                <ShieldAlert size={28} style={{ color: '#3b5998', flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '11pt', color: '#002147' }}>Step 4: Secure Email Verification</strong><br />
                  <span style={{ fontSize: '9.5pt', color: '#475569' }}>
                    We must verify your identity. Send a 6-digit secure code to your registered email (<strong>{studentProfile.registrationData?.personalEmail || studentProfile.personalEmail}</strong>) and verify it below.
                  </span>
                </div>
              </div>

              {verificationSuccess && <div className="cf-alert cf-alert-success" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{verificationSuccess}</div>}
              {verificationError && <div className="cf-alert cf-alert-error" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{verificationError}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '350px' }}>
                {!verificationCodeSent ? (
                  <button 
                    type="button" 
                    className="cf-btn-primary" 
                    disabled={sendingVerificationCode}
                    onClick={handleSendVerificationCode}
                    style={{ padding: '8px 16px', fontSize: '9.5pt', fontWeight: 'bold' }}
                  >
                    {sendingVerificationCode ? "Sending Code..." : "Send Verification Code"}
                  </button>
                ) : (
                  <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="cf-input-group">
                      <label className="cf-label" style={{ fontWeight: 'bold' }}>Enter 6-Digit Code</label>
                      <input 
                        type="text" 
                        className="cf-input" 
                        maxLength={6} 
                        placeholder="e.g. 123456" 
                        required 
                        value={verificationEmailCode} 
                        onChange={e => setVerificationEmailCode(e.target.value.replace(/\D/g, ''))}
                        style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '12pt', fontWeight: 'bold' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        type="submit" 
                        className="cf-btn-primary" 
                        disabled={verifyingCode} 
                        style={{ flex: '2', padding: '8px', fontWeight: 'bold' }}
                      >
                        Verify & Unlock
                      </button>
                      <button 
                        type="button" 
                        className="cf-btn-secondary" 
                        disabled={sendingVerificationCode} 
                        onClick={handleSendVerificationCode}
                        style={{ flex: '1', padding: '8px', fontSize: '8.5pt' }}
                      >
                        Resend
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            
            /* STEP 5: SUCCESS & DOWNLOAD TICKET */
            <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px solid #16a34a', backgroundColor: '#f0fdf4', borderRadius: '6px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px auto' }}>
                <CheckCircle size={36} style={{ color: '#16a34a' }} />
              </div>
              <h3 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#14532d', marginBottom: '10px' }}>
                All Verification Prerequisites Completed!
              </h3>
              <p style={{ fontSize: '10pt', color: '#166534', maxWidth: '500px', margin: '0 auto 25px auto', lineHeight: '1.6' }}>
                Your identity, malpractice undertaking, coursework submissions, and feedback surveys have been verified. Click the button below to retrieve your official dynamic A4 PDF Examination Hall Ticket.
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                <button 
                  className="cf-btn-primary" 
                  onClick={() => window.open(`${API_BASE}/candidate/generate-hallticket/${studentProfile.id || studentProfile._id}?type=${systemConfig.examType === 'midsem' ? 'mid' : 'end'}&t=${Date.now()}`, '_blank')}
                  style={{ padding: '12px 24px', fontSize: '10.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Download size={18} /> Download Official Hall Ticket (PDF)
                </button>
                <button 
                  className="cf-btn-secondary" 
                  onClick={() => setView('announcements')}
                  style={{ padding: '12px 24px', fontSize: '10.5pt', fontWeight: 'bold' }}
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
