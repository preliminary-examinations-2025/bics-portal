const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    actor: String,
    action: String,
    details: String,
    severity: { type: String, default: 'info' } // 'info', 'warning', 'error'
}, { versionKey: false });

const SystemLogModel = mongoose.model('SystemLog', SystemLogSchema, 'systemlogs');

module.exports = {
    SystemLogSchema,
    SystemLogModel
};
