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
    }
});

// Automatically redact sensitive credentials from JSON and Object serialization
CandidateSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.verificationCode;
        return ret;
    }
});

CandidateSchema.set('toObject', {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.verificationCode;
        return ret;
    }
});

const CandidateModel = mongoose.model('Candidate', CandidateSchema);

module.exports = {
    CandidateSchema,
    CandidateModel
};
