import React from 'react';
import { Mail, LifeBuoy, Loader2, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';

export default function SupportTicketView({
  studentProfile,
  user,
  contactSubView,
  setContactSubView,
  contactSuccess,
  setContactSuccess,
  contactError,
  setContactError,
  fetchStudentTickets,
  studentTickets,
  contactCategory,
  setContactCategory,
  contactSubject,
  setContactSubject,
  contactMessage,
  setContactMessage,
  isSubmittingContact,
  setIsSubmittingContact
}) {
  return (
    <div className="cf-card">
      {/* Outer Box Header matching Portal Institutional Style */}
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Mail size={16} style={{ color: '#3b5998' }} />
        <span>Candidate Support Helpdesk</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button 
            type="button"
            className={`cf-btn-${contactSubView === 'form' ? 'primary' : 'secondary'}`} 
            onClick={() => { setContactSubView('form'); setContactSuccess(''); setContactError(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '8pt', padding: '3px 10px', height: '26px' }}
          >
            <Mail size={12} /> Submit Request
          </button>
          <button 
            type="button"
            className={`cf-btn-${contactSubView === 'history' ? 'primary' : 'secondary'}`} 
            onClick={() => { setContactSubView('history'); setContactSuccess(''); setContactError(''); fetchStudentTickets(user.id || user._id); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '8pt', padding: '3px 10px', height: '26px' }}
          >
            <LifeBuoy size={12} /> My Requests ({studentTickets.length})
          </button>
        </div>
      </div>

      {contactSubView === 'form' && (
        <div style={{
          maxWidth: '660px',
          margin: '15px auto 20px auto',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '24px 28px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}>
          {/* Card Title & Institutional Subtitle */}
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '11.5pt', fontWeight: 700, color: '#002147', margin: 0 }}>
              Send a Suggestion, Feedback, Complaint, or Open a Ticket
            </h3>
            <p style={{ fontSize: '8.5pt', color: '#64748b', margin: '4px 0 0 0', lineHeight: 1.4 }}>
              Direct inquiry and grievance routing to academic advisors and technical administrators.
            </p>
          </div>
          
          {contactSuccess && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', color: '#166534', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={15} color="#16a34a" />
              <span>{contactSuccess}</span>
            </div>
          )}
          {contactError && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#991b1b', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={15} color="#dc2626" />
              <span>{contactError}</span>
            </div>
          )}

          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!contactSubject.trim() || !contactMessage.trim()) {
              setContactError("Please fill out all required fields.");
              return;
            }
            setIsSubmittingContact(true);
            setContactSuccess('');
            setContactError('');
            try {
              const res = await fetch(`${API_BASE}/candidate/tickets/${user.id || user._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  category: contactCategory,
                  subject: contactSubject,
                  message: contactMessage
                })
              });
              const data = await res.json();
              if (data.success) {
                setContactSuccess("Your helpdesk request has been successfully submitted!");
                setContactSubject('');
                setContactMessage('');
                fetchStudentTickets(user.id || user._id);
              } else {
                setContactError(data.error || "Submission failed.");
              }
            } catch (err) {
              setContactError("Network error. Failed to connect to server.");
            } finally {
              setIsSubmittingContact(false);
            }
          }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Request Category <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <select 
                className="cf-input" 
                value={contactCategory} 
                onChange={e => setContactCategory(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '9pt',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff',
                  color: '#0f172a'
                }}
              >
                <option value="suggestion">Suggestion</option>
                <option value="general_feedback">General Feedback</option>
                <option value="complaint">Complaint</option>
                <option value="enquiry">General Enquiry</option>
                <option value="technical_problem">Technical Problem (Open Ticket)</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Subject / Summary <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input 
                type="text" 
                className="cf-input" 
                placeholder="Brief summary of your request..."
                value={contactSubject}
                onChange={e => setContactSubject(e.target.value)}
                required
                maxLength={100}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  fontSize: '9pt',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  color: '#0f172a'
                }}
              />
            </div>

            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Message / Details <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <textarea 
                className="cf-input" 
                rows="6" 
                placeholder="Provide details about your query, feedback, or technical issue..."
                value={contactMessage}
                onChange={e => setContactMessage(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  fontSize: '9pt',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  color: '#0f172a',
                  resize: 'vertical',
                  minHeight: '110px',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <button 
              type="submit" 
              disabled={isSubmittingContact}
              style={{
                width: '100%',
                display: 'inline-flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                fontSize: '9pt',
                fontWeight: 700,
                backgroundColor: '#ffffff',
                color: '#002147',
                border: '1.5px solid #002147',
                borderRadius: '4px',
                cursor: isSubmittingContact ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                opacity: isSubmittingContact ? 0.7 : 1,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { if (!isSubmittingContact) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
            >
              {isSubmittingContact ? (
                <>
                  <Loader2 size={16} className="spinner" /> Submitting Request...
                </>
              ) : (
                <>
                  <Send size={14} color="#002147" />
                  <span>{contactCategory === 'technical_problem' ? "Open Support Ticket" : "Submit Request"}</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {contactSubView === 'history' && (
        <div>
          {studentTickets.length === 0 ? (
            <div className="cf-card" style={{ padding: '30px', textAlign: 'center', color: '#64748b', borderStyle: 'dashed' }}>
              <Mail size={40} style={{ color: '#cbd5e1', marginBottom: '10px' }} />
              <p style={{ margin: 0, fontSize: '9.5pt' }}>You have not submitted any helpdesk requests or support tickets yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {studentTickets.map(t => {
                const tId = t.id || t._id;
                let categoryLabel = t.category;
                if (t.category === 'suggestion') categoryLabel = 'Suggestion';
                else if (t.category === 'general_feedback') categoryLabel = 'General Feedback';
                else if (t.category === 'complaint') categoryLabel = 'Complaint';
                else if (t.category === 'enquiry') categoryLabel = 'Enquiry';
                else if (t.category === 'technical_problem') categoryLabel = 'Technical Problem';

                let statusBg = '#f1f5f9';
                let statusColor = '#475569';
                if (t.status === 'open') {
                  statusBg = '#eff6ff';
                  statusColor = '#2563eb';
                } else if (t.status === 'resolved') {
                  statusBg = '#ecfdf5';
                  statusColor = '#059669';
                } else if (t.status === 'closed') {
                  statusBg = '#f8fafc';
                  statusColor = '#64748b';
                }

                return (
                  <div key={tId} className="cf-card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                      <div>
                        <span style={{ fontSize: '8pt', color: '#64748b', display: 'block' }}>{new Date(t.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                        <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '4px 0 0 0' }}>
                          {t.subject}
                        </h3>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '8pt', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#e2e8f0', color: '#334155', borderRadius: '4px' }}>
                          {categoryLabel}
                        </span>
                        <span style={{ fontSize: '8pt', fontWeight: 'bold', padding: '2px 8px', backgroundColor: statusBg, color: statusColor, borderRadius: '4px', textTransform: 'uppercase' }}>
                          {t.status}
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: '9pt', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: '1.5', margin: '0 0 15px 0' }}>
                      {t.message}
                    </p>

                    {(t.status === 'resolved' || t.resolutionFeedback) && (
                      <div style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid #10b981', padding: '12px', borderRadius: '4px', marginTop: '10px' }}>
                        <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#065f46', display: 'block', marginBottom: '4px' }}>
                          Support Resolution Response:
                        </span>
                        <p style={{ fontSize: '9pt', color: '#0f172a', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                          {t.resolutionFeedback || 'This request has been marked as resolved by the portal administrator.'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
