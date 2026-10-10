import React from 'react';
import { User, Home, Mail, Upload, FileText } from 'lucide-react';
import { formatMediaUrl } from '../utils/media';

export default function StudentInfo({ studentProfile }) {
  if (!studentProfile) return null;

  return (
    <div className="cf-card">
      <div className="cf-card-title">Student Information Board</div>
      {!studentProfile.registrationSubmitted ? (
        <div className="cf-alert cf-alert-info">
          Please complete the Course Registration form to display your profile record.
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '25px' }}>
            <div className="profile-preview-box" style={{ width: '120px', height: '120px' }}>
              <img src={formatMediaUrl(studentProfile.registrationData.photoUrl)} alt="Student Profile Pic" />
            </div>
            <div>
              <h3 style={{ fontSize: '15pt', color: '#002147' }}>{studentProfile.name}</h3>
              <p style={{ color: '#666', fontSize: '9.5pt' }}>ID: <strong>{studentProfile.studentId}</strong></p>
              <p style={{ marginTop: '8px' }}>
                Eligibility Status: {studentProfile.eligible ? (
                  <span className="status-badge status-eligible">Eligible</span>
                ) : (
                  <span className="status-badge status-ineligible">Ineligible</span>
                )}
              </p>
            </div>
          </div>

          <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={14} />
            <span>Core Personal Information</span>
          </div>
          <div className="profile-info-grid">
            <span className="profile-info-label">Full Legal Name:</span>
            <span className="profile-info-value">{studentProfile.registrationData.preferredName}</span>
            <span className="profile-info-label">Preferred Name:</span>
            <span className="profile-info-value">{studentProfile.registrationData.preferredName}</span>
            <span className="profile-info-label">Date of Birth:</span>
            <span className="profile-info-value">{studentProfile.registrationData.dob}</span>
          </div>

          <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Home size={14} /> Address &amp; Contact Information</div>
          <div className="profile-info-grid">
            <span className="profile-info-label">Permanent:</span>
            <span className="profile-info-value">{studentProfile.registrationData.permanentAddress}</span>
            <span className="profile-info-label">Local Address:</span>
            <span className="profile-info-value">{studentProfile.registrationData.localAddress}</span>
            <span className="profile-info-label">Billing:</span>
            <span className="profile-info-value">{studentProfile.registrationData.billingAddress}</span>
            <span className="profile-info-label">Emergency Call:</span>
            <span className="profile-info-value">
              {studentProfile.registrationData.emergencyContact?.name} ({studentProfile.registrationData.emergencyContact?.relationship}) - {studentProfile.registrationData.emergencyContact?.phone}
            </span>
            <span className="profile-info-label">Contact Address:</span>
            <span className="profile-info-value">{studentProfile.registrationData.emergencyContact?.address}</span>
          </div>

          <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> Contact Methods</div>
          <div className="profile-info-grid">
            <span className="profile-info-label">Personal Phone:</span>
            <span className="profile-info-value">{studentProfile.registrationData.personalPhone}</span>
            <span className="profile-info-label">Personal Email:</span>
            <span className="profile-info-value">{studentProfile.registrationData.personalEmail}</span>
            <span className="profile-info-label">College Email:</span>
            <span className="profile-info-value">{studentProfile.registrationData.collegeEmail}</span>
          </div>

          <div className="cf-form-section" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Upload size={14} /> Uploaded Signatures &amp; Documents</div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '10px' }}>
            <div>
              <span className="cf-label" style={{ display: 'block', marginBottom: '5px' }}>Signature Preview</span>
              <div className="profile-preview-box" style={{ width: '180px', height: '60px' }}>
                <img src={formatMediaUrl(studentProfile.registrationData.signatureUrl)} alt="Signature Upload" style={{ objectFit: 'contain' }} />
              </div>
            </div>
            <div>
              <span className="cf-label" style={{ display: 'block', marginBottom: '5px' }}>Signed Undertaking</span>
              <a href={formatMediaUrl(studentProfile.registrationData.undertakingUrl)} target="_blank" rel="noreferrer" className="cf-btn-secondary" style={{ display: 'inline-block', lineHeight: '2.0', textAlign: 'center' }}>
                <FileText size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> View Uploaded Document
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
