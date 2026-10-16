const crypto = require('crypto');
const { API_ACCESS_SECRET } = require('../config/constants');
const rsaKeyManager = require('./rsaKeyManager');

/**
 * Encrypts an EIRF payload using Server Asymmetric Envelope Encryption (RSA-2048-OAEP + AES-256-GCM).
 * Generates an ephemeral 256-bit AES-GCM key, encrypts the payload, and wraps the AES key
 * with the authoritative server RSA public key.
 */
function encryptEirfPayload(payloadObj, studentId, submissionId) {
    const jsonStr = JSON.stringify(payloadObj);
    
    // 1. Ephemeral AES-256-GCM symmetric key & 12-byte initialization vector
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // 2. Wrap AES key using RSA-OAEP with SHA-256 and the server Public Key
    const encryptedKey = rsaKeyManager.encryptWithPublicKey(aesKey).toString('hex');

    return JSON.stringify({
        version: '2.0-rsa-envelope',
        algorithm: 'RSA-OAEP-2048/AES-256-GCM',
        encryptedKey,
        iv: iv.toString('hex'),
        authTag,
        data: encrypted
    });
}

/**
 * Decrypts an EIRF payload (.eirf backup file).
 * Supports both Version 2.0 (Asymmetric RSA Envelope) and Version 1.0 (Legacy symmetric transition).
 * Strictly verifies cryptographic integrity; tampered payloads fail GCM authentication.
 */
function decryptEirfPayload(encryptedJsonStr, studentId, submissionId) {
    if (!encryptedJsonStr) return null;
    try {
        let rawStr = encryptedJsonStr;
        if (typeof encryptedJsonStr === 'object') {
            rawStr = JSON.stringify(encryptedJsonStr);
        }

        let parsed = null;
        try {
            parsed = JSON.parse(rawStr);
        } catch (e1) {
            try {
                const decoded = Buffer.from(rawStr, 'base64').toString('utf8');
                parsed = JSON.parse(decoded);
            } catch (e2) {
                console.error("EIRF Payload JSON parse error:", e1.message);
                return null;
            }
        }

        if (!parsed) return null;

        // 1. Asymmetric RSA Envelope Decryption (Version 2.0 - Current Standard)
        if (parsed.version === '2.0-rsa-envelope' || (parsed.encryptedKey && parsed.iv && parsed.authTag && parsed.data)) {
            const { encryptedKey, iv, authTag, data } = parsed;
            
            // Decrypt ephemeral AES key using Server RSA Private Key
            const rawAesKey = rsaKeyManager.decryptWithPrivateKey(Buffer.from(encryptedKey, 'hex'));
            
            // Decrypt ciphertext using AES-256-GCM
            const decipher = crypto.createDecipheriv('aes-256-gcm', rawAesKey, Buffer.from(iv, 'hex'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            let decrypted = decipher.update(data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        }

        // 2. Legacy AES-256-GCM Symmetric Fallback (Version 1.0 - Transitional)
        if (parsed.iv && parsed.authTag && parsed.data && !parsed.encryptedKey) {
            console.warn("Decrypting legacy Version 1.0 EIRF payload...");
            const { iv, authTag, data } = parsed;
            const key = crypto.pbkdf2Sync(
                String(submissionId) + API_ACCESS_SECRET + String(studentId), 
                'bics_salt_2026', 
                100000, 
                32, 
                'sha256'
            );
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            let decrypted = decipher.update(data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        }

        // 3. Reject unencrypted raw JSON payloads in security environment
        if (parsed.submissionId || parsed.answers || parsed.proctoringLog) {
            if (process.env.NODE_ENV === 'test' || process.env.ALLOW_RAW_EIRF === 'true') {
                console.warn("[SECURITY NOTICE] Raw unencrypted EIRF payload accepted under test mode.");
                return parsed;
            }
            console.error("[SECURITY REJECTION] Plain unencrypted EIRF payload rejected: cryptographic envelope required.");
            return null;
        }

        return parsed;
    } catch (e) {
        console.error("EIRF Decryption/Parsing error:", e.message);
        return null;
    }
}

module.exports = {
    encryptEirfPayload,
    decryptEirfPayload,
    getPublicKeyPem: rsaKeyManager.getPublicKeyPem,
    getPublicKeyDerBase64: rsaKeyManager.getPublicKeyDerBase64
};
