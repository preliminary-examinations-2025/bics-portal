const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { TestSubmissionModel, TestSignalModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { formatCloudinaryMediaUrl, uploadToCloudinary, useCloudinary } = require('../config/cloudinary');

// 1. Save Live Proctoring Event during test
router.post('/event/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { type, details, startTime, endTime, durationSeconds } = req.body;
    if (!type) return res.status(400).json({ error: "Event type is required." });

    try {
        let submission = null;
        if (dbState.useMongo) {
            let retries = 5;
            while (retries > 0) {
                try {
                    submission = await TestSubmissionModel.findById(submissionId);
                    if (!submission) return res.status(404).json({ error: "Submission not found." });

                    submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
                    submission.proctoringLog.events = submission.proctoringLog.events || [];
                    submission.proctoringLog.events.push({ 
                        type, 
                        details, 
                        timestamp: new Date(),
                        startTime: startTime || null,
                        endTime: endTime || null,
                        durationSeconds: durationSeconds ? Number(durationSeconds) : 0
                    });

                    if (type === 'FULLSCREEN_EXIT') {
                        submission.proctoringLog.fullscreenExits = (submission.proctoringLog.fullscreenExits || 0) + 1;
                    } else if (type === 'TAB_SWITCH') {
                        submission.proctoringLog.tabSwitches = (submission.proctoringLog.tabSwitches || 0) + 1;
                    } else if (type === 'CLIPBOARD_ATTEMPT') {
                        submission.proctoringLog.clipboardAttempts = (submission.proctoringLog.clipboardAttempts || 0) + 1;
                    } else if (type === 'WEBCAM_LOST' || type === 'WEBCAM_RESTORED') {
                        submission.proctoringLog.webcamStatus = type === 'WEBCAM_LOST' ? 'inactive' : 'active';
                    }

                    const dur = Number(durationSeconds || 0);
                    if (dur > 5 || type === 'NETWORK_OFFLINE' || type === 'EMERGENCY_SUBMISSION') {
                        submission.hasEirfFlag = true;
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
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found." });

            submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
            submission.proctoringLog.events = submission.proctoringLog.events || [];
            submission.proctoringLog.events.push({ 
                        type, 
                        details, 
                        timestamp: new Date(),
                        startTime: startTime || null,
                        endTime: endTime || null,
                        durationSeconds: durationSeconds ? Number(durationSeconds) : 0
            });

            if (type === 'FULLSCREEN_EXIT') {
                submission.proctoringLog.fullscreenExits = (submission.proctoringLog.fullscreenExits || 0) + 1;
            } else if (type === 'TAB_SWITCH') {
                submission.proctoringLog.tabSwitches = (submission.proctoringLog.tabSwitches || 0) + 1;
            } else if (type === 'CLIPBOARD_ATTEMPT') {
                submission.proctoringLog.clipboardAttempts = (submission.proctoringLog.clipboardAttempts || 0) + 1;
            } else if (type === 'WEBCAM_LOST' || type === 'WEBCAM_RESTORED') {
                submission.proctoringLog.webcamStatus = type === 'WEBCAM_LOST' ? 'inactive' : 'active';
            }

            const dur = Number(durationSeconds || 0);
            if (dur > 5 || type === 'NETWORK_OFFLINE' || type === 'EMERGENCY_SUBMISSION') {
                submission.hasEirfFlag = true;
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

// 2. WebRTC Signal Exchange Broker: send signal
router.post('/signal/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { sender, type, data } = req.body;
    if (!sender || !type || !data) return res.status(400).json({ error: "Sender, type, and data are required." });

    try {
        if (dbState.useMongo) {
            const sig = new TestSignalModel({ submissionId, sender, type, data });
            await sig.save();
        } else {
            const db = getJSONData();
            db.testSignals = db.testSignals || [];
            db.testSignals.push({
                id: Date.now().toString() + Math.random().toString(),
                submissionId,
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

// 3. WebRTC Signal Exchange Broker: poll signals
router.get('/signal/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { sender } = req.query;
    if (!sender) return res.status(400).json({ error: "Query target sender is required." });

    try {
        let signals = [];
        if (dbState.useMongo) {
            signals = await TestSignalModel.find({ submissionId, sender });
        } else {
            const db = getJSONData();
            db.testSignals = db.testSignals || [];
            signals = db.testSignals.filter(s => s.submissionId === submissionId && s.sender === sender);
        }
        return res.json({ success: true, signals });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to read WebRTC signals for submission ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 4. Capture & Store Proctoring Snapshot (Cloudinary in prod, local gitignored folder in dev)
router.post('/snapshot/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { image, eventType, details } = req.body;

    if (!image) return res.status(400).json({ error: "Image data is required." });
    const type = eventType || 'PROCTOR_WARNING';

    try {
        let submission = null;
        if (dbState.useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
        }

        if (!submission) return res.status(404).json({ error: "Submission not found." });

        // Convert base64 data to Buffer
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Item 5: Save snapshots name as a string of numbers 'time+studentid'
        const rawStudentId = req.body.studentId || submission.studentId || '';
        const numericStudentId = String(rawStudentId).replace(/\D/g, '') || '0';
        const filename = `${Date.now()}${numericStudentId}`;

        let finalImageUrl = '';

        if (useCloudinary) {
            // Upload directly to Cloudinary BICS_2026/proctoring/:submissionId
            finalImageUrl = await uploadToCloudinary(
                imageBuffer,
                `BICS_2026/proctoring/${submissionId}`,
                'image',
                filename
            );
        } else {
            // Save locally in backend/public/proctoring/:submissionId
            const localDir = path.join(__dirname, '../public/proctoring', submissionId);
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }
            const filePath = path.join(localDir, `${filename}.jpeg`);
            fs.writeFileSync(filePath, imageBuffer);
            finalImageUrl = `/public/proctoring/${submissionId}/${filename}.jpeg`;
        }

        if (dbState.useMongo) {
            let retries = 5;
            while (retries > 0) {
                try {
                    const latestSub = await TestSubmissionModel.findById(submissionId);
                    if (!latestSub) return res.status(404).json({ error: "Submission not found." });

                    latestSub.proctoringLog = latestSub.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
                    latestSub.proctoringLog.snapshots = latestSub.proctoringLog.snapshots || [];
                    latestSub.proctoringLog.snapshots.push({
                        timestamp: new Date(),
                        type,
                        url: finalImageUrl,
                        details: details || `Evidence snapshot captured for ${type}`
                    });

                    if (type === 'BASELINE_REFERENCE' && (!latestSub.baselinePhotoUrl || latestSub.baselinePhotoUrl.startsWith('data:'))) {
                        latestSub.baselinePhotoUrl = finalImageUrl;
                    }

                    await latestSub.save();
                    submission = latestSub;
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
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found." });

            submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
            submission.proctoringLog.snapshots = submission.proctoringLog.snapshots || [];
            submission.proctoringLog.snapshots.push({
                timestamp: new Date(),
                type,
                url: finalImageUrl,
                details: details || `Evidence snapshot captured for ${type}`
            });

            if (type === 'BASELINE_REFERENCE' && (!submission.baselinePhotoUrl || submission.baselinePhotoUrl.startsWith('data:'))) {
                submission.baselinePhotoUrl = finalImageUrl;
            }

            saveJSONData(db);
        }

        return res.json({ success: true, url: finalImageUrl, snapshotCount: submission.proctoringLog.snapshots.length });
    } catch (e) {
        console.error("Proctoring snapshot upload error:", e);
        return res.status(500).json({ error: e.message || "Failed to process proctoring snapshot." });
    }
});

module.exports = router;
