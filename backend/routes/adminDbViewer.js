const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { dbState, getJSONData } = require('../config/db');
const models = require('../models');

/**
 * Convert a Date or ISO date string into an ISO 8601 string in IST (+05:30):
 * e.g., "2026-09-25T20:35:18.487+05:30"
 */
function toIstIsoString(val) {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val || '');
    const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
    const istDate = new Date(istMs);
    return istDate.toISOString().replace('Z', '+05:30');
}

/**
 * Format a Date or ISO date string into MongoDB Atlas human-readable IST string:
 * e.g., "25 September 2026 at 20:35:18 IST"
 */
function formatHumanIstDate(val) {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
    const istDate = new Date(istMs);
    const day = istDate.getUTCDate();
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = months[istDate.getUTCMonth()];
    const year = istDate.getUTCFullYear();
    const hh = String(istDate.getUTCHours()).padStart(2, '0');
    const mm = String(istDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(istDate.getUTCSeconds()).padStart(2, '0');
    return `${day} ${month} ${year} at ${hh}:${mm}:${ss} IST`;
}

/**
 * Helper: Convert a value from raw MongoDB BSON into Extended JSON ($oid, $date in IST +05:30)
 * so the frontend can render authentic MongoDB Atlas ObjectId('...') and ISODate('...') coloring in IST.
 */
function toExtendedBson(val, keyName = '') {
    if (val === null || val === undefined) return null;

    // 1. Check MongoDB ObjectId
    if (
        val._bsontype === 'ObjectId' ||
        val._bsontype === 'ObjectID' ||
        val instanceof mongoose.Types.ObjectId ||
        (typeof val === 'object' && val.constructor && val.constructor.name === 'ObjectId')
    ) {
        return { $oid: String(val.toString()) };
    }

    // Also treat 24-hex _id strings as ObjectId if stored as string in fallback mode
    if (keyName === '_id' && typeof val === 'string' && /^[a-fA-F0-9]{24}$/.test(val)) {
        return { $oid: val };
    }

    // 2. Check Date / ISODate -> convert to IST (+05:30)
    if (val instanceof Date) {
        if (!isNaN(val.getTime())) {
            return { $date: toIstIsoString(val) };
        }
        return null;
    }

    // Also detect ISO 8601 date strings in timestamp/date fields -> convert to IST (+05:30)
    if (
        typeof val === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(val)
    ) {
        const parsedDate = new Date(val);
        if (!isNaN(parsedDate.getTime())) {
            return { $date: toIstIsoString(parsedDate) };
        }
    }

    // 3. Array
    if (Array.isArray(val)) {
        return val.map(item => toExtendedBson(item, ''));
    }

    // 4. Plain Object
    if (typeof val === 'object') {
        // Handle Buffer / Binary gracefully
        if (Buffer.isBuffer(val) || val._bsontype === 'Binary') {
            return `[Binary Buffer: ${val.length || 0} bytes]`;
        }
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            out[k] = toExtendedBson(v, k);
        }
        return out;
    }

    return val;
}

/**
 * Helper: Convert raw document Date fields to IST (+05:30) strings for raw JSON copy/export
 */
function toIstRawDoc(val) {
    if (val === null || val === undefined) return val;
    if (
        val._bsontype === 'ObjectId' ||
        val._bsontype === 'ObjectID' ||
        val instanceof mongoose.Types.ObjectId ||
        (typeof val === 'object' && val.constructor && val.constructor.name === 'ObjectId')
    ) {
        return String(val.toString());
    }
    if (val instanceof Date) {
        return !isNaN(val.getTime()) ? toIstIsoString(val) : null;
    }
    if (
        typeof val === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(val)
    ) {
        const parsedDate = new Date(val);
        if (!isNaN(parsedDate.getTime())) return toIstIsoString(parsedDate);
    }
    if (Array.isArray(val)) return val.map(toIstRawDoc);
    if (typeof val === 'object') {
        if (Buffer.isBuffer(val) || val._bsontype === 'Binary') {
            return `[Binary Buffer: ${val.length || 0} bytes]`;
        }
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            out[k] = toIstRawDoc(v);
        }
        return out;
    }
    return val;
}

/**
 * Safely parse a MongoDB Atlas-style filter or sort expression:
 * Supports:
 * - { section: 'Introduction to Computer Science' }
 * - { _id: ObjectId('6a5ca475c52ac6e9ccca025d') }
 * - { createdAt: ISODate('2026-07-19T10:18:29.487+00:00') }
 * - Standard JSON: { "title": "Module 1 : Lecture 1" }
 * - Plain keyword string: "Module 1"
 */
function parseMongoShellJson(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return {};
    const trimmed = rawInput.trim();
    if (!trimmed || trimmed === '{}') return {};

    // Reject dangerous server-side JS execution operators
    if (/\$where|\$function|\$accumulator/i.test(trimmed)) {
        throw new Error('Unsafe query operators ($where, $function, $accumulator) are not permitted in read-only mode.');
    }

    // Replace ObjectId('...') and ISODate('...') wrappers with placeholders
    let normalized = trimmed
        .replace(/(?:new\s+)?ObjectId\(\s*['"]([a-fA-F0-9]{24})['"]\s*\)/g, '{"__bson_oid":"$1"}')
        .replace(/(?:new\s+)?(?:ISODate|Date)\(\s*['"]([^'"]+)['"]\s*\)/g, '{"__bson_date":"$1"}');

    let parsed = null;
    try {
        parsed = JSON.parse(normalized);
    } catch (jsonErr) {
        // Convert relaxed Mongo shell object syntax (unquoted keys, single-quoted strings) to valid JSON
        try {
            let relaxed = normalized
                // Convert single-quoted strings to double-quoted strings safely
                .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`)
                // Quote unquoted keys before colons: { key: "val", $or: [...] }
                .replace(/([{,]\s*)([a-zA-Z0-9_$][a-zA-Z0-9_$.]*)\s*:/g, '$1"$2":')
                // Remove trailing commas
                .replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(relaxed);
        } catch (relaxErr) {
            throw new Error(`Invalid query syntax: ${trimmed}. Use { field: 'value' } or type a search keyword.`);
        }
    }

    // Recursively hydrate __bson_oid and __bson_date into genuine Mongoose ObjectId / Date
    function hydrateBsonLiterals(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(hydrateBsonLiterals);
        if (typeof obj === 'object') {
            if (obj.__bson_oid && Object.keys(obj).length === 1) {
                return mongoose.Types.ObjectId.isValid(obj.__bson_oid)
                    ? new mongoose.Types.ObjectId(obj.__bson_oid)
                    : obj.__bson_oid;
            }
            if (obj.__bson_date && Object.keys(obj).length === 1) {
                return new Date(obj.__bson_date);
            }
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                if (k === '_id' && typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v)) {
                    out[k] = new mongoose.Types.ObjectId(v);
                } else {
                    out[k] = hydrateBsonLiterals(v);
                }
            }
            return out;
        }
        return obj;
    }

    return hydrateBsonLiterals(parsed);
}

/**
 * Discover all Mongoose models mapped by their MongoDB collection name
 */
function getMongooseCollectionMap() {
    const map = new Map();
    for (const model of Object.values(mongoose.models)) {
        if (model && model.collection && model.collection.name) {
            map.set(model.collection.name, model);
        }
    }
    return map;
}

/**
 * 1. GET /api/admin/db/collections
 * Returns the cluster name, active database name, and all collections with live document counts.
 */
router.get('/collections', async (req, res) => {
    try {
        if (dbState.useMongo && mongoose.connection && mongoose.connection.db) {
            const db = mongoose.connection.db;
            const dbName = db.databaseName || 'test';
            const rawCollections = await db.listCollections().toArray();
            const modelMap = getMongooseCollectionMap();

            const allNamesSet = new Set(rawCollections.map(c => c.name));
            for (const colName of modelMap.keys()) {
                allNamesSet.add(colName);
            }

            // Exclude internal Mongo system collections if any
            const sortedNames = Array.from(allNamesSet)
                .filter(name => !name.startsWith('system.'))
                .sort((a, b) => a.localeCompare(b));

            const collectionsInfo = await Promise.all(
                sortedNames.map(async (name) => {
                    let count = 0;
                    try {
                        const col = db.collection(name);
                        count = await col.estimatedDocumentCount();
                    } catch (e) {
                        count = 0;
                    }
                    return {
                        name,
                        count,
                        indexCount: 1,
                        hasModel: modelMap.has(name),
                        modelName: modelMap.get(name)?.modelName || null
                    };
                })
            );

            return res.json({
                clusterName: 'BICS',
                databaseName: dbName,
                mode: 'mongodb',
                readOnly: true,
                collections: collectionsInfo
            });
        } else {
            // Fallback JSON mode
            const db = getJSONData();
            const collectionsInfo = Object.keys(db)
                .sort((a, b) => a.localeCompare(b))
                .map(key => ({
                    name: key,
                    count: Array.isArray(db[key]) ? db[key].length : (db[key] ? 1 : 0),
                    indexCount: 1,
                    hasModel: false,
                    modelName: null
                }));

            return res.json({
                clusterName: 'BICS',
                databaseName: 'local_json',
                mode: 'json_fallback',
                readOnly: true,
                collections: collectionsInfo
            });
        }
    } catch (err) {
        console.error('[Admin DB Viewer Collections Error]', err);
        return res.status(500).json({ error: err.message || 'Failed to list database collections' });
    }
});

/**
 * 2. GET /api/admin/db/collections/:collectionName/documents
 * Strictly read-only query endpoint returning both standard JSON and Extended BSON documents.
 */
router.get('/collections/:collectionName/documents', async (req, res) => {
    const { collectionName } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const rawFilter = (req.query.filter || '').trim();
    const rawSort = (req.query.sort || '').trim();
    const rawProjection = (req.query.projection || '').trim();
    const skip = (page - 1) * limit;

    try {
        if (dbState.useMongo && mongoose.connection && mongoose.connection.db) {
            const db = mongoose.connection.db;
            const col = db.collection(collectionName);

            let mongoFilter = {};
            let isKeywordSearch = false;

            if (rawFilter && rawFilter !== '{}') {
                if (rawFilter.startsWith('{')) {
                    mongoFilter = parseMongoShellJson(rawFilter);
                } else {
                    // Plain keyword search across string fields or _id
                    isKeywordSearch = true;
                    const escaped = rawFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(escaped, 'i');
                    const orClauses = [];

                    if (/^[a-fA-F0-9]{24}$/.test(rawFilter)) {
                        orClauses.push({ _id: new mongoose.Types.ObjectId(rawFilter) });
                    }

                    // Sample up to 3 documents to discover top-level string/scalar fields dynamically
                    const sampleDocs = await col.find({}).limit(3).toArray();
                    const stringFields = new Set([
                        'title', 'section', 'youtubeId', 'youtubeUrl', 'username', 'studentId',
                        'name', 'fullName', 'email', 'rollNo', 'status', 'action', 'message',
                        'lectureTitle', 'lectureId', 'subject', 'courseCode', 'testTitle'
                    ]);
                    for (const sDoc of sampleDocs) {
                        for (const [k, v] of Object.entries(sDoc || {})) {
                            if (typeof v === 'string' && k !== '_id') {
                                stringFields.add(k);
                            } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
                                for (const [subK, subV] of Object.entries(v)) {
                                    if (typeof subV === 'string') {
                                        stringFields.add(`${k}.${subK}`);
                                    }
                                }
                            }
                        }
                    }

                    for (const field of stringFields) {
                        orClauses.push({ [field]: regex });
                    }
                    mongoFilter = orClauses.length > 0 ? { $or: orClauses } : {};
                }
            }

            let mongoSort = { _id: -1 };
            if (rawSort && rawSort !== '{}') {
                mongoSort = parseMongoShellJson(rawSort);
            }

            let mongoProjection = undefined;
            if (rawProjection && rawProjection !== '{}') {
                mongoProjection = parseMongoShellJson(rawProjection);
            }

            const totalCount = await col.countDocuments(mongoFilter);
            let cursor = col.find(mongoFilter);
            if (mongoProjection && Object.keys(mongoProjection).length > 0) {
                cursor = cursor.project(mongoProjection);
            }
            const rawDocs = await cursor.sort(mongoSort).skip(skip).limit(limit).toArray();

            const istDocuments = rawDocs.map(doc => toIstRawDoc(doc));
            const bsonDocuments = rawDocs.map(doc => toExtendedBson(doc));

            return res.json({
                collectionName,
                readOnly: true,
                page,
                limit,
                totalCount,
                totalPages: Math.max(1, Math.ceil(totalCount / limit)),
                startIndex: totalCount === 0 ? 0 : skip + 1,
                endIndex: Math.min(skip + rawDocs.length, totalCount),
                appliedFilter: isKeywordSearch ? `Keyword: "${rawFilter}"` : (rawFilter || '{}'),
                documents: istDocuments,
                bsonDocuments
            });
        } else {
            // Fallback JSON mode
            const db = getJSONData();
            const rawList = Array.isArray(db[collectionName])
                ? db[collectionName]
                : (db[collectionName] ? [db[collectionName]] : []);

            let filtered = rawList;
            if (rawFilter && rawFilter !== '{}') {
                const q = rawFilter.toLowerCase();
                filtered = rawList.filter(item => JSON.stringify(item).toLowerCase().includes(q));
            }

            const totalCount = filtered.length;
            const pageDocs = filtered.slice(skip, skip + limit);
            const istDocuments = pageDocs.map(doc => toIstRawDoc(doc));
            const bsonDocuments = pageDocs.map(doc => toExtendedBson(doc));

            return res.json({
                collectionName,
                readOnly: true,
                page,
                limit,
                totalCount,
                totalPages: Math.max(1, Math.ceil(totalCount / limit)),
                startIndex: totalCount === 0 ? 0 : skip + 1,
                endIndex: Math.min(skip + pageDocs.length, totalCount),
                appliedFilter: rawFilter || '{}',
                documents: istDocuments,
                bsonDocuments
            });
        }
    } catch (err) {
        console.error(`[Admin DB Viewer Documents Error: ${collectionName}]`, err);
        return res.status(400).json({
            error: err.message || `Failed to query collection "${collectionName}"`
        });
    }
});

/**
 * 3. GET /api/admin/db/collections/:collectionName/indexes
 * Returns collection indexes and an inferred schema breakdown from sampled documents.
 */
router.get('/collections/:collectionName/indexes', async (req, res) => {
    const { collectionName } = req.params;
    try {
        if (dbState.useMongo && mongoose.connection && mongoose.connection.db) {
            const db = mongoose.connection.db;
            const col = db.collection(collectionName);

            const indexes = await col.indexes().catch(() => []);
            const sampleDocs = await col.find({}).sort({ _id: -1 }).limit(50).toArray();

            // Infer schema field types across sample documents
            const fieldStats = new Map();
            const sampleCount = sampleDocs.length;

            for (const doc of sampleDocs) {
                for (const [key, val] of Object.entries(doc || {})) {
                    if (!fieldStats.has(key)) {
                        fieldStats.set(key, { field: key, count: 0, types: new Set(), sampleValue: '' });
                    }
                    const entry = fieldStats.get(key);
                    entry.count += 1;

                    let detectedType = typeof val;
                    if (val === null) detectedType = 'Null';
                    else if (val._bsontype === 'ObjectId' || val instanceof mongoose.Types.ObjectId) detectedType = 'ObjectId';
                    else if (val instanceof Date) detectedType = 'Date (ISODate)';
                    else if (Array.isArray(val)) detectedType = `Array (${val.length})`;
                    else if (typeof val === 'object') detectedType = `Object (${Object.keys(val).length} keys)`;
                    else if (typeof val === 'string') detectedType = 'String';
                    else if (typeof val === 'number') detectedType = Number.isInteger(val) ? 'Int32 / Number' : 'Double';
                    else if (typeof val === 'boolean') detectedType = 'Boolean';

                    entry.types.add(detectedType);
                    if (!entry.sampleValue && val !== null && val !== undefined) {
                        if (detectedType === 'ObjectId') entry.sampleValue = `ObjectId('${val.toString()}')`;
                        else if (detectedType === 'Date (ISODate)') entry.sampleValue = `ISODate('${toIstIsoString(val)}')  ${formatHumanIstDate(val)}`;
                        else if (typeof val === 'object') entry.sampleValue = JSON.stringify(val).slice(0, 80);
                        else entry.sampleValue = String(val).slice(0, 80);
                    }
                }
            }

            const schemaFields = Array.from(fieldStats.values()).map(f => ({
                field: f.field,
                types: Array.from(f.types),
                frequencyPercent: sampleCount > 0 ? Math.round((f.count / sampleCount) * 100) : 0,
                sampleValue: f.sampleValue
            }));

            return res.json({
                collectionName,
                readOnly: true,
                sampleSize: sampleCount,
                indexes,
                schemaFields
            });
        } else {
            return res.json({
                collectionName,
                readOnly: true,
                sampleSize: 0,
                indexes: [{ name: '_id_', key: { _id: 1 }, v: 2 }],
                schemaFields: []
            });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to inspect indexes and schema' });
    }
});

module.exports = router;
