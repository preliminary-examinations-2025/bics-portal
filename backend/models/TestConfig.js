const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    id: String,
    type: String, // 'mcq', 'coding', or 'web'
    title: String, // Standardized short title / summary for all question types
    description: String, // Standardized full description / problem statement for all question types
    points: Number,
    section: String,
    grantBonusToAll: { type: Boolean, default: false },
    // MCQ
    options: [String],
    correctOptionIndex: Number,
    isMultiChoice: { type: Boolean, default: false },
    // Coding
    initialTemplate: String,
    language: String,
    timeLimitMs: { type: Number, default: 2000 },
    memoryLimitMb: { type: Number, default: 128 },
    testCases: [{ input: String, output: String, isSample: { type: Boolean, default: false }, points: { type: Number, default: 10 } }],
    // Web Coding (HTML/CSS/JS)
    initialHtml: String,
    initialCss: String,
    initialJs: String,
    imageUrl: String
}, { _id: false, strict: false, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Backward-compatibility virtual getters for legacy references
QuestionSchema.virtual('questionText').get(function() {
    return this.description || this.title || '';
});
QuestionSchema.virtual('question').get(function() {
    return this.description || this.title || '';
});
QuestionSchema.virtual('statement').get(function() {
    return this.description || this.title || '';
});

const TestConfigSchema = new mongoose.Schema({
    title: String,
    course: { type: String, default: '' }, // Academic course name (e.g. "Programming Fundamentals with C++ Lab")
    courseCode: { type: String, default: '' }, // Academic course code (e.g. "R526CS02L")
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
