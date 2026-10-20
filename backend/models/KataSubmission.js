const mongoose = require('mongoose');

const KataSubmissionSchema = new mongoose.Schema({
    submissionId: {
        type: String,
        index: true
    },
    contestId: { 
        type: String, 
        required: true, 
        index: true 
    },
    problemLetter: { 
        type: String, 
        enum: ['A', 'B', 'C', 'D', 'E'], 
        required: true,
        index: true 
    },
    candidateId: { 
        type: String, 
        required: true,
        index: true 
    },
    username: { 
        type: String, 
        required: true, 
        index: true 
    },
    language: { 
        type: String, 
        default: 'cpp' 
    },
    code: { 
        type: String, 
        required: true 
    },
    verdict: { 
        type: String, 
        default: 'In queue' 
    },
    testPassed: { 
        type: Number, 
        default: 0 
    },
    totalTests: { 
        type: Number, 
        default: 0 
    },
    timeUsedMs: { 
        type: Number, 
        default: 0 
    },
    memoryUsedKb: { 
        type: Number, 
        default: 0 
    },
    pointsAwarded: { 
        type: Number, 
        default: 0 
    },
    compileOutput: { 
        type: String, 
        default: '' 
    },
    track: {
        type: String,
        enum: ['shin', 'forma'],
        default: 'shin',
        index: true
    },
    isLiveSubmission: {
        type: Boolean,
        default: true
    },
    isVirtual: {
        type: Boolean,
        default: false,
        index: true
    },
    isSuperseded: {
        type: Boolean,
        default: false,
        index: true
    },
    isLatest: {
        type: Boolean,
        default: true,
        index: true
    },
    // KataForma AI Grading via Gemini Direct API
    aiEvaluation: {
        ratedAt: Date,
        ratingScore: { type: Number, default: 0 },
        feedback: { type: String, default: '' },
        modelUsed: { type: String, default: '' },
        status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
    },
    // KataShin AI Plagiarism Detection (> 60% flags for admin review)
    plagiarismScore: {
        type: Number,
        default: 0
    },
    isPlagiarized: {
        type: Boolean,
        default: false,
        index: true
    },
    flaggedForAdminReview: {
        type: Boolean,
        default: false,
        index: true
    },
    plagiarismReasoning: {
        type: String,
        default: ''
    },
    plagiarismChecked: {
        type: Boolean,
        default: false,
        index: true
    },
    adminReviewed: {
        type: Boolean,
        default: false,
        index: true
    },
    adminVerdict: {
        type: String,
        enum: ['none', 'plagiarism', 'correct', 'overridden'],
        default: 'none'
    },
    adminOverriddenScore: {
        type: Number,
        default: null
    },
    adminReviewedAt: {
        type: Date
    },
    adminReviewedBy: {
        type: String,
        default: ''
    },
    submittedAt: { 
        type: Date, 
        default: Date.now,
        index: true
    }
});

const KataSubmissionModel = mongoose.model('KataSubmission', KataSubmissionSchema);

module.exports = {
    KataSubmissionSchema,
    KataSubmissionModel
};

