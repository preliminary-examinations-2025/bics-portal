import React from 'react';

export default function HomeDashboard({ systemConfig }) {
  if (!systemConfig) return null;

  return (
    <div>
      <div className="cf-card">
        <div className="cf-card-title">Portal Announcements</div>
        {systemConfig.announcements && systemConfig.announcements.length === 0 ? (
          <p style={{ fontStyle: 'italic', color: '#666' }}>No active announcements.</p>
        ) : (
          systemConfig.announcements.map((a, idx) => (
            <div key={idx} style={{ borderBottom: idx !== systemConfig.announcements.length - 1 ? '1px solid #cbd5e1' : 'none', paddingBottom: '12px', marginBottom: '12px' }}>
              <span className="status-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 6px', fontSize: '7.5pt' }}>{a.date}</span>
              <p style={{ marginTop: '8px', fontSize: '10pt', color: '#333' }}>{a.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
