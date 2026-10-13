// Polyfill web DOM APIs for server-side PDF.js rendering compatibility in older Node.js versions
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        }
    };
}

if (typeof process.getBuiltinModule !== 'function') {
    const { createRequire } = require('module');
    const req = createRequire(__filename);
    process.getBuiltinModule = function(name) {
        return req(name);
    };
}

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { connectDB } = require('./config/db');
const { authorizeApiRequest } = require('./middleware/auth');
const { logSystemAction } = require('./utils/logger');

// Import modular domain routers
const authRouter = require('./routes/auth');
const candidatesRouter = require('./routes/candidates');
const courseworkRouter = require('./routes/coursework');
const testsRouter = require('./routes/tests');
const adminTestsRouter = require('./routes/adminTests');
const recycleBinRouter = require('./routes/recycleBin');
const objectionsRouter = require('./routes/objections');
const proctoringRouter = require('./routes/proctoring');
const eirfRouter = require('./routes/eirf');
const counterfoilRouter = require('./routes/counterfoil');
const marksLedgerRouter = require('./routes/marksLedger');
const ticketsRouter = require('./routes/tickets');
const adminDbViewerRouter = require('./routes/adminDbViewer');

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Database connection readiness check
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// API Access Secret Security Gate
app.use('/api', authorizeApiRequest);

// Mount Application Routers
app.use('/api', authRouter);
app.use('/api', candidatesRouter);
app.use('/api', courseworkRouter);
app.use('/api/coursework', courseworkRouter);
app.use('/api/tests', testsRouter);
app.use('/api/admin/tests', adminTestsRouter);
app.use('/api/admin/recycle-bin', recycleBinRouter);
app.use('/api', objectionsRouter);
app.use('/api/tests/proctoring', proctoringRouter);
app.use('/api', eirfRouter);
app.use('/api', counterfoilRouter);
app.use('/api/admin/marks-ledger', marksLedgerRouter);
app.use('/api', ticketsRouter);
app.use('/api/admin/db', adminDbViewerRouter);

// Global Technical Error Handling Middleware
app.use(async (err, req, res, next) => {
    console.error("TECHNICAL ERROR:", err);
    try {
        await logSystemAction(
            req.body?.username || 'system',
            'TECHNICAL_ERROR',
            `Error on ${req.method} ${req.url}: ${err.message || err}`,
            'error'
        );
    } catch (logErr) {
        console.error("Failed to write system log for error:", logErr);
    }
    res.status(500).json({ error: "Internal server error. The technical team has been notified." });
});

// Autonomous Lecture Knowledge Base Ingestion Worker
const { startIngestionWorker } = require('./services/lectureIngestionWorker');

// Start Express Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`BICS Portal Backend server running on port ${PORT} (0.0.0.0)`);
        // Start autonomous FIFO knowledge base ingestion loop in background
        startIngestionWorker();
    });
}

module.exports = app;
