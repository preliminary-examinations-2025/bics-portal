const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ServerHealthLogModel, ServerOutageIncidentModel, AuditLogModel, TestSubmissionModel } = require('../models');
const { dbState } = require('../config/db');

/**
 * GET /api/admin/system-health
 * 
 * Provides an authoritative, high-speed, read-only snapshot of infrastructure vitality:
 * - Real-time Node.js process and memory telemetry
 * - Live MongoDB ping latency and connection state
 * - Active exam concurrency and offline sync metrics
 * - Chronological history of auto-detected ServerOutageIncident windows
 * - Recent high-value 5xx / 409 / 403 / 4xx audit error feed
 */
router.get('/system-health', async (req, res) => {
    const dbPingStart = Date.now();
    const dbReadyState = mongoose.connection.readyState;
    let dbPingMs = -1;

    try {
        if (dbReadyState === 1 && mongoose.connection.db) {
            await mongoose.connection.db.admin().ping();
            dbPingMs = Date.now() - dbPingStart;
        }
    } catch (_) {
        dbPingMs = -1;
    }

    try {
        let recentOutages = [];
        let recentErrors = [];
        let recentMutations = [];
        let recentPulses = [];
        let activeExams = 0;
        let totalOfflineSynced = 0;
        let verifiedOutageSynced = 0;
        let totalSubmissions = 0;

        if (dbState.useMongo) {
            const results = await Promise.allSettled([
                ServerOutageIncidentModel.find().sort({ outageStart: -1 }).limit(15).lean(),
                AuditLogModel.find({ statusCode: { $gte: 400 } }).sort({ timestamp: -1 }).limit(25).lean(),
                AuditLogModel.find({ category: 'STATE_MUTATION' }).sort({ timestamp: -1 }).limit(15).lean(),
                ServerHealthLogModel.find().sort({ timestamp: -1 }).limit(10).lean(),
                TestSubmissionModel.countDocuments({ status: 'started', isDeleted: { $ne: true } }),
                TestSubmissionModel.countDocuments({ 'offlineSyncMetadata.wasSyncedOffline': true, isDeleted: { $ne: true } }),
                TestSubmissionModel.countDocuments({ 'offlineSyncMetadata.outageVerified': true, isDeleted: { $ne: true } }),
                TestSubmissionModel.countDocuments({ isDeleted: { $ne: true } })
            ]);

            recentOutages = results[0].status === 'fulfilled' ? results[0].value : [];
            recentErrors = results[1].status === 'fulfilled' ? results[1].value : [];
            recentMutations = results[2].status === 'fulfilled' ? results[2].value : [];
            recentPulses = results[3].status === 'fulfilled' ? results[3].value : [];
            activeExams = results[4].status === 'fulfilled' ? results[4].value : 0;
            totalOfflineSynced = results[5].status === 'fulfilled' ? results[5].value : 0;
            verifiedOutageSynced = results[6].status === 'fulfilled' ? results[6].value : 0;
            totalSubmissions = results[7].status === 'fulfilled' ? results[7].value : 0;
        }

        res.json({
            server: {
                status: 'online',
                uptimeSeconds: Math.round(process.uptime()),
                serverTime: new Date().toISOString(),
                memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
                memoryHeapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                nodeVersion: process.version,
                instanceId: process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'primary',
                platform: process.platform
            },
            database: {
                status: dbReadyState === 1 && dbPingMs >= 0 ? 'connected' : 'degraded',
                readyState: dbReadyState,
                latencyMs: dbPingMs,
                host: mongoose.connection.host || 'mongodb-cluster'
            },
            examMetrics: {
                activeExams,
                totalOfflineSynced,
                verifiedOutageSynced,
                totalSubmissions
            },
            recentOutages,
            recentErrors,
            recentMutations,
            recentPulses
        });
    } catch (err) {
        console.error('[ADMIN SYSTEM HEALTH] Error fetching metrics:', err);
        res.status(500).json({ error: 'Failed to retrieve system health metrics: ' + err.message });
    }
});

module.exports = router;
