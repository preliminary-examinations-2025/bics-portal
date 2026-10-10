import React from 'react';
import { ClipboardList, ShieldAlert, FileEdit, Plus, Loader2, Lock, Check, Upload, HelpCircle, GraduationCap, AlertTriangle, X } from 'lucide-react';
import RichText from '../../components/RichText';
import Editor from '@monaco-editor/react';
import { API_BASE } from '../../config';

export default function AdminTests({
  showModalAlert,
  showModalConfirm,
  systemConfig,
  adminMessage,
  adminError,
  adminTests = [],
  fetchExamSubmissions,
  fetchAdminTests,
  fetchStudentActiveTests,
  handleCreateTest,
  handleEditTest,
  handleDeleteTest,
  showTestCreator,
  setShowTestCreator,
  creatorStep,
  setCreatorStep,
  editingQuestionIdx,
  setEditingQuestionIdx,
  editingTestConfigId,
  setEditingTestConfigId,
  newExamTitle,
  setNewExamTitle,
  newExamMarks,
  setNewExamMarks,
  newExamInstructions,
  setNewExamInstructions,
  newExamDuration,
  setNewExamDuration,
  newExamStart,
  setNewExamStart,
  newExamEnd,
  setNewExamEnd,
  newExamQuestions,
  setNewExamQuestions,
  imageUploadingIdx,
  handleUploadQuestionImage,
  adminExamSubmissions = [],
  selectedExamSubmission,
  setSelectedExamSubmission,
  adminGradingCodingScore,
  setAdminGradingCodingScore,
  adminGradingFeedback,
  setAdminGradingFeedback,
  adminGradingAnswers,
  setAdminGradingAnswers,
  codingEvaluationResults,
  setCodingEvaluationResults,
  handleSaveEvaluation,
  setAdminReevalStatus,
  setAdminReevalResolutionFeedback,
  adminReevalStatus,
  adminReevalResolutionFeedback,
  adminActiveWebTabs = {},
  setAdminActiveWebTabs,
  runAdminCodeVerification,
  view
}) {
  const triggerAlert = (title, msg) => {
    if (showModalAlert) showModalAlert(title, msg);
    else alert(`${title}: ${msg}`);
  };

  const triggerConfirm = (title, msg, onConfirm) => {
    if (showModalConfirm) showModalConfirm(title, msg, onConfirm);
    else if (window.confirm(msg)) onConfirm();
  };
  return (
    <div>
              <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Exam &amp; Tests Manager</h2>
              {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
              {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

              {/* ADMIN - ONLINE TEST CREATOR & BUILDER */}
              <div className="cf-card">
                <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={18} style={{ color: '#3b82f6' }} />
                  <span>Online Test Configurations Manager</span>
                </div>
                
                {/* Active Test Configurations */}
                <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '10px' }}>Configured Examinations ({adminTests.length})</h4>
                {adminTests.length === 0 ? (
                  <div className="cf-alert cf-alert-info">No test configurations created yet.</div>
                ) : (
                  <div className="cf-table-container" style={{ marginBottom: '20px' }}>
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Exam Title</th>
                          <th>Duration</th>
                          <th>Access Window</th>
                          <th>Questions</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminTests.map((t, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 'bold' }}>{t.title}</td>
                            <td>{t.duration} mins</td>
                            <td style={{ fontSize: '8.5pt', color: '#555' }}>
                              {new Date(t.startDate).toLocaleString()} - <br />{new Date(t.endDate).toLocaleString()}
                            </td>
                            <td>{t.questions?.length || 0} items</td>
                            <td>
                              <div style={{ display: 'flex', gap: '5px' }}>
                                <button
                                  className="cf-btn-primary"
                                  style={{ padding: '3px 8px', fontSize: '8pt' }}
                                  onClick={() => {
                                    fetchExamSubmissions(t.id || t._id);
                                    setTimeout(() => {
                                      document.getElementById('admin-submissions-section')?.scrollIntoView({ behavior: 'smooth' });
                                    }, 100);
                                  }}
                                >
                                  Grades ({t.submissionsCount || 'View'})
                                </button>
                                <select
                                  title="Answer Sheet Verification State"
                                  value={t.verificationStatus || (t.answersReleased ? 'released' : 'not_released')}
                                  onChange={async (e) => {
                                    const newStatus = e.target.value;
                                    try {
                                      const res = await fetch(`${API_BASE}/admin/tests/set-verification-status/${t.id || t._id}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ status: newStatus })
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        fetchAdminTests();
                                      } else {
                                        triggerAlert("Verification Status Error", data.error || "Failed to update verification status.");
                                      }
                                    } catch (err) {
                                      triggerAlert("Network Error", "Unable to contact API server.");
                                    }
                                  }}
                                  style={{
                                    padding: '3px 6px',
                                    fontSize: '8pt',
                                    fontWeight: 'bold',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    backgroundColor: (t.verificationStatus === 'released' || (!t.verificationStatus && t.answersReleased)) ? '#dcfce7' : (t.verificationStatus === 'closed' ? '#f1f5f9' : '#fef3c7'),
                                    color: (t.verificationStatus === 'released' || (!t.verificationStatus && t.answersReleased)) ? '#15803d' : (t.verificationStatus === 'closed' ? '#475569' : '#b45309'),
                                    borderColor: (t.verificationStatus === 'released' || (!t.verificationStatus && t.answersReleased)) ? '#86efac' : (t.verificationStatus === 'closed' ? '#cbd5e1' : '#fcd34d'),
                                    outline: 'none'
                                  }}
                                >
                                  <option value="not_released" style={{ background: '#ffffff', color: '#b45309' }}>Sheets: Not Released</option>
                                  <option value="released" style={{ background: '#ffffff', color: '#15803d' }}>Sheets: Released</option>
                                  <option value="closed" style={{ background: '#ffffff', color: '#475569' }}>Sheets: Closed</option>
                                </select>
                                <button
                                  className="cf-btn-primary"
                                  style={{ 
                                    padding: '3px 8px', 
                                    fontSize: '8pt', 
                                    background: t.isPublished ? '#10b981' : '#64748b', 
                                    borderColor: t.isPublished ? '#10b981' : '#64748b',
                                    color: '#ffffff',
                                    cursor: 'pointer'
                                  }}
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`${API_BASE}/admin/tests/toggle-publish/${t.id || t._id}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' }
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        fetchAdminTests();
                                        fetchStudentActiveTests();
                                      } else {
                                        triggerAlert("Display Error", data.error || "Failed to toggle display status.");
                                      }
                                    } catch (e) {
                                      triggerAlert("Network Error", "Unable to contact API server.");
                                    }
                                  }}
                                >
                                  {t.isPublished ? 'Displayed' : 'Display Test'}
                                </button>
                                <button
                                  className="cf-btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '8pt' }}
                                  onClick={() => handleEditTest(t)}
                                >
                                  Edit Config
                                </button>
                                <button
                                  className="cf-btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '8pt', color: '#1d4ed8', borderColor: '#bfdbfe', backgroundColor: '#eff6ff', cursor: 'pointer' }}
                                  onClick={() => {
                                    triggerConfirm(
                                      "Bulk Re-evaluation",
                                      `Re-evaluate all candidate submissions for "${t.title}" based on current answer keys and bonus rules?`,
                                      async () => {
                                        try {
                                          const res = await fetch(`${API_BASE}/admin/tests/reevaluate-all/${t.id || t._id}`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' }
                                          });
                                          const data = await res.json();
                                          if (data.success) {
                                            triggerAlert("Re-evaluation Complete", data.message || `Bulk re-evaluated ${data.count} submissions successfully.`);
                                            fetchAdminTests();
                                            if (fetchExamSubmissions) fetchExamSubmissions(t.id || t._id);
                                          } else {
                                            triggerAlert("Re-evaluation Failed", data.error || "Failed to bulk re-evaluate submissions.");
                                          }
                                        } catch (e) {
                                          triggerAlert("Network Error", "Failed to connect to server.");
                                        }
                                      }
                                    );
                                  }}
                                >
                                  Re-evaluate All
                                </button>
                                <button
                                  className="cf-btn-secondary"
                                  style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '8pt', border: '1px solid #fca5a5' }}
                                  onClick={() => handleDeleteTest(t.id || t._id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  type="button"
                  className="cf-btn-primary"
                  onClick={() => {
                    if (showTestCreator) {
                      setEditingTestConfigId(null);
                      setNewExamTitle('');
                      setNewExamMarks(100);
                      setNewExamInstructions('');
                      setNewExamDuration(60);
                      setNewExamStart('');
                      setNewExamEnd('');
                      setNewExamQuestions([]);
                      setCreatorStep(1);
                      setEditingQuestionIdx(null);
                    }
                    setShowTestCreator(!showTestCreator);
                  }}
                  style={{ marginBottom: '15px' }}
                >
                  {showTestCreator 
                    ? (editingTestConfigId ? 'Cancel Edit Mode' : 'Hide Exam Builder Form') 
                    : (editingTestConfigId ? 'Edit Configuration Form' : '+ Create New Online Test Configuration')
                  }
                </button>

                {showTestCreator && (
                  <div id="admin-test-creator-section" style={{ borderTop: '1px solid #cbd5e1', paddingTop: '20px', marginTop: '20px' }}>
                    {/* Stepper Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', backgroundColor: '#f1f5f9', padding: '12px 20px', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', gap: '30px', alignItems: 'center', width: '100%', justifyContent: 'space-around' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: creatorStep === 1 ? '#3b82f6' : '#64748b', fontWeight: creatorStep === 1 ? 'bold' : 'normal' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: creatorStep === 1 ? '#3b82f6' : '#cbd5e1', color: '#fff', fontSize: '9pt' }}>1</span>
                          <span>Details &amp; Schedule</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: creatorStep === 2 ? '#3b82f6' : '#64748b', fontWeight: creatorStep === 2 ? 'bold' : 'normal' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: creatorStep === 2 ? '#3b82f6' : '#cbd5e1', color: '#fff', fontSize: '9pt' }}>2</span>
                          <span>Questions Config ({newExamQuestions.length})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: creatorStep === 3 ? '#3b82f6' : '#64748b', fontWeight: creatorStep === 3 ? 'bold' : 'normal' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: creatorStep === 3 ? '#3b82f6' : '#cbd5e1', color: '#fff', fontSize: '9pt' }}>3</span>
                          <span>Review &amp; Publish</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 1: Details & Schedule */}
                    {creatorStep === 1 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                          <div className="cf-input-group">
                            <label className="cf-label">Test Title</label>
                            <input
                              type="text"
                              className="cf-input"
                              value={newExamTitle}
                              onChange={e => setNewExamTitle(e.target.value)}
                              placeholder="e.g. BICS Mid Semester Coding Test"
                            />
                          </div>
                          <div className="cf-input-group">
                            <label className="cf-label">Time Duration (Minutes)</label>
                            <input
                              type="number"
                              className="cf-input"
                              value={newExamDuration}
                              onChange={e => setNewExamDuration(Number(e.target.value))}
                            />
                          </div>
                          <div className="cf-input-group">
                            <label className="cf-label">Total Marks</label>
                            <input
                              type="number"
                              className="cf-input"
                              value={newExamMarks}
                              onChange={e => setNewExamMarks(Number(e.target.value))}
                            />
                          </div>
                        </div>

                        <div className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
                          <div className="cf-input-group">
                            <label className="cf-label">Starting Access Time</label>
                            <input
                              type="datetime-local"
                              className="cf-input"
                              value={newExamStart}
                              onChange={e => setNewExamStart(e.target.value)}
                            />
                          </div>
                          <div className="cf-input-group">
                            <label className="cf-label">Ending Access Time</label>
                            <input
                              type="datetime-local"
                              className="cf-input"
                              value={newExamEnd}
                              onChange={e => setNewExamEnd(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="cf-input-group">
                          <label className="cf-label">Initial Candidate Instructions (Markdown Supported)</label>
                          <textarea
                            className="cf-input"
                            rows="4"
                            value={newExamInstructions}
                            onChange={e => setNewExamInstructions(e.target.value)}
                            placeholder="Write pre-test guidelines and code rules here..."
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                          <button type="button" className="cf-btn-secondary" onClick={() => setShowTestCreator(false)}>Cancel</button>
                          <button
                            type="button"
                            className="cf-btn-primary"
                            onClick={() => {
                              if (!newExamTitle || !newExamStart || !newExamEnd) {
                                alert("Please configure Test Title and Access Window dates before continuing.");
                                return;
                              }
                              setCreatorStep(2);
                            }}
                          >
                            Next: Configure Questions
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Questions Editor */}
                    {creatorStep === 2 && (
                      <div>
                        {editingQuestionIdx !== null ? (
                          /* Question Editor Sub-Workspace */
                          <div style={{ border: '1px solid #cbd5e1', padding: '20px', borderRadius: '6px', backgroundColor: '#ffffff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                              <h4 style={{ margin: 0, color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileEdit size={16} /> Edit Question Details (Q{editingQuestionIdx + 1})
                              </h4>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ margin: 0, padding: '4px 10px', fontSize: '8pt' }}
                                onClick={() => setEditingQuestionIdx(null)}
                              >
                                Back to Question Pool
                              </button>
                            </div>

                             <div className="cf-form-grid" style={{ gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr', gap: '15px', marginBottom: '15px' }}>
                              <div className="cf-input-group">
                                <label className="cf-label">Question Title</label>
                                <input
                                  type="text"
                                  className="cf-input"
                                  value={newExamQuestions[editingQuestionIdx]?.title || ''}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].title = e.target.value;
                                    setNewExamQuestions(updated);
                                  }}
                                  placeholder="Enter question task short summary"
                                />
                              </div>
                              <div className="cf-input-group">
                                <label className="cf-label">Section Name (Customizable)</label>
                                <input
                                  type="text"
                                  className="cf-input"
                                  value={newExamQuestions[editingQuestionIdx]?.section || ''}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].section = e.target.value;
                                    setNewExamQuestions(updated);
                                  }}
                                  placeholder="e.g. Section A: Theory"
                                />
                              </div>
                              <div className="cf-input-group">
                                <label className="cf-label">Question Type</label>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                  {[
                                    { value: 'mcq', label: 'MCQ' },
                                    { value: 'coding', label: 'C++ Coding' },
                                    { value: 'web', label: 'Web Coding' }
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => {
                                        const updated = [...newExamQuestions];
                                        const nextType = opt.value;
                                        updated[editingQuestionIdx].type = nextType;
                                        if (nextType === 'mcq') {
                                          updated[editingQuestionIdx].options = ['Option A', 'Option B', 'Option C', 'Option D'];
                                          updated[editingQuestionIdx].correctOptionIndex = 0;
                                        } else if (nextType === 'coding') {
                                          updated[editingQuestionIdx].description = 'Solve the problem.';
                                          updated[editingQuestionIdx].initialTemplate = '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}';
                                          updated[editingQuestionIdx].language = 'cpp';
                                          updated[editingQuestionIdx].testCases = [{ input: '', output: '', isSample: true, points: 10 }];
                                        } else if (nextType === 'web') {
                                          updated[editingQuestionIdx].description = 'Create a webpage.';
                                          updated[editingQuestionIdx].initialHtml = '<h1>Hello World</h1>';
                                          updated[editingQuestionIdx].initialCss = 'h1 {\n  color: red;\n}';
                                          updated[editingQuestionIdx].initialJs = '// Write script here';
                                        }
                                        setNewExamQuestions(updated);
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '7px 10px',
                                        fontSize: '8.5pt',
                                        fontWeight: 'bold',
                                        borderRadius: '4px',
                                        border: '1px solid',
                                        borderColor: newExamQuestions[editingQuestionIdx]?.type === opt.value ? '#3b5998' : '#cbd5e1',
                                        backgroundColor: newExamQuestions[editingQuestionIdx]?.type === opt.value ? '#eff6ff' : '#ffffff',
                                        color: newExamQuestions[editingQuestionIdx]?.type === opt.value ? '#3b5998' : '#64748b',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        textAlign: 'center'
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="cf-input-group">
                                <label className="cf-label">Points Allocation</label>
                                <input
                                  type="number"
                                  className="cf-input"
                                  value={newExamQuestions[editingQuestionIdx]?.points || 0}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].points = Number(e.target.value);
                                    setNewExamQuestions(updated);
                                  }}
                                />
                              </div>
                              <div className="cf-input-group" style={{ display: 'flex', alignItems: 'center', paddingTop: '18px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '8.5pt', fontWeight: 'bold', color: '#1d4ed8', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 10px', borderRadius: '4px', width: '100%' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!newExamQuestions[editingQuestionIdx]?.grantBonusToAll}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].grantBonusToAll = e.target.checked;
                                      updated[editingQuestionIdx].isBonus = e.target.checked;
                                      setNewExamQuestions(updated);
                                    }}
                                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                  />
                                  <span>Bonus Marks (Give Full Points to All)</span>
                                </label>
                              </div>
                            </div>

                            {/* Image Uploader */}
                            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                              <label className="cf-label">Reference Image (Optional)</label>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  id={`q-img-upload-wizard`}
                                  onChange={e => handleUploadQuestionImage(e, editingQuestionIdx)}
                                />
                                <label
                                  htmlFor={`q-img-upload-wizard`}
                                  className="cf-btn-secondary"
                                  style={{
                                    margin: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 14px',
                                    fontSize: '8.5pt',
                                    fontWeight: 'bold',
                                    color: '#3b5998',
                                    border: '1px dashed #3b5998',
                                    backgroundColor: '#f0f4ff',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseOver={e => {
                                    e.currentTarget.style.backgroundColor = '#e0e9ff';
                                  }}
                                  onMouseOut={e => {
                                    e.currentTarget.style.backgroundColor = '#f0f4ff';
                                  }}
                                >
                                  <Upload size={14} /> {imageUploadingIdx === editingQuestionIdx ? 'Uploading...' : 'Upload Image'}
                                </label>
                                <input
                                  type="text"
                                  className="cf-input"
                                  placeholder="Or paste direct image URL here"
                                  value={newExamQuestions[editingQuestionIdx]?.imageUrl || ''}
                                  onChange={e => {
                                    const updated = [...newExamQuestions];
                                    updated[editingQuestionIdx].imageUrl = e.target.value;
                                    setNewExamQuestions(updated);
                                  }}
                                />
                              </div>
                              {newExamQuestions[editingQuestionIdx]?.imageUrl && (
                                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <img
                                    src={newExamQuestions[editingQuestionIdx].imageUrl}
                                    alt="Wizard Preview"
                                    style={{ maxWidth: '100px', maxHeight: '60px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                  />
                                  <button
                                    type="button"
                                    className="cf-btn-secondary"
                                    style={{ padding: '2px 8px', fontSize: '8pt', color: '#ef4444', borderColor: '#ef4444' }}
                                    onClick={() => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].imageUrl = '';
                                      setNewExamQuestions(updated);
                                    }}
                                  >
                                    Remove Image
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* MCQ Sub-Form */}
                            {newExamQuestions[editingQuestionIdx]?.type === 'mcq' && (
                              <div style={{ marginTop: '15px', padding: '15px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                                <label className="cf-label" style={{ fontWeight: 'bold' }}>MCQ Options &amp; Correct Answer Key:</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
                                  {newExamQuestions[editingQuestionIdx]?.options.map((opt, oIdx) => (
                                    <div key={oIdx} className="cf-input-group">
                                      <label className="cf-label">Option {oIdx + 1}</label>
                                      <input
                                        type="text"
                                        className="cf-input"
                                        value={opt}
                                        onChange={e => {
                                          const updated = [...newExamQuestions];
                                          updated[editingQuestionIdx].options[oIdx] = e.target.value;
                                          setNewExamQuestions(updated);
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="cf-input-group" style={{ marginTop: '15px' }}>
                                  <label className="cf-label">Correct Option Index</label>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px', maxWidth: '400px' }}>
                                    {[0, 1, 2, 3].map((num) => (
                                      <button
                                        key={num}
                                        type="button"
                                        onClick={() => {
                                          const updated = [...newExamQuestions];
                                          updated[editingQuestionIdx].correctOptionIndex = num;
                                          setNewExamQuestions(updated);
                                        }}
                                        style={{
                                          flex: 1,
                                          padding: '6px 12px',
                                          fontSize: '8.5pt',
                                          fontWeight: 'bold',
                                          borderRadius: '4px',
                                          border: '1px solid',
                                          borderColor: newExamQuestions[editingQuestionIdx]?.correctOptionIndex === num ? '#10b981' : '#cbd5e1',
                                          backgroundColor: newExamQuestions[editingQuestionIdx]?.correctOptionIndex === num ? '#ecfdf5' : '#ffffff',
                                          color: newExamQuestions[editingQuestionIdx]?.correctOptionIndex === num ? '#10b981' : '#64748b',
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease',
                                          textAlign: 'center'
                                        }}
                                      >
                                        Option {num + 1}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* C++ Coding Sub-Form */}
                            {newExamQuestions[editingQuestionIdx]?.type === 'coding' && (
                              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div className="cf-input-group">
                                  <label className="cf-label">Problem Task Description (Markdown Guidelines)</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    value={newExamQuestions[editingQuestionIdx]?.description || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].description = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                    placeholder="Explain C++ coding rules, specifications, and stdin inputs format details..."
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Preloaded Code Editor Template</label>
                                  <textarea
                                    className="cf-input"
                                    rows="5"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialTemplate || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialTemplate = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>

                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <label className="cf-label" style={{ fontWeight: 'bold', margin: 0 }}>C++ Test Cases Configurations:</label>
                                    <button
                                      type="button"
                                      className="cf-btn-secondary"
                                      style={{ fontSize: '8pt', padding: '4px 10px', margin: 0 }}
                                      onClick={() => {
                                        const updated = [...newExamQuestions];
                                        updated[editingQuestionIdx].testCases = updated[editingQuestionIdx].testCases || [];
                                        updated[editingQuestionIdx].testCases.push({ input: '', output: '', isSample: true, points: 10 });
                                        setNewExamQuestions(updated);
                                      }}
                                    >
                                      + Add Test Case
                                    </button>
                                  </div>

                                  {(!newExamQuestions[editingQuestionIdx]?.testCases || newExamQuestions[editingQuestionIdx]?.testCases.length === 0) ? (
                                    <div style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic', padding: '15px', border: '1px dashed #cbd5e1', borderRadius: '4px', textAlign: 'center' }}>
                                      No test cases configured. At least one test case is required to compile and grade code.
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                      {newExamQuestions[editingQuestionIdx]?.testCases.map((tc, tcIdx) => (
                                        <div key={tcIdx} style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '12px', backgroundColor: '#f8fafc' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e293b' }}>
                                              Test Case 2026{String((editingQuestionIdx !== null && editingQuestionIdx !== undefined ? editingQuestionIdx : 0) + 1).padStart(2, '0')}{String(tcIdx + 1).padStart(2, '0')} {!tc.isSample && <span style={{ marginLeft: '6px', fontSize: '7.5pt', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Lock size={10} /> Hidden</span>}
                                            </span>
                                            <button
                                              type="button"
                                              className="cf-btn-secondary"
                                              style={{ fontSize: '8pt', padding: '2px 8px', color: '#dc2626', borderColor: '#fca5a5', margin: 0 }}
                                              onClick={() => {
                                                const updated = [...newExamQuestions];
                                                updated[editingQuestionIdx].testCases.splice(tcIdx, 1);
                                                setNewExamQuestions(updated);
                                              }}
                                            >
                                              Delete Case
                                            </button>
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                                            <div className="cf-input-group">
                                              <label className="cf-label" style={{ fontSize: '7.5pt' }}>Input (stdin)</label>
                                              <textarea
                                                className="cf-input"
                                                rows="2"
                                                style={{ fontFamily: 'monospace', fontSize: '8.5pt' }}
                                                value={tc.input || ''}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].input = e.target.value;
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                            </div>
                                            <div className="cf-input-group">
                                              <label className="cf-label" style={{ fontSize: '7.5pt' }}>Expected Output (stdout)</label>
                                              <textarea
                                                className="cf-input"
                                                rows="2"
                                                style={{ fontFamily: 'monospace', fontSize: '8.5pt' }}
                                                value={tc.output || ''}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].output = e.target.value;
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8pt', color: '#475569', cursor: 'pointer' }}>
                                              <input
                                                type="checkbox"
                                                checked={!!tc.isSample}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].isSample = e.target.checked;
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                              Is Sample Case? (Visible to student running code)
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <label className="cf-label" style={{ fontSize: '8pt', margin: 0 }}>Points:</label>
                                              <input
                                                type="number"
                                                className="cf-input"
                                                style={{ width: '60px', padding: '4px', fontSize: '8.5pt', height: '24px' }}
                                                value={tc.points || 10}
                                                onChange={e => {
                                                  const updated = [...newExamQuestions];
                                                  updated[editingQuestionIdx].testCases[tcIdx].points = Number(e.target.value);
                                                  setNewExamQuestions(updated);
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* HTML/CSS/JS Web Coding Sub-Form */}
                            {newExamQuestions[editingQuestionIdx]?.type === 'web' && (
                              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div className="cf-input-group">
                                  <label className="cf-label">Web Problem Description &amp; Requirements</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    value={newExamQuestions[editingQuestionIdx]?.description || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].description = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                    placeholder="Explain page formatting, DOM elements requirements, styling specifications..."
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Initial HTML Template Code</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialHtml || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialHtml = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Initial CSS Template Code</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialCss || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialCss = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                                <div className="cf-input-group">
                                  <label className="cf-label">Initial JavaScript Template Code</label>
                                  <textarea
                                    className="cf-input"
                                    rows="4"
                                    style={{ fontFamily: 'monospace', fontSize: '9pt' }}
                                    value={newExamQuestions[editingQuestionIdx]?.initialJs || ''}
                                    onChange={e => {
                                      const updated = [...newExamQuestions];
                                      updated[editingQuestionIdx].initialJs = e.target.value;
                                      setNewExamQuestions(updated);
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                              <button
                                type="button"
                                className="cf-btn-primary"
                                onClick={() => setEditingQuestionIdx(null)}
                              >
                                Save &amp; Return to List
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Questions List View (Step 2 Main Panel) */
                          <div style={{ border: '1px solid #cbd5e1', padding: '18px', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                              <h4 style={{ margin: 0, color: '#002147', fontWeight: 'bold' }}>Questions Pool Configurator</h4>
                              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold' }}>
                                Total Points: {newExamQuestions.reduce((acc, curr) => acc + (curr.points || 0), 0)} / {newExamMarks}
                              </div>
                            </div>

                            {newExamQuestions.length === 0 ? (
                              <div style={{ border: '1px dashed #cbd5e1', padding: '30px 15px', borderRadius: '6px', textAlign: 'center', backgroundColor: '#fff', marginBottom: '20px' }}>
                                <HelpCircle size={32} style={{ color: '#94a3b8', margin: '0 auto 10px auto' }} />
                                <p style={{ fontSize: '9.5pt', color: '#64748b', margin: 0 }}>No questions added to this test configuration yet.</p>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                                {newExamQuestions.map((q, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 15px', backgroundColor: '#ffffff' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '8pt', backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                                          {q.type.toUpperCase()}
                                        </span>
                                        <strong style={{ fontSize: '9.5pt', color: '#1e293b' }}>Q{idx + 1}: {q.title}</strong>
                                      </div>
                                      <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
                                        Value: {q.points} points
                                        {q.type === 'coding' && ` | ${q.testCases?.length || 0} C++ testcases`}
                                        {q.type === 'web' && ` | HTML/CSS/JS (Manual Grade)`}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      <button
                                        type="button"
                                        className="cf-btn-primary"
                                        style={{ padding: '4px 10px', fontSize: '8pt', margin: 0 }}
                                        onClick={() => setEditingQuestionIdx(idx)}
                                      >
                                        Configure
                                      </button>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '4px 10px', fontSize: '8pt', color: '#dc2626', borderColor: '#fca5a5', margin: 0 }}
                                        onClick={() => {
                                          setNewExamQuestions(prev => prev.filter((_, qIdx) => qIdx !== idx));
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Question Creator Triggers */}
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }}
                                onClick={() => {
                                  const newQ = {
                                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                    type: 'mcq',
                                    title: 'New MCQ Question',
                                    points: 10,
                                    options: ['Option A', 'Option B', 'Option C', 'Option D'],
                                    correctOptionIndex: 0
                                  };
                                  setNewExamQuestions([...newExamQuestions, newQ]);
                                  setEditingQuestionIdx(newExamQuestions.length);
                                }}
                              >
                                <Plus size={14} /> MCQ Question
                              </button>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }}
                                onClick={() => {
                                  const newQ = {
                                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                    type: 'coding',
                                    title: 'C++ Coding Question',
                                    points: 20,
                                    description: 'Write a C++ program to solve...',
                                    initialTemplate: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Code here\n    return 0;\n}',
                                    language: 'cpp',
                                    testCases: [{ input: '', output: '', isSample: true, points: 10 }]
                                  };
                                  setNewExamQuestions([...newExamQuestions, newQ]);
                                  setEditingQuestionIdx(newExamQuestions.length);
                                }}
                              >
                                <Plus size={14} /> C++ Coding Question
                              </button>
                              <button
                                type="button"
                                className="cf-btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }}
                                onClick={() => {
                                  const newQ = {
                                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                    type: 'web',
                                    title: 'Web Design Question',
                                    points: 20,
                                    description: 'Build a responsive card component with HTML and CSS.',
                                    initialHtml: '<div class="card">\n  <h2>Title</h2>\n</div>',
                                    initialCss: '.card {\n  padding: 20px;\n  background: #f1f5f9;\n}',
                                    initialJs: 'console.log("Web card loaded");'
                                  };
                                  setNewExamQuestions([...newExamQuestions, newQ]);
                                  setEditingQuestionIdx(newExamQuestions.length);
                                }}
                              >
                                <Plus size={14} /> HTML/CSS/JS Question
                              </button>
                            </div>

                            {/* Step navigation */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '25px', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                              <button type="button" className="cf-btn-secondary" onClick={() => setCreatorStep(1)}>Back: Details</button>
                              <button
                                type="button"
                                className="cf-btn-primary"
                                onClick={() => {
                                  if (newExamQuestions.length === 0) {
                                    alert("Please configure at least 1 question for the practice test.");
                                    return;
                                  }
                                  setCreatorStep(3);
                                }}
                              >
                                Next: Review Configuration
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 3: Review & Publish */}
                    {creatorStep === 3 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ border: '1px solid #cbd5e1', padding: '18px', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                          <h4 style={{ color: '#002147', fontWeight: 'bold', margin: '0 0 15px 0' }}>Review Test Configuration</h4>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '9.5pt', marginBottom: '20px' }}>
                            <div>
                              <span style={{ color: '#64748b' }}>Test Title:</span> <strong style={{ color: '#002147' }}>{newExamTitle}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Scheduled Duration:</span> <strong>{newExamDuration} mins</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Configured Marks cap:</span> <strong>{newExamMarks} Marks</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Access Window:</span> <span style={{ fontSize: '8.5pt' }}>{new Date(newExamStart).toLocaleString()} - {new Date(newExamEnd).toLocaleString()}</span>
                            </div>
                          </div>

                          <h5 style={{ fontSize: '9pt', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Questions List ({newExamQuestions.length} items):</h5>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                            {newExamQuestions.map((q, idx) => (
                              <div key={idx} style={{ fontSize: '9pt', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                                <span>
                                  Q{idx + 1}: <strong>{q.title}</strong> ({q.type.toUpperCase()})
                                </span>
                                <strong>{q.points} points</strong>
                              </div>
                            ))}
                          </div>
                        </div>

                        <form onSubmit={handleCreateTest} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '15px' }}>
                          <button type="button" className="cf-btn-secondary" onClick={() => setCreatorStep(2)}>Back: Configure Questions</button>
                          <button type="submit" className="cf-btn-primary">Save &amp; Publish Test</button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ADMIN - CANDIDATE SUBMISSIONS EVALUATION CONSOLE */}
              <div className="cf-card" id="admin-submissions-section">
                <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <GraduationCap size={18} style={{ color: '#10b981' }} />
                  <span>Exam Submissions Evaluation Console</span>
                  {(Array.isArray(adminExamSubmissions) && adminExamSubmissions.length > 0) && (
                    <button
                      type="button"
                      className="cf-btn-secondary"
                      style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '8pt', background: '#ffffff', color: '#002147', borderColor: '#cbd5e1', cursor: 'pointer' }}
                      onClick={() => {
                        const firstSub = (adminExamSubmissions || [])[0];
                        const testId = firstSub?.testId;
                        if (testId) {
                          fetchExamSubmissions(testId);
                        }
                      }}
                    >
                      Refresh Submissions
                    </button>
                  )}
                </div>
                
                {(!Array.isArray(adminExamSubmissions) || adminExamSubmissions.length === 0) ? (
                  <div className="cf-alert cf-alert-info">
                    Select an exam from the configured list above to view candidate answers and sheets.
                  </div>
                ) : (
                  <div className="cf-table-container">
                    <table className="cf-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Candidate Name</th>
                          <th>Started</th>
                          <th>Submitted</th>
                          <th>Malpractice Warnings</th>
                          <th>Status</th>
                          <th>Marks</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(adminExamSubmissions) ? adminExamSubmissions : []).map((s, idx) => (
                          <tr key={idx}>
                            <td>{s.studentId}</td>
                            <td style={{ fontWeight: 'bold' }}>{s.candidateName}</td>
                            <td style={{ fontSize: '8pt', color: '#555' }}>
                              {new Date(s.startedAt).toLocaleTimeString()}
                            </td>
                            <td style={{ fontSize: '8pt', color: '#555' }}>
                              {s.submittedAt ? new Date(s.submittedAt).toLocaleTimeString() : (s.status === 'evaluated' ? 'Graded' : (s.status === 'submitted' ? 'Submitted' : 'In Progress'))}
                            </td>
                            <td>
                              <span style={{
                                color: (Number(s.proctoringLog?.fullscreenExits || 0) + Number(s.proctoringLog?.tabSwitches || 0)) > 1 ? '#be123c' : '#475569',
                                fontWeight: 'bold'
                              }}>
                                Exits: {s.proctoringLog?.fullscreenExits || 0} • Tabs: {s.proctoringLog?.tabSwitches || 0}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${
                                s.status === 'evaluated' ? 'status-eligible' :
                                s.status === 'submitted' ? 'status-pending' :
                                s.status === 'auto-submitted' ? 'status-pending' : 'status-ineligible'
                              }`} style={{ fontSize: '7.5pt', padding: '1px 5px' }}>
                                {s.status?.toUpperCase() || 'STARTED'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 'bold' }}>
                              {(() => {
                                if (s.answers && Array.isArray(s.answers) && s.answers.length > 0) {
                                  return s.answers.reduce((sum, a, idx) => {
                                    const resObj = (s.objections || []).find(o => 
                                      (o.status === 'resolved' || o.status === 'resolved_accepted') &&
                                      (o.questionIndex === idx || (o.questionId && String(o.questionId) === String(a.questionId)))
                                    );
                                    return sum + ((resObj && resObj.resolvedMarks !== undefined && resObj.resolvedMarks !== null) ? Number(resObj.resolvedMarks) : Number(a.score || 0));
                                  }, 0);
                                }
                                return s.totalScore !== undefined && s.totalScore !== null ? Number(s.totalScore) : (s.evaluation?.totalScore !== undefined && s.evaluation?.totalScore !== null ? Number(s.evaluation.totalScore) : (s.status === 'evaluated' ? (Number(s.evaluation?.mcqScore || 0) + Number(s.evaluation?.codingScore || 0)) : `${s.evaluation?.mcqScore || 0} (MCQ)`));
                              })()}
                            </td>
                            <td>
                              <button
                                className="cf-btn-primary"
                                style={{ padding: '3px 8px', fontSize: '8pt' }}
                                onClick={() => {
                                  setSelectedExamSubmission(s);
                                  const relatedTest = adminTests.find(t => (t.id || t._id) === s.testId);
                                  const initialScores = {};
                                  s.answers?.forEach(ans => {
                                    if (ans.isManuallyGraded && ans.score !== undefined && ans.score !== null) {
                                      initialScores[ans.questionId] = Number(ans.score);
                                    } else {
                                      const q = relatedTest?.questions?.find(quest => quest.id === ans.questionId);
                                      if (q) {
                                        if (q.grantBonusToAll || q.isBonus) {
                                          initialScores[ans.questionId] = Number(q.points || 0);
                                        } else if (ans.type === 'mcq' && ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null && Number(q.correctOptionIndex) === Number(ans.selectedOptionIndex)) {
                                          initialScores[ans.questionId] = Number(q.points || 0);
                                        } else if (ans.score !== undefined && ans.score !== null && ans.score > 0) {
                                          initialScores[ans.questionId] = Number(ans.score);
                                        } else {
                                          initialScores[ans.questionId] = 0;
                                        }
                                      } else {
                                        initialScores[ans.questionId] = Number(ans.score || 0);
                                      }
                                    }
                                  });
                                  setAdminGradingAnswers(initialScores);
                                  setAdminGradingCodingScore(s.evaluation?.codingScore || 0);
                                  setAdminGradingFeedback(s.evaluation?.feedback || '');
                                  setAdminReevalStatus(s.reevaluation?.status || 'pending');
                                  setAdminReevalResolutionFeedback(s.reevaluation?.resolutionFeedback || '');
                                }}
                              >
                                {s.status === 'evaluated' ? 'Re-Grade' : 'Evaluate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DETAILED CANDIDATE EVALUATION MODAL */}
              {selectedExamSubmission && (() => {
                const testConfig = adminTests.find(t => (t.id || t._id) === selectedExamSubmission.testId);
                const rawTotalScore = Object.values(adminGradingAnswers).reduce((sum, v) => sum + (Number(v) || 0), 0);
                const maxTestMarks = testConfig?.marks || selectedExamSubmission.totalScore || selectedExamSubmission.evaluation?.totalScore || 100;
                const currentTotalScore = Math.min(rawTotalScore, maxTestMarks);

                return (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '20px' }}>
                    <div className="cf-card" style={{ width: '90%', maxWidth: '950px', maxHeight: '92vh', overflowY: 'auto', padding: '24px', border: '1px solid #b9c9fe', backgroundColor: '#fff', borderRadius: '8px' }}>
                      
                      {/* Modal Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
                        <div>
                          <h3 style={{ fontSize: '13pt', color: '#002147', margin: 0, fontWeight: 'bold' }}>
                            Candidate Evaluation &amp; Grade Sheet
                          </h3>
                          <div style={{ fontSize: '9.5pt', color: '#475569', marginTop: '3px' }}>
                            Student: <strong>{selectedExamSubmission.candidateName}</strong> ({selectedExamSubmission.studentId})
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '10pt' }}>
                              Total: {currentTotalScore} / {maxTestMarks} pts
                            </span>
                            {rawTotalScore > maxTestMarks && (
                              <span style={{ fontSize: '7.5pt', color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '4px', marginTop: '4px' }}>
                                Notice: Sum of questions ({rawTotalScore} pts) exceeds max test marks ({maxTestMarks} pts). Final score will be capped at {maxTestMarks} pts.
                              </span>
                            )}
                          </div>
                          <button className="cf-btn-secondary" style={{ padding: '4px 12px', fontSize: '9pt', cursor: 'pointer' }} onClick={() => setSelectedExamSubmission(null)}>
                            Close
                          </button>
                        </div>
                      </div>

                      {/* Proctoring & Test Info Banner */}
                      <div className="cf-alert cf-alert-info" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px', alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>Test Title:</strong> {selectedExamSubmission.testTitle || testConfig?.title}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertTriangle size={15} style={{ color: (Number(selectedExamSubmission.proctoringLog?.fullscreenExits || 0) + Number(selectedExamSubmission.proctoringLog?.tabSwitches || 0)) > 1 ? '#be123c' : '#d97706' }} />
                          <span>Fullscreen Exits: <strong>{selectedExamSubmission.proctoringLog?.fullscreenExits || 0}</strong> • Tab Switches: <strong>{selectedExamSubmission.proctoringLog?.tabSwitches || 0}</strong></span>
                        </span>
                      </div>

                      {/* Answer Sheets List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '25px' }}>
                        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', borderBottom: '2px solid #3b5998', paddingBottom: '6px', margin: 0 }}>
                          Itemized Question Evaluation ({selectedExamSubmission.answers?.length || 0} Questions)
                        </h4>

                        {selectedExamSubmission.answers?.map((ans, idx) => {
                          const questionConfig = testConfig?.questions?.[idx] || testConfig?.questions?.find(q => q.id === ans.questionId);
                          const maxPts = Number(questionConfig?.points || 0);
                          const isBonusQuestion = Boolean(questionConfig?.grantBonusToAll || questionConfig?.isBonus);

                          let calculatedAutoScore = 0;
                          if (isBonusQuestion) {
                            calculatedAutoScore = maxPts;
                          } else if (ans.type === 'mcq' && questionConfig) {
                            if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null && Number(questionConfig.correctOptionIndex) === Number(ans.selectedOptionIndex)) {
                              calculatedAutoScore = maxPts;
                            } else {
                              calculatedAutoScore = 0;
                            }
                          } else if (ans.type === 'coding' && questionConfig) {
                            if (ans.testCaseResults && ans.testCaseResults.length > 0) {
                              calculatedAutoScore = ans.testCaseResults.reduce((sum, tc) => {
                                const pts = Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' ? (tc.points || 0) : 0));
                                return sum + pts;
                              }, 0);
                            } else {
                              calculatedAutoScore = Number(ans.score || 0);
                            }
                          } else {
                            calculatedAutoScore = Number(ans.score || 0);
                          }
                          calculatedAutoScore = Math.max(0, Math.min(calculatedAutoScore, maxPts));

                          return (
                            <div key={idx} style={{ padding: '16px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                <h5 style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002147', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>Question {idx + 1}: {ans.type?.toUpperCase()}</span>
                                  {isBonusQuestion && (
                                    <span style={{ fontSize: '7.5pt', backgroundColor: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                      BONUS QUESTION (+{maxPts} pts)
                                    </span>
                                  )}
                                </h5>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '8pt', backgroundColor: calculatedAutoScore > 0 ? '#dcfce7' : '#f1f5f9', color: calculatedAutoScore > 0 ? '#15803d' : '#475569', border: `1px solid ${calculatedAutoScore > 0 ? '#86efac' : '#cbd5e1'}`, padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                    Auto Grade: {calculatedAutoScore} / {maxPts} pts
                                  </span>
                                  <span style={{ fontSize: '8.5pt', backgroundColor: '#e2e8f0', color: '#475569', padding: '2px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                    Max Points: {maxPts}
                                  </span>
                                </div>
                              </div>

                              {/* Question Title & Description */}
                              <RichText
                                text={questionConfig?.title || "No question title available"}
                                style={{ fontSize: '9.5pt', color: '#333', fontWeight: 'bold', marginBottom: '8px' }}
                              />

                              {questionConfig?.description && (
                                <RichText
                                  text={questionConfig.description}
                                  style={{ fontSize: '9pt', color: '#475569', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '4px', marginBottom: '10px', fontFamily: 'sans-serif', lineHeight: '1.5' }}
                                />
                              )}

                              {/* Question Image */}
                              {questionConfig?.imageUrl && (
                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', backgroundColor: '#fff', textAlign: 'center', marginBottom: '10px' }}>
                                  <img
                                    src={questionConfig.imageUrl}
                                    alt="Question Diagram"
                                    style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }}
                                  />
                                </div>
                              )}

                              {/* MCQ Answers Display */}
                              {ans.type === 'mcq' && questionConfig && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                  {questionConfig.options?.map((opt, optIdx) => {
                                    const isCandidateSelect = Number(ans.selectedOptionIndex) === optIdx;
                                    const isCorrectKey = Number(questionConfig.correctOptionIndex) === optIdx;
                                    
                                    let borderStyle = '1px solid #cbd5e1';
                                    let bgStyle = '#fff';
                                    let badgeText = '';

                                    if (isCorrectKey) {
                                      borderStyle = '2px solid #10b981';
                                      bgStyle = '#ecfdf5';
                                      badgeText = 'Correct Answer';
                                    } else if (isCandidateSelect) {
                                      borderStyle = '2px solid #ef4444';
                                      bgStyle = '#fef2f2';
                                      badgeText = 'Candidate Choice (Incorrect)';
                                    }

                                    if (isCorrectKey && isCandidateSelect) {
                                      badgeText = 'Candidate Choice (Correct)';
                                    }

                                    return (
                                      <div
                                        key={optIdx}
                                        style={{
                                          padding: '10px 12px',
                                          borderRadius: '4px',
                                          border: borderStyle,
                                          backgroundColor: bgStyle,
                                          fontSize: '9pt',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center'
                                        }}
                                      >
                                        <span>Option {optIdx + 1}: {opt}</span>
                                        {badgeText && (
                                          <span style={{ fontSize: '7.5pt', fontWeight: 'bold', color: isCorrectKey ? '#047857' : '#b91c1c' }}>
                                            {badgeText}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Itemized Score Input for MCQ */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Award Question Score:</span>
                                    <input
                                      type="number"
                                      className="cf-input"
                                      style={{ width: '80px', padding: '4px 8px', fontWeight: 'bold', color: '#002147' }}
                                      min={0}
                                      max={maxPts}
                                      value={adminGradingAnswers[ans.questionId] ?? 0}
                                      onChange={(e) => {
                                        const val = Math.max(0, Math.min(Number(e.target.value || 0), maxPts));
                                        setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: val }));
                                      }}
                                    />
                                    <span style={{ fontSize: '8pt', color: '#64748b' }}>/ {maxPts} points</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '2px 8px', fontSize: '7.5pt', margin: 0 }}
                                        onClick={() => setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: calculatedAutoScore }))}
                                      >
                                        Reset Auto ({calculatedAutoScore} pts)
                                      </button>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '2px 8px', fontSize: '7.5pt', margin: 0, color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}
                                        onClick={() => setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: maxPts }))}
                                      >
                                        Full Points ({maxPts} pts)
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Coding Answers Display */}
                              {ans.type === 'coding' && (
                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <span className="cf-label" style={{ display: 'block', fontWeight: 'bold', fontSize: '9pt' }}>
                                    Candidate Submitted Source Code:
                                  </span>
                                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                    <Editor
                                      height="240px"
                                      language={ans.selectedLanguage || 'cpp'}
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

                                  {/* Autograder Verification Status */}
                                  <div style={{ marginTop: '10px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                      <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Autograder Verification Status:</span>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '2px 8px', fontSize: '8pt', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                        onClick={() => runAdminCodeVerification(ans.questionId, ans.submittedCode, questionConfig?.testCases)}
                                        disabled={codingEvaluationResults[ans.questionId]?.isRunning}
                                      >
                                        {codingEvaluationResults[ans.questionId]?.isRunning ? (
                                          <>
                                            <Loader2 className="spinner" size={10} style={{ width: '10px', height: '10px' }} /> Re-running...
                                          </>
                                        ) : (
                                          'Run Compiler Test Cases'
                                        )}
                                      </button>
                                    </div>

                                    {codingEvaluationResults[ans.questionId]?.isRunning && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '8.5pt', color: '#64748b', padding: '5px 0' }}>
                                        <Loader2 className="spinner" size={14} style={{ color: '#3b5998', width: '14px', height: '14px' }} />
                                        <span>Compiling source code and executing test cases on host server...</span>
                                      </div>
                                    )}

                                    {!codingEvaluationResults[ans.questionId]?.isRunning && codingEvaluationResults[ans.questionId]?.compileError && (
                                      <div style={{ borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '2px', fontSize: '8.5pt', fontFamily: 'monospace', color: '#b91c1c', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                        <strong>Compilation Error:</strong><br />
                                        {codingEvaluationResults[ans.questionId].compileError}
                                      </div>
                                    )}

                                    {!codingEvaluationResults[ans.questionId]?.isRunning && codingEvaluationResults[ans.questionId]?.results && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {codingEvaluationResults[ans.questionId].results.map((res, rIdx) => {
                                          const tcId = questionConfig?.testCases?.[rIdx]?._id || questionConfig?.testCases?.[rIdx]?.id || (20260101 + rIdx);
                                          const statusLower = String(res.status || '').toLowerCase();
                                          const isPassed = res.passed === true || statusLower === 'accepted' || statusLower === 'passed' || statusLower.includes('accept');
                                          const rawInp = res.input ?? res.sampleInput ?? questionConfig?.testCases?.[rIdx]?.input ?? questionConfig?.testCases?.[rIdx]?.sampleInput ?? '';
                                          const rawExp = res.expectedOutput ?? res.output ?? res.sampleOutput ?? questionConfig?.testCases?.[rIdx]?.output ?? questionConfig?.testCases?.[rIdx]?.expectedOutput ?? '';
                                          const rawAct = (res.actualOutput !== undefined && res.actualOutput !== null && res.actualOutput !== '')
                                            ? res.actualOutput
                                            : ((res.stdout !== undefined && res.stdout !== null && res.stdout !== '')
                                                ? res.stdout
                                                : (res.userOutput || (isPassed ? (rawExp || '(matched expected)') : '')));

                                          const fmt = (v) => {
                                            if (v === undefined || v === null || String(v).trim() === '') return '(empty)';
                                            const str = String(v).replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
                                            return str.length > 30 ? str.substring(0, 30) + '...' : str;
                                          };

                                          return (
                                            <div key={rIdx} style={{ fontSize: '8.5pt', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                              <div style={{
                                                padding: '6px 10px',
                                                backgroundColor: isPassed ? '#f0fdf4' : '#fef2f2',
                                                borderBottom: '1px solid #cbd5e1',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                fontWeight: 'bold'
                                              }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isPassed ? '#166534' : '#991b1b' }}>
                                                  {isPassed ? <Check size={14} /> : <X size={14} />}
                                                  <span>Testcase #{tcId} ({questionConfig?.testCases?.[rIdx]?.isSample ? 'Sample' : 'Hidden'}): {res.status}</span>
                                                </span>
                                                <span style={{ fontSize: '8pt', color: '#64748b' }}>Points: {questionConfig?.testCases?.[rIdx]?.points || 0}</span>
                                              </div>
                                              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '8pt', color: '#475569', fontFamily: 'monospace' }}>
                                                <div><strong>Input:</strong> <code title={String(rawInp || '(empty)')}>{fmt(rawInp)}</code></div>
                                                <div><strong>Expected Output:</strong> <code title={String(rawExp || '(empty)')}>{fmt(rawExp)}</code></div>
                                                <div><strong>Candidate Output:</strong> <code title={String(rawAct || '(empty)')} style={{ color: isPassed ? '#166534' : '#991b1b' }}>{fmt(rawAct)}</code></div>
                                                {res.stderr && <div style={{ color: '#b91c1c' }}><strong>Stderr:</strong> <code>{fmt(res.stderr)}</code></div>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {!codingEvaluationResults[ans.questionId] && (
                                      <span style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic' }}>Autograder is ready. Click run or wait for background verification.</span>
                                    )}
                                  </div>

                                  {/* Itemized Score Input for Coding */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Award Question Score:</span>
                                    <input
                                      type="number"
                                      className="cf-input"
                                      style={{ width: '80px', padding: '4px 8px', fontWeight: 'bold', color: '#002147' }}
                                      min={0}
                                      max={maxPts}
                                      value={adminGradingAnswers[ans.questionId] ?? 0}
                                      onChange={(e) => {
                                        const val = Math.max(0, Math.min(Number(e.target.value || 0), maxPts));
                                        setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: val }));
                                      }}
                                    />
                                    <span style={{ fontSize: '8pt', color: '#64748b' }}>/ {maxPts} points</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '2px 8px', fontSize: '7.5pt', margin: 0 }}
                                        onClick={() => setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: calculatedAutoScore }))}
                                      >
                                        Reset Auto ({calculatedAutoScore} pts)
                                      </button>
                                      <button
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{ padding: '2px 8px', fontSize: '7.5pt', margin: 0, color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}
                                        onClick={() => setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: maxPts }))}
                                      >
                                        Full Points ({maxPts} pts)
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Web Workspace Submitted Answers */}
                              {ans.type === 'web' && (
                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <span className="cf-label" style={{ display: 'block', fontWeight: 'bold', fontSize: '9pt' }}>
                                    Candidate Submitted Web Page (HTML/CSS/JS):
                                  </span>
                                  
                                  {/* Tab Switchers */}
                                  <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                    {['html', 'css', 'js', 'preview'].map(tab => (
                                      <button
                                        key={tab}
                                        type="button"
                                        className="cf-btn-secondary"
                                        style={{
                                          padding: '3px 10px',
                                          fontSize: '8pt',
                                          margin: 0,
                                          backgroundColor: (adminActiveWebTabs[ans.questionId] || 'preview') === tab ? '#e2e8f0' : '#ffffff',
                                          fontWeight: (adminActiveWebTabs[ans.questionId] || 'preview') === tab ? 'bold' : 'normal'
                                        }}
                                        onClick={() => setAdminActiveWebTabs(prev => ({ ...prev, [ans.questionId]: tab }))}
                                      >
                                        {tab.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Tab Contents */}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'html' && (
                                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                      {ans.submittedHtml || '<!-- No HTML submitted -->'}
                                    </pre>
                                  )}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'css' && (
                                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                      {ans.submittedCss || '/* No CSS submitted */'}
                                    </pre>
                                  )}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'js' && (
                                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace', fontSize: '8.5pt', padding: '12px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                                      {ans.submittedJs || '// No JS submitted'}
                                    </pre>
                                  )}
                                  {(adminActiveWebTabs[ans.questionId] || 'preview') === 'preview' && (
                                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                      <iframe
                                        title="Web Sandbox Grading Preview"
                                        srcDoc={`
                                          <!DOCTYPE html>
                                          <html>
                                            <head>
                                              <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
                                              <base href="https://invalid-sandbox-origin.invalid/">
                                              <style>
                                                html, body {
                                                  margin: 0;
                                                  padding: 10px;
                                                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                                  word-wrap: break-word;
                                                  word-break: break-word;
                                                  overflow-x: hidden;
                                                  box-sizing: border-box;
                                                }
                                                *, *:before, *:after {
                                                  box-sizing: inherit;
                                                }
                                                img, video, iframe, canvas {
                                                  max-width: 100%;
                                                  height: auto;
                                                  display: block;
                                                }
                                                pre, code {
                                                  white-space: pre-wrap;
                                                  word-break: break-all;
                                                }
                                              </style>
                                              <style>${ans.submittedCss || ''}</style>
                                            </head>
                                            <body>
                                              ${ans.submittedHtml || ''}
                                              <script>${ans.submittedJs || ''}</script>
                                            </body>
                                          </html>
                                        `}
                                        sandbox="allow-scripts"
                                        style={{ width: '100%', height: '310px', border: 'none', backgroundColor: '#ffffff' }}
                                      />
                                    </div>
                                  )}

                                  {/* Itemized Score Input for Web */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147' }}>Award Question Score:</span>
                                    <input
                                      type="number"
                                      className="cf-input"
                                      style={{ width: '80px', padding: '4px 8px' }}
                                      min={0}
                                      max={maxPts}
                                      value={adminGradingAnswers[ans.questionId] ?? 0}
                                      onChange={(e) => {
                                        const val = Math.max(0, Math.min(Number(e.target.value || 0), maxPts));
                                        setAdminGradingAnswers(prev => ({ ...prev, [ans.questionId]: val }));
                                      }}
                                    />
                                    <span style={{ fontSize: '8pt', color: '#64748b' }}>/ {maxPts} points</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                    {/* Grading Form */}
                    <form onSubmit={handleSaveEvaluation} style={{ borderTop: '2px solid #cbd5e1', paddingTop: '18px' }}>
                      
                      {/* Contested Re-evaluation Info */}
                      {selectedExamSubmission.reevaluation?.applied && (
                        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '15px', borderRadius: '6px', marginBottom: '20px', fontSize: '9pt', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: '1.5' }}>
                          <h5 style={{ fontWeight: 'bold', color: '#b45309', fontSize: '9.5pt', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldAlert size={16} />
                            <span>ACTIVE RE-EVALUATION CLAIM FILED</span>
                          </h5>
                          
                          {selectedExamSubmission.reevaluation.complainedQuestions?.length > 0 && (
                            <div>
                              <span style={{ fontWeight: 'bold', color: '#78350f' }}>Contested Questions: </span>
                              <span style={{ fontSize: '8pt', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                {selectedExamSubmission.reevaluation.complainedQuestions.map(qId => {
                                  const foundQIdx = testConfig?.questions?.findIndex(q => q.id === qId);
                                  return foundQIdx !== -1 ? `Q${foundQIdx + 1}` : qId;
                                }).join(', ')}
                              </span>
                            </div>
                          )}

                          <div>
                            <div style={{ fontWeight: 'bold', color: '#78350f' }}>Candidate Complaint Text:</div>
                            <div style={{ backgroundColor: '#ffffff', padding: '10px', borderRadius: '4px', border: '1px solid #fef3c7', whiteSpace: 'pre-wrap', color: '#333' }}>
                              {selectedExamSubmission.reevaluation.complaintText}
                            </div>
                          </div>

                          {selectedExamSubmission.reevaluation.proofImages?.length > 0 && (
                            <div>
                              <div style={{ fontWeight: 'bold', color: '#78350f', marginBottom: '6px' }}>Candidate Screen Proofs:</div>
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {selectedExamSubmission.reevaluation.proofImages.map((imgUrl, imgIdx) => (
                                  <a key={imgIdx} href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'block', width: '80px', height: '80px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                                    <img src={imgUrl} alt={`Proof screenshot ${imgIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', borderTop: '1px solid #fef3c7', paddingTop: '15px' }}>
                            <div className="cf-input-group">
                              <label className="cf-label" style={{ color: '#78350f', fontWeight: 'bold' }}>Re-evaluation Status:</label>
                              <select
                                className="cf-input"
                                value={adminReevalStatus}
                                onChange={e => setAdminReevalStatus(e.target.value)}
                                style={{ padding: '8px 12px', fontSize: '9pt' }}
                              >
                                <option value="pending">Pending Review</option>
                                <option value="resolved">Resolve Claim</option>
                                <option value="rejected">Reject Claim</option>
                              </select>
                            </div>
                            <div className="cf-input-group">
                              <label className="cf-label" style={{ color: '#78350f', fontWeight: 'bold' }}>Resolution Response Remarks:</label>
                              <textarea
                                className="cf-input"
                                rows="2"
                                value={adminReevalResolutionFeedback}
                                onChange={e => setAdminReevalResolutionFeedback(e.target.value)}
                                placeholder="Explain your resolution decision to the candidate..."
                                style={{ padding: '8px 12px', fontSize: '9pt' }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileEdit size={16} />
                        <span>Score Sheet Finalization</span>
                      </h4>
                      
                      <div className="cf-form-grid" style={{ gridTemplateColumns: '1fr 2fr', gap: '15px', marginBottom: '15px' }}>
                        <div className="cf-input-group">
                          <label className="cf-label">Total Evaluated Score</label>
                          <div style={{ fontSize: '14pt', fontWeight: 'bold', color: '#10b981', padding: '6px 0' }}>
                            {currentTotalScore} / {maxTestMarks} pts
                          </div>
                          <span style={{ fontSize: '7.5pt', color: '#64748b' }}>
                            Auto-calculated live total across all itemized questions
                          </span>
                        </div>
                        <div className="cf-input-group">
                          <label className="cf-label">Evaluator Comments &amp; Feedback</label>
                          <textarea
                            className="cf-input"
                            rows="2"
                            required
                            value={adminGradingFeedback}
                            onChange={e => setAdminGradingFeedback(e.target.value)}
                            placeholder="Provide feedback remarks for candidate..."
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" className="cf-btn-secondary" onClick={() => setSelectedExamSubmission(null)}>
                          Cancel
                        </button>
                        <button type="submit" className="cf-btn-primary">
                          Save &amp; Finalize Evaluation
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
                );
              })()}

            </div>
  );
}
