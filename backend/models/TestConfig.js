const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    id: String,
    type: String, // 'mcq', 'coding', or 'web'
    title: String,
    questionText: String,
    question: String,
    statement: String,
    points: Number,
    section: String,
    // MCQ
    options: [String],
    correctOptionIndex: Number,
    isMultiChoice: { type: Boolean, default: false },
    // Coding
    description: String,
    initialTemplate: String,
    language: String,
    testCases: [{ input: String, output: String, isSample: { type: Boolean, default: false }, points: { type: Number, default: 10 } }],
    // Web Coding (HTML/CSS/JS)
    initialHtml: String,
    initialCss: String,
    initialJs: String,
    imageUrl: String
}, { _id: false, strict: false });

const TestConfigSchema = new mongoose.Schema({
    title: String,
    marks: Number,
    instructions: String,
    duration: Number, // in minutes
    startDate: Date,
    endDate: Date,
    questions: [QuestionSchema],
    answersReleased: { type: Boolean, default: false }, // Admin release toggle for answer sheets (legacy)
    verificationStatus: { type: String, enum: ['not_released', 'released', 'closed'], default: 'not_released' }, // 3-state verification status
    isPublished: { type: Boolean, default: false }, // Admin display/publish toggle for student visibility
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: String
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

const TestConfigModel = mongoose.model('TestConfigV2', TestConfigSchema, 'testconfigs_v2');

module.exports = {
    QuestionSchema,
    TestConfigSchema,
    TestConfigModel
};
