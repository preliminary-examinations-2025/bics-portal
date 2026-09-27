import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function AdminLogs({
  fetchSystemLogs,
  logFilterActor,
  setLogFilterActor,
  setLogPage,
  logFilterAction,
  setLogFilterAction,
  logFilterSeverity,
  setLogFilterSeverity,
  systemLogs,
  logPage
}) {
  return (
    <div className="cf-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '18pt', color: '#002147', margin: 0 }}>System Audit & Exception Logs</h2>
        <button className="cf-btn-secondary" onClick={fetchSystemLogs} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Refresh Logs
        </button>
      </div>

      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '4px', marginBottom: '20px', border: '1px solid var(--cf-border)' }}>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Search Actor</label>
          <input
            type="text"
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px' }}
            placeholder="Enter actor name..."
            value={logFilterActor}
            onChange={e => { setLogFilterActor(e.target.value); setLogPage(1); }}
          />
        </div>

        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Action Type</label>
          <select
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
            value={logFilterAction}
            onChange={e => { setLogFilterAction(e.target.value); setLogPage(1); }}
          >
            <option value="ALL">All Actions</option>
            <option value="USER_SIGN_IN">USER_SIGN_IN</option>
            <option value="USER_SIGN_OUT">USER_SIGN_OUT</option>
            <option value="SIGN_IN_FAILED">SIGN_IN_FAILED</option>
            <option value="REGISTRATION_COMPLETE">REGISTRATION_COMPLETE</option>
            <option value="REGISTRATION_FAILED">REGISTRATION_FAILED</option>
            <option value="REGISTRATION_CONNECTION_FAILED">REGISTRATION_CONNECTION_FAILED</option>
            <option value="PROCTOR_ALERT_FULLSCREEN_EXIT">PROCTOR_ALERT_FULLSCREEN_EXIT</option>
            <option value="PROCTOR_ALERT_TAB_SWITCH">PROCTOR_ALERT_TAB_SWITCH</option>
            <option value="TECHNICAL_ERROR">TECHNICAL_ERROR</option>
            <option value="TEST_CREATED">TEST_CREATED</option>
            <option value="TEST_DELETED">TEST_DELETED</option>
            <option value="CANDIDATE_EVALUATED">CANDIDATE_EVALUATED</option>
          </select>
        </div>

        <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569' }}>Severity</label>
          <select
            className="cf-input"
            style={{ fontSize: '9pt', padding: '6px 10px', height: '34px' }}
            value={logFilterSeverity}
            onChange={e => { setLogFilterSeverity(e.target.value); setLogPage(1); }}
          >
            <option value="ALL">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      <div className="table-responsive" style={{ border: '1px solid var(--cf-border)', borderRadius: '4px', overflow: 'hidden' }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th style={{ width: '180px' }}>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Details</th>
              <th style={{ width: '120px' }}>Severity</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let list = [...systemLogs];
              if (logFilterActor.trim()) {
                const q = logFilterActor.toLowerCase();
                list = list.filter(l => l.actor && l.actor.toLowerCase().includes(q));
              }
              if (logFilterAction !== 'ALL') {
                list = list.filter(l => l.action === logFilterAction);
              }
              if (logFilterSeverity !== 'ALL') {
                list = list.filter(l => l.severity === logFilterSeverity);
              }

              const limit = 15;
              const totalCount = list.length;
              const maxPage = Math.ceil(totalCount / limit) || 1;
              const pageIndex = Math.min(logPage, maxPage);
              const paginatedList = list.slice((pageIndex - 1) * limit, pageIndex * limit);

              if (paginatedList.length === 0) {
                return (
                  <tr>
                    <td colSpan="5" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b' }}>No system logs match the current filters.</td>
                  </tr>
                );
              }

              return (
                <>
                  {paginatedList.map((log, idx) => {
                    let badgeBg = '#f1f5f9';
                    let badgeCol = '#475569';
                    if (log.severity === 'warning') {
                      badgeBg = '#fef3c7';
                      badgeCol = '#d97706';
                    } else if (log.severity === 'error') {
                      badgeBg = '#fee2e2';
                      badgeCol = '#dc2626';
                    }
                    return (
                      <tr key={idx}>
                        <td style={{ fontSize: '8.5pt' }}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td style={{ fontWeight: 'bold', fontSize: '9pt', color: '#1e293b' }}>{log.actor}</td>
                        <td style={{ fontSize: '9pt' }}>
                          <span style={{ fontFamily: 'Fira Code, monospace', padding: '2px 6px', backgroundColor: '#e2e8f0', borderRadius: '4px', fontSize: '8pt', color: '#0f172a' }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ fontSize: '9pt', color: '#334155', maxWidth: '420px', whiteSpace: 'pre-wrap' }}>{log.details}</td>
                        <td>
                          <span className="status-badge" style={{ backgroundColor: badgeBg, color: badgeCol, fontWeight: 'bold' }}>
                            {log.severity?.toUpperCase()}
                          </span>
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

      {(() => {
        let list = [...systemLogs];
        if (logFilterActor.trim()) {
          const q = logFilterActor.toLowerCase();
          list = list.filter(l => l.actor && l.actor.toLowerCase().includes(q));
        }
        if (logFilterAction !== 'ALL') {
          list = list.filter(l => l.action === logFilterAction);
        }
        if (logFilterSeverity !== 'ALL') {
          list = list.filter(l => l.severity === logFilterSeverity);
        }

        const limit = 15;
        const totalCount = list.length;
        const maxPage = Math.ceil(totalCount / limit) || 1;
        const pageIndex = Math.min(logPage, maxPage);
        const startIdx = totalCount === 0 ? 0 : (pageIndex - 1) * limit + 1;
        const endIdx = Math.min(pageIndex * limit, totalCount);

        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '12px', borderTop: '1px solid var(--cf-border)' }}>
            <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
              Showing {startIdx} to {endIdx} of {totalCount} log entries
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="cf-btn-secondary"
                disabled={pageIndex <= 1}
                onClick={() => setLogPage(pageIndex - 1)}
                style={{ padding: '4px 10px', fontSize: '8.5pt', margin: 0 }}
              >
                Previous
              </button>
              <button
                className="cf-btn-secondary"
                disabled={pageIndex >= maxPage}
                onClick={() => setLogPage(pageIndex + 1)}
                style={{ padding: '4px 10px', fontSize: '8.5pt', margin: 0 }}
              >
                Next
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
