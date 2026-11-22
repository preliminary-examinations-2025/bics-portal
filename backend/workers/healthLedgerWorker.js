/**
 * Persistent Server Health Ledger & Autonomous Outage Detector
 * 
 * Records a lightweight 30-second pulse in MongoDB to track server vitality,
 * detect cold-starts, reboots, and database outages, and maintain a permanent
 * institutional audit log of all infrastructure downtime incidents.
 */

const { ServerHealthLogModel, ServerOutageIncidentModel, TestSubmissionModel } = require('../models');
const { dbState } = require('../config/db');

const INSTANCE_ID = process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'primary';
const HEARTBEAT_INTERVAL_MS = 30000; // 30s heartbeat
const OUTAGE_THRESHOLD_SECONDS = 75; // 2.5 missed heartbeats = outage

let pulseIntervalId = null;
let lastSuccessfulPulseTime = null;
let isPulseInProgress = false;

/**
 * On cold boot or container restart:
 * Checks the last heartbeat recorded in the database.
 * If the gap between now and the last pulse exceeds the threshold,
 * an official ServerOutageIncident is automatically logged.
 */
async function checkAndLogStartupOutage() {
    if (!dbState.isConnected) return;

    try {
        // Query the most recent pulse across the cluster
        const lastPulse = await ServerHealthLogModel.findOne({ instanceId: INSTANCE_ID })
            .sort({ timestamp: -1 })
            .lean();

        if (lastPulse && lastPulse.timestamp) {
            const now = new Date();
            const lastPulseDate = new Date(lastPulse.timestamp);
            const gapSeconds = Math.round((now.getTime() - lastPulseDate.getTime()) / 1000);

            if (gapSeconds >= OUTAGE_THRESHOLD_SECONDS) {
                console.warn(`[HEALTH LEDGER] ⚠️ Infrastructure gap detected on startup: ${gapSeconds}s (Last pulse: ${lastPulseDate.toISOString()}).`);

                // Query active exam sessions that were ongoing during this outage window
                let affectedCount = 0;
                let affectedIds = [];
                try {
                    const affected = await TestSubmissionModel.find({
                        status: 'started',
                        startedAt: { $lte: now },
                        isDeleted: { $ne: true }
                    }).select('_id candidateId studentId').lean();

                    affectedCount = affected.length;
                    affectedIds = affected.map(a => a.studentId || a.candidateId || String(a._id));
                } catch (subErr) {
                    console.error('[HEALTH LEDGER] Failed to query affected submissions for startup outage:', subErr.message);
                }

                await ServerOutageIncidentModel.create({
                    instanceId: INSTANCE_ID,
                    outageStart: lastPulseDate,
                    outageEnd: now,
                    durationSeconds: gapSeconds,
                    cause: 'server_reboot',
                    affectedSubmissionsCount: affectedCount,
                    affectedCandidateIds: affectedIds,
                    notes: `Autonomous detection: Server restarted after ${gapSeconds}s heartbeat gap. ${affectedCount} active exam sessions affected.`
                });

                console.log(`[HEALTH LEDGER] ✅ Logged ServerOutageIncident: ${gapSeconds}s duration, ${affectedCount} active exam sessions captured.`);
            }
        }
    } catch (err) {
        console.error('[HEALTH LEDGER] Failed to evaluate startup outage gap:', err.message);
    }
}

/**
 * Writes a single 30s heartbeat pulse to the database.
 * Also monitors runtime database gaps if MongoDB was temporarily offline.
 */
async function writePulse() {
    if (!dbState.isConnected || isPulseInProgress) return;
    isPulseInProgress = true;
    const pulseStartTime = Date.now();

    try {
        const now = new Date();

        // Runtime DB gap detection: If previous pulse was > 75s ago while server stayed up
        if (lastSuccessfulPulseTime) {
            const runtimeGapSec = Math.round((now.getTime() - lastSuccessfulPulseTime.getTime()) / 1000);
            if (runtimeGapSec >= OUTAGE_THRESHOLD_SECONDS) {
                console.warn(`[HEALTH LEDGER] ⚠️ Runtime database outage gap detected: ${runtimeGapSec}s.`);

                let affectedCount = 0;
                let affectedIds = [];
                try {
                    const affected = await TestSubmissionModel.find({
                        status: 'started',
                        startedAt: { $lte: now },
                        isDeleted: { $ne: true }
                    }).select('_id candidateId studentId').lean();

                    affectedCount = affected.length;
                    affectedIds = affected.map(a => a.studentId || a.candidateId || String(a._id));
                } catch (_) {}

                await ServerOutageIncidentModel.create({
                    instanceId: INSTANCE_ID,
                    outageStart: lastSuccessfulPulseTime,
                    outageEnd: now,
                    durationSeconds: runtimeGapSec,
                    cause: 'db_connection_loss',
                    affectedSubmissionsCount: affectedCount,
                    affectedCandidateIds: affectedIds,
                    notes: `Autonomous detection: Database recovered after ${runtimeGapSec}s disconnect gap.`
                });
            }
        }

        // Active exams count (fail-safe)
        let activeExams = 0;
        try {
            activeExams = await TestSubmissionModel.countDocuments({ status: 'started', isDeleted: { $ne: true } });
        } catch (_) {}

        const dbLatencyMs = Date.now() - pulseStartTime;
        const memoryRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

        await ServerHealthLogModel.create({
            instanceId: INSTANCE_ID,
            timestamp: now,
            uptimeSeconds: Math.round(process.uptime()),
            activeExamsCount: activeExams,
            dbLatencyMs,
            memoryRssMb
        });

        lastSuccessfulPulseTime = now;
    } catch (err) {
        console.error('[HEALTH LEDGER] Heartbeat pulse write failed:', err.message);
    } finally {
        isPulseInProgress = false;
    }
}

/**
 * Captures graceful container termination (Render/Cloud SIGTERM deploy)
 * to mark planned rolling deployments as graceful rather than crashes.
 */
async function recordGracefulShutdown(reason = 'sigterm_deploy') {
    if (!dbState.isConnected) return;
    try {
        const now = new Date();
        const expectedRestartDuration = 30; // 30s expected rolling deploy window
        await ServerOutageIncidentModel.create({
            instanceId: INSTANCE_ID,
            outageStart: now,
            outageEnd: new Date(now.getTime() + expectedRestartDuration * 1000),
            durationSeconds: expectedRestartDuration,
            cause: reason,
            isGraceful: true,
            notes: 'Planned deployment or container restart (SIGTERM received).'
        });
        console.log(`[HEALTH LEDGER] Recorded graceful maintenance window (${reason}).`);
    } catch (err) {
        console.error('[HEALTH LEDGER] Failed to record graceful shutdown:', err.message);
    }
}

/**
 * Initializes the persistent health ledger and periodic heartbeat loop.
 */
function startHealthLedgerWorker() {
    if (pulseIntervalId) return;

    // Run startup gap check once DB is confirmed ready
    checkAndLogStartupOutage().finally(() => {
        // Write initial pulse immediately
        writePulse();
        // Start 30-second recurring pulse
        pulseIntervalId = setInterval(writePulse, HEARTBEAT_INTERVAL_MS);
        console.log(`[HEALTH LEDGER] Autonomous Health Ledger Worker started (Pulse: ${HEARTBEAT_INTERVAL_MS / 1000}s, Instance: ${INSTANCE_ID}).`);
    });
}

function stopHealthLedgerWorker() {
    if (pulseIntervalId) {
        clearInterval(pulseIntervalId);
        pulseIntervalId = null;
    }
}

module.exports = {
    startHealthLedgerWorker,
    stopHealthLedgerWorker,
    checkAndLogStartupOutage,
    recordGracefulShutdown
};
