const mongoose = require('mongoose');

const WorkerLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    lectureId: { type: String, default: '' },
    lectureTitle: { type: String, default: '' },
    section: { type: String, default: '' },
    youtubeId: { type: String, default: '' },
    action: { type: String, required: true }, // 'STARTED', 'CHUNK_EXTRACTED', 'RETRYING', 'COMPLETED', 'FAILED_FLAGGED', 'IDLE', 'ADMIN_RETRY'
    chunkIndex: { type: Number, default: 0 },
    totalChunks: { type: Number, default: 0 },
    attempt: { type: Number, default: 1 },
    status: { type: String, default: 'info' }, // 'info', 'warning', 'error', 'success'
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { versionKey: false, timestamps: true });

// Index for fast log retrieval and capped-style performance
WorkerLogSchema.index({ timestamp: -1 });

const WorkerLogModel = mongoose.model('WorkerLog', WorkerLogSchema, 'workerlogs');

module.exports = {
    WorkerLogSchema,
    WorkerLogModel
};
