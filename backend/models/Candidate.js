const mongoose = require('mongoose');

const CandidateSchema = new mongoose.Schema({
    studentId: { type: String, unique: true },
    name: String,
    username: { type: String, unique: true },
    password: { type: String },
    eligible: { type: Boolean, default: false },
    signedConsent: { type: Boolean, default: false },
    midSemConsentSigned: { type: Boolean, default: false },
    endSemConsentSigned: { type: Boolean, default: false },
    registrationSubmitted: { type: Boolean, default: false },
    registrationStatus: { type: String, default: 'Pending' }, // 'Pending', 'Approved', 'Rejected'
    registeredCourses: [String],
    registrationData: {
        preferredName: String,
        dob: String,
        permanentAddress: String,
        localAddress: String,
        billingAddress: String,
        emergencyContact: {
            name: String,
            relationship: String,
            address: String,
            phone: String
        },
        personalPhone: String,
        personalEmail: String,
        collegeEmail: String,
        photoUrl: String,
        signatureUrl: String,
        undertakingUrl: String
    },
    midSemFeedback: { type: Map, of: [String], default: {} },
    endSemFeedback: { type: Map, of: [String], default: {} },
    midSemLedgerUrl: { type: String, default: '' },
    endSemLedgerUrl: { type: String, default: '' },
    exitFormSubmitted: { type: Boolean, default: false },
    exitAnswers: { type: Map, of: String, default: {} },
    verificationCode: { type: String, default: '' },
    verificationCodeExpires: { type: Date },
    verificationAttempts: { type: Number, default: 0 },
    lastVerificationCodeSentAt: { type: Date },
    midSemEmailVerified: { type: Boolean, default: false },
    endSemEmailVerified: { type: Boolean, default: false },
    lectureProgress: {
        type: Map,
        of: new mongoose.Schema({
            currentTime: { type: Number, default: 0 },
            duration: { type: Number, default: 0 },
            percent: { type: Number, default: 0 },
            watchedSeconds: { type: Number, default: 0 },
            completed: { type: Boolean, default: false },
            lastWatchedAt: { type: Date, default: Date.now },
            personalNotes: { type: String, default: '' },
            chatHistory: [{
                role: { type: String, enum: ['user', 'assistant'] },
                content: { type: String, default: '' },
                timestamp: { type: Date, default: Date.now },
                provider: { type: String, default: 'BICS Cortex' },
                isError: { type: Boolean, default: false }
            }]
        }, { _id: false }),
        default: {}
    },
    kataProfile: {
        handle: { type: String, sparse: true, index: true },
        registeredAt: { type: Date },
        shinRating: { type: Number, default: 1200 },
        shinMaxRating: { type: Number, default: 1200 },
        shinRank: { type: String, default: 'Apprentice' },
        shinMaxRank: { type: String, default: 'Apprentice' },
        formaRating: { type: Number, default: 1200 },
        formaMaxRating: { type: Number, default: 1200 },
        formaRank: { type: String, default: 'Apprentice' },
        formaMaxRank: { type: String, default: 'Apprentice' },
        contestsLive: { type: Number, default: 0 },
        contestsVirtual: { type: Number, default: 0 },
        contribution: { type: Number, default: 0 },
        solvedStats: {
            easy: { type: Number, default: 0 },
            medium: { type: Number, default: 0 },
            hard: { type: Number, default: 0 },
            boss: { type: Number, default: 0 },
            shinSolved: { type: Number, default: 0 },
            formaSolved: { type: Number, default: 0 }
        },
        contestHistory: [{
            contestId: String,
            contestTitle: String,
            track: { type: String, enum: ['shin', 'forma'] },
            date: { type: Date, default: Date.now },
            rank: Number,
            oldRating: Number,
            newRating: Number,
            delta: Number,
            isRated: { type: Boolean, default: true }
        }],
        submissionHeatmap: { type: Map, of: Number, default: {} },
        streak: {
            current: { type: Number, default: 0 },
            longest: { type: Number, default: 0 },
            lastSubmissionDate: Date
        }
    },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    lastLoginUserAgent: { type: String },
    loginCount: { type: Number, default: 0 },
    lastWorkspaceAccessAt: { type: Date },
    lastWorkspaceIp: { type: String },

    // TA Evaluation Normalized Marks (Concealed from candidate, used for TA evaluation in admin marks-ledger)
    taNormalizedContestMarks: {
        type: new mongoose.Schema({
            shin: [{
                contestId: { type: String, required: true },
                contestTitle: { type: String, default: '' },
                date: { type: Date, default: Date.now },
                totalNormalizedScore: { type: Number, default: 0 }, // Sum of 1s (e.g. 3)
                maxPossibleScore: { type: Number, default: 5 },
                normalizedPercentage: { type: Number, default: 0 },
                questions: [{
                    letter: { type: String, required: true },
                    isSolved: { type: Boolean, default: false },
                    marksAwarded: { type: Number, default: 0 },
                    maxScore: { type: Number, default: 1 },
                    normalizedScore: { type: Number, default: 0 } // 1 for solved, 0 for incorrect/unanswered
                }]
            }],
            forma: [{
                contestId: { type: String, required: true },
                contestTitle: { type: String, default: '' },
                date: { type: Date, default: Date.now },
                totalNormalizedScore: { type: Number, default: 0 }, // Sum of m/max_score
                maxPossibleScore: { type: Number, default: 5 },
                normalizedPercentage: { type: Number, default: 0 },
                questions: [{
                    letter: { type: String, required: true },
                    marksAwarded: { type: Number, default: 0 },
                    maxScore: { type: Number, default: 100 },
                    normalizedScore: { type: Number, default: 0 } // m / max_score
                }]
            }]
        }, { _id: false }),
        select: false,
        default: () => ({ shin: [], forma: [] })
    }
});

// Automatically redact sensitive credentials and internal TA marks from JSON and Object serialization
CandidateSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.verificationCode;
        delete ret.taNormalizedContestMarks; // strictly internal for TA evaluation
        return ret;
    }
});

CandidateSchema.set('toObject', {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.verificationCode;
        delete ret.taNormalizedContestMarks; // strictly internal for TA evaluation
        return ret;
    }
});

const CandidateModel = mongoose.model('Candidate', CandidateSchema);

module.exports = {
    CandidateSchema,
    CandidateModel
};
