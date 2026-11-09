const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { TestSubmissionModel, TestSignalModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { formatCloudinaryMediaUrl, uploadToCloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { isBicsId, isMongoId, toBicsId, toMongoId, resolveToObjectId } = require('../utils/bicsId');
const { requireAuth } = require('../middleware/auth');
const { evaluateEirfIncident } = require('../services/eirfEvaluator');

function isSubmissionOwnerForUser(user, submission) {
    if (!user || !submission) return false;
    if (user.role === 'admin' || user.role === 'superadmin' || user.isAdmin) return true;

    const userIds = new Set();
    [user.id, user.studentId, user.username].forEach(val => {
        if (!val) return;
        const s = String(val).trim();
        if (!s) return;
        userIds.add(s);
        const resolved = resolveToObjectId(s);
        if (resolved) {
            userIds.add(String(resolved));
            const bics = toBicsId(String(resolved));
            if (bics) userIds.add(bics);
        }
    });

    const subRefs = [submission.candidateId, submission.studentId];
    for (const ref of subRefs) {
        if (!ref) continue;
        const s = String(ref).trim();
        if (!s) continue;
        if (userIds.has(s)) return true;
        const resolved = resolveToObjectId(s);
        if (resolved && userIds.has(String(resolved))) return true;
    }
    return false;
}

// Helper to resolve mongo ObjectId and BICS Object ID from input submissionId
function resolveSubmissionIdentifiers(submissionId, submissionDoc = null) {
    let mongoSubId = submissionId;
    let bicsSubId = submissionId;

    if (isBicsId(submissionId)) {
        mongoSubId = toMongoId(submissionId) || submissionId;
        bicsSubId = submissionId;
    } else if (isMongoId(submissionId)) {
        mongoSubId = String(submissionId);
        bicsSubId = toBicsId(submissionId) || submissionId;
    }

    if (submissionDoc) {
        const docMongoId = String(submissionDoc._id || submissionDoc.id || '');
        if (docMongoId && isMongoId(docMongoId)) {
            mongoSubId = docMongoId;
            bicsSubId = toBicsId(docMongoId) || bicsSubId;
        }
    }

    return { mongoSubId, bicsSubId };
}

// 1. Save Live Proctoring Event during test
router.post('/event/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { type, details, startTime, endTime, durationSeconds } = req.body;
    if (!type) return res.status(400).json({ error: "Event type is required." });

    const { mongoSubId } = resolveSubmissionIdentifiers(submissionId);

    try {
        let submission = null;
        if (dbState.useMongo) {
            let retries = 5;
            while (retries > 0) {
                try {
                    submission = await TestSubmissionModel.findOne({ _id: mongoSubId, isDeleted: { $ne: true } });
                    if (!submission) return res.status(404).json({ error: "Submission not found." });

                    if (req.user && !isSubmissionOwnerForUser(req.user, submission)) {
                        return res.status(403).json({ error: "Access denied: You cannot submit proctoring telemetry for another candidate." });
                    }
                    if (submission.status !== 'started' && type !== 'TEST_SUBMITTED' && type !== 'TEST_AUTO_SUBMITTED') {
                        return res.status(400).json({ error: "Exam is already closed. Additional events rejected." });
                    }

                    submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
                    submission.proctoringLog.events = submission.proctoringLog.events || [];

                    const eventTimestamp = (req.body && req.body.timestamp) ? new Date(req.body.timestamp) : new Date();
                    const eventTimeMs = eventTimestamp.getTime();

                    // Deduplicate: If an event with identical type and details was logged within 4 seconds, skip appending
                    const isDuplicate = submission.proctoringLog.events.some(existing => {
                        if (type === 'TEST_SUBMITTED' || type === 'TEST_AUTO_SUBMITTED') {
                            return existing.type === 'TEST_SUBMITTED' || existing.type === 'TEST_AUTO_SUBMITTED';
                        }
                        if (existing.type !== type) return false;
                        if (existing.details !== details) return false;
                        const existingTime = new Date(existing.timestamp || existing.startTime || 0).getTime();
                        return Math.abs(eventTimeMs - existingTime) < 4000;
                    });

                    if (isDuplicate) {
                        return res.json({ success: true, deduped: true });
                    }

                    submission.proctoringLog.events.push({ 
                        type, 
                        details, 
                        timestamp: eventTimestamp,
                        startTime: startTime || null,
                        endTime: endTime || null,
                        durationSeconds: durationSeconds ? Number(durationSeconds) : 0
                    });
                    submission.proctoringLog.events.sort((a, b) => new Date(a.timestamp || a.startTime || 0) - new Date(b.timestamp || b.startTime || 0));

                    const detailsLower = (details || '').toLowerCase();
                    const isExitEvent = type === 'FULLSCREEN_EXIT' && 
                                        !detailsLower.includes('returned to fullscreen') && 
                                        !detailsLower.includes('outside fullscreen') && 
                                        !detailsLower.includes('reconciled with');
                    
                    const isTabEvent = type === 'TAB_SWITCH' && 
                                       !detailsLower.includes('returned focus') && 
                                       !detailsLower.includes('during fullscreen exit transition');

                    if (isExitEvent) {
                        const lastExitTime = submission.proctoringLog._lastExitTime || 0;
                        const nowMs = Date.now();
                        if (nowMs - lastExitTime > 3000) {
                            submission.proctoringLog.fullscreenExits = (submission.proctoringLog.fullscreenExits || 0) + 1;
                            submission.proctoringLog._lastExitTime = nowMs;
                        }
                    } else if (isTabEvent) {
                        const lastTabTime = submission.proctoringLog._lastTabTime || 0;
                        const nowMs = Date.now();
                        if (nowMs - lastTabTime > 3000) {
                            submission.proctoringLog.tabSwitches = (submission.proctoringLog.tabSwitches || 0) + 1;
                            submission.proctoringLog._lastTabTime = nowMs;
                        }
                    } else if (type === 'CLIPBOARD_ATTEMPT') {
                        submission.proctoringLog.clipboardAttempts = (submission.proctoringLog.clipboardAttempts || 0) + 1;
                    } else if (type === 'WEBCAM_LOST' || type === 'WEBCAM_RESTORED') {
                        submission.proctoringLog.webcamStatus = type === 'WEBCAM_LOST' ? 'inactive' : 'active';
                    }

                    const eirfEval = evaluateEirfIncident(submission);
                    if (eirfEval.hasEirfFlag) {
                        submission.hasEirfFlag = true;
                        submission.flaggedReasons = eirfEval.flaggedReasons;
                        if (!submission.eirfStatus || submission.eirfStatus === 'none') {
                            submission.eirfStatus = 'pending';
                        }
                    }

                    await submission.save();
                    break;
                } catch (saveErr) {
                    if (saveErr.name === 'VersionError' || saveErr.name === 'ParallelSaveError') {
                        retries--;
                        if (retries === 0) throw saveErr;
                        await new Promise(resolve => setTimeout(resolve, 50 * (6 - retries)));
                    } else {
                        throw saveErr;
                    }
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => !s.isDeleted && (String(s.id || s._id) === String(mongoSubId) || String(s.id || s._id) === String(submissionId) || (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId)));
            if (!submission) return res.status(404).json({ error: "Submission not found." });

            if (req.user && !isSubmissionOwnerForUser(req.user, submission)) {
                return res.status(403).json({ error: "Access denied: You cannot submit proctoring telemetry for another candidate." });
            }
            if (submission.status !== 'started' && type !== 'TEST_SUBMITTED' && type !== 'TEST_AUTO_SUBMITTED') {
                return res.status(400).json({ error: "Exam is already closed. Additional events rejected." });
            }

            submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
            submission.proctoringLog.events = submission.proctoringLog.events || [];

            const eventTimestamp = (req.body && req.body.timestamp) ? new Date(req.body.timestamp) : new Date();
            const eventTimeMs = eventTimestamp.getTime();

            // Deduplicate: If an event with identical type and details was logged within 4 seconds, skip appending
            const isDuplicate = submission.proctoringLog.events.some(existing => {
                if (type === 'TEST_SUBMITTED' || type === 'TEST_AUTO_SUBMITTED') {
                    return existing.type === 'TEST_SUBMITTED' || existing.type === 'TEST_AUTO_SUBMITTED';
                }
                if (existing.type !== type) return false;
                if (existing.details !== details) return false;
                const existingTime = new Date(existing.timestamp || existing.startTime || 0).getTime();
                return Math.abs(eventTimeMs - existingTime) < 4000;
            });

            if (isDuplicate) {
                return res.json({ success: true, deduped: true });
            }

            submission.proctoringLog.events.push({ 
                type, 
                details, 
                timestamp: eventTimestamp,
                startTime: startTime || null,
                endTime: endTime || null,
                durationSeconds: durationSeconds ? Number(durationSeconds) : 0
            });
            submission.proctoringLog.events.sort((a, b) => new Date(a.timestamp || a.startTime || 0) - new Date(b.timestamp || b.startTime || 0));

            const detailsLower = (details || '').toLowerCase();
            const isExitEvent = type === 'FULLSCREEN_EXIT' && 
                                !detailsLower.includes('returned to fullscreen') && 
                                !detailsLower.includes('outside fullscreen') && 
                                !detailsLower.includes('reconciled with');
            
            const isTabEvent = type === 'TAB_SWITCH' && 
                               !detailsLower.includes('returned focus') && 
                               !detailsLower.includes('during fullscreen exit transition');

            if (isExitEvent) {
                const lastExitTime = submission.proctoringLog._lastExitTime || 0;
                const nowMs = Date.now();
                if (nowMs - lastExitTime > 3000) {
                    submission.proctoringLog.fullscreenExits = (submission.proctoringLog.fullscreenExits || 0) + 1;
                    submission.proctoringLog._lastExitTime = nowMs;
                }
            } else if (isTabEvent) {
                const lastTabTime = submission.proctoringLog._lastTabTime || 0;
                const nowMs = Date.now();
                if (nowMs - lastTabTime > 3000) {
                    submission.proctoringLog.tabSwitches = (submission.proctoringLog.tabSwitches || 0) + 1;
                    submission.proctoringLog._lastTabTime = nowMs;
                }
            } else if (type === 'CLIPBOARD_ATTEMPT') {
                submission.proctoringLog.clipboardAttempts = (submission.proctoringLog.clipboardAttempts || 0) + 1;
            } else if (type === 'WEBCAM_LOST' || type === 'WEBCAM_RESTORED') {
                submission.proctoringLog.webcamStatus = type === 'WEBCAM_LOST' ? 'inactive' : 'active';
            }

            const eirfEval = evaluateEirfIncident(submission);
            if (eirfEval.hasEirfFlag) {
                submission.hasEirfFlag = true;
                submission.flaggedReasons = eirfEval.flaggedReasons;
                if (!submission.eirfStatus || submission.eirfStatus === 'none') {
                    submission.eirfStatus = 'pending';
                }
            }

            saveJSONData(db);
        }

        if (type === 'FULLSCREEN_EXIT' || type === 'TAB_SWITCH') {
            await logSystemAction(
                submission.candidateName || 'Candidate',
                `PROCTOR_ALERT_${type}`,
                `Candidate triggered proctoring warning: ${details} during exam ${submission.testTitle}`,
                'warning'
            );
        }

        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. WebRTC Signal Exchange Broker: send signal (Issue B2: Ownership check)
router.post('/signal/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { sender, type, data } = req.body;
    if (!sender || !type || !data) return res.status(400).json({ error: "Sender, type, and data are required." });

    const { mongoSubId } = resolveSubmissionIdentifiers(submissionId);

    try {
        const checkSub = dbState.useMongo
            ? await TestSubmissionModel.findOne({ _id: mongoSubId, isDeleted: { $ne: true } }).select('candidateId studentId')
            : (getJSONData().testSubmissions || []).find(s => !s.isDeleted && (String(s.id || s._id) === String(mongoSubId) || String(s.id || s._id) === String(submissionId) || (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId)));
        if (!checkSub) return res.status(404).json({ error: "Submission not found." });

        if (!isSubmissionOwnerForUser(req.user, checkSub)) {
            return res.status(403).json({ error: "Access denied: Unauthorized to transmit WebRTC signals for another candidate." });
        }

        if (dbState.useMongo) {
            const sig = new TestSignalModel({ submissionId: mongoSubId, sender, type, data });
            await sig.save();
        } else {
            const db = getJSONData();
            db.testSignals = db.testSignals || [];
            db.testSignals.push({
                id: Date.now().toString() + Math.random().toString(),
                submissionId: mongoSubId,
                sender,
                type,
                data,
                createdAt: new Date()
            });
            saveJSONData(db);
        }
        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to write WebRTC signals for submission ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 3. WebRTC Signal Exchange Broker: poll signals (Issue B2: Prevent SDP/ICE leak to unauthorized callers)
router.get('/signal/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { sender } = req.query;
    if (!sender) return res.status(400).json({ error: "Query target sender is required." });

    const { mongoSubId, bicsSubId } = resolveSubmissionIdentifiers(submissionId);

    try {
        const checkSub = dbState.useMongo
            ? await TestSubmissionModel.findOne({ _id: mongoSubId, isDeleted: { $ne: true } }).select('candidateId studentId')
            : (getJSONData().testSubmissions || []).find(s => !s.isDeleted && (String(s.id || s._id) === String(mongoSubId) || String(s.id || s._id) === String(submissionId) || (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId)));
        if (!checkSub) return res.status(404).json({ error: "Submission not found." });

        if (!isSubmissionOwnerForUser(req.user, checkSub)) {
            return res.status(403).json({ error: "Access denied: Unauthorized to view WebRTC stream telemetry for another candidate." });
        }

        let signals = [];
        if (dbState.useMongo) {
            signals = await TestSignalModel.find({ 
                submissionId: { $in: [submissionId, mongoSubId, bicsSubId].filter(Boolean) }, 
                sender 
            });
            // Delete signals once read so they do not replay indefinitely (Issue B8)
            if (signals.length > 0) {
                await TestSignalModel.deleteMany({ _id: { $in: signals.map(s => s._id) } }).catch(() => {});
            }
        } else {
            const db = getJSONData();
            db.testSignals = db.testSignals || [];
            signals = db.testSignals.filter(s => 
                (s.submissionId === submissionId || s.submissionId === mongoSubId || s.submissionId === bicsSubId) && 
                s.sender === sender
            );
            if (signals.length > 0) {
                const consumedIds = new Set(signals.map(s => s.id || s._id));
                db.testSignals = db.testSignals.filter(s => !consumedIds.has(s.id || s._id));
                saveJSONData(db);
            }
        }
        return res.json({ success: true, signals });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to read WebRTC signals for submission ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 4. Capture & Store Proctoring Snapshot (Cloudinary in prod, local gitignored folder in dev)
// Requirement 4: Stored under BICS Object ID (xxxxxx-xxxx-xxxx-xxxxxx), not 24-hex Mongo ID
router.post('/snapshot/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { image, eventType, details } = req.body;

    if (!image) return res.status(400).json({ error: "Image data is required." });
    const type = eventType || 'PROCTOR_WARNING';

    const { mongoSubId, bicsSubId: initialBicsId } = resolveSubmissionIdentifiers(submissionId);

    try {
        let submission = null;
        if (dbState.useMongo) {
            submission = await TestSubmissionModel.findOne({ _id: mongoSubId, isDeleted: { $ne: true } });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => !s.isDeleted && (String(s.id || s._id) === String(mongoSubId) || String(s.id || s._id) === String(submissionId) || (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId)));
        }

        if (!submission) return res.status(404).json({ error: "Submission not found." });

        if (!isSubmissionOwnerForUser(req.user, submission)) {
            return res.status(403).json({ error: "Access denied: Unauthorized to upload snapshot for another candidate." });
        }
        if (submission.status !== 'started' && !['submitted', 'auto-submitted'].includes(submission.status)) {
            return res.status(400).json({ error: "Exam is permanently evaluated and closed. Additional snapshots rejected." });
        }

        // Authoritative 20-character base-36 BICS Object ID (6-4-4-6 format)
        const finalBicsSubId = isBicsId(submissionId) ? submissionId : (toBicsId(submission._id || submission.id || mongoSubId) || initialBicsId);

        // Convert base64 data to Buffer
        const base64Data = String(image).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        if (!imageBuffer || imageBuffer.length === 0) {
            return res.status(400).json({ error: "Invalid empty image payload." });
        }

        // Item 5: Save snapshots name as a string of numbers 'time+studentid'
        const rawStudentId = req.body.studentId || submission.studentId || '';
        const numericStudentId = String(rawStudentId).replace(/\D/g, '') || '0';
        const filename = `${Date.now()}${numericStudentId}`;

        let finalImageUrl = '';

        if (isCloudinaryConfigured()) {
            // Upload directly to Cloudinary BICS_2026/proctoring/:bicsSubId
            finalImageUrl = await uploadToCloudinary(
                imageBuffer,
                `BICS_2026/proctoring/${finalBicsSubId}`,
                'image',
                filename
            );
        } else {
            // Save locally in backend/public/proctoring/:finalBicsSubId
            const localDir = path.join(__dirname, '../public/proctoring', finalBicsSubId);
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }

            // Folder Migration: If files were previously recorded under the 24-hex mongoSubId folder, consolidate them
            const legacyMongoDir = path.join(__dirname, '../public/proctoring', String(mongoSubId));
            if (legacyMongoDir !== localDir && fs.existsSync(legacyMongoDir)) {
                try {
                    const legacyFiles = fs.readdirSync(legacyMongoDir);
                    for (const f of legacyFiles) {
                        const srcPath = path.join(legacyMongoDir, f);
                        const dstPath = path.join(localDir, f);
                        if (!fs.existsSync(dstPath)) {
                            fs.copyFileSync(srcPath, dstPath);
                        }
                    }
                } catch (migErr) {
                    console.warn("[Proctoring Snapshot Migration] Notice:", migErr.message);
                }
            }

            const filePath = path.join(localDir, `${filename}.jpeg`);
            fs.writeFileSync(filePath, imageBuffer);
            finalImageUrl = `/public/proctoring/${finalBicsSubId}/${filename}.jpeg`;
        }

        const snapshotObj = {
            timestamp: new Date(),
            type,
            url: finalImageUrl,
            details: details || `Evidence snapshot captured for ${type}`
        };

        if (dbState.useMongo) {
            const updatePayload = {
                $push: { 'proctoringLog.snapshots': snapshotObj }
            };
            if (type === 'BASELINE_REFERENCE' && (!submission.baselinePhotoUrl || submission.baselinePhotoUrl.startsWith('data:'))) {
                updatePayload.$set = { baselinePhotoUrl: finalImageUrl };
            }

            // Atomic update to prevent concurrency version conflicts with concurrent submit or heartbeats
            const updatedSub = await TestSubmissionModel.findByIdAndUpdate(
                mongoSubId,
                updatePayload,
                { new: true }
            );
            if (!updatedSub) return res.status(404).json({ error: "Submission not found." });
            submission = updatedSub;
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => !s.isDeleted && (String(s.id || s._id) === String(mongoSubId) || String(s.id || s._id) === String(submissionId) || (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId)));
            if (!submission) return res.status(404).json({ error: "Submission not found." });

            if (!isSubmissionOwnerForUser(req.user, submission)) {
                return res.status(403).json({ error: "Access denied: Unauthorized to upload snapshot for another candidate." });
            }
            if (submission.status !== 'started' && !['submitted', 'auto-submitted'].includes(submission.status)) {
                return res.status(400).json({ error: "Exam is permanently evaluated and closed. Additional snapshots rejected." });
            }

            submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
            submission.proctoringLog.snapshots = submission.proctoringLog.snapshots || [];
            submission.proctoringLog.snapshots.push(snapshotObj);

            if (type === 'BASELINE_REFERENCE' && (!submission.baselinePhotoUrl || submission.baselinePhotoUrl.startsWith('data:'))) {
                submission.baselinePhotoUrl = finalImageUrl;
            }

            saveJSONData(db);
        }

        return res.json({ 
            success: true, 
            url: finalImageUrl, 
            bicsId: finalBicsSubId,
            snapshotCount: submission.proctoringLog?.snapshots?.length || 1 
        });
    } catch (e) {
        console.error("Proctoring snapshot upload error:", e);
        return res.status(500).json({ error: e.message || "Failed to process proctoring snapshot." });
    }
});

module.exports = router;
