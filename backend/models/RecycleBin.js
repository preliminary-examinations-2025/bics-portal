const mongoose = require('mongoose');

const RecycleBinSchema = new mongoose.Schema({
    entityType: { type: String, required: true }, // 'TestConfig', 'TestSubmission', etc.
    entityId: { type: String, required: true },
    title: String,
    code: String,
    deletedBy: { type: String, default: 'admin' },
    deletedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }, // 24 hours from deletedAt
    cascadeCount: { type: Number, default: 0 },
    cascadeDetails: mongoose.Schema.Types.Mixed,
    snapshot: mongoose.Schema.Types.Mixed
});
RecycleBinSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL Index

const RecycleBinModel = mongoose.model('RecycleBinV2', RecycleBinSchema, 'recycle_bin_v2');

module.exports = {
    RecycleBinSchema,
    RecycleBinModel
};
