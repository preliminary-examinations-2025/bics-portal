import React from 'react';
import { RefreshCw, Video } from 'lucide-react';
import StudentProctorDashboard from '../../components/StudentProctorDashboard';

export default function AdminProctoring({
  view,
  fetchLiveSubmissions,
  selectedProctorTest,
  setSelectedProctorTest,
  adminTests,
  selectedProctorStudent,
  setSelectedProctorStudent,
  liveSubmissions
}) {
  return (
    <div>
      {/* TOP HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Live Exam Proctoring Terminal</h2>
        <button
          className="cf-btn-secondary"
          onClick={fetchLiveSubmissions}
          style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '8.5pt', margin: 0 }}
        >
          <RefreshCw size={14} /> Refresh Lists
        </button>
      </div>

      {/* SPACE-SAVING TOP CONTROL BAR */}
      <div style={{
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        backgroundColor: '#f8fafc',
        padding: '15px',
        borderRadius: '4px',
        marginBottom: '20px',
        border: '1px solid var(--cf-border)',
        alignItems: 'flex-end'
      }}>
        <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Select Examination</label>
          <select
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
            value={selectedProctorTest ? (selectedProctorTest.id || selectedProctorTest._id) : ''}
            onChange={e => {
              const found = adminTests.find(t => (t.id || t._id) === e.target.value);
              setSelectedProctorTest(found || null);
              setSelectedProctorStudent(null);
            }}
          >
            <option value="">-- Choose Live Access Exam --</option>
            {(Array.isArray(adminTests) ? adminTests : []).map(t => (
              <option key={t.id || t._id} value={t.id || t._id}>{t.title}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Select Examinee</label>
          <select
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
            value={selectedProctorStudent ? (selectedProctorStudent.id || selectedProctorStudent._id) : ''}
            onChange={e => {
              const found = liveSubmissions.find(s => (s.id || s._id) === e.target.value);
              setSelectedProctorStudent(found || null);
            }}
            disabled={!selectedProctorTest}
          >
            <option value="">{selectedProctorTest ? "-- Choose Student Support --" : "-- Select an Exam First --"}</option>
            {selectedProctorTest && (() => {
              const tId = selectedProctorTest.id || selectedProctorTest._id;
              const testStudents = liveSubmissions.filter(s => s.testId === tId);
              return testStudents.map(sub => {
                const subId = sub.id || sub._id;
                const isActive = sub.status === 'started';
                const prefix = isActive ? '[Active] ' : '[Completed] ';
                return (
                  <option key={subId} value={subId}>
                    {prefix} {sub.candidateName} ({sub.studentId})
                  </option>
                );
              });
            })()}
          </select>
        </div>
      </div>

      {/* MONITOR SCREEN CONTAINER */}
      <div style={{ minHeight: '400px' }}>
        {!selectedProctorStudent ? (
          <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', color: '#64748b', borderStyle: 'dashed', minHeight: '360px' }}>
            <Video size={48} style={{ color: '#94a3b8', marginBottom: '15px' }} />
            <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#334155', margin: '0 0 5px 0' }}>Examinee Session Monitor</h3>
            <p style={{ fontSize: '8.5pt', color: '#64748b', maxWidth: '380px', margin: 0 }}>
              Select a configured examination and choose a candidate from the top dropdown selectors to view real-time camera proctoring feeds or review historic logs.
            </p>
          </div>
        ) : (
          <StudentProctorDashboard
            sub={selectedProctorStudent}
            onClose={() => setSelectedProctorStudent(null)}
            fetchLiveSubmissions={fetchLiveSubmissions}
          />
        )}
      </div>
    </div>
  );
}
