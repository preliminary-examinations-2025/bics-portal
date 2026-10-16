/**
 * Dead-Man's Switch Background Reaper Worker (Item 2.4)
 * 
 * Periodically inspects active examination sessions ('started') and auto-finalizes
 * sessions where the candidate's heartbeat has ceased for > 45 seconds due to:
 * - Sudden browser crashes
 * - OS freezes / Blue Screens
 * - Power cuts or abrupt device shutdown
 * 
 * Eliminates hanging / stranded 'started' submissions and protects academic integrity.
 */

const { TestSubmissionModel, TestConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { encryptEirfPayload } = require('../utils/cipher');
const { recalculateMCQScore, calculateCodingScoreFast } = require('../routes/tests');

let reaperIntervalId = null;

async function reapAbandonedSubmissions(maxIdleMs = 45000) {
    const cutoffTime = new Date(Date.now() - maxIdleMs);

    try {
        if (dbState.useMongo) {
            // Find all active 'started' submissions where heartbeat is older than cutoff (or missing)
            // and startedAt is also older than cutoff (give brand new sessions at least 45s)
            const abandonedSessions = await TestSubmissionModel.find({
                status: 'started',
                isDeleted: false,
                $and: [
                    {
                        $or: [
                            { startedAt: { $lt: cutoffTime } },
                            { startedAt: { $exists: false } },
                            { startedAt: null }
                        ]
                    },
                    {
                        $or: [
                            { lastHeartbeatAt: { $lt: cutoffTime } },
                            { lastHeartbeatAt: { $exists: false } },
                            { lastHeartbeatAt: null }
                        ]
                    }
                ]
            });

            for (const sub of abandonedSessions) {
                try {
                    const lastActivityTime = sub.lastHeartbeatAt || sub.startedAt || sub.createdAt || new Date(0);
                    const idleSeconds = Math.max(0, Math.round((Date.now() - new Date(lastActivityTime).getTime()) / 1000));
                    console.log(`[DEAD-MAN REAPER] Auto-finalizing abandoned session ${sub._id} (${sub.candidateName || sub.studentId}) - Inactive for ${idleSeconds}s.`);

                    sub.status = 'auto-submitted';
                    sub.submittedAt = new Date();

                    if (!sub.proctoringLog) sub.proctoringLog = {};
                    if (!sub.proctoringLog.events) sub.proctoringLog.events = [];

                    sub.proctoringLog.events.push({
                        timestamp: new Date(),
                        type: 'DISCONNECT_REAPED',
                        details: `Session auto-finalized by server dead-man switch: Candidate heartbeat lost for ${idleSeconds}s (browser crash, connection loss, or power trip).`
                    });

                    // Evaluate marks if test configuration exists
                    if (sub.testId) {
                        const test = await TestConfigModel.findById(sub.testId);
                        if (test) {
                            recalculateMCQScore(sub, test);
                            calculateCodingScoreFast(sub, test);
                        }
                    }

                    // Generate encrypted .eirf snapshot
                    const sStudId = sub.studentId || 'Candidate';
                    const dbPayloadSnap = {
                        submissionId: String(sub._id || sub.id),
                        studentId: sStudId,
                        candidateName: sub.candidateName || 'Candidate',
                        testTitle: sub.testTitle || 'BICS Online Examination',
                        answers: sub.answers || [],
                        proctoringLog: sub.proctoringLog || {},
                        generatedAt: new Date().toISOString()
                    };
                    sub.encryptedDbPayload = encryptEirfPayload(dbPayloadSnap, sStudId, String(sub._id || sub.id));

                    await sub.save();
                } catch (subErr) {
                    console.error(`[DEAD-MAN REAPER] Error finalizing session ${sub._id}:`, subErr.message);
                }
            }
        } else {
            // Local JSON DB fallback
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            let changed = false;

            db.testSubmissions.forEach(sub => {
                if (sub.status === 'started' && !sub.isDeleted) {
                    const startT = new Date(sub.startedAt || 0).getTime();
                    const hbT = new Date(sub.lastHeartbeatAt || sub.startedAt || 0).getTime();
                    const now = Date.now();

                    if (now - startT > maxIdleMs && now - hbT > maxIdleMs) {
                        sub.status = 'auto-submitted';
                        sub.submittedAt = new Date();
                        if (!sub.proctoringLog) sub.proctoringLog = {};
                        if (!sub.proctoringLog.events) sub.proctoringLog.events = [];
                        sub.proctoringLog.events.push({
                            timestamp: new Date(),
                            type: 'DISCONNECT_REAPED',
                            details: 'Session auto-finalized by server dead-man switch: Candidate heartbeat lost > 45s.'
                        });
                        changed = true;
                    }
                }
            });

            if (changed) {
                saveJSONData(db);
            }
        }
    } catch (err) {
        console.error("[DEAD-MAN REAPER] Error running reaper job:", err.message);
    }
}

function startSubmissionReaper(intervalMs = 15000, maxIdleMs = 45000) {
    if (reaperIntervalId) return;
    console.log(`[DEAD-MAN REAPER] Dead-Man's Switch reaper worker initialized (Interval: ${intervalMs}ms, Max Idle: ${maxIdleMs}ms).`);
    
    // Initial run
    reapAbandonedSubmissions(maxIdleMs).catch(() => {});
    
    reaperIntervalId = setInterval(() => {
        reapAbandonedSubmissions(maxIdleMs).catch(() => {});
    }, intervalMs);
}

function stopSubmissionReaper() {
    if (reaperIntervalId) {
        clearInterval(reaperIntervalId);
        reaperIntervalId = null;
    }
}

module.exports = {
    reapAbandonedSubmissions,
    reapDeadSessions: reapAbandonedSubmissions,
    startSubmissionReaper,
    stopSubmissionReaper
};
