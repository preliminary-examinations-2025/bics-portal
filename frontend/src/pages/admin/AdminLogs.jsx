import React, { useState } from 'react';
import { RefreshCw, Terminal, Table } from 'lucide-react';

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
  const [viewMode, setViewMode] = useState('terminal'); // 'terminal' (default light console) or 'table'

  // Filter logs based on actor, action, and severity
  let filteredLogs = [...(systemLogs || [])];
  if (logFilterActor?.trim()) {
    const q = logFilterActor.toLowerCase();
    filteredLogs = filteredLogs.filter(l => l.actor && l.actor.toLowerCase().includes(q));
  }
  if (logFilterAction !== 'ALL') {
    filteredLogs = filteredLogs.filter(l => l.action === logFilterAction);
  }
  if (logFilterSeverity !== 'ALL') {
    filteredLogs = filteredLogs.filter(l => l.severity === logFilterSeverity);
  }

  const limit = 20;
  const totalCount = filteredLogs.length;
  const maxPage = Math.ceil(totalCount / limit) || 1;
  const pageIndex = Math.min(logPage || 1, maxPage);
  const paginatedList = filteredLogs.slice((pageIndex - 1) * limit, pageIndex * limit);
  const startIdx = totalCount === 0 ? 0 : (pageIndex - 1) * limit + 1;
  const endIdx = Math.min(pageIndex * limit, totalCount);

  // Subtle light theme severity styles (no dark, no neon/bright colors)
  const getSeverityStyle = (sev) => {
    switch (sev?.toLowerCase()) {
      case 'error':
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          text: '#991b1b',
          tag: 'ERROR'
        };
      case 'warning':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          text: '#92400e',
          tag: 'WARN '
        };
      case 'info':
      default:
        return {
          bg: '#eff6ff',
          border: '#bfdbfe',
          text: '#1e40af',
          tag: 'INFO '
        };
    }
  };

  return (
    <div className="cf-card" style={{ borderTop: '3px solid var(--oxford-blue, #3b5998)' }}>
      {/* HEADER & CONTROLS */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '18px',
        borderBottom: '1px solid var(--cf-border, #cbd5e1)',
        paddingBottom: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '16pt', color: '#002147', margin: 0, fontWeight: '700' }}>
            System Audit &amp; Event Logs
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '8.5pt', color: '#64748b' }}>
            Consolidated live platform diagnostics and candidate audit trails.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* VIEW SWITCHER: Light Terminal vs Structured Table */}
          <div style={{
            display: 'inline-flex',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            padding: '2px'
          }}>
            <button
              onClick={() => setViewMode('terminal')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 9px',
                fontSize: '8pt',
                fontWeight: viewMode === 'terminal' ? 'bold' : 'normal',
                backgroundColor: viewMode === 'terminal' ? '#002147' : 'transparent',
                color: viewMode === 'terminal' ? '#ffffff' : '#475569',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              <Terminal size={12} /> Terminal Console
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 9px',
                fontSize: '8pt',
                fontWeight: viewMode === 'table' ? 'bold' : 'normal',
                backgroundColor: viewMode === 'table' ? '#002147' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : '#475569',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              <Table size={12} /> Table View
            </button>
          </div>

          <button
            className="cf-btn-secondary"
            onClick={fetchSystemLogs}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', padding: '4px 10px' }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* FILTERS TOOLBAR */}
      <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        backgroundColor: '#f8fafc',
        padding: '12px 14px',
        borderRadius: '6px',
        marginBottom: '16px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8pt', fontWeight: 'bold', color: '#475569' }}>Search Actor / User</label>
          <input
            type="text"
            className="cf-input"
            style={{ fontSize: '8.5pt', padding: '5px 8px', fontFamily: 'Consolas, "Lucida Console", Courier, monospace' }}
            placeholder="e.g. admin, student..."
            value={logFilterActor}
            onChange={e => { setLogFilterActor(e.target.value); setLogPage(1); }}
          />
        </div>

        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '8pt', fontWeight: 'bold', color: '#475569' }}>Action Type</label>
          <select
            className="cf-input"
            style={{ fontSize: '8.5pt', padding: '5px 8px', height: '32px', fontFamily: 'Consolas, "Lucida Console", Courier, monospace' }}
            value={logFilterAction}
            onChange={e => { setLogFilterAction(e.target.value); setLogPage(1); }}
          >
            <option value="ALL">ALL ACTIONS</option>
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
          <label style={{ fontSize: '8pt', fontWeight: 'bold', color: '#475569' }}>Severity</label>
          <select
            className="cf-input"
            style={{ fontSize: '8.5pt', padding: '5px 8px', height: '32px' }}
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

      {/* VIEW MODE 1: AUTHENTIC LIGHT TERMINAL CONSOLE */}
      {viewMode === 'terminal' ? (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          padding: '12px 14px',
          fontFamily: 'Consolas, "Lucida Console", "Liberation Mono", Courier, monospace',
          fontSize: '8.5pt',
          color: '#334155',
          lineHeight: '1.6',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)',
          minHeight: '260px',
          maxHeight: '480px',
          overflowY: 'auto'
        }}>
          {paginatedList.length === 0 ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
              No system log records match the current filters.
            </div>
          ) : (
            paginatedList.map((log, idx) => {
              const sev = getSeverityStyle(log.severity);
              const dateStr = log.timestamp ? new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '----/--/-- --:--:--';
              const actorStr = String(log.actor || 'system').padEnd(14, ' ').slice(0, 14);

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '3px 0',
                    borderBottom: '1px solid #f1f5f9',
                    wordBreak: 'break-word'
                  }}
                >
                  <span style={{ color: '#64748b', flexShrink: 0, userSelect: 'none' }}>
                    [{dateStr}]
                  </span>
                  <span style={{
                    padding: '0 4px',
                    borderRadius: '3px',
                    backgroundColor: sev.bg,
                    border: `1px solid ${sev.border}`,
                    color: sev.text,
                    fontWeight: 'bold',
                    fontSize: '7.5pt',
                    flexShrink: 0
                  }}>
                    {sev.tag}
                  </span>
                  <span style={{ color: '#002147', fontWeight: 'bold', flexShrink: 0 }}>
                    [{actorStr}]
                  </span>
                  <span style={{
                    color: '#2c4273',
                    backgroundColor: '#f1f5f9',
                    padding: '0 4px',
                    borderRadius: '2px',
                    border: '1px solid #e2e8f0',
                    fontSize: '8pt',
                    flexShrink: 0
                  }}>
                    {log.action}
                  </span>
                  <span style={{ color: '#334155', flex: 1, whiteSpace: 'pre-wrap' }}>
                    {log.details || '--'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* VIEW MODE 2: STRUCTURED TABLE WITH CONSOLAS FONT */
        <div className="table-responsive" style={{ border: '1px solid var(--cf-border, #cbd5e1)', borderRadius: '6px', overflow: 'hidden' }}>
          <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '170px', fontFamily: 'Consolas, "Lucida Console", Courier, monospace', fontSize: '8.5pt' }}>Timestamp</th>
                <th style={{ width: '120px', fontFamily: 'Consolas, "Lucida Console", Courier, monospace', fontSize: '8.5pt' }}>Actor</th>
                <th style={{ width: '190px', fontFamily: 'Consolas, "Lucida Console", Courier, monospace', fontSize: '8.5pt' }}>Action</th>
                <th style={{ fontFamily: 'Consolas, "Lucida Console", Courier, monospace', fontSize: '8.5pt' }}>Details</th>
                <th style={{ width: '100px', fontFamily: 'Consolas, "Lucida Console", Courier, monospace', fontSize: '8.5pt' }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px', color: '#64748b', fontFamily: 'Consolas, monospace' }}>
                    No system logs match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedList.map((log, idx) => {
                  const sev = getSeverityStyle(log.severity);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ fontSize: '8pt', fontFamily: 'Consolas, "Lucida Console", Courier, monospace', color: '#64748b' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '8.5pt', color: '#002147', fontFamily: 'Consolas, "Lucida Console", Courier, monospace' }}>
                        {log.actor || 'system'}
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'Consolas, "Lucida Console", Courier, monospace',
                          padding: '2px 6px',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '3px',
                          fontSize: '8pt',
                          color: '#2c4273'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{
                        fontSize: '8.5pt',
                        color: '#334155',
                        fontFamily: 'Consolas, "Lucida Console", Courier, monospace',
                        maxWidth: '440px',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {log.details || '--'}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '3px',
                          fontSize: '7.5pt',
                          fontWeight: 'bold',
                          fontFamily: 'Consolas, "Lucida Console", Courier, monospace',
                          backgroundColor: sev.bg,
                          border: `1px solid ${sev.border}`,
                          color: sev.text
                        }}>
                          {log.severity?.toUpperCase() || 'INFO'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINATION ROW */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '14px',
        paddingTop: '10px',
        borderTop: '1px solid #e2e8f0',
        fontFamily: 'Consolas, "Lucida Console", Courier, monospace',
        fontSize: '8pt',
        color: '#64748b'
      }}>
        <span>
          Showing {startIdx} to {endIdx} of {totalCount} log records
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="cf-btn-secondary"
            disabled={pageIndex <= 1}
            onClick={() => setLogPage(pageIndex - 1)}
            style={{ padding: '3px 9px', fontSize: '8pt', margin: 0, fontFamily: 'Consolas, monospace' }}
          >
            &lt; Previous
          </button>
          <button
            className="cf-btn-secondary"
            disabled={pageIndex >= maxPage}
            onClick={() => setLogPage(pageIndex + 1)}
            style={{ padding: '3px 9px', fontSize: '8pt', margin: 0, fontFamily: 'Consolas, monospace' }}
          >
            Next &gt;
          </button>
        </div>
      </div>
    </div>
  );
}
