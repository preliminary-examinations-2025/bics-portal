const mongoose = require('mongoose');

const TestTokenSchema = new mongoose.Schema({
    token: { type: String, unique: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    createdAt: { type: Date, default: Date.now, expires: 120 }
});

const TestTokenModel = mongoose.model('TestToken', TestTokenSchema, 'testtokens');

module.exports = {
    TestTokenSchema,
    TestTokenModel
};
