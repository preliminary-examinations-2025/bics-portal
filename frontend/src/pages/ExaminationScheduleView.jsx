import React from 'react';
import { Calendar } from 'lucide-react';

export default function ExaminationScheduleView({ systemConfig }) {
  if (!systemConfig) return null;

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

  return (
    <div className="cf-card">
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Calendar size={18} style={{ color: '#3b5998' }} />
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
  );
}
