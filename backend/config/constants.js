const mongoose = require('mongoose');

const DEFAULT_ACADEMIC_COURSES = [
    { code: "R526CS01T", name: "Introduction to Computer Science", type: "theory" },
    { code: "R526CS02T", name: "Programming Fundamentals with C++", type: "theory" },
    { code: "R526CS03T", name: "Basics of Web Development", type: "theory" },
    { code: "R526CS04T", name: "Mathematical Thinking", type: "theory" },
    { code: "R526CS02L", name: "Programming Fundamentals with C++ Lab", type: "lab" },
    { code: "R526CS03L", name: "Basics of Web Development Lab", type: "lab" }
];

const API_ACCESS_SECRET = process.env.API_ACCESS_SECRET || 'bics_secret_key_2026';
const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
const GOOGLE_CLASSROOM_WEBHOOK_KEY = process.env.GOOGLE_CLASSROOM_WEBHOOK_KEY || "bics_classroom_secret_key_2026";

function generateObjectionId() {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `OBJ-${year}-${code}`;
}

function generateEirfReportId() {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `EIRF-${year}-${code}`;
}

const buildCandidateQueryFilter = (candidateIdInput) => {
    if (!candidateIdInput) return null;
    const strVal = candidateIdInput.toString().trim();
    if (!strVal || strVal === 'admin') return null;
    if (mongoose.Types.ObjectId.isValid(strVal)) {
        return { $or: [{ candidateId: new mongoose.Types.ObjectId(strVal) }, { studentId: strVal }] };
    }
    return { studentId: strVal };
};

module.exports = {
    DEFAULT_ACADEMIC_COURSES,
    API_ACCESS_SECRET,
    SECRET_KEY,
    GOOGLE_CLASSROOM_WEBHOOK_KEY,
    generateObjectionId,
    generateEirfReportId,
    buildCandidateQueryFilter
};
