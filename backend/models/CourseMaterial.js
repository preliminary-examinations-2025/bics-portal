const mongoose = require('mongoose');

const CourseMaterialSchema = new mongoose.Schema({
    section: String,
    title: String,
    fileUrl: String,
    createdAt: { type: Date, default: Date.now }
});

const CourseMaterialModel = mongoose.model('CourseMaterial', CourseMaterialSchema);

module.exports = {
    CourseMaterialSchema,
    CourseMaterialModel
};
