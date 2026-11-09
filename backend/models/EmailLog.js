const mongoose = require('mongoose');

const EMAIL_TYPES = [
    'verification_code',
    'test_submitted',
    'eirf_filing',
    'eirf_approved',
    'eirf_rejected',
    'otrf_sent'
];

const EMAIL_STATUSES = [
    'pending',
    'sent',
    'failed',
    'simulated'
];

const EmailLogSchema = new mongoose.Schema({
    emailType: {
        type: String,
        enum: EMAIL_TYPES,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: EMAIL_STATUSES,
        default: 'pending',
        index: true
    },
    transport: { type: String, default: 'gmail_rest_api' },
    statusCode: { type: Number, default: null },
    messageId: { type: String, default: '' },
    attempts: { type: Number, default: 1 },
    lastError: { type: String, default: '' },
    lastAttemptAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },

    recipientEmail: { type: String, default: '', index: true },
    recipientName: { type: String, default: '' },
    subject: { type: String, default: '' },
    attachmentNames: [{ type: String }],
    triggerSource: { type: String, default: 'system' },
    purpose: { type: String, default: '' },

    candidateId: { type: String, default: '', index: true },
    studentId: { type: String, default: '', index: true },
    testId: { type: String, default: '', index: true },
    submissionId: { type: String, default: '', index: true },
    submissionRefId: { type: String, default: '', index: true },
    reportId: { type: String, default: '', index: true },
    retriedFromLogId: { type: String, default: '' }
}, { versionKey: false, timestamps: true });

EmailLogSchema.index({ createdAt: -1 });
EmailLogSchema.index({ emailType: 1, status: 1, createdAt: -1 });

const EmailLogModel = mongoose.model('EmailLog', EmailLogSchema, 'email_logs');

module.exports = {
    EMAIL_TYPES,
    EMAIL_STATUSES,
    EmailLogSchema,
    EmailLogModel
};
