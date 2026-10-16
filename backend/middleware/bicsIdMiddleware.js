const {
    toBicsId,
    toMongoId,
    isBicsId,
    resolveToObjectId,
    obfuscateObjectIds,
    deobfuscateBicsIds
} = require('../utils/bicsId');

/**
 * Global BICS ObjId middleware.
 * 1. Automatically intercepts and decrypts incoming BICS ObjIds in req.params, req.query, and req.body.
 * 2. Intercepts outgoing res.json calls to obfuscate Mongo ObjectIds into BICS ObjIds (6-4-4-6).
 */
const bicsIdMiddleware = (req, res, next) => {
    // Attach utility helpers to req for route handlers
    req.toBicsId = toBicsId;
    req.toMongoId = toMongoId;
    req.resolveToObjectId = resolveToObjectId;

    const path = (req.originalUrl || req.path || '').toLowerCase();
    const isDbViewer = path.includes('/api/admin/db');

    if (isDbViewer) {
        // Bypass parameter tampering and response obfuscation for administrative DB viewer & BICS decryptor
        return next();
    }
    Object.defineProperty(req, 'params', {
        get() {
            return _params;
        },
        set(val) {
            _params = deobfuscateBicsIds(val);
        },
        configurable: true,
        enumerable: true
    });

    // 2. Process incoming query string parameters (e.g., ?candidateId=... or ?testId=...)
    if (req.query && typeof req.query === 'object') {
        req.query = deobfuscateBicsIds(req.query);
    }

    // 3. Process incoming JSON body (e.g., { candidateId: '...', testId: '...' })
    if (req.body && typeof req.body === 'object') {
        req.body = deobfuscateBicsIds(req.body);
    }

    // 4. Intercept outgoing JSON responses
    const originalJson = res.json;
    res.json = function(data) {
        // Skip obfuscation for raw MongoDB administrative shell viewer
        const path = (req.originalUrl || req.path || '').toLowerCase();
        const isDbViewer = path.includes('/api/admin/db/collection');

        if (!isDbViewer && data !== null && data !== undefined) {
            try {
                data = obfuscateObjectIds(data);
            } catch (err) {
                console.error('[BICS ObjId Middleware Serialization Warning]', err);
            }
        }

        return originalJson.call(this, data);
    };

    const originalSend = res.send;
    res.send = function(body) {
        if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
            return res.json(body);
        }
        return originalSend.call(this, body);
    };

    next();
};

module.exports = {
    bicsIdMiddleware
};
