import React from 'react';

export default function ChangePassword({
  pwdMessage,
  pwdError,
  handleChangePassword,
  user,
  studentProfile,
  changePasswordCodeSent,
  sendingChangePasswordCode,
  handleSendChangePasswordCode,
  changePasswordEmailCode,
  setChangePasswordEmailCode,
  pwdForm,
  setPwdForm,
  changePasswordCaptchaCode,
  generateChangePasswordCaptcha,
  changePasswordCaptchaInput,
  setChangePasswordCaptchaInput
}) {
  return (
    <div className="cf-card" style={{ maxWidth: '400px', margin: '20px auto' }}>
      <div className="cf-card-title">Change Password</div>
      {pwdMessage && <div className="cf-alert cf-alert-success">{pwdMessage}</div>}
      {pwdError && <div className="cf-alert cf-alert-error">{pwdError}</div>}
      <form onSubmit={handleChangePassword}>
        {user?.role === 'student' && (
          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <div style={{ fontSize: '9pt', color: '#475569', marginBottom: '8px' }}>
              To change your password, you must verify your identity.
            </div>
            <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002147', marginBottom: '10px' }}>
              Email: {studentProfile?.registrationData?.personalEmail || studentProfile?.personalEmail || 'Registered Email'}
            </div>
            {!changePasswordCodeSent ? (
              <button
                type="button"
                className="cf-btn-secondary"
                disabled={sendingChangePasswordCode}
                onClick={handleSendChangePasswordCode}
                style={{ fontSize: '8.5pt', padding: '6px 12px' }}
              >
                {sendingChangePasswordCode ? "Sending Code..." : "Send Verification Code"}
              </button>
            ) : (
              <div className="cf-input-group" style={{ margin: 0 }}>
                <label className="cf-label" style={{ fontWeight: 'bold' }}>Enter 6-Digit Email Code</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="cf-input"
                    maxLength={6}
                    required
                    placeholder="e.g. 123456"
                    value={changePasswordEmailCode}
                    onChange={e => setChangePasswordEmailCode(e.target.value.replace(/\D/g, ''))}
                    style={{ flex: '2', letterSpacing: '2px', textAlign: 'center', fontWeight: 'bold' }}
                  />
                  <button
                    type="button"
                    className="cf-btn-secondary"
                    disabled={sendingChangePasswordCode}
                    onClick={handleSendChangePasswordCode}
                    style={{ flex: '1', fontSize: '8pt', padding: '6px' }}
                  >
                    Resend
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="cf-input-group" style={{ marginBottom: '15px' }}>
          <label className="cf-label">New Password</label>
          <input type="password" className="cf-input" required value={pwdForm.newPassword} onChange={e => setPwdForm({...pwdForm, newPassword: e.target.value})} placeholder="At least 4 characters" />
        </div>
        <div className="cf-input-group" style={{ marginBottom: '15px' }}>
          <label className="cf-label">Confirm New Password</label>
          <input type="password" className="cf-input" required value={pwdForm.confirmPassword} onChange={e => setPwdForm({...pwdForm, confirmPassword: e.target.value})} />
        </div>

        {/* CAPTCHA Challenge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px', marginTop: '15px' }}>
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
            {changePasswordCaptchaCode}
          </div>
          <button type="button" className="cf-btn-secondary" onClick={generateChangePasswordCaptcha} style={{ padding: '3px 8px', fontSize: '8.5pt' }}>
            Refresh
          </button>
        </div>
        <div className="cf-input-group" style={{ marginBottom: '20px' }}>
          <label className="cf-label">Enter Captcha Code</label>
          <input type="text" className="cf-input" required value={changePasswordCaptchaInput} onChange={e => setChangePasswordCaptchaInput(e.target.value)} placeholder="Case-insensitive" />
        </div>

        <button type="submit" className="cf-btn-primary" style={{ width: '100%' }}>Update Password</button>
      </form>
    </div>
  );
}
