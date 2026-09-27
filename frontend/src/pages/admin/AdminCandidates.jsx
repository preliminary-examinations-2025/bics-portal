import React from 'react';

export default function AdminCandidates({
  systemConfig,
  adminMessage,
  adminError,
  handleRegisterCandidateByAdmin,
  newCandidate,
  setNewCandidate,
  candidatesList,
  handleToggleEligibility,
  setSelectedCandidate
}) {
  return (
    <div>
      <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Candidates Manager</h2>
      {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
      {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

      {/* Register Candidate Form */}
      <div className="cf-card">
        <div className="cf-card-title">Register New Candidate</div>
        <form onSubmit={handleRegisterCandidateByAdmin} className="cf-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="cf-input-group">
            <label className="cf-label">Student ID</label>
            <input type="text" className="cf-input" required value={newCandidate.studentId} onChange={e => setNewCandidate({...newCandidate, studentId: e.target.value})} placeholder="e.g. STU1001" />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Full Name</label>
            <input type="text" className="cf-input" required value={newCandidate.name} onChange={e => setNewCandidate({...newCandidate, name: e.target.value})} placeholder="Legal student name" />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Username</label>
            <input type="text" className="cf-input" required value={newCandidate.username} onChange={e => setNewCandidate({...newCandidate, username: e.target.value})} />
          </div>
          <div className="cf-input-group">
            <label className="cf-label">Password</label>
            <input type="text" className="cf-input" required value={newCandidate.password} onChange={e => setNewCandidate({...newCandidate, password: e.target.value})} />
          </div>
          <div className="cf-input-group" style={{ justifyContent: 'center' }}>
            <label className="checkbox-label" style={{ display: 'flex', gap: '10px', fontSize: '9pt', cursor: 'pointer' }}>
              <input type="checkbox" checked={newCandidate.eligible} onChange={e => setNewCandidate({...newCandidate, eligible: e.target.checked})} />
              Set Eligible
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Register Student</button>
          </div>
        </form>
      </div>

      {/* Candidates Table */}
      <div className="cf-card">
        <div className="cf-card-title">Registered Candidates List ({candidatesList.length})</div>
        <div className="cf-table-container">
          <table className="cf-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Username</th>
                <th>Password</th>
                <th>Registration</th>
                <th>Malpractice Consent</th>
                <th>Exam Eligibility</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidatesList.map((c, idx) => (
                <tr key={idx}>
                  <td>{c.studentId}</td>
                  <td style={{ fontWeight: '600' }}>{c.name}</td>
                  <td>{c.username}</td>
                  <td><code>{c.password}</code></td>
                  <td>
                    {c.registrationSubmitted ? (
                      <div>
                        <span style={{ fontSize: '8pt', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px' }}>Submitted</span><br />
                        <span className={`status-badge ${c.registrationStatus === 'Approved' ? 'status-eligible' : c.registrationStatus === 'Rejected' ? 'status-ineligible' : ''}`} style={{ fontSize: '7.5pt', padding: '1px 4px' }}>
                          {c.registrationStatus || 'Pending'}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '8pt', backgroundColor: '#fee2e2', padding: '2px 6px', borderRadius: '4px', color: '#b91c1c' }}>Pending Form</span>
                    )}
                  </td>
                  <td style={{ fontSize: '8pt', lineHeight: '1.3' }}>
                    <div>Mid: <span style={{ fontWeight: 'bold', color: c.midSemConsentSigned ? '#16a34a' : '#ef4444' }}>{c.midSemConsentSigned ? "Yes" : "No"}</span></div>
                    <div>End: <span style={{ fontWeight: 'bold', color: c.endSemConsentSigned ? '#16a34a' : '#ef4444' }}>{c.endSemConsentSigned ? "Yes" : "No"}</span></div>
                  </td>
                  <td>
                    <button className={`cf-btn-secondary ${c.eligible ? 'status-eligible' : 'status-ineligible'}`} style={{ border: 'none', padding: '4px 8px', fontSize: '8pt' }} onClick={() => handleToggleEligibility(c.id || c._id, c.eligible)}>
                      {c.eligible ? "Eligible" : "Ineligible"}
                    </button>
                  </td>
                  <td>
                    <button className="cf-btn-secondary" style={{ padding: '4px 8px', fontSize: '8.5pt' }} onClick={() => setSelectedCandidate(c)}>
                      Inspect File
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
