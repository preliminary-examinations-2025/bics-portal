import React, { useState } from 'react';
import { 
  Printer, 
  Copy, 
  Check, 
  FileText, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  ShieldCheck,
  BookOpen,
  User,
  Phone,
  Mail,
  MapPin,
  FileCheck
} from 'lucide-react';
import { formatMediaUrl } from '../utils/media';

// Standard 6 academic courses for BICS with credit 4.0 each
const ACADEMIC_COURSES = [
  {
    code: "R526CS01T",
    name: "Introduction to Computer Science",
    type: "Theory",
    credits: "4.0",
    examMode: "Written Counterfoil (WF)",
    semester: "Semester I",
    batch: "2026 Regular"
  },
  {
    code: "R526CS02T",
    name: "Programming Fundamentals with C++",
    type: "Theory",
    credits: "4.0",
    examMode: "Written Counterfoil (WF)",
    semester: "Semester I",
    batch: "2026 Regular"
  },
  {
    code: "R526CS03T",
    name: "Basics of Web Development",
    type: "Theory",
    credits: "4.0",
    examMode: "Written Counterfoil (WF)",
    semester: "Semester I",
    batch: "2026 Regular"
  },
  {
    code: "R526CS04T",
    name: "Mathematical Thinking",
    type: "Theory",
    credits: "4.0",
    examMode: "Written Counterfoil (WF)",
    semester: "Semester I",
    batch: "2026 Regular"
  },
  {
    code: "R526CS02L",
    name: "Programming Fundamentals with C++ Lab",
    type: "Practical Lab",
    credits: "4.0",
    examMode: "Online Testing Terminal (OT)",
    semester: "Semester I",
    batch: "2026 Regular"
  },
  {
    code: "R526CS03L",
    name: "Basics of Web Development Lab",
    type: "Practical Lab",
    credits: "4.0",
    examMode: "Online Testing Terminal (OT)",
    semester: "Semester I",
    batch: "2026 Regular"
  }
];

export default function StudentInfo({ studentProfile }) {
  const [copiedField, setCopiedField] = useState('');

  if (!studentProfile) return null;

  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  // If course registration has not been submitted yet
  if (!studentProfile.registrationSubmitted) {
    return (
      <div className="cf-card" style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1' }}>
        <div className="cf-card-title">
          <User size={16} style={{ color: '#3b5998' }} />
          <span>Official Student Information Record</span>
        </div>
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderLeft: '4px solid #64748b',
          borderRadius: '4px',
          padding: '16px 20px',
          marginTop: '15px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '9pt',
          color: '#334155'
        }}>
          <FileText size={20} style={{ color: '#64748b', flexShrink: 0 }} />
          <div>
            <strong>Registration Incomplete:</strong> Your official candidate profile dossier will be generated automatically once you submit the Course Registration form. Please proceed to the Course Registration section to finalize your enrollment.
          </div>
        </div>
      </div>
    );
  }

  const regData = studentProfile.registrationData || {};
  const isApproved = studentProfile.registrationStatus === 'Approved';
  const isEligible = studentProfile.eligible;

  return (
    <div className="cf-card" style={{ padding: '15px' }}>
      <div className="cf-card-title">
        <User size={16} style={{ color: '#3b5998' }} />
        <span>Student Information Board</span>
      </div>

      <div className="student-dossier-container" style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: '#0f172a',
        overflow: 'hidden'
      }}>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .student-dossier-container, .student-dossier-container * {
            visibility: visible;
          }
          .student-dossier-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .dossier-no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* 1. DOCUMENT TOP BANNER & INSTITUTIONAL HEADER */}
      <div style={{
        padding: '24px 28px',
        borderBottom: '2px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img 
            src="/bics_logo.png" 
            alt="BICS Seal" 
            style={{ width: '42px', height: '42px', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div>
            <div style={{ fontSize: '7.5pt', letterSpacing: '1px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
              Basic Introductory Computer Science • Academic Council
            </div>
            <h1 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#002147', margin: '2px 0 0 0', letterSpacing: '0.2px' }}>
              Official Student Information Record &amp; Enrollment Dossier
            </h1>
            <div style={{ fontSize: '8pt', color: '#475569', marginTop: '2px' }}>
              Permanent Record Repository • Academic Cohort 2026
            </div>
          </div>
        </div>

        {/* Action Button: Clean white outline button */}
        <div className="dossier-no-print" style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '8pt',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
          >
            <Printer size={13} style={{ color: '#475569' }} />
            <span>Print Official Dossier</span>
          </button>
        </div>
      </div>

      {/* 2. STUDENT IDENTIFICATION SUMMARY TABLE & PASSPORT PHOTO */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch', flexWrap: 'wrap' }}>
          
          {/* Mounted Passport Photo with Security Border */}
          <div style={{
            width: '130px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{
              width: '130px',
              height: '155px',
              border: '1px solid #94a3b8',
              padding: '3px',
              backgroundColor: '#ffffff',
              borderRadius: '2px',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 4px rgba(0,0,0,0.06)'
            }}>
              <img
                src={formatMediaUrl(regData.photoUrl)}
                alt="Student Official Portrait"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  e.target.src = "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg";
                }}
              />
            </div>
            <span style={{ fontSize: '7pt', color: '#64748b', textAlign: 'center', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Official Specimen Photograph
            </span>
          </div>

          {/* Student Core Ledger Grid */}
          <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 0', width: '150px', color: '#64748b', fontWeight: '500' }}>Full Legal Name:</td>
                  <td style={{ padding: '7px 0', color: '#0f172a', fontWeight: 'bold', fontSize: '10.5pt' }}>
                    {studentProfile.name || regData.preferredName || 'Candidate'}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 0', color: '#64748b', fontWeight: '500' }}>Student ID / Reg. No:</td>
                  <td style={{ padding: '7px 0' }}>
                    <span style={{
                      fontFamily: 'Consolas, monospace',
                      fontWeight: 'bold',
                      fontSize: '9.5pt',
                      color: '#0f172a',
                      backgroundColor: '#f8fafc',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      border: '1px solid #e2e8f0'
                    }}>
                      {studentProfile.studentId}
                    </span>
                    <button
                      type="button"
                      className="dossier-no-print"
                      onClick={() => handleCopy(studentProfile.studentId, 'studentId')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        marginLeft: '8px',
                        color: '#64748b',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '7.5pt'
                      }}
                      title="Copy Student ID"
                    >
                      {copiedField === 'studentId' ? (
                        <>
                          <Check size={11} style={{ color: '#16a34a' }} />
                          <span style={{ color: '#16a34a' }}>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 0', color: '#64748b', fontWeight: '500' }}>Academic Program:</td>
                  <td style={{ padding: '7px 0', color: '#334155' }}>
                    Basic Introductory Computer Science (BICS)
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 0', color: '#64748b', fontWeight: '500' }}>Academic Cohort / Batch:</td>
                  <td style={{ padding: '7px 0', color: '#334155' }}>
                    2026 Regular Academic Session
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 0', color: '#64748b', fontWeight: '500' }}>Institutional College Email:</td>
                  <td style={{ padding: '7px 0', color: '#334155' }}>
                    {regData.collegeEmail || 'Not Provided'}
                    {regData.collegeEmail && (
                      <button
                        type="button"
                        className="dossier-no-print"
                        onClick={() => handleCopy(regData.collegeEmail, 'collegeEmail')}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          marginLeft: '8px',
                          color: '#64748b',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '7.5pt'
                        }}
                        title="Copy Email"
                      >
                        {copiedField === 'collegeEmail' ? (
                          <>
                            <Check size={11} style={{ color: '#16a34a' }} />
                            <span style={{ color: '#16a34a' }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '7px 0', color: '#64748b', fontWeight: '500' }}>Official Standing &amp; Eligibility:</td>
                  <td style={{ padding: '7px 0' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '7.5pt',
                        fontWeight: '600',
                        backgroundColor: isEligible ? '#f0fdf4' : '#fef2f2',
                        color: isEligible ? '#166534' : '#991b1b',
                        border: `1px solid ${isEligible ? '#bbf7d0' : '#fecaca'}`
                      }}>
                        {isEligible ? <CheckCircle size={11} /> : <XCircle size={11} />}
                        {isEligible ? 'Eligible for Examinations' : 'Not Cleared for Examinations'}
                      </span>

                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '7.5pt',
                        fontWeight: '600',
                        backgroundColor: isApproved ? '#f8fafc' : '#fffbeb',
                        color: isApproved ? '#334155' : '#92400e',
                        border: `1px solid ${isApproved ? '#cbd5e1' : '#fde68a'}`
                      }}>
                        Registration: {studentProfile.registrationStatus || 'Approved'}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* 3. SECTION: ENROLLED ACADEMIC COURSES REGISTER */}
      <div>
        <div style={{
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={14} style={{ color: '#64748b' }} />
            <span>1. Registered Academic Courses &amp; Curriculum Ledger</span>
          </div>
          <div style={{ fontSize: '7.5pt', color: '#64748b' }}>
            Official Syllabus Allocation • 6 Registered Courses
          </div>
        </div>

        <div style={{ padding: '16px 28px', borderBottom: '1px solid #e2e8f0' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '8pt',
            textAlign: 'left'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 'bold', width: '90px' }}>Course Code</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 'bold' }}>Course Title</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 'bold', width: '100px' }}>Component</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 'bold', width: '60px', textAlign: 'center' }}>Credits</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 'bold', width: '180px' }}>Assessment Mode</th>
                <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 'bold', width: '90px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ACADEMIC_COURSES.map((course, idx) => (
                <tr 
                  key={course.code}
                  style={{ 
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fcfcfc'
                  }}
                >
                  <td style={{ padding: '8px 10px', fontFamily: 'Consolas, monospace', fontWeight: 'bold', color: '#0f172a' }}>
                    {course.code}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: '500', color: '#1e293b' }}>
                    {course.name}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#475569' }}>
                    {course.type}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }}>
                    {course.credits}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#475569' }}>
                    {course.examMode}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      color: '#475569',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '7pt',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      Enrolled
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #cbd5e1', backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '8px 10px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Enrolled Curriculum Units
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#0f172a' }}>
                  24.0
                </td>
                <td colSpan={2} style={{ padding: '8px 10px', color: '#64748b', fontSize: '7.5pt' }}>
                  6 Courses (4 Theory + 2 Practical Labs @ 4.0 Credits each)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. SECTION: BIOGRAPHICAL & CONTACT LEDGER */}
      <div>
        <div style={{
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '8.5pt',
          fontWeight: 'bold',
          color: '#1e293b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <User size={14} style={{ color: '#64748b' }} />
          <span>2. Biographical Details &amp; Contact Ledger</span>
        </div>

        <div style={{ padding: '16px 28px', borderBottom: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 0', width: '180px', color: '#64748b', fontWeight: '500' }}>Date of Birth:</td>
                <td style={{ padding: '8px 0', width: '320px', color: '#0f172a', fontWeight: '600' }}>{regData.dob || 'Not Provided'}</td>
                <td style={{ padding: '8px 0', width: '180px', color: '#64748b', fontWeight: '500' }}>Personal Mobile Phone:</td>
                <td style={{ padding: '8px 0', color: '#0f172a', fontWeight: '600' }}>{regData.personalPhone || 'Not Provided'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '500' }}>Preferred Name:</td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>{regData.preferredName || 'Same as Legal Name'}</td>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '500' }}>Personal Primary Email:</td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>{regData.personalEmail || 'Not Provided'}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '500' }}>Emergency Contact Name:</td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>
                  {regData.emergencyContact?.name 
                    ? `${regData.emergencyContact.name} (${regData.emergencyContact.relationship || 'Guardian'})` 
                    : 'Not Provided'}
                </td>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '500' }}>Emergency Contact Phone:</td>
                <td style={{ padding: '8px 0', color: '#0f172a', fontWeight: '600' }}>
                  {regData.emergencyContact?.phone || 'Not Provided'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. SECTION: RESIDENTIAL & DOMICILE RECORDS */}
      <div>
        <div style={{
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '8.5pt',
          fontWeight: 'bold',
          color: '#1e293b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <MapPin size={14} style={{ color: '#64748b' }} />
          <span>3. Domicile &amp; Residential Postal Ledger</span>
        </div>

        <div style={{ padding: '16px 28px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', fontSize: '8.5pt' }}>
            
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '3px', padding: '12px 14px', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                Permanent Domicile Address
              </div>
              <div style={{ color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {regData.permanentAddress || 'Not Provided'}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '3px', padding: '12px 14px', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                Current Campus / Local Address
              </div>
              <div style={{ color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {regData.localAddress || 'Not Provided'}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '3px', padding: '12px 14px', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                Billing Address
              </div>
              <div style={{ color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {regData.billingAddress || regData.permanentAddress || 'Not Provided'}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 6. SECTION: VERIFICATION ARTIFACTS & SIGNATURE SPECIMEN */}
      <div>
        <div style={{
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '8.5pt',
          fontWeight: 'bold',
          color: '#1e293b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <FileCheck size={14} style={{ color: '#64748b' }} />
          <span>4. Legal Verification Artifacts &amp; Specimen Signatures</span>
        </div>

        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            
            {/* Candidate Signature Specimen Box */}
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                Official Candidate Signature Specimen
              </div>
              <div style={{
                width: '260px',
                height: '75px',
                border: '1px solid #94a3b8',
                borderRadius: '2px',
                padding: '4px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                <img
                  src={formatMediaUrl(regData.signatureUrl)}
                  alt="Candidate Signature Specimen"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    e.target.src = "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg";
                  }}
                />
              </div>
              <div style={{ fontSize: '7pt', color: '#94a3b8', marginTop: '4px' }}>
                Recorded during Course Registration verification.
              </div>
            </div>

            {/* Signed Undertaking File View Link */}
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                Executed Candidate Undertaking Document
              </div>
              
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '3px',
                padding: '12px 14px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={20} style={{ color: '#64748b' }} />
                  <div>
                    <div style={{ fontSize: '8.5pt', fontWeight: '600', color: '#1e293b' }}>
                      BICS Mandatory Student Undertaking
                    </div>
                    <div style={{ fontSize: '7pt', color: '#64748b' }}>
                      Signed &amp; Stored Academic Agreement
                    </div>
                  </div>
                </div>

                {regData.undertakingUrl ? (
                  <a
                    href={formatMediaUrl(regData.undertakingUrl)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      padding: '5px 12px',
                      borderRadius: '3px',
                      fontSize: '7.5pt',
                      fontWeight: '600',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                  >
                    <span>View File</span>
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span style={{ fontSize: '7.5pt', color: '#94a3b8', fontStyle: 'italic' }}>
                    No Document Attached
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Official Registry Seal Footer Note */}
          <div style={{
            marginTop: '25px',
            paddingTop: '12px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '7.5pt',
            color: '#94a3b8'
          }}>
            <div>
              Basic Introductory Computer Science Examination Board • Official Electronic Record
            </div>
            <div>
              Verification Hash: BICS-REG-{studentProfile.studentId || '2026'}-SECURE
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
);
}
