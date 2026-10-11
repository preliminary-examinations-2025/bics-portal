const express = require('express');
const router = express.Router();
const { TicketModel, CandidateModel, SystemLogModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');

// 1. Create a new helpdesk ticket (Student portal submit)
router.post('/candidate/tickets/:candidateId', async (req, res) => {
    const { candidateId } = req.params;
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

// 2. Fetch student's own tickets (Student portal history view)
router.get('/candidate/tickets/list/:candidateId', async (req, res) => {
    const { candidateId } = req.params;
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
router.get('/admin/tickets', async (req, res) => {
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
router.post('/admin/tickets/resolve/:ticketId', async (req, res) => {
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

// 5. Fetch System Logs (Admin only)
router.get('/admin/system-logs', async (req, res) => {
    try {
        let logs = [];
        if (dbState.useMongo) {
            logs = await SystemLogModel.find({}).sort({ timestamp: -1 }).limit(100);
        } else {
            const db = getJSONData();
            db.systemLogs = db.systemLogs || [];
            logs = [...db.systemLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
        }
        return res.json(logs);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
