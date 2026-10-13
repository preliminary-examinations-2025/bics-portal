import React, { useState, useEffect, useRef } from 'react';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const terminalScrollRef = useRef(null);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const start = Date.now();
    try {
      if (fetchSystemLogs) await fetchSystemLogs();
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      setIsRefreshing(false);
    }
  };

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
  // Slice the page and order oldest-at-top -> newest-at-bottom
  const paginatedList = [...filteredLogs.slice((pageIndex - 1) * limit, pageIndex * limit)].sort(
    (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );
  const startIdx = totalCount === 0 ? 0 : (pageIndex - 1) * limit + 1;
  const endIdx = Math.min(pageIndex * limit, totalCount);

  // Auto-scroll to bottom so newest logs at the bottom are immediately visible
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [systemLogs, pageIndex, logFilterActor, logFilterAction, logFilterSeverity, viewMode]);

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
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', padding: '4px 10px', cursor: isRefreshing ? 'default' : 'pointer' }}
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin-smooth' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
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

      {/* Subtle light theme severity styles & IST formatter */}
      {(() => {
        const formatIstTerminalTimestamp = (ts) => {
          if (!ts) return '----/--/-- --:--:-- IST';
          const d = new Date(ts);
          if (isNaN(d.getTime())) return '----/--/-- --:--:-- IST';
          const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
          return `${istDate.toISOString().replace('T', ' ').slice(0, 19)} IST`;
        };

        return viewMode === 'terminal' ? (
          /* VIEW MODE 1: BORDERLESS TABULAR SYSTEM LOG CONSOLE */
          <div
            ref={terminalScrollRef}
            className="mongo-bson-mono"
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '12px 16px',
              fontSize: '9.5pt',
              color: '#334155',
              lineHeight: '1.55',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)',
              minHeight: '280px',
              maxHeight: '520px',
              overflowY: 'auto',
              overflowX: 'auto'
            }}
          >
            {paginatedList.length === 0 ? (
              <div style={{ color: '#64748b', fontStyle: 'italic', padding: '24px 0', textAlign: 'center', fontSize: '9.5pt' }}>
                No system log records match the current filters.
              </div>
            ) : (
              <table
                className="mongo-bson-mono"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: 'none',
                  fontSize: '9.5pt',
                  lineHeight: '1.55'
                }}
              >
                <tbody>
                  {paginatedList.map((log, idx) => {
                    const sev = getSeverityStyle(log.severity);
                    const dateStr = formatIstTerminalTimestamp(log.timestamp);
                    const actorStr = String(log.actor || 'system').trim();

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx < paginatedList.length - 1 ? '1px solid #e2e8f0' : 'none',
                          backgroundColor: 'transparent',
                          transition: 'background-color 0.1s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {/* Column 1: Timestamp */}
                        <td
                          style={{
                            border: 'none',
                            padding: '7px 12px 7px 4px',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top',
                            color: '#64748b',
                            userSelect: 'none'
                          }}
                        >
                          [{dateStr}]
                        </td>

                        {/* Column 2: Severity Pill */}
                        <td
                          style={{
                            border: 'none',
                            padding: '7px 12px 7px 0',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top'
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              minWidth: '54px',
                              textAlign: 'center',
                              padding: '1px 7px',
                              borderRadius: '3px',
                              backgroundColor: sev.bg,
                              border: `1px solid ${sev.border}`,
                              color: sev.text,
                              fontWeight: '700',
                              fontSize: '8.5pt',
                              lineHeight: '1.35'
                            }}
                          >
                            {sev.tag.trim()}
                          </span>
                        </td>

                        {/* Column 3: Actor */}
                        <td
                          style={{
                            border: 'none',
                            padding: '7px 14px 7px 0',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top',
                            color: '#002147',
                            fontWeight: '700'
                          }}
                        >
                          [{actorStr}]
                        </td>

                        {/* Column 4: Action Tag */}
                        <td
                          style={{
                            border: 'none',
                            padding: '7px 14px 7px 0',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top'
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              color: '#2c4273',
                              backgroundColor: '#f1f5f9',
                              padding: '1px 7px',
                              borderRadius: '3px',
                              border: '1px solid #e2e8f0',
                              fontSize: '8.5pt',
                              fontWeight: '600',
                              lineHeight: '1.35'
                            }}
                          >
                            {log.action}
                          </span>
                        </td>

                        {/* Column 5: Details Message */}
                        <td
                          style={{
                            border: 'none',
                            padding: '7px 4px 7px 0',
                            width: '100%',
                            verticalAlign: 'top',
                            color: '#1e293b',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {log.details || '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* VIEW MODE 2: BORDERLESS STRUCTURED TABLE WITH HORIZONTAL ROW DIVIDERS */
          <div
            className="table-responsive mongo-bson-mono"
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '8px 14px',
              overflowX: 'auto'
            }}
          >
            <table
              className="mongo-bson-mono"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: 'none',
                fontSize: '9.5pt'
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ border: 'none', textAlign: 'left', padding: '8px 12px 8px 4px', whiteSpace: 'nowrap', color: '#475569', fontSize: '9pt', fontWeight: '700' }}>Timestamp (IST)</th>
                  <th style={{ border: 'none', textAlign: 'left', padding: '8px 12px 8px 0', whiteSpace: 'nowrap', color: '#475569', fontSize: '9pt', fontWeight: '700' }}>Severity</th>
                  <th style={{ border: 'none', textAlign: 'left', padding: '8px 14px 8px 0', whiteSpace: 'nowrap', color: '#475569', fontSize: '9pt', fontWeight: '700' }}>Actor</th>
                  <th style={{ border: 'none', textAlign: 'left', padding: '8px 14px 8px 0', whiteSpace: 'nowrap', color: '#475569', fontSize: '9pt', fontWeight: '700' }}>Action</th>
                  <th style={{ border: 'none', textAlign: 'left', padding: '8px 4px 8px 0', width: '100%', color: '#475569', fontSize: '9pt', fontWeight: '700' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ border: 'none', fontStyle: 'italic', textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '9.5pt' }}>
                      No system logs match the current filters.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((log, idx) => {
                    const sev = getSeverityStyle(log.severity);
                    const dateStr = formatIstTerminalTimestamp(log.timestamp);
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx < paginatedList.length - 1 ? '1px solid #e2e8f0' : 'none'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td style={{ border: 'none', padding: '7px 12px 7px 4px', whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: '9.5pt', color: '#64748b' }}>
                          {dateStr}
                        </td>
                        <td style={{ border: 'none', padding: '7px 12px 7px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          <span style={{
                            display: 'inline-block',
                            minWidth: '54px',
                            textAlign: 'center',
                            padding: '1px 7px',
                            borderRadius: '3px',
                            fontSize: '8.5pt',
                            fontWeight: '700',
                            backgroundColor: sev.bg,
                            border: `1px solid ${sev.border}`,
                            color: sev.text
                          }}>
                            {log.severity?.toUpperCase() || 'INFO'}
                          </span>
                        </td>
                        <td style={{ border: 'none', padding: '7px 14px 7px 0', whiteSpace: 'nowrap', verticalAlign: 'top', fontWeight: '700', fontSize: '9.5pt', color: '#002147' }}>
                          {log.actor || 'system'}
                        </td>
                        <td style={{ border: 'none', padding: '7px 14px 7px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 7px',
                            backgroundColor: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '3px',
                            fontSize: '8.5pt',
                            fontWeight: '600',
                            color: '#2c4273'
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{
                          border: 'none',
                          padding: '7px 4px 7px 0',
                          width: '100%',
                          verticalAlign: 'top',
                          fontSize: '9.5pt',
                          color: '#1e293b',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {log.details || '--'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

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
