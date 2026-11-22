const mongoose = require('mongoose');

const ServerOutageIncidentSchema = new mongoose.Schema({
    instanceId: { type: String, default: 'primary', index: true },
    outageStart: { type: Date, required: true },
    outageEnd: { type: Date, required: true, index: true },
    durationSeconds: { type: Number, required: true },
    cause: {
        type: String,
        enum: ['server_reboot', 'db_connection_loss', 'db_timeout', 'sigterm_deploy', 'heartbeat_gap', 'unknown'],
        default: 'heartbeat_gap',
        index: true
    },
    isGraceful: { type: Boolean, default: false }, // true for planned deployment shutdowns via SIGTERM
    affectedSubmissionsCount: { type: Number, default: 0 },
    affectedCandidateIds: [{ type: String }],
    notes: { type: String }
}, { timestamps: true, versionKey: false });

// Compound index for querying outages overlapping specific time ranges
ServerOutageIncidentSchema.index({ outageStart: -1, outageEnd: -1 });

// 365-Day Long-Term Institutional Audit Retention TTL
ServerOutageIncidentSchema.index({ outageStart: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const ServerOutageIncidentModel = mongoose.model('ServerOutageIncident', ServerOutageIncidentSchema, 'serveroutageincidents');

module.exports = {
    ServerOutageIncidentSchema,
    ServerOutageIncidentModel
};
