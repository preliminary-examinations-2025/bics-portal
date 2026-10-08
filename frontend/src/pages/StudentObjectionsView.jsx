import React, { useState, useEffect } from 'react';
import { Flag, CheckCircle, Clock, AlertTriangle, FileText, Search, ExternalLink, Paperclip, ChevronRight, XCircle } from 'lucide-react';
import RichText from '../components/RichText';

export default function StudentObjectionsView({ user, studentObjectionsList = [], fetchStudentObjections, setView }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (user && fetchStudentObjections) {
      fetchStudentObjections(user.id || user._id);
    }
  }, [user]);

  const filteredObjections = studentObjectionsList.filter(obj => {
    const matchesSearch = 
      (obj.objectionId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (obj.testTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (obj.reason || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (obj.details || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'pending') return matchesSearch && obj.status === 'pending';
    if (statusFilter === 'resolved') return matchesSearch && (obj.status === 'resolved' || obj.status === 'resolved_accepted');
    if (statusFilter === 'rejected') return matchesSearch && obj.status === 'rejected';
    return matchesSearch;
  });

  const pendingCount = studentObjectionsList.filter(o => o.status === 'pending').length;
  const resolvedCount = studentObjectionsList.filter(o => o.status === 'resolved' || o.status === 'resolved_accepted').length;
  const rejectedCount = studentObjectionsList.filter(o => o.status === 'rejected').length;

  return (
    <div className="cf-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Flag size={20} style={{ color: '#b45309' }} />
          <div>
            <h2 style={{ fontSize: '13pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>
              Examination Grievances &amp; Objections
            </h2>
            <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
              Track the resolution status of your submitted question objections across online examinations.
            </div>
          </div>
        </div>

        <button 
          className="cf-btn-secondary" 
          onClick={() => fetchStudentObjections && fetchStudentObjections(user.id || user._id)}
          style={{ fontSize: '8.5pt', padding: '6px 14px' }}
        >
          Refresh Status
        </button>
      </div>

      {/* Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 'bold' }}>Total Objections Logged</div>
          <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#002147', marginTop: '4px' }}>
            {studentObjectionsList.length}
          </div>
        </div>

        <div style={{ backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ fontSize: '8.5pt', color: '#92400e', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} /> Under Academic Review
          </div>
          <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#b45309', marginTop: '4px' }}>
            {pendingCount}
          </div>
        </div>

        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ fontSize: '8.5pt', color: '#166534', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={14} /> Accepted &amp; Credit Revised
          </div>
          <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
            {resolvedCount}
          </div>
        </div>

        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 16px' }}>
          <div style={{ fontSize: '8.5pt', color: '#991b1b', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <XCircle size={14} /> Grievance Declined
          </div>
          <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#b91c1c', marginTop: '4px' }}>
            {rejectedCount}
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px' }}>
          <Search size={14} style={{ color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search by Objection ID, test, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '9pt', color: '#334155' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button 
            className={`cf-btn-${statusFilter === 'all' ? 'primary' : 'secondary'}`} 
            onClick={() => setStatusFilter('all')}
            style={{ padding: '4px 12px', fontSize: '8.5pt' }}
          >
            All ({studentObjectionsList.length})
          </button>
          <button 
            className={`cf-btn-${statusFilter === 'pending' ? 'primary' : 'secondary'}`} 
            onClick={() => setStatusFilter('pending')}
            style={{ padding: '4px 12px', fontSize: '8.5pt' }}
          >
            Pending ({pendingCount})
          </button>
          <button 
            className={`cf-btn-${statusFilter === 'resolved' ? 'primary' : 'secondary'}`} 
            onClick={() => setStatusFilter('resolved')}
            style={{ padding: '4px 12px', fontSize: '8.5pt' }}
          >
            Accepted ({resolvedCount})
          </button>
          <button 
            className={`cf-btn-${statusFilter === 'rejected' ? 'primary' : 'secondary'}`} 
            onClick={() => setStatusFilter('rejected')}
            style={{ padding: '4px 12px', fontSize: '8.5pt' }}
          >
            Declined ({rejectedCount})
          </button>
        </div>
      </div>

      {/* Objections List Container */}
      {filteredObjections.length === 0 ? (
        <div className="cf-alert cf-alert-info" style={{ textAlign: 'center', padding: '24px' }}>
          {studentObjectionsList.length === 0 
            ? "No question objections recorded yet. You can raise objections directly from the Online Test Review Terminal during active verification windows."
            : "No objections matching your filter criteria."}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredObjections.map((obj, idx) => {
            const isPending = obj.status === 'pending';
            const isAccepted = obj.status === 'resolved' || obj.status === 'resolved_accepted';
            const isRejected = obj.status === 'rejected';

            let statusBg = '#fefce8';
            let statusBorder = '#fef08a';
            let statusText = '#92400e';
            let statusLabel = 'Under Committee Review';

            if (isAccepted) {
              statusBg = '#f0fdf4';
              statusBorder = '#bbf7d0';
              statusText = '#166534';
              statusLabel = 'Resolved / Credit Revised';
            } else if (isRejected) {
              statusBg = '#fef2f2';
              statusBorder = '#fecaca';
              statusText = '#991b1b';
              statusLabel = 'Grievance Declined';
            }

            const q = obj.targetQuestion;
            const qTitle = q?.title || `Question #${obj.questionIndex + 1}`;
            const qDesc = q?.description || q?.questionText || q?.problemStatement || q?.text || '';

            return (
              <div 
                key={idx}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ 
                        backgroundColor: '#f1f5f9', 
                        color: '#002147', 
                        border: '1px solid #cbd5e1', 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        fontSize: '8pt', 
                        fontWeight: 'bold',
                        fontFamily: 'monospace'
                      }}>
                        {obj.objectionId || `OBJ-${idx + 1}`}
                      </span>
                      <h4 style={{ fontSize: '11pt', color: '#002147', fontWeight: 'bold', margin: 0 }}>
                        {obj.testTitle || 'Examination Test'} — Question #{obj.questionIndex + 1}
                      </h4>
                    </div>

                    <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '4px' }}>
                      Logged on: {new Date(obj.raisedAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span style={{
                    backgroundColor: statusBg,
                    border: `1px solid ${statusBorder}`,
                    color: statusText,
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '8pt',
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {isAccepted && <CheckCircle size={12} />}
                    {isPending && <Clock size={12} />}
                    {isRejected && <XCircle size={12} />}
                    {statusLabel}
                  </span>
                </div>

                {/* Target Question Context Box */}
                {q && (
                  <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '10px 14px', fontSize: '8.5pt', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Question Context:</span>
                      <RichText text={qTitle} style={{ fontWeight: 'bold', color: '#002147' }} />
                    </div>
                    {qDesc && (
                      <div style={{ color: '#0f172a', lineHeight: '1.5', borderTop: '1px dashed #bae6fd', paddingTop: '6px', marginTop: '2px' }}>
                        <RichText text={qDesc} style={{ color: '#0f172a' }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Objection Category & Explanation */}
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 14px', fontSize: '9pt' }}>
                  <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Category: <span style={{ color: '#002147' }}>{obj.reason}</span>
                  </div>
                  <div style={{ color: '#334155', lineHeight: 1.5 }}>
                    {obj.details}
                  </div>

                  {/* Supporting Attachments Preview */}
                  {Array.isArray(obj.attachments) && obj.attachments.length > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: '8pt', fontWeight: 'bold', color: '#64748b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Paperclip size={12} /> Supporting Attachments ({obj.attachments.length}):
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {obj.attachments.map((att, aIdx) => (
                          <a
                            key={aIdx}
                            href={att}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '8pt',
                              color: '#0284c7',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <FileText size={12} /> Attachment #{aIdx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Official Resolution Remarks Panel */}
                {!isPending && (
                  <div style={{ 
                    backgroundColor: isAccepted ? '#f0fdf4' : '#fef2f2', 
                    border: `1px solid ${isAccepted ? '#bbf7d0' : '#fecaca'}`, 
                    borderRadius: '6px', 
                    padding: '12px 14px', 
                    fontSize: '8.5pt' 
                  }}>
                    <div style={{ fontWeight: 'bold', color: isAccepted ? '#166534' : '#991b1b', marginBottom: '4px' }}>
                      Committee Resolution Remarks:
                    </div>
                    <div style={{ color: '#334155', lineHeight: 1.5 }}>
                      {obj.adminRemarks || (isAccepted ? 'Grievance verified and credit updated.' : 'Objection evaluated by academic panel. Marks maintained.')}
                    </div>

                    {isAccepted && obj.resolvedMarks !== null && (
                      <div style={{ marginTop: '6px', fontWeight: 'bold', color: '#15803d' }}>
                        Updated Question Score: {obj.resolvedMarks} pts
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
