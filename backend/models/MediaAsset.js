const mongoose = require('mongoose');

const MediaAssetSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'raw', 'pdf'], default: 'image' },
    fileSize: { type: Number, required: true },
    cdnUrl: { type: String, required: true },
    proxyUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    folder: { type: String, default: 'drive' },
    tags: [{ type: String }],
    uploadedBy: { type: String, default: 'admin' },
    isDeleted: { type: Boolean, default: false }
}, {
    timestamps: true
});

MediaAssetSchema.index({ resourceType: 1, createdAt: -1 });
MediaAssetSchema.index({ filename: 'text', originalName: 'text' });
MediaAssetSchema.index({ isDeleted: 1, createdAt: -1 });

const MediaAssetModel = mongoose.model('MediaAsset', MediaAssetSchema, 'media_assets');

module.exports = {
    MediaAssetSchema,
    MediaAssetModel
};
