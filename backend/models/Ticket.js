const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    candidateName: String,
    studentId: String,
    category: String,          // 'suggestion', 'general_feedback', 'complaint', 'enquiry', 'technical_problem'
    subject: String,
    message: String,
    status: { type: String, default: 'open' }, // 'open', 'resolved', 'closed'
    resolutionFeedback: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

const TicketModel = mongoose.model('Ticket', TicketSchema, 'tickets');

module.exports = {
    TicketSchema,
    TicketModel
};
