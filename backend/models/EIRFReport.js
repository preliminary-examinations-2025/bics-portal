const mongoose = require('mongoose');

const EIRFReportSchema = new mongoose.Schema({
    reportId: { type: String, required: true, unique: true },
    submissionId: { type: String, required: true, index: true },
    bicsId: { type: String, default: '' },
    submissionRefId: { type: String, default: '', index: true },
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
        platform: String,
        networkType: String,
        openedApp: String,
        ip: String,
        screenResolution: String,
        viewportSize: String,
        hardwareConcurrency: mongoose.Schema.Types.Mixed,
        submittedAt: Date,
        baselinePhotoUrl: String
    },
    additionalAnswers: mongoose.Schema.Types.Mixed,
    formAnswers: mongoose.Schema.Types.Mixed,
    uploadedProofUrl: { type: String, default: '' },
    
    // Official Verdict & Artifacts (Verdict PDF is email-only / Admin JWT-only; no public pdfUrl)
    pdfUrl: { type: String, default: '' },
    pdfCloudinaryPublicId: { type: String, default: '' },
    digitalHash: { type: String, default: '' },
    courseCode: { type: String, default: '' },
    courseName: { type: String, default: '' },
    resolutionCategory: { type: String, default: '' },
    remediationAction: { type: String, default: '' },
    reviewerName: { type: String, default: '' },
    reviewerTitle: { type: String, default: '' },
    pipelineStatus: { type: String, default: 'UNDER_REVIEW' },
    scheduledCleanupAt: { type: Date },
    pdfDeletedFromCloudinary: { type: Boolean, default: false },
    
    // [DEPRECATED] Encrypted Physical Payload Verification (Superseded by client IndexedDB encrypted auto-sync)
    /** @deprecated Physical file download deprecated. Submissions auto-sync via encrypted client IndexedDB */
    encryptedPayloadUploaded: { type: Boolean, default: false },
    /** @deprecated Legacy .eirf file name if uploaded */
    payloadFileName: String,
    /** @deprecated Legacy Cloudinary payload URL if uploaded */
    payloadUrl: String,
    /** @deprecated Snapshot from legacy physical .eirf file */
    decryptedPayloadSnapshot: mongoose.Schema.Types.Mixed,
    verificationStatus: { type: String, enum: ['TELEMETRY_VERIFIED', 'VERIFIED_MATCH', 'DISCREPANCY_FLAGGED', 'PAYLOAD_MISSING', 'DECRYPTION_FAILED'], default: 'TELEMETRY_VERIFIED' },
    verificationDetails: {
        answersMatch: Boolean,
        clientHashMatch: Boolean,
        discrepancies: [String]
    },
    
    // Status & Life Cycle
    status: { type: String, enum: ['pending_review', 'approved', 'rejected', 'expired'], default: 'pending_review' },
    adminRemarks: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
    filedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    reviewedAt: Date,
    reviewedBy: String,
    emailsSent: {
        approved: { type: Boolean, default: false },
        approvedAt: { type: Date, default: null },
        rejected: { type: Boolean, default: false },
        rejectedAt: { type: Date, default: null },
        lastTransport: { type: String, default: '' },
        lastMessageId: { type: String, default: '' },
        lastAttemptAt: { type: Date, default: null },
        lastAttemptType: { type: String, default: '' },
        lastError: { type: String, default: '' }
    }
}, { versionKey: false, timestamps: true });

const EIRFReportModel = mongoose.model('EIRFReport', EIRFReportSchema, 'eirf_reports');

module.exports = {
    EIRFReportSchema,
    EIRFReportModel
};
