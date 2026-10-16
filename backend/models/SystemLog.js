const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    actor: { type: String, default: 'system' },
    actorId: { type: String, default: 'system' },
    actorRole: { type: String, default: 'unknown' },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, index: true }, // 'marks_ledger', 'candidate', 'database_viewer'
    resourceId: { type: String },
    details: { type: String },
    beforeState: { type: mongoose.Schema.Types.Mixed },
    afterState: { type: mongoose.Schema.Types.Mixed },
    diff: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    severity: { type: String, default: 'info' } // 'info', 'warning', 'error', 'critical'
}, { versionKey: false });

// Compound index for high-speed audit inspection
SystemLogSchema.index({ timestamp: -1, action: 1, resourceType: 1 });

// 180-Day Automated Log Retention TTL
SystemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const SystemLogModel = mongoose.model('SystemLog', SystemLogSchema, 'systemlogs');

module.exports = {
    SystemLogSchema,
    SystemLogModel
};
