import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function CustomAlertModal({ customModal, setCustomModal }) {
  if (!customModal?.isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 600000
    }}>
      <div className="cf-card" style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        width: '90%',
        maxWidth: '460px',
        padding: '24px',
        margin: 0,
        border: '1px solid #e2e8f0',
        textAlign: 'left'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '12pt', color: '#002147', fontWeight: 'bold', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span>{customModal.title}</span>
        </h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '9.5pt', color: '#475569', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
          {customModal.message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {!customModal.isAlert && customModal.cancelText && (
            <button
              type="button"
              onClick={() => setCustomModal(prev => ({ ...prev, isOpen: false }))}
              style={{
                minWidth: '80px',
                padding: '6px 12px',
                fontSize: '9pt',
                background: '#ffffff',
                border: '1px solid #ccc',
                color: '#333',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {customModal.cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const confirmCb = customModal.onConfirm;
              setCustomModal(prev => ({ ...prev, isOpen: false }));
              if (typeof confirmCb === 'function') {
                confirmCb();
              }
            }}
            style={{
              minWidth: '80px',
              padding: '6px 14px',
              fontSize: '9pt',
              background: '#e11d48',
              border: '1px solid #e11d48',
              color: '#ffffff',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {customModal.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomAlertModal;
