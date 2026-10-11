const crypto = require('crypto');
const { API_ACCESS_SECRET } = require('../config/constants');

function encryptEirfPayload(payloadObj, studentId, submissionId) {
    const jsonStr = JSON.stringify(payloadObj);
    const key = crypto.pbkdf2Sync(String(submissionId) + API_ACCESS_SECRET + String(studentId), 'bics_salt_2026', 100000, 32, 'sha256');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({
        version: '1.0',
        iv: iv.toString('hex'),
        authTag,
        data: encrypted
    });
}

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

        // Direct unencrypted payload object (.eirf JSON backup containing studentId/answers/submissionId)
        if (parsed.submissionId || parsed.answers || parsed.proctoringLog) {
            return parsed;
        }

        // AES-256-GCM Encrypted payload format ({ iv, authTag, data })
        if (parsed.iv && parsed.authTag && parsed.data) {
            const { iv, authTag, data } = parsed;
            const key = crypto.pbkdf2Sync(String(submissionId) + API_ACCESS_SECRET + String(studentId), 'bics_salt_2026', 100000, 32, 'sha256');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            let decrypted = decipher.update(data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        }

        return parsed;
    } catch (e) {
        console.error("EIRF Decryption/Parsing error:", e.message);
        return null;
    }
}

module.exports = {
    encryptEirfPayload,
    decryptEirfPayload
};
