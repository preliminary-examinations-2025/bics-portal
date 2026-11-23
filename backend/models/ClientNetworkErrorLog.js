const mongoose = require('mongoose');

const ClientNetworkErrorEntrySchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    clientMonotonic: { type: Number }, // performance.now() at time of client failure
    epochMs: { type: Number, required: true },
    endpoint: { type: String, required: true }, // e.g. /api/tests/heartbeat/:subId, /api/tests/draft/:subId
    method: { type: String, default: 'POST' },
    httpStatus: { type: Number, default: null }, // e.g. 500, 502, 503, 504, 429, 409, 403, 400 (NEVER 2xx!)
    errorType: {
        type: String,
        enum: ['HTTP_5XX', 'HTTP_4XX', 'TIMEOUT', 'FETCH_FAILED', 'ABORTED', 'DNS_REFUSED'],
        required: true
    },
    durationMs: { type: Number, default: 0 }, // request latency before failure/timeout
    responseSnippet: { type: String, default: '' }, // First 300 chars of server response body / error text (scrubbed)
    networkQualityAtTime: { type: String, default: 'fair' }, // 'good', 'fair', 'poor', 'disconnected'
    isServerReject: { type: Boolean, default: false }, // True if status is 429, 500, 502, 503, 504 (server responded with refusal)
    canaryProbe: {
        type: String,
        enum: ['GSTATIC_REACHABLE', 'GSTATIC_UNREACHABLE', 'CLOUDFLARE_REACHABLE', 'UNCHECKED'],
        default: 'UNCHECKED'
    } // Result of gstatic.com/generate_204 probe at failure time
}, { _id: false });

const ClientNetworkErrorLogSchema = new mongoose.Schema({
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSubmissionV3', required: true, index: true },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfig', index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', index: true },
    studentId: { type: String, index: true },

    // Summary Metrics
    totalErrorsCount: { type: Number, default: 0 },
    errors5xxCount: { type: Number, default: 0 },
    errors4xxCount: { type: Number, default: 0 },
    timeoutCount: { type: Number, default: 0 },
    hasServerRejections: { type: Boolean, default: false },

    // Evaluated Server Rejection Windows
    serverRejectIntervals: [{
        start: { type: Date },
        end: { type: Date },
        durationSeconds: { type: Number },
        statusCodes: [{ type: Number }],
        endpoints: [{ type: String }],
        reason: { type: String }
    }],

    // Chronological Log Entries (strictly non-2xx)
    entries: [ClientNetworkErrorEntrySchema],

    lastReportedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });

// Fast compound lookup indexes for admin review and EIRF evaluation
ClientNetworkErrorLogSchema.index({ submissionId: 1, lastReportedAt: -1 });
ClientNetworkErrorLogSchema.index({ studentId: 1, errors5xxCount: -1 });

// 30-Day TTL expiration
ClientNetworkErrorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const ClientNetworkErrorLogModel = mongoose.model(
    'ClientNetworkErrorLog',
    ClientNetworkErrorLogSchema,
    'clientnetworkerrorlogs'
);

module.exports = {
    ClientNetworkErrorEntrySchema,
    ClientNetworkErrorLogSchema,
    ClientNetworkErrorLogModel
};
