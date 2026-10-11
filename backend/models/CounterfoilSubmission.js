const mongoose = require('mongoose');

const CounterfoilSubmissionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    courseCode: { type: String, required: true },
    courseName: { type: String, required: true },
    examType: { type: String, enum: ['midsem', 'endsem'], required: true },
    examinationName: { type: String, required: true },
    questionMarks: [{
        questionNo: Number,
        obtainedMarks: Number,
        maxMarks: Number
    }],
    totalObtained: Number,
    totalMax: Number,
    status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
    adminRemarks: String,
    submittedAt: { type: Date, default: Date.now },
    approvedAt: Date
}, { versionKey: false });

const CounterfoilSubmissionModel = mongoose.model('CounterfoilSubmission', CounterfoilSubmissionSchema, 'counterfoil_submissions');

module.exports = {
    CounterfoilSubmissionSchema,
    CounterfoilSubmissionModel
};
