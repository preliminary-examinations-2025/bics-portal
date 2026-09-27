import React from 'react';
import { Mail, LifeBuoy, Loader2 } from 'lucide-react';
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Support Helpdesk</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`cf-btn-${contactSubView === 'form' ? 'primary' : 'secondary'}`} 
            onClick={() => { setContactSubView('form'); setContactSuccess(''); setContactError(''); }}
            style={{ fontSize: '8.5pt', padding: '6px 12px' }}
          >
            <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Submit Request
          </button>
          <button 
            className={`cf-btn-${contactSubView === 'history' ? 'primary' : 'secondary'}`} 
            onClick={() => { setContactSubView('history'); setContactSuccess(''); setContactError(''); fetchStudentTickets(user.id || user._id); }}
            style={{ fontSize: '8.5pt', padding: '6px 12px' }}
          >
            <LifeBuoy size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> My Requests ({studentTickets.length})
          </button>
        </div>
      </div>

      {contactSubView === 'form' && (
        <div className="cf-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="cf-card-title">Send a Suggestion, Feedback, Complaint, or Open a Ticket</div>
          
          {contactSuccess && <div className="cf-alert cf-alert-success" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{contactSuccess}</div>}
          {contactError && <div className="cf-alert cf-alert-danger" style={{ fontSize: '9pt', padding: '8px 12px', marginBottom: '15px' }}>{contactError}</div>}

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
            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
              <label className="cf-label">Request Category *</label>
              <select 
                className="cf-input" 
                value={contactCategory} 
                onChange={e => setContactCategory(e.target.value)}
                required
              >
                <option value="suggestion">Suggestion</option>
                <option value="general_feedback">General Feedback</option>
                <option value="complaint">Complaint</option>
                <option value="enquiry">General Enquiry</option>
                <option value="technical_problem">Technical Problem (Open Ticket)</option>
              </select>
            </div>

            <div className="cf-input-group" style={{ marginBottom: '15px' }}>
              <label className="cf-label">Subject *</label>
              <input 
                type="text" 
                className="cf-input" 
                placeholder="Brief summary of your request..."
                value={contactSubject}
                onChange={e => setContactSubject(e.target.value)}
                required
                maxLength={100}
              />
            </div>

            <div className="cf-input-group" style={{ marginBottom: '20px' }}>
              <label className="cf-label">Message / Details *</label>
              <textarea 
                className="cf-input" 
                rows="6" 
                placeholder="Provide details about your query, feedback, or technical issue..."
                value={contactMessage}
                onChange={e => setContactMessage(e.target.value)}
                required
              />
            </div>

            <button 
              type="submit" 
              className="cf-btn-primary" 
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              disabled={isSubmittingContact}
            >
              {isSubmittingContact ? (
                <>
                  <Loader2 size={16} className="spinner" /> Submitting Request...
                </>
              ) : (
                contactCategory === 'technical_problem' ? "Open Support Ticket" : "Submit Request"
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
                        <span style={{ fontSize: '8pt', color: '#64748b', display: 'block' }}>{new Date(t.createdAt).toLocaleString()}</span>
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
