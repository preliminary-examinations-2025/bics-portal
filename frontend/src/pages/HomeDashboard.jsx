import React from 'react';
import { Bell, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

export default function HomeDashboard({
  systemConfig,
  configLoading = false,
  configError = '',
  onRetryConfig
}) {
  if (!systemConfig) {
    if (configError) {
      return (
        <div>
          <div className="cf-card">
            <div className="cf-card-title">
              <Bell size={16} style={{ color: '#3b5998' }} />
              <span>Portal Announcements</span>
            </div>
            <div
              className="cf-alert cf-alert-error"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'flex-start',
                marginTop: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                <AlertTriangle size={16} />
                <span>Unable to Load Portal Configuration</span>
              </div>
              <p style={{ margin: 0, fontSize: '9.5pt', lineHeight: '1.5' }}>
                {configError}
              </p>
              {typeof onRetryConfig === 'function' && (
                <button
                  type="button"
                  className="cf-btn-primary"
                  onClick={onRetryConfig}
                  disabled={configLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={13} className={configLoading ? 'spin-smooth' : ''} />
                  <span>{configLoading ? 'Reconnecting...' : 'Retry Connection'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="cf-card">
          <div className="cf-card-title">
            <Bell size={16} style={{ color: '#3b5998' }} />
            <span>Portal Announcements</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '24px 12px',
              color: '#475569',
              fontSize: '9.5pt'
            }}
          >
            <Loader2 size={18} className="spinner" style={{ color: '#3b5998', flexShrink: 0 }} />
            <span>Synchronizing portal announcements and academic settings...</span>
          </div>
        </div>
      </div>
    );
  }

  const announcements = Array.isArray(systemConfig.announcements) ? systemConfig.announcements : [];

  return (
    <div>
      <div className="cf-card">
        <div className="cf-card-title">
          <Bell size={16} style={{ color: '#3b5998' }} />
          <span>Portal Announcements</span>
          {configError && typeof onRetryConfig === 'function' && (
            <button
              type="button"
              className="cf-btn-secondary"
              onClick={onRetryConfig}
              disabled={configLoading}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '8pt', padding: '3px 9px' }}
            >
              <RefreshCw size={12} className={configLoading ? 'spin-smooth' : ''} />
              <span>{configLoading ? 'Refreshing...' : 'Retry Sync'}</span>
            </button>
          )}
        </div>

        {configError && (
          <div className="cf-alert cf-alert-info" style={{ marginBottom: '12px', fontSize: '8.5pt' }}>
            Showing cached announcements. Background refresh notice: {configError}
          </div>
        )}

        {announcements.length === 0 ? (
          <p style={{ fontStyle: 'italic', color: '#666' }}>No active announcements.</p>
        ) : (
          announcements.map((a, idx) => (
            <div key={a?.id || idx} style={{ borderBottom: idx !== announcements.length - 1 ? '1px solid #cbd5e1' : 'none', paddingBottom: '14px', marginBottom: '14px' }}>
              <span className="status-badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 6px', fontSize: '7.5pt' }}>
                {a?.date || 'Notice'}
              </span>
              <p style={{
                marginTop: '10px',
                fontSize: '10pt',
                color: '#1e293b',
                lineHeight: '1.8',
                textAlign: 'justify',
                textJustify: 'inter-word',
                width: '100%',
                marginRight: 0,
                wordBreak: 'break-word'
              }}>
                {a?.text || ''}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
