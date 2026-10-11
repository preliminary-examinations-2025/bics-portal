const mongoose = require('mongoose');

const AcademicMarksLedgerSchema = new mongoose.Schema({
    courseCode: { type: String, required: true, unique: true },
    courseName: { type: String, required: true },
    courseType: { type: String, enum: ['theory', 'lab'], required: true },
    linkedOnlineTestId: { type: String, default: '' },
    linkedMstOnlineTestId: { type: String, default: '' },
    linkedEseOnlineTestId: { type: String, default: '' },
    isLocked: { type: Boolean, default: false },
    lockedAt: Date,
    lockedBy: String,
    studentMarks: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true },
        rollNo: String,
        
        // TA Components
        taAssignment: { type: Number, default: 0 },
        taClassTest: { type: Number, default: 0 },
        taQuiz: { type: Number, default: 0 },
        taIdeation: { type: Number, default: 0 },
        
        taPracticalEval: { type: Number, default: 0 },
        taLabQuiz: { type: Number, default: 0 },
        taProject: { type: Number, default: 0 },
        
        // MST Components
        mstWritten: { type: Number, default: 0 },
        mstWrittenStatus: { type: String, enum: ['approved', 'pending_approval', 'manual'], default: 'manual' },
        mstOnline: { type: Number, default: 0 },
        mstViva: { type: Number, default: 0 },
        
        // ESE Components
        eseWritten: { type: Number, default: 0 },
        eseWrittenStatus: { type: String, enum: ['approved', 'pending_approval', 'manual'], default: 'manual' },
        eseOnline: { type: Number, default: 0 },
        eseViva: { type: Number, default: 0 },
        
        // Computed Results
        totalTa: { type: Number, default: 0 },
        scaledMst: { type: Number, default: 0 },
        scaledEse: { type: Number, default: 0 },
        finalScore: { type: Number, default: 0 },
        grade: { type: String, default: 'FF' },
        gradePoint: { type: Number, default: 0 },
        status: { type: String, enum: ['PASS', 'FAIL'], default: 'FAIL' }
    }]
}, { versionKey: false, timestamps: true });

const AcademicMarksLedgerModel = mongoose.model('AcademicMarksLedger', AcademicMarksLedgerSchema, 'academic_marks_ledgers');

module.exports = {
    AcademicMarksLedgerSchema,
    AcademicMarksLedgerModel
};
