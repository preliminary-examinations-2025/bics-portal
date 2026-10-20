const mongoose = require('mongoose');

const KataQuestionBankSchema = new mongoose.Schema({
    track: { 
        type: String, 
        enum: ['shin', 'forma'], 
        required: true, 
        index: true 
    },
    letter: { 
        type: String, 
        enum: ['A', 'B', 'C', 'D', 'E'], 
        required: true, 
        index: true 
    },
    title: { 
        type: String, 
        required: true 
    },
    timeLimit: { 
        type: Number, 
        default: 1.0 // seconds
    },
    memoryLimit: { 
        type: Number, 
        default: 256 // MB
    },
    statementHtml: { 
        type: String, 
        required: true 
    },
    inputFormat: { 
        type: String, 
        default: '' 
    },
    outputFormat: { 
        type: String, 
        default: '' 
    },
    sampleInput: { 
        type: String, 
        required: true 
    },
    sampleOutput: { 
        type: String, 
        required: true 
    },
    note: { 
        type: String, 
        default: '' 
    },
    // Hidden test cases are strictly evaluated on server side and excluded from candidate-facing queries
    hiddenTestCases: [{
        input: { type: String, required: true },
        output: { type: String, required: true }
    }],
    points: { 
        type: Number, 
        required: true 
    },
    tags: [{ 
        type: String 
    }],
    difficulty: { 
        type: String, 
        default: 'Easy' 
    },
    // Single-Appearance Rule: questions that have appeared in any contest are excluded from future contest generation
    hasAppearedInContest: {
        type: Boolean,
        default: false,
        index: true
    },
    appearedInContests: [{
        type: String // contestIds (e.g. 'SHIN01', 'FORMA02')
    }],
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

const KataQuestionBankModel = mongoose.model('KataQuestionBank', KataQuestionBankSchema);

module.exports = {
    KataQuestionBankSchema,
    KataQuestionBankModel
};
