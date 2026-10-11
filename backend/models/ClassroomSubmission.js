const mongoose = require('mongoose');

const ClassroomSubmissionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: String,
    courseCode: { type: String, required: true },
    courseName: String,
    title: { type: String, required: true },
    type: { type: String, enum: ['assignment', 'practical', 'class_test'], required: true },
    submissionDate: { type: Date },
    dueDate: { type: Date },
    status: { type: String, enum: ['on_time', 'late', 'pending', 'excused'], default: 'pending' },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    classroomLink: String
}, { versionKey: false });

const ClassroomSubmissionModel = mongoose.model('ClassroomSubmission', ClassroomSubmissionSchema, 'classroom_submissions');

module.exports = {
    ClassroomSubmissionSchema,
    ClassroomSubmissionModel
};
