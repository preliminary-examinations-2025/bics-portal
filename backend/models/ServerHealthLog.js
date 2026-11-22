const mongoose = require('mongoose');

const ServerHealthLogSchema = new mongoose.Schema({
    instanceId: { type: String, default: 'primary', index: true },
    timestamp: { type: Date, default: Date.now },
    uptimeSeconds: { type: Number, required: true },
    activeExamsCount: { type: Number, default: 0 },
    dbLatencyMs: { type: Number, default: 0 },
    memoryRssMb: { type: Number, default: 0 },
    cpuUsagePercent: { type: Number, default: 0 }
}, { versionKey: false });

// Compound index for querying latest pulse per cluster instance
ServerHealthLogSchema.index({ instanceId: 1, timestamp: -1 });

// 14-Day Automated Retention TTL (Keeps heartbeat database footprint minimal)
ServerHealthLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

const ServerHealthLogModel = mongoose.model('ServerHealthLog', ServerHealthLogSchema, 'serverhealthlogs');

module.exports = {
    ServerHealthLogSchema,
    ServerHealthLogModel
};
