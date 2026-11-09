import React from 'react';
import { Calendar } from 'lucide-react';

export default function ExaminationScheduleView({ systemConfig }) {
  if (!systemConfig) return null;

  const timetableList = Array.isArray(systemConfig.timetable) ? systemConfig.timetable : [];
  const classTestsList = systemConfig.classTests || [];
  const today = new Date();
  const currentDay = today.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  saturday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const weekendTests = classTestsList.filter(t => {
    if (!t.date) return false;
    const tDate = new Date(t.date);
    return tDate >= saturday && tDate <= sunday;
  });

  const examCycleLabel = systemConfig.examType === 'endsem' ? 'End Semester' : 'Mid Semester';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Official Course Examination Timetable */}
      <div className="cf-card">
        <div className="cf-card-title">
          <Calendar size={16} style={{ color: '#3b5998' }} />
          <span>Official Course Examination Schedule</span>
          <span style={{ marginLeft: 'auto', backgroundColor: '#e0e7ff', color: '#1e3a8a', fontSize: '8pt', fontWeight: 'bold', padding: '3px 10px', borderRadius: '4px' }}>
            {examCycleLabel} Examination
          </span>
        </div>

        {systemConfig.timetableNotice && (
          <div className="cf-alert cf-alert-info" style={{ marginBottom: '15px' }}>
            <strong>Examination Notice:</strong> {systemConfig.timetableNotice}
          </div>
        )}

        {timetableList.length === 0 ? (
          <div className="cf-alert cf-alert-info" style={{ margin: 0 }}>
            No official examination schedule slots have been published yet.
          </div>
        ) : (
          <div className="cf-table-container">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Exam Date</th>
                  <th>Time Slot</th>
                  <th>Mode</th>
                  <th>Report Time</th>
                  <th>Total Marks</th>
                </tr>
              </thead>
              <tbody>
                {timetableList.map((slot, idx) => {
                  const codeStr = String(slot.code || '').trim();
                  const courseTitle = String(slot.course || slot.name || '').trim();
                  const isLab = /(?:L|P)$/i.test(codeStr) || /\blab\b/i.test(courseTitle);
                  const modeText = slot.mode || (isLab ? 'Computer Lab' : 'Online Proctored');
                  const reportText = slot.reportTime || slot.reportingTime || 'As Scheduled';
                  return (
                    <tr key={`${codeStr || 'slot'}-${idx}`}>
                      <td style={{ fontWeight: 'bold', fontSize: '9pt', color: '#002147' }}>{codeStr || '—'}</td>
                      <td style={{ fontWeight: 'bold', fontSize: '9pt', color: '#1e293b' }}>{courseTitle || '—'}</td>
                      <td>{slot.date || 'To be announced'}</td>
                      <td>{slot.time || '—'}</td>
                      <td>
                        <span style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '8pt', fontWeight: '600', padding: '2px 8px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                          {modeText}
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap' }}>{reportText}</td>
                      <td style={{ fontWeight: 'bold', color: '#3b5998' }}>{slot.marks !== undefined ? `${slot.marks} Marks` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Class Tests Schedule */}
      <div className="cf-card">
        <div className="cf-card-title">
          <Calendar size={16} style={{ color: '#3b5998' }} />
          <span>Class Tests Schedule</span>
        </div>

        {/* Upcoming Weekend Class Tests Card */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
            This Weekend's Upcoming Class Tests
          </h3>
          {weekendTests.length === 0 ? (
            <div className="cf-alert cf-alert-info" style={{ margin: 0 }}>
              No class tests scheduled for this upcoming weekend (Saturday-Sunday).
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
              {weekendTests.map(test => (
                <div key={test.id} style={{ border: '1px solid #b9c9fe', borderRadius: '4px', padding: '15px', backgroundColor: '#f0f4ff', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: '15px', right: '15px', backgroundColor: '#3b5998', color: '#fff', fontSize: '7.5pt', fontWeight: 'bold', padding: '3px 8px', borderRadius: '3px' }}>
                    {test.marks} Marks
                  </span>
                  <h4 style={{ fontSize: '10.5pt', color: '#002147', fontWeight: 'bold', width: '80%', marginBottom: '8px' }}>
                    {test.courseName}
                  </h4>
                  <div style={{ fontSize: '9pt', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span><strong>Topic:</strong> {test.topic}</span>
                    <span><strong>Date:</strong> {test.date} (Weekend)</span>
                    <span><strong>Time:</strong> {test.time}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Class Tests History / List */}
        <div>
          <h3 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', marginBottom: '10px' }}>
            Comprehensive Class Test Roster
          </h3>
          {(!systemConfig.classTests || systemConfig.classTests.length === 0) ? (
            <div className="cf-alert cf-alert-info">No class tests scheduled.</div>
          ) : (
            <div className="cf-table-container">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Course Name</th>
                    <th>Topic / Module Details</th>
                    <th>Scheduled Date</th>
                    <th>Time Slot</th>
                    <th>Total Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {systemConfig.classTests.map(test => (
                    <tr key={test.id}>
                      <td style={{ fontWeight: 'bold', fontSize: '9pt', color: '#002147' }}>{test.courseName}</td>
                      <td>{test.topic}</td>
                      <td>{test.date}</td>
                      <td>{test.time}</td>
                      <td style={{ fontWeight: 'bold', color: '#3b5998' }}>{test.marks} Marks</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
