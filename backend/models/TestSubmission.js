const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
    questionId: String,
    type: String, // 'mcq', 'coding', or 'web'
    selectedOptionIndex: Number, // for MCQ
    submittedCode: String, // for Coding (C++)
    selectedLanguage: String, // Selected programming language (c, cpp, python, java)
    submittedHtml: String, // for Web Coding (HTML)
    submittedCss: String, // for Web Coding (CSS)
    submittedJs: String, // for Web Coding (JS)
    score: { type: Number, default: 0 }, // Scored marks for this question
    isObjectionResolved: { type: Boolean, default: false },
    isManuallyGraded: { type: Boolean, default: false },
    testCaseResults: [{
        status: String,
        points: Number,
        scoredPoints: Number,
        actualOutput: String,
        expectedOutput: String,
        input: String
    }]
}, { _id: false });

const TestSubmissionSchema = new mongoose.Schema({
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    candidateName: String,
    studentId: String,
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    testTitle: String,
    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    status: { type: String, default: 'started' }, // 'started', 'submitted', 'auto-submitted', 'evaluated'
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    restoreToken: String,
    proctoringLog: {
        fullscreenExits: { type: Number, default: 0 },
        tabSwitches: { type: Number, default: 0 },
        webcamStatus: { type: String, default: 'active' },
        events: [{
            timestamp: { type: Date, default: Date.now },
            startTime: Date,
            endTime: Date,
            durationSeconds: { type: Number, default: 0 },
            type: { type: String }, // "TAB_SWITCH", "FULLSCREEN_EXIT", "WEBCAM_LOST", "MIC_MUTED", "MIC_UNMUTED", "CAM_GRANTED", "CAM_DENIED", "NETWORK_OFFLINE", "EMERGENCY_SUBMISSION"
            details: String
        }]
    },
    hasEirfFlag: { type: Boolean, default: false },
    eirfStatus: { type: String, enum: ['none', 'pending', 'verified', 'discrepancy', 'expired', 'approved', 'rejected'], default: 'none' },
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
        status: { type: String, default: 'pending' },
        raisedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
        adminRemarks: String,
        resolutionNote: String,
        resolvedMarks: Number,
        resolvedAt: Date
    }]
});

const TestSubmissionModel = mongoose.model('TestSubmissionV3', TestSubmissionSchema, 'testsubmissions_v3');

module.exports = {
    AnswerSchema,
    TestSubmissionSchema,
    TestSubmissionModel
};
