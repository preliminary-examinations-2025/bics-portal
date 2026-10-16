import React, { useState, useRef, useEffect } from 'react';
import { FileText, ArrowRight } from 'lucide-react';
import { getReturnUrl } from '../config/constants';
import { TestSetupStepProgress } from '../components/common/TestSetupStepProgress';
import { RichText } from '../components/common/RichText';

export function TermsConditionsView({
  test,
  candidate,
  consentRulesChecked,
  setConsentRulesChecked,
  consentProctoringChecked,
  setConsentProctoringChecked,
  onProceedToSystemChecks
}) {
  const [agreed, setAgreed] = useState(consentRulesChecked && consentProctoringChecked);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(agreed);
  const contentBoxRef = useRef(null);

  const handleCheckboxChange = (e) => {
    if (!hasScrolledToBottom) return;
    const isChecked = e.target.checked;
    setAgreed(isChecked);
    setConsentRulesChecked(isChecked);
    setConsentProctoringChecked(isChecked);
  };

  const handleScroll = (e) => {
    if (hasScrolledToBottom) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight <= 25) {
      setHasScrolledToBottom(true);
    }
  };

  useEffect(() => {
    const el = contentBoxRef.current;
    if (!el) return;
    const checkScrollable = () => {
      if (el.scrollHeight <= el.clientHeight + 25) {
        setHasScrolledToBottom(true);
      }
    };
    checkScrollable();
    window.addEventListener('resize', checkScrollable);
    return () => window.removeEventListener('resize', checkScrollable);
  }, []);

  const termsMarkdown = `**I understand that by agreeing to take this test or interview, I will be required to give my consent to the following:**

1. **Personal Information Disclosure:** I agree to share any personal information that may be required by the platform on behalf of the Company* (BICS - Basic Introductory Computer Science, conducting Preliminary Examinations 2026) including, but not limited to, the following: first name, last name, e-mail ID, permanent residential address, education qualifications, work experience, age, cookies, browsing and usage data, and any other data that may be required.

2. **Platform Liability Disclaimer:** I understand that the platform does not take any responsibility and is not liable for any damage because of errors, omissions, negligence, or any inaccuracies in the examination platform.

3. **Automated Proctoring & Sensory Consent (BICS Code of Conduct Clause 2):** Pursuant to **BICS Code of Conduct Clause 2**, I grant my explicit consent to continuous automated vision and audio proctoring. If it is applicable to this test/interview, I agree to grant access to my webcam and microphone. In that case, I give my explicit consent to take snapshots, record video, record audio, sample voice patterns, measure ambient noise levels, and capture keystrokes. I also understand and agree that when a snapshot is taken or audio is recorded, the associated background telemetry data will also be saved automatically for forensic integrity audit and final evaluation.

4. **Data Confidentiality & Review Usage:** I understand and agree that all data that is collected on behalf of the Company (BICS - Basic Introductory Computer Science) will only be used internally for reviews. This information will not be shared with a third party unless required by a court of law, law enforcement agency, or statutory authority. However, it may be stored on other data-processing platforms like Applicant Tracking Systems or Human Resource Management Systems that the Company uses.

5. **Academic Integrity Undertaking (BICS Code of Conduct Clause 4):** I hereby affirm that all code, answers, and files submitted by me are my own and do not belong to any third party. I will take this examination independently without using unauthorized tabs, external materials, communication devices, or third-party assistance. I undertake that during the test I shall neither copy nor solicit a third party to write the test on my behalf. I acknowledge that any violation, tab switch, or abnormal window movement will be penalized under BICS Code of Conduct Clause 4, including score annulment, disciplinary hearing, and academic debarment.

6. **Legal Age & Consent:** I affirm and agree that I am of the legal age, as per the applicable law, to consent to the terms of this test/interview. Otherwise, I agree to get my parent's/guardian's approval or guidance before continuing.

7. **Data Retention Policy:** I understand that all the data submitted by me will remain with the Company (stored on secure BICS platform servers) until the Company explicitly deletes the data.

8. **Data Subject Rights & Rectification:** I understand that I have authority over my personal data and I agree that in case of any discrepancies, I will contact the Test Administrator** (the person organizing the test on behalf of the Company) or the Interview Administrator*** (the person scheduling the interview on behalf of the Company) about updating my data. Subject to applicable laws (such as GDPR), you may have the right to update your personal data by contacting the Test Administrator or the Interview Administrator.

9. **Revocation Procedure:** I understand that if I want to revoke consent or request that my data not be processed, I will write to the Test Administrator or the Interview Administrator. Subject to applicable laws (such as GDPR), you may be able to withdraw your consent or object to the processing of your personal data by contacting the Test Administrator or the Interview Administrator.

10. **Adherence to Instructions:** I undertake and agree to read and accept any further instructions that may be given during the test.

11. **Acceptance of Regulations:** I have read and accepted the Terms and Conditions, Privacy Policy, and BICS Code of Conduct regulations.`;

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Main Outerbox Container (Exact Codeforces / BICS Card) */}
      <div className="cf-card" style={{ maxWidth: '1020px', width: '100%', margin: '0 auto', padding: '15px' }}>
        
        {/* Card Title Bar: Clean view name only */}
        <div className="cf-card-title">
          <FileText size={16} style={{ color: '#3b5998' }} />
          <span>Terms and conditions</span>
        </div>

        {/* 4-Step Test Setup Progress Bar */}
        <TestSetupStepProgress currentStep={1} />

        {/* Scrollable Terms & Conditions Document Box parsed via RichText with Justified Text */}
        <div 
          ref={contentBoxRef}
          onScroll={handleScroll}
          className="tnc-content-box"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--cf-border)',
            borderRadius: '4px',
            padding: '16px 20px',
            maxHeight: '440px',
            overflowY: 'auto',
            fontSize: '11px',
            color: '#334155',
            lineHeight: '1.85',
            marginBottom: '16px'
          }}
        >
          <RichText text={termsMarkdown} />

          {/* Footnotes Block */}
          <div style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid #e2e8f0',
            fontSize: '7.8pt',
            color: '#64748b',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            lineHeight: '1.7',
            textAlign: 'justify',
            textAlignLast: 'left'
          }}>
            <div>* The name of the Company / Organization conducting this examination is <strong>BICS - Basic Introductory Computer Science</strong> for <strong>Preliminary Examinations 2026</strong>.</div>
            <div>** The name and contact details of the Test Administrator: <strong>BICS Examination &amp; Evaluation Directorate</strong> (exam-control@bics.edu / Preliminary Examinations 2026 Board).</div>
            <div>*** The name and contact details of the Interview Administrator: <strong>BICS Academic Assessment Committee</strong>.</div>
          </div>
        </div>

        {/* Single Simple Checkbox (Disabled until scrolled to bottom) */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '16px',
          opacity: hasScrolledToBottom ? 1 : 0.65,
          transition: 'opacity 0.2s ease'
        }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed', 
            fontSize: '8.5pt', 
            color: hasScrolledToBottom ? '#1e293b' : '#64748b', 
            fontWeight: '500' 
          }}>
            <input
              type="checkbox"
              checked={agreed}
              disabled={!hasScrolledToBottom}
              onChange={handleCheckboxChange}
              style={{ 
                width: '16px', 
                height: '16px', 
                cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed', 
                accentColor: '#2563eb' 
              }}
            />
            <span>I have read and agree to the Terms and Conditions and BICS Code of Conduct</span>
          </label>
          {!hasScrolledToBottom && (
            <div style={{ fontSize: '7.5pt', color: '#94a3b8', marginTop: '4px', marginLeft: '26px' }}>
              Please scroll down to the end of the terms and conditions above to enable acceptance.
            </div>
          )}
        </div>

        {/* Footer Action Bar: Decline and Accept buttons */}
        <div style={{
          borderTop: '1px solid var(--cf-border)',
          margin: '0 -15px -15px -15px',
          padding: '12px 15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          borderBottomLeftRadius: '3px',
          borderBottomRightRadius: '3px'
        }}>
          <button 
            className="cf-btn-secondary" 
            style={{ padding: '6px 20px', fontSize: '8.5pt' }} 
            onClick={() => {
              window.location.href = getReturnUrl('/coursework/online-tests');
            }}
          >
            Decline
          </button>

          <button 
            className="cf-btn-primary" 
            disabled={!agreed} 
            style={{ 
              padding: '6px 24px', 
              fontSize: '8.5pt', 
              fontWeight: 'bold',
              cursor: agreed ? 'pointer' : 'not-allowed',
              opacity: agreed ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }} 
            onClick={onProceedToSystemChecks}
          >
            <span>Accept</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  );
}

export default TermsConditionsView;
