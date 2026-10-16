const crypto = require('crypto');
const mongoose = require('mongoose');

function getSecret() {
    return process.env.BICS_OBJID_SECRET || process.env.JWT_SECRET || 'bics_objid_feistel_default_secret_key_2026';
}

/**
 * 6-round Feistel round function using HMAC-SHA256
 */
function feistelRound(halfBuffer, roundNum) {
    const hmac = crypto.createHmac('sha256', getSecret());
    hmac.update(halfBuffer);
    hmac.update(Buffer.from([roundNum]));
    return hmac.digest().subarray(0, 6);
}

/**
 * Encrypt a 12-byte Buffer into a 12-byte Buffer using a 6-round balanced Feistel cipher
 */
function encrypt12Bytes(buf) {
    let left = Buffer.from(buf.subarray(0, 6));
    let right = Buffer.from(buf.subarray(6, 12));
    for (let r = 0; r < 6; r++) {
        const f = feistelRound(right, r);
        const newRight = Buffer.alloc(6);
        for (let i = 0; i < 6; i++) {
            newRight[i] = left[i] ^ f[i];
        }
        left = right;
        right = newRight;
    }
    return Buffer.concat([left, right]);
}

/**
 * Decrypt a 12-byte Buffer back to the original 12-byte Buffer
 */
function decrypt12Bytes(buf) {
    let left = Buffer.from(buf.subarray(0, 6));
    let right = Buffer.from(buf.subarray(6, 12));
    for (let r = 5; r >= 0; r--) {
        const f = feistelRound(left, r);
        const prevLeft = Buffer.alloc(6);
        for (let i = 0; i < 6; i++) {
            prevLeft[i] = right[i] ^ f[i];
        }
        right = left;
        left = prevLeft;
    }
    return Buffer.concat([left, right]);
}

function base36ToBigInt(str) {
    let bn = 0n;
    for (const c of str) {
        bn = bn * 36n + BigInt(parseInt(c, 36));
    }
    return bn;
}

/**
 * Checks if a string matches the 6-4-4-6 BICS ObjId format
 */
function isBicsId(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[a-z0-9]{6}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{6}$/.test(str);
}

/**
 * Checks if a string matches the 24-hex Mongo ObjectId format
 */
function isMongoId(str) {
    if (!str) return false;
    const s = str.toString();
    return /^[a-fA-F0-9]{24}$/.test(s);
}

/**
 * Encrypt a 24-character hexadecimal MongoDB ObjectId to a 23-char BICS ObjId (6-4-4-6)
 * @param {string|mongoose.Types.ObjectId} mongoId 
 * @returns {string|null} BICS ObjId, or null if invalid
 */
function toBicsId(mongoId) {
    if (!mongoId) return null;
    const hexStr = (typeof mongoId === 'object' && mongoId.toString) ? mongoId.toString() : String(mongoId);
    if (!/^[a-fA-F0-9]{24}$/.test(hexStr)) {
        return hexStr;
    }

    try {
        const enc = encrypt12Bytes(Buffer.from(hexStr, 'hex'));
        const bn = BigInt('0x' + enc.toString('hex'));
        const b36_19 = bn.toString(36).padStart(19, '0');

        // Append 1-character HMAC-based checksum
        const hmac = crypto.createHmac('sha256', getSecret()).update(b36_19).digest();
        const checksumChar = (hmac[0] % 36).toString(36);
        const raw20 = b36_19 + checksumChar;

        return `${raw20.slice(0, 6)}-${raw20.slice(6, 10)}-${raw20.slice(10, 14)}-${raw20.slice(14, 20)}`;
    } catch (e) {
        return hexStr;
    }
}

/**
 * Decrypt a 23-character BICS ObjId (6-4-4-6) back to the 24-hex MongoDB ObjectId
 * @param {string} bicsId 
 * @returns {string|null} 24-hex Mongo ObjectId, or null if invalid/tampered
 */
function toMongoId(bicsId) {
    if (!bicsId || typeof bicsId !== 'string') return null;
    const clean = bicsId.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.length !== 20) return null;

    try {
        const b36_19 = clean.slice(0, 19);
        const checksumChar = clean[19];

        const hmac = crypto.createHmac('sha256', getSecret()).update(b36_19).digest();
        const expectedChar = (hmac[0] % 36).toString(36);
        if (checksumChar !== expectedChar) {
            return null; // Tampered or invalid BICS ObjId
        }

        const bn = base36ToBigInt(b36_19);
        const encHex = bn.toString(16).padStart(24, '0');
        const decBuf = decrypt12Bytes(Buffer.from(encHex, 'hex'));
        return decBuf.toString('hex');
    } catch (e) {
        return null;
    }
}

/**
 * Universal resolver: If str is a BICS ObjId, decrypts to Mongo ObjectId.
 * If already a Mongo ObjectId, returns as-is.
 * Otherwise returns the input string unchanged.
 */
function resolveToObjectId(str) {
    if (!str) return str;
    const s = str.toString().trim();
    if (isBicsId(s)) {
        const decrypted = toMongoId(s);
        return decrypted || s;
    }
    return s;
}

/**
 * Recursively traverse a plain JS object or array and convert Mongo ObjectIds to BICS ObjIds
 */
function obfuscateObjectIds(val, depth = 0) {
    if (!val || depth > 20) return val;

    // Convert Mongoose Document to plain object
    if (val && typeof val.toObject === 'function') {
        val = val.toObject({ getters: false, virtuals: false, flattenMaps: true });
    } else if (val && typeof val.toJSON === 'function') {
        val = val.toJSON();
    }

    // Convert direct ObjectId
    if (
        val._bsontype === 'ObjectId' || 
        val._bsontype === 'ObjectID' || 
        val instanceof mongoose.Types.ObjectId ||
        (typeof val === 'object' && val.constructor && val.constructor.name === 'ObjectId')
    ) {
        return toBicsId(val.toString());
    }

    if (Array.isArray(val)) {
        return val.map(item => obfuscateObjectIds(item, depth + 1));
    }

    if (val instanceof Date || Buffer.isBuffer(val)) {
        return val;
    }

    if (typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            if (
                v && 
                (v._bsontype === 'ObjectId' || 
                 v._bsontype === 'ObjectID' || 
                 v instanceof mongoose.Types.ObjectId ||
                 (typeof v === 'object' && v.constructor && v.constructor.name === 'ObjectId'))
            ) {
                out[k] = toBicsId(v.toString());
            } else if (typeof v === 'string' && isMongoId(v)) {
                out[k] = toBicsId(v);
            } else {
                out[k] = obfuscateObjectIds(v, depth + 1);
            }
        }
        return out;
    }

    // If it's a 24-hex string and was passed directly as a single ID
    if (typeof val === 'string' && isMongoId(val)) {
        return toBicsId(val);
    }

    return val;
}

/**
 * Recursively traverse an incoming request object/array and decrypt any BICS ObjIds back to Mongo ObjectIds
 */
function deobfuscateBicsIds(val, depth = 0) {
    if (!val || depth > 20) return val;

    if (typeof val === 'string') {
        if (isBicsId(val)) {
            const dec = toMongoId(val);
            return dec || val;
        }
        return val;
    }

    if (Array.isArray(val)) {
        return val.map(item => deobfuscateBicsIds(item, depth + 1));
    }

    if (typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            out[k] = deobfuscateBicsIds(v, depth + 1);
        }
        return out;
    }

    return val;
}

module.exports = {
    toBicsId,
    toMongoId,
    isBicsId,
    isMongoId,
    resolveToObjectId,
    obfuscateObjectIds,
    deobfuscateBicsIds
};
