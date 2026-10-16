const mongoose = require('mongoose');

const ChatMessageSubSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    provider: { type: String, default: 'BICS Cortex' },
    isError: { type: Boolean, default: false }
}, { _id: false });

const LectureChatSchema = new mongoose.Schema({
    lectureId: { type: String, required: true, index: true },
    youtubeId: { type: String, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: '' },
    messages: [ChatMessageSubSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Composite index for fast lookups per lecture and student
LectureChatSchema.index({ lectureId: 1, studentId: 1 });
LectureChatSchema.index({ youtubeId: 1, studentId: 1 });

const LectureChatModel = mongoose.models.LectureChat || mongoose.model('LectureChat', LectureChatSchema);

module.exports = {
    LectureChatSchema,
    LectureChatModel,
    ChatMessageSubSchema
};
