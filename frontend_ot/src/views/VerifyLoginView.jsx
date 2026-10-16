import React from 'react';
import { CenteredFooter } from '../components/common/CenteredFooter';

export function VerifyLoginView({ candidate, handleLoginToTest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <header className="app-header">
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img 
            src={`${import.meta.env.BASE_URL}bics_logo.png`} 
            onError={(e) => { e.currentTarget.src = '/bics_logo.png'; }} 
            alt="BICS Logo" 
            style={{ height: '34px', width: '34px', objectFit: 'contain' }} 
          />
          <span className="pixel-logo">BICS Terminal</span>
        </div>
        <div className="header-right">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png`} 
            onError={(e) => { e.currentTarget.src = '/logo.png'; }} 
            alt="Portal Logo" 
            className="pe-logo" 
            style={{ height: '34px' }} 
          />
        </div>
      </header>
      <div style={{ display: 'flex', flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div className="cf-card" style={{ maxWidth: '400px', width: '100%', padding: '30px', border: '1px solid var(--cf-border)' }}>
          <div className="cf-card-title" style={{ justifyContent: 'center' }}>Secure Exam Identity Sign In</div>
          
          {/* Registration Photo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ width: '120px', height: '150px', border: '2px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#cbd5e1' }}>
              <img src={candidate?.photoUrl} alt="Candidate Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          <div className="cf-input-group" style={{ marginBottom: '15px' }}>
            <label className="cf-label">Candidate Name</label>
            <input type="text" className="cf-input" disabled value={candidate?.name || ''} />
          </div>
          <div className="cf-input-group" style={{ marginBottom: '25px' }}>
            <label className="cf-label">Student ID</label>
            <input type="text" className="cf-input" disabled value={candidate?.studentId || ''} />
          </div>

          <button className="cf-btn-primary" style={{ width: '100%', padding: '10px' }} onClick={handleLoginToTest}>
            Login to Test
          </button>
        </div>
      </div>
      <CenteredFooter />
    </div>
  );
}

export default VerifyLoginView;
