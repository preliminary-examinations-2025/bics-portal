const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { RecycleBinModel, TestConfigModel, TestSubmissionModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');

// GET /api/admin/recycle-bin - List active recycled items
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        let items = [];
        if (dbState.useMongo) {
            const expiredItems = await RecycleBinModel.find({ expiresAt: { $lte: now } });
            for (const item of expiredItems) {
                if (item.entityType === 'TestConfig') {
                    await TestConfigModel.deleteOne({ _id: item.entityId });
                    await TestSubmissionModel.deleteMany({ restoreToken: item.entityId });
                }
            }
            await RecycleBinModel.deleteMany({ expiresAt: { $lte: now } });

            items = await RecycleBinModel.find({ expiresAt: { $gt: now } }).sort({ deletedAt: -1 });
        } else {
            const db = getJSONData();
            db.recycleBin = db.recycleBin || [];
            db.recycleBin = db.recycleBin.filter(item => new Date(item.expiresAt) > now);
            saveJSONData(db);
            items = db.recycleBin;
        }

        const formatted = items.map(item => {
            const doc = item.toObject ? item.toObject() : item;
            const expTime = new Date(doc.expiresAt).getTime();
            const timeRemainingMs = Math.max(0, expTime - now.getTime());
            return {
                ...doc,
                timeRemainingMs
            };
        });

        return res.json(formatted);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/recycle-bin/restore/:id - Restore recycled item & all cascaded items
router.post('/restore/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (dbState.useMongo) {
            const rbItem = await RecycleBinModel.findById(id).catch(() => null) || await RecycleBinModel.findOne({ entityId: id });
            if (!rbItem) {
                return res.status(404).json({ success: false, error: "Item not found in Recycle Bin or retention period expired." });
            }

            if (rbItem.entityType === 'TestConfig') {
                const targetId = rbItem.entityId;
                await TestConfigModel.updateOne({ _id: targetId }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, deletedBy: 1 } });
                await TestSubmissionModel.updateMany({ $or: [{ testId: targetId }, { restoreToken: targetId }] }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, restoreToken: 1 } });
            } else if (rbItem.entityType === 'TestSubmission') {
                await TestSubmissionModel.updateOne({ _id: rbItem.entityId }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, restoreToken: 1 } });
            }

            await RecycleBinModel.deleteOne({ _id: rbItem._id });
            await logSystemAction('admin', 'RECYCLE_BIN_RESTORE', `Restored item "${rbItem.title}" (${rbItem.entityId}) and all cascaded records from Recycle Bin`, 'info');
        } else {
            const db = getJSONData();
            db.recycleBin = db.recycleBin || [];
            const rbIdx = db.recycleBin.findIndex(item => item._id === id || item.entityId === id);
            if (rbIdx === -1) {
                return res.status(404).json({ success: false, error: "Item not found in Recycle Bin." });
            }

            const rbItem = db.recycleBin[rbIdx];
            if (rbItem.entityType === 'TestConfig') {
                const test = (db.tests || []).find(t => t.id === rbItem.entityId || t._id === rbItem.entityId);
                if (test) {
                    test.isDeleted = false;
                    delete test.deletedAt;
                    delete test.deletedBy;
                }
                (db.testSubmissions || []).forEach(s => {
                    if (s.restoreToken === rbItem.entityId || s.testId === rbItem.entityId) {
                        s.isDeleted = false;
                        delete s.deletedAt;
                        delete s.restoreToken;
                    }
                });
            }
            db.recycleBin.splice(rbIdx, 1);
            saveJSONData(db);
            await logSystemAction('admin', 'RECYCLE_BIN_RESTORE', `Restored item "${rbItem.title}" (${rbItem.entityId}) from Recycle Bin`, 'info');
        }

        return res.json({ success: true, message: "Item and all associated data successfully restored to active status!" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/recycle-bin/purge/:id - Permanently hard-delete recycled item
router.delete('/purge/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (dbState.useMongo) {
            const rbItem = await RecycleBinModel.findById(id).catch(() => null) || await RecycleBinModel.findOne({ entityId: id });
            if (!rbItem) {
                return res.status(404).json({ success: false, error: "Item not found in Recycle Bin." });
            }

            if (rbItem.entityType === 'TestConfig') {
                const targetId = rbItem.entityId;
                if (mongoose.Types.ObjectId.isValid(targetId)) {
                    await TestConfigModel.findByIdAndDelete(targetId);
                    await TestSubmissionModel.deleteMany({ $or: [{ testId: targetId }, { restoreToken: targetId }] });
                }
            }

            await RecycleBinModel.deleteOne({ _id: rbItem._id });
            await logSystemAction('admin', 'RECYCLE_BIN_PURGE', `Permanently deleted item "${rbItem.title}" (${rbItem.entityId}) and all cascaded data`, 'warning');
        } else {
            const db = getJSONData();
            db.recycleBin = db.recycleBin || [];
            const rbIdx = db.recycleBin.findIndex(item => item._id === id || item.entityId === id);
            if (rbIdx !== -1) {
                const rbItem = db.recycleBin[rbIdx];
                db.tests = (db.tests || []).filter(t => t.id !== rbItem.entityId && t._id !== rbItem.entityId);
                db.testSubmissions = (db.testSubmissions || []).filter(s => s.testId !== rbItem.entityId && s.restoreToken !== rbItem.entityId);
                db.recycleBin.splice(rbIdx, 1);
                saveJSONData(db);
            }
        }
        return res.json({ success: true, message: "Item permanently deleted from system." });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/recycle-bin/purge-all - Permanently purge all recycled items
router.post('/purge-all', async (req, res) => {
    try {
        if (dbState.useMongo) {
            const allItems = await RecycleBinModel.find({});
            for (const item of allItems) {
                if (item.entityType === 'TestConfig') {
                    await TestConfigModel.deleteOne({ _id: item.entityId });
                    await TestSubmissionModel.deleteMany({ $or: [{ testId: item.entityId }, { restoreToken: item.entityId }] });
                }
            }
            await RecycleBinModel.deleteMany({});
        } else {
            const db = getJSONData();
            (db.recycleBin || []).forEach(item => {
                db.tests = (db.tests || []).filter(t => t.id !== item.entityId && t._id !== item.entityId);
                db.testSubmissions = (db.testSubmissions || []).filter(s => s.testId !== item.entityId && s.restoreToken !== item.entityId);
            });
            db.recycleBin = [];
            saveJSONData(db);
        }
        await logSystemAction('admin', 'RECYCLE_BIN_PURGE_ALL', `Purged all items from Recycle Bin`, 'warning');
        return res.json({ success: true, message: "All recycled items permanently deleted." });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
