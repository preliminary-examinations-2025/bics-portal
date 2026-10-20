const mongoose = require('mongoose');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { verifyToken } = require('../utils/jwt');
const { toMongoId, toBicsId, isBicsId } = require('../utils/bicsId');
const { CandidateModel } = require('../models/Candidate');
const { logSystemAction } = require('../utils/logger');

const FORBIDDEN_HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Error</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #e6e6e6;
            font-family: Arial, "Segoe UI", sans-serif;
        }
        .header-bar {
            background-color: #505050;
            color: #ffffff;
            font-size: 20px;
            font-weight: normal;
            padding: 10px 20px;
        }
        .main-container {
            margin: 15px 20px;
            background-color: #ffffff;
            border: 1px solid #d4d4d4;
            padding: 12px;
        }
        .error-card {
            border: 1px solid #dcdcdc;
            padding: 12px 16px;
            background-color: #ffffff;
        }
        .error-title {
            color: #cc0000;
            font-size: 16px;
            font-weight: bold;
            margin: 0 0 6px 0;
        }
        .error-message {
            color: #000000;
            font-size: 13px;
            font-weight: bold;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="header-bar">Server Error</div>
    <div class="main-container">
        <div class="error-card">
            <h1 class="error-title">403 - Forbidden: Access is denied.</h1>
            <p class="error-message">You do not have permission to view this directory or page using the credentials that you supplied.</p>
        </div>
    </div>
</body>
</html>`;

/**
 * Extracts and verifies JWT from the Authorization header.
 * Attaches decoded claims to req.user if valid.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : (req.query?.authToken || req.query?.token || null);

    if (!token) {
        // Direct browser navigation gets HTML error
        const acceptHeader = req.headers['accept'] || '';
        if (req.method === 'GET' && acceptHeader.includes('text/html')) {
            return res.status(401).type('html').send(FORBIDDEN_HTML_PAGE);
        }
        return res.status(401).json({
            success: false,
            error: "401 Unauthorized: Authentication token required. Please sign in."
        });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: "401 Unauthorized: Session token is invalid or expired. Please sign in again."
        });
    }

    req.user = decoded;
    return next();
};

/**
 * Strict role-check middleware requiring an active administrator identity.
 * Rejects requests if req.user is absent or req.user.role !== 'admin'.
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`[SECURITY BREACH ATTEMPT] Unauthorized non-admin access attempt on ${req.method} ${req.originalUrl} by user: ${JSON.stringify(req.user || 'unauthenticated')}`);
        
        const acceptHeader = req.headers['accept'] || '';
        if (req.method === 'GET' && acceptHeader.includes('text/html')) {
            return res.status(403).type('html').send(FORBIDDEN_HTML_PAGE);
        }

        return res.status(403).json({
            success: false,
            error: "403 Forbidden: Administrator credentials required. Access denied."
        });
    }
    return next();
};

/**
 * Middleware ensuring a user is authenticated (student or admin).
 */
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return authenticateToken(req, res, next);
    }
    return next();
};

/**
 * IDOR guard: verifies that a student only accesses their own resources.
 * Admins are permitted to view or manage any student's resources.
 * Supports both Mongo ObjectIds and BICS ObjectIds.
 * @param {string|function} idExtractor - Key name in req.query/req.params/req.body or a custom extractor function
 */
const requireOwnerOrAdmin = (idExtractor) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: "401 Unauthorized: Authentication required." });
        }

        // Administrators bypass student ownership check
        if (req.user.role === 'admin') {
            return next();
        }

        let targetId = null;
        if (typeof idExtractor === 'function') {
            targetId = idExtractor(req);
        } else if (typeof idExtractor === 'string') {
            targetId = req.params[idExtractor] || req.query[idExtractor] || req.body[idExtractor];
        }

        if (!targetId) {
            return next();
        }

        const userIdStr = String(req.user.id || '');
        const studentIdStr = String(req.user.studentId || '');
        const usernameStr = String(req.user.username || '');
        const targetStr = String(targetId);

        // Normalize targetStr if it is a BICS ID
        const normalizedTarget = isBicsId(targetStr) ? toMongoId(targetStr) : targetStr;
        const normalizedUser = isBicsId(userIdStr) ? toMongoId(userIdStr) : userIdStr;

        const isOwner = targetStr === userIdStr || 
                        targetStr === studentIdStr || 
                        targetStr === usernameStr ||
                        normalizedTarget === normalizedUser ||
                        toBicsId(normalizedUser) === targetStr;

        if (!isOwner) {
            console.warn(`[IDOR BLOCKED] Student ${req.user.username} (ID: ${userIdStr}) attempted to access resource belonging to candidate: ${targetStr}`);
            return res.status(403).json({
                success: false,
                error: "403 Forbidden: You do not have permission to access another candidate's records."
            });
        }

        return next();
    };
};

const isWhitelisted = (urlPath, method = 'GET') => {
    if (method === 'OPTIONS') return true;
    const fullPath = (urlPath || '').split('?')[0].toLowerCase();
    return (
        fullPath === '/health' || fullPath === '/api/health' ||
        fullPath.startsWith('/api/webhooks/') || fullPath.includes('/webhooks/') ||
        fullPath === '/api/login' || fullPath === '/api/admin/login' || fullPath === '/api/logout' ||
        fullPath === '/api/candidate/login' ||
        fullPath.startsWith('/api/candidate/send-verification-code') ||
        fullPath.startsWith('/api/candidate/verify-code') ||
        fullPath === '/api/config' || fullPath === '/api/system-config' ||
        fullPath === '/api/tests/verify-token' ||
        fullPath.startsWith('/api/tests/submission-verification') ||
        fullPath === '/api/tests/beacon-disconnect' ||
        fullPath === '/api/test/eirf/public-key' ||
        fullPath === '/api/log-client-error' ||
        fullPath.startsWith('/api/kata/')
    );
};

/**
 * Enterprise API Access Gate.
 * 1. Checks and verifies Authorization Bearer JWT on all requests first.
 * 2. Whitelists strictly minimal, public, rate-limited Tier 1 endpoints.
 * 3. Requires valid authentication for all student (Tier 3) and admin (Tier 4) routes.
 */
const authorizeApiRequest = async (req, res, next) => {
    const fullPath = (req.originalUrl || req.path).split('?')[0].toLowerCase();
    const relativePath = req.path.toLowerCase();

    // 1. Process Authorization Bearer token or query authToken/token for direct browser downloads
    const authHeader = req.headers['authorization'];
    const queryAuthToken = req.query?.authToken || req.query?.token;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : null;

    if (bearerToken) {
        const decoded = verifyToken(bearerToken);
        if (decoded) {
            req.user = decoded;
        } else {
            return res.status(401).json({
                success: false,
                error: "401 Unauthorized: Session token is invalid or expired. Please sign in again."
            });
        }
    } else if (queryAuthToken) {
        const decoded = verifyToken(String(queryAuthToken).trim());
        if (decoded) {
            req.user = decoded;
        }
    }

    // 2. Minimal, bounded Tier 1 Public Whitelist
    if (isWhitelisted(fullPath, req.method) || isWhitelisted(relativePath, req.method)) {
        return next();
    }

    // 2.1 Dual Authentication for Online Examination Routes (supports active TestToken session)
    if (!req.user && (
        fullPath.includes('/api/tests/start') || 
        fullPath.includes('/api/tests/proctoring') || 
        fullPath.includes('/api/tests/heartbeat') || 
        fullPath.includes('/api/tests/run') || 
        fullPath.includes('/api/tests/submit') ||
        fullPath.includes('/api/tests/submitted') ||
        fullPath.includes('/api/test/eirf')
    )) {
        const examToken = req.headers['x-exam-token'] || req.query.token || (req.body && req.body.token);
        if (examToken && typeof examToken === 'string') {
            try {
                const { TestTokenModel } = require('../models');
                const { dbState, getJSONData } = require('../config/db');
                let tokenDoc = null;
                if (dbState.useMongo) {
                    tokenDoc = await TestTokenModel.findOne({ token: examToken.trim() });
                } else {
                    const db = getJSONData();
                    tokenDoc = (db.tokens || []).find(t => t.token === examToken.trim());
                }
                if (tokenDoc) {
                    req.user = {
                        id: String(tokenDoc.candidateId),
                        role: 'candidate',
                        studentId: String(tokenDoc.candidateId),
                        username: 'candidate'
                    };
                    req.isExamTokenAuth = true;
                }
            } catch (err) {}
        }

        // Resilient fallback for liveness heartbeat pings on active examination sessions
        if (!req.user && fullPath.includes('/api/tests/heartbeat/')) {
            const parts = fullPath.split('/');
            const subId = parts[parts.length - 1];
            if (subId && subId.length >= 8) {
                try {
                    const { TestSubmissionModel } = require('../models');
                    const { dbState, getJSONData } = require('../config/db');
                    let activeSub = null;
                    if (dbState.useMongo) {
                        activeSub = await TestSubmissionModel.findById(subId).select('candidateId studentId status').lean();
                    } else {
                        const db = getJSONData();
                        activeSub = (db.testSubmissions || []).find(s => String(s.id || s._id) === String(subId));
                    }
                    if (activeSub && activeSub.status === 'started') {
                        req.user = {
                            id: String(activeSub.candidateId || activeSub.studentId),
                            role: 'candidate',
                            studentId: String(activeSub.studentId || activeSub.candidateId),
                            username: 'candidate'
                        };
                        req.isExamTokenAuth = true;
                    }
                } catch (_) {}
            }
        }
    }

    // 3. Admin perimeter check: strictly require role === 'admin'
    if (fullPath.includes('/admin/') || fullPath.endsWith('/admin')) {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: "403 Forbidden: Administrator credentials required. Access denied."
            });
        }
        return next();
    }

    // 4. If user is authenticated (Student or Admin), allow request to proceed to route-level checks
    if (req.user) {
        return next();
    }

    // 5. Legacy API access secret check for non-admin automated scripts
    const secret = process.env.API_ACCESS_SECRET;
    const clientSecret = req.query.apiSecret || 
                         req.query.apiKey || 
                         req.headers['x-portal-api-key'];

    if (secret && clientSecret && clientSecret === secret) {
        return next();
    }

    console.warn(`[SECURITY ALERT] Unauthorized API access blocked: ${req.method} ${req.originalUrl} from IP ${req.ip}`);
    
    const acceptHeader = req.headers['accept'] || '';
    if (req.method === 'GET' && acceptHeader.includes('text/html')) {
        return res.status(401).type('html').send(FORBIDDEN_HTML_PAGE);
    }

    return res.status(401).json({
        success: false,
        error: "401 Unauthorized: Authentication required. Please sign in to access this resource."
    });
};

/**
 * Strict gatekeeper middleware for Kata competitive workspace:
 * - Requires an active, valid JWT token.
 * - If role is 'admin', grants access immediately.
 * - If role is 'student', verifies that the candidate exists in the database
 *   and is an active, enrolled BICS candidate (registrationStatus !== 'Rejected').
 * - Updates lastWorkspaceAccessAt and lastWorkspaceIp for security tracking.
 * - Records unauthorized access attempts in SystemLog for security audits.
 */
const requireBicsStudentOrAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : null;

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    if (!token) {
        logSystemAction({
            actor: 'unauthenticated',
            actorId: 'guest',
            actorRole: 'guest',
            action: 'UNAUTHORIZED_KATA_ACCESS',
            resourceType: 'kata_workspace',
            details: `Unauthenticated access blocked on ${req.method} ${req.originalUrl} from IP ${clientIp}`,
            ipAddress: clientIp,
            userAgent: userAgent,
            severity: 'warning'
        }).catch(() => {});

        return res.status(401).json({
            success: false,
            error: "401 Unauthorized: Access to the Kata workspace requires an active BICS student or administrator session. Please sign in."
        });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        logSystemAction({
            actor: 'unauthenticated',
            actorId: 'invalid_token',
            actorRole: 'guest',
            action: 'INVALID_TOKEN_KATA_ACCESS',
            resourceType: 'kata_workspace',
            details: `Invalid or expired session token presented on ${req.method} ${req.originalUrl} from IP ${clientIp}`,
            ipAddress: clientIp,
            userAgent: userAgent,
            severity: 'warning'
        }).catch(() => {});

        return res.status(401).json({
            success: false,
            error: "401 Unauthorized: Session token is invalid or expired. Please sign in again."
        });
    }

    req.user = decoded;

    // Administrators have full access
    if (decoded.role === 'admin') {
        return next();
    }

    // Verify student exists and is active in database
    try {
        const orClauses = [];
        if (typeof decoded.username === 'string' && decoded.username.trim()) {
            orClauses.push({ username: decoded.username.trim() });
        }
        if (typeof decoded.studentId === 'string' && decoded.studentId.trim()) {
            orClauses.push({ studentId: decoded.studentId.trim() });
        }
        if (typeof decoded.id === 'string' && mongoose.Types.ObjectId.isValid(decoded.id)) {
            orClauses.push({ _id: decoded.id });
        }

        if (orClauses.length === 0) {
            return res.status(401).json({
                success: false,
                error: "401 Unauthorized: Malformed student identity in session token."
            });
        }

        let candidate = null;
        if (dbState.useMongo && mongoose.connection.readyState === 1) {
            candidate = await CandidateModel.findOne({ $or: orClauses });
        } else {
            const db = getJSONData();
            candidate = (db.candidates || []).find(c =>
                (decoded.username && c.username === decoded.username) ||
                (decoded.studentId && c.studentId === decoded.studentId) ||
                String(c.id || c._id) === String(decoded.id)
            );
        }

        if (!candidate) {
            logSystemAction({
                actor: decoded.username || 'unknown',
                actorId: decoded.id || 'unknown',
                actorRole: 'student',
                action: 'NON_STUDENT_KATA_ACCESS',
                resourceType: 'kata_workspace',
                details: `Non-enrolled access attempt by ${decoded.username} on ${req.method} ${req.originalUrl} from IP ${clientIp}`,
                ipAddress: clientIp,
                userAgent: userAgent,
                severity: 'warning'
            }).catch(() => {});

            return res.status(403).json({
                success: false,
                error: "403 Forbidden: Only registered BICS students are permitted access to the Kata workspace."
            });
        }

        if (candidate.registrationStatus === 'Rejected') {
            return res.status(403).json({
                success: false,
                error: "403 Forbidden: Your BICS candidate registration has been rejected. Access denied."
            });
        }

        // Record workspace access
        candidate.lastWorkspaceAccessAt = new Date();
        candidate.lastWorkspaceIp = clientIp;
        if (typeof candidate.save === 'function') {
            await candidate.save();
        } else {
            const db = getJSONData();
            saveJSONData(db);
        }

        req.candidate = candidate;
        return next();
    } catch (err) {
        console.error('[requireBicsStudentOrAdmin] Error verifying candidate:', err);
        return res.status(500).json({ success: false, error: "Server error verifying BICS student authorization." });
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireAuth,
    requireOwnerOrAdmin,
    requireBicsStudentOrAdmin,
    authorizeApiRequest,
    isWhitelisted,
    FORBIDDEN_HTML_PAGE
};

