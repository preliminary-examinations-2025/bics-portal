const mongoose = require('mongoose');

const ExamAttendanceSchema = new mongoose.Schema({
    candidateId: { type: String, required: true },
    rollNo: { type: String, default: '' },
    studentName: { type: String, required: true },
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    examCategory: { 
        type: String, 
        enum: ['theory', 'online', 'written', 'practical'], 
        required: true 
    },
    examDate: { type: String, required: true }, // YYYY-MM-DD
    paperVariant: { type: String, default: 'Standard' },
    timestamp: { type: Date, default: Date.now },
    clientIp: { type: String, default: 'unknown' },
    userAgent: { type: String, default: 'unknown' },
    digitalSignature: { type: String, required: true },
    trackingCode: { type: String, required: true, index: true },
    status: { type: String, enum: ['VERIFIED', 'PRESENT'], default: 'VERIFIED' }
}, {
    timestamps: true,
    versionKey: false
});

// Idempotency: Unique per candidate, course, category, and exam date
ExamAttendanceSchema.index({ candidateId: 1, courseCode: 1, examCategory: 1, examDate: 1 }, { unique: true });
ExamAttendanceSchema.index({ courseCode: 1, examCategory: 1, examDate: 1 });

const ExamAttendanceModel = mongoose.model('ExamAttendance', ExamAttendanceSchema, 'exam_attendances');

module.exports = {
    ExamAttendanceSchema,
    ExamAttendanceModel
};
