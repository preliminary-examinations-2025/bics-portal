const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
    questionId: String,
    type: String, // 'mcq', 'mcc', 'scc', 'coding', or 'web'
    selectedOptionIndex: mongoose.Schema.Types.Mixed, // allows Number for MCQ or Array/null for MCC
    selectedOptionIndices: [{ type: Number }], // for MCC (multi-choice multi-correct)
    submittedCode: String, // for Coding (C++)
    selectedLanguage: String, // Selected programming language (c, cpp, python, java)
    submittedHtml: String, // for Web Coding (HTML)
    submittedCss: String, // for Web Coding (CSS)
    submittedJs: String, // for Web Coding (JS)
    isSavedByUser: { type: Boolean, default: false },
    score: { type: Number, default: 0 }, // Active / latest score updated by admin
    initialScore: { type: Number, default: null }, // First assigned marks (locked)
    isObjected: { type: Boolean, default: false }, // Whether an objection was raised
    scoreAfterObjection: { type: Number, default: null }, // Marks after objection resolution
    isObjectionResolved: { type: Boolean, default: false },
    isManuallyGraded: { type: Boolean, default: false },
    testCaseResults: [{
        testCaseIndex: Number,
        status: String,
        points: Number,
        scoredPoints: Number,
        actualOutput: String,
        expectedOutput: String,
        input: String,
        isSample: Boolean,
        executionTimeMs: Number,
        memoryUsedKb: Number
    }],
    compileError: String,
    consoleTab: String,
    rawResults: mongoose.Schema.Types.Mixed,
    aiEvaluation: {
        isEvaluated: { type: Boolean, default: false },
        status: { 
            type: String, 
            enum: ['pending', 'evaluating', 'completed', 'failed', 'skipped'], 
            default: 'pending' 
        },
        evaluatedAt: { type: Date },
        modelUsed: { type: String, default: '' },
        score: { type: Number, default: 0 },
        maxScore: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        feedback: { type: String, default: '' },
        codeHash: { type: String, default: '' },
        retries: { type: Number, default: 0 },
        error: { type: String, default: '' }
    }
}, { _id: false });

const TestSubmissionSchema = new mongoose.Schema({
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    candidateName: String,
    studentId: String,
    submissionRefId: { type: String, unique: true, sparse: true, index: true }, // Unique 12-digit numeric reference ID
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    testTitle: String,
    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    lastHeartbeatAt: { type: Date, default: Date.now },
    status: { type: String, default: 'started' }, // 'started', 'submitted', 'auto-submitted', 'evaluated'
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    restoreToken: String,
    proctoringLog: {
        fullscreenExits: { type: Number, default: 0 },
        tabSwitches: { type: Number, default: 0 },
        inspectAttempts: { type: Number, default: 0 },
        clipboardAttempts: { type: Number, default: 0 },
        webcamStatus: { type: String, default: 'active' },
        events: [{
            timestamp: { type: Date, default: Date.now },
            startTime: Date,
            endTime: Date,
            durationSeconds: { type: Number, default: 0 },
            type: { type: String }, // "TAB_SWITCH", "FULLSCREEN_EXIT", "WEBCAM_LOST", "MIC_MUTED", "MIC_UNMUTED", "CAM_GRANTED", "CAM_DENIED", "NETWORK_OFFLINE", "EMERGENCY_SUBMISSION", "VOICE_DETECTED", "PROCTOR_WARNING"
            details: String
        }],
        snapshots: [{
            timestamp: { type: Date, default: Date.now },
            type: { type: String },
            url: String,
            details: String
        }]
    },
    baselinePhotoUrl: { type: String, default: '' },
    biometricResult: {
        similarityScore: { type: Number, default: null },
        decision: { type: String, default: 'not-evaluated' },
        reviewNeeded: { type: Boolean, default: false },
        livenessPassed: { type: Boolean, default: false },
        livenessScore: { type: Number, default: null },
        challengeId: { type: String, default: '' },
        challengeType: { type: String, default: '' },
        voiceStatus: { type: String, default: 'passed' },
        referencePhotoUrl: { type: String, default: '' },
        verifiedPhotoUrl: { type: String, default: '' },
        evaluatedAt: { type: Date }
    },
    securityMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    hasEirfFlag: { type: Boolean, default: false },
    eirfStatus: { type: String, enum: ['none', 'pending', 'verified', 'discrepancy', 'expired', 'approved', 'rejected'], default: 'none' },
    flaggedReasons: [String],
    pipelineStatus: { 
        type: String, 
        enum: [
            'QUEUED',
            'CLEARED',
            'FLAGGED',
            'GENERATING_QUESTIONS',
            'QUESTIONS_GENERATED',
            'SENDING_INVITE_EMAIL',
            'AWAITING_EIRF',
            'EIRF_SUBMITTED',
            'SENDING_CONFIRMATION_EMAIL',
            'UNDER_REVIEW',
            'EXPIRED',
            'FAILED',
            'VERDICT_ISSUED'
        ], 
        default: 'QUEUED',
        index: true 
    },
    pipelineLock: {
        isLocked: { type: Boolean, default: false },
        lockedAt: { type: Date, default: null },
        workerId: { type: String, default: null }
    },
    pipelineHistory: [{
        step: { type: String, required: true },
        status: { type: String, enum: ['STARTED', 'COMPLETED', 'FAILED', 'RETRY'], required: true },
        timestamp: { type: Date, default: Date.now },
        durationMs: { type: Number, default: 0 },
        details: { type: mongoose.Schema.Types.Mixed },
        error: { type: String }
    }],
    generatedQuestions: [{
        questionId: { type: String, required: true },
        questionType: { type: String, enum: ['TEXT', 'RADIO', 'CHECKBOX', 'FILE_UPLOAD'], default: 'TEXT' },
        category: { type: String, default: 'GENERAL' },
        questionText: { type: String, required: true },
        context: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        options: [{ type: String }],
        isRequired: { type: Boolean, default: true },
        required: { type: Boolean, default: true },
        requiresProof: { type: Boolean, default: false },
        proofGuidance: { type: String, default: '' }
    }],
    eirfToken: { type: String, index: true },
    eirfExpiresAt: { type: Date, index: true },
    pipelineRetries: { type: Number, default: 0 },
    lastPipelineError: { type: String, default: null },
    submissionReason: { type: String, default: 'manual' },
    /** @deprecated Superseded by direct client IndexedDB & server submission payload. Physical payload downloads deprecated. */
    encryptedDbPayload: { type: String, default: '' },
    answers: [AnswerSchema],
    evaluation: {
        mcqScore: { type: Number, default: 0 },
        codingScore: { type: Number, default: 0 },
        feedback: { type: String, default: '' },
        evaluatedAt: Date
    },
    reevaluation: {
        applied: { type: Boolean, default: false },
        appliedAt: Date,
        complaintText: String,
        complainedQuestions: [String],
        proofImages: [String],
        status: { type: String, default: 'pending' }, // 'pending', 'resolved', 'rejected'
        resolutionFeedback: String
    },
    objections: [{
        objectionId: String,
        questionId: String,
        questionIndex: Number,
        reason: String,
        details: String,
        attachments: [String],
        marksBefore: { type: Number, default: null }, // First assigned or pre-objection marks
        marksAfter: { type: Number, default: null }, // Marks after objection resolution
        marksDiff: { type: Number, default: 0 }, // marksAfter - marksBefore
        status: { type: String, default: 'pending' },
        raisedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
        adminRemarks: String,
        resolutionNote: String,
        resolvedMarks: Number,
        resolvedAt: Date
    }],
    emailsSent: {
        testSubmitted: { type: Boolean, default: false },
        testSubmittedAt: { type: Date, default: null },
        eirfFiling: { type: Boolean, default: false },
        eirfFilingAt: { type: Date, default: null },
        eirfApproved: { type: Boolean, default: false },
        eirfApprovedAt: { type: Date, default: null },
        eirfRejected: { type: Boolean, default: false },
        eirfRejectedAt: { type: Date, default: null },
        otrfSent: { type: Boolean, default: false },
        otrfSentAt: { type: Date, default: null }
    }
});

// Single-attempt compound unique index (prevents parallel double-attempt race conditions)
TestSubmissionSchema.index(
    { candidateId: 1, testId: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false, candidateId: { $type: "objectId" } } }
);

// High-speed index for dead-man's switch reaper worker
TestSubmissionSchema.index({ status: 1, lastHeartbeatAt: 1, isDeleted: 1 });

// High-speed index for EIRF sequential pipeline worker
TestSubmissionSchema.index({ pipelineStatus: 1, 'pipelineLock.isLocked': 1, isDeleted: 1 });

const TestSubmissionModel = mongoose.model('TestSubmissionV3', TestSubmissionSchema, 'testsubmissions_v3');

module.exports = {
    AnswerSchema,
    TestSubmissionSchema,
    TestSubmissionModel
};
