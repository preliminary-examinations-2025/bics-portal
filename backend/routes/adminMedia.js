const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const { MediaAssetModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { uploadDriveAssetToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { isBicsId, toMongoId, toBicsId } = require('../utils/bicsId');

// Configure Multer with in-memory storage (25MB max per file)
const storage = multer.memoryStorage();

const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.sh', '.bash', '.bin', '.dll', '.msi', '.com', '.scr',
    '.vbs', '.js', '.jsx', '.ts', '.tsx', '.php', '.phtml', '.py', '.pl', '.cgi'
]);

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
        return cb(new Error(`Security Restriction: Executable file types (${ext}) cannot be uploaded to Media Drive.`), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB max per file
        files: 10 // Max 10 files per request
    },
    fileFilter
});

const sanitizeBaseFilename = (originalName) => {
    const ext = path.extname(originalName || '').toLowerCase();
    const nameWithoutExt = path.basename(originalName || 'file', ext);
    const cleanName = nameWithoutExt
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
    const timestamp = Date.now().toString().slice(-6);
    return `${cleanName || 'asset'}_${timestamp}${ext}`;
};

const determineAssetCategory = (mimeType, ext) => {
    const lowerMime = (mimeType || '').toLowerCase();
    const lowerExt = (ext || '').toLowerCase();
    if (lowerMime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(lowerExt)) {
        return 'image';
    }
    if (lowerMime === 'application/pdf' || lowerExt === '.pdf') {
        return 'pdf';
    }
    return 'raw';
};

// 1. Upload one or multiple assets to Media Drive
router.post('/upload', upload.array('files', 10), async (req, res) => {
    const files = req.files || [];
    if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: "No files provided for upload." });
    }

    const { folder: customSubFolder, tags: rawTags } = req.body || {};
    const parsedTags = typeof rawTags === 'string'
        ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
        : (Array.isArray(rawTags) ? rawTags : []);

    const uploadedAssets = [];
    const errors = [];

    for (const file of files) {
        try {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const category = determineAssetCategory(file.mimetype, ext);
            const safeFilename = sanitizeBaseFilename(file.originalname);
            
            // Subfolder categorization in Cloudinary
            const cloudFolder = `BICS_2026/drive/${customSubFolder || category + 's'}`;
            const cloudResourceType = category === 'raw' ? 'raw' : (category === 'pdf' ? 'auto' : 'image');

            const uploadResult = await uploadDriveAssetToCloudinary(file.buffer, {
                folder: cloudFolder,
                resourceType: cloudResourceType,
                filename: safeFilename
            });

            const assetDoc = {
                filename: safeFilename,
                originalName: file.originalname || safeFilename,
                mimeType: file.mimetype || 'application/octet-stream',
                resourceType: category,
                fileSize: file.size || uploadResult.bytes || file.buffer.length,
                cdnUrl: uploadResult.cdnUrl,
                proxyUrl: uploadResult.proxyUrl,
                publicId: uploadResult.publicId,
                folder: cloudFolder,
                tags: parsedTags,
                uploadedBy: req.user?.username || 'admin',
                createdAt: new Date(),
                updatedAt: new Date(),
                isDeleted: false
            };

            if (dbState.useMongo) {
                const savedDoc = new MediaAssetModel(assetDoc);
                await savedDoc.save();
                assetDoc._id = savedDoc._id;
                assetDoc.id = savedDoc._id.toString();
            } else {
                const db = getJSONData();
                const mockId = new mongoose.Types.ObjectId().toString();
                assetDoc._id = mockId;
                assetDoc.id = mockId;
                db.mediaAssets = db.mediaAssets || [];
                db.mediaAssets.unshift(assetDoc);
                saveJSONData(db);
            }

            // Generate convenient drop-in markdown links
            const markdownImage = category === 'image' 
                ? `![${assetDoc.originalName}](${assetDoc.proxyUrl})`
                : null;
            const markdownLink = `[${assetDoc.originalName}](${assetDoc.proxyUrl})`;

            uploadedAssets.push({
                ...assetDoc,
                markdownImage,
                markdownLink
            });

            await logSystemAction({
                actor: req.user?.username || 'admin',
                actorId: req.user?.id || 'admin',
                actorRole: 'admin',
                action: 'MEDIA_ASSET_UPLOAD',
                resourceType: 'media_drive',
                resourceId: String(assetDoc.id || assetDoc._id),
                details: `Admin uploaded ${category.toUpperCase()} asset "${safeFilename}" (${(assetDoc.fileSize / 1024).toFixed(1)} KB) to ${cloudFolder}`,
                ipAddress: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown',
                severity: 'info'
            });
        } catch (err) {
            console.error(`[MEDIA_UPLOAD_ERROR] Failed to process ${file.originalname}:`, err);
            errors.push({ filename: file.originalname, error: err.message || 'Upload failed' });
        }
    }

    if (uploadedAssets.length === 0 && errors.length > 0) {
        return res.status(500).json({
            success: false,
            error: "Failed to upload any of the provided files.",
            details: errors
        });
    }

    return res.json({
        success: true,
        message: `Successfully uploaded ${uploadedAssets.length} asset${uploadedAssets.length === 1 ? '' : 's'}.`,
        assets: uploadedAssets,
        errors: errors.length > 0 ? errors : undefined
    });
});

// 2. Query Media Assets with search, category filtering & pagination
router.get('/', async (req, res) => {
    try {
        const { type = 'all', search = '', page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const filter = { isDeleted: { $ne: true } };

        if (type && type !== 'all') {
            filter.resourceType = String(type).toLowerCase();
        }

        if (search && typeof search === 'string' && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { filename: regex },
                { originalName: regex },
                { tags: regex }
            ];
        }

        if (dbState.useMongo) {
            const [total, assets] = await Promise.all([
                MediaAssetModel.countDocuments(filter),
                MediaAssetModel.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean()
            ]);

            const enriched = assets.map(a => ({
                ...a,
                id: a._id.toString(),
                markdownImage: a.resourceType === 'image' ? `![${a.originalName}](${a.proxyUrl})` : null,
                markdownLink: `[${a.originalName}](${a.proxyUrl})`
            }));

            return res.json({
                success: true,
                total,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum) || 1,
                assets: enriched
            });
        } else {
            const db = getJSONData();
            let all = (db.mediaAssets || []).filter(a => !a.isDeleted);

            if (type && type !== 'all') {
                all = all.filter(a => a.resourceType === String(type).toLowerCase());
            }

            if (search && typeof search === 'string' && search.trim()) {
                const q = search.trim().toLowerCase();
                all = all.filter(a => 
                    (a.filename && a.filename.toLowerCase().includes(q)) ||
                    (a.originalName && a.originalName.toLowerCase().includes(q)) ||
                    (a.tags && Array.isArray(a.tags) && a.tags.some(t => t.toLowerCase().includes(q)))
                );
            }

            const total = all.length;
            const paged = all.slice(skip, skip + limitNum).map(a => ({
                ...a,
                id: String(a.id || a._id),
                markdownImage: a.resourceType === 'image' ? `![${a.originalName}](${a.proxyUrl})` : null,
                markdownLink: `[${a.originalName}](${a.proxyUrl})`
            }));

            return res.json({
                success: true,
                total,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum) || 1,
                assets: paged
            });
        }
    } catch (err) {
        console.error("[ADMIN_MEDIA_GET_ERROR]:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Delete an asset from Media Drive and Cloudinary
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const targetId = isBicsId(id) ? toMongoId(id) : id;

        let asset = null;
        if (dbState.useMongo) {
            asset = await MediaAssetModel.findById(targetId);
            if (!asset) {
                return res.status(404).json({ success: false, error: "Asset not found." });
            }
            asset.isDeleted = true;
            await asset.save();
        } else {
            const db = getJSONData();
            const idx = (db.mediaAssets || []).findIndex(a => 
                String(a._id) === targetId || String(a.id) === targetId || String(a.id) === id
            );
            if (idx === -1) {
                return res.status(404).json({ success: false, error: "Asset not found." });
            }
            asset = db.mediaAssets[idx];
            asset.isDeleted = true;
            saveJSONData(db);
        }

        // Clean up from Cloudinary in the background
        if (asset.publicId) {
            deleteFromCloudinary(asset.publicId, asset.resourceType === 'raw' ? 'raw' : 'image').catch(() => {});
        }

        await logSystemAction({
            actor: req.user?.username || 'admin',
            actorId: req.user?.id || 'admin',
            actorRole: 'admin',
            action: 'MEDIA_ASSET_DELETE',
            resourceType: 'media_drive',
            resourceId: String(targetId),
            details: `Admin deleted media asset "${asset.filename}" (${asset.publicId})`,
            severity: 'warning'
        });

        return res.json({ success: true, message: `Asset "${asset.filename}" removed successfully.` });
    } catch (err) {
        console.error("[ADMIN_MEDIA_DELETE_ERROR]:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
