import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, Database, Activity, AlertTriangle, CheckCircle2, 
  RefreshCw, ShieldAlert, WifiOff, Clock, HardDrive, 
  Layers, Terminal, Filter, ArrowUpRight, Zap
} from 'lucide-react';

export default function AdminSystemHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(15); // seconds (15s default)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorFilter, setErrorFilter] = useState('ALL'); // ALL, 5XX, 409, 403, 4XX, MUTATIONS

  const fetchHealthMetrics = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    const start = Date.now();
    try {
      const token = localStorage.getItem('bics_auth_token') || sessionStorage.getItem('bics_auth_token');
      const res = await fetch('/api/admin/system-health', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error('[ADMIN SYSTEM HEALTH] Fetch error:', err);
      setError(err.message || 'Failed to load system health metrics.');
    } finally {
      const elapsed = Date.now() - start;
      if (isManual && elapsed < 400) {
        await new Promise(r => setTimeout(r, 400 - elapsed));
      }
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthMetrics(false);
  }, []);

  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      fetchHealthMetrics(false);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval]);

  const formatUptime = (seconds = 0) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const getLatencyBadgeColor = (ms) => {
    if (ms < 0) return { bg: '#fee2e2', color: '#dc2626', label: 'Degraded' };
    if (ms < 30) return { bg: '#dcfce7', color: '#16a34a', label: `${ms} ms (Fast)` };
    if (ms < 100) return { bg: '#fef9c3', color: '#ca8a04', label: `${ms} ms (Normal)` };
    return { bg: '#ffedd5', color: '#ea580c', label: `${ms} ms (High)` };
  };

  const getCauseBadge = (cause) => {
    switch (cause) {
      case 'server_reboot':
        return { label: 'Server Reboot / Crash', bg: '#fee2e2', color: '#b91c1c' };
      case 'db_connection_loss':
        return { label: 'Database Disconnect', bg: '#ffedd5', color: '#c2410c' };
      case 'sigterm_deploy':
        return { label: 'Scheduled Deploy (Graceful)', bg: '#e0f2fe', color: '#0369a1' };
      case 'heartbeat_gap':
      default:
        return { label: 'Heartbeat Gap', bg: '#f3e8ff', color: '#7e22ce' };
    }
  };

  const getStatusBadge = (statusCode) => {
    if (statusCode >= 500) return { bg: '#fee2e2', color: '#dc2626' };
    if (statusCode === 409) return { bg: '#f3e8ff', color: '#7e22ce' };
    if (statusCode === 403) return { bg: '#ffedd5', color: '#c2410c' };
    if (statusCode >= 400) return { bg: '#fef3c7', color: '#b45309' };
    return { bg: '#dcfce7', color: '#15803d' };
  };

  const filteredErrors = (data?.recentErrors || []).filter(err => {
    if (errorFilter === 'ALL') return true;
    if (errorFilter === '5XX') return err.statusCode >= 500;
    if (errorFilter === '409') return err.statusCode === 409;
    if (errorFilter === '403') return err.statusCode === 403;
    if (errorFilter === '4XX') return err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 409 && err.statusCode !== 403;
    return true;
  });

  const displayList = errorFilter === 'MUTATIONS' ? (data?.recentMutations || []) : filteredErrors;

  if (loading && !data) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
        <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 12px auto', color: '#002147' }} />
        <div style={{ fontSize: '11pt', fontWeight: 600 }}>Loading Infrastructure Health &amp; Outage Ledger...</div>
      </div>
    );
  }

  const isServerHealthy = data?.server?.status === 'online';
  const isDbHealthy = data?.database?.status === 'connected';
  const dbLatencyInfo = getLatencyBadgeColor(data?.database?.latencyMs ?? -1);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '50px' }}>
      {/* Top Standalone Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={24} style={{ color: '#002147' }} />
            <h2 style={{ fontSize: '18pt', fontWeight: 800, color: '#002147', margin: 0, letterSpacing: '-0.3px' }}>
              Infrastructure Vitality &amp; Outage Ledger
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '9pt', color: '#64748b' }}>
            Persistent 30s database heartbeat pulses, autonomous outage gap detection, and fire-and-forget selective audit logs.
          </p>
        </div>

        {/* Live Status Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isServerHealthy && isDbHealthy ? '#dcfce7' : '#fee2e2',
            color: isServerHealthy && isDbHealthy ? '#15803d' : '#b91c1c',
            border: `1px solid ${isServerHealthy && isDbHealthy ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '8.5pt',
            fontWeight: 700
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isServerHealthy && isDbHealthy ? '#16a34a' : '#dc2626'
            }} />
            {isServerHealthy && isDbHealthy ? 'CLUSTER ALL HEALTHY' : 'CLUSTER DEGRADED'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', color: '#64748b' }}>
            <span>Auto-refresh:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              style={{
                fontSize: '8.5pt',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b'
              }}
            >
              <option value={10}>10s</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={0}>Off</option>
            </select>
          </div>

          <button
            onClick={() => fetchHealthMetrics(true)}
            disabled={isRefreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '8.5pt',
              fontWeight: 700,
              backgroundColor: '#002147',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: isRefreshing ? 'wait' : 'pointer'
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#b91c1c',
          marginBottom: '20px',
          fontSize: '9.5pt'
        }}>
          <strong>Health Query Alert:</strong> {error}
        </div>
      )}

      {/* 4 Main Infrastructure KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Card 1: Node.js API Cluster */}
        <div className="cf-card" style={{ margin: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>API Server Vitality</span>
            <span style={{ fontSize: '7.5pt', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#16a34a' }}>
              ONLINE
            </span>
          </div>
          <div style={{ fontSize: '15pt', fontWeight: 800, color: '#002147', marginBottom: '4px' }}>
            {formatUptime(data?.server?.uptimeSeconds)}
          </div>
          <div style={{ fontSize: '8pt', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>Instance: <strong style={{ color: '#0f172a' }}>{data?.server?.instanceId}</strong></div>
            <div>Memory RSS: <strong style={{ color: '#0f172a' }}>{data?.server?.memoryRssMb} MB</strong> (Heap: {data?.server?.memoryHeapUsedMb} MB)</div>
            <div>Node Runtime: <strong style={{ color: '#0f172a' }}>{data?.server?.nodeVersion}</strong> ({data?.server?.platform})</div>
          </div>
        </div>

        {/* Card 2: Database Connection */}
        <div className="cf-card" style={{ margin: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>MongoDB Vitality</span>
            <span style={{ fontSize: '7.5pt', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: dbLatencyInfo.bg, color: dbLatencyInfo.color }}>
              {isDbHealthy ? 'CONNECTED' : 'DEGRADED'}
            </span>
          </div>
          <div style={{ fontSize: '15pt', fontWeight: 800, color: '#002147', marginBottom: '4px' }}>
            {dbLatencyInfo.label}
          </div>
          <div style={{ fontSize: '8pt', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>Ready State: <strong style={{ color: '#0f172a' }}>{data?.database?.readyState === 1 ? '1 (Connected)' : data?.database?.readyState}</strong></div>
            <div>Cluster Target: <strong style={{ color: '#0f172a' }}>{data?.database?.host}</strong></div>
            <div>Pulse Frequency: <strong style={{ color: '#16a34a' }}>Every 30 seconds</strong></div>
          </div>
        </div>

        {/* Card 3: Live Exam Concurrency & Offline Rescues */}
        <div className="cf-card" style={{ margin: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Exam Concurrency</span>
            <span style={{ fontSize: '7.5pt', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#e0f2fe', color: '#0284c7' }}>
              LIVE SESSIONS
            </span>
          </div>
          <div style={{ fontSize: '15pt', fontWeight: 800, color: '#002147', marginBottom: '4px' }}>
            {data?.examMetrics?.activeExams ?? 0} <span style={{ fontSize: '9pt', fontWeight: 500, color: '#64748b' }}>active candidates</span>
          </div>
          <div style={{ fontSize: '8pt', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>Total Submissions: <strong style={{ color: '#0f172a' }}>{data?.examMetrics?.totalSubmissions ?? 0}</strong></div>
            <div>Offline Sync Deliveries: <strong style={{ color: '#0f172a' }}>{data?.examMetrics?.totalOfflineSynced ?? 0}</strong></div>
            <div>Verified Outage Rescues: <strong style={{ color: '#16a34a' }}>{data?.examMetrics?.verifiedOutageSynced ?? 0}</strong></div>
          </div>
        </div>

        {/* Card 4: Outage Incidents Count */}
        <div className="cf-card" style={{ margin: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Recorded Outages</span>
            <span style={{ fontSize: '7.5pt', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#b45309' }}>
              AUTO-LEDGER
            </span>
          </div>
          <div style={{ fontSize: '15pt', fontWeight: 800, color: '#002147', marginBottom: '4px' }}>
            {(data?.recentOutages || []).length} <span style={{ fontSize: '9pt', fontWeight: 500, color: '#64748b' }}>incident windows</span>
          </div>
          <div style={{ fontSize: '8pt', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>Reaper Protection: <strong style={{ color: '#16a34a' }}>5m Global Outage Shield</strong></div>
            <div>Recent Critical Errors: <strong style={{ color: '#dc2626' }}>{(data?.recentErrors || []).filter(e => e.statusCode >= 500).length}</strong></div>
            <div>Audit Retention: <strong style={{ color: '#0f172a' }}>30d Errors / 365d Outages</strong></div>
          </div>
        </div>
      </div>

      {/* SECTION 1: Autonomous Server Outage Incident History */}
      <div className="cf-card" style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: '#b45309' }} />
              <h3 style={{ fontSize: '12pt', fontWeight: 700, color: '#002147', margin: 0 }}>
                Server Outage &amp; Downtime Incidents
              </h3>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '8pt', color: '#64748b' }}>
              Automatically registered whenever consecutive 30s database pulses lapse for &ge; 75 seconds.
            </p>
          </div>
          <span style={{ fontSize: '8pt', color: '#64748b' }}>
            Showing latest {(data?.recentOutages || []).length} incidents
          </span>
        </div>

        {(!data?.recentOutages || data.recentOutages.length === 0) ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '9pt', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
            <CheckCircle2 size={24} style={{ color: '#16a34a', margin: '0 auto 8px auto' }} />
            <div><strong>Zero Outage Incidents Detected</strong></div>
            <div style={{ fontSize: '8pt', marginTop: '2px' }}>The 30-second database health pulse has maintained uninterrupted continuity.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Outage Window</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Duration</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Detected Cause</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Affected Exams</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Instance</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOutages.map((inc, idx) => {
                  const causeInfo = getCauseBadge(inc.cause);
                  const startStr = inc.outageStart ? new Date(inc.outageStart).toLocaleString() : 'N/A';
                  const endStr = inc.outageEnd ? new Date(inc.outageEnd).toLocaleTimeString() : 'N/A';
                  return (
                    <tr key={inc._id || idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background-color 0.15s' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{startStr} &rarr; {endStr}</div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b' }}>Incident ID: {String(inc._id).slice(-8)}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#002147', whiteSpace: 'nowrap' }}>
                        {formatUptime(inc.durationSeconds)}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '7.5pt',
                          fontWeight: 700,
                          backgroundColor: causeInfo.bg,
                          color: causeInfo.color
                        }}>
                          {causeInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {inc.affectedSubmissionsCount > 0 ? (
                          <span style={{ fontWeight: 700, color: '#b91c1c' }}>
                            {inc.affectedSubmissionsCount} sessions captured
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>None active</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: '8pt' }}>
                        {inc.instanceId || 'primary'}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: inc.isGraceful ? '#0284c7' : '#16a34a',
                          fontWeight: 700,
                          fontSize: '8pt'
                        }}>
                          <CheckCircle2 size={13} />
                          {inc.isGraceful ? 'Deploy Resolved' : 'Recovered'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: Fire-and-Forget Selective Audit Log & Error Feed */}
      <div className="cf-card">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} style={{ color: '#002147' }} />
              <h3 style={{ fontSize: '12pt', fontWeight: 700, color: '#002147', margin: 0 }}>
                Selective Audit &amp; High-Value Incident Feed
              </h3>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '8pt', color: '#64748b' }}>
              Captures high-stakes exam mutations and failures (&ge; 400). Excludes 401 auth noise and 404 crawler probes.
            </p>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All Errors' },
              { id: '5XX', label: '5xx Server' },
              { id: '409', label: '409 Conflict' },
              { id: '403', label: '403 Block' },
              { id: '4XX', label: '4xx Client' },
              { id: 'MUTATIONS', label: 'State Mutations' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setErrorFilter(f.id)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '8pt',
                  fontWeight: errorFilter === f.id ? 700 : 500,
                  backgroundColor: errorFilter === f.id ? '#002147' : '#f1f5f9',
                  color: errorFilter === f.id ? '#ffffff' : '#475569',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {(!displayList || displayList.length === 0) ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '9pt', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
            <CheckCircle2 size={24} style={{ color: '#16a34a', margin: '0 auto 8px auto' }} />
            <div><strong>No Logged Incidents in Filter View</strong></div>
            <div style={{ fontSize: '8pt', marginTop: '2px' }}>Zero matching failed requests or high-value error events captured.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Method &amp; Route</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Student / User</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Error Details / Payload</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700 }}>Latency</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((log, idx) => {
                  const statusBadge = getStatusBadge(log.statusCode);
                  const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A';
                  return (
                    <tr key={log._id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#64748b', fontSize: '8pt' }}>
                        {timeStr}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '8pt',
                          backgroundColor: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          marginRight: '6px'
                        }}>
                          {log.method}
                        </span>
                        <strong style={{ color: '#002147' }}>{log.path}</strong>
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '8pt',
                          fontWeight: 800,
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color
                        }}>
                          {log.statusCode}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {log.studentId ? (
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.studentId}</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>{log.ip || 'Guest'}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: '350px' }}>
                        {log.errorMessage ? (
                          <div style={{ color: '#dc2626', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.errorMessage}
                          </div>
                        ) : log.category === 'STATE_MUTATION' ? (
                          <div style={{ color: '#16a34a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            State change executed successfully
                          </div>
                        ) : (
                          <div style={{ color: '#64748b' }}>Request processed</div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#64748b', fontFamily: 'monospace', fontSize: '8pt' }}>
                        {log.durationMs ?? 0} ms
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
