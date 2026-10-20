const jwt = require('jsonwebtoken');

const DEFAULT_SECRET = 'bics_jwt_fallback_secret_change_in_production_2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('[SECURITY CRITICAL] JWT_SECRET environment variable is missing in production!');
}

// In-memory revoked tokens store (with TTL cleanup)
const revokedTokens = new Map();

/**
 * Revoke a JWT on signout across all frontends and services.
 * @param {string} token 
 */
const revokeToken = (token) => {
    if (!token) return;
    try {
        const decoded = jwt.decode(token);
        const expMs = decoded && decoded.exp ? decoded.exp * 1000 : (Date.now() + 7 * 24 * 3600 * 1000);
        revokedTokens.set(token, expMs);
    } catch {
        revokedTokens.set(token, Date.now() + 24 * 3600 * 1000);
    }
};

/**
 * Check if a token has been explicitly revoked via logout.
 * @param {string} token 
 * @returns {boolean}
 */
const isTokenRevoked = (token) => {
    if (!token) return true;
    if (!revokedTokens.has(token)) return false;
    const exp = revokedTokens.get(token);
    if (Date.now() > exp) {
        revokedTokens.delete(token);
        return false;
    }
    return true;
};

/**
 * Generate a cryptographically signed JWT.
 * @param {object} payload - Identity claims (id, role, username, studentId)
 * @param {string} [expiresIn] - Expiration window, e.g. '12h' or '7d'
 * @returns {string} Signed JWT
 */
const generateToken = (payload, expiresIn) => {
    const defaultExpiry = payload.role === 'admin' 
        ? (process.env.JWT_EXPIRES_IN || '12h')
        : (process.env.JWT_STUDENT_EXPIRES_IN || '7d');
    
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: expiresIn || defaultExpiry,
        issuer: 'bics-portal'
    });
};

/**
 * Verify and decode a JWT.
 * @param {string} token - The Bearer token
 * @returns {object|null} Decoded payload or null if invalid, expired, or revoked
 */
const verifyToken = (token) => {
    if (!token) return null;
    if (isTokenRevoked(token)) return null;
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'bics-portal'
        });
    } catch (err) {
        return null;
    }
};

module.exports = {
    generateToken,
    verifyToken,
    revokeToken,
    isTokenRevoked,
    JWT_SECRET
};
