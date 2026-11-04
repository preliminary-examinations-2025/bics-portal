const mongoose = require('mongoose');

const TestTokenSchema = new mongoose.Schema({
    token: { type: String, unique: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    isUsed: { type: Boolean, default: false },
    sessionSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSubmission' },
    createdAt: { type: Date, default: Date.now, expires: 14400 }
});

const TestTokenModel = mongoose.model('TestToken', TestTokenSchema, 'testtokens');

module.exports = {
    TestTokenSchema,
    TestTokenModel
};
