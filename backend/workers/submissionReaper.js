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
const { recalculateMCQScore, calculateCodingScoreFast } = require('../utils/scoreCalculator');
const { evaluateEirfIncident } = require('../services/eirfEvaluator');
const { runPipelineTick } = require('./eirfPipelineWorker');

let reaperIntervalId = null;
let isReaping = false;

async function reapAbandonedSubmissions(maxIdleMs = 70000) {
    if (isReaping) return;
    isReaping = true;
    const cutoffTime = new Date(Date.now() - maxIdleMs);

    try {
        if (dbState.useMongo) {
            // Find all active 'started' submissions where heartbeat is older than cutoff (or missing)
            // and startedAt is also older than cutoff (give brand new sessions at least 45s)
            const abandonedSessions = await TestSubmissionModel.find({
                status: 'started',
                isDeleted: { $ne: true },
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
                    console.log(`[DEAD-MAN REAPER] Auto-finalizing abandoned session ${sub.submissionRefId || sub._id} (${sub.candidateName || sub.studentId}) - Inactive for ${idleSeconds}s.`);

                    sub.status = 'auto-submitted';
                    sub.submissionReason = 'dead_man_reaper';
                    sub.submittedAt = new Date();

                    if (!sub.proctoringLog) sub.proctoringLog = {};
                    if (!sub.proctoringLog.events) sub.proctoringLog.events = [];

                    sub.proctoringLog.events.push({
                        timestamp: new Date(),
                        type: 'DISCONNECT_REAPED',
                        details: `Session auto-finalized by server dead-man switch: Candidate heartbeat lost for ${idleSeconds}s (browser crash, connection loss, or power trip).`
                    });

                    // Evaluate marks if active test configuration exists
                    let testDoc = null;
                    if (sub.testId) {
                        testDoc = await TestConfigModel.findOne({ _id: sub.testId, isDeleted: { $ne: true } });
                        if (testDoc) {
                            recalculateMCQScore(sub, testDoc);
                            calculateCodingScoreFast(sub, testDoc);
                            sub.totalScore = sub.evaluation?.totalScore ?? sub.score ?? 0;
                            if (sub.evaluation) sub.evaluation.evaluatedAt = new Date();
                        }
                    }

                    // Authoritative server-side EIRF incident evaluation
                    const eirfEval = evaluateEirfIncident(sub, testDoc);
                    sub.hasEirfFlag = eirfEval.hasEirfFlag;
                    sub.eirfStatus = eirfEval.eirfStatus;
                    sub.flaggedReasons = eirfEval.flaggedReasons;
                    sub.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';

                    if (typeof sub.markModified === 'function') {
                        sub.markModified('answers');
                        sub.markModified('evaluation');
                    }

                    await sub.save();
                    // Kick off sequential pipeline to generate questions and dispatch tokenized magic link
                    setImmediate(() => {
                        runPipelineTick().catch(() => {});
                    });
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
                        sub.submissionReason = 'dead_man_reaper';
                        sub.submittedAt = new Date();
                        if (!sub.proctoringLog) sub.proctoringLog = {};
                        if (!sub.proctoringLog.events) sub.proctoringLog.events = [];
                        sub.proctoringLog.events.push({
                            timestamp: new Date(),
                            type: 'DISCONNECT_REAPED',
                            details: 'Session auto-finalized by server dead-man switch: Candidate heartbeat lost > 45s.'
                        });

                        const testDoc = (db.tests || []).find(t => !t.isDeleted && String(t.id || t._id) === String(sub.testId));
                        if (testDoc) {
                            recalculateMCQScore(sub, testDoc);
                            calculateCodingScoreFast(sub, testDoc);
                            sub.totalScore = sub.evaluation?.totalScore ?? sub.score ?? 0;
                            if (sub.evaluation) sub.evaluation.evaluatedAt = new Date();
                        }

                        const eirfEval = evaluateEirfIncident(sub, testDoc);
                        sub.hasEirfFlag = eirfEval.hasEirfFlag;
                        sub.eirfStatus = eirfEval.eirfStatus;
                        sub.flaggedReasons = eirfEval.flaggedReasons;
                        sub.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';
                        changed = true;
                    }
                }
            });

            if (changed) {
                saveJSONData(db);
                setImmediate(() => {
                    runPipelineTick().catch(() => {});
                });
            }
        }
    } catch (err) {
        console.error("[DEAD-MAN REAPER] Error running reaper job:", err.message);
    } finally {
        isReaping = false;
    }
}

function startSubmissionReaper(intervalMs = 15000, maxIdleMs = 70000) {
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
