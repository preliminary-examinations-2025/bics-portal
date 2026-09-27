import React from 'react';

export default function AdminDashboard({
  systemConfig,
  adminMessage,
  adminError,
  handleToggleSetting,
  handleAddAnnouncement,
  newAnnouncement,
  setNewAnnouncement,
  adminExamType,
  handleUpdateExamType,
  handleUpdateTimetableNotice,
  adminTimetableNotice,
  setAdminTimetableNotice,
  handleSaveExamTimetable,
  handleAddTimetableRow,
  adminTimetable,
  handleTimetableCellChange,
  handleRemoveTimetableRow,
  handleAddClassTestRow,
  handleSaveClassTests,
  adminClassTests,
  handleClassTestCellChange,
  handleRemoveClassTestRow
}) {
  return (
    <div>
      <h2 style={{ fontSize: '18pt', color: '#002147', marginBottom: '20px' }}>Admin Dashboard</h2>
      {adminMessage && <div className="cf-alert cf-alert-success">{adminMessage}</div>}
      {adminError && <div className="cf-alert cf-alert-error">{adminError}</div>}

      {/* Toggles Panel */}
      <div className="cf-card">
        <div className="cf-card-title">System Settings Controls</div>
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={systemConfig.courseRegistrationActive} onChange={e => handleToggleSetting('courseRegistrationActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Course Registrations Active</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={!!systemConfig.midSemFeedbackActive} onChange={e => handleToggleSetting('midSemFeedbackActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Mid Sem Feedback Active</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={!!systemConfig.endSemFeedbackActive} onChange={e => handleToggleSetting('endSemFeedbackActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>End Sem Feedback Active</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={systemConfig.exitFormActive} onChange={e => handleToggleSetting('exitFormActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Exit Form Active</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={!!systemConfig.hallTicketDownloadActive} onChange={e => handleToggleSetting('hallTicketDownloadActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Hall Ticket Downloads Active</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={systemConfig ? (systemConfig.onlineExamActive !== false) : true} onChange={e => handleToggleSetting('onlineExamActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Online Practice &amp; Exam Module Active</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label className="switch">
              <input type="checkbox" checked={systemConfig ? (systemConfig.counterfoilActive !== false) : true} onChange={e => handleToggleSetting('counterfoilActive', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Counterfoil Marks Entry Active</span>
          </div>
        </div>
      </div>

      {/* Create Announcement */}
      <div className="cf-card">
        <div className="cf-card-title">Publish System Announcement</div>
        <form onSubmit={handleAddAnnouncement}>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input type="text" className="cf-input" style={{ flexGrow: 1 }} required value={newAnnouncement} onChange={e => setNewAnnouncement(e.target.value)} placeholder="Type announcement text here..." />
            <button type="submit" className="cf-btn-primary">Publish</button>
          </div>
        </form>
      </div>

      {/* Manage Timetable */}
      <div className="cf-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
          <div className="cf-card-title" style={{ margin: 0 }}>Manage Examination Schedule (Mid-Sem / End-Sem)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '9pt', fontWeight: 'bold', color: '#475569' }}>Exam Type Selector:</label>
            <select
              className="cf-input"
              style={{ width: '160px', height: '34px', fontSize: '9pt', padding: '5px' }}
              value={adminExamType}
              onChange={e => handleUpdateExamType(e.target.value)}
            >
              <option value="midsem">Mid Semester</option>
              <option value="endsem">End Semester</option>
            </select>
          </div>
        </div>

        {/* 1. Timetable Notice */}
        <form onSubmit={handleUpdateTimetableNotice} style={{ marginBottom: '25px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid var(--cf-border)' }}>
          <div className="cf-input-group" style={{ margin: 0 }}>
            <label className="cf-label">General Timetable Notice (Display Announcement)</label>
            <div style={{ display: 'flex', gap: '15px' }}>
              <input type="text" className="cf-input" style={{ flexGrow: 1 }} required value={adminTimetableNotice} onChange={e => setAdminTimetableNotice(e.target.value)} />
              <button type="submit" className="cf-btn-primary">Update Notice</button>
            </div>
          </div>
        </form>

        {/* 2. Custom Timetable Creator */}
        <form onSubmit={handleSaveExamTimetable} style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid var(--cf-border)', marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>Course Examination Schedule Slots</h3>
            <button type="button" className="cf-btn-secondary" onClick={handleAddTimetableRow} style={{ padding: '6px 12px', fontSize: '8.5pt' }}>
              + Add Course Exam Slot
            </button>
          </div>
          
          <div className="cf-table-container" style={{ marginBottom: '15px' }}>
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Exam Date</th>
                  <th>Time Duration Slot</th>
                  <th>Total Marks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminTimetable.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>No exam slots added yet. Click Add Course Slot to start.</td>
                  </tr>
                ) : (
                  adminTimetable.map((t, idx) => (
                    <tr key={idx}>
                      <td>
                        <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.code || ''} onChange={e => handleTimetableCellChange(idx, 'code', e.target.value)} placeholder="e.g. CS-101" />
                      </td>
                      <td>
                        <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.course} onChange={e => handleTimetableCellChange(idx, 'course', e.target.value)} placeholder="e.g. C++ Programming" />
                      </td>
                      <td>
                        <input type="date" className="cf-input" style={{ width: '100%' }} required value={t.date} onChange={e => handleTimetableCellChange(idx, 'date', e.target.value)} />
                      </td>
                      <td>
                        <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.time} onChange={e => handleTimetableCellChange(idx, 'time', e.target.value)} placeholder="e.g. 10:00 AM - 01:00 PM" />
                      </td>
                      <td>
                        <input type="number" className="cf-input" style={{ width: '100%' }} required value={t.marks !== undefined ? t.marks : 50} onChange={e => handleTimetableCellChange(idx, 'marks', parseInt(e.target.value) || 0)} />
                      </td>
                      <td>
                        <button type="button" className="cf-btn-primary" style={{ color: '#ef4444', borderColor: '#ef4444', backgroundColor: '#fff', padding: '4px 10px', fontSize: '8.5pt', margin: 0 }} onClick={() => handleRemoveTimetableRow(idx)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button type="submit" className="cf-btn-primary">Save Course Timetable Dates</button>
        </form>
      </div>

      {/* Manage Class Tests Scheduler */}
      <div className="cf-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
          <div className="cf-card-title" style={{ margin: 0 }}>Manage Class Tests Schedule</div>
          <button type="button" className="cf-btn-secondary" onClick={handleAddClassTestRow} style={{ padding: '6px 12px', fontSize: '8.5pt' }}>
            + Schedule New Class Test
          </button>
        </div>

        <form onSubmit={handleSaveClassTests} style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid var(--cf-border)' }}>
          <div className="cf-table-container" style={{ marginBottom: '15px' }}>
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Course Name</th>
                  <th>Topic / Module Details</th>
                  <th>Scheduled Date</th>
                  <th>Time Slot</th>
                  <th>Marks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminClassTests.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>No class tests scheduled yet. Click Schedule Class Test to start.</td>
                  </tr>
                ) : (
                  adminClassTests.map((t, idx) => (
                    <tr key={idx}>
                      <td>
                        <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.courseName} onChange={e => handleClassTestCellChange(idx, 'courseName', e.target.value)} placeholder="Course Name" />
                      </td>
                      <td>
                        <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.topic} onChange={e => handleClassTestCellChange(idx, 'topic', e.target.value)} placeholder="Topic e.g. Recursion" />
                      </td>
                      <td>
                        <input type="date" className="cf-input" style={{ width: '100%' }} required value={t.date} onChange={e => handleClassTestCellChange(idx, 'date', e.target.value)} />
                      </td>
                      <td>
                        <input type="text" className="cf-input" style={{ width: '100%' }} required value={t.time} onChange={e => handleClassTestCellChange(idx, 'time', e.target.value)} placeholder="e.g. 09:00 AM - 10:00 AM" />
                      </td>
                      <td>
                        <input type="number" className="cf-input" style={{ width: '100%' }} required value={t.marks} onChange={e => handleClassTestCellChange(idx, 'marks', parseInt(e.target.value) || 0)} />
                      </td>
                      <td>
                        <button type="button" className="cf-btn-primary" style={{ color: '#ef4444', borderColor: '#ef4444', backgroundColor: '#fff', padding: '4px 10px', fontSize: '8.5pt', margin: 0 }} onClick={() => handleRemoveClassTestRow(idx)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button type="submit" className="cf-btn-primary">Save Class Tests Schedule</button>
        </form>
      </div>
    </div>
  );
}
