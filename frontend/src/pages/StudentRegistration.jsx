import React from 'react';
import { AlertTriangle, User, Home, Phone, Mail, BookOpen, Upload } from 'lucide-react';

const COURSES_LIST = [
  "R526CS01T - Introduction to Computer Science",
  "R526CS02T - Programming Fundamentals with C++",
  "R526CS03T - Basics of Web Development",
  "R526CS04T - Mathematical Thinking",
  "R526CS02L - Programming Fundamentals with C++ Lab",
  "R526CS03L - Basics of Web Development Lab"
];

export default function StudentRegistration({
  studentProfile,
  systemConfig,
  regError,
  regSuccess,
  regForm,
  setRegForm,
  handleStudentRegistrationSubmit,
  handlePhotoChange,
  handleSigChange,
  handleUndertakingChange
}) {
  if (!studentProfile || !systemConfig) return null;

  return (
    <div>
      {studentProfile.registrationSubmitted ? (
        <div className="cf-card">
          <div className="cf-card-title">Registration Status</div>
          {studentProfile.registrationStatus === 'Approved' ? (
            <div className="cf-alert cf-alert-success">
              Your course registration has been verified and APPROVED by the administrator. Your profile is active.
            </div>
          ) : (
            <div className="cf-alert cf-alert-info">
              Your course registration has been submitted and locked successfully. It is currently PENDING verification by the administrator.
            </div>
          )}
        </div>
      ) : !systemConfig.courseRegistrationActive ? (
        <div className="cf-card">
          <div className="cf-card-title">Registration Status</div>
          <div className="cf-alert cf-alert-info">
            Course Registration is currently closed by the administrator.
          </div>
        </div>
      ) : (
        <div className="cf-card">
          <div className="cf-card-title">Course Registration Form</div>
          {studentProfile.registrationStatus === 'Rejected' && (
            <div className="cf-alert cf-alert-error" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} style={{ color: '#dc2626' }} />
                <strong>Registration Rejected:</strong>
              </div>
              <div style={{ marginTop: '4px' }}>
                Your previous registration attempt was rejected by the administrator. Please review your entries and files and re-submit.
              </div>
            </div>
          )}
          {regError && <div className="cf-alert cf-alert-error">{regError}</div>}
          {regSuccess && <div className="cf-alert cf-alert-success">{regSuccess}</div>}

          <form onSubmit={handleStudentRegistrationSubmit}>
            
            <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} />
              <span>1. Core Personal Information</span>
            </div>
            <div className="cf-form-grid">
              <div className="cf-input-group">
                <label className="cf-label">Full Legal Name</label>
                <input type="text" className="cf-input" required value={regForm.preferredName} onChange={e => setRegForm({...regForm, preferredName: e.target.value})} placeholder="As it appears on Government ID" />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Preferred Name</label>
                <input type="text" className="cf-input" required value={regForm.preferredName} onChange={e => setRegForm({...regForm, preferredName: e.target.value})} placeholder="For email roster list" />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Date of Birth (DOB)</label>
                <input type="date" className="cf-input" required value={regForm.dob} onChange={e => setRegForm({...regForm, dob: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Student ID (Assigned by Admin)</label>
                <input type="text" className="cf-input" disabled value={studentProfile.studentId} />
              </div>
            </div>

            <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Home size={14} /> 2. Address &amp; Contact Information</div>
            <div className="cf-form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="cf-input-group">
                <label className="cf-label">Permanent Address</label>
                <input type="text" className="cf-input" required value={regForm.permanentAddress} onChange={e => setRegForm({...regForm, permanentAddress: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Local/Current Address</label>
                <input type="text" className="cf-input" required value={regForm.localAddress} onChange={e => setRegForm({...regForm, localAddress: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Billing Address</label>
                <input type="text" className="cf-input" required value={regForm.billingAddress} onChange={e => setRegForm({...regForm, billingAddress: e.target.value})} />
              </div>
            </div>

            <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} /> Emergency Contact Information</div>
            <div className="cf-form-grid">
              <div className="cf-input-group">
                <label className="cf-label">Emergency Name</label>
                <input type="text" className="cf-input" required value={regForm.emergencyName} onChange={e => setRegForm({...regForm, emergencyName: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Relationship</label>
                <input type="text" className="cf-input" required value={regForm.emergencyRelation} onChange={e => setRegForm({...regForm, emergencyRelation: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Emergency Address</label>
                <input type="text" className="cf-input" required value={regForm.emergencyAddress} onChange={e => setRegForm({...regForm, emergencyAddress: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Emergency Phone</label>
                <input type="tel" className="cf-input" required value={regForm.emergencyPhone} onChange={e => setRegForm({...regForm, emergencyPhone: e.target.value})} />
              </div>
            </div>

            <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> Contact Methods</div>
            <div className="cf-form-grid">
              <div className="cf-input-group">
                <label className="cf-label">Personal Phone Number</label>
                <input type="tel" className="cf-input" required value={regForm.personalPhone} onChange={e => setRegForm({...regForm, personalPhone: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Permanent Personal Email</label>
                <input type="email" className="cf-input" required value={regForm.personalEmail} onChange={e => setRegForm({...regForm, personalEmail: e.target.value})} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Official College Email</label>
                <input type="email" className="cf-input" required value={regForm.collegeEmail} onChange={e => setRegForm({...regForm, collegeEmail: e.target.value})} />
              </div>
            </div>

            <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={14} /> 3. List of Courses (All Required for BICS)</div>
            <div style={{ padding: '5px 12px' }}>
              {COURSES_LIST.map((course, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <input type="checkbox" checked={true} disabled={true} />
                  <span style={{ fontSize: '9.5pt', color: '#555' }}>{course}</span>
                </div>
              ))}
            </div>

            <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={14} /> 4. Upload Documents</div>
            <div className="cf-form-grid">
              <div className="cf-input-group">
                <label className="cf-label">Profile Photo (JPEG/PNG)</label>
                <input type="file" required onChange={handlePhotoChange} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Signature Image (JPEG/PNG)</label>
                <input type="file" required onChange={handleSigChange} />
              </div>
              <div className="cf-input-group">
                <label className="cf-label">Signed Undertaking PDF</label>
                <input type="file" required onChange={handleUndertakingChange} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
              <button type="submit" className="cf-btn-primary" style={{ width: 'auto', padding: '6px 20px' }}>
                Submit
              </button>
            </div>

          </form>
        </div>
      )}
    </div>
  );
}
