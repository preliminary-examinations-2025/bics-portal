import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Home, Search } from 'lucide-react';

export default function NotFound({ user, onNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Extract original requested path if redirected via /main/404?from=...
  const searchParams = new URLSearchParams(location.search);
  const fromPath = searchParams.get('from');
  const displayPath = fromPath || location.pathname;

  const handleHomeClick = () => {
    if (onNavigate) {
      if (user?.role === 'admin') {
        onNavigate('admin');
      } else if (user?.role === 'student') {
        onNavigate('announcements');
      } else {
        onNavigate('login');
      }
    } else {
      if (user?.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (user?.role === 'student') {
        navigate('/home');
      } else {
        navigate('/login');
      }
    }
  };

  const handleBackClick = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      handleHomeClick();
    }
  };

  return (
    <div style={{ width: '100%', padding: '10px 0' }}>
      {/* Main View Body */}
      <div className="cf-card" style={{ 
        width: '100%', 
        padding: '48px 28px', 
        border: '1.5px solid #adc6fc', 
        borderRadius: '8px',
        backgroundColor: '#ffffff',
        textAlign: 'center'
      }}>
        {/* 404 Illustration Directly Over White Background */}
        <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'center' }}>
          <img 
            src="/404-icon.png" 
            alt="404 Not Found" 
            style={{ 
              maxWidth: '320px', 
              width: '100%',
              height: 'auto', 
              display: 'block'
            }} 
          />
        </div>

        {/* Title in Matching Blue */}
        <h1 style={{ 
          fontSize: '22pt', 
          fontWeight: 'bold', 
          color: '#1a73e8', 
          margin: '0 0 12px 0',
          letterSpacing: '-0.4px'
        }}>
          404 - Page Not Found
        </h1>

        {/* Subtitle Description */}
        <p style={{ 
          fontSize: '10.5pt', 
          color: '#3c4043', 
          marginBottom: '22px',
          lineHeight: '1.6',
          maxWidth: '560px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          The page or route you are looking for does not exist on the BICS Portal. It may have been typed incorrectly, moved, or is temporarily unavailable.
        </p>

        {/* Soft Blue Requested Path Badge */}
        <div style={{ 
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#e8f0fe',
          border: '1.5px solid #adc6fc',
          borderRadius: '24px',
          padding: '8px 22px',
          fontSize: '9pt',
          color: '#1a73e8',
          marginBottom: '32px',
          fontWeight: '500',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          <Search size={15} style={{ color: '#1a73e8', flexShrink: 0 }} />
          <span>Requested path: <strong style={{ color: '#174ea6', fontFamily: "'Fira Code', monospace" }}>{displayPath}</strong></span>
        </div>

        {/* Action Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '14px', 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button 
            onClick={handleHomeClick}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '9px',
              padding: '11px 24px',
              fontSize: '9.5pt',
              fontWeight: 'bold',
              backgroundColor: '#e8f0fe',
              color: '#1a73e8',
              border: '1.5px solid #adc6fc',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#d2e3fc';
              e.currentTarget.style.color = '#174ea6';
              e.currentTarget.style.borderColor = '#1a73e8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#e8f0fe';
              e.currentTarget.style.color = '#1a73e8';
              e.currentTarget.style.borderColor = '#adc6fc';
            }}
          >
            <Home size={17} /> Return to {user?.role === 'admin' ? 'Admin Dashboard' : user?.role === 'student' ? 'Student Portal' : 'Sign In'}
          </button>

          <button 
            onClick={handleBackClick}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '9px',
              padding: '11px 24px',
              fontSize: '9.5pt',
              fontWeight: 'bold',
              backgroundColor: '#ffffff',
              color: '#1a73e8',
              border: '1.5px solid #adc6fc',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#e8f0fe';
              e.currentTarget.style.borderColor = '#1a73e8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#adc6fc';
            }}
          >
            <ArrowLeft size={17} /> Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
