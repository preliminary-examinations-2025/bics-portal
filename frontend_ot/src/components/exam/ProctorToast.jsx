import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * ProctorToast: Dark floating bottom-right toast notification for live proctoring alerts.
 * Matches official BICS reference design (dark charcoal container, white typography, right-aligned dismiss).
 */
export function ProctorToast({
  message,
  onDismiss,
  duration = 7000
}) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        if (onDismiss) onDismiss();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [message, duration, onDismiss]);

  if (!visible || !message) return null;

  return (
    <>
      <style>{`
        @keyframes proctorToastSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .proctor-toast-container {
          animation: proctorToastSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div
        className="proctor-toast-container"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          backgroundColor: '#222222',
          color: '#ffffff',
          borderRadius: '6px',
          padding: '11px 16px',
          maxWidth: '420px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          fontSize: '9pt',
          fontWeight: '500',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          lineHeight: '1.45',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          pointerEvents: 'auto'
        }}
      >
        <div style={{ flex: 1, wordBreak: 'break-word' }}>
          {message}
        </div>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            if (onDismiss) onDismiss();
          }}
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            color: '#e2e8f0',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.85,
            transition: 'opacity 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

export default ProctorToast;
