const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    method: { type: String, required: true },
    path: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true, index: true },
    durationMs: { type: Number, default: 0 },
    category: {
        type: String,
        enum: ['STATE_MUTATION', 'SERVER_ERROR_5XX', 'CLIENT_ERROR_4XX', 'SECURITY_BLOCK_403', 'CONFLICT_409'],
        required: true,
        index: true
    },
    userId: { type: String, index: true },
    studentId: { type: String, index: true },
    submissionId: { type: String, index: true },
    ip: { type: String },
    userAgent: { type: String },
    errorMessage: { type: String },
    requestSummary: { type: mongoose.Schema.Types.Mixed }
}, { versionKey: false });

// Compound indexes for rapid admin incident filtering
AuditLogSchema.index({ statusCode: 1, timestamp: -1 });
AuditLogSchema.index({ category: 1, timestamp: -1 });
AuditLogSchema.index({ studentId: 1, timestamp: -1 });

// 30-Day Automated Retention TTL
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const AuditLogModel = mongoose.model('AuditLog', AuditLogSchema, 'auditlogs');

module.exports = {
    AuditLogSchema,
    AuditLogModel
};
