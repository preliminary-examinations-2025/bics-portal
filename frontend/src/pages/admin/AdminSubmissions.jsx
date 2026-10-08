import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE } from '../../config';

export default function AdminSubmissions({
  webhookSimPayload,
  setWebhookSimPayload,
  candidatesList,
  isSubmittingWebhook,
  setIsSubmittingWebhook,
  setLoadingMessage,
  setSubmissionError,
  setSubmissionSuccess,
  fetchAdminSubmissions,
  adminSubmissions,
  setEditingSubmission,
  setShowSubmissionModal,
  submissionSuccess,
  submissionError,
  toLocalISOString,
  deleteAdminSubmission,
  showSubmissionModal,
  editingSubmission,
  saveAdminSubmission
}) {
  return (
    <div>
      {/* Webhook Simulator Section */}
      <div className="cf-card" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
          <h2 style={{ fontSize: '14pt', color: '#002147', margin: 0 }}>Google Classroom Webhook Simulator</h2>
          <span className="status-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 8px', fontWeight: 'bold' }}>SIMULATOR MODE</span>
        </div>
        
        <p style={{ fontSize: '9pt', color: '#475569', marginBottom: '15px', lineHeight: '1.4' }}>
          This console simulates Google Classroom sync triggers. Select a candidate to populate the email and ID, adjust parameters, and click <strong>Simulate Sync</strong> to post a webhook payload to the backend webhook endpoint.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
          <div className="cf-input-group">
            <label className="cf-label">Select Student for Mock</label>
            <select
              className="cf-input"
              value={webhookSimPayload.studentId}
              onChange={e => {
                const cand = candidatesList.find(c => c.studentId === e.target.value);
                if (cand) {
                  setWebhookSimPayload({
                    ...webhookSimPayload,
                    studentId: cand.studentId,
                    email: cand.registrationData?.collegeEmail || cand.registrationData?.personalEmail || `${cand.username}@school.edu`,
                    studentName: cand.name
                  });
                }
              }}
            >
              <option value="STU1001">Siyam Bubere (STU1001)</option>
              {candidatesList.filter(c => c.studentId !== 'STU1001').map(c => (
                <option key={c.studentId} value={c.studentId}>{c.name} ({c.studentId})</option>
              ))}
            </select>
          </div>

          <div className="cf-input-group">
            <label className="cf-label">Course Code & Name</label>
            <select
              className="cf-input"
              value={webhookSimPayload.courseCode}
              onChange={e => {
                const code = e.target.value;
                let name = '';
                if (code === 'R526CS01T') name = 'Introduction to Computer Science';
                else if (code === 'R526CS02T') name = 'Programming Fundamentals with C++';
                else if (code === 'R526CS03T') name = 'Basics of Web Development';
                else if (code === 'R526CS04T') name = 'Mathematical Thinking';
                else if (code === 'R526CS02L') name = 'Programming Fundamentals with C++ Lab';
                else if (code === 'R526CS03L') name = 'Basics of Web Development Lab';
                setWebhookSimPayload({ ...webhookSimPayload, courseCode: code, courseName: name });
              }}
            >
              <option value="R526CS01T">R526CS01T - Introduction to Computer Science</option>
              <option value="R526CS02T">R526CS02T - Programming Fundamental with C++</option>
              <option value="R526CS03T">R526CS03T - Basics of Web Development</option>
              <option value="R526CS04T">R526CS04T - Mathematical Thinking</option>
              <option value="R526CS02L">R526CS02L - Programming Fundamental with C++ Lab</option>
              <option value="R526CS03L">R526CS03L - Basics of Web Development Lab</option>
            </select>
          </div>

          <div className="cf-input-group">
            <label className="cf-label">Submission Type</label>
            <select
              className="cf-input"
              value={webhookSimPayload.type}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, type: e.target.value })}
            >
              <option value="assignment">Assignment (Theory)</option>
              <option value="practical">Practical (Lab)</option>
              <option value="class_test">Class Test (Theory)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
          <div className="cf-input-group">
            <label className="cf-label">Task Title</label>
            <input
              type="text"
              className="cf-input"
              value={webhookSimPayload.title}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, title: e.target.value })}
            />
          </div>

          <div className="cf-input-group">
            <label className="cf-label">Score</label>
            <input
              type="number"
              className="cf-input"
              value={webhookSimPayload.score}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, score: Number(e.target.value) })}
            />
          </div>

          <div className="cf-input-group">
            <label className="cf-label">Max Score</label>
            <input
              type="number"
              className="cf-input"
              value={webhookSimPayload.maxScore}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, maxScore: Number(e.target.value) })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '15px', marginBottom: '20px' }}>
          <div className="cf-input-group">
            <label className="cf-label">Due Date & Time</label>
            <input
              type="datetime-local"
              className="cf-input"
              value={webhookSimPayload.dueDate}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, dueDate: e.target.value })}
            />
          </div>

          <div className="cf-input-group">
            <label className="cf-label">Submission Date & Time</label>
            <input
              type="datetime-local"
              className="cf-input"
              value={webhookSimPayload.submissionDate}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, submissionDate: e.target.value })}
            />
          </div>

          <div className="cf-input-group">
            <label className="cf-label">Google Classroom URL</label>
            <input
              type="url"
              className="cf-input"
              value={webhookSimPayload.classroomLink}
              onChange={e => setWebhookSimPayload({ ...webhookSimPayload, classroomLink: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            className="cf-btn-primary"
            disabled={isSubmittingWebhook}
            onClick={async () => {
              setIsSubmittingWebhook(true);
              setLoadingMessage("Simulating Classroom Sync Trigger...");
              setSubmissionError('');
              setSubmissionSuccess('');
              try {
                const toUtcString = (val) => {
                  if (!val) return null;
                  const d = new Date(val);
                  return isNaN(d.getTime()) ? null : d.toISOString();
                };
                const payload = {
                  ...webhookSimPayload,
                  submissionDate: toUtcString(webhookSimPayload.submissionDate),
                  dueDate: toUtcString(webhookSimPayload.dueDate)
                };
                const res = await fetch(`${API_BASE}/webhooks/google-classroom/submission`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'bics_classroom_secret_key_2026'
                  },
                  body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok && data.success) {
                  setSubmissionSuccess(`Webhook posted successfully. Resolved student ID: ${data.submission.studentId}, tag: ${data.submission.status}`);
                  fetchAdminSubmissions();
                  setTimeout(() => setSubmissionSuccess(''), 5000);
                } else {
                  setSubmissionError(data.error || "Mock sync failed.");
                }
              } catch (err) {
                setSubmissionError("Network error sending mock payload.");
              } finally {
                setIsSubmittingWebhook(false);
                setLoadingMessage('');
              }
            }}
          >
            {isSubmittingWebhook ? "Triggering Sync..." : "Simulate Sync / Post Webhook"}
          </button>
        </div>
      </div>

      {/* Submissions List Section */}
      <div className="cf-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
          <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Digital Submissions Ledger</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="cf-btn-secondary" onClick={fetchAdminSubmissions}>
              <RefreshCw size={14} style={{ marginRight: '6px' }} /> Refresh
            </button>
            <button
              className="cf-btn-primary"
              onClick={() => {
                setEditingSubmission({
                  studentId: 'STU1001',
                  studentName: 'Siyam Bubere',
                  courseCode: 'R526CS01T',
                  courseName: 'Introduction to Computer Science',
                  title: '',
                  type: 'assignment',
                  submissionDate: '',
                  dueDate: '',
                  status: 'on_time',
                  score: 0,
                  maxScore: 20,
                  classroomLink: ''
                });
                setSubmissionError('');
                setShowSubmissionModal(true);
              }}
            >
              <Plus size={14} style={{ marginRight: '6px' }} /> Add Submission
            </button>
          </div>
        </div>

        {submissionSuccess && (
          <div className="cf-alert cf-alert-success" style={{ marginBottom: '15px' }}>
            {submissionSuccess}
          </div>
        )}
        {submissionError && (
          <div className="cf-alert cf-alert-danger" style={{ marginBottom: '15px' }}>
            {submissionError}
          </div>
        )}

        <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Task Details</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(!Array.isArray(adminSubmissions) || adminSubmissions.length === 0) ? (
                <tr>
                  <td colSpan="8" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b' }}>No submissions found in ledger. Use the simulator or manual add.</td>
                </tr>
              ) : (
                (Array.isArray(adminSubmissions) ? adminSubmissions : []).map((sub, idx) => {
                  let badgeBg = '#f1f5f9';
                  let badgeColor = '#475569';
                  if (sub.status === 'on_time') {
                    badgeBg = '#d1fae5';
                    badgeColor = '#065f46';
                  } else if (sub.status === 'late') {
                    badgeBg = '#fee2e2';
                    badgeColor = '#991b1b';
                  } else if (sub.status === 'pending') {
                    badgeBg = '#dbeafe';
                    badgeColor = '#1e40af';
                  } else if (sub.status === 'excused') {
                    badgeBg = '#fef3c7';
                    badgeColor = '#92400e';
                  }

                  return (
                    <tr key={idx}>
                      <td>
                        <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>{sub.studentName}</div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b' }}>{sub.studentId}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '500', fontSize: '8.5pt' }}>{sub.courseCode}</div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{sub.courseName}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '500', fontSize: '9pt', color: '#1e293b' }}>
                          {sub.classroomLink ? (
                            <a href={sub.classroomLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', textDecoration: 'none' }}>
                              {sub.title} <ExternalLink size={12} />
                            </a>
                          ) : sub.title}
                        </div>
                      </td>
                      <td style={{ textTransform: 'capitalize', fontSize: '8.5pt' }}>{sub.type?.replace('_', ' ')}</td>
                      <td style={{ fontSize: '8pt', color: '#475569' }}>
                        <div>Due: {sub.dueDate ? new Date(sub.dueDate).toLocaleString() : 'N/A'}</div>
                        <div>Sub: {sub.submissionDate ? new Date(sub.submissionDate).toLocaleString() : 'Pending'}</div>
                      </td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: badgeBg, color: badgeColor, textTransform: 'uppercase', fontWeight: 'bold' }}>
                          {sub.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>
                        {sub.score} / {sub.maxScore}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="cf-btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '8.5pt', margin: 0 }}
                            onClick={() => {
                              setEditingSubmission({
                                ...sub,
                                submissionDate: toLocalISOString(sub.submissionDate),
                                dueDate: toLocalISOString(sub.dueDate)
                              });
                              setSubmissionError('');
                              setShowSubmissionModal(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="cf-btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '8.5pt', margin: 0, color: '#b91c1c', borderColor: '#fee2e2' }}
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete submission for "${sub.title}"?`)) {
                                deleteAdminSubmission(sub.title || sub._id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* COUNTERFOIL MARKS APPROVALS SECTION */}
      <CounterfoilApprovalsCard />

      {/* MANUAL ADD/EDIT MODAL */}
      {showSubmissionModal && editingSubmission && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="cf-card" style={{ width: '90%', maxWidth: '650px', padding: '20px', backgroundColor: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingSubmission._id ? "Edit Submission Details" : "Record New Submission"}</span>
              <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => { setShowSubmissionModal(false); setEditingSubmission(null); }}>✕</button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              saveAdminSubmission(editingSubmission);
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div className="cf-input-group">
                  <label className="cf-label">Student ID *</label>
                  <input
                    type="text"
                    className="cf-input"
                    required
                    value={editingSubmission.studentId}
                    onChange={e => {
                      const cand = candidatesList.find(c => c.studentId === e.target.value);
                      setEditingSubmission({
                        ...editingSubmission,
                        studentId: e.target.value,
                        studentName: cand ? cand.name : editingSubmission.studentName
                      });
                    }}
                  />
                </div>

                <div className="cf-input-group">
                  <label className="cf-label">Student Name *</label>
                  <input
                    type="text"
                    className="cf-input"
                    required
                    value={editingSubmission.studentName}
                    onChange={e => setEditingSubmission({ ...editingSubmission, studentName: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div className="cf-input-group">
                  <label className="cf-label">Course Code *</label>
                  <select
                    className="cf-input"
                    required
                    value={editingSubmission.courseCode}
                    onChange={e => {
                      const code = e.target.value;
                      let name = '';
                      if (code === 'R526CS01T') name = 'Introduction to Computer Science';
                      else if (code === 'R526CS02T') name = 'Programming Fundamentals with C++';
                      else if (code === 'R526CS03T') name = 'Basics of Web Development';
                      else if (code === 'R526CS04T') name = 'Mathematical Thinking';
                      else if (code === 'R526CS02L') name = 'Programming Fundamentals with C++ Lab';
                      else if (code === 'R526CS03L') name = 'Basics of Web Development Lab';
                      setEditingSubmission({ ...editingSubmission, courseCode: code, courseName: name });
                    }}
                  >
                    <option value="R526CS01T">R526CS01T - Introduction to Computer Science</option>
                    <option value="R526CS02T">R526CS02T - Programming Fundamental with C++</option>
                    <option value="R526CS03T">R526CS03T - Basics of Web Development</option>
                    <option value="R526CS04T">R526CS04T - Mathematical Thinking</option>
                    <option value="R526CS02L">R526CS02L - Programming Fundamental with C++ Lab</option>
                    <option value="R526CS03L">R526CS03L - Basics of Web Development Lab</option>
                  </select>
                </div>

                <div className="cf-input-group">
                  <label className="cf-label">Submission Type *</label>
                  <select
                    className="cf-input"
                    required
                    value={editingSubmission.type}
                    onChange={e => setEditingSubmission({ ...editingSubmission, type: e.target.value })}
                  >
                    <option value="assignment">Assignment</option>
                    <option value="practical">Practical (Lab)</option>
                    <option value="class_test">Class Test</option>
                  </select>
                </div>
              </div>

              <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                <label className="cf-label">Task Title *</label>
                <input
                  type="text"
                  className="cf-input"
                  required
                  value={editingSubmission.title}
                  onChange={e => setEditingSubmission({ ...editingSubmission, title: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div className="cf-input-group">
                  <label className="cf-label">Score *</label>
                  <input
                    type="number"
                    className="cf-input"
                    required
                    value={editingSubmission.score}
                    onChange={e => setEditingSubmission({ ...editingSubmission, score: Number(e.target.value) })}
                  />
                </div>

                <div className="cf-input-group">
                  <label className="cf-label">Max Score *</label>
                  <input
                    type="number"
                    className="cf-input"
                    required
                    value={editingSubmission.maxScore}
                    onChange={e => setEditingSubmission({ ...editingSubmission, maxScore: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div className="cf-input-group">
                  <label className="cf-label">Due Date</label>
                  <input
                    type="datetime-local"
                    className="cf-input"
                    value={editingSubmission.dueDate}
                    onChange={e => setEditingSubmission({ ...editingSubmission, dueDate: e.target.value })}
                  />
                </div>

                <div className="cf-input-group">
                  <label className="cf-label">Submission Date</label>
                  <input
                    type="datetime-local"
                    className="cf-input"
                    value={editingSubmission.submissionDate}
                    onChange={e => setEditingSubmission({ ...editingSubmission, submissionDate: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div className="cf-input-group">
                  <label className="cf-label">Override Status (Optional)</label>
                  <select
                    className="cf-input"
                    value={editingSubmission.status}
                    onChange={e => setEditingSubmission({ ...editingSubmission, status: e.target.value })}
                  >
                    <option value="">Auto-tag by Dates</option>
                    <option value="on_time">On-Time</option>
                    <option value="late">Late</option>
                    <option value="pending">Pending</option>
                    <option value="excused">Excused</option>
                  </select>
                </div>

                <div className="cf-input-group">
                  <label className="cf-label">Classroom URL</label>
                  <input
                    type="url"
                    className="cf-input"
                    value={editingSubmission.classroomLink}
                    onChange={e => setEditingSubmission({ ...editingSubmission, classroomLink: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="cf-btn-secondary" onClick={() => { setShowSubmissionModal(false); setEditingSubmission(null); }}>
                  Cancel
                </button>
                <button type="submit" className="cf-btn-primary">
                  Save Submission Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CounterfoilApprovalsCard() {
  const [counterfoils, setCounterfoils] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionRemarks, setActionRemarks] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const fetchCounterfoils = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/counterfoil/list`);
      if (res.ok) {
        const data = await res.json();
        setCounterfoils(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounterfoils();
  }, []);

  const handleAction = async (id, status) => {
    const remarks = actionRemarks[id] || '';
    try {
      setProcessingId(id);
      setMsg({ type: '', text: '' });
      const res = await fetch(`${API_BASE}/admin/counterfoil/action/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminRemarks: remarks })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `Counterfoil ${status === 'approved' ? 'Approved' : 'Rejected'} successfully!` });
        fetchCounterfoils();
      } else {
        setMsg({ type: 'error', text: data.error || 'Failed to update status.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Server connection error.' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="cf-card" style={{ marginTop: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
        <div>
          <h2 style={{ fontSize: '14pt', color: '#002147', margin: 0 }}>Candidate Counterfoil Marks Approvals</h2>
          <span style={{ fontSize: '8.5pt', color: '#64748b' }}>Approve or reject candidate self-reported MST / ESE marks counterfoils</span>
        </div>
        <button className="cf-btn-secondary" onClick={fetchCounterfoils} disabled={loading}>
          <RefreshCw size={14} style={{ marginRight: '6px' }} /> Refresh List
        </button>
      </div>

      {msg.text && (
        <div className={`cf-alert ${msg.type === 'error' ? 'cf-alert-error' : 'cf-alert-success'}`} style={{ marginBottom: '15px' }}>
          {msg.text}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Candidate &amp; Student ID</th>
              <th>Course</th>
              <th>Exam Type</th>
              <th>Question Marks Breakdown</th>
              <th>Total Score</th>
              <th>Status</th>
              <th>Admin Action &amp; Remarks</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Loading counterfoil submissions...</td>
              </tr>
            ) : counterfoils.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No candidate counterfoil submissions found.</td>
              </tr>
            ) : (
              counterfoils.map(cf => (
                <tr key={cf._id || cf.id}>
                  <td>
                    <strong>{cf.studentName}</strong>
                    <div style={{ fontFamily: 'Fira Code, monospace', fontSize: '8pt', color: '#0284c7' }}>{cf.studentId}</div>
                  </td>
                  <td>
                    <strong>{cf.courseCode}</strong>
                    <div style={{ fontSize: '8pt', color: '#64748b' }}>{cf.courseName}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', color: cf.examType === 'midsem' ? '#0284c7' : '#0369a1', backgroundColor: '#f0f9ff', padding: '2px 6px', borderRadius: '4px' }}>
                      {cf.examType === 'midsem' ? 'MST (Midsem)' : 'ESE (Endsem)'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {cf.questionMarks?.map(q => (
                        <span key={q.questionNo} style={{ fontSize: '7.5pt', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 5px', borderRadius: '3px' }}>
                          Q{q.questionNo}: <strong>{q.obtainedMarks}</strong>/{q.maxMarks}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <strong style={{ fontSize: '10pt', color: '#0f172a' }}>{cf.totalObtained} / {cf.totalMax}</strong>
                  </td>
                  <td>
                    {cf.status === 'approved' && (
                      <span className="status-badge" style={{ backgroundColor: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' }}>Approved</span>
                    )}
                    {cf.status === 'pending_approval' && (
                      <span className="status-badge" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>Pending</span>
                    )}
                    {cf.status === 'rejected' && (
                      <span className="status-badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>Rejected</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="text"
                        placeholder="Admin remarks..."
                        disabled={processingId === cf._id}
                        value={actionRemarks[cf._id] !== undefined ? actionRemarks[cf._id] : (cf.adminRemarks || '')}
                        onChange={e => setActionRemarks({ ...actionRemarks, [cf._id]: e.target.value })}
                        style={{ fontSize: '8pt', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          disabled={processingId === cf._id || cf.status === 'approved'}
                          onClick={() => handleAction(cf._id, 'approved')}
                          className="cf-btn-primary"
                          style={{ padding: '2px 8px', fontSize: '8pt', backgroundColor: '#0284c7' }}
                        >
                          Approve
                        </button>
                        <button
                          disabled={processingId === cf._id}
                          onClick={() => handleAction(cf._id, 'rejected')}
                          className="cf-btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '8pt', color: '#b91c1c', borderColor: '#fca5a5' }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
