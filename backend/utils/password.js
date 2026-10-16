const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

/**
 * Checks if a string looks like a bcrypt hash ($2a$, $2b$, or $2y$)
 * @param {string} str 
 * @returns {boolean}
 */
const isBcryptHash = (str) => {
    if (typeof str !== 'string') return false;
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
};

/**
 * Generate a salted bcrypt hash of a password.
 * @param {string} password 
 * @returns {Promise<string>}
 */
const hashPassword = async (password) => {
    if (typeof password !== 'string' || !password) {
        throw new Error('Password must be a non-empty string');
    }
    return await bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compare an incoming plaintext password with a stored password (supporting both bcrypt and legacy plaintext).
 * @param {string} plaintext - Plaintext candidate password
 * @param {string} stored - Stored password (hash or legacy plaintext)
 * @returns {Promise<boolean>}
 */
const comparePassword = async (plaintext, stored) => {
    if (typeof plaintext !== 'string' || typeof stored !== 'string') {
        return false;
    }

    if (isBcryptHash(stored)) {
        return await bcrypt.compare(plaintext, stored);
    }

    // Legacy plaintext comparison using timing-safe check to prevent timing attacks
    const plainBuf = Buffer.from(plaintext);
    const storedBuf = Buffer.from(stored);
    if (plainBuf.length !== storedBuf.length) {
        return false;
    }
    return crypto.timingSafeEqual(plainBuf, storedBuf);
};

module.exports = {
    isBcryptHash,
    hashPassword,
    comparePassword
};
