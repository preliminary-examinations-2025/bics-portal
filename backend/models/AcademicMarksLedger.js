const mongoose = require('mongoose');

const AcademicMarksLedgerSchema = new mongoose.Schema({
    courseCode: { type: String, required: true, unique: true },
    courseName: { type: String, required: true },
    courseType: { type: String, enum: ['theory', 'lab'], required: true },
    linkedOnlineTestId: { type: String, default: '' },
    linkedMstOnlineTestId: { type: String, default: '' },
    linkedEseOnlineTestId: { type: String, default: '' },
    linkedOnlineTestIds: {
        mstQuiz1: { type: String, default: '' },
        eseQuiz1: { type: String, default: '' },
        labQuiz1: { type: String, default: '' },
        mstOnline: { type: String, default: '' },
        eseOnline: { type: String, default: '' }
    },
    configuredKataContests: { type: [String], default: [] },
    isLocked: { type: Boolean, default: false },
    lockedAt: Date,
    lockedBy: String,
    studentMarks: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true },
        rollNo: String,
        
        // Granular Theory Components
        theoryAssignments: {
            a1: { type: Number, default: 0 },
            a2: { type: Number, default: 0 },
            a3: { type: Number, default: 0 },
            a4: { type: Number, default: 0 },
            a5: { type: Number, default: 0 }
        },
        theoryClassTests: {
            ct1: { type: Number, default: 0 },
            ct2: { type: Number, default: 0 },
            ct3: { type: Number, default: 0 },
            ct4: { type: Number, default: 0 },
            ct5: { type: Number, default: 0 }
        },
        theoryQuizzes: {
            mstQuiz1: { type: Number, default: 0 },
            mstQuiz2: { type: Number, default: 0 },
            mstQuiz3: { type: Number, default: 0 },
            eseQuiz1: { type: Number, default: 0 },
            eseQuiz2: { type: Number, default: 0 },
            eseQuiz3: { type: Number, default: 0 }
        },
        theoryProject: { type: Number, default: 0 },

        // Granular Lab Components
        labPracticals: {
            p1: { type: Number, default: 0 },
            p2: { type: Number, default: 0 },
            p3: { type: Number, default: 0 },
            p4: { type: Number, default: 0 },
            p5: { type: Number, default: 0 },
            p6: { type: Number, default: 0 },
            p7: { type: Number, default: 0 },
            p8: { type: Number, default: 0 },
            p9: { type: Number, default: 0 },
            p10: { type: Number, default: 0 }
        },
        labKataContests: [{
            contestId: { type: String, default: '' },
            normalizedScore: { type: Number, default: 0 },
            scaledMark: { type: Number, default: 0 }
        }],
        labQuizzes: {
            quiz1: { type: Number, default: 0 },
            quiz2: { type: Number, default: 0 }
        },
        labProject: { type: Number, default: 0 },
        
        // TA Summary / Scaled Components (legacy & computed)
        taAssignment: { type: Number, default: 0 },
        taClassTest: { type: Number, default: 0 },
        taQuiz: { type: Number, default: 0 },
        taIdeation: { type: Number, default: 0 },
        
        taPracticalEval: { type: Number, default: 0 },
        taKata: { type: Number, default: 0 },
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
