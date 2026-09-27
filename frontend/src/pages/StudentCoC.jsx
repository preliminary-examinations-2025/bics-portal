import React from 'react';

export default function StudentCoC() {
  return (
    <div className="cf-card">
      <div className="cf-card-title">BICS Course Code of Conduct</div>
      <p style={{ fontSize: '9.5pt', color: '#555', marginBottom: '20px', lineHeight: '1.6' }}>
        All candidates enrolled in the Basic Introductory Computer Science (BICS) Course under the Preliminary Examinations 2026 academic cycle are strictly required to adhere to the following code of academic and professional conduct. By accessing the BICS portal, you consent to these parameters:
      </p>
      
      <div className="cf-form-section">Section 1: Academic Integrity &amp; Originality</div>
      <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
        <li>Candidates must submit only their own independent work for all assignments, practical projects, and exam papers.</li>
        <li>Any form of plagiarism, copying, sharing source code, or copying solutions from peers is strictly prohibited and will result in immediate cancellation of eligibility.</li>
        <li>Use of automated AI coding generators or copying pre-written code without proper citation is strictly forbidden and monitored.</li>
        <li>Sharing login credentials or letting third parties access your BICS portal is a critical violation of student conduct.</li>
      </ul>

      <div className="cf-form-section">⏳ Section 2: Engagement &amp; Timelines</div>
      <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
        <li>Candidates are expected to watch all video lecture modules and read the associated textbook chapters in the sequence provided.</li>
        <li>Assignments must be submitted before the deadlines specified. Requests for extensions require valid medical documentation and admin approval.</li>
        <li>Failure to engage with BICS portal course materials for more than 14 consecutive days without justification may result in account suspension.</li>
        <li>All course registrations, feedback surveys, and exit forms must be completed honestly within active time windows.</li>
      </ul>

      <div className="cf-form-section">Section 3: Professional Communication</div>
      <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
        <li>All interactions on the BICS portal (including course feedback and contact enquiries) must remain constructive, professional, and respectful.</li>
        <li>Harassment, vulgar language, or inappropriate content submission will lead to immediate account suspension and a report to the discipline board.</li>
        <li>Public posting of solutions, leaks, or defamatory comments is strictly forbidden.</li>
      </ul>

      <div className="cf-form-section">Section 4: Examination Ethics &amp; Declaration</div>
      <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
        <li>Downloading the official Hall Ticket requires completing the Malpractice Consent form, certifying compliance with exam rules.</li>
        <li>Any candidate found using unauthorized resources, devices, or communication during the exam will face legal and academic penalties under the Preliminary Examinations 2026 Charter.</li>
        <li>Impersonation or falsifying identification documents during examination validation is classified as a critical offense.</li>
      </ul>

      <div className="cf-form-section">Section 5: Academic Misconduct Procedures</div>
      <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
        <li>Upon reporting a potential breach of code, the administrator will review portal log footprints, uploaded signatures, and source codes.</li>
        <li>A formal warning or suspension notice will be issued. Candidates have 5 working days to present a defense.</li>
        <li>The decision of the Preliminary Examinations 2026 Academic Integrity Board is final and binding for all candidates.</li>
      </ul>

      <div className="cf-form-section">Section 6: User Representation &amp; Documentation</div>
      <ul style={{ paddingLeft: '20px', marginBottom: '20px', fontSize: '9pt', lineHeight: '1.8', color: '#444' }}>
        <li>All profile uploads (photographs, signature scripts, and signed undertakings) must represent the true legal identity of the candidate.</li>
        <li>Providing false, outdated, or dummy details during registration will trigger an automatic eligibility block.</li>
        <li>Uploaded documents are processed in-memory directly to Cloudinary and remain confidential under data privacy guidelines.</li>
      </ul>
    </div>
  );
}
