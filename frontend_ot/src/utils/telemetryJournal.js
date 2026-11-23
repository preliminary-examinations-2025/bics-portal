/**
 * telemetryJournal.js
 * Client-Side Outage Journal & Reconnect Telemetry Manager for BICS OT Examination Terminal.
 * 
 * Captures all failed API requests during server downtime, tracks blackout windows,
 * and compiles authoritative Client Reconnect Telemetry payloads for server reconciliation.
 */

const MAX_JOURNAL_ENTRIES = 100;
const STORAGE_KEY_JOURNAL = 'bics_client_failed_journal';
const STORAGE_KEY_OUTAGE = 'bics_client_active_outage';
const STORAGE_KEY_PENDING_TELEMETRY = 'bics_client_pending_reconnect_telemetry';

// In-memory state
let inMemoryJournal = [];
let activeOutage = null; // { startTime, submissionId, reason, startEventLogged }
let pendingTelemetry = null; // Stored payload ready for server dispatch

// Initialize from storage on load
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const storedJournal = sessionStorage.getItem(STORAGE_KEY_JOURNAL);
    if (storedJournal) inMemoryJournal = JSON.parse(storedJournal);

    const storedOutage = sessionStorage.getItem(STORAGE_KEY_OUTAGE);
    if (storedOutage) activeOutage = JSON.parse(storedOutage);

    const storedTelemetry = sessionStorage.getItem(STORAGE_KEY_PENDING_TELEMETRY);
    if (storedTelemetry) pendingTelemetry = JSON.parse(storedTelemetry);
  }
} catch (e) {
  console.warn('[TelemetryJournal] Storage init warning:', e.message);
}

function persistState() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(STORAGE_KEY_JOURNAL, JSON.stringify(inMemoryJournal.slice(-MAX_JOURNAL_ENTRIES)));
      if (activeOutage) {
        sessionStorage.setItem(STORAGE_KEY_OUTAGE, JSON.stringify(activeOutage));
      } else {
        sessionStorage.removeItem(STORAGE_KEY_OUTAGE);
      }
      if (pendingTelemetry) {
        sessionStorage.setItem(STORAGE_KEY_PENDING_TELEMETRY, JSON.stringify(pendingTelemetry));
      } else {
        sessionStorage.removeItem(STORAGE_KEY_PENDING_TELEMETRY);
      }
    }
  } catch (e) {
    // Non-fatal quota or security restriction
  }
}

/**
 * Record a failed request in the client-side journal
 */
export function recordFailedRequest({ endpoint, method = 'POST', errorType = 'FETCH_FAILED', httpStatus = null, submissionId = null }) {
  const entry = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    epochMs: Date.now(),
    endpoint: endpoint || '/api/unknown',
    method,
    errorType,
    httpStatus: typeof httpStatus === 'number' ? httpStatus : null
  };

  inMemoryJournal.push(entry);
  if (inMemoryJournal.length > MAX_JOURNAL_ENTRIES) {
    inMemoryJournal.shift();
  }

  persistState();
  return entry;
}

/**
 * Check if a server outage window is currently underway
 */
export function isServerOutageActive() {
  return activeOutage !== null;
}

/**
 * Start an outage window when server becomes unreachable
 * Returns a proctoring event object to log, or null if already in an active outage
 */
export function startServerOutage(submissionId, reason = 'SERVER_UNREACHABLE') {
  if (activeOutage) {
    return null; // Already tracking active outage
  }

  const now = Date.now();
  const startTimeIso = new Date(now).toISOString();

  activeOutage = {
    startTime: now,
    startTimeIso,
    submissionId: submissionId || null,
    reason,
    startEventLogged: true
  };

  persistState();

  return {
    type: 'SERVER_OUTAGE_SUSPECTED',
    timestamp: startTimeIso,
    severity: 'INFO',
    details: `Backend unreachable (${reason}). Global internet access confirmed. Server outage journal activated locally.`
  };
}

/**
 * Close the outage window when server returns 200 OK
 * Returns { event, telemetry } or null if no outage was active
 */
export function endServerOutage(submissionId) {
  if (!activeOutage) {
    return null;
  }

  const now = Date.now();
  const endTimeIso = new Date(now).toISOString();
  const startTime = activeOutage.startTime;
  const startTimeIso = activeOutage.startTimeIso;
  const durationSeconds = Math.max(1, Math.round((now - startTime) / 1000));

  // Collect entries that occurred during this outage window
  const windowJournal = inMemoryJournal.filter(
    (e) => e.epochMs >= startTime - 1000 && e.epochMs <= now + 1000
  );

  const subId = submissionId || activeOutage.submissionId || null;

  const telemetryPayload = {
    submissionId: subId,
    outageWindow: {
      clientObservedStart: startTimeIso,
      clientObservedEnd: endTimeIso,
      durationSeconds
    },
    failedRequestsCount: windowJournal.length,
    failedRequestsJournal: windowJournal.map(({ id, timestamp, endpoint, method, errorType, httpStatus }) => ({
      id,
      timestamp,
      endpoint,
      method,
      errorType,
      httpStatus
    }))
  };

  // Stage as pending telemetry until acknowledged by server
  pendingTelemetry = telemetryPayload;
  activeOutage = null;
  persistState();

  const resolvedEvent = {
    type: 'SERVER_OUTAGE_RESOLVED',
    timestamp: endTimeIso,
    severity: 'INFO',
    durationSeconds,
    failedAttempts: windowJournal.length,
    details: `Server connectivity restored after ${durationSeconds}s outage. Buffered ${windowJournal.length} failed attempts locally.`
  };

  return {
    event: resolvedEvent,
    telemetry: telemetryPayload
  };
}

/**
 * Get any unacknowledged reconnect telemetry payload
 */
export function getPendingTelemetry() {
  return pendingTelemetry;
}

/**
 * Clear pending telemetry after successful acknowledgment by backend
 */
export function clearPendingTelemetry() {
  pendingTelemetry = null;
  persistState();
}

/**
 * Get in-memory journal entries for diagnostics
 */
export function getJournalEntries() {
  return [...inMemoryJournal];
}

/**
 * Get active outage metadata
 */
export function getActiveOutage() {
  return activeOutage ? { ...activeOutage } : null;
}

/**
 * Helper to dispatch Client Reconnect Telemetry fire-and-forget to the backend
 */
export async function dispatchReconnectTelemetry(apiBase, authToken, examToken, payload = null) {
  const data = payload || pendingTelemetry;
  if (!data || !data.submissionId) return null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    if (examToken) headers['x-exam-token'] = examToken;

    const res = await fetch(`${apiBase}/tests/telemetry/reconnect`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      const result = await res.json();
      clearPendingTelemetry();
      return result;
    }
  } catch (err) {
    console.warn('[TelemetryJournal] Failed to dispatch reconnect telemetry (will retry on next sync):', err.message);
  }
  return null;
}
