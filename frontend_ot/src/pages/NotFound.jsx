import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();

  // Extract original requested path if redirected via /terminal/404?from=...
  const searchParams = new URLSearchParams(location.search);
  const fromPath = searchParams.get('from');
  const displayPath = fromPath || location.pathname;

  const handleReturnToPortal = () => {
    const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || (
      window.location.origin.includes('localhost')
        ? 'http://localhost:5173/'
        : window.location.origin.replace('ot-bics', 'bics-portal').replace('otbicsexam', 'bicsportal')
    );
    window.location.href = dashboardUrl;
  };

  const handleBackClick = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      handleReturnToPortal();
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
          404 - Exam Terminal Page Not Found
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
          The requested test terminal route or verification session does not exist or has expired.
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
            onClick={handleReturnToPortal}
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
            <ExternalLink size={17} /> Return to Main BICS Portal
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
