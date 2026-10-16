const jwt = require('jsonwebtoken');

const DEFAULT_SECRET = 'bics_jwt_fallback_secret_change_in_production_2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('[SECURITY CRITICAL] JWT_SECRET environment variable is missing in production!');
}

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
 * @returns {object|null} Decoded payload or null if invalid/expired
 */
const verifyToken = (token) => {
    if (!token) return null;
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
    JWT_SECRET
};
