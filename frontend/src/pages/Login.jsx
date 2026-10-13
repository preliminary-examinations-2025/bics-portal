import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function Login({
  loginError,
  loginCreds,
  setLoginCreds,
  captchaCode,
  captchaInput,
  setCaptchaInput,
  generateCaptcha,
  rememberMe,
  setRememberMe,
  handleLoginSubmit
}) {
  const [isRefreshingCaptcha, setIsRefreshingCaptcha] = useState(false);

  const handleRefreshCaptcha = () => {
    if (isRefreshingCaptcha) return;
    setIsRefreshingCaptcha(true);
    generateCaptcha();
    setTimeout(() => setIsRefreshingCaptcha(false), 500);
  };
  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', width: '100%' }}>
      {/* PE Logo & Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '25px' }}>
        <img src="/logo.png" alt="Preliminary Examinations 2026 Logo" style={{ height: '80px', objectFit: 'contain', marginBottom: '10px' }} />
        <h2 style={{ fontSize: '13pt', fontWeight: 'bold', color: '#3b5998' }}>BICS Login</h2>
      </div>

      <div className="cf-card">
        <div className="cf-card-title">Portal Sign In</div>
        {loginError && <div className="cf-alert cf-alert-error">{loginError}</div>}
        
        <form onSubmit={handleLoginSubmit}>
          <div className="cf-input-group" style={{ marginBottom: '15px' }}>
            <label className="cf-label">User Account Name</label>
            <input type="text" className="cf-input" required value={loginCreds.username} onChange={e => setLoginCreds({...loginCreds, username: e.target.value})} />
          </div>
          <div className="cf-input-group" style={{ marginBottom: '15px' }}>
            <label className="cf-label">Secure Password</label>
            <input type="password" className="cf-input" required value={loginCreds.password} onChange={e => setLoginCreds({...loginCreds, password: e.target.value})} />
          </div>

          {/* Captcha verification section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
            <div style={{
              letterSpacing: '5px',
              fontWeight: 'bold',
              fontSize: '14pt',
              color: '#3b5998',
              backgroundColor: '#e8eff7',
              padding: '6px 12px',
              border: '1px solid #b9c9fe',
              fontFamily: 'Courier New, monospace',
              textDecoration: 'line-through',
              userSelect: 'none'
            }}>
              {captchaCode}
            </div>
            <button 
              type="button" 
              className="cf-btn-secondary" 
              onClick={handleRefreshCaptcha} 
              disabled={isRefreshingCaptcha}
              style={{ padding: '3px 8px', fontSize: '8.5pt', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshCw size={11} className={isRefreshingCaptcha ? 'spin-smooth' : ''} />
              <span>Refresh</span>
            </button>
          </div>
          <div className="cf-input-group" style={{ marginBottom: '15px' }}>
            <label className="cf-label">Enter Captcha Code</label>
            <input type="text" className="cf-input" required value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} placeholder="Case-insensitive" />
          </div>

          {/* Remember Me Checkbox */}
          <div style={{ marginBottom: '20px' }}>
            <label className="checkbox-label" style={{ display: 'flex', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '9pt' }}>
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              Remember me for 7 days
            </label>
          </div>

          <button type="submit" className="cf-btn-primary" style={{ width: '100%', padding: '6px' }}>Login</button>
        </form>
      </div>
    </div>
  );
}
