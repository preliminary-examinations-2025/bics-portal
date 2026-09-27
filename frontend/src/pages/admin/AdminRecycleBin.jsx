import React from 'react';
import { Trash2, RefreshCw, Clock, RotateCcw } from 'lucide-react';

export default function AdminRecycleBin({
  fetchRecycleBinItems,
  recycleBinItems,
  handlePurgeAllRecycleItems,
  recycleBinSuccess,
  recycleBinError,
  recycleBinLoading,
  handleRestoreRecycleItem,
  handlePurgeRecycleItem
}) {
  return (
    <div>
      <div className="cf-card" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--cf-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '16pt', color: '#002147', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={20} style={{ color: '#ef4444' }} /> 24-Hour Recycle Bin &amp; Soft-Delete Recovery
            </h2>
            <div style={{ fontSize: '9pt', color: '#64748b' }}>
              Items moved to the Recycle Bin are held for 24 hours. Administrators can restore them along with all cascaded student submissions and evaluation logs, or permanently purge them.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="cf-btn-secondary" onClick={fetchRecycleBinItems} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} /> Refresh Bin
            </button>
            {recycleBinItems.length > 0 && (
              <button className="cf-btn-secondary" onClick={handlePurgeAllRecycleItems} style={{ backgroundColor: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 size={14} /> Purge All Items
              </button>
            )}
          </div>
        </div>

        {recycleBinSuccess && (
          <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: '6px', fontSize: '9pt', border: '1px solid #bbf7d0', marginBottom: '15px' }}>
            {recycleBinSuccess}
          </div>
        )}

        {recycleBinError && (
          <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '9pt', border: '1px solid #fca5a5', marginBottom: '15px' }}>
            {recycleBinError}
          </div>
        )}

        {/* Summary KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '8pt', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Items in Staging</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#002147' }}>{recycleBinItems.length}</div>
          </div>
          <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '8pt', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Cascaded Submissions Protected</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#0284c7' }}>
              {recycleBinItems.reduce((acc, curr) => acc + (curr.cascadeCount || 0), 0)}
            </div>
          </div>
          <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '8pt', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Retention Window</div>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#16a34a' }}>24 Hours</div>
          </div>
        </div>

        {recycleBinLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Loading Recycle Bin contents...
          </div>
        ) : recycleBinItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
            <Trash2 size={36} style={{ color: '#94a3b8', marginBottom: '10px' }} />
            <h3 style={{ margin: '0 0 4px 0', fontSize: '12pt', color: '#334155' }}>Recycle Bin is Empty</h3>
            <p style={{ margin: 0, fontSize: '9pt' }}>No soft-deleted test configurations or candidate submissions are currently in staging.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>Item Title &amp; Details</th>
                  <th style={{ padding: '10px' }}>Type</th>
                  <th style={{ padding: '10px' }}>Deleted At</th>
                  <th style={{ padding: '10px' }}>Time Remaining</th>
                  <th style={{ padding: '10px' }}>Cascaded Items Protected</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recycleBinItems.map((item) => {
                  const hoursLeft = Math.floor((item.timeRemainingMs || 0) / (1000 * 60 * 60));
                  const minsLeft = Math.floor(((item.timeRemainingMs || 0) % (1000 * 60 * 60)) / (1000 * 60));
                  const isExpiringSoon = hoursLeft < 2;

                  return (
                    <tr key={item._id || item.entityId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{item.title}</div>
                        <div style={{ fontSize: '8pt', color: '#64748b' }}>ID: {item.entityId} {item.code ? `(${item.code})` : ''}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ backgroundColor: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '4px', fontSize: '8pt', fontWeight: 'bold' }}>
                          {item.entityType}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#475569' }}>
                        {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : 'Recent'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          backgroundColor: isExpiringSoon ? '#fef2f2' : '#f0fdf4',
                          color: isExpiringSoon ? '#dc2626' : '#16a34a',
                          border: `1px solid ${isExpiringSoon ? '#fca5a5' : '#bbf7d0'}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '8.5pt',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Clock size={12} /> {hoursLeft}h {minsLeft}m remaining
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {item.cascadeCount > 0 ? (
                          <span style={{ color: '#0284c7', fontWeight: 'bold' }}>
                            {item.cascadeCount} Student Submission(s)
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => handleRestoreRecycleItem(item._id || item.entityId)}
                            className="cf-btn-primary"
                            style={{ padding: '4px 10px', fontSize: '8pt', backgroundColor: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                          <button
                            onClick={() => handlePurgeRecycleItem(item._id || item.entityId)}
                            className="cf-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '8pt', color: '#dc2626', borderColor: '#fca5a5', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Trash2 size={12} /> Purge
                          </button>
                        </div>
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
