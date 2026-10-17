import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

/**
 * Normalizes proctoring and compliance messages into polite, non-accusatory system notices.
 * Adheres strictly to the user reference design:
 * - Dark charcoal pill card (#262626).
 * - Common white triangle SVG icon (AlertTriangle) across all notifications.
 * - Clean white text and white close icon.
 * - No red or yellow colors.
 */
function getPoliteSystemNotice(rawMessage = '', eventType = '') {
  const text = String(rawMessage || '').toLowerCase();
  const type = String(eventType || '').toUpperCase();

  if (type === 'RIGHT_CLICK_BLOCKED' || text.includes('right-click') || text.includes('context menu') || text.includes('context_menu')) {
    return 'The right-click menu is blocked by the system in active test environment.';
  }
  if (type === 'CLIPBOARD_ATTEMPT' || text.includes('clipboard') || text.includes('copy') || text.includes('paste') || text.includes('cut')) {
    if (text.includes('paste')) {
      return 'The paste action is blocked by the system in active test environment.';
    }
    if (text.includes('cut')) {
      return 'The cut action is blocked by the system in active test environment.';
    }
    if (text.includes('drag') || text.includes('drop')) {
      return 'Drag and drop operations are blocked by the system in active test environment.';
    }
    return 'The copy action is blocked by the system in active test environment.';
  }
  if (type === 'DEVTOOLS_OPENED' || type === 'INSPECT_ATTEMPT' || text.includes('devtools') || text.includes('inspect') || text.includes('shortcut')) {
    return 'Developer tools and inspection shortcuts are disabled by the system in active test environment.';
  }
  // Major violations FULLSCREEN_EXIT and TAB_SWITCH are handled strictly by dedicated modal
  if (
    type === 'FULLSCREEN_EXIT' ||
    type === 'TAB_SWITCH' ||
    text.includes('fullscreen') ||
    text.includes('full-screen') ||
    text.includes('navigating away') ||
    text.includes('switched tab') ||
    text.includes('window focus')
  ) {
    return null;
  }
  if (type === 'VOICE_DETECTED' || text.includes('voice') || text.includes('audio') || text.includes('noise')) {
    return 'Background audio or voice activity was detected by the proctoring system. Please maintain silence.';
  }
  if (type === 'MULTI_FACE' || text.includes('multiple faces')) {
    return 'More than one face was detected in the camera frame. Please ensure you are alone in the room.';
  }
  if (type === 'LOOKING_AWAY' || text.includes('looking away') || text.includes('facing forward') || text.includes('gaze')) {
    return 'Gaze deviation was detected. Please keep your attention focused forward on the test screen.';
  }
  if (type === 'FACE_MISSING' || text.includes('no face') || text.includes('visible to the webcam') || text.includes('face is not')) {
    return 'Your face is not clearly visible in the camera frame. Please position yourself facing the webcam.';
  }
  if (type === 'NETWORK_OFFLINE' || text.includes('offline') || text.includes('network connection')) {
    return 'Network connection was lost. Answers are cached locally and will sync once connectivity returns.';
  }
  if (type === 'MINOR_WARNINGS_EXCEEDED' || text.includes('minor warnings')) {
    return 'Multiple system security notices have been logged for this session.';
  }

  // Fallback: Strip legacy harsh prefixes
  const cleaned = rawMessage
    .replace(/^Proctor (Reminder|Alert|Warning):/i, '')
    .replace(/^CLIPBOARD LOCKDOWN:/i, '')
    .replace(/^Action Blocked:/i, '')
    .replace(/^Network Offline:/i, '')
    .replace(/You are reported\.?/gi, '')
    .trim();

  return cleaned || 'System security policy is active for this examination.';
}

/**
 * Normalizes any warning input into a consistent white toast data structure.
 */
function normalizeToast(raw, fallbackId = 'toast') {
  if (!raw) return null;
  let id = (typeof raw === 'object' && raw.id) ? raw.id : fallbackId;

  // Major violations FULLSCREEN_EXIT and TAB_SWITCH are handled strictly by dedicated modal
  if (id === 'FULLSCREEN_EXIT' || id === 'TAB_SWITCH') {
    return null;
  }

  let title = 'System Security Notice';
  let body = typeof raw === 'string' ? raw : (raw.message || raw.body || '');
  let persistent = false;
  let duration = (typeof raw === 'object' && raw.duration) ? raw.duration : 6000;

  if (typeof raw === 'object' && raw !== null) {
    persistent = raw.persistent === true;
    body = getPoliteSystemNotice(raw.message || raw.body || '', raw.id || fallbackId);
  } else if (typeof raw === 'string') {
    if (raw.startsWith('Proctor Reminder:') || raw.startsWith('Network Offline:')) {
      persistent = true;
    }
    body = getPoliteSystemNotice(raw, fallbackId);
  }

  if (!body) return null;
  return { id, title, body, persistent, duration };
}

/**
 * Individual Toast Item
 * Rendered strictly as a sleek dark charcoal card (#262626) with common white triangle SVG icon.
 * Matches user-provided visual reference design with 0 red or yellow colors.
 */
function ToastItem({ item, onDismiss }) {
  const { id, body, persistent, duration } = item;

  // Auto-dismiss only for non-persistent (transient) warnings
  useEffect(() => {
    if (!persistent && duration > 0) {
      const timer = setTimeout(() => {
        if (onDismiss) onDismiss(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, persistent, duration, onDismiss]);

  return (
    <div
      className="proctor-toast-item"
      data-toast-id={id}
      style={{
        backgroundColor: '#262626',
        color: '#ffffff',
        borderRadius: '6px',
        padding: '12px 16px',
        width: '100%',
        boxSizing: 'border-box',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        fontSize: '9.5pt',
        fontWeight: '400',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        lineHeight: '1.45',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        pointerEvents: 'auto',
        animation: 'proctorToastSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        {/* Common white triangle warning SVG across all notifications */}
        <AlertTriangle
          size={16}
          color="#ffffff"
          strokeWidth={2.2}
          style={{ flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', color: '#ffffff' }}>
          {body}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDismiss?.(id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          color: '#ffffff',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.85,
          transition: 'opacity 0.15s ease',
          flexShrink: 0
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
      >
        <X size={15} strokeWidth={2.5} color="#ffffff" />
      </button>
    </div>
  );
}

/**
 * ProctorToast: Floating bottom-right multi-toast container for live proctoring alerts.
 * - Renders simple white toast notifications with unified white SVG icon.
 * - Keeps warning toasts visible as long as that violation condition is running (persistent).
 * - Dynamically removes a toast as soon as that specific condition resolves.
 * - Supports concurrent multi-toast display (e.g., face missing + voice detected stacked together).
 */
export function ProctorToast({
  toasts,
  message,
  onDismiss,
  onDismissToast
}) {
  let toastList = [];

  if (Array.isArray(toasts)) {
    toastList = toasts.map((t, idx) => normalizeToast(t, t?.id || `toast_${idx}`)).filter(Boolean);
  } else if (toasts && typeof toasts === 'object') {
    toastList = Object.entries(toasts).map(([k, v]) => normalizeToast(v, k)).filter(Boolean);
  } else if (message) {
    const norm = normalizeToast(message, 'legacy_warning');
    if (norm) toastList = [norm];
  }

  // Ensure major violations FULLSCREEN_EXIT and TAB_SWITCH are never rendered as toasts (handled by modal)
  toastList = toastList.filter(t => t && t.id !== 'FULLSCREEN_EXIT' && t.id !== 'TAB_SWITCH');

  if (toastList.length === 0) return null;

  const handleDismiss = (id) => {
    if (onDismissToast) {
      onDismissToast(id);
    } else if (onDismiss) {
      onDismiss(id);
    }
  };

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
      `}</style>
      <div
        className="proctor-toast-stack"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '10px',
          maxWidth: '430px',
          width: 'calc(100vw - 48px)',
          pointerEvents: 'none'
        }}
      >
        {toastList.map(item => (
          <ToastItem
            key={item.id}
            item={item}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </>
  );
}

export default ProctorToast;
