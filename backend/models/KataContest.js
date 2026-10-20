const mongoose = require('mongoose');

const KataContestSchema = new mongoose.Schema({
    contestId: { 
        type: String, 
        unique: true, 
        required: true, 
        uppercase: true,
        index: true
    },
    track: { 
        type: String, 
        enum: ['shin', 'forma'], 
        required: true,
        index: true
    },
    roundNumber: { 
        type: Number, 
        required: true 
    },
    title: { 
        type: String, 
        required: true 
    },
    writers: [{ 
        type: String 
    }],
    startTime: { 
        type: Date, 
        required: true,
        index: true
    },
    endTime: { 
        type: Date, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['scheduled', 'running', 'ended'], 
        default: 'scheduled',
        index: true
    },
    problems: [{
        letter: { 
            type: String, 
            enum: ['A', 'B', 'C', 'D', 'E'], 
            required: true 
        },
        questionId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'KataQuestionBank', 
            required: true 
        },
        points: { 
            type: Number, 
            required: true 
        },
        solvedCount: { 
            type: Number, 
            default: 0 
        }
    }],
    registeredCandidates: [{
        candidateId: { type: String, required: true },
        username: { type: String, required: true },
        email: { type: String },
        registeredAt: { type: Date, default: Date.now },
        startedAt: { type: Date },
        expiresAt: { type: Date },
        mode: { type: String, enum: ['individual', 'team'], default: 'individual' }
    }],
    virtualCandidates: [{
        candidateId: { type: String, required: true },
        username: { type: String, required: true },
        email: { type: String },
        registeredAt: { type: Date, default: Date.now },
        startedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
        mode: { type: String, default: 'virtual' }
    }],
    totalScore: { 
        type: Number, 
        default: 1500 
    },
    weekNumber: {
        type: Number,
        default: 1
    },
    isGymPublished: {
        type: Boolean,
        default: false,
        index: true
    },
    resultsPublished: {
        type: Boolean,
        default: false,
        index: true
    },
    auditStatus: {
        type: String,
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending',
        index: true
    },
    auditStartedAt: {
        type: Date
    },
    auditCompletedAt: {
        type: Date
    },
    ratingsCalculated: {
        type: Boolean,
        default: false,
        index: true
    },
    ratingsCalculatedAt: {
        type: Date
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

const KataContestModel = mongoose.model('KataContest', KataContestSchema);

module.exports = {
    KataContestSchema,
    KataContestModel
};
