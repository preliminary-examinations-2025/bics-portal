const mongoose = require('mongoose');

const EIRFReportSchema = new mongoose.Schema({
    reportId: { type: String, required: true, unique: true },
    submissionId: { type: String, required: true, index: true },
    candidateId: { type: String, required: true },
    studentId: { type: String, required: true },
    candidateName: { type: String, default: 'Candidate' },
    testId: { type: String, required: true },
    testTitle: { type: String, default: 'Online Examination' },
    
    // Incident Telemetry
    proctoringLogSnapshot: mongoose.Schema.Types.Mixed,
    flaggedReasons: [String], // e.g. ["Fullscreen exit > 5s (12s)", "Tab switch > 5s (18s)"]
    
    // Candidate Questionnaire Answers
    primaryCause: { type: String, required: true },
    detailedExplanation: { type: String, required: true },
    technicalContext: {
        browser: String,
        os: String,
        networkType: String,
        openedApp: String
    },
    additionalAnswers: mongoose.Schema.Types.Mixed,
    formAnswers: mongoose.Schema.Types.Mixed,
    
    // Encrypted Payload Verification Results
    encryptedPayloadUploaded: { type: Boolean, default: false },
    payloadFileName: String,
    payloadUrl: String,
    decryptedPayloadSnapshot: mongoose.Schema.Types.Mixed,
    verificationStatus: { type: String, enum: ['VERIFIED_MATCH', 'DISCREPANCY_FLAGGED', 'PAYLOAD_MISSING', 'DECRYPTION_FAILED'], default: 'VERIFIED_MATCH' },
    verificationDetails: {
        answersMatch: Boolean,
        clientHashMatch: Boolean,
        discrepancies: [String]
    },
    
    // Status & Life Cycle
    status: { type: String, enum: ['pending_review', 'approved', 'rejected', 'expired'], default: 'pending_review' },
    adminRemarks: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    reviewedAt: Date,
    reviewedBy: String
}, { versionKey: false, timestamps: true });

const EIRFReportModel = mongoose.model('EIRFReport', EIRFReportSchema, 'eirf_reports');

module.exports = {
    EIRFReportSchema,
    EIRFReportModel
};
