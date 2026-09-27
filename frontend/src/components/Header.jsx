import React from 'react';
import { Menu, X, User } from 'lucide-react';

export default function Header({ user, studentProfile, isMobileSidebarOpen, setIsMobileSidebarOpen }) {
  return (
    <header className="app-header">
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {user && (
          <button className="sidebar-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
            {isMobileSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        )}
        <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '42px', width: '42px', objectFit: 'contain' }} />
        <span className="pixel-logo">BICS Portal</span>
      </div>
      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {user && (
          <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#3b5998', fontFamily: 'verdana, arial, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <User size={14} style={{ color: '#3b5998' }} />
            <span>{user.role === 'admin' ? 'Administrator' : (studentProfile?.name || 'Student')}</span>
          </span>
        )}
        <img src="/logo.png" alt="Preliminary Examinations Logo" className="pe-logo" />
      </div>
    </header>
  );
}
