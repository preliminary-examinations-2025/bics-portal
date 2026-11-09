import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, RefreshCw, RotateCcw, Search, Send, CheckCircle, AlertTriangle,
  Clock, FileText, ShieldCheck, XCircle
} from 'lucide-react';

const EMAIL_TYPE_META = {
  verification_code: { label: 'OTP Verification', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  test_submitted: { label: 'Test Submitted', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  eirf_filing: { label: 'EIRF Filing', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  eirf_approved: { label: 'EIRF Approved', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  eirf_rejected: { label: 'EIRF Rejected', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  otrf_sent: { label: 'OTRF Report', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' }
};

function formatIstTimestamp(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  try {
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';
  } catch {
    return d.toISOString();
  }
}

function getStatusBadge(status, transport) {
  switch (status) {
    case 'sent':
      return {
        label: 'Sent (Gmail API)',
        bg: '#dcfce7',
        color: '#166534',
        border: '#86efac',
        Icon: CheckCircle
      };
    case 'simulated':
      return {
        label: 'Simulated (Dev Audit)',
        bg: '#e0f2fe',
        color: '#075985',
        border: '#7dd3fc',
        Icon: ShieldCheck
      };
    case 'failed':
      return {
        label: transport === 'unconfigured' ? 'Failed (Unconfigured)' : 'Failed',
        bg: '#fee2e2',
        color: '#991b1b',
        border: '#fca5a5',
        Icon: XCircle
      };
    case 'pending':
    default:
      return {
        label: 'Pending / Unsent',
        bg: '#fef3c7',
        color: '#92400e',
        border: '#fcd34d',
        Icon: Clock
      };
  }
}

export default function AdminEmails({ API_BASE, onEmailActionComplete }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, sent: 0, failed: 0, pending: 0, simulated: 0, needsAttention: 0, byType: {} });
  const [closedTests, setClosedTests] = useState([]);
  const [filterTests, setFilterTests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalCount: 0, totalPages: 1, startIndex: 0, endIndex: 0 });

  const [emailTypeFilter, setEmailTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [testIdFilter, setTestIdFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [retryingKey, setRetryingKey] = useState('');
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [selectedClosedTestId, setSelectedClosedTestId] = useState('');
  const [dispatchingOtrf, setDispatchingOtrf] = useState(false);

  const [bannerSuccess, setBannerSuccess] = useState('');
  const [bannerError, setBannerError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchEmailFeed = useCallback(async (overridePage = null) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('emailType', emailTypeFilter);
      q.set('status', statusFilter);
      q.set('testId', testIdFilter);
      if (debouncedSearch) q.set('search', debouncedSearch);
      q.set('page', String(overridePage || page));
      q.set('limit', '50');

      const res = await fetch(`${API_BASE}/admin/emails?${q.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.summary) setSummary(data.summary);
        const closed = Array.isArray(data.closedTests) ? data.closedTests : [];
        setClosedTests(closed);
        if (closed.length > 0) {
          setSelectedClosedTestId(prev => {
            if (prev && closed.some(ct => ct.testId === prev)) return prev;
            const withPending = closed.find(ct => ct.actionNeededCount > 0);
            return (withPending || closed[0]).testId;
          });
        } else {
          setSelectedClosedTestId('');
        }
        setFilterTests(Array.isArray(data.filterTests) ? data.filterTests : []);
        if (data.pagination) setPagination(data.pagination);
      } else {
        setBannerError(data.error || 'Failed to load unified email audit logs.');
      }
    } catch (err) {
      console.error('[AdminEmails] Fetch error:', err);
      setBannerError('Network error communicating with Email Center API.');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, emailTypeFilter, statusFilter, testIdFilter, debouncedSearch, page]);

  useEffect(() => {
    fetchEmailFeed();
  }, [fetchEmailFeed]);

  const notifyParentSummary = () => {
    if (typeof onEmailActionComplete === 'function') {
      onEmailActionComplete();
    }
  };

  const handleSingleRetry = async (item) => {
    const key = item._id || `${item.emailType}_${item.targetId}`;
    if (retryingKey || bulkRetrying) return;
    setRetryingKey(key);
    setBannerSuccess('');
    setBannerError('');
    try {
      const res = await fetch(`${API_BASE}/admin/emails/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: item.logId || '',
          emailType: item.emailType,
          targetId: item.targetId,
          purpose: item.purpose || '',
          force: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const typeLabel = EMAIL_TYPE_META[item.emailType]?.label || item.emailType;
        setBannerSuccess(
          `${typeLabel} dispatched to ${item.recipientEmail || 'candidate'} via ${data.simulated ? 'Console Audit (Dev)' : 'Gmail REST API'} (Message ID: ${data.messageId || 'n/a'}).`
        );
        await fetchEmailFeed();
        notifyParentSummary();
      } else {
        setBannerError(data.error || `Failed to dispatch ${item.emailType} email.`);
        await fetchEmailFeed();
        notifyParentSummary();
      }
    } catch (err) {
      setBannerError(err.message || 'Network error while retrying email dispatch.');
    } finally {
      setRetryingKey('');
    }
  };

  const handleBulkRetryFailed = async () => {
    if (bulkRetrying || retryingKey) return;
    setBulkRetrying(true);
    setBannerSuccess('');
    setBannerError('');
    try {
      const res = await fetch(`${API_BASE}/admin/emails/retry-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: emailTypeFilter,
          testId: testIdFilter,
          limit: 50
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.retried === 0) {
          setBannerSuccess('No failed or pending emails found matching your current filter.');
        } else {
          setBannerSuccess(
            `Bulk Retry Complete: ${data.retried} processed — ${data.succeeded} succeeded, ${data.stillFailed} failed.`
          );
        }
        await fetchEmailFeed();
        notifyParentSummary();
      } else {
        setBannerError(data.error || 'Bulk email retry encountered an error.');
      }
    } catch (err) {
      setBannerError(err.message || 'Network error during bulk retry.');
    } finally {
      setBulkRetrying(false);
    }
  };

  const handleDispatchOtrfBatch = async () => {
    if (!selectedClosedTestId || dispatchingOtrf) return;
    setDispatchingOtrf(true);
    setBannerSuccess('');
    setBannerError('');
    try {
      const res = await fetch(`${API_BASE}/admin/emails/dispatch-otrf/${encodeURIComponent(selectedClosedTestId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBannerSuccess(
          `OTRF Batch (${data.testTitle || data.testId}): ${data.dispatched} dispatched, ${data.skipped || 0} skipped, ${data.failed || 0} failed (Eligible pending: ${data.totalEligible}).`
        );
        await fetchEmailFeed();
        notifyParentSummary();
      } else {
        setBannerError(data.error || 'Failed to dispatch OTRF batch.');
      }
    } catch (err) {
      setBannerError(err.message || 'Network error triggering OTRF batch dispatch.');
    } finally {
      setDispatchingOtrf(false);
    }
  };

  return (
    <div>
      <div className="cf-card" style={{ marginBottom: '22px' }}>
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '16pt', color: '#002147', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={20} style={{ color: '#2563eb' }} /> Unified Email Center &amp; Delivery Audit
            </h2>
            <div style={{ fontSize: '9pt', color: '#64748b' }}>
              Central Gmail REST API (HTTPS 443) delivery ledger &amp; retry console across all 6 email workflows: OTP Verification, Test Submission, EIRF Filing, Verdicts, and OTRF Dispatch.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cf-btn-secondary"
              onClick={() => { fetchEmailFeed(); notifyParentSummary(); }}
              disabled={loading || bulkRetrying}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin-smooth' : ''} />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              className="cf-btn-primary"
              onClick={handleBulkRetryFailed}
              disabled={bulkRetrying || summary.needsAttention === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: summary.needsAttention > 0 ? '#b91c1c' : '#94a3b8',
                borderColor: summary.needsAttention > 0 ? '#991b1b' : '#94a3b8',
                cursor: summary.needsAttention === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <RotateCcw size={14} className={bulkRetrying ? 'spin-smooth' : ''} />
              <span>
                {bulkRetrying
                  ? 'Retrying Unresolved...'
                  : `Retry All Failed & Pending (${summary.needsAttention})`}
              </span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {bannerSuccess && (
          <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: '6px', fontSize: '9pt', border: '1px solid #bbf7d0', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span>{bannerSuccess}</span>
            <button type="button" onClick={() => setBannerSuccess('')} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {bannerError && (
          <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '9pt', border: '1px solid #fca5a5', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span>{bannerError}</span>
            <button type="button" onClick={() => setBannerError('')} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <div style={{ padding: '12px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', color: '#166534', fontWeight: 'bold' }}>Sent (Gmail API)</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#15803d' }}>{summary.sent}</div>
          </div>
          <div style={{ padding: '12px 14px', backgroundColor: summary.failed > 0 ? '#fef2f2' : '#f8fafc', border: `1px solid ${summary.failed > 0 ? '#fecaca' : '#e2e8f0'}`, borderRadius: '8px' }}>
            <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', color: summary.failed > 0 ? '#991b1b' : '#64748b', fontWeight: 'bold' }}>Failed</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: summary.failed > 0 ? '#dc2626' : '#334155' }}>{summary.failed}</div>
          </div>
          <div style={{ padding: '12px 14px', backgroundColor: summary.pending > 0 ? '#fffbeb' : '#f8fafc', border: `1px solid ${summary.pending > 0 ? '#fde68a' : '#e2e8f0'}`, borderRadius: '8px' }}>
            <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', color: summary.pending > 0 ? '#92400e' : '#64748b', fontWeight: 'bold' }}>Pending / Unsent</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: summary.pending > 0 ? '#d97706' : '#334155' }}>{summary.pending}</div>
          </div>
          <div style={{ padding: '12px 14px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
            <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', color: '#0369a1', fontWeight: 'bold' }}>Simulated (Dev)</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#0284c7' }}>{summary.simulated}</div>
          </div>
          <div style={{ padding: '12px 14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', color: '#475569', fontWeight: 'bold' }}>Total Tracked</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#002147' }}>{summary.total}</div>
          </div>
        </div>

        {/* Closed-Test OTRF Batch Bar */}
        {closedTests.length > 0 && (
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9pt', color: '#0f172a' }}>
              <FileText size={16} style={{ color: '#6d28d9' }} />
              <strong>Closed-Test OTRF Batch Dispatch:</strong>
              <select
                className="cf-input"
                value={selectedClosedTestId}
                onChange={e => setSelectedClosedTestId(e.target.value)}
                style={{ minWidth: '280px', padding: '5px 8px', fontSize: '8.5pt' }}
              >
                {closedTests.map(ct => (
                  <option key={ct.testId} value={ct.testId}>
                    {ct.title} {ct.courseCode ? `(${ct.courseCode})` : ''} — {ct.sentCount}/{ct.totalSubmissions} Sent ({ct.actionNeededCount} Pending/Failed)
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="cf-btn-secondary"
              disabled={!selectedClosedTestId || dispatchingOtrf}
              onClick={handleDispatchOtrfBatch}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#f5f3ff', color: '#5b21b6', borderColor: '#c4b5fd', fontWeight: 'bold', fontSize: '8.5pt' }}
            >
              <Send size={13} />
              <span>{dispatchingOtrf ? 'Dispatching OTRF Batch...' : 'Dispatch Pending OTRF Batch'}</span>
            </button>
          </div>
        )}

        {/* Email Type Pill Filter Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          <button
            type="button"
            onClick={() => { setEmailTypeFilter('ALL'); setPage(1); }}
            style={{
              padding: '5px 10px',
              borderRadius: '14px',
              fontSize: '8pt',
              fontWeight: 'bold',
              cursor: 'pointer',
              border: emailTypeFilter === 'ALL' ? '1px solid #002147' : '1px solid #cbd5e1',
              backgroundColor: emailTypeFilter === 'ALL' ? '#002147' : '#ffffff',
              color: emailTypeFilter === 'ALL' ? '#ffffff' : '#334155'
            }}
          >
            All ({summary.total})
          </button>
          {Object.entries(EMAIL_TYPE_META).map(([typeKey, meta]) => {
            const active = emailTypeFilter === typeKey;
            const count = summary.byType?.[typeKey] || 0;
            return (
              <button
                key={typeKey}
                type="button"
                onClick={() => { setEmailTypeFilter(typeKey); setPage(1); }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '14px',
                  fontSize: '8pt',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: `1px solid ${active ? meta.color : '#cbd5e1'}`,
                  backgroundColor: active ? meta.bg : '#ffffff',
                  color: active ? meta.color : '#475569'
                }}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Status, Test, and Search Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <select
            className="cf-input"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ width: '170px', fontSize: '8.5pt', padding: '6px 8px' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="failed">Failed Only</option>
            <option value="pending">Pending / Unsent</option>
            <option value="sent">Sent (Gmail API)</option>
            <option value="simulated">Simulated (Dev)</option>
          </select>

          <select
            className="cf-input"
            value={testIdFilter}
            onChange={e => { setTestIdFilter(e.target.value); setPage(1); }}
            style={{ width: '230px', fontSize: '8.5pt', padding: '6px 8px' }}
          >
            <option value="ALL">All Examinations</option>
            {filterTests.map(ft => (
              <option key={ft.testId} value={ft.testId}>
                {ft.title}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="cf-input"
              placeholder="Search candidate, student ID, email, Ref ID, EIRF ID, Message ID, or error..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={{ width: '100%', paddingLeft: '30px', fontSize: '8.5pt' }}
            />
          </div>
        </div>

        {/* Table */}
        {loading && items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '9.5pt' }}>
            Loading unified email delivery records...
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
            <Mail size={34} style={{ color: '#94a3b8', marginBottom: '8px' }} />
            <h3 style={{ margin: '0 0 4px 0', fontSize: '11.5pt', color: '#334155' }}>No Email Records Match Filters</h3>
            <p style={{ margin: 0, fontSize: '9pt' }}>Adjust the email type, status, examination filter, or search query above.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '9px' }}>Time (IST)</th>
                  <th style={{ padding: '9px' }}>Type &amp; Attachment</th>
                  <th style={{ padding: '9px' }}>Candidate &amp; References</th>
                  <th style={{ padding: '9px' }}>Recipient Email</th>
                  <th style={{ padding: '9px' }}>Subject &amp; Trigger</th>
                  <th style={{ padding: '9px' }}>Status &amp; Diagnostics</th>
                  <th style={{ padding: '9px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const typeMeta = EMAIL_TYPE_META[item.emailType] || { label: item.emailType, bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
                  const statusMeta = getStatusBadge(item.status, item.transport);
                  const StatusIcon = statusMeta.Icon;
                  const rowKey = item._id || `${item.emailType}_${item.targetId}`;
                  const isBusy = retryingKey === rowKey;
                  const isFailedOrPending = item.status === 'failed' || item.status === 'pending';

                  return (
                    <tr
                      key={rowKey}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: item.status === 'failed' ? '#fffafa' : (item.status === 'pending' ? '#fffdf5' : '#ffffff')
                      }}
                    >
                      <td style={{ padding: '9px', whiteSpace: 'nowrap', color: '#334155', verticalAlign: 'top' }}>
                        <div>{formatIstTimestamp(item.lastAttemptAt || item.createdAt)}</div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                          Attempts: {item.attempts}
                        </div>
                      </td>

                      <td style={{ padding: '9px', verticalAlign: 'top' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '7.5pt',
                          fontWeight: 'bold',
                          backgroundColor: typeMeta.bg,
                          color: typeMeta.color,
                          border: `1px solid ${typeMeta.border}`
                        }}>
                          {typeMeta.label}
                        </span>
                        {item.purpose && (
                          <div style={{ fontSize: '7.5pt', color: '#475569', marginTop: '3px' }}>
                            {item.purpose}
                          </div>
                        )}
                        {item.hasPdf && (
                          <div style={{ marginTop: '4px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '7pt',
                              fontWeight: 'bold',
                              backgroundColor: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1'
                            }}>
                              <FileText size={10} /> PDF Attached
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '9px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{item.recipientName || 'Candidate'}</div>
                        <div style={{ fontSize: '7.5pt', color: '#475569' }}>
                          {item.studentId ? `ID: ${item.studentId}` : ''}
                        </div>
                        {item.submissionRefId && (
                          <div style={{ fontSize: '7.5pt', fontFamily: 'monospace', color: '#1e3a8a', marginTop: '2px' }}>
                            Ref: {item.submissionRefId}
                          </div>
                        )}
                        {item.reportId && (
                          <div style={{ fontSize: '7.5pt', fontFamily: 'monospace', color: '#7c2d12' }}>
                            EIRF: {item.reportId}
                          </div>
                        )}
                        {item.testTitle && (
                          <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                            {item.testTitle}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '9px', verticalAlign: 'top' }}>
                        {item.recipientEmail ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '8pt', color: '#0f172a', wordBreak: 'break-all' }}>
                            {item.recipientEmail}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#b45309', fontSize: '8pt', fontWeight: 'bold' }}>
                            <AlertTriangle size={12} /> Missing / Invalid
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '9px', verticalAlign: 'top', maxWidth: '280px' }}>
                        <div style={{ color: '#1e293b', fontWeight: '500', wordBreak: 'break-word' }}>
                          {item.subject || '—'}
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '3px' }}>
                          Source: <code>{item.triggerSource || 'system'}</code>
                        </div>
                      </td>

                      <td style={{ padding: '9px', verticalAlign: 'top', maxWidth: '260px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '7.5pt',
                          fontWeight: 'bold',
                          backgroundColor: statusMeta.bg,
                          color: statusMeta.color,
                          border: `1px solid ${statusMeta.border}`
                        }}>
                          <StatusIcon size={11} />
                          {statusMeta.label}
                        </span>

                        {item.messageId && (
                          <div style={{ fontSize: '7pt', fontFamily: 'monospace', color: '#475569', marginTop: '4px', wordBreak: 'break-all' }}>
                            MsgID: {item.messageId}
                          </div>
                        )}

                        {item.lastError && (
                          <div style={{
                            marginTop: '4px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            fontSize: '7.5pt',
                            backgroundColor: item.status === 'failed' ? '#fef2f2' : '#fffbeb',
                            color: item.status === 'failed' ? '#991b1b' : '#92400e',
                            border: `1px solid ${item.status === 'failed' ? '#fecaca' : '#fde68a'}`,
                            wordBreak: 'break-word'
                          }}>
                            {item.lastError}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '9px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          disabled={isBusy || bulkRetrying || !item.targetId}
                          onClick={() => handleSingleRetry(item)}
                          className={isFailedOrPending ? 'cf-btn-primary' : 'cf-btn-secondary'}
                          style={{
                            padding: '5px 10px',
                            fontSize: '8pt',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            opacity: (!item.targetId || bulkRetrying) ? 0.6 : 1
                          }}
                        >
                          <RotateCcw size={12} className={isBusy ? 'spin-smooth' : ''} />
                          <span>
                            {isBusy
                              ? 'Sending...'
                              : item.status === 'pending'
                                ? 'Send Now'
                                : item.status === 'failed'
                                  ? 'Retry'
                                  : 'Resend'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', fontSize: '8.5pt', color: '#475569', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              Showing <strong>{pagination.startIndex}–{pagination.endIndex}</strong> of <strong>{pagination.totalCount}</strong> record(s)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="cf-btn-secondary"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: '8pt' }}
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button
                type="button"
                className="cf-btn-secondary"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: '8pt' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
