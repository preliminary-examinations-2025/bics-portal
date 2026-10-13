import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Printer, 
  BookOpen, 
  Scale, 
  FileCheck, 
  AlertTriangle, 
  ShieldCheck, 
  CheckCircle, 
  Clock, 
  Info,
  X
} from 'lucide-react';

export default function StudentCoC() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All Articles' },
    { id: 'integrity', label: 'Academic Integrity' },
    { id: 'exams', label: 'Exam Protocols' },
    { id: 'deadlines', label: 'Diligence & Timelines' },
    { id: 'matrix', label: 'Severity Matrix' },
    { id: 'appeals', label: 'Due Process & Appeals' }
  ];

  const articles = [
    {
      id: 'integrity',
      title: 'Article I: Academic Honesty & Intellectual Authorship',
      description: 'Foundational statutory obligations governing student intellectual production, independent implementation, and digital ethics.',
      clauses: [
        {
          code: 'Clause 1.1',
          name: 'Independent Intellectual Production & Authorship',
          text: 'Every candidate enrolled in the Basic Introductory Computer Science (BICS) program is strictly bound to submit only work conceived, structured, and implemented solely by their own individual intellect. All source codes, algorithmic documentation, laboratory counterfoils, and examination answers submitted under a student identification token are legally attributed to that candidate as sole author.'
        },
        {
          code: 'Clause 1.2',
          name: 'Generative AI & Algorithmic Code Synthesis Prohibition',
          text: 'The direct incorporation, automated ingestion, or submission of programmatic solutions generated via Large Language Models (LLMs), AI code synthesizers, or external prompt tools without authorized institutional citation is strictly classified as academic fraud. Automated code analysis tools and abstract syntax tree (AST) comparisons are continuously applied to detect non-human code structuring.'
        },
        {
          code: 'Clause 1.3',
          name: 'Prohibition of Peer Collusion & Solution Distribution',
          text: 'The distribution, sharing, transmission, or co-authoring of source files, logic schemas, testcase implementations, or examination answer keys across peer candidates—whether through private messaging, public repositories, or cloud pastebins—is explicitly prohibited and constitutes actionable intellectual collusion for all participating parties.'
        },
        {
          code: 'Clause 1.4',
          name: 'Sanctity of Credentials & Non-Transferability of Sessions',
          text: 'Portal access credentials, authentication secret keys, session tokens, and identity verifications are strictly personalized and non-transferable. Permitting any third party, tutor, or proxy to access the candidate portal or undertake assessments under the candidate roll number constitutes an aggravated breach of academic security.'
        }
      ]
    },
    {
      id: 'exams',
      title: 'Article II: Terminal Examination Security & Anti-Malpractice Protocol',
      description: 'Mandatory technical parameters, proctoring mandates, and terminal constraints active during formal course assessments.',
      clauses: [
        {
          code: 'Clause 2.1',
          name: 'Continuous Fullscreen Session Lockdown',
          text: 'Throughout the duration of any live proctored examination, candidates must maintain the browser viewport in continuous, locked fullscreen mode. System heuristics continuously log window minimization, OS application switches, and tab departures. Any candidate exceeding three logged security warnings will trigger immediate automatic session termination and forced submission.'
        },
        {
          code: 'Clause 2.2',
          name: 'Biometric Telemetry & Optical Surveillance',
          text: 'Candidates are required to maintain an unblocked, illuminated, and continuous webcam video feed. Background automated biometric telemetry continuously verifies facial orientation, single-candidate presence, and gaze tracking. Persistent multi-face presence or unverified candidate absence will be formally appended to the proctoring audit log for administrative inquiry.'
        },
        {
          code: 'Clause 2.3',
          name: 'Prohibition of Peripheral Displays & Virtualization',
          text: 'The operation of secondary display monitors, virtual machines (VMs), remote desktop applications, screen-casting protocols, or unauthorized local host listeners during active examination timers is strictly forbidden. The system runtime executes diagnostic environment sweeps to ensure assessment isolation.'
        }
      ]
    },
    {
      id: 'deadlines',
      title: 'Article III: Curricular Engagement, Timelines & Professional Decorum',
      description: 'Expectations regarding systematic coursework progression, communication ethics, and deadline compliance.',
      clauses: [
        {
          code: 'Clause 3.1',
          name: 'Curricular Progress & Lecture Engagement Benchmarks',
          text: 'Students are obligated to systematically progress through published video lectures, workbook modules, and documentation in the designated chronological sequence. Unexcused and unexplained absence or inactivity from portal coursework exceeding fourteen consecutive calendar days will trigger an administrative eligibility review.'
        },
        {
          code: 'Clause 3.2',
          name: 'Submission Schedules & Inflexibility of Published Deadlines',
          text: 'All course counterfoils, mid-semester milestone assessments, feedback forms, and exit surveys must be finalized prior to published server cutoff timestamps. Late submissions cannot be entertained except in verified extraordinary contingencies supported by official medical documentation and approved by the Dean of Examinations.'
        },
        {
          code: 'Clause 3.3',
          name: 'Professional Decorum & Respectful Communication',
          text: 'All communications conducted through the portal, including academic grievance submissions, support tickets, and course feedback, must maintain strict institutional decorum. Submissions containing defamatory, abusive, offensive, or harassing expressions will result in immediate privileges suspension.'
        }
      ]
    },
    {
      id: 'matrix',
      title: 'Article IV: Statutory Disciplinary Matrix & Severity Classifications',
      description: 'Standardized classification of infractions and corresponding institutional sanctions enforced by the Examination Board.',
      isMatrix: true
    },
    {
      id: 'appeals',
      title: 'Article V: Due Process, Grievance Redressal & EIRF Incident Filing',
      description: 'Formal avenues of defense, emergency reporting protocols, and appellate timelines afforded to every candidate.',
      clauses: [
        {
          code: 'Clause 5.1',
          name: 'Emergency Incident Report Form (EIRF) Protocol',
          text: 'In the event of an abrupt examination lockout arising from legitimate technical anomalies, power failures, or proctoring algorithm misclassifications, the candidate retains the statutory right to file a formal Emergency Incident Report Form (EIRF) within twenty-four hours of session termination for technical forensic audit.'
        },
        {
          code: 'Clause 5.2',
          name: 'Due Process & Right to Formal Committee Hearing',
          text: 'Prior to the enforcement of Tier II or Tier III disciplinary sanctions, the affected candidate will be issued an official Statement of Allegations. The candidate is guaranteed five working days to submit a written explanation, logs, and supporting corroborating evidence to the Academic Integrity Council.'
        },
        {
          code: 'Clause 5.3',
          name: 'Finality & Binding Authority of Council Determinations',
          text: 'Upon thorough review of proctoring forensic logs, code plagiarism matrices, and candidate statements, the determination issued by the Controller of Examinations and the Preliminary Examinations Academic Council is definitive, legally binding, and final across all records.'
        }
      ]
    }
  ];

  // Filtering logic
  const filteredArticles = articles.filter(art => {
    if (activeCategory !== 'all' && art.id !== activeCategory) {
      return false;
    }
    if (!searchQuery.trim()) {
      return true;
    }
    const q = searchQuery.toLowerCase();
    if (art.title.toLowerCase().includes(q) || (art.description && art.description.toLowerCase().includes(q))) {
      return true;
    }
    if (art.clauses) {
      return art.clauses.some(c => 
        c.code.toLowerCase().includes(q) || 
        c.name.toLowerCase().includes(q) || 
        c.text.toLowerCase().includes(q)
      );
    }
    if (art.isMatrix) {
      return 'tier minor malpractice expulsion penalty consequence sanction'.includes(q);
    }
    return false;
  });

  return (
    <div className="cf-card" style={{ padding: '15px' }}>
      <div className="cf-card-title">
        <ShieldCheck size={16} style={{ color: '#3b5998' }} />
        <span>BICS Course Code of Conduct</span>
      </div>

      {/* Main Inner Legal Charter Container */}
      <div className="coc-charter-container" style={{
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
            .coc-charter-container, .coc-charter-container * {
              visibility: visible;
            }
            .coc-charter-container {
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
            .coc-no-print {
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
                Academic Integrity Board • Preliminary Examinations 2026
              </div>
              <h1 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#002147', margin: '2px 0 0 0', letterSpacing: '0.2px' }}>
                Charter of Academic Integrity &amp; Student Disciplinary Regulations
              </h1>
              <div style={{ fontSize: '8pt', color: '#475569', marginTop: '2px' }}>
                Statutory Code of Conduct • Applicable to All Registered BICS Candidates
              </div>
            </div>
          </div>

          {/* Action Button: Clean white outline button */}
          <div className="coc-no-print" style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => window.print()}
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
              <span>Print Official Charter</span>
            </button>
          </div>
        </div>

        {/* 2. STATUTORY PREAMBLE BOX */}
        <div style={{
          padding: '20px 28px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '9pt',
          color: '#334155',
          lineHeight: '1.75',
          textAlign: 'justify',
          textJustify: 'inter-word'
        }}>
          <strong>Statutory Preamble:</strong> Enrollment in the Basic Introductory Computer Science (BICS) curriculum constitutes a solemn legal and ethical agreement to uphold the highest standards of intellectual honesty, professional discipline, and examination ethics. All candidates are presumed to have read, understood, and consented to the enforceable provisions of this Charter. Ignorance of these statutory bylaws will not be accepted as a defense in any administrative or disciplinary proceedings.
        </div>

        {/* 3. INTERACTIVE SEARCH & CATEGORY FILTER BAR */}
        <div className="coc-no-print" style={{
          padding: '14px 28px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            {/* Search Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '4px 10px',
              maxWidth: '380px',
              width: '100%'
            }}>
              <Search size={14} style={{ color: '#64748b', marginRight: '8px', flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search regulations (e.g. AI, malpractice, EIRF, deadline)..."
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '8pt',
                  width: '100%',
                  color: '#0f172a'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Compliance Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '8pt',
              color: '#166534',
              backgroundColor: '#f0fdf4',
              padding: '4px 10px',
              borderRadius: '3px',
              border: '1px solid #bbf7d0'
            }}>
              <ShieldCheck size={13} style={{ color: '#166534' }} />
              <span>Compliance Status: Verified Active Candidate</span>
            </div>
          </div>

          {/* Category Filter Pills (Clean white outline pills) */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    backgroundColor: isActive ? '#ffffff' : '#f8fafc',
                    border: `1px solid ${isActive ? '#94a3b8' : '#e2e8f0'}`,
                    color: isActive ? '#0f172a' : '#64748b',
                    padding: '3px 10px',
                    borderRadius: '3px',
                    fontSize: '7.5pt',
                    fontWeight: isActive ? 'bold' : '500',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. ARTICLES CONTENT BODY */}
        <div>
          {filteredArticles.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: '9pt' }}>
              No statutory clauses found matching your search term: <strong>"{searchQuery}"</strong>.
            </div>
          ) : (
            filteredArticles.map((article) => (
              <div key={article.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                
                {/* Article Section Header (Subtle neutral slate header) */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  padding: '12px 28px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    <h2 style={{
                      margin: 0,
                      fontSize: '9.5pt',
                      fontWeight: 'bold',
                      color: '#1e293b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <Scale size={14} style={{ color: '#64748b' }} />
                      <span>{article.title}</span>
                    </h2>
                    {article.description && (
                      <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                        {article.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Article Clauses Content */}
                <div style={{ padding: '16px 28px' }}>
                  {article.isMatrix ? (
                    /* ARTICLE IV: SEVERITY MATRIX TABLE */
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '8pt',
                        textAlign: 'left'
                      }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '9px 12px', color: '#475569', fontWeight: 'bold', width: '130px' }}>Classification Tier</th>
                            <th style={{ padding: '9px 12px', color: '#475569', fontWeight: 'bold', width: '38%' }}>Specified Infractions &amp; Malpractices</th>
                            <th style={{ padding: '9px 12px', color: '#475569', fontWeight: 'bold' }}>Prescribed Statutory Administrative Penalties</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', fontWeight: 'bold', color: '#334155' }}>
                              Tier I: Administrative Irregularity
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#475569', lineHeight: '1.6' }}>
                              Unintentional window focus departures during calibration; minor submission delays without prior notice; failure to maintain legible profile registration records.
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#334155', lineHeight: '1.6' }}>
                              Official administrative warning recorded on file; mandatory identity re-verification; temporary twenty-four hour portal security hold.
                            </td>
                          </tr>

                          <tr style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#fcfcfc' }}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', fontWeight: 'bold', color: '#854d0e' }}>
                              Tier II: Academic Non-Compliance
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#475569', lineHeight: '1.6' }}>
                              Peer code sharing on practical counterfoils; unauthorized imports of external pre-built scripts; repeated unexcused module inactivity exceeding 14 days.
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#334155', lineHeight: '1.6' }}>
                              Automatic award of zero marks (0/100) on the disputed assessment component; permanent disciplinary remark appended to academic transcript.
                            </td>
                          </tr>

                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', fontWeight: 'bold', color: '#991b1b' }}>
                              Tier III: Aggravated Malpractice &amp; Fraud
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#475569', lineHeight: '1.6' }}>
                              Exceeding 3 proctoring window violations; AI-synthesized code submission; credential sharing or proxy test-taking; distribution or leaking of exam papers.
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#334155', lineHeight: '1.6' }}>
                              Immediate cancellation of exam candidacy; permanent revocation of Hall Ticket; referral to University Disciplinary Board for program expulsion.
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* STANDARD CLAUSES ACCORDION / LIST */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {article.clauses.map((clause, cIdx) => (
                        <div 
                          key={clause.code}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '3px',
                            backgroundColor: '#ffffff',
                            padding: '12px 16px'
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '6px'
                          }}>
                            <span style={{
                              fontFamily: 'Consolas, monospace',
                              fontWeight: 'bold',
                              fontSize: '8pt',
                              color: '#334155',
                              backgroundColor: '#f1f5f9',
                              padding: '2px 6px',
                              borderRadius: '2px'
                            }}>
                              {clause.code}
                            </span>
                            <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a' }}>
                              {clause.name}
                            </span>
                          </div>

                          <p style={{
                            margin: 0,
                            fontSize: '8.5pt',
                            color: '#334155',
                            lineHeight: '1.75',
                            textAlign: 'justify',
                            textJustify: 'inter-word'
                          }}>
                            {clause.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ))
          )}
        </div>

        {/* 5. OFFICIAL SOLEMN DECLARATION FOOTER */}
        <div style={{ padding: '20px 28px', backgroundColor: '#f8fafc' }}>
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '14px 18px',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileCheck size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#0f172a' }}>
                  Statutory Compliance &amp; Candidate Undertaking
                </div>
                <div style={{ fontSize: '7.5pt', color: '#64748b' }}>
                  Execution acknowledged upon Course Registration and Hall Ticket dispatch.
                </div>
              </div>
            </div>

            <div style={{ fontSize: '7.5pt', color: '#64748b', textAlign: 'right' }}>
              <div>Reference Code: <strong>BICS-COC-2026-REV4</strong></div>
              <div>Authority: Academic Standards &amp; Examination Council</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
