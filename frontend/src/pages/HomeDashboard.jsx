import React from 'react';
import { Bell } from 'lucide-react';

export default function HomeDashboard({ systemConfig }) {
  if (!systemConfig) return null;

  return (
    <div>
      <div className="cf-card">
        <div className="cf-card-title">
          <Bell size={16} style={{ color: '#3b5998' }} />
          <span>Portal Announcements</span>
        </div>
        {systemConfig.announcements && systemConfig.announcements.length === 0 ? (
          <p style={{ fontStyle: 'italic', color: '#666' }}>No active announcements.</p>
        ) : (
          systemConfig.announcements.map((a, idx) => (
            <div key={idx} style={{ borderBottom: idx !== systemConfig.announcements.length - 1 ? '1px solid #cbd5e1' : 'none', paddingBottom: '14px', marginBottom: '14px' }}>
              <span className="status-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 6px', fontSize: '7.5pt' }}>{a.date}</span>
              <p style={{
                marginTop: '10px',
                fontSize: '10pt',
                color: '#1e293b',
                lineHeight: '1.8',
                textAlign: 'justify',
                textJustify: 'inter-word',
                width: '100%',
                marginRight: 0,
                wordBreak: 'break-word'
              }}>
                {a.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
