import React from 'react';

export default function ExitFormView({
  systemConfig,
  studentProfile,
  exitSuccess,
  exitAnswers,
  setExitAnswers,
  handleExitSubmit
}) {
  return (
    <div className="cf-card">
      <div className="cf-card-title">BICS Course Exit Questionnaire</div>
      
      {!systemConfig?.exitFormActive ? (
        <div className="cf-alert cf-alert-info">
          Exit form is currently disabled.
        </div>
      ) : studentProfile?.exitFormSubmitted ? (
        <div className="cf-alert cf-alert-success">
          You have successfully submitted your BICS program exit form. Thank you for your feedback!
        </div>
      ) : (
        <div>
          {exitSuccess && <div className="cf-alert cf-alert-success">{exitSuccess}</div>}
          <form onSubmit={handleExitSubmit}>
            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
              <label className="cf-label">What is your primary reason for exiting the program?</label>
              <input type="text" className="cf-input" required value={exitAnswers.reason} onChange={e => setExitAnswers({...exitAnswers, reason: e.target.value})} placeholder="Reason for completion/exit" />
            </div>
            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
              <label className="cf-label">Would you recommend the Preliminary Examinations BICS course to others?</label>
              <input type="text" className="cf-input" required value={exitAnswers.recommendation} onChange={e => setExitAnswers({...exitAnswers, recommendation: e.target.value})} placeholder="Yes/No and reason" />
            </div>
            <div className="cf-input-group" style={{ marginBottom: '20px' }}>
              <label className="cf-label">Overall Program rating (1-10)</label>
              <select className="cf-input" style={{ maxWidth: '80px' }} value={exitAnswers.rating} onChange={e => setExitAnswers({...exitAnswers, rating: e.target.value})}>
                {[1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v.toString()}>{v}</option>)}
              </select>
            </div>
            <button type="submit" className="cf-btn-primary">Submit Exit Form</button>
          </form>
        </div>
      )}
    </div>
  );
}
