const mongoose = require('mongoose');

const VideoLectureSchema = new mongoose.Schema({
    section: String,
    title: String,
    youtubeUrl: String,
    youtubeId: { type: String, index: true },
    durationSeconds: { type: Number, default: 0 },
    aiSummary: {
        synopsis: { type: String, default: '' },
        keyConcepts: [{ type: String }],
        detailedNotes: { type: String, default: '' },
        examTakeaways: [{ type: String }],
        generatedAt: { type: Date },
        provider: { type: String, default: '' } // 'groq', 'openrouter', or 'gemini'
    },
    createdAt: { type: Date, default: Date.now },
    hasPlayground: { type: Boolean, default: false },
    playgroundLanguage: { type: String, default: 'cpp' }, // 'cpp' or 'web'
    codeTemplate: { type: String, default: '' },
    webHtmlTemplate: { type: String, default: '' },
    webCssTemplate: { type: String, default: '' },
    webJsTemplate: { type: String, default: '' }
});

const VideoLectureModel = mongoose.model('VideoLecture', VideoLectureSchema);

module.exports = {
    VideoLectureSchema,
    VideoLectureModel
};
