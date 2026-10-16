const express = require('express');
const router = express.Router();
const { TicketModel, CandidateModel, SystemLogModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { requireAuth, requireAdmin, requireOwnerOrAdmin } = require('../middleware/auth');

// 1. Create a new helpdesk ticket (Student portal submit - accepts BICS ObjectID :id)
router.post(['/candidate/tickets/:id', '/candidate/tickets/:candidateId'], requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const candidateId = req.params.id || req.params.candidateId;
    const { category, subject, message } = req.body;
    if (!category || !subject || !message) {
        return res.status(400).json({ error: "Category, subject, and message are required." });
    }

    try {
        let newTicket = null;
        let candidateName = 'Unknown Candidate';
        let studentId = 'Unknown ID';

        if (dbState.useMongo) {
            const cand = await CandidateModel.findById(candidateId);
            if (cand) {
                candidateName = cand.name || candidateName;
                studentId = cand.studentId || studentId;
            }

            newTicket = new TicketModel({
                candidateId,
                candidateName,
                studentId,
                category,
                subject,
                message,
                status: 'open'
            });
            await newTicket.save();
        } else {
            const db = getJSONData();
            const cand = (db.candidates || []).find(c => c.id === candidateId || c._id === candidateId);
            if (cand) {
                candidateName = cand.name || candidateName;
                studentId = cand.studentId || studentId;
            }

            newTicket = {
                id: Date.now().toString(),
                _id: Date.now().toString(),
                candidateId,
                candidateName,
                studentId,
                category,
                subject,
                message,
                status: 'open',
                resolutionFeedback: '',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            db.tickets = db.tickets || [];
            db.tickets.push(newTicket);
            saveJSONData(db);
        }

        await logSystemAction(
            candidateName,
            'TICKET_CREATED',
            `Candidate opened a new ticket under category "${category}": ${subject}`,
            'info'
        );

        return res.json({ success: true, ticket: newTicket });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to create ticket: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 2. Fetch student's own tickets (Student portal history view - accepts BICS ObjectID :id)
router.get(['/candidate/tickets/list/:id', '/candidate/tickets/list/:candidateId'], requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const candidateId = req.params.id || req.params.candidateId;
    try {
        let tickets = [];
        if (dbState.useMongo) {
            tickets = await TicketModel.find({ candidateId }).sort({ createdAt: -1 });
        } else {
            const db = getJSONData();
            db.tickets = db.tickets || [];
            tickets = db.tickets
                .filter(t => t.candidateId === candidateId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return res.json({ success: true, tickets });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to fetch candidate tickets: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 3. Fetch all tickets (Admin dashboard view)
router.get('/admin/tickets', requireAdmin, async (req, res) => {
    try {
        let tickets = [];
        if (dbState.useMongo) {
            tickets = await TicketModel.find({}).sort({ createdAt: -1 });
        } else {
            const db = getJSONData();
            db.tickets = db.tickets || [];
            tickets = [...db.tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return res.json({ success: true, tickets });
    } catch (e) {
        console.error(e);
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to fetch all tickets: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 4. Resolve/Update ticket status (Admin dashboard resolution)
router.post('/admin/tickets/resolve/:ticketId', requireAdmin, async (req, res) => {
    const { ticketId } = req.params;
    const { status, resolutionFeedback } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required." });

    try {
        let ticket = null;
        if (dbState.useMongo) {
            ticket = await TicketModel.findById(ticketId);
            if (!ticket) return res.status(404).json({ error: "Ticket not found." });
            ticket.status = status;
            ticket.resolutionFeedback = resolutionFeedback || '';
            ticket.updatedAt = new Date();
            await ticket.save();
        } else {
            const db = getJSONData();
            db.tickets = db.tickets || [];
            ticket = db.tickets.find(t => t.id === ticketId || t._id === ticketId);
            if (!ticket) return res.status(404).json({ error: "Ticket not found." });
            ticket.status = status;
            ticket.resolutionFeedback = resolutionFeedback || '';
            ticket.updatedAt = new Date();
            saveJSONData(db);
        }

        await logSystemAction(
            'admin',
            'TICKET_RESOLVED',
            `Admin resolved ticket ${ticketId} with status: ${status}`,
            'info'
        );

        return res.json({ success: true, ticket });
    } catch (e) {
        console.error(e);
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to resolve ticket ${ticketId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 5. Fetch System Logs (Admin only - Dynamic Log Viewer)
router.get('/admin/system-logs', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const search = (req.query.search || '').trim();
        const action = (req.query.action || 'ALL').trim();
        const severity = (req.query.severity || 'ALL').trim();
        const actor = (req.query.actor || '').trim();
        const skip = (page - 1) * limit;

        if (dbState.useMongo) {
            const filter = {};
            if (action && action !== 'ALL') {
                filter.action = action;
            }
            if (severity && severity !== 'ALL') {
                filter.severity = severity;
            }
            if (actor) {
                const escapedActor = actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                filter.actor = new RegExp(escapedActor, 'i');
            }
            if (search) {
                const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const sRegex = new RegExp(escapedSearch, 'i');
                filter.$or = [
                    { actor: sRegex },
                    { actorId: sRegex },
                    { action: sRegex },
                    { details: sRegex },
                    { resourceType: sRegex },
                    { resourceId: sRegex },
                    { ipAddress: sRegex }
                ];
            }

            const totalCount = await SystemLogModel.countDocuments(filter);
            const logs = await SystemLogModel.find(filter)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit);

            const totalPages = Math.max(1, Math.ceil(totalCount / limit));

            return res.json({
                logs,
                totalCount,
                page,
                limit,
                totalPages,
                startIndex: totalCount === 0 ? 0 : skip + 1,
                endIndex: Math.min(skip + logs.length, totalCount)
            });
        } else {
            const db = getJSONData();
            db.systemLogs = db.systemLogs || [];
            let filtered = [...db.systemLogs];

            if (action && action !== 'ALL') {
                filtered = filtered.filter(l => l.action === action);
            }
            if (severity && severity !== 'ALL') {
                filtered = filtered.filter(l => l.severity === severity);
            }
            if (actor) {
                const q = actor.toLowerCase();
                filtered = filtered.filter(l => l.actor && l.actor.toLowerCase().includes(q));
            }
            if (search) {
                const q = search.toLowerCase();
                filtered = filtered.filter(l =>
                    (l.actor && l.actor.toLowerCase().includes(q)) ||
                    (l.action && l.action.toLowerCase().includes(q)) ||
                    (l.details && l.details.toLowerCase().includes(q)) ||
                    (l.ipAddress && l.ipAddress.toLowerCase().includes(q)) ||
                    (l.resourceType && l.resourceType.toLowerCase().includes(q))
                );
            }

            const totalCount = filtered.length;
            const totalPages = Math.max(1, Math.ceil(totalCount / limit));
            const sorted = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const logs = sorted.slice(skip, skip + limit);

            return res.json({
                logs,
                totalCount,
                page,
                limit,
                totalPages,
                startIndex: totalCount === 0 ? 0 : skip + 1,
                endIndex: Math.min(skip + logs.length, totalCount)
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
