import React, { useState } from 'react';
import { Flag, RefreshCw, Loader2, CheckCircle, Paperclip, FileText, Search } from 'lucide-react';
import RichText from '../../components/RichText';
import Editor from '@monaco-editor/react';

export default function AdminObjections({
  fetchAdminObjections,
  adminObjectionsList,
  adminObjectionsFilter,
  setAdminObjectionsFilter,
  adminObjectionModal,
  setAdminObjectionModal,
  handleResolveObjection
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeWebTab, setActiveWebTab] = useState('html');

  return (
    <div>
      <div className="cf-card" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '16pt', color: '#002147', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flag size={20} style={{ color: '#b45309' }} /> Examination Question Objections &amp; Grievances
            </h2>
            <div style={{ fontSize: '9pt', color: '#64748b' }}>
              Review candidate grievances per question, inspect submitted source code and choices, update marks awarded, and post committee resolution feedback.
            </div>
          </div>
          <button className="cf-btn-secondary" onClick={fetchAdminObjections} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh List
          </button>
        </div>

        {/* Filter Tabs & Search Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '15px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Objections', count: adminObjectionsList.length },
              { id: 'pending', label: 'Pending Review', count: adminObjectionsList.filter(o => o.status === 'pending').length },
              { id: 'resolved', label: 'Resolved', count: adminObjectionsList.filter(o => o.status === 'resolved').length },
              { id: 'rejected', label: 'Rejected', count: adminObjectionsList.filter(o => o.status === 'rejected').length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAdminObjectionsFilter(tab.id)}
                className={`cf-btn-${adminObjectionsFilter === tab.id ? 'primary' : 'secondary'}`}
                style={{
                  padding: '6px 14px',
                  fontSize: '8.5pt',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  backgroundColor: adminObjectionsFilter === tab.id ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                  color: adminObjectionsFilter === tab.id ? '#ffffff' : '#475569',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '7.5pt'
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', maxWidth: '360px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px' }}>
            <Search size={14} style={{ color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search by Objection ID, Candidate, Exam..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '8.5pt', color: '#334155' }}
            />
          </div>
        </div>

        {/* Objections Data Table */}
        {(() => {
          const filtered = adminObjectionsList.filter(o => {
            const matchesStatus = adminObjectionsFilter === 'all' || o.status === adminObjectionsFilter;
            const term = searchTerm.toLowerCase().trim();
            if (!term) return matchesStatus;

            const matchesSearch =
              (o.objectionId || '').toLowerCase().includes(term) ||
              (o.candidateName || '').toLowerCase().includes(term) ||
              (o.studentId || '').toLowerCase().includes(term) ||
              (o.testTitle || '').toLowerCase().includes(term) ||
              (o.reason || '').toLowerCase().includes(term) ||
              (o.details || '').toLowerCase().includes(term);

            return matchesStatus && matchesSearch;
          });

          if (filtered.length === 0) {
            return (
              <div className="cf-alert cf-alert-info">
                No question objections found matching your search or category filter.
              </div>
            );
          }

          return (
            <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Objection ID</th>
                    <th>Candidate</th>
                    <th>Exam &amp; Question</th>
                    <th>Grievance Category</th>
                    <th>Student Comments</th>
                    <th>Raised Date</th>
                    <th>Status</th>
                    <th>Resolution / Marks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(filtered) ? filtered : []).map((obj, oIdx) => (
                    <tr key={oIdx}>
                      <td>
                        <span style={{
                          fontSize: '8pt',
                          fontFamily: 'monospace',
                          fontWeight: 'bold',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          whiteSpace: 'nowrap'
                        }}>
                          {obj.objectionId || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 'bold', color: '#002147' }}>{obj.candidateName || 'Candidate'}</div>
                        <div style={{ fontSize: '8pt', color: '#64748b' }}>ID: {obj.studentId || 'N/A'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: '#334155' }}>{obj.testTitle}</div>
                        <span style={{ fontSize: '7.5pt', backgroundColor: '#e2e8f0', color: '#1e293b', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          Question #{Number(obj.questionIndex || 0) + 1}
                        </span>
                      </td>
                      <td style={{ fontSize: '8.5pt', color: '#475569' }}>
                        <strong>{obj.reason}</strong>
                      </td>
                      <td style={{ fontSize: '8.5pt', color: '#334155', maxWidth: '240px' }}>
                        <div style={{ maxHeight: '60px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                          {obj.details}
                        </div>
                      </td>
                      <td style={{ fontSize: '8pt', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {obj.raisedAt ? new Date(obj.raisedAt).toLocaleString() : 'N/A'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '7.5pt',
                          fontWeight: 'bold',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: obj.status === 'resolved' ? '#dcfce7' : (obj.status === 'rejected' ? '#fee2e2' : '#fef3c7'),
                          color: obj.status === 'resolved' ? '#15803d' : (obj.status === 'rejected' ? '#b91c1c' : '#b45309'),
                          border: `1px solid ${obj.status === 'resolved' ? '#86efac' : (obj.status === 'rejected' ? '#fca5a5' : '#fcd34d')}`,
                          display: 'inline-block',
                          textTransform: 'uppercase'
                        }}>
                          {obj.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '8.5pt' }}>
                        {obj.status === 'resolved' ? (
                          <div>
                            <strong style={{ color: '#15803d' }}>Revised: {obj.resolvedMarks ?? 'N/A'} pts</strong>
                            {obj.adminRemarks && <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>{obj.adminRemarks}</div>}
                          </div>
                        ) : obj.status === 'rejected' ? (
                          <div>
                            <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>No Marks Awarded</span>
                            {obj.adminRemarks && <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>{obj.adminRemarks}</div>}
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>Pending Evaluation</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="cf-btn-primary"
                          onClick={() => {
                            setAdminObjectionModal({
                              isOpen: true,
                              objection: obj,
                              status: obj.status === 'pending' ? 'resolved' : obj.status,
                              revisedMarks: obj.resolvedMarks !== undefined ? obj.resolvedMarks : (obj.submittedAnswer?.score || 0),
                              adminRemarks: obj.adminRemarks || '',
                              submitting: false,
                              error: '',
                              success: ''
                            });
                          }}
                          style={{ padding: '4px 10px', fontSize: '8pt', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                        >
                          {obj.status === 'pending' ? 'Review & Resolve' : 'Edit Resolution'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Objection Resolution Modal */}
      {adminObjectionModal.isOpen && adminObjectionModal.objection && (
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
            maxWidth: '650px',
            width: '100%',
            padding: '25px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '13pt', color: '#002147', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flag size={18} style={{ color: '#b45309' }} />
                <span>Review Objection: {adminObjectionModal.objection.objectionId ? `${adminObjectionModal.objection.objectionId} (` : ''}Question #{Number(adminObjectionModal.objection.questionIndex || 0) + 1}{adminObjectionModal.objection.objectionId ? ')' : ''}</span>
              </h3>
              <button
                onClick={() => setAdminObjectionModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '12pt', fontWeight: 'bold' }}
              >
                Close
              </button>
            </div>

            {adminObjectionModal.error && (
              <div className="cf-alert cf-alert-danger" style={{ fontSize: '8.5pt' }}>
                {adminObjectionModal.error}
              </div>
            )}

            {adminObjectionModal.success && (
              <div className="cf-alert cf-alert-success" style={{ fontSize: '8.5pt' }}>
                {adminObjectionModal.success}
              </div>
            )}

            {/* Candidate Grievance Summary Box */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '9pt' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <div><strong>Objection ID:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1d4ed8' }}>{adminObjectionModal.objection.objectionId || 'N/A'}</span></div>
                <div><strong>Candidate:</strong> {adminObjectionModal.objection.candidateName} ({adminObjectionModal.objection.studentId})</div>
                <div><strong>Exam:</strong> {adminObjectionModal.objection.testTitle}</div>
              </div>
              <div>
                <strong>Grievance Category:</strong> {adminObjectionModal.objection.reason}
              </div>
              <div>
                <strong>Candidate Explanation:</strong>
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', marginTop: '4px', whiteSpace: 'pre-wrap', color: '#1e293b' }}>
                  {adminObjectionModal.objection.details}
                </div>
              </div>

              {/* Uploaded Supporting Documents / Proofs */}
              {Array.isArray(adminObjectionModal.objection.attachments) && adminObjectionModal.objection.attachments.length > 0 && (
                <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                  <strong style={{ color: '#475569', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Paperclip size={13} /> Uploaded Supporting Documents / Proofs ({adminObjectionModal.objection.attachments.length}):
                  </strong>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {adminObjectionModal.objection.attachments.map((att, aIdx) => (
                      <a
                        key={aIdx}
                        href={att}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '8pt',
                          color: '#0284c7',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontWeight: 'bold'
                        }}
                      >
                        <FileText size={12} /> Proof Attachment #{aIdx + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Candidate Submitted Response & Question Context Evaluation */}
            {(() => {
              const obj = adminObjectionModal.objection;
              const q = obj.targetQuestion;
              const ans = obj.submittedAnswer || {};
              const qTitle = q?.title || `Question #${Number(obj.questionIndex || 0) + 1}`;
              const qDesc = q?.description || q?.questionText || q?.problemStatement || q?.text || ans?.questionDescription || ans?.questionText || '';

              const isWeb = q?.type === 'web' || ans?.type === 'web' || q?.playgroundLanguage === 'web' ||
                            ans?.submittedHtml !== undefined || ans?.submittedCss !== undefined || ans?.submittedJs !== undefined ||
                            (qTitle && qTitle.toLowerCase().includes('web design')) ||
                            (qDesc && (qDesc.toLowerCase().includes('html') || qDesc.toLowerCase().includes('responsive card')));

              const qType = isWeb ? 'web' : (q?.type || ans?.type || (ans.submittedCode ? 'coding' : 'mcq'));

              if (qType === 'mcq') {
                return (
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      Question #{Number(obj.questionIndex || 0) + 1} Evaluation &amp; Options Breakdown:
                    </div>

                    {/* Question Title & Description */}
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '10pt', color: '#002147', fontWeight: 'bold' }}>
                        <RichText text={qTitle} style={{ fontSize: '10pt', color: '#002147' }} />
                      </div>
                      {qDesc && (
                        <div style={{ fontSize: '9.5pt', color: '#334155', lineHeight: '1.6', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                          <RichText text={qDesc} style={{ fontSize: '9.5pt', color: '#334155' }} />
                        </div>
                      )}
                    </div>

                    {q?.imageUrl && (
                      <div style={{ margin: '4px 0' }}>
                        <img src={q.imageUrl} alt="Question Visual" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                      </div>
                    )}

                    {/* MCQ Options List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(q?.options || (ans.selectedOptionIndex !== undefined ? ['Option A', 'Option B', 'Option C', 'Option D'] : [])).map((opt, optIdx) => {
                        const isCandidateChoice = Number(ans.selectedOptionIndex) === optIdx;
                        const isOfficialCorrect = Number(q?.correctOptionIndex) === optIdx;

                        let borderColor = '#e2e8f0';
                        let bgColor = '#ffffff';
                        let badge = null;

                        if (isCandidateChoice && isOfficialCorrect) {
                          borderColor = '#22c55e';
                          bgColor = '#f0fdf4';
                          badge = <span style={{ color: '#166534', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>Your Choice (Correct)</span>;
                        } else if (isCandidateChoice && !isOfficialCorrect) {
                          borderColor = '#ef4444';
                          bgColor = '#fef2f2';
                          badge = <span style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>Your Selection (Incorrect)</span>;
                        } else if (isOfficialCorrect) {
                          borderColor = '#22c55e';
                          bgColor = '#f0fdf4';
                          badge = <span style={{ color: '#166534', fontWeight: 'bold', fontSize: '8pt', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>★ Official Answer Key</span>;
                        }

                        return (
                          <div
                            key={optIdx}
                            style={{
                              border: `2px solid ${borderColor}`,
                              backgroundColor: bgColor,
                              borderRadius: '6px',
                              padding: '10px 14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '9pt' }}>
                              <span style={{ fontWeight: 'bold', color: '#64748b', width: '20px' }}>
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <RichText text={opt} style={{ fontSize: '9pt', color: '#334155' }} />
                            </div>
                            {badge}
                          </div>
                        );
                      })}
                    </div>

                    {/* Official Solution Explanation */}
                    {q?.explanation && (
                      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', fontSize: '8.5pt' }}>
                        <strong style={{ color: '#002147', display: 'block', marginBottom: '4px' }}>Official Explanation:</strong>
                        <RichText text={q.explanation} style={{ fontSize: '8.5pt', color: '#334155' }} />
                      </div>
                    )}
                  </div>
                );
              }

              // WEB DESIGN QUESTION (HTML / CSS / JS)
              if (isWeb) {
                const htmlVal = ans.submittedHtml ?? ans.html ?? (typeof ans.submittedCode === 'string' && ans.submittedCode.includes('<') ? ans.submittedCode : '') ?? q?.webHtmlTemplate ?? '';
                const cssVal = ans.submittedCss ?? ans.css ?? q?.webCssTemplate ?? '';
                const jsVal = ans.submittedJs ?? ans.js ?? q?.webJsTemplate ?? '';

                return (
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Candidate Submitted Web Design Workspace:</span>
                      <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '7.5pt', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                        HTML / CSS / JS Live Preview
                      </span>
                    </div>

                    {/* Question Title & Full Problem Statement */}
                    <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold' }}>
                        <RichText text={qTitle} style={{ fontSize: '10.5pt', color: '#002147' }} />
                      </div>
                      {qDesc ? (
                        <div style={{ fontSize: '9.5pt', color: '#0f172a', lineHeight: '1.65', borderTop: '1px solid #bae6fd', paddingTop: '8px' }}>
                          <RichText text={qDesc} style={{ fontSize: '9.5pt', color: '#0f172a' }} />
                        </div>
                      ) : (
                        <div style={{ fontSize: '9pt', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #bae6fd', paddingTop: '6px' }}>
                          No problem statement provided.
                        </div>
                      )}
                    </div>

                    {/* Web Code Tabs Navigation */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      {[
                        { id: 'html', label: 'HTML Source Code' },
                        { id: 'css', label: 'CSS Stylesheet Code' },
                        { id: 'js', label: 'JavaScript Code' },
                        { id: 'preview', label: '🌐 Live Page Preview' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveWebTab(tab.id)}
                          className={`cf-btn-${activeWebTab === tab.id ? 'primary' : 'secondary'}`}
                          style={{ padding: '4px 12px', fontSize: '8pt', fontWeight: 'bold' }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Read-Only Monaco Editors per Tab */}
                    {activeWebTab === 'html' && (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: '#f8fafc', padding: '4px 10px', fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                          HTML SOURCE CODE
                        </div>
                        <Editor
                          height="200px"
                          language="html"
                          theme="vs-light"
                          value={htmlVal || '<!-- No HTML submitted -->'}
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', automaticLayout: true }}
                        />
                      </div>
                    )}
                    {activeWebTab === 'css' && (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: '#f8fafc', padding: '4px 10px', fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                          CSS STYLESHEET CODE
                        </div>
                        <Editor
                          height="200px"
                          language="css"
                          theme="vs-light"
                          value={cssVal || '/* No CSS submitted */'}
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', automaticLayout: true }}
                        />
                      </div>
                    )}
                    {activeWebTab === 'js' && (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: '#f8fafc', padding: '4px 10px', fontSize: '7.5pt', fontWeight: 'bold', color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                          JAVASCRIPT CODE
                        </div>
                        <Editor
                          height="200px"
                          language="javascript"
                          theme="vs-light"
                          value={jsVal || '// No JS submitted'}
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', automaticLayout: true }}
                        />
                      </div>
                    )}

                    {/* Live Rendered Web Page Sandbox Output */}
                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginTop: '4px' }}>
                      <div style={{ backgroundColor: '#f0fdf4', padding: '6px 12px', fontSize: '8pt', fontWeight: 'bold', color: '#166534', borderBottom: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🌐 Rendered Live Web Page Output (HTML + CSS + JS)</span>
                        <span style={{ fontSize: '7.5pt', fontWeight: 'normal', color: '#15803d' }}>Interactive Isolated Sandbox</span>
                      </div>
                      <iframe
                        title="Candidate Web Page Rendered Output"
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <meta charset="utf-8">
                              <style>
                                html, body {
                                  margin: 0;
                                  padding: 12px;
                                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                  box-sizing: border-box;
                                }
                                *, *:before, *:after { box-sizing: inherit; }
                                img, video, iframe, canvas { max-width: 100%; height: auto; }
                              </style>
                              <style>${cssVal}</style>
                            </head>
                            <body>
                              ${htmlVal}
                              <script>${jsVal}</script>
                            </body>
                          </html>
                        `}
                        sandbox="allow-scripts"
                        style={{ width: '100%', height: '280px', border: 'none', backgroundColor: '#ffffff' }}
                      />
                    </div>
                  </div>
                );
              }

              // STANDARD ALGORITHMIC CODING QUESTION
              const codLang = q?.language || q?.playgroundLanguage || ans?.language || (ans?.submittedCode?.includes('#include') ? 'cpp' : (ans?.submittedCode?.includes('def ') ? 'python' : (ans?.submittedCode?.includes('public class') ? 'java' : 'cpp')));

              return (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    Candidate Submitted Code &amp; Testcase Evaluation:
                  </div>

                  {/* Question Title & Full Problem Statement */}
                  <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold' }}>
                      <RichText text={qTitle} style={{ fontSize: '10.5pt', color: '#002147' }} />
                    </div>
                    {qDesc ? (
                      <div style={{ fontSize: '9.5pt', color: '#0f172a', lineHeight: '1.65', borderTop: '1px solid #bae6fd', paddingTop: '8px' }}>
                        <RichText text={qDesc} style={{ fontSize: '9.5pt', color: '#0f172a' }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: '9pt', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #bae6fd', paddingTop: '6px' }}>
                        No problem statement provided.
                      </div>
                    )}
                  </div>

                  {/* Read-Only Monaco Editor */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                    <Editor
                      height="200px"
                      language={codLang}
                      theme="vs-light"
                      value={ans.submittedCode || '// No code submitted'}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        automaticLayout: true
                      }}
                    />
                  </div>

                  {/* Testcases Breakdown Table */}
                  {Array.isArray(ans.testCaseResults) && ans.testCaseResults.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                        Testcase Execution Log:
                      </div>
                      <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                        <table className="cf-table" style={{ fontSize: '8pt' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                              <th>Testcase ID</th>
                              <th>Input</th>
                              <th>Expected Output</th>
                              <th>Actual Output</th>
                              <th>Status</th>
                              <th>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ans.testCaseResults.map((tc, tIdx) => {
                              const tcId = tc.testcaseId || tc.testCaseId || tc.id || tc._id || q?.testCases?.[tIdx]?.testcaseId || q?.testCases?.[tIdx]?.id || q?.testCases?.[tIdx]?._id || (20260101 + tIdx);
                              
                              const rawInput = tc.input ?? tc.sampleInput ?? q?.testCases?.[tIdx]?.input ?? q?.testCases?.[tIdx]?.sampleInput ?? '';
                              const rawExpected = tc.expectedOutput ?? tc.output ?? tc.sampleOutput ?? q?.testCases?.[tIdx]?.output ?? q?.testCases?.[tIdx]?.expectedOutput ?? '';
                              const rawActual = tc.actualOutput ?? tc.stdout ?? tc.userOutput ?? tc.output ?? '';

                              const formatTruncated = (val) => {
                                if (val === undefined || val === null || String(val).trim() === '') return '(empty)';
                                const cleanStr = String(val).replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
                                if (cleanStr.length > 18) {
                                  return cleanStr.substring(0, 18) + '...';
                                }
                                return cleanStr;
                              };

                              return (
                                <tr key={tIdx}>
                                  <td style={{ fontWeight: 'bold', color: '#002147', fontFamily: 'monospace' }}>#{tcId}</td>
                                  <td style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(rawInput || '(empty)')}>
                                    <code>{formatTruncated(rawInput)}</code>
                                  </td>
                                  <td style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(rawExpected || '(empty)')}>
                                    <code>{formatTruncated(rawExpected)}</code>
                                  </td>
                                  <td style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(rawActual || '(empty)')}>
                                    <code style={{ color: tc.status === 'Accepted' ? '#166534' : '#b91c1c' }}>{formatTruncated(rawActual)}</code>
                                  </td>
                                  <td>
                                    <span style={{ 
                                      fontWeight: 'bold',
                                      color: tc.status === 'Accepted' ? '#15803d' : '#b91c1c',
                                      backgroundColor: tc.status === 'Accepted' ? '#dcfce7' : '#fee2e2',
                                      padding: '1px 6px',
                                      borderRadius: '4px'
                                    }}>
                                      {tc.status}
                                    </span>
                                  </td>
                                  <td>{tc.scoredPoints ?? (tc.status === 'Accepted' ? tc.points : 0)} / {tc.points || 0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Resolution Form */}
            <form onSubmit={handleResolveObjection} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Resolution Decision: *
                  </label>
                  <select
                    value={adminObjectionModal.status}
                    onChange={e => setAdminObjectionModal(prev => ({ ...prev, status: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                  >
                    <option value="resolved">Resolved (Award / Update Credit)</option>
                    <option value="rejected">Rejected (Deny Grievance)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Revised Question Marks: <span style={{ color: '#1d4ed8', fontWeight: 'bold' }}>(Max: {adminObjectionModal.objection.questionPoints !== undefined ? adminObjectionModal.objection.questionPoints : '10'} pts)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={adminObjectionModal.objection.questionPoints !== undefined ? adminObjectionModal.objection.questionPoints : 100}
                    step="1"
                    value={adminObjectionModal.revisedMarks}
                    onChange={e => setAdminObjectionModal(prev => ({ ...prev, revisedMarks: Number(e.target.value || 0) }))}
                    disabled={adminObjectionModal.status === 'rejected'}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Committee Resolution Remarks / Technical Feedback: *
                </label>
                <textarea
                  rows="3"
                  required
                  value={adminObjectionModal.adminRemarks}
                  onChange={e => setAdminObjectionModal(prev => ({ ...prev, adminRemarks: e.target.value }))}
                  placeholder="State why the objection was accepted/rejected and any evaluation notes..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="cf-btn-secondary"
                  onClick={() => setAdminObjectionModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={adminObjectionModal.submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cf-btn-primary"
                  disabled={adminObjectionModal.submitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  {adminObjectionModal.submitting ? <Loader2 className="spinner" size={14} /> : <CheckCircle size={14} />}
                  <span>{adminObjectionModal.submitting ? 'Saving...' : 'Save Resolution'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
