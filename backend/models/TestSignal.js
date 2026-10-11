const mongoose = require('mongoose');

const TestSignalSchema = new mongoose.Schema({
    submissionId: { type: String, index: true },
    sender: String, // 'candidate' or 'admin'
    type: String, // 'sdp' or 'ice'
    data: String, // SDP string or ICE candidate JSON string
    createdAt: { type: Date, default: Date.now, expires: 180 } // 3 minutes expiry
}, { versionKey: false });

const TestSignalModel = mongoose.model('TestSignal', TestSignalSchema, 'testsignals');

module.exports = {
    TestSignalSchema,
    TestSignalModel
};
