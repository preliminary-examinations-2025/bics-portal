/**
 * Fire-and-Forget Selective Audit Middleware
 * 
 * Selectively audits high-value state mutations and errors (>= 400),
 * intentionally ignoring 401 Unauthorized (auth expiry noise) and 404 (scanner probes).
 * 
 * Features:
 * - Zero impact on routine HTTP throughput (skips 2xx/3xx GET requests)
 * - Automatic data scrubbing for passwords, JWT tokens, and secrets
 * - Built-in Circuit Breaker to prevent database choking during high load
 * - Fire-and-forget execution via process.nextTick (never blocks HTTP response)
 */

const { AuditLogModel } = require('../models');

// In-Memory Circuit Breaker state
let consecutiveErrors = 0;
let circuitBreakerTrippedUntil = 0;
const CIRCUIT_BREAKER_TRIP_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60000; // 60s cooldown

/**
 * Recursively redacts sensitive keys from request payloads
 */
function sanitizeRequestBody(body) {
    if (!body || typeof body !== 'object') return null;
    try {
        const scrubbed = Array.isArray(body) ? [...body] : { ...body };
        const sensitiveKeys = ['password', 'token', 'authorization', 'secret', 'key', 'answers', 'sourcecode'];

        for (const [key, val] of Object.entries(scrubbed)) {
            const lowerKey = key.toLowerCase();
            if (sensitiveKeys.some(s => lowerKey.includes(s))) {
                scrubbed[key] = '[REDACTED]';
            } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                scrubbed[key] = sanitizeRequestBody(val);
            }
        }
        return scrubbed;
    } catch (_) {
        return { note: '[Redaction Error]' };
    }
}

function selectiveAuditMiddleware(req, res, next) {
    const startTime = Date.now();

    res.on('finish', () => {
        const statusCode = res.statusCode;
        const originalUrl = req.originalUrl || req.url || '';
        const cleanPath = originalUrl.split('?')[0];

        // 1. Noise Filter: Ignore 401 Unauthorized (JWT expiration noise) and 404 Not Found (web scanners)
        if (statusCode === 401 || statusCode === 404) {
            return;
        }

        // 2. Ignore static asset pings, health checks, and routine read-only GET requests that succeeded
        if (cleanPath.startsWith('/public') || cleanPath.startsWith('/media') || cleanPath === '/api/health') {
            return;
        }

        const isError = statusCode >= 400;
        const isStateMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && (
            cleanPath.startsWith('/api/tests') ||
            cleanPath.startsWith('/api/admin') ||
            cleanPath.startsWith('/api/attendance') ||
            cleanPath.startsWith('/api/candidates') ||
            cleanPath.startsWith('/api/counterfoil')
        );

        // Only log if it's a real failure or a high-value state-changing exam mutation
        if (!isError && !isStateMutation) {
            return;
        }

        // 3. Circuit Breaker Protection: Drop DB audit writes if MongoDB is currently choking
        if (Date.now() < circuitBreakerTrippedUntil) {
            return;
        }

        // Categorize incident
        let category = 'STATE_MUTATION';
        if (statusCode >= 500) {
            category = 'SERVER_ERROR_5XX';
        } else if (statusCode === 409) {
            category = 'CONFLICT_409';
        } else if (statusCode === 403) {
            category = 'SECURITY_BLOCK_403';
        } else if (statusCode >= 400) {
            category = 'CLIENT_ERROR_4XX';
        }

        const durationMs = Date.now() - startTime;
        const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
        const userAgent = (req.headers['user-agent'] || '').substring(0, 250);
        const userId = req.user?.id || req.user?._id || null;
        const studentId = req.user?.studentId || req.body?.studentId || null;
        const submissionId = req.body?.submissionId || req.params?.subId || req.params?.id || null;
        const errorMessage = res.locals?.errorMessage || (statusCode >= 500 ? 'Internal Server Error' : null);
        const sanitizedSummary = isStateMutation || isError ? sanitizeRequestBody(req.body) : null;

        // 4. Fire-and-Forget Asynchronous Write (Never block client response)
        process.nextTick(() => {
            AuditLogModel.create({
                timestamp: new Date(),
                method: req.method,
                path: cleanPath,
                statusCode,
                durationMs,
                category,
                userId,
                studentId,
                submissionId,
                ip: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : String(clientIp),
                userAgent,
                errorMessage,
                requestSummary: sanitizedSummary
            }).then(() => {
                consecutiveErrors = 0;
            }).catch((err) => {
                consecutiveErrors++;
                if (consecutiveErrors >= CIRCUIT_BREAKER_TRIP_THRESHOLD) {
                    circuitBreakerTrippedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
                    console.error(`[AUDIT CIRCUIT BREAKER] Tripped for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s due to ${consecutiveErrors} consecutive DB write failures.`);
                }
                console.error(`[AUDIT_LOG_FALLBACK] ${statusCode} ${req.method} ${cleanPath}: ${err.message}`);
            });
        });
    });

    next();
}

module.exports = {
    selectiveAuditMiddleware
};
