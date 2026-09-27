import React from 'react';
import { RefreshCw } from 'lucide-react';
import { API_BASE } from '../../config';

export default function AdminTickets({
  fetchAdminTickets,
  adminTicketFilterCategory,
  setAdminTicketFilterCategory,
  adminTicketFilterStatus,
  setAdminTicketFilterStatus,
  adminTickets,
  selectedAdminTicket,
  setSelectedAdminTicket,
  adminTicketResolutionFeedback,
  setAdminTicketResolutionFeedback,
  adminTicketResolutionStatus,
  setAdminTicketResolutionStatus
}) {
  return (
    <div className="cf-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>Helpdesk Tickets & Requests</h2>
        <button className="cf-btn-secondary" onClick={fetchAdminTickets} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Refresh Tickets
        </button>
      </div>

      {/* Advanced Filter Bar */}
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '1px solid var(--cf-border)' }}>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Category Filter</label>
          <select
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
            value={adminTicketFilterCategory}
            onChange={e => setAdminTicketFilterCategory(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="suggestion">Suggestions</option>
            <option value="general_feedback">General Feedback</option>
            <option value="complaint">Complaints</option>
            <option value="enquiry">Enquiries</option>
            <option value="technical_problem">Technical Problems</option>
          </select>
        </div>

        <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Status Filter</label>
          <select
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
            value={adminTicketFilterStatus}
            onChange={e => setAdminTicketFilterStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th style={{ width: '150px' }}>Submitted Date</th>
              <th>Candidate Details</th>
              <th>Category</th>
              <th>Subject</th>
              <th style={{ width: '120px' }}>Status</th>
              <th style={{ width: '140px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let list = [...adminTickets];
              if (adminTicketFilterCategory !== 'ALL') {
                list = list.filter(t => t.category === adminTicketFilterCategory);
              }
              if (adminTicketFilterStatus !== 'ALL') {
                list = list.filter(t => t.status === adminTicketFilterStatus);
              }

              if (list.length === 0) {
                return (
                  <tr>
                    <td colSpan="6" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b' }}>No helpdesk tickets match the current filters.</td>
                  </tr>
                );
              }

              return (
                <>
                  {list.map((ticket, idx) => {
                    let statusBg = '#f1f5f9';
                    let statusColor = '#475569';
                    if (ticket.status === 'open') {
                      statusBg = '#eff6ff';
                      statusColor = '#2563eb';
                    } else if (ticket.status === 'resolved') {
                      statusBg = '#ecfdf5';
                      statusColor = '#059669';
                    } else if (ticket.status === 'closed') {
                      statusBg = '#f8fafc';
                      statusColor = '#64748b';
                    }

                    let categoryLabel = ticket.category;
                    if (ticket.category === 'suggestion') categoryLabel = 'Suggestion';
                    else if (ticket.category === 'general_feedback') categoryLabel = 'General Feedback';
                    else if (ticket.category === 'complaint') categoryLabel = 'Complaint';
                    else if (ticket.category === 'enquiry') categoryLabel = 'Enquiry';
                    else if (ticket.category === 'technical_problem') categoryLabel = 'Technical Problem';

                    const tId = ticket.id || ticket._id;

                    return (
                      <tr key={tId || idx}>
                        <td style={{ fontSize: '8.5pt' }}>{new Date(ticket.createdAt).toLocaleString()}</td>
                        <td>
                          <div style={{ fontWeight: 'bold', fontSize: '9pt', color: '#1e293b' }}>{ticket.candidateName}</div>
                          <div style={{ fontSize: '7.5pt', color: '#64748b' }}>ID: {ticket.studentId}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: '8.5pt', fontWeight: 'bold', padding: '2px 8px', backgroundColor: '#e2e8f0', color: '#334155', borderRadius: '4px' }}>
                            {categoryLabel}
                          </span>
                        </td>
                        <td style={{ fontSize: '9pt', color: '#334155', fontWeight: '500' }}>{ticket.subject}</td>
                        <td>
                          <span className="status-badge" style={{ backgroundColor: statusBg, color: statusColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {ticket.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="cf-btn-secondary"
                            onClick={() => {
                              setSelectedAdminTicket(ticket);
                              setAdminTicketResolutionFeedback(ticket.resolutionFeedback || '');
                              setAdminTicketResolutionStatus(ticket.status || 'resolved');
                            }}
                            style={{ padding: '4px 10px', fontSize: '8.5pt', margin: 0 }}
                          >
                            View / Resolve
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })()}
          </tbody>
        </table>
      </div>

      {/* ADMIN RESOLUTION DETAIL MODAL */}
      {selectedAdminTicket && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="cf-card" style={{ width: '90%', maxWidth: '600px', padding: '20px', border: '1px solid #b9c9fe', boxShadow: 'none', backgroundColor: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="cf-card-title" style={{ marginTop: '-20px', marginLeft: '-20px', marginRight: '-20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Ticket Details & Resolution</span>
              <button className="cf-btn-secondary" style={{ padding: '2px 8px', border: 'none' }} onClick={() => setSelectedAdminTicket(null)}>✕</button>
            </div>

            <div style={{ borderBottom: '1px solid var(--cf-border)', paddingBottom: '15px', marginBottom: '15px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '8.5pt', color: '#64748b', marginBottom: '10px' }}>
                <div><strong>Candidate:</strong> {selectedAdminTicket.candidateName} ({selectedAdminTicket.studentId})</div>
                <div><strong>Submitted:</strong> {new Date(selectedAdminTicket.createdAt).toLocaleString()}</div>
                <div><strong>Category:</strong> <span style={{ textTransform: 'capitalize' }}>{selectedAdminTicket.category?.replace('_', ' ')}</span></div>
                <div><strong>Current Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{selectedAdminTicket.status}</span></div>
              </div>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#002147', margin: '10px 0 6px 0' }}>
                Subject: {selectedAdminTicket.subject}
              </h3>
              <div style={{ backgroundColor: '#f8fafc', padding: '12px', border: '1px solid var(--cf-border)', borderRadius: '4px', fontSize: '9pt', color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: '1.5', maxHeight: '180px', overflowY: 'auto' }}>
                {selectedAdminTicket.message}
              </div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const ticketId = selectedAdminTicket.id || selectedAdminTicket._id;
                const res = await fetch(`${API_BASE}/admin/tickets/resolve/${ticketId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    status: adminTicketResolutionStatus,
                    resolutionFeedback: adminTicketResolutionFeedback
                  })
                });
                const data = await res.json();
                if (data.success) {
                  setSelectedAdminTicket(null);
                  fetchAdminTickets();
                } else {
                  alert(data.error || "Failed to update ticket.");
                }
              } catch (err) {
                alert("Network error. Failed to resolve ticket.");
              }
            }}>
              <div className="cf-input-group" style={{ marginBottom: '15px' }}>
                <label className="cf-label">Update Status *</label>
                <select
                  className="cf-input"
                  value={adminTicketResolutionStatus}
                  onChange={e => setAdminTicketResolutionStatus(e.target.value)}
                  required
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="cf-input-group" style={{ marginBottom: '20px' }}>
                <label className="cf-label">Administrative Response / Comments</label>
                <textarea
                  className="cf-input"
                  rows="4"
                  placeholder="Provide feedback or resolution details to the candidate..."
                  value={adminTicketResolutionFeedback}
                  onChange={e => setAdminTicketResolutionFeedback(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="cf-btn-secondary" onClick={() => setSelectedAdminTicket(null)}>
                  Cancel
                </button>
                <button type="submit" className="cf-btn-primary">
                  Save Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
