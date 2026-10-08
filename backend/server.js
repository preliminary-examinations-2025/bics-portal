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

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { exec } = require('child_process');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const qrImage = require('qr-image');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bics_db';

// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Multer Config using Memory Storage (keeps files as buffers, does NOT write to disk)
const upload = multer({ storage: multer.memoryStorage() });

// Cloudinary Configuration
let useCloudinary = false;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    useCloudinary = true;
    console.log("--> Cloudinary SDK active: uploads will route directly in-memory.");
} else {
    console.warn("--> Cloudinary credentials missing in .env. Falling back to mock URLs during registration.");
}

// Helper to stream file buffers to Cloudinary
const uploadToCloudinary = (fileBuffer, folder) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: folder, resource_type: 'auto' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        );
        stream.end(fileBuffer);
    });
};

// Nodemailer SMTP Transporter setup (supporting Gmail App Password)
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const transporter = (smtpUser && smtpPass) ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: smtpUser,
        pass: smtpPass
    },
    connectionTimeout: 5000, // 5 seconds connection timeout
    greetingTimeout: 4000,    // 4 seconds greeting timeout
    socketTimeout: 5000       // 5 seconds socket inactivity timeout
}) : null;

if (transporter) {
    console.log(`--> Nodemailer active: verification emails will be sent via ${smtpUser}.`);
} else {
    console.warn("--> SMTP credentials missing in .env. Falling back to logging verification codes in server console.");
}

const sendVerificationEmail = async (toEmail, name, code) => {
    // 1. Try EmailJS (HTTPS API - Ideal for Render Free Tier)
    const ejsServiceId = process.env.EMAILJS_SERVICE_ID;
    const ejsTemplateId = process.env.EMAILJS_TEMPLATE_ID;
    const ejsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
    const ejsPrivateKey = process.env.EMAILJS_PRIVATE_KEY; // Optional but recommended for server-side auth

    if (ejsServiceId && ejsTemplateId && ejsPublicKey) {
        try {
            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    service_id: ejsServiceId,
                    template_id: ejsTemplateId,
                    user_id: ejsPublicKey,
                    accessToken: ejsPrivateKey || undefined,
                    template_params: {
                        to_email: toEmail,
                        email: toEmail,
                        to_name: name,
                        name: name,
                        code: code
                    }
                })
            });
            
            if (response.ok) {
                console.log(`[EMAIL_VERIFICATION]: Successfully sent code to ${toEmail} via EmailJS HTTPS API`);
                return;
            } else {
                const text = await response.text();
                console.error(`[EMAIL_VERIFICATION_ERROR]: EmailJS API returned status ${response.status}: ${text}`);
            }
        } catch (err) {
            console.error(`[EMAIL_VERIFICATION_ERROR]: EmailJS request failed:`, err.message);
        }
    }

    // 2. Fallback to Nodemailer SMTP
    if (transporter) {
        const mailOptions = {
            from: `"Preliminary Examinations" <${smtpUser}>`,
            to: toEmail,
            subject: 'BICS Portal - Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #002147; border-bottom: 2px solid #002147; padding-bottom: 10px; display: inline-block;">BICS Verification Code</h2>
                    </div>
                    <p style="font-size: 11pt; color: #334155;">Dear <strong>${name}</strong>,</p>
                    <p style="font-size: 11pt; color: #334155; line-height: 1.6;">You have requested a verification code to complete a secure action (downloading your Exam Hall Ticket or changing your account password) on the BICS Candidate Portal.</p>
                    <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; padding: 15px; margin: 25px 0; text-align: center; border-radius: 6px;">
                        <span style="font-size: 24pt; font-weight: bold; letter-spacing: 5px; color: #002147; font-family: 'Courier New', monospace;">${code}</span>
                    </div>
                    <p style="font-size: 9.5pt; color: #64748b; line-height: 1.5;">This code is valid for <strong>10 minutes</strong>. For security reasons, please do not share this code with anyone.</p>
                    <p style="font-size: 9.5pt; color: #64748b;">If you did not request this code, please secure your account credentials immediately.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
                    <p style="font-size: 10pt; color: #002147; font-weight: bold; margin: 0;">Preliminary Examinations 2026</p>
                    <p style="font-size: 8.5pt; color: #94a3b8; margin: 4px 0 0 0;">BICS Portal Administration System</p>
                </div>
            `
        };
        try {
            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL_VERIFICATION]: Successfully sent code to ${toEmail} via SMTP`);
            return;
        } catch (emailErr) {
            console.error(`[EMAIL_VERIFICATION_ERROR]: SMTP transport failed. Error details:`, emailErr.message);
        }
    }

    // 3. Fallback to console log
    console.log(`\n==================================================`);
    console.log(`[SMTP BLOCK FALLBACK - OTP LOGGED TO SERVER CONSOLE]`);
    console.log(`Recipient: ${toEmail} (${name})`);
    console.log(`Verification Code: ${code}`);
    console.log(`==================================================\n`);
};

// Database Fallback System (db.json)
let useMongo = false;
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize local DB layout
const initialDB = {
    candidates: [
        {
            _id: "60c72b2f9b1d8b2bad000001",
            id: "60c72b2f9b1d8b2bad000001",
            studentId: "STU1001",
            name: "Demo Candidate",
            username: "candidate",
            password: "password123",
            eligible: true,
            signedConsent: true,
            registrationSubmitted: true,
            registrationStatus: "Approved",
            registeredCourses: ["Introduction to Computer Science", "Programming Fundamentals with C++"],
            registrationData: {
                preferredName: "Demo Candidate",
                dob: "2000-01-01",
                permanentAddress: "123 Main St, Tech City",
                localAddress: "123 Main St, Tech City",
                billingAddress: "123 Main St, Tech City",
                emergencyContact: {
                    name: "Emergency Contact",
                    relationship: "Guardian",
                    address: "123 Main St, Tech City",
                    phone: "9876543210"
                },
                personalPhone: "9876543210",
                personalEmail: "demo@example.com",
                collegeEmail: "demo@college.edu",
                photoUrl: "/public/uploads/default-photo.png",
                signatureUrl: "/public/uploads/default-sig.png",
                undertakingUrl: "/public/uploads/default-undertaking.png"
            }
        }
    ],
    videoLectures: [],
    courseMaterials: [],
    tests: [
        {
            _id: "60c72b2f9b1d8b2bad000002",
            id: "60c72b2f9b1d8b2bad000002",
            title: "BICS Practice Examination (Demo)",
            marks: 30,
            instructions: "This is a demonstration exam to verify MCQs selection, dark-mode code editors, proctoring warnings (fullscreen, tab switch) and submission parameters.",
            duration: 30,
            startDate: new Date(Date.now() - 3600000).toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString(),
            questions: [
                {
                    id: "demo_q1",
                    type: "mcq",
                    title: "What is the correct syntax to output 'Hello World' in C++?",
                    points: 10,
                    options: [
                        "cout << \"Hello World\";",
                        "System.out.println(\"Hello World\");",
                        "print(\"Hello World\");",
                        "Console.WriteLine(\"Hello World\");"
                    ],
                    correctOptionIndex: 0
                },
                {
                    id: "demo_q2",
                    type: "coding",
                    title: "Sum of Two Numbers in C++",
                    points: 20,
                    description: "Write a C++ function/program that reads two integers from the standard input (or initializes variables) and returns/prints their sum.",
                    initialTemplate: "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a = 5;\n    int b = 10;\n    // Write your code below to compute and print sum of a and b\n    \n    return 0;\n}",
                    language: "cpp",
                    testCases: [
                        { input: "5 10", output: "15", isSample: true, points: 10 },
                        { input: "20 30", output: "50", isSample: true, points: 10 }
                    ]
                }
            ]
        }
    ],
    testSubmissions: [],
    tickets: [],
    classroomSubmissions: [
        {
            studentId: "STU1001",
            studentName: "Siyam Bubere",
            courseCode: "R526CS01T",
            courseName: "Introduction to Computer Science",
            title: "Assignment 1: Number Systems & Logic Gates",
            type: "assignment",
            submissionDate: "2026-07-20T14:30:00.000Z",
            dueDate: "2026-07-21T23:59:59.000Z",
            status: "on_time",
            score: 18,
            maxScore: 20,
            classroomLink: "https://classroom.google.com/c/R526CS01T"
        },
        {
            studentId: "STU1001",
            studentName: "Siyam Bubere",
            courseCode: "R526CS02T",
            courseName: "Programming Fundamental with C++",
            title: "Class Test 1: Loops and Conditionals",
            type: "class_test",
            submissionDate: "2026-07-25T10:15:00.000Z",
            dueDate: "2026-07-25T11:00:00.000Z",
            status: "on_time",
            score: 15,
            maxScore: 15,
            classroomLink: "https://classroom.google.com/c/R526CS02T"
        },
        {
            studentId: "STU1001",
            studentName: "Siyam Bubere",
            courseCode: "R526CS03T",
            courseName: "Basics of Web Development",
            title: "Assignment 2: Flexbox and Grid Layouts",
            type: "assignment",
            submissionDate: "2026-07-28T02:00:00.000Z",
            dueDate: "2026-07-27T23:59:59.000Z",
            status: "late",
            score: 16,
            maxScore: 20,
            classroomLink: "https://classroom.google.com/c/R526CS03T"
        },
        {
            studentId: "STU1001",
            studentName: "Siyam Bubere",
            courseCode: "R526CS04T",
            courseName: "Mathematical Thinking",
            title: "Class Test 2: Set Theory and Relations",
            type: "class_test",
            submissionDate: null,
            dueDate: "2026-08-05T23:59:59.000Z",
            status: "pending",
            score: 0,
            maxScore: 20,
            classroomLink: "https://classroom.google.com/c/R526CS04T"
        },
        {
            studentId: "STU1001",
            studentName: "Siyam Bubere",
            courseCode: "R526CS02L",
            courseName: "Programming Fundamental with C++ Lab",
            title: "Practical 1: Pointer Declarations and Dereferencing",
            type: "practical",
            submissionDate: "2026-07-24T16:00:00.000Z",
            dueDate: "2026-07-24T18:00:00.000Z",
            status: "on_time",
            score: 25,
            maxScore: 25,
            classroomLink: "https://classroom.google.com/c/R526CS02L"
        },
        {
            studentId: "STU1001",
            studentName: "Siyam Bubere",
            courseCode: "R526CS03L",
            courseName: "Basics of Web Development Lab",
            title: "Practical 2: Single-Page Portfolio Site",
            type: "practical",
            submissionDate: "2026-07-30T10:00:00.000Z",
            dueDate: "2026-07-29T23:59:59.000Z",
            status: "excused",
            score: 22,
            maxScore: 25,
            classroomLink: "https://classroom.google.com/c/R526CS03L"
        }
    ],
    config: {
        courseRegistrationActive: true,
        onlineExamActive: true,
        midSemFeedbackActive: false,
        endSemFeedbackActive: false,
        exitFormActive: false,
        hallTicketDownloadActive: true,
        counterfoilActive: true,
        hallTicketUrl: '/public/textbooks/CS_Introduction_Textbook.pdf',
        timetableNotice: 'Mid semester test for BICS 2026 will be held in mid-August',
        examType: 'midsem',
        timetable: [
            { code: "R526CS01T", course: "Introduction to Computer Science", date: "2026-09-11", time: "03:15 PM to 04:45 PM", marks: 100 },
            { code: "R526CS02T", course: "Programming Fundamentals with C++", date: "2026-09-12", time: "03:15 PM to 04:45 PM", marks: 100 },
            { code: "R526CS03T", course: "Basics of Web Development", date: "2026-09-13", time: "03:15 PM to 04:45 PM", marks: 100 },
            { code: "R526CS04T", course: "Mathematical Thinking", date: "2026-09-14", time: "03:15 PM to 04:45 PM", marks: 100 },
            { code: "R526CS02L", course: "Programming Fundamentals with C++ Lab", date: "2026-09-15", time: "02:00 PM to 05:00 PM", marks: 50 },
            { code: "R526CS03L", course: "Basics of Web Development Lab", date: "2026-09-16", time: "02:00 PM to 05:00 PM", marks: 50 }
        ],
        classTests: [
            { id: "ct-1", courseName: "Introduction to Computer Science", date: "2026-08-01", time: "09:00 AM - 10:00 AM", topic: "Variables & Memory Structure", marks: 20 },
            { id: "ct-2", courseName: "Programming Fundamentals with C++", date: "2026-08-02", time: "11:00 AM - 12:00 PM", topic: "Conditional Statements & Loops", marks: 20 }
        ],
        announcements: [
            { id: 1, date: "2026-07-18", text: "Welcome to the BICS Portal. Ensure you complete your course registration before the deadline." }
        ]
    }
};

if (!fs.existsSync(DB_FILE)) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
    } catch (e) {
        console.warn("Could not create local db.json fallback on Serverless:", e.message);
    }
}

// Mongoose Schemas (for MongoDB Mode)
const CandidateSchema = new mongoose.Schema({
    studentId: { type: String, unique: true },
    name: String,
    username: { type: String, unique: true },
    password: { type: String },
    eligible: { type: Boolean, default: false },
    signedConsent: { type: Boolean, default: false },
    midSemConsentSigned: { type: Boolean, default: false },
    endSemConsentSigned: { type: Boolean, default: false },
    registrationSubmitted: { type: Boolean, default: false },
    registrationStatus: { type: String, default: 'Pending' }, // 'Pending', 'Approved', 'Rejected'
    registeredCourses: [String],
    registrationData: {
        preferredName: String,
        dob: String,
        permanentAddress: String,
        localAddress: String,
        billingAddress: String,
        emergencyContact: {
            name: String,
            relationship: String,
            address: String,
            phone: String
        },
        personalPhone: String,
        personalEmail: String,
        collegeEmail: String,
        photoUrl: String,
        signatureUrl: String,
        undertakingUrl: String
    },
    midSemFeedback: { type: Map, of: [String], default: {} },
    endSemFeedback: { type: Map, of: [String], default: {} },
    midSemLedgerUrl: { type: String, default: '' },
    endSemLedgerUrl: { type: String, default: '' },
    exitFormSubmitted: { type: Boolean, default: false },
    exitAnswers: { type: Map, of: String, default: {} },
    verificationCode: { type: String, default: '' },
    verificationCodeExpires: { type: Date },
    midSemEmailVerified: { type: Boolean, default: false },
    endSemEmailVerified: { type: Boolean, default: false }
});
const CandidateModel = mongoose.model('Candidate', CandidateSchema);

const TimetableSubSchema = new mongoose.Schema({
    code: String,
    course: String,
    date: String,
    time: String,
    marks: Number
}, { _id: false, id: false });

const ClassTestSubSchema = new mongoose.Schema({
    id: String,
    courseName: String,
    date: String,
    time: String,
    topic: String,
    marks: Number
}, { _id: false, id: false });

const AnnouncementSubSchema = new mongoose.Schema({
    id: Number,
    date: String,
    text: String
}, { _id: false, id: false });

const ConfigSchema = new mongoose.Schema({
    courseRegistrationActive: { type: Boolean, default: true },
    onlineExamActive: { type: Boolean, default: true },
    midSemFeedbackActive: { type: Boolean, default: false },
    endSemFeedbackActive: { type: Boolean, default: false },
    exitFormActive: { type: Boolean, default: false },
    hallTicketDownloadActive: { type: Boolean, default: true },
    counterfoilActive: { type: Boolean, default: true },
    hallTicketUrl: { type: String, default: '/public/textbooks/CS_Introduction_Textbook.pdf' },
    timetableNotice: { type: String, default: 'Mid semester test for BICS 2026 will be held in mid-August' },
    examType: { type: String, default: 'midsem' }, // 'midsem' or 'endsem'
    timetable: [TimetableSubSchema],
    classTests: [ClassTestSubSchema],
    announcements: [AnnouncementSubSchema]
});
const ConfigModel = mongoose.model('Config', ConfigSchema);

const VideoLectureSchema = new mongoose.Schema({
    section: String,
    title: String,
    youtubeUrl: String,
    createdAt: { type: Date, default: Date.now },
    hasPlayground: { type: Boolean, default: false },
    playgroundLanguage: { type: String, default: 'cpp' }, // 'cpp' or 'web'
    codeTemplate: { type: String, default: '' },
    webHtmlTemplate: { type: String, default: '' },
    webCssTemplate: { type: String, default: '' },
    webJsTemplate: { type: String, default: '' }
});
const VideoLectureModel = mongoose.model('VideoLecture', VideoLectureSchema);

const CourseMaterialSchema = new mongoose.Schema({
    section: String,
    title: String,
    fileUrl: String,
    createdAt: { type: Date, default: Date.now }
});
const CourseMaterialModel = mongoose.model('CourseMaterial', CourseMaterialSchema);

const QuestionSchema = new mongoose.Schema({
    id: String,
    type: String, // 'mcq', 'coding', or 'web'
    title: String,
    questionText: String,
    question: String,
    statement: String,
    points: Number,
    section: String,
    // MCQ
    options: [String],
    correctOptionIndex: Number,
    isMultiChoice: { type: Boolean, default: false },
    // Coding
    description: String,
    initialTemplate: String,
    language: String,
    testCases: [{ input: String, output: String, isSample: { type: Boolean, default: false }, points: { type: Number, default: 10 } }],
    // Web Coding (HTML/CSS/JS)
    initialHtml: String,
    initialCss: String,
    initialJs: String,
    imageUrl: String
}, { _id: false, strict: false });

const TestConfigSchema = new mongoose.Schema({
    title: String,
    marks: Number,
    instructions: String,
    duration: Number, // in minutes
    startDate: Date,
    endDate: Date,
    questions: [QuestionSchema],
    answersReleased: { type: Boolean, default: false }, // Admin release toggle for answer sheets (legacy)
    verificationStatus: { type: String, enum: ['not_released', 'released', 'closed'], default: 'not_released' }, // 3-state verification status
    isPublished: { type: Boolean, default: false }, // Admin display/publish toggle for student visibility
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: String
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });
const TestConfigModel = mongoose.model('TestConfigV2', TestConfigSchema, 'testconfigs_v2');

const AnswerSchema = new mongoose.Schema({
    questionId: String,
    type: String, // 'mcq', 'coding', or 'web'
    selectedOptionIndex: Number, // for MCQ
    submittedCode: String, // for Coding (C++)
    selectedLanguage: String, // Selected programming language (c, cpp, python, java)
    submittedHtml: String, // for Web Coding (HTML)
    submittedCss: String, // for Web Coding (CSS)
    submittedJs: String, // for Web Coding (JS)
    score: { type: Number, default: 0 }, // Scored marks for this question
    isObjectionResolved: { type: Boolean, default: false },
    isManuallyGraded: { type: Boolean, default: false },
    testCaseResults: [{
        status: String,
        points: Number,
        scoredPoints: Number,
        actualOutput: String,
        expectedOutput: String,
        input: String
    }]
}, { _id: false });

const TestSubmissionSchema = new mongoose.Schema({
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    candidateName: String,
    studentId: String,
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    testTitle: String,
    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    status: { type: String, default: 'started' }, // 'started', 'submitted', 'auto-submitted', 'evaluated'
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    restoreToken: String,
    proctoringLog: {
        fullscreenExits: { type: Number, default: 0 },
        tabSwitches: { type: Number, default: 0 },
        webcamStatus: { type: String, default: 'active' },
        events: [{
            timestamp: { type: Date, default: Date.now },
            type: { type: String }, // "TAB_SWITCH", "FULLSCREEN_EXIT", "WEBCAM_LOST", "MIC_MUTED", "MIC_UNMUTED", "CAM_GRANTED", "CAM_DENIED"
            details: String
        }]
    },
    answers: [AnswerSchema],
    evaluation: {
        mcqScore: { type: Number, default: 0 },
        codingScore: { type: Number, default: 0 },
        feedback: { type: String, default: '' },
        evaluatedAt: Date
    },
    reevaluation: {
        applied: { type: Boolean, default: false },
        appliedAt: Date,
        complaintText: String,
        complainedQuestions: [String],
        proofImages: [String],
        status: { type: String, default: 'pending' }, // 'pending', 'resolved', 'rejected'
        resolutionFeedback: String
    },
    objections: [{
        objectionId: String,
        questionId: String,
        questionIndex: Number,
        reason: String,
        details: String,
        attachments: [String],
        status: { type: String, default: 'pending' },
        raisedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
        adminRemarks: String,
        resolutionNote: String,
        resolvedMarks: Number,
        resolvedAt: Date
    }]
});
const TestSubmissionModel = mongoose.model('TestSubmissionV3', TestSubmissionSchema, 'testsubmissions_v3');

// 24-Hour Recycle Bin Schema & Model
const RecycleBinSchema = new mongoose.Schema({
    entityType: { type: String, required: true }, // 'TestConfig', 'TestSubmission', etc.
    entityId: { type: String, required: true },
    title: String,
    code: String,
    deletedBy: { type: String, default: 'admin' },
    deletedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }, // 24 hours from deletedAt
    cascadeCount: { type: Number, default: 0 },
    cascadeDetails: mongoose.Schema.Types.Mixed,
    snapshot: mongoose.Schema.Types.Mixed
});
RecycleBinSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL Index
const RecycleBinModel = mongoose.model('RecycleBinV2', RecycleBinSchema, 'recycle_bin_v2');

function generateObjectionId() {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `OBJ-${year}-${code}`;
}

function calculateSubmissionScore(submission, test) {
    if (!test || !submission) return submission;
    
    submission.answers = submission.answers || [];
    let mcqPoints = 0;
    let codingPoints = 0;
    let webPoints = 0;

    const questionMap = new Map();
    (test.questions || []).forEach((q, idx) => {
        const key = q.id ? String(q.id) : (q._id ? String(q._id) : String(idx));
        questionMap.set(key, q);
    });

    submission.answers.forEach((ans, index) => {
        let quest = null;
        if (ans.questionId && String(ans.questionId) !== 'undefined') {
            quest = questionMap.get(String(ans.questionId));
        }
        if (!quest && test.questions && test.questions[index]) {
            quest = test.questions[index];
        }

        const qPoints = Number(quest?.points || ans.maxPoints || 0);

        // Check if an objection was resolved for this question
        const resolvedObj = (submission.objections || []).find(o => 
            (o.status === 'resolved' || o.status === 'resolved_accepted') &&
            (o.questionIndex === index || (o.questionId && String(o.questionId) === String(ans.questionId)))
        );

        if (resolvedObj && resolvedObj.resolvedMarks !== undefined && resolvedObj.resolvedMarks !== null && !isNaN(resolvedObj.resolvedMarks)) {
            ans.score = Number(resolvedObj.resolvedMarks);
            ans.isObjectionResolved = true;
        }
        // 1. Check Bonus Question Rules
        else if (quest && (quest.isBonus || quest.grantBonusToAll || quest.isBonusQuestion)) {
            ans.score = qPoints;
            ans.isBonusAwarded = true;
        } 
        // 2. MCQ Automated Scoring (if not manually overridden or objection resolved)
        else if (quest && quest.type === 'mcq') {
            if (!ans.isManuallyGraded && !ans.isObjectionResolved) {
                if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null) {
                    if (Number(quest.correctOptionIndex) === Number(ans.selectedOptionIndex)) {
                        ans.score = qPoints;
                    } else {
                        ans.score = 0;
                    }
                } else {
                    ans.score = 0;
                }
            }
        }
        // 3. Coding Automated Scoring (if testCaseResults exist and not manually graded)
        else if (quest && quest.type === 'coding') {
            if (!ans.isManuallyGraded && !ans.isObjectionResolved) {
                if (ans.testCaseResults && ans.testCaseResults.length > 0) {
                    let tcPoints = 0;
                    ans.testCaseResults.forEach(tc => {
                        const pts = Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' ? (tc.points || 0) : 0));
                        tcPoints += pts;
                    });
                    ans.score = tcPoints;
                } else if (ans.score === undefined || ans.score === null) {
                    ans.score = 0;
                }
            }
        }

        // Strict per-question boundary guard (0 <= ans.score <= qPoints)
        ans.score = Math.max(0, Math.min(Number(ans.score || 0), qPoints));

        // Accumulate by type
        if (quest?.type === 'coding') {
            codingPoints += ans.score;
        } else if (quest?.type === 'web') {
            webPoints += ans.score;
        } else {
            mcqPoints += ans.score;
        }
    });

    const rawTotal = mcqPoints + codingPoints + webPoints;
    const testMaxMarks = Number(test.marks || 100);
    const finalTotal = Math.min(rawTotal, testMaxMarks);

    submission.score = finalTotal;
    submission.totalScore = finalTotal;

    submission.evaluation = submission.evaluation || {};
    submission.evaluation.mcqScore = mcqPoints;
    submission.evaluation.codingScore = codingPoints + webPoints;
    submission.evaluation.webScore = webPoints;
    submission.evaluation.totalScore = finalTotal;
    submission.evaluation.score = finalTotal;

    return submission;
}

function recalculateMCQScore(submission, test) {
    return calculateSubmissionScore(submission, test);
}

function calculateCodingScoreFast(submission, test) {
    if (!test || !submission) return;
    submission.answers = submission.answers || [];
    let totalCodingPoints = 0;

    submission.answers.forEach(ans => {
        const quest = test.questions ? test.questions.find(q => String(q.id) === String(ans.questionId)) : null;
        if (quest && quest.type === 'coding') {
            if (ans.testCaseResults && ans.testCaseResults.length > 0) {
                let questionPoints = 0;
                ans.testCaseResults.forEach(tc => {
                    const pts = Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' ? (tc.points || 0) : 0));
                    questionPoints += pts;
                });
                ans.score = Number(ans.score !== undefined ? ans.score : questionPoints);
            } else if (ans.score === undefined || ans.score === null) {
                ans.score = 0;
            }
            totalCodingPoints += Number(ans.score || 0);
        }
    });

    submission.evaluation = submission.evaluation || {};
    submission.evaluation.codingScore = totalCodingPoints;
    submission.evaluation.evaluatedAt = new Date();
}

async function recalculateCodingScore(submission, test) {
    if (!test || !submission) return;
    submission.answers = submission.answers || [];
    const codingTasks = [];

    for (let i = 0; i < submission.answers.length; i++) {
        const ans = submission.answers[i];
        const quest = test.questions.find(q => String(q.id) === String(ans.questionId));
        if (quest && quest.type === 'coding') {
            ans.testCaseResults = [];
            if (!ans.submittedCode || ans.submittedCode.trim() === '') {
                ans.score = 0;
                if (quest.testCases) {
                    quest.testCases.forEach(tc => {
                        ans.testCaseResults.push({
                            status: 'No Submission',
                            points: Number(tc.points || 0),
                            scoredPoints: 0,
                            actualOutput: '',
                            expectedOutput: tc.output || '',
                            input: tc.input || ''
                        });
                    });
                }
                continue;
            }

            codingTasks.push((async () => {
                try {
                    const runRes = await executeCode(ans.submittedCode, quest.testCases || []);
                    let codingPoints = 0;
                    if (runRes && runRes.success && runRes.results) {
                        runRes.results.forEach((res, resIdx) => {
                            const tc = quest.testCases[resIdx];
                            const tcStatus = res.status || 'Failed';
                            const isAccepted = tcStatus === 'Accepted';
                            const pts = tc ? Number(tc.points || 0) : 0;
                            const scored = isAccepted ? pts : 0;
                            if (isAccepted) {
                                codingPoints += pts;
                            }
                            ans.testCaseResults.push({
                                status: tcStatus,
                                points: pts,
                                scoredPoints: scored,
                                actualOutput: res.actualOutput !== undefined ? res.actualOutput : (res.stdout || ''),
                                expectedOutput: tc ? (tc.output || '') : '',
                                input: tc ? (tc.input || '') : ''
                            });
                        });
                    } else if (runRes && runRes.status === 'Compilation Error') {
                        if (quest.testCases) {
                            quest.testCases.forEach(tc => {
                                ans.testCaseResults.push({
                                    status: 'Compilation Error',
                                    points: Number(tc.points || 0),
                                    scoredPoints: 0,
                                    actualOutput: runRes ? (runRes.compileError || runRes.error || 'Compilation Error') : 'Compilation Error',
                                    expectedOutput: tc.output || '',
                                    input: tc.input || ''
                                });
                            });
                        }
                    } else {
                        if (quest.testCases) {
                            quest.testCases.forEach(tc => {
                                ans.testCaseResults.push({
                                    status: 'Runtime Error',
                                    points: Number(tc.points || 0),
                                    scoredPoints: 0,
                                    actualOutput: 'Runtime Error',
                                    expectedOutput: tc.output || '',
                                    input: tc.input || ''
                                });
                            });
                        }
                    }
                    ans.score = codingPoints;
                } catch (err) {
                    console.error("Autograding failed for question", quest.id, err);
                    ans.score = 0;
                    if (quest.testCases) {
                        quest.testCases.forEach(tc => {
                            ans.testCaseResults.push({
                                status: 'Autograding Error',
                                points: Number(tc.points || 0),
                                scoredPoints: 0,
                                actualOutput: err?.message || 'Autograding Error',
                                expectedOutput: tc.output || '',
                                input: tc.input || ''
                            });
                        });
                    }
                }
            })());
        } else if (quest && quest.type === 'web') {
            if (ans.score === undefined) ans.score = 0;
        }
    }

    if (codingTasks.length > 0) {
        await Promise.all(codingTasks);
    }

    let totalCodingScore = 0;
    submission.answers.forEach(ans => {
        const quest = test.questions.find(q => String(q.id) === String(ans.questionId));
        if (quest && quest.type === 'coding') {
            totalCodingScore += Number(ans.score || 0);
        }
    });

    submission.evaluation = submission.evaluation || {};
    submission.evaluation.codingScore = totalCodingScore;
}

const SystemLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    actor: String,
    action: String,
    details: String,
    severity: { type: String, default: 'info' } // 'info', 'warning', 'error'
}, { versionKey: false });
const SystemLogModel = mongoose.model('SystemLog', SystemLogSchema, 'systemlogs');

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

const TestSignalSchema = new mongoose.Schema({
    submissionId: { type: String, index: true },
    sender: String, // 'candidate' or 'admin'
    type: String, // 'sdp' or 'ice'
    data: String, // SDP string or ICE candidate JSON string
    createdAt: { type: Date, default: Date.now, expires: 180 } // 3 minutes expiry
}, { versionKey: false });
const TestSignalModel = mongoose.model('TestSignal', TestSignalSchema, 'testsignals');

const logSystemAction = async (actor, action, details, severity = 'info') => {
    try {
        console.log(`LOG [${severity.toUpperCase()}]: actor=${actor}, action=${action}, details=${details}`);
        if (useMongo) {
            const newLog = new SystemLogModel({ actor, action, details, severity });
            await newLog.save();
        } else {
            const db = getJSONData();
            db.systemLogs = db.systemLogs || [];
            db.systemLogs.push({
                timestamp: new Date(),
                actor,
                action,
                details,
                severity
            });
            saveJSONData(db);
        }
    } catch (err) {
        console.error("Logger Error:", err.message);
    }
};

const TestTokenSchema = new mongoose.Schema({
    token: { type: String, unique: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    createdAt: { type: Date, default: Date.now, expires: 120 }
});
const TestTokenModel = mongoose.model('TestToken', TestTokenSchema, 'testtokens');

// --- Google Classroom Digital Submissions Schema & Model ---
const ClassroomSubmissionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: String,
    courseCode: { type: String, required: true },
    courseName: String,
    title: { type: String, required: true },
    type: { type: String, enum: ['assignment', 'practical', 'class_test'], required: true },
    submissionDate: { type: Date },
    dueDate: { type: Date },
    status: { type: String, enum: ['on_time', 'late', 'pending', 'excused'], default: 'pending' },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    classroomLink: String
}, { versionKey: false });
const ClassroomSubmissionModel = mongoose.model('ClassroomSubmission', ClassroomSubmissionSchema, 'classroom_submissions');

const CounterfoilSubmissionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    courseCode: { type: String, required: true },
    courseName: { type: String, required: true },
    examType: { type: String, enum: ['midsem', 'endsem'], required: true },
    examinationName: { type: String, required: true },
    questionMarks: [{
        questionNo: Number,
        obtainedMarks: Number,
        maxMarks: Number
    }],
    totalObtained: Number,
    totalMax: Number,
    status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
    adminRemarks: String,
    submittedAt: { type: Date, default: Date.now },
    approvedAt: Date
}, { versionKey: false });
const CounterfoilSubmissionModel = mongoose.model('CounterfoilSubmission', CounterfoilSubmissionSchema, 'counterfoil_submissions');

const AcademicMarksLedgerSchema = new mongoose.Schema({
    courseCode: { type: String, required: true, unique: true },
    courseName: { type: String, required: true },
    courseType: { type: String, enum: ['theory', 'lab'], required: true },
    linkedOnlineTestId: { type: String, default: '' },
    linkedMstOnlineTestId: { type: String, default: '' },
    linkedEseOnlineTestId: { type: String, default: '' },
    isLocked: { type: Boolean, default: false },
    lockedAt: Date,
    lockedBy: String,
    studentMarks: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true },
        rollNo: String,
        
        // TA Components
        taAssignment: { type: Number, default: 0 },
        taClassTest: { type: Number, default: 0 },
        taQuiz: { type: Number, default: 0 },
        taIdeation: { type: Number, default: 0 },
        
        taPracticalEval: { type: Number, default: 0 },
        taLabQuiz: { type: Number, default: 0 },
        taProject: { type: Number, default: 0 },
        
        // MST Components
        mstWritten: { type: Number, default: 0 },
        mstWrittenStatus: { type: String, enum: ['approved', 'pending_approval', 'manual'], default: 'manual' },
        mstOnline: { type: Number, default: 0 },
        mstViva: { type: Number, default: 0 },
        
        // ESE Components
        eseWritten: { type: Number, default: 0 },
        eseWrittenStatus: { type: String, enum: ['approved', 'pending_approval', 'manual'], default: 'manual' },
        eseOnline: { type: Number, default: 0 },
        eseViva: { type: Number, default: 0 },
        
        // Computed Results
        totalTa: { type: Number, default: 0 },
        scaledMst: { type: Number, default: 0 },
        scaledEse: { type: Number, default: 0 },
        finalScore: { type: Number, default: 0 },
        grade: { type: String, default: 'FF' },
        gradePoint: { type: Number, default: 0 },
        status: { type: String, enum: ['PASS', 'FAIL'], default: 'FAIL' }
    }]
}, { versionKey: false, timestamps: true });

const AcademicMarksLedgerModel = mongoose.model('AcademicMarksLedger', AcademicMarksLedgerSchema, 'academic_marks_ledgers');

const GOOGLE_CLASSROOM_WEBHOOK_KEY = process.env.GOOGLE_CLASSROOM_WEBHOOK_KEY || "bics_classroom_secret_key_2026";


// Connect to MongoDB (Serverless-compatible middleware approach)
let isConnected = false;
const connectDB = async () => {
    if (isConnected && mongoose.connection.readyState === 1) {
        useMongo = true;
        return;
    }
    try {
        console.log("--> Connecting to MongoDB Atlas...");
        await mongoose.connect(MONGO_URI, { 
            serverSelectionTimeoutMS: 5000 
        });
        isConnected = true;
        useMongo = true;
        console.log("--> Connected to MongoDB successfully.");
        
        // Seed default database schema configurations if completely empty
        const count = await ConfigModel.countDocuments();
        if (count === 0) {
            const config = new ConfigModel(initialDB.config);
            await config.save();
            console.log("--> Default system config seeded in MongoDB.");

            // Seed default candidate if empty
            const candCount = await CandidateModel.countDocuments();
            if (candCount === 0) {
                const defaultCand = new CandidateModel(initialDB.candidates[0]);
                await defaultCand.save();
                console.log("--> Default eligible candidate seeded in MongoDB.");
            }

            // Seed default practice test if empty
            const testCount = await TestConfigModel.countDocuments();
            if (testCount === 0) {
                const defaultTest = new TestConfigModel(initialDB.tests[0]);
                await defaultTest.save();
                console.log("--> Default practice examination seeded in MongoDB.");
            }

            // Seed default classroom submissions if empty
            const submissionCount = await ClassroomSubmissionModel.countDocuments();
            if (submissionCount === 0) {
                await ClassroomSubmissionModel.insertMany(initialDB.classroomSubmissions);
                console.log("--> Default classroom submissions seeded in MongoDB.");
            }
        }
    } catch (err) {
        console.error("--> MongoDB connection failed:", err.message);
        useMongo = false;
    }
};

// Express Middleware to ensure database connection is ready before handling any requests
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

const FORBIDDEN_HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Error</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #e6e6e6;
            font-family: Arial, "Segoe UI", sans-serif;
        }
        .header-bar {
            background-color: #505050;
            color: #ffffff;
            font-size: 20px;
            font-weight: normal;
            padding: 10px 20px;
        }
        .main-container {
            margin: 15px 20px;
            background-color: #ffffff;
            border: 1px solid #d4d4d4;
            padding: 12px;
        }
        .error-card {
            border: 1px solid #dcdcdc;
            padding: 12px 16px;
            background-color: #ffffff;
        }
        .error-title {
            color: #cc0000;
            font-size: 16px;
            font-weight: bold;
            margin: 0 0 6px 0;
        }
        .error-message {
            color: #000000;
            font-size: 13px;
            font-weight: bold;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="header-bar">Server Error</div>
    <div class="main-container">
        <div class="error-card">
            <h1 class="error-title">403 - Forbidden: Access is denied.</h1>
            <p class="error-message">You do not have permission to view this directory or page using the credentials that you supplied.</p>
        </div>
    </div>
</body>
</html>`;

const authorizeApiRequest = (req, res, next) => {
    const secret = process.env.API_ACCESS_SECRET;

    // Allow pass-through if process.env.API_ACCESS_SECRET is not configured in environment
    if (!secret) {
        return next();
    }

    const fullPath = (req.originalUrl || req.path).split('?')[0].toLowerCase();
    const relativePath = req.path.toLowerCase();

    // Whitelist rules: OPTIONS preflight, health checks, authentication, and external webhooks
    const isWhitelisted = 
        req.method === 'OPTIONS' ||
        fullPath === '/health' || relativePath === '/health' ||
        fullPath === '/api/health' || relativePath === '/health' ||
        fullPath.startsWith('/api/webhooks/') || relativePath.startsWith('/webhooks/') ||
        fullPath === '/api/login' || relativePath === '/login' ||
        fullPath === '/api/register' || relativePath === '/register' ||
        fullPath === '/api/candidate/login' || relativePath === '/candidate/login' ||
        fullPath === '/api/candidate/register' || relativePath === '/candidate/register' ||
        fullPath.startsWith('/api/candidate/send-verification-code') || relativePath.startsWith('/candidate/send-verification-code') ||
        fullPath === '/api/candidate/verify-email-code' || relativePath === '/candidate/verify-email-code' ||
        fullPath.startsWith('/api/candidate/verify-code') || relativePath.startsWith('/candidate/verify-code') ||
        fullPath === '/api/tests/verify-token' || relativePath === '/tests/verify-token' ||
        fullPath === '/api/config' || relativePath === '/config' ||
        fullPath === '/api/system-config' || relativePath === '/system-config' ||
        fullPath.startsWith('/api/candidate/generate-hallticket') || relativePath.startsWith('/candidate/generate-hallticket') ||
        fullPath.startsWith('/api/tests/submission-verification') || relativePath.startsWith('/tests/submission-verification') ||
        fullPath.startsWith('/api/counterfoil') || relativePath.startsWith('/counterfoil') ||
        fullPath === '/api/log-client-error' || relativePath === '/log-client-error';

    if (isWhitelisted) {
        return next();
    }

    // Check credentials via apiSecret or apiKey query parameter, or header
    const clientSecret = req.query.apiSecret || 
                         req.query.apiKey || 
                         req.headers['x-portal-api-key'] ||
                         (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);

    if (clientSecret && clientSecret === secret) {
        return next();
    }

    console.warn(`[SECURITY ALERT] Unauthorized API access blocked: ${req.method} ${req.originalUrl} from IP ${req.ip}`);
    
    // Direct browser navigation (GET requesting text/html) gets the custom Server Error HTML page
    const acceptHeader = req.headers['accept'] || '';
    if (req.method === 'GET' && acceptHeader.includes('text/html')) {
        return res.status(403).type('html').send(FORBIDDEN_HTML_PAGE);
    }

    // Programmatic fetch / API calls get clean JSON response
    return res.status(403).json({
        success: false,
        error: "403 Forbidden: Access is denied. Invalid or missing API Secret."
    });
};

app.use('/api', authorizeApiRequest);

// JSON File Access Helpers
const getJSONData = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Failed to read local JSON data:", e);
    }
    return initialDB;
};

const saveJSONData = (data) => {
    try {
        if (!process.env.VERCEL) {
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Local JSON write bypassed on serverless:", e.message);
    }
};

// API ROUTES

// 1. Unified Login (Admin & Candidate)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (adminUser && adminPass && username === adminUser && password === adminPass) {
        await logSystemAction('admin', 'USER_SIGN_IN', 'Admin logged into portal', 'info');
        return res.json({ success: true, role: 'admin', name: 'System Administrator' });
    }

    if (useMongo) {
        try {
            const student = await CandidateModel.findOne({ username, password });
            if (!student) {
                await logSystemAction(username || 'unknown', 'SIGN_IN_FAILED', `Failed login attempt for username: ${username}`, 'warning');
                return res.status(401).json({ error: "Invalid username or password" });
            }
            await logSystemAction(student.name || username, 'USER_SIGN_IN', `Student "${student.name || username}" logged into portal`, 'info');
            return res.json({ success: true, role: 'student', id: student._id });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const student = db.candidates.find(c => c.username === username && c.password === password);
        if (!student) {
            await logSystemAction(username || 'unknown', 'SIGN_IN_FAILED', `Failed login attempt for username: ${username}`, 'warning');
            return res.status(401).json({ error: "Invalid username or password" });
        }
        await logSystemAction(student.name || username, 'USER_SIGN_IN', `Student "${student.name || username}" logged into portal`, 'info');
        return res.json({ success: true, role: 'student', id: student.id });
    }
});

app.post('/api/logout', async (req, res) => {
    const { username, role } = req.body;
    if (username) {
        await logSystemAction(username, 'USER_SIGN_OUT', `${role === 'admin' ? 'Admin' : 'Student'} logged out of portal`, 'info');
    }
    return res.json({ success: true });
});

app.post('/api/log-client-error', async (req, res) => {
    const { actor, action, details, severity } = req.body;
    await logSystemAction(actor || 'client', action || 'CLIENT_ERROR', details || 'An external error occurred', severity || 'error');
    return res.json({ success: true });
});

// 2. Fetch System Configuration
app.get('/api/config', async (req, res) => {
    try {
        let configObj = {};
        if (useMongo) {
            const conf = await ConfigModel.findOne();
            if (conf) {
                if (!conf.timetableNotice) {
                    conf.timetableNotice = 'Mid semester test for BICS 2026 will be held in mid-August';
                    await conf.save();
                }
                configObj = conf.toObject();
            }
        } else {
            const db = getJSONData();
            if (db && db.config) {
                if (!db.config.timetableNotice) {
                    db.config.timetableNotice = 'Mid semester test for BICS 2026 will be held in mid-August';
                    saveJSONData(db);
                }
                configObj = { ...db.config };
            }
        }
        return res.json(configObj);
    } catch (e) {
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to fetch system configuration: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 3. Update System Configuration (Admin Only)
app.post('/api/admin/config', async (req, res) => {
    const { courseRegistrationActive, onlineExamActive, midSemFeedbackActive, endSemFeedbackActive, exitFormActive, hallTicketDownloadActive, counterfoilActive, timetable, timetableNotice, announcements, hallTicketUrl, examType, classTests } = req.body;

    if (useMongo) {
        try {
            let conf = await ConfigModel.findOne();
            if (!conf) {
                conf = new ConfigModel(initialDB.config);
            }
            if (courseRegistrationActive !== undefined) conf.courseRegistrationActive = courseRegistrationActive;
            if (onlineExamActive !== undefined) conf.onlineExamActive = onlineExamActive;
            if (midSemFeedbackActive !== undefined) conf.midSemFeedbackActive = midSemFeedbackActive;
            if (endSemFeedbackActive !== undefined) conf.endSemFeedbackActive = endSemFeedbackActive;
            if (exitFormActive !== undefined) conf.exitFormActive = exitFormActive;
            if (hallTicketDownloadActive !== undefined) conf.hallTicketDownloadActive = hallTicketDownloadActive;
            if (counterfoilActive !== undefined) conf.counterfoilActive = counterfoilActive;
            if (timetableNotice !== undefined) conf.timetableNotice = timetableNotice;
            if (hallTicketUrl !== undefined) conf.hallTicketUrl = hallTicketUrl;
            if (examType !== undefined) conf.examType = examType;
            
            if (timetable !== undefined) {
                conf.timetable = timetable;
                conf.markModified('timetable');
            }
            if (announcements !== undefined) {
                conf.announcements = announcements;
                conf.markModified('announcements');
            }
            if (classTests !== undefined) {
                conf.classTests = classTests;
                conf.markModified('classTests');
            }
            await conf.save();
            return res.json({ success: true, config: conf });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        if (courseRegistrationActive !== undefined) db.config.courseRegistrationActive = courseRegistrationActive;
        if (onlineExamActive !== undefined) db.config.onlineExamActive = onlineExamActive;
        if (midSemFeedbackActive !== undefined) db.config.midSemFeedbackActive = midSemFeedbackActive;
        if (endSemFeedbackActive !== undefined) db.config.endSemFeedbackActive = endSemFeedbackActive;
        if (exitFormActive !== undefined) db.config.exitFormActive = exitFormActive;
        if (hallTicketDownloadActive !== undefined) db.config.hallTicketDownloadActive = hallTicketDownloadActive;
        if (counterfoilActive !== undefined) db.config.counterfoilActive = counterfoilActive;
        if (timetable !== undefined) db.config.timetable = timetable;
        if (timetableNotice !== undefined) db.config.timetableNotice = timetableNotice;
        if (announcements !== undefined) db.config.announcements = announcements;
        if (hallTicketUrl !== undefined) db.config.hallTicketUrl = hallTicketUrl;
        if (examType !== undefined) db.config.examType = examType;
        if (classTests !== undefined) db.config.classTests = classTests;
        saveJSONData(db);
        return res.json({ success: true, config: db.config });
    }
});

// Change Password Endpoint (Admin & Candidate)
app.post('/api/change-password', async (req, res) => {
    const { role, id, newPassword, code } = req.body;

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters long" });
    }

    if (role === 'admin') {
        return res.json({ success: true, message: "Admin password changed successfully (session mock update)." });
    }

    // For student role, verify email code
    if (!code) {
        return res.status(400).json({ error: "Email verification code is required." });
    }

    try {
        let student;
        if (useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === id || c._id === id);
        }

        if (!student) return res.status(404).json({ error: "Candidate not found" });

        // Verify code
        if (!student.verificationCode || student.verificationCode !== code.trim()) {
            return res.status(400).json({ error: "Invalid verification code." });
        }

        if (new Date() > new Date(student.verificationCodeExpires)) {
            return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
        }

        // Clear code and update password
        if (useMongo) {
            student.password = newPassword;
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            await student.save();
        } else {
            student.password = newPassword;
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            const db = getJSONData();
            const candIdx = db.candidates.findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        await logSystemAction(student.name || 'candidate', 'PASSWORD_CHANGED', `Student changed account password`, 'info');
        return res.json({ success: true });
    } catch (e) {
        console.error("Password change failed:", e);
        return res.status(500).json({ error: "Server error updating password. Please try again." });
    }
});

// 4. Register Candidate Shell (Admin Only)
app.post('/api/admin/register-candidate', async (req, res) => {
    const { studentId, name, username, password, eligible } = req.body;

    if (!studentId || !name || !username || !password) {
        return res.status(400).json({ error: "All student fields are required" });
    }

    if (useMongo) {
        try {
            const exists = await CandidateModel.findOne({ $or: [{ username }, { studentId }] });
            if (exists) return res.status(400).json({ error: "Candidate Username or Student ID already exists" });

            const cand = new CandidateModel({
                studentId, name, username, password,
                eligible: !!eligible,
                registeredCourses: []
            });
            await cand.save();
            return res.json({ success: true, candidate: cand });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const exists = db.candidates.some(c => c.username === username || c.studentId === studentId);
        if (exists) return res.status(400).json({ error: "Candidate Username or Student ID already exists" });

        const newCand = {
            id: Date.now().toString(),
            studentId, name, username, password,
            eligible: !!eligible,
            signedConsent: false,
            registrationSubmitted: false,
            registrationStatus: 'Pending',
            registeredCourses: [],
            registrationData: {},
            midSemFeedback: {},
            endSemFeedback: {},
            exitFormSubmitted: false,
            exitAnswers: {}
        };
        db.candidates.push(newCand);
        saveJSONData(db);
        return res.json({ success: true, candidate: newCand });
    }
});

// 5. Get List of Candidates (Admin Only)
app.get('/api/admin/candidates', async (req, res) => {
    if (useMongo) {
        try {
            const list = await CandidateModel.find({});
            return res.json(list);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        return res.json(db.candidates);
    }
});

// 6. Toggle Candidate Exam Eligibility (Admin Only)
app.post('/api/admin/set-eligibility/:id', async (req, res) => {
    const { id } = req.params;
    const { eligible } = req.body;

    if (useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found" });
            cand.eligible = !!eligible;
            await cand.save();
            return res.json({ success: true, eligible: cand.eligible });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = db.candidates.find(c => c.id === id);
        if (!cand) return res.status(404).json({ error: "Candidate not found" });
        cand.eligible = !!eligible;
        saveJSONData(db);
        return res.json({ success: true, eligible: cand.eligible });
    }
});

// 7. Get Candidate Profile details
app.get('/api/candidate/profile/:id', async (req, res) => {
    const { id } = req.params;

    if (useMongo) {
        try {
            const cand = await CandidateModel.findById(id).select('-password');
            if (!cand) return res.status(404).json({ error: "Profile not found" });
            return res.json(cand);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = db.candidates.find(c => c.id === id);
        if (!cand) return res.status(404).json({ error: "Profile not found" });
        const { password, ...safeData } = cand;
        return res.json(safeData);
    }
});

// 8. Submit Candidate Course Registration with in-memory files stream to Cloudinary
app.post('/api/candidate/complete-registration/:id', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'undertaking', maxCount: 1 }
]), async (req, res) => {
    const { id } = req.params;
    const { preferredName, dob, permanentAddress, localAddress, billingAddress, emergencyName, emergencyRelation, emergencyAddress, emergencyPhone, personalPhone, personalEmail, collegeEmail, courses } = req.body;
    
    const files = req.files;

    if (!preferredName || !dob || !permanentAddress || !localAddress || !billingAddress || !emergencyName || !emergencyRelation || !emergencyAddress || !emergencyPhone || !personalPhone || !personalEmail || !collegeEmail || !courses) {
        return res.status(400).json({ error: "All text fields are required." });
    }

    if (!files || !files.photo || !files.signature || !files.undertaking) {
        return res.status(400).json({ error: "Photo, Signature, and Undertaking file uploads are required." });
    }

    try {
        let photoUrl = '';
        let signatureUrl = '';
        let undertakingUrl = '';

        if (useCloudinary) {
            // Stream files buffer directly to Cloudinary folder BICS_2026
            photoUrl = await uploadToCloudinary(files.photo[0].buffer, 'BICS_2026/photos');
            signatureUrl = await uploadToCloudinary(files.signature[0].buffer, 'BICS_2026/signatures');
            undertakingUrl = await uploadToCloudinary(files.undertaking[0].buffer, 'BICS_2026/undertakings');
        } else {
            // Default mock fallback URLs if credentials not provided
            photoUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            signatureUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            undertakingUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
        }

        const parsedCourses = JSON.parse(courses);
        const registrationData = {
            preferredName, dob, permanentAddress, localAddress, billingAddress,
            emergencyContact: {
                name: emergencyName,
                relationship: emergencyRelation,
                address: emergencyAddress,
                phone: emergencyPhone
            },
            personalPhone, personalEmail, collegeEmail,
            photoUrl, signatureUrl, undertakingUrl
        };

        if (useMongo) {
            const cand = await CandidateModel.findById(id);
            cand.registrationData = registrationData;
            cand.registeredCourses = parsedCourses;
            cand.registrationSubmitted = true;
            await cand.save();
            await logSystemAction(cand.name || id, "REGISTRATION_COMPLETE", `Completed BICS portal student registration for ${cand.name || id}`, "info");
            return res.json({ success: true, profile: cand });
        } else {
            const db = getJSONData();
            const cand = db.candidates.find(c => c.id === id);
            cand.registrationData = registrationData;
            cand.registeredCourses = parsedCourses;
            cand.registrationSubmitted = true;
            saveJSONData(db);
            await logSystemAction(cand.name || id, "REGISTRATION_COMPLETE", `Completed BICS portal student registration for ${cand.name || id}`, "info");
            return res.json({ success: true, profile: cand });
        }
    } catch (e) {
        console.error(e);
        await logSystemAction(id, "REGISTRATION_FAILED", `Failed student registration attempt: ${e.message || e}`, "error");
        return res.status(500).json({ error: "Uploading files failed. Please verify Cloudinary keys." });
    }
});

// 9. Sign Malpractice Consent
app.post('/api/candidate/consent/:id', async (req, res) => {
    const { id } = req.params;
    const { type } = req.body; // 'mid' or 'end'

    try {
        let activeType = type;
        if (!activeType) {
            if (useMongo) {
                const config = await ConfigModel.findOne();
                activeType = config?.examType === 'midsem' ? 'mid' : 'end';
            } else {
                const db = getJSONData();
                activeType = db.config?.examType === 'midsem' ? 'mid' : 'end';
            }
        }

        if (useMongo) {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found." });
            
            cand.signedConsent = true;
            if (activeType === 'mid') {
                cand.midSemConsentSigned = true;
            } else {
                cand.endSemConsentSigned = true;
            }
            await cand.save();
            await logSystemAction(cand.name || id, 'CONSENT_SIGNED', `Candidate signed malpractice & proctoring consent for ${activeType} sem, unlocking Hall Ticket`, 'info');
            return res.json({ success: true, signedConsent: true, student: cand });
        } else {
            const db = getJSONData();
            const cand = db.candidates.find(c => c.id === id || c._id === id);
            if (!cand) return res.status(404).json({ error: "Candidate not found." });

            cand.signedConsent = true;
            if (activeType === 'mid') {
                cand.midSemConsentSigned = true;
            } else {
                cand.endSemConsentSigned = true;
            }
            saveJSONData(db);
            await logSystemAction(cand.name || id, 'CONSENT_SIGNED', `Candidate signed malpractice & proctoring consent for ${activeType} sem, unlocking Hall Ticket`, 'info');
            return res.json({ success: true, signedConsent: true, student: cand });
        }
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to sign malpractice consent for candidate ID ${id}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 10. Submit Feedback
app.post('/api/candidate/feedback/:id', async (req, res) => {
    const { id } = req.params;
    const { type, feedback } = req.body; // type = 'mid' or 'end', feedback = { courseName: [answers] }

    if (useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found." });

            if (type === 'mid') {
                if (cand.midSemFeedback && cand.midSemFeedback.size > 0) {
                    return res.status(400).json({ error: "Mid Semester Feedback has already been submitted." });
                }
                cand.midSemFeedback = feedback;
            } else {
                if (cand.endSemFeedback && cand.endSemFeedback.size > 0) {
                    return res.status(400).json({ error: "End Semester Feedback has already been submitted." });
                }
                cand.endSemFeedback = feedback;
            }
            await cand.save();
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = db.candidates.find(c => c.id === id);
        if (!cand) return res.status(404).json({ error: "Candidate not found." });

        if (type === 'mid') {
            if (cand.midSemFeedback && Object.keys(cand.midSemFeedback).length > 0) {
                return res.status(400).json({ error: "Mid Semester Feedback has already been submitted." });
            }
            cand.midSemFeedback = feedback;
        } else {
            if (cand.endSemFeedback && Object.keys(cand.endSemFeedback).length > 0) {
                return res.status(400).json({ error: "End Semester Feedback has already been submitted." });
            }
            cand.endSemFeedback = feedback;
        }
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// 10a-2. Generate Ledger QR Verification Data
app.get('/api/candidate/ledger-qr-data/:id', async (req, res) => {
    const { id } = req.params;
    const { type } = req.query; // 'mid' or 'end'
    
    if (type !== 'mid' && type !== 'end') {
        return res.status(400).json({ error: "Invalid type. Must be 'mid' or 'end'." });
    }
    
    try {
        let student;
        if (useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                student = await CandidateModel.findById(id);
            }
            if (!student) {
                student = await CandidateModel.findOne({ studentId: id });
            }
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === id || c._id === id || c.studentId === id);
        }
        
        if (!student) return res.status(404).json({ error: "Candidate not found." });
        
        const studentId = student.studentId;
        
        // Count classroom submissions
        let submissions = [];
        if (useMongo) {
            submissions = await ClassroomSubmissionModel.find({ studentId: studentId });
        } else {
            const db = getJSONData();
            submissions = (db.classroomSubmissions || []).filter(s => s.studentId && s.studentId.trim().toUpperCase() === studentId.trim().toUpperCase());
        }
        const gradesCount = submissions.length;
        
        // Generate secure signature
        const crypto = require('crypto');
        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
        const payloadText = studentId + '_' + type + '_' + gradesCount;
        const hash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 16);
        
        return res.json({
            success: true,
            studentId,
            type,
            gradesCount,
            hash
        });
    } catch (err) {
        console.error("Failed to generate QR data:", err);
        return res.status(500).json({ error: "Failed to generate QR signature." });
    }
});

// 10b. Upload Signed Ledger (Coursework submission verification with Automated QR validation)
app.post('/api/candidate/upload-ledger/:id', upload.single('ledgerFile'), async (req, res) => {
    const { id } = req.params;
    const { type } = req.body; // 'mid' or 'end'
    
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "Ledger file is required." });
        if (type !== 'mid' && type !== 'end') return res.status(400).json({ error: "Invalid feedback/ledger type specified." });

        // Fetch candidate details
        let student;
        if (useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === id || c._id === id);
        }
        if (!student) return res.status(404).json({ error: "Candidate profile not found." });

        // --- SECURE AUTOMATED QR VALIDATION ---
        let qrValid = false;
        let qrScanError = "No security QR code detected. Please ensure you print the official ledger from the portal, scan/photograph it clearly without blur, and re-upload.";
        
        try {
            const jsQR = require('jsqr');
            const { Jimp } = require('jimp');
            
            let imgBuffer = null;
            if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
                const { pdf } = await import('pdf-to-img');
                const document = await pdf(file.buffer, { scale: 3.0 });
                for await (const pageImg of document) {
                    imgBuffer = pageImg;
                    break;
                }
            } else if (file.mimetype.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.originalname)) {
                imgBuffer = file.buffer;
            }
            
            if (imgBuffer) {
                const image = await Jimp.read(imgBuffer);
                const { width, height } = image.bitmap;
                const rgbaBuffer = image.bitmap.data;
                const code = jsQR(new Uint8ClampedArray(rgbaBuffer), width, height);
                
                if (code && code.data) {
                    try {
                        const qrData = JSON.parse(code.data);
                        const crypto = require('crypto');
                        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
                        const payloadText = qrData.studentId + '_' + qrData.type + '_' + qrData.gradesCount;
                        const expectedHash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 16);
                        
                        if (qrData.studentId === student.studentId && qrData.type === type && qrData.hash === expectedHash) {
                            qrValid = true;
                        } else {
                            qrScanError = "Tamper Detection Alert: Coursework Ledger QR signature mismatch. Please print the unmodified document.";
                        }
                    } catch (parseErr) {
                        qrScanError = "Decryption Error: QR code does not contain a valid BICS security payload.";
                    }
                }
            }
        } catch (qrErr) {
            console.error("[QR_VALIDATION_SYSTEM_ERROR]:", qrErr);
            qrScanError = "Verification Error: Failed to process document. Error: " + qrErr.message;
        }
        
        if (!qrValid) {
            return res.status(400).json({ error: qrScanError });
        }

        let fileUrl = '';
        if (useCloudinary) {
            fileUrl = await uploadToCloudinary(file.buffer, `BICS_2026/ledgers_${type}`);
        } else {
            if (process.env.VERCEL || process.env.RENDER) {
                // Prevent ephemeral filesystem writes on production hosts (Vercel/Render) if Cloudinary keys not configured
                fileUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            } else {
                // Local fallback upload for local testing
                const uploadsDir = path.join(__dirname, 'public', 'uploads');
                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }
                const fileName = `ledger-${type}-${id}-${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
                const filePath = path.join(uploadsDir, fileName);
                fs.writeFileSync(filePath, file.buffer);
                const host = `${req.protocol}://${req.get('host')}`;
                fileUrl = `${host}/public/uploads/${fileName}`;
            }
        }

        if (useMongo) {
            const updateField = type === 'mid' ? { midSemLedgerUrl: fileUrl } : { endSemLedgerUrl: fileUrl };
            const student = await CandidateModel.findByIdAndUpdate(id, updateField, { new: true });
            if (!student) return res.status(404).json({ error: "Candidate not found." });
            await logSystemAction(student.name || 'candidate', 'LEDGER_UPLOADED', `Uploaded signed ${type} semester ledger`, 'info');
            return res.json({ success: true, student });
        } else {
            const db = getJSONData();
            const student = db.candidates.find(c => c.id === id || c._id === id);
            if (!student) return res.status(404).json({ error: "Candidate not found." });
            
            if (type === 'mid') {
                student.midSemLedgerUrl = fileUrl;
            } else {
                student.endSemLedgerUrl = fileUrl;
            }
            saveJSONData(db);
            await logSystemAction(student.name || 'candidate', 'LEDGER_UPLOADED', `Uploaded signed ${type} semester ledger`, 'info');
            return res.json({ success: true, student });
        }
    } catch (err) {
        console.error("Ledger upload failed:", err);
        return res.status(500).json({ error: "Ledger upload failed." });
    }
});

// 10c. Send Email Verification Code (Hall Ticket / Password Change)
app.post('/api/candidate/send-verification-code/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let student;
        if (useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === id || c._id === id);
        }

        if (!student) return res.status(404).json({ error: "Candidate not found." });

        const studentEmail = student.registrationData?.personalEmail || student.personalEmail;
        if (!studentEmail) {
            return res.status(400).json({ error: "No email registered for this candidate. Please contact support." });
        }

        // Generate 6-digit random code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        if (useMongo) {
            student.verificationCode = code;
            student.verificationCodeExpires = expires;
            await student.save();
        } else {
            student.verificationCode = code;
            student.verificationCodeExpires = expires;
            const db = getJSONData();
            const candIdx = db.candidates.findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        // Send email
        await sendVerificationEmail(studentEmail, student.name || 'Candidate', code);

        return res.json({ success: true, message: "Verification code sent to your email." });
    } catch (err) {
        console.error("Failed to send verification code:", err);
        return res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }
});

// 10d. Verify Code (For Hall Ticket / Password Change verification)
app.post('/api/candidate/verify-code/:id', async (req, res) => {
    const { id } = req.params;
    const { code, type } = req.body; // type is 'mid' or 'end' if verifying for exam

    if (!code) return res.status(400).json({ error: "Verification code is required." });

    try {
        let student;
        if (useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === id || c._id === id);
        }

        if (!student) return res.status(404).json({ error: "Candidate not found." });

        if (!student.verificationCode || student.verificationCode !== code.trim()) {
            return res.status(400).json({ error: "Invalid verification code." });
        }

        if (new Date() > new Date(student.verificationCodeExpires)) {
            return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
        }

        // Clear code on successful verification so it cannot be reused, and flag email as verified if verifying for exam
        if (useMongo) {
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            if (type === 'mid') {
                student.midSemEmailVerified = true;
            } else if (type === 'end') {
                student.endSemEmailVerified = true;
            }
            await student.save();
        } else {
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            if (type === 'mid') {
                student.midSemEmailVerified = true;
            } else if (type === 'end') {
                student.endSemEmailVerified = true;
            }
            const db = getJSONData();
            const candIdx = db.candidates.findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        await logSystemAction(student.name || 'candidate', 'EMAIL_VERIFIED', `Candidate verified email successfully for ${type || 'action'}`, 'info');
        return res.json({ success: true, message: "Verification successful.", student });
    } catch (err) {
        console.error("Code verification failed:", err);
        return res.status(500).json({ error: "Verification failed. Please try again." });
    }
});

// 10e. Centralized PDF Hall Ticket Generator
app.get('/api/candidate/generate-hallticket/:id', async (req, res) => {
    const { id } = req.params;
    const type = req.query?.type || req.body?.type; // 'mid' or 'end'
    const t = req.query?.t || req.body?.t || Date.now();
    const hallTicketNumber = String(t);

    if (type !== 'mid' && type !== 'end') {
        return res.status(400).send("<h3>Error</h3><p>Invalid exam type specified. Must be 'mid' or 'end'.</p>");
    }

    try {
        let student;
        let systemConfig;

        if (useMongo) {
            student = await CandidateModel.findById(id);
            systemConfig = await ConfigModel.findOne();
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === id || c._id === id);
            systemConfig = db.config;
        }

        if (!student) {
            return res.status(404).send("<h3>Error</h3><p>Candidate profile not found.</p>");
        }

        // Verify eligibility checklist
        if (!student.eligible) {
            return res.status(403).send("<h3>Error</h3><p>You are not eligible to take this examination.</p>");
        }

        const isMid = type === 'mid';
        const consentSigned = isMid ? student.midSemConsentSigned : student.endSemConsentSigned;
        const feedback = isMid ? student.midSemFeedback : student.endSemFeedback;
        const ledgerUrl = isMid ? student.midSemLedgerUrl : student.endSemLedgerUrl;
        const emailVerified = isMid ? student.midSemEmailVerified : student.endSemEmailVerified;

        if (!consentSigned) {
            return res.status(403).send("<h3>Error</h3><p>Malpractice Undertaking Consent has not been signed for this semester.</p>");
        }
        if (!feedback || Object.keys(feedback).length === 0) {
            return res.status(403).send("<h3>Error</h3><p>Course Feedback Survey has not been submitted for this semester.</p>");
        }
        if (!ledgerUrl) {
            return res.status(403).send("<h3>Error</h3><p>Signed Coursework Ledger has not been uploaded for this semester.</p>");
        }
        if (!emailVerified) {
            return res.status(403).send("<h3>Error</h3><p>Email verification is pending for this semester.</p>");
        }

        // Initialize PDF Document
        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        doc.page.margins.bottom = 10;

        // Set response headers to prompt inline preview or download with strict anti-caching
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="hallticket-${type}sem-${student.studentId || id}.pdf"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        doc.pipe(res);

        // Security Verification HMAC Hash for Hall Ticket Number & Security QR
        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
        const payloadText = `${student.studentId || id}_${type}_${hallTicketNumber}_${student.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'}`;
        const hmacHash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 24);

        // Hall Ticket Number in Typewriter Font (Top Right over logo)
        doc.fillColor('#334155')
           .font('Courier-Bold')
           .fontSize(8.5)
           .text(`Hall Ticket Number - ${hallTicketNumber}`, 30, 16, { align: 'right', width: 535 });

        // Header Section
        const logoPath = path.join(__dirname, 'public', 'logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 30, 30, { width: 55 });
        }

        const bicsLogoPath = path.join(__dirname, 'public', 'bics_logo.png');
        if (fs.existsSync(bicsLogoPath)) {
            doc.image(bicsLogoPath, 510, 30, { width: 55 });
        }

        // Header Texts
        doc.fillColor('#002147')
           .font('Helvetica-Bold')
           .fontSize(16)
           .text("PRELIMINARY EXAMINATIONS 2026", 95, 33, { align: 'left' });

        doc.fillColor('#475569')
           .font('Helvetica-Bold')
           .fontSize(8.5)
           .text("BASIC INTRODUCTORY COMPUTER SCIENCE (BICS) COURSE", 95, 53, { align: 'left' });

        const typeLabel = isMid ? "MID-SEMESTER TESTS 2026" : "END SEMESTER EXAMINATION 2026";
        const typeColor = isMid ? '#b91c1c' : '#002147';
        doc.fillColor(typeColor)
           .font('Helvetica-Bold')
           .fontSize(10.5)
           .text(typeLabel, 95, 70, { align: 'left' });

        // Horizontal Line
        doc.strokeColor('#002147')
           .lineWidth(1.5)
           .moveTo(30, 95)
           .lineTo(565, 95)
           .stroke();

        // Helper function to fetch remote/local image buffers
        const fetchImageBuffer = async (url) => {
            if (!url) return null;
            if (url.includes('/public/uploads/')) {
                const fileName = url.substring(url.indexOf('/public/uploads/') + 16);
                const localPath = path.join(__dirname, 'public', 'uploads', fileName);
                if (fs.existsSync(localPath)) {
                    try { return fs.readFileSync(localPath); } catch (e) {}
                }
            }
            try {
                const response = await fetch(url);
                if (response.ok) {
                    return Buffer.from(await response.arrayBuffer());
                }
            } catch (e) {
                console.error("HTTP fetch failed for URL:", url, e.message);
            }
            return null;
        };

        // Fetch Photo & Signature buffers asynchronously
        const photoUrl = student.registrationData?.photoUrl;
        const sigUrl = student.registrationData?.signatureUrl;
        
        const [photoBuffer, sigBuffer] = await Promise.all([
            fetchImageBuffer(photoUrl),
            fetchImageBuffer(sigUrl)
        ]);

        // Metadata Grid (X=30 to X=390, Photo at X=410, Signature at X=490)
        let yOffset = 110;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("CANDIDATE FULL NAME:", 30, yOffset);
        doc.fontSize(10).fillColor('#002147').font('Helvetica-Bold').text(student.name || 'Candidate Name', 165, yOffset);

        yOffset += 16;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("STUDENT ID NUMBER:", 30, yOffset);
        doc.fontSize(10).fillColor('#002147').font('Helvetica-Bold').text(student.studentId || 'ID Number', 165, yOffset);

        yOffset += 16;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("EMAIL ADDRESS:", 30, yOffset);
        doc.fontSize(9.5).fillColor('#002147').font('Helvetica-Bold').text(student.registrationData?.personalEmail || student.personalEmail || 'Email', 165, yOffset);

        yOffset += 16;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("CANDIDATE ADDRESS:", 30, yOffset);
        const candAddr = student.registrationData?.permanentAddress || student.permanentAddress || 'Address details registered in candidate records.';
        doc.fontSize(8.5).fillColor('#334155').font('Helvetica').text(candAddr, 165, yOffset, { width: 230, align: 'left' });

        // Embed Photo Box
        doc.rect(410, 107, 70, 85).strokeColor('#cbd5e1').lineWidth(1).stroke();
        if (photoBuffer) {
            try { doc.image(photoBuffer, 411, 108, { width: 68, height: 83 }); } catch (e) { console.error("Error drawing photo:", e); }
        }
        doc.fontSize(6.5).fillColor('#64748b').font('Helvetica-Bold').text("PHOTOGRAPH", 410, 198, { width: 70, align: 'center' });

        // Embed Signature Box
        doc.rect(490, 107, 75, 85).strokeColor('#cbd5e1').lineWidth(1).stroke();
        if (sigBuffer) {
            try { doc.image(sigBuffer, 492, 120, { width: 71, height: 60 }); } catch (e) { console.error("Error drawing signature:", e); }
        }
        doc.fontSize(6.5).fillColor('#64748b').font('Helvetica-Bold').text("SIGNATURE", 490, 198, { width: 75, align: 'center' });

        // Grid border separator
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, 212).lineTo(565, 212).stroke();

        // Timetable Title
        doc.fillColor('#002147').font('Helvetica-Bold').fontSize(10).text("EXAMS & TIMETABLE SCHEDULE:", 30, 222);

        // Draw Timetable Header
        let tableY = 238;
        doc.rect(30, tableY, 535, 18).fill('#f1f5f9');
        
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
        doc.text("Course Code", 35, tableY + 5);
        doc.text("Course", 110, tableY + 5);
        doc.text("Exam Date", 295, tableY + 5);
        doc.text("Time", 370, tableY + 5);
        doc.text("Marks", 450, tableY + 5);
        doc.text("Invigilator Signature", 485, tableY + 5);

        // Draw Timetable Rows
        const timetable = systemConfig?.timetable || [];
        doc.font('Helvetica').fontSize(8).fillColor('#334155');

        timetable.forEach((t, idx) => {
            tableY += 18;
            // Row divider line
            doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, tableY).lineTo(565, tableY).stroke();

            doc.font('Helvetica-Bold').fillColor('#002147').text(t.code || `CS-10${idx+1}`, 35, tableY + 5);
            doc.font('Helvetica').fillColor('#334155').text(t.course || 'Course Name', 110, tableY + 5, { width: 175 });
            doc.text(t.date || 'TBA', 295, tableY + 5);
            doc.text(t.time || 'TBA', 370, tableY + 5);
            doc.font('Helvetica-Bold').text(t.marks !== undefined ? String(t.marks) : '50', 450, tableY + 5);
            
            // Dotted signature verification line
            doc.strokeColor('#cbd5e1').lineWidth(0.5).dash(1, { space: 1 }).moveTo(485, tableY + 13).lineTo(560, tableY + 13).stroke().undash();
        });

        // Bottom border of the table
        tableY += 18;
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, tableY).lineTo(565, tableY).stroke();

        // Conduct Violations instruction box
        let conductY = tableY + 15;
        doc.rect(30, conductY, 535, 110).fillAndStroke('#f8fafc', '#cbd5e1');
        
        doc.fillColor('#002147').font('Helvetica-Bold').fontSize(8.5).text("MANDATORY EXAM CONDUCT CODES (ONLINE & OFFLINE VIOLATIONS)", 38, conductY + 8);
        
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(38, conductY + 22).lineTo(557, conductY + 22).stroke();

        // Online Rules Column
        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(7.5).text("Online Proctored Exam Rules:", 38, conductY + 28);
        doc.fillColor('#475569').font('Helvetica').fontSize(6.8);
        let ruleY = conductY + 38;
        const onlineRules = [
            "- Max 3 window focus alerts allowed. Exceeding this triggers automatic test lockout.",
            "- Continuous real-time webcam & mic feeds are matched against candidate reference files.",
            "- Active screen sharing capture and clipboard tracking are mandatory.",
            "- Closing fullscreen mode or launching background terminals constitutes disqualification."
        ];
        onlineRules.forEach(rule => {
            doc.text(rule, 38, ruleY, { width: 250 });
            ruleY += doc.heightOfString(rule, { width: 250 }) + 2;
        });

        // Offline Rules Column
        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(7.5).text("Offline Center Hall Rules:", 300, conductY + 28);
        doc.fillColor('#475569').font('Helvetica').fontSize(6.8);
        ruleY = conductY + 38;
        const offlineRules = [
            "- Candidates must report 30 mins prior; late entries beyond 15 mins strictly disallowed.",
            "- Mobile phones, smartwatches, or programmable devices are strictly forbidden.",
            "- This printed Hall Ticket along with an official physical ID is mandatory.",
            "- Rough sheets must be submitted to the invigilator prior to exiting the hall."
        ];
        offlineRules.forEach(rule => {
            doc.text(rule, 300, ruleY, { width: 250 });
            ruleY += doc.heightOfString(rule, { width: 250 }) + 2;
        });

        // Malpractice Undertaking Agreement
        let undertakerY = conductY + 120;
        doc.rect(30, undertakerY, 535, 40).fillAndStroke('#f1f5f9', '#cbd5e1');
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7).text("Malpractice violation consent undertaker declaration:", 35, undertakerY + 6);
        doc.font('Helvetica').fontSize(6.5).text(
            "I hereby confirm that I have consented to the malpractice undertaking electronically. I accept that failing to comply with online proctoring parameters or offline test center regulations will terminate my test immediately and annul all marks for BICS 2026.",
            35, undertakerY + 16, { width: 525, lineGap: 1 }
        );

        // Footer Signatures & Stamp block (Well-spaced above bottom footer)
        let footerY = Math.max(undertakerY + 60, 665);

        // Candidate Sign
        if (sigBuffer) {
            try { doc.image(sigBuffer, 50, footerY - 5, { width: 70, height: 25 }); } catch(e) {}
        }
        doc.strokeColor('#002147').lineWidth(0.5).moveTo(30, footerY + 28).lineTo(140, footerY + 28).stroke();
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text("Candidate Signature (Verification)", 30, footerY + 32);

        // Security Verification HMAC QR Code (Center Footer)
        try {
            const qrPayload = JSON.stringify({
                sid: student.studentId || id,
                name: student.name,
                exam: type,
                ticketNo: hallTicketNumber,
                sign: hmacHash
            });
            
            const qrBuffer = qrImage.imageSync(qrPayload, { type: 'png', margin: 1, size: 2 });
            doc.image(qrBuffer, 270, footerY - 14, { width: 56, height: 56 });
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(5.5).text("SECURITY VERIFICATION QR", 240, footerY + 45, { width: 116, align: 'center', lineBreak: false });
        } catch (qrErr) {
            console.error("Failed to render security verification QR in PDF:", qrErr);
        }

        // Registrar Sign
        doc.strokeColor('#002147').lineWidth(0.5).moveTo(440, footerY + 28).lineTo(565, footerY + 28).stroke();
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text("Chief Registrar (PE Board Exams)", 440, footerY + 32);

        // Page Bottom Footer (Strictly locked to bottom of A4)
        const pdfFooterY = doc.page.height - 42;
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, pdfFooterY).lineTo(565, pdfFooterY).stroke();
        
        doc.fillColor('#64748b')
           .font('Helvetica-Bold')
           .fontSize(7)
           .text("Basic Introductory Computer Science (BICS) Course", 30, pdfFooterY + 6, { align: 'center', lineBreak: false });
           
        doc.font('Helvetica')
           .fontSize(6.5)
           .text("Conducted by Preliminary Examinations 2026", 30, pdfFooterY + 15, { align: 'center', lineBreak: false });
           
        doc.font('Helvetica')
           .fontSize(6)
           .text("© All rights reserved", 30, pdfFooterY + 24, { align: 'center', lineBreak: false });

        // Finalize document
        doc.end();

    } catch (err) {
        console.error("Failed to generate PDF Hall Ticket:", err);
        return res.status(500).send(`<h3>Technical Error</h3><p>Failed to generate PDF document: ${err.message}</p>`);
    }
});

// 11. Submit Exit Form
app.post('/api/candidate/exit-form/:id', async (req, res) => {
    const { id } = req.params;
    const { answers } = req.body;

    if (useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            cand.exitAnswers = answers;
            cand.exitFormSubmitted = true;
            await cand.save();
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = db.candidates.find(c => c.id === id);
        cand.exitAnswers = answers;
        cand.exitFormSubmitted = true;
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// 13. Video Lectures Endpoints
app.get('/api/video-lectures', async (req, res) => {
    if (useMongo) {
        try {
            const list = await VideoLectureModel.find({}).sort({ createdAt: 1 });
            return res.json(list);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.videoLectures = db.videoLectures || [];
        return res.json(db.videoLectures);
    }
});

app.post('/api/admin/video-lectures', async (req, res) => {
    const { section, title, youtubeUrl, hasPlayground, playgroundLanguage, codeTemplate, webHtmlTemplate, webCssTemplate, webJsTemplate } = req.body;
    if (!section || !title || !youtubeUrl) {
        return res.status(400).json({ error: "Section, Title, and YouTube Link are required" });
    }

    if (useMongo) {
        try {
            const lect = new VideoLectureModel({
                section,
                title,
                youtubeUrl,
                hasPlayground: !!hasPlayground,
                playgroundLanguage: playgroundLanguage || 'cpp',
                codeTemplate: codeTemplate || '',
                webHtmlTemplate: webHtmlTemplate || '',
                webCssTemplate: webCssTemplate || '',
                webJsTemplate: webJsTemplate || ''
            });
            await lect.save();
            return res.json({ success: true, lecture: lect });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.videoLectures = db.videoLectures || [];
        const newLect = {
            id: Date.now().toString(),
            section,
            title,
            youtubeUrl,
            hasPlayground: !!hasPlayground,
            playgroundLanguage: playgroundLanguage || 'cpp',
            codeTemplate: codeTemplate || '',
            webHtmlTemplate: webHtmlTemplate || '',
            webCssTemplate: webCssTemplate || '',
            webJsTemplate: webJsTemplate || '',
            createdAt: new Date()
        };
        db.videoLectures.push(newLect);
        saveJSONData(db);
        return res.json({ success: true, lecture: newLect });
    }
});

app.delete('/api/admin/video-lectures/:id', async (req, res) => {
    const { id } = req.params;

    if (useMongo) {
        try {
            await VideoLectureModel.findByIdAndDelete(id);
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.videoLectures = db.videoLectures || [];
        db.videoLectures = db.videoLectures.filter(l => l.id !== id);
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// 14. Course Materials Endpoints
app.get('/api/course-materials', async (req, res) => {
    if (useMongo) {
        try {
            const list = await CourseMaterialModel.find({}).sort({ createdAt: 1 });
            return res.json(list);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.courseMaterials = db.courseMaterials || [];
        return res.json(db.courseMaterials);
    }
});

app.post('/api/admin/course-materials', upload.single('materialFile'), async (req, res) => {
    const { section, title } = req.body;
    const file = req.file;

    if (!section || !title) {
        return res.status(400).json({ error: "Section and Title are required" });
    }

    if (!file) {
        return res.status(400).json({ error: "Document file upload is required." });
    }

    try {
        let fileUrl = '';
        if (useCloudinary) {
            // Upload the document buffer directly to Cloudinary
            fileUrl = await uploadToCloudinary(file.buffer, 'BICS_2026/materials');
        } else {
            // Mock fallback url
            fileUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
        }

        if (useMongo) {
            const mat = new CourseMaterialModel({ section, title, fileUrl });
            await mat.save();
            return res.json({ success: true, material: mat });
        } else {
            const db = getJSONData();
            db.courseMaterials = db.courseMaterials || [];
            const newMat = {
                id: Date.now().toString(),
                section,
                title,
                fileUrl,
                createdAt: new Date()
            };
            db.courseMaterials.push(newMat);
            saveJSONData(db);
            return res.json({ success: true, material: newMat });
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Uploading course material document failed." });
    }
});

// Admin Image upload router to Cloudinary
app.post('/api/admin/upload-image', upload.single('imageFile'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "Image file upload is required." });

        let fileUrl = '';
        if (useCloudinary) {
            fileUrl = await uploadToCloudinary(file.buffer, 'BICS_2026/questions');
        } else {
            if (process.env.VERCEL || process.env.RENDER) {
                // Prevent ephemeral filesystem writes on production hosts (Vercel/Render) if Cloudinary keys not configured
                fileUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            } else {
                // Local fallback upload to verify locally without configured keys
                const uploadsDir = path.join(__dirname, 'public', 'uploads');
                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }
                const fileName = `question-${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
                const filePath = path.join(uploadsDir, fileName);
                fs.writeFileSync(filePath, file.buffer);
                const host = `${req.protocol}://${req.get('host')}`;
                fileUrl = `${host}/public/uploads/${fileName}`;
            }
        }

        return res.json({ success: true, url: fileUrl });
    } catch (err) {
        console.error("Image upload failed:", err);
        return res.status(500).json({ error: "Image upload to Cloudinary failed." });
    }
});

app.delete('/api/admin/course-materials/:id', async (req, res) => {
    const { id } = req.params;

    if (useMongo) {
        try {
            await CourseMaterialModel.findByIdAndDelete(id);
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.courseMaterials = db.courseMaterials || [];
        db.courseMaterials = db.courseMaterials.filter(m => m.id !== id);
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// 12. Verify Candidate Registration (Admin Only)
app.post('/api/admin/verify-registration/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'Approved' or 'Rejected' or 'Pending'

    if (useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found" });
            cand.registrationStatus = status;
            if (status === 'Rejected') {
                cand.registrationSubmitted = false; // Reset so they can re-register
            }
            await cand.save();
            return res.json({ success: true, registrationStatus: cand.registrationStatus, registrationSubmitted: cand.registrationSubmitted });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = db.candidates.find(c => c.id === id || c._id === id);
        if (!cand) return res.status(404).json({ error: "Candidate not found" });
        cand.registrationStatus = status;
        if (status === 'Rejected') {
            cand.registrationSubmitted = false;
        }
        saveJSONData(db);
        return res.json({ success: true, registrationStatus: cand.registrationStatus, registrationSubmitted: cand.registrationSubmitted });
    }
});

// ==========================================
// ONLINE TEST MODULE ENDPOINTS
// ==========================================// 10a-2. Generate Ledger QR Verification Data
app.get('/api/candidate/ledger-qr-data/:id', async (req, res) => {
    const { id } = req.params;
    const { type } = req.query; // 'mid' or 'end'
    
    if (type !== 'mid' && type !== 'end') {
        return res.status(400).json({ error: "Invalid type. Must be 'mid' or 'end'." });
    }
    
    try {
        let student = null;
        if (useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                student = await CandidateModel.findById(id);
            }
            if (!student) {
                student = await CandidateModel.findOne({
                    $or: [
                        { studentId: id },
                        { studentId: new RegExp(`^${id}$`, 'i') },
                        { id: id }
                    ]
                });
            }
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id || c.studentId === id || (c.studentId && c.studentId.toUpperCase() === id.toUpperCase()));
        }
        
        if (!student) {
            return res.json({
                success: false,
                studentId: id,
                verificationStatus: 'not_found',
                message: "Candidate ledger verification data pending."
            });
        }
        
        const studentId = student.studentId;
        
        // Count classroom submissions
        let submissions = [];
        if (useMongo) {
            submissions = await ClassroomSubmissionModel.find({ studentId: studentId });
        } else {
            const db = getJSONData();
            submissions = (db.classroomSubmissions || []).filter(s => s.studentId && s.studentId.trim().toUpperCase() === studentId.trim().toUpperCase());
        }
        const gradesCount = submissions.length;
        
        // Generate secure signature
        const crypto = require('crypto');
        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
        const payloadText = studentId + '_' + type + '_' + gradesCount;
        const hash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 16);
        
        return res.json({
            success: true,
            studentId,
            studentName: student.name,
            examType: type,
            gradesCount,
            signature: hash,
            verifiedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error in ledger-qr-data:", e);
        return res.json({
            success: false,
            studentId: id,
            verificationStatus: 'error',
            message: e.message
        });
    }
});

// Helper for safely building candidate query filter without triggering Mongoose CastError on ObjectId
const buildCandidateQueryFilter = (candidateIdInput) => {
    if (!candidateIdInput) return null;
    const strVal = candidateIdInput.toString().trim();
    if (!strVal || strVal === 'admin') return null;
    if (mongoose.Types.ObjectId.isValid(strVal)) {
        return { $or: [{ candidateId: new mongoose.Types.ObjectId(strVal) }, { studentId: strVal }] };
    }
    return { studentId: strVal };
};

// 1. Get active tests for student dashboard (Strips answer keys for security)
app.get('/api/tests/active', async (req, res) => {
    const { candidateId } = req.query;
    try {
        const now = new Date();
        let activeTests = [];

        if (useMongo) {
            activeTests = await TestConfigModel.find({
                $or: [{ isPublished: true }, { isPublished: { $exists: false } }]
            }).lean();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            activeTests = db.tests.filter(t => t.isPublished !== false);
        }

        // Sort activeTests so that the newest tests appear first (descending creation/start order)
        activeTests.sort((a, b) => {
            const idA = a._id ? a._id.toString() : '';
            const idB = b._id ? b._id.toString() : '';
            if (idA && idB && idA.length === 24 && idB.length === 24) {
                return idB.localeCompare(idA); // Descending by creation timestamp
            }
            const dateA = new Date(a.startDate || 0);
            const dateB = new Date(b.startDate || 0);
            return dateB - dateA; // Fallback to descending by start date
        });

        const sanitizedTests = await Promise.all(activeTests.map(async (t) => {
            const tObj = { ...t };
            const testId = tObj.id || tObj._id;
            let submissionStatus = null;
            if (candidateId && candidateId !== 'admin') {
                try {
                    if (useMongo) {
                        const candFilter = buildCandidateQueryFilter(candidateId);
                        const isValidTestObjId = mongoose.Types.ObjectId.isValid(testId.toString());

                        const testConditions = [];
                        if (isValidTestObjId) {
                            testConditions.push({ testId: new mongoose.Types.ObjectId(testId.toString()) });
                            testConditions.push({ testId: testId.toString() });
                        }

                        if (candFilter && testConditions.length > 0) {
                            const sub = await TestSubmissionModel.findOne({
                                $and: [
                                    candFilter,
                                    { $or: testConditions }
                                ]
                            }).sort({ startedAt: -1 });
                            if (sub) submissionStatus = sub.status;
                        }
                    } else {
                        const db = getJSONData();
                        db.testSubmissions = db.testSubmissions || [];
                        const sub = db.testSubmissions.find(s => 
                            s.candidateId && s.testId &&
                            (s.candidateId.toString() === candidateId.toString() || s.studentId === candidateId.toString()) && 
                            s.testId.toString() === testId.toString()
                        );
                        if (sub) submissionStatus = sub.status;
                    }
                } catch (subErr) {
                    console.error("Warning querying submissionStatus for active test:", subErr);
                }
            }
            return { 
                id: testId,
                _id: testId,
                title: tObj.title,
                marks: tObj.marks,
                duration: tObj.duration,
                startDate: tObj.startDate,
                endDate: tObj.endDate,
                instructions: tObj.instructions,
                questionsCount: (tObj.questions || []).length,
                submissionStatus 
            };
        }));

        return res.json(sanitizedTests || []);
    } catch (e) {
        console.error("Error in /api/tests/active:", e);
        return res.json([]);
    }
});

// 1b. Get submitted tests for verification answers copy (Candidate view)
app.get('/api/tests/submitted', async (req, res) => {
    const { candidateId } = req.query;
    if (!candidateId) {
        return res.status(400).json({ error: "candidateId is required" });
    }
    try {
        let submissions = [];
        if (useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            if (candFilter) {
                submissions = await TestSubmissionModel.find(candFilter);
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submissions = db.testSubmissions.filter(s => s.candidateId && s.candidateId.toString() === candidateId.toString());
        }

        const enrichedList = await Promise.all(submissions.map(async (subDoc) => {
            let sub = subDoc;
            let test = null;
            const testId = sub.testId;
            if (useMongo) {
                test = await TestConfigModel.findById(testId);
                if (test) {
                    recalculateMCQScore(sub, test);
                }
            } else {
                const db = getJSONData();
                db.tests = db.tests || [];
                test = db.tests.find(t => (t.id || t._id).toString() === testId.toString());
                if (test) {
                    const dbSub = db.testSubmissions.find(s => s.id === sub.id || s._id === sub._id);
                    if (dbSub) {
                        recalculateMCQScore(dbSub, test);
                        saveJSONData(db);
                        sub = dbSub;
                    }
                }
            }

            if (!test) return null;

            const vStatus = test.verificationStatus || (test.answersReleased ? 'released' : 'not_released');
            const isReleased = (vStatus === 'released');

            return {
                id: testId,
                title: test.title,
                marks: test.marks,
                startDate: test.startDate,
                endDate: test.endDate,
                answersReleased: isReleased,
                verificationStatus: vStatus,
                submission: {
                    id: sub._id || sub.id,
                    status: sub.status,
                    submittedAt: sub.submittedAt,
                    proctoringLog: sub.proctoringLog,
                    evaluation: sub.evaluation,
                    reevaluation: sub.reevaluation,
                    objections: sub.objections || [],
                    answers: isReleased ? sub.answers : [],
                    questions: isReleased ? test.questions : []
                }
            };
        }));

        const finalResults = enrichedList.filter(item => item !== null);
        return res.json(finalResults);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. Get specific test for exam view (Strips answer keys)
app.get('/api/tests/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let test = null;
        if (useMongo) {
            test = await TestConfigModel.findById(id).lean();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === id || t._id === id);
        }

        if (!test) return res.status(404).json({ error: "Test not found" });

        const qSanitized = (test.questions || []).map(q => {
            if (q.type === 'mcq') {
                const { correctOptionIndex, ...rest } = q;
                return rest;
            }
            return q;
        });

        return res.json({ ...test, questions: qSanitized });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 3. Initialize/retrieve test submission session for candidate
app.post('/api/tests/start/:id', async (req, res) => {
    const { id } = req.params;
    const { candidateId, candidateName, studentId } = req.body;

    if (!candidateId) return res.status(400).json({ error: "Candidate ID is required" });
    console.log(`DEBUG: POST /api/tests/start/:id candidateId=${candidateId} testId=${id}`);

    try {
        let test = null;
        if (useMongo) {
            test = await TestConfigModel.findById(id);
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === id || t._id === id);
        }

        if (!test) return res.status(404).json({ error: "Test configuration not found" });

        let submission = null;
        if (useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            const queryTestId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId });
            }
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }
            submission = new TestSubmissionModel({
                candidateId: mongoose.Types.ObjectId.isValid(candidateId) ? new mongoose.Types.ObjectId(candidateId) : undefined,
                candidateName,
                studentId,
                testId: id,
                testTitle: test.title,
                startedAt: new Date(),
                status: 'started',
                answers: []
            });
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => 
                s.candidateId && s.testId &&
                s.candidateId.toString() === candidateId.toString() && 
                s.testId.toString() === id.toString()
            );
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }
            submission = {
                id: Date.now().toString(),
                _id: Date.now().toString(),
                candidateId,
                candidateName,
                studentId,
                testId: id,
                testTitle: test.title,
                startedAt: new Date(),
                status: 'started',
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' },
                answers: []
            };
            db.testSubmissions.push(submission);
            saveJSONData(db);
        }

        await logSystemAction(candidateName || studentId || 'Candidate', 'TEST_STARTED', `Candidate started the examination "${test.title}" (${id})`, 'info');
        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to initialize test session for candidate ID ${candidateId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// Secure One-Time Exam Token Generator
app.post('/api/tests/generate-token', async (req, res) => {
    const { candidateId, testId } = req.body;
    if (!candidateId || !testId) {
        return res.status(400).json({ error: "Candidate ID and Test ID are required." });
    }
    try {
        // Verify if candidate has already completed/submitted this test
        let submission = null;
        if (useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            const queryTestId = mongoose.Types.ObjectId.isValid(testId) ? new mongoose.Types.ObjectId(testId) : testId;
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId });
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.candidateId === candidateId && s.testId === testId);
        }
        if (submission && submission.status !== 'started') {
            return res.status(400).json({ error: "You have already completed and submitted this examination. Re-attempts are not permitted." });
        }

        // Generate a cryptographically secure token
        const tokenStr = require('crypto').randomBytes(24).toString('hex');

        if (useMongo) {
            const newToken = new TestTokenModel({
                token: tokenStr,
                candidateId,
                testId
            });
            await newToken.save();
        } else {
            const db = getJSONData();
            db.tokens = db.tokens || [];
            // Clean up expired tokens (older than 2 minutes)
            db.tokens = db.tokens.filter(t => (Date.now() - new Date(t.createdAt).getTime()) < 120000);
            db.tokens.push({
                token: tokenStr,
                candidateId,
                testId,
                createdAt: new Date()
            });
            saveJSONData(db);
        }

        return res.json({ success: true, token: tokenStr });
    } catch (err) {
        console.error("Token generation failed:", err);
        return res.status(500).json({ error: "Failed to generate exam access token." });
    }
});

// Secure One-Time Exam Token Verification
app.post('/api/tests/verify-token', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required." });

    try {
        let tokenDoc = null;
        if (useMongo) {
            tokenDoc = await TestTokenModel.findOne({ token });
        } else {
            const db = getJSONData();
            db.tokens = db.tokens || [];
            tokenDoc = db.tokens.find(t => t.token === token && (Date.now() - new Date(t.createdAt).getTime()) < 120000);
        }

        if (!tokenDoc) {
            return res.status(401).json({ error: "Invalid or expired exam token. Please login through the main portal dashboard again." });
        }

        // Fetch student profile details (candidate) and test details
        let student = null;
        let test = null;
        if (useMongo) {
            student = await CandidateModel.findById(tokenDoc.candidateId);
            test = await TestConfigModel.findById(tokenDoc.testId);
            // Delete the token immediately after verification (one-time use!)
            await TestTokenModel.deleteOne({ token });
        } else {
            const db = getJSONData();
            student = db.candidates.find(c => c.id === tokenDoc.candidateId || c._id === tokenDoc.candidateId);
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === tokenDoc.testId || t._id === tokenDoc.testId);
            db.tokens = db.tokens.filter(t => t.token !== token);
            saveJSONData(db);
        }

        if (!student || !test) {
            return res.status(404).json({ error: "Student or Test configuration associated with this token not found." });
        }

        // Strip correct MCQ options from the response sent to the client (to match existing student active tests endpoint design)
        const qSanitized = (test.questions || []).map(q => {
            let qObj = q.toObject ? q.toObject() : { ...q };
            if (qObj.type === 'mcq') {
                const { correctOptionIndex, ...rest } = qObj;
                return rest;
            }
            return qObj;
        });

        // Fetch submission details if already attempted
        let submission = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findOne({ candidateId: student._id, testId: test._id });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const studId = student.id || student._id;
            const tId = test.id || test._id;
            submission = db.testSubmissions.find(s => s.candidateId === studId && s.testId === tId);
        }

        if (submission) {
            return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
        }

        return res.json({
            success: true,
            candidate: {
                id: student._id || student.id,
                name: student.name,
                studentId: student.studentId,
                email: student.registrationData?.collegeEmail || student.registrationData?.personalEmail || student.username || "candidate@college.edu",
                photoUrl: student.registrationData?.photoUrl || "/public/uploads/default-photo.png"
            },
            test: {
                id: test._id || test.id,
                title: test.title,
                duration: test.duration,
                marks: test.marks,
                instructions: test.instructions,
                questions: qSanitized
            },
            submission: submission
        });
    } catch (err) {
        console.error("Token verification failed:", err);
        return res.status(500).json({ error: "Internal server error during exam token verification." });
    }
});

// Global in-memory lock for active submissions being processed to prevent duplicate grading runs
const activeSubmissionsProcessing = new Set();

// 4. Submit candidate exam answers and auto-grade MCQ parts
app.post('/api/tests/submit', async (req, res) => {
    const { submissionId, answers, proctoringLog, status } = req.body;

    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });
    console.log(`DEBUG: POST /api/tests/submit submissionId=${submissionId} answersLength=${answers?.length} status=${status}`);

    const isFinalSubmission = status !== 'started';

    if (isFinalSubmission) {
        if (activeSubmissionsProcessing.has(submissionId)) {
            console.log(`DEBUG: Ignoring duplicate final submission request for ID ${submissionId} (already processing)`);
            return res.status(429).json({ error: "Submission is already being processed. Please wait." });
        }
        activeSubmissionsProcessing.add(submissionId);
    }

    try {
        let submission = null;
        if (useMongo) {
            let retries = 5;
            while (retries > 0) {
                try {
                    submission = await TestSubmissionModel.findById(submissionId);
                    if (!submission) return res.status(404).json({ error: "Submission not found" });

                    // Duplicate submission guard: if already in final status, return immediately
                    if (isFinalSubmission && (submission.status === 'submitted' || submission.status === 'auto-submitted' || submission.status === 'evaluated')) {
                        console.log(`DEBUG: Ignoring duplicate submission for ID ${submissionId} (already in status ${submission.status})`);
                        return res.json({ success: true, submission });
                    }

                    submission.answers = answers;
                    if (proctoringLog) {
                        submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active', events: [] };
                        submission.proctoringLog.fullscreenExits = proctoringLog.fullscreenExits !== undefined ? proctoringLog.fullscreenExits : submission.proctoringLog.fullscreenExits;
                        submission.proctoringLog.tabSwitches = proctoringLog.tabSwitches !== undefined ? proctoringLog.tabSwitches : submission.proctoringLog.tabSwitches;
                        submission.proctoringLog.webcamStatus = proctoringLog.webcamStatus !== undefined ? proctoringLog.webcamStatus : submission.proctoringLog.webcamStatus;
                    }
                    submission.status = status || 'submitted';
                    if (status !== 'started') {
                        submission.submittedAt = new Date();
                    }

                    const test = await TestConfigModel.findById(submission.testId);
                    if (test) {
                        recalculateMCQScore(submission, test);
                        calculateCodingScoreFast(submission, test);
                    } else {
                        submission.evaluation = {
                            mcqScore: 0,
                            codingScore: 0,
                            feedback: '',
                            evaluatedAt: null
                        };
                    }

                    await submission.save();
                    break; // Save successful!
                } catch (saveErr) {
                    if (saveErr.name === 'VersionError' || saveErr.name === 'ParallelSaveError') {
                        retries--;
                        console.log(`DEBUG: VersionError on submission save for ID ${submissionId}. Retrying... (${retries} retries left)`);
                        if (retries === 0) throw saveErr;
                        await new Promise(resolve => setTimeout(resolve, 50 * (6 - retries)));
                    } else {
                        throw saveErr;
                    }
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            // Duplicate submission guard: if already in final status, return immediately
            if (isFinalSubmission && (submission.status === 'submitted' || submission.status === 'auto-submitted' || submission.status === 'evaluated')) {
                console.log(`DEBUG: Ignoring duplicate submission for ID ${submissionId} (already in status ${submission.status})`);
                return res.json({ success: true, submission });
            }

            submission.answers = answers;
            if (proctoringLog) {
                submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active', events: [] };
                submission.proctoringLog.fullscreenExits = proctoringLog.fullscreenExits !== undefined ? proctoringLog.fullscreenExits : submission.proctoringLog.fullscreenExits;
                submission.proctoringLog.tabSwitches = proctoringLog.tabSwitches !== undefined ? proctoringLog.tabSwitches : submission.proctoringLog.tabSwitches;
                submission.proctoringLog.webcamStatus = proctoringLog.webcamStatus !== undefined ? proctoringLog.webcamStatus : submission.proctoringLog.webcamStatus;
            }
            submission.status = status || 'submitted';
            if (status !== 'started') {
                submission.submittedAt = new Date();
            }

            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === submission.testId || t._id === submission.testId);
            if (test) {
                recalculateMCQScore(submission, test);
                calculateCodingScoreFast(submission, test);
            } else {
                submission.evaluation = {
                    mcqScore: 0,
                    codingScore: 0,
                    feedback: '',
                    evaluatedAt: null
                };
            }

            saveJSONData(db);
        }

        if (status !== 'started') {
            await logSystemAction(submission?.candidateName || 'Candidate', status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED', `Candidate submitted examination answers for "${submission?.testTitle || 'Exam'}" (${submission?.testId || 'ID'}) with status ${status || 'submitted'}`, 'info');
        }
        return res.json({ success: true, submission });
    } catch (e) {
        console.error("DEBUG ERROR: POST /api/tests/submit failed:", e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to process exam submission for candidate submission ID ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    } finally {
        if (isFinalSubmission) {
            activeSubmissionsProcessing.delete(submissionId);
        }
    }
});

// Healthcheck ping endpoint
app.get('/api/health', (req, res) => {
    return res.json({ status: "ok" });
});

// 5. Get all configured tests (Admin view with complete correct keys)
app.get('/api/admin/tests', async (req, res) => {
    try {
        let tests = [];
        if (useMongo) {
            tests = await TestConfigModel.find({ isDeleted: { $ne: true } });
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            tests = db.tests.filter(t => !t.isDeleted);
        }
        return res.json(tests);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

const findTestConfig = async (id) => {
    if (!id) return null;
    const strId = id.toString();
    if (mongoose.Types.ObjectId.isValid(strId)) {
        return await TestConfigModel.findOne({ _id: new mongoose.Types.ObjectId(strId), isDeleted: { $ne: true } });
    }
    return null;
};

// 5b. Set verification status for answer sheets (Admin only: not_released | released | closed)
app.post('/api/admin/tests/set-verification-status/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['not_released', 'released', 'closed'].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status. Must be 'not_released', 'released', or 'closed'." });
    }
    try {
        let updatedStatus = status;
        let isReleased = (status === 'released');
        if (useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.verificationStatus = status;
            test.answersReleased = isReleased;
            await test.save();
            await logSystemAction('admin', 'VERIFICATION_STATUS_CHANGE', `Set verificationStatus for test "${test.title}" (${id}) to ${status}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === id || t._id === id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.verificationStatus = status;
            test.answersReleased = isReleased;
            saveJSONData(db);
            await logSystemAction('admin', 'VERIFICATION_STATUS_CHANGE', `Set verificationStatus for test "${test.title}" (${id}) to ${status}`, 'info');
        }
        return res.json({ success: true, verificationStatus: updatedStatus, answersReleased: isReleased });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 5c. Toggle answers release state for candidate answer sheets view (Admin only)
app.post('/api/admin/tests/toggle-release/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};
    try {
        let verificationStatus = 'not_released';
        let answersReleased = false;
        if (useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            if (status && ['not_released', 'released', 'closed'].includes(status)) {
                test.verificationStatus = status;
            } else {
                if (!test.verificationStatus || test.verificationStatus === 'not_released') test.verificationStatus = 'released';
                else if (test.verificationStatus === 'released') test.verificationStatus = 'closed';
                else test.verificationStatus = 'not_released';
            }
            test.answersReleased = (test.verificationStatus === 'released');
            await test.save();
            verificationStatus = test.verificationStatus;
            answersReleased = test.answersReleased;
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Updated verificationStatus for test "${test.title}" (${id}) to ${verificationStatus}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === id || t._id === id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            if (status && ['not_released', 'released', 'closed'].includes(status)) {
                test.verificationStatus = status;
            } else {
                if (!test.verificationStatus || test.verificationStatus === 'not_released') test.verificationStatus = 'released';
                else if (test.verificationStatus === 'released') test.verificationStatus = 'closed';
                else test.verificationStatus = 'not_released';
            }
            test.answersReleased = (test.verificationStatus === 'released');
            verificationStatus = test.verificationStatus;
            answersReleased = test.answersReleased;
            saveJSONData(db);
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Updated verificationStatus for test "${test.title}" (${id}) to ${verificationStatus}`, 'info');
        }
        return res.json({ success: true, verificationStatus, answersReleased });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 5c. Toggle display/publish state for student visibility (Admin only)
app.post('/api/admin/tests/toggle-publish/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let isPublished = false;
        if (useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.isPublished = !test.isPublished;
            await test.save();
            isPublished = test.isPublished;
            await logSystemAction('admin', 'TEST_PUBLISH_TOGGLE', `Toggled isPublished visibility status for test "${test.title}" (${id}) to ${isPublished}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === id || t._id === id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.isPublished = !test.isPublished;
            isPublished = test.isPublished;
            saveJSONData(db);
            await logSystemAction('admin', 'TEST_PUBLISH_TOGGLE', `Toggled isPublished visibility status for test "${test.title}" (${id}) to ${isPublished}`, 'info');
        }
        return res.json({ success: true, isPublished });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 6. Create/configure a test (Admin only)
app.post('/api/admin/tests', async (req, res) => {
    const { _id, id, code, title, marks, instructions, duration, startDate, endDate, questions, isPublished } = req.body;
    console.log("DEBUG: POST /api/admin/tests req.body =", JSON.stringify(req.body, null, 2));
    if (!title || !duration || !startDate || !endDate) {
        return res.status(400).json({ error: "Title, Duration, Start Date, and End Date are required" });
    }

    try {
        const normalizedQuestions = (questions || []).map((q, qIdx) => {
            const qObj = q.toObject ? q.toObject() : { ...q };
            const mainText = qObj.questionText || qObj.title || qObj.description || qObj.question || qObj.statement || '';
            const qId = qObj.id || qObj._id || `q_${Date.now()}_${qIdx + 1}`;
            return {
                ...qObj,
                id: qId,
                title: qObj.title || mainText,
                questionText: qObj.questionText || mainText,
                description: qObj.description || mainText
            };
        });

        let savedTest = null;
        const testId = _id || (id && mongoose.Types.ObjectId.isValid(id.toString()) ? id : null);
        if (useMongo) {
            if (testId) {
                savedTest = await findTestConfig(testId);
            }
            if (savedTest) {
                savedTest.title = title;
                savedTest.marks = Number(marks || 0);
                savedTest.instructions = instructions || '';
                savedTest.duration = Number(duration || 60);
                savedTest.startDate = new Date(startDate);
                savedTest.endDate = new Date(endDate);
                savedTest.questions = normalizedQuestions;
                if (isPublished !== undefined) savedTest.isPublished = isPublished;
                await savedTest.save();
            } else {
                savedTest = new TestConfigModel({ title, marks, instructions, duration, startDate, endDate, questions: normalizedQuestions, isPublished: isPublished || false });
                await savedTest.save();
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            if (testId) {
                const idx = db.tests.findIndex(t => t.id === testId || t._id === testId);
                if (idx !== -1) {
                    db.tests[idx] = {
                        ...db.tests[idx],
                        title,
                        marks: Number(marks || 0),
                        instructions: instructions || '',
                        duration: Number(duration || 60),
                        startDate,
                        endDate,
                        questions: normalizedQuestions
                    };
                    if (isPublished !== undefined) db.tests[idx].isPublished = isPublished;
                    savedTest = db.tests[idx];
                }
            }
            if (!savedTest) {
                savedTest = {
                    id: Date.now().toString(),
                    _id: Date.now().toString(),
                    title,
                    marks: Number(marks || 0),
                    instructions,
                    duration: Number(duration || 60),
                    startDate,
                    endDate,
                    questions: normalizedQuestions,
                    answersReleased: false,
                    isPublished: isPublished || false
                };
                db.tests.push(savedTest);
            }
            saveJSONData(db);
        }
        await logSystemAction('admin', 'TEST_SAVED', `Saved test config: "${title}" (${marks} marks, Duration: ${duration} mins)`, 'info');
        return res.json({ success: true, test: savedTest });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to save test config: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 7. Delete test config (Admin only - moves to 24-Hour Recycle Bin)
app.delete('/api/admin/tests/:id', async (req, res) => {
    const { id } = req.params;
    const deletedBy = req.body?.adminUsername || 'admin';
    try {
        const deletedAt = new Date();
        const expiresAt = new Date(deletedAt.getTime() + 24 * 60 * 60 * 1000); // 24 Hours retention

        if (useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }

            const targetId = test._id;
            test.isDeleted = true;
            test.deletedAt = deletedAt;
            test.deletedBy = deletedBy;
            await test.save();

            // Soft-delete linked candidate submissions
            const subQuery = { testId: targetId };
            const subDocs = await TestSubmissionModel.find(subQuery);
            await TestSubmissionModel.updateMany(subQuery, {
                $set: { isDeleted: true, deletedAt: deletedAt, restoreToken: targetId.toString() }
            });

            // Create entry in Recycle Bin collection
            const recycleEntry = new RecycleBinModel({
                entityType: 'TestConfig',
                entityId: targetId.toString(),
                title: test.title || 'Test Configuration',
                code: '',
                deletedBy: deletedBy,
                deletedAt: deletedAt,
                expiresAt: expiresAt,
                cascadeCount: subDocs.length,
                cascadeDetails: { candidateSubmissions: subDocs.length },
                snapshot: { test, submissions: subDocs }
            });
            await recycleEntry.save();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.testSubmissions = db.testSubmissions || [];
            db.recycleBin = db.recycleBin || [];

            const testIdx = db.tests.findIndex(t => t.id === id || t._id === id);
            if (testIdx !== -1) {
                const test = db.tests[testIdx];
                test.isDeleted = true;
                test.deletedAt = deletedAt;
                test.deletedBy = deletedBy;

                const subDocs = db.testSubmissions.filter(s => s.testId === id || s.testId === test._id || s.testTitle === test.title);
                subDocs.forEach(s => {
                    s.isDeleted = true;
                    s.deletedAt = deletedAt;
                    s.restoreToken = id;
                });

                db.recycleBin.push({
                    _id: 'rb_' + Date.now(),
                    entityType: 'TestConfig',
                    entityId: id,
                    title: test.title || test.code || 'Test Configuration',
                    code: test.code || test.id || '',
                    deletedBy: deletedBy,
                    deletedAt: deletedAt.toISOString(),
                    expiresAt: expiresAt.toISOString(),
                    cascadeCount: subDocs.length,
                    cascadeDetails: { candidateSubmissions: subDocs.length },
                    snapshot: { test, submissions: subDocs }
                });
                saveJSONData(db);
            }
        }
        await logSystemAction('admin', 'TEST_SOFT_DELETED', `Moved test config "${id}" and related submissions to 24-Hour Recycle Bin`, 'info');
        return res.json({ success: true, message: "Moved to Recycle Bin. You have 24 hours to restore this item." });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to soft-delete test config ID ${id}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// --- 24-HOUR RECYCLE BIN REST API ENDPOINTS ---

// GET /api/admin/recycle-bin - List active recycled items
app.get('/api/admin/recycle-bin', async (req, res) => {
    try {
        const now = new Date();
        let items = [];
        if (useMongo) {
            // Auto-purge any expired entities and recycle bin entries
            const expiredItems = await RecycleBinModel.find({ expiresAt: { $lte: now } });
            for (const item of expiredItems) {
                if (item.entityType === 'TestConfig') {
                    await TestConfigModel.deleteOne({ _id: item.entityId });
                    await TestSubmissionModel.deleteMany({ restoreToken: item.entityId });
                }
            }
            await RecycleBinModel.deleteMany({ expiresAt: { $lte: now } });

            items = await RecycleBinModel.find({ expiresAt: { $gt: now } }).sort({ deletedAt: -1 });
        } else {
            const db = getJSONData();
            db.recycleBin = db.recycleBin || [];
            db.recycleBin = db.recycleBin.filter(item => new Date(item.expiresAt) > now);
            saveJSONData(db);
            items = db.recycleBin;
        }

        const formatted = items.map(item => {
            const doc = item.toObject ? item.toObject() : item;
            const expTime = new Date(doc.expiresAt).getTime();
            const timeRemainingMs = Math.max(0, expTime - now.getTime());
            return {
                ...doc,
                timeRemainingMs
            };
        });

        return res.json(formatted);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/recycle-bin/restore/:id - Restore recycled item & all cascaded items
app.post('/api/admin/recycle-bin/restore/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (useMongo) {
            const rbItem = await RecycleBinModel.findById(id).catch(() => null) || await RecycleBinModel.findOne({ entityId: id });
            if (!rbItem) {
                return res.status(404).json({ success: false, error: "Item not found in Recycle Bin or retention period expired." });
            }

            if (rbItem.entityType === 'TestConfig') {
                const targetId = rbItem.entityId;
                await TestConfigModel.updateOne({ _id: targetId }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, deletedBy: 1 } });
                await TestSubmissionModel.updateMany({ $or: [{ testId: targetId }, { restoreToken: targetId }] }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, restoreToken: 1 } });
            } else if (rbItem.entityType === 'TestSubmission') {
                await TestSubmissionModel.updateOne({ _id: rbItem.entityId }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, restoreToken: 1 } });
            }

            await RecycleBinModel.deleteOne({ _id: rbItem._id });
            await logSystemAction('admin', 'RECYCLE_BIN_RESTORE', `Restored item "${rbItem.title}" (${rbItem.entityId}) and all cascaded records from Recycle Bin`, 'info');
        } else {
            const db = getJSONData();
            db.recycleBin = db.recycleBin || [];
            const rbIdx = db.recycleBin.findIndex(item => item._id === id || item.entityId === id);
            if (rbIdx === -1) {
                return res.status(404).json({ success: false, error: "Item not found in Recycle Bin." });
            }

            const rbItem = db.recycleBin[rbIdx];
            if (rbItem.entityType === 'TestConfig') {
                const test = (db.tests || []).find(t => t.id === rbItem.entityId || t._id === rbItem.entityId);
                if (test) {
                    test.isDeleted = false;
                    delete test.deletedAt;
                    delete test.deletedBy;
                }
                (db.testSubmissions || []).forEach(s => {
                    if (s.restoreToken === rbItem.entityId || s.testId === rbItem.entityId) {
                        s.isDeleted = false;
                        delete s.deletedAt;
                        delete s.restoreToken;
                    }
                });
            }
            db.recycleBin.splice(rbIdx, 1);
            saveJSONData(db);
            await logSystemAction('admin', 'RECYCLE_BIN_RESTORE', `Restored item "${rbItem.title}" (${rbItem.entityId}) from Recycle Bin`, 'info');
        }

        return res.json({ success: true, message: "Item and all associated data successfully restored to active status!" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/recycle-bin/purge/:id - Permanently hard-delete recycled item
app.delete('/api/admin/recycle-bin/purge/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (useMongo) {
            const rbItem = await RecycleBinModel.findById(id).catch(() => null) || await RecycleBinModel.findOne({ entityId: id });
            if (!rbItem) {
                return res.status(404).json({ success: false, error: "Item not found in Recycle Bin." });
            }

            if (rbItem.entityType === 'TestConfig') {
                const targetId = rbItem.entityId;
                if (mongoose.Types.ObjectId.isValid(targetId)) {
                    await TestConfigModel.findByIdAndDelete(targetId);
                }
                if (mongoose.Types.ObjectId.isValid(targetId)) {
                    await TestConfigModel.findByIdAndDelete(targetId);
                    await TestSubmissionModel.deleteMany({ $or: [{ testId: targetId }, { restoreToken: targetId }] });
                }
            }

            await RecycleBinModel.deleteOne({ _id: rbItem._id });
            await logSystemAction('admin', 'RECYCLE_BIN_PURGE', `Permanently deleted item "${rbItem.title}" (${rbItem.entityId}) and all cascaded data`, 'warning');
        } else {
            const db = getJSONData();
            db.recycleBin = db.recycleBin || [];
            const rbIdx = db.recycleBin.findIndex(item => item._id === id || item.entityId === id);
            if (rbIdx !== -1) {
                const rbItem = db.recycleBin[rbIdx];
                db.tests = (db.tests || []).filter(t => t.id !== rbItem.entityId && t._id !== rbItem.entityId);
                db.testSubmissions = (db.testSubmissions || []).filter(s => s.testId !== rbItem.entityId && s.restoreToken !== rbItem.entityId);
                db.recycleBin.splice(rbIdx, 1);
                saveJSONData(db);
            }
        }
        return res.json({ success: true, message: "Item permanently deleted from system." });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/recycle-bin/purge-all - Permanently purge all recycled items
app.post('/api/admin/recycle-bin/purge-all', async (req, res) => {
    try {
        if (useMongo) {
            const allItems = await RecycleBinModel.find({});
            for (const item of allItems) {
                if (item.entityType === 'TestConfig') {
                    await TestConfigModel.deleteOne({ _id: item.entityId });
                    await TestSubmissionModel.deleteMany({ $or: [{ testId: item.entityId }, { restoreToken: item.entityId }] });
                }
            }
            await RecycleBinModel.deleteMany({});
        } else {
            const db = getJSONData();
            (db.recycleBin || []).forEach(item => {
                db.tests = (db.tests || []).filter(t => t.id !== item.entityId && t._id !== item.entityId);
                db.testSubmissions = (db.testSubmissions || []).filter(s => s.testId !== item.entityId && s.restoreToken !== item.entityId);
            });
            db.recycleBin = [];
            saveJSONData(db);
        }
        await logSystemAction('admin', 'RECYCLE_BIN_PURGE_ALL', `Purged all items from Recycle Bin`, 'warning');
        return res.json({ success: true, message: "All recycled items permanently deleted." });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 8. Fetch candidate submissions for a test (Admin only)
app.get('/api/admin/tests/submissions/:testId', async (req, res) => {
    const { testId } = req.params;
    try {
        let subs = [];
        if (useMongo) {
            if (!testId || testId === 'all') {
                subs = await TestSubmissionModel.find({ isDeleted: { $ne: true } }).sort({ startedAt: -1 });
            } else if (mongoose.Types.ObjectId.isValid(testId)) {
                subs = await TestSubmissionModel.find({
                    $or: [{ testId: new mongoose.Types.ObjectId(testId) }, { testId: String(testId) }],
                    isDeleted: { $ne: true }
                }).sort({ startedAt: -1 });
            } else {
                subs = await TestSubmissionModel.find({ testId: String(testId), isDeleted: { $ne: true } }).sort({ startedAt: -1 });
            }

            // Auto-heal dynamic scores against test configs
            const allTests = await TestConfigModel.find({});
            for (let sub of subs) {
                try {
                    const matchingTest = allTests.find(t => String(t._id || t.id) === String(sub.testId));
                    if (matchingTest) {
                        calculateSubmissionScore(sub, matchingTest);
                    }
                } catch (err) {
                    console.error("Score recalculation warning:", err);
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            if (!testId || testId === 'all') {
                subs = db.testSubmissions.filter(s => !s.isDeleted);
            } else {
                subs = db.testSubmissions.filter(s => String(s.testId) === String(testId) && !s.isDeleted);
            }
            const allTests = db.tests || [];
            subs.forEach(sub => {
                const matchingTest = allTests.find(t => String(t.id || t._id) === String(sub.testId));
                if (matchingTest) {
                    try {
                        calculateSubmissionScore(sub, matchingTest);
                    } catch (err) {
                        console.error("Score recalculation warning:", err);
                    }
                }
            });
            saveJSONData(db);
        }
        return res.json(subs || []);
    } catch (e) {
        console.error("Error fetching test submissions:", e);
        return res.status(200).json([]);
    }
});

// 9. Save manual grading score and feedback for coding/MCQ/web tasks (Admin only)
app.post('/api/admin/tests/evaluate/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { codingScore, feedback, reevaluationStatus, resolutionFeedback, answers } = req.body;

    try {
        let submission = null;
        let test = null;

        if (useMongo) {
            if (mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({ id: submissionId });
            }
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            test = await TestConfigModel.findById(submission.testId);
            if (!test) {
                test = await TestConfigModel.findOne({ id: submission.testId });
            }

            if (answers && Array.isArray(answers)) {
                answers.forEach(item => {
                    const existingAns = (submission.answers || []).find(a => String(a.questionId) === String(item.questionId));
                    if (existingAns && item.score !== undefined && !isNaN(item.score)) {
                        const quest = test?.questions?.find(q => String(q.id || q._id) === String(item.questionId));
                        const maxPts = Number(quest?.points || existingAns.maxPoints || 100);
                        existingAns.score = Math.max(0, Math.min(Number(item.score), maxPts));
                        existingAns.isManuallyGraded = true;
                    }
                });
            }

            if (test) {
                calculateSubmissionScore(submission, test);
            }
            submission.evaluation.feedback = feedback || '';
            submission.evaluation.evaluatedAt = new Date();
            submission.status = 'evaluated';

            if (reevaluationStatus) {
                if (!submission.reevaluation) {
                    submission.reevaluation = { applied: true };
                }
                submission.reevaluation.status = reevaluationStatus;
                submission.reevaluation.resolutionFeedback = resolutionFeedback || '';
            }

            submission.markModified('answers');
            submission.markModified('evaluation');
            if (submission.reevaluation) {
                submission.markModified('reevaluation');
            }
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => String(s.id || s._id) === String(submissionId));
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            test = (db.tests || []).find(t => String(t.id || t._id) === String(submission.testId));

            if (answers && Array.isArray(answers)) {
                answers.forEach(item => {
                    const existingAns = (submission.answers || []).find(a => String(a.questionId) === String(item.questionId));
                    if (existingAns && item.score !== undefined && !isNaN(item.score)) {
                        const quest = test?.questions?.find(q => String(q.id || q._id) === String(item.questionId));
                        const maxPts = Number(quest?.points || existingAns.maxPoints || 100);
                        existingAns.score = Math.max(0, Math.min(Number(item.score), maxPts));
                        existingAns.isManuallyGraded = true;
                    }
                });
            }

            if (test) {
                calculateSubmissionScore(submission, test);
            }
            submission.evaluation.feedback = feedback || '';
            submission.evaluation.evaluatedAt = new Date();
            submission.status = 'evaluated';

            if (reevaluationStatus) {
                if (!submission.reevaluation) {
                    submission.reevaluation = { applied: true };
                }
                submission.reevaluation.status = reevaluationStatus;
                submission.reevaluation.resolutionFeedback = resolutionFeedback || '';
            }

            saveJSONData(db);
        }
        await logSystemAction('admin', 'STUDENT_EVALUATED', `Evaluated exam submission ID: ${submissionId} for student "${submission?.candidateName || 'Unknown'}"`, 'info');
        return res.json({ success: true, submission });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to save candidate evaluation details: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 10. File candidate complaint for re-evaluation (Candidate view)
app.post('/api/tests/reevaluation/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { complaintText, complainedQuestions, proofImages } = req.body;
    
    if (!complaintText) {
        return res.status(400).json({ error: "Complaint explanation is required." });
    }

    try {
        let submission = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) {
                return res.status(404).json({ error: "Exam submission not found." });
            }
            submission.reevaluation = {
                applied: true,
                appliedAt: new Date(),
                complaintText,
                complainedQuestions: complainedQuestions || [],
                proofImages: proofImages || [],
                status: 'pending',
                resolutionFeedback: ''
            };
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) {
                return res.status(404).json({ error: "Exam submission not found." });
            }
            submission.reevaluation = {
                applied: true,
                appliedAt: new Date(),
                complaintText,
                complainedQuestions: complainedQuestions || [],
                proofImages: proofImages || [],
                status: 'pending',
                resolutionFeedback: ''
            };
            saveJSONData(db);
        }

        await logSystemAction(submission?.candidateName || 'Candidate', 'COMPLAINT_SUBMITTED', `Candidate filed a re-evaluation request for test "${submission?.testTitle || 'Exam'}" (${submission?.testId || 'ID'})`, 'warning');
        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to register candidate complaint for submission ID ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 10b. Get Submission Verification Data for OT Terminal
app.get('/api/tests/submission-verification/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let submission = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findById(id);
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === id || s._id === id);
        }

        if (!submission) {
            return res.status(404).json({ success: false, error: "Submission not found." });
        }

        let test = null;
        let student = null;
        if (useMongo) {
            test = await TestConfigModel.findById(submission.testId);
            student = await CandidateModel.findById(submission.candidateId);
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.candidates = db.candidates || [];
            test = db.tests.find(t => t.id === String(submission.testId) || t._id === String(submission.testId));
            student = db.candidates.find(c => c.id === String(submission.candidateId) || c._id === String(submission.candidateId));
        }

        if (!test) {
            return res.status(404).json({ success: false, error: "Associated examination configuration not found." });
        }

        const vStatus = test.verificationStatus || (test.answersReleased ? 'released' : 'not_released');

        // Security Gate: Check if verification window is open
        if (vStatus === 'closed') {
            return res.status(403).json({
                success: false,
                locked: true,
                verificationStatus: 'closed',
                error: "The answer sheet verification window for this examination has closed. Evaluated answer sheets are no longer accessible."
            });
        }

        if (vStatus === 'not_released') {
            return res.status(403).json({
                success: false,
                locked: true,
                verificationStatus: 'not_released',
                error: "Answer sheets for this examination have not been released by the administrator yet."
            });
        }

        return res.json({
            success: true,
            verificationStatus: vStatus,
            candidate: {
                id: student?._id || student?.id || submission.candidateId,
                name: student?.name || submission.candidateName || 'Candidate',
                studentId: student?.studentId || submission.studentId || '',
                email: student?.registrationData?.collegeEmail || student?.registrationData?.personalEmail || student?.username || 'candidate@bics.edu',
                photoUrl: student?.registrationData?.photoUrl || '/public/uploads/default-photo.png'
            },
            test: {
                id: test._id || test.id,
                title: test.title,
                duration: test.duration,
                marks: test.marks,
                instructions: test.instructions,
                verificationStatus: vStatus,
                questions: test.questions || []
            },
            submission: {
                id: submission._id || submission.id,
                status: submission.status,
                startedAt: submission.startedAt,
                submittedAt: submission.submittedAt,
                proctoringLog: submission.proctoringLog,
                evaluation: submission.evaluation,
                reevaluation: submission.reevaluation,
                objections: submission.objections || [],
                answers: submission.answers || []
            }
        });
    } catch (err) {
        console.error("Failed to fetch submission verification data:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 10c. Candidate Raise Objection on a specific question
app.post('/api/tests/objection/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { questionId, questionIndex, reason, details, attachments } = req.body;

    if (!questionId && questionIndex === undefined) {
        return res.status(400).json({ success: false, error: "Question reference is required." });
    }
    if (!reason || !details) {
        return res.status(400).json({ success: false, error: "Objection reason and details are required." });
    }

    try {
        let submission = null;
        let test = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });
            test = await TestConfigModel.findById(submission.testId);
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === String(submission.testId) || t._id === String(submission.testId));
        }

        if (test) {
            const vStatus = test.verificationStatus || (test.answersReleased ? 'released' : 'not_released');
            if (vStatus === 'closed') {
                return res.status(403).json({ success: false, error: "The objection and grievance window for this examination has been closed." });
            }
            if (vStatus === 'not_released') {
                return res.status(403).json({ success: false, error: "Answer sheets for this examination have not been released yet." });
            }
        }

        const generatedId = generateObjectionId();
        const validAttachments = Array.isArray(attachments) ? attachments.filter(a => typeof a === 'string' && a.trim() !== '') : [];

        if (useMongo) {
            submission.objections = submission.objections || [];
            submission.objections = submission.objections.filter(o => o.questionIndex !== Number(questionIndex));
            
            const newObj = {
                objectionId: generatedId,
                questionId: String(questionId || ''),
                questionIndex: Number(questionIndex || 0),
                reason: reason.trim(),
                details: details.trim(),
                attachments: validAttachments,
                status: 'pending',
                raisedAt: new Date()
            };
            submission.objections.push(newObj);
            submission.markModified('objections');
            await submission.save();
        } else {
            const db = getJSONData();
            submission.objections = submission.objections || [];
            submission.objections = submission.objections.filter(o => o.questionIndex !== Number(questionIndex));

            const newObj = {
                objectionId: generatedId,
                questionId: String(questionId || ''),
                questionIndex: Number(questionIndex || 0),
                reason: reason.trim(),
                details: details.trim(),
                attachments: validAttachments,
                status: 'pending',
                raisedAt: new Date()
            };
            submission.objections.push(newObj);
            saveJSONData(db);
        }

        await logSystemAction(submission.candidateName || 'Candidate', 'OBJECTION_RAISED', `Candidate raised objection ${generatedId} for Question #${Number(questionIndex) + 1} on submission ${submissionId}: ${reason}`, 'info');
        return res.json({ success: true, message: "Objection submitted successfully.", objectionId: generatedId, objections: submission.objections });
    } catch (err) {
        console.error("Failed to submit objection:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 10d. Admin Resolve Question Objection
app.post('/api/admin/tests/objection/resolve', async (req, res) => {
    const { submissionId, questionId, questionIndex, status, adminRemarks, revisedMarks } = req.body;

    if (!submissionId || questionIndex === undefined || !status) {
        return res.status(400).json({ success: false, error: "Submission ID, questionIndex, and status are required." });
    }

    try {
        let submission = null;
        let test = null;

        if (useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });

            test = await TestConfigModel.findById(submission.testId);

            submission.objections = submission.objections || [];
            const obj = submission.objections.find(o => o.questionIndex === Number(questionIndex) || (questionId && String(o.questionId) === String(questionId)));
            if (!obj) return res.status(404).json({ success: false, error: "Objection not found." });

            obj.status = status; // 'resolved' or 'rejected'
            obj.adminRemarks = adminRemarks || '';
            obj.resolvedAt = new Date();

            if (status === 'resolved' && revisedMarks !== undefined && revisedMarks !== null && !isNaN(revisedMarks)) {
                let targetAnswer = null;
                if (obj.questionId) {
                    targetAnswer = (submission.answers || []).find(a => String(a.questionId) === String(obj.questionId));
                }
                if (!targetAnswer && submission.answers && submission.answers[questionIndex]) {
                    targetAnswer = submission.answers[questionIndex];
                }

                const quest = test?.questions?.find(q => String(q.id || q._id) === String(obj.questionId || (targetAnswer && targetAnswer.questionId))) || test?.questions?.[questionIndex];
                const maxPts = Number(quest?.points || targetAnswer?.maxPoints || 100);

                if (Number(revisedMarks) > maxPts) {
                    return res.status(400).json({ success: false, error: `Revised marks (${revisedMarks}) cannot exceed maximum question marks (${maxPts}).` });
                }
                if (Number(revisedMarks) < 0) {
                    return res.status(400).json({ success: false, error: `Revised marks cannot be negative.` });
                }

                obj.resolvedMarks = Number(revisedMarks);
                if (targetAnswer) {
                    targetAnswer.score = Number(revisedMarks);
                    targetAnswer.isObjectionResolved = true;
                }

                if (test) {
                    calculateSubmissionScore(submission, test);
                }
            }

            submission.markModified('objections');
            submission.markModified('answers');
            submission.markModified('evaluation');
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });

            test = (db.tests || []).find(t => String(t.id || t._id) === String(submission.testId));

            submission.objections = submission.objections || [];
            const obj = submission.objections.find(o => o.questionIndex === Number(questionIndex) || (questionId && String(o.questionId) === String(questionId)));
            if (!obj) return res.status(404).json({ success: false, error: "Objection not found." });

            obj.status = status;
            obj.adminRemarks = adminRemarks || '';
            obj.resolvedAt = new Date();

            if (status === 'resolved' && revisedMarks !== undefined && revisedMarks !== null && !isNaN(revisedMarks)) {
                let targetAnswer = null;
                if (obj.questionId) {
                    targetAnswer = (submission.answers || []).find(a => String(a.questionId) === String(obj.questionId));
                }
                if (!targetAnswer && submission.answers && submission.answers[questionIndex]) {
                    targetAnswer = submission.answers[questionIndex];
                }

                const quest = test?.questions?.find(q => String(q.id || q._id) === String(obj.questionId || (targetAnswer && targetAnswer.questionId))) || test?.questions?.[questionIndex];
                const maxPts = Number(quest?.points || targetAnswer?.maxPoints || 100);

                if (Number(revisedMarks) > maxPts) {
                    return res.status(400).json({ success: false, error: `Revised marks (${revisedMarks}) cannot exceed maximum question marks (${maxPts}).` });
                }
                if (Number(revisedMarks) < 0) {
                    return res.status(400).json({ success: false, error: `Revised marks cannot be negative.` });
                }

                obj.resolvedMarks = Number(revisedMarks);
                if (targetAnswer) {
                    targetAnswer.score = Number(revisedMarks);
                    targetAnswer.isObjectionResolved = true;
                }

                if (test) {
                    calculateSubmissionScore(submission, test);
                }
            }

            saveJSONData(db);
        }

        await logSystemAction('admin', 'OBJECTION_RESOLVED', `Admin resolved objection for Question #${Number(questionIndex) + 1} on submission ${submissionId} with status ${status}`, 'info');
        return res.json({ success: true, message: `Objection marked as ${status}.`, submission });
    } catch (err) {
        console.error("Failed to resolve objection:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 10d-2. Admin Bulk Re-evaluate Submissions for a Test Configuration
app.post('/api/admin/tests/reevaluate-all/:testId', async (req, res) => {
    const { testId } = req.params;
    try {
        let test = null;
        let subs = [];
        let updatedCount = 0;

        if (useMongo) {
            test = await TestConfigModel.findById(testId);
            if (!test) return res.status(404).json({ success: false, error: "Test configuration not found." });

            subs = await TestSubmissionModel.find({ testId: testId });
            for (let sub of subs) {
                calculateSubmissionScore(sub, test);
                sub.markModified('answers');
                sub.markModified('evaluation');
                await sub.save();
                updatedCount++;
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.testSubmissions = db.testSubmissions || [];
            test = db.tests.find(t => String(t.id || t._id) === String(testId));
            if (!test) return res.status(404).json({ success: false, error: "Test configuration not found." });

            subs = db.testSubmissions.filter(s => String(s.testId) === String(testId));
            subs.forEach(sub => {
                calculateSubmissionScore(sub, test);
                updatedCount++;
            });
            saveJSONData(db);
        }

        await logSystemAction('admin', 'BULK_REEVALUATION', `Bulk re-evaluated ${updatedCount} submissions for test "${test.title}"`, 'info');
        return res.json({ success: true, count: updatedCount, message: `Bulk re-evaluated ${updatedCount} candidate submissions successfully.` });
    } catch (err) {
        console.error("Failed to bulk re-evaluate submissions:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

const ensureObjectionIdsSaved = async (submissionsList) => {
    try {
        if (useMongo) {
            for (const sub of submissionsList) {
                let hasChanges = false;
                if (Array.isArray(sub.objections)) {
                    sub.objections.forEach(obj => {
                        if (!obj.objectionId) {
                            const yr = new Date(obj.raisedAt || sub.submittedAt || Date.now()).getFullYear();
                            obj.objectionId = `OBJ-${yr}-${Number(obj.questionIndex || 0) + 1}`;
                            hasChanges = true;
                        }
                    });
                }
                if (hasChanges && sub._id) {
                    await TestSubmissionModel.updateOne(
                        { _id: sub._id },
                        { $set: { objections: sub.objections } }
                    );
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            let dbModified = false;

            db.testSubmissions.forEach(sub => {
                if (Array.isArray(sub.objections)) {
                    sub.objections.forEach(obj => {
                        if (!obj.objectionId) {
                            const yr = new Date(obj.raisedAt || sub.submittedAt || Date.now()).getFullYear();
                            obj.objectionId = `OBJ-${yr}-${Number(obj.questionIndex || 0) + 1}`;
                            dbModified = true;
                        }
                    });
                }
            });

            if (dbModified) {
                saveJSONData(db);
            }
        }
    } catch (err) {
        console.error("Failed to auto-migrate missing objectionIds:", err);
    }
};

// 10e. Admin Get All Objections
app.get('/api/admin/objections', async (req, res) => {
    try {
        let submissions = [];
        if (useMongo) {
            submissions = await TestSubmissionModel.find({ "objections.0": { $exists: true } });
            await ensureObjectionIdsSaved(submissions);
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submissions = db.testSubmissions.filter(s => s.objections && s.objections.length > 0);
            await ensureObjectionIdsSaved(submissions);
        }

        const allObjections = [];
        await Promise.all(submissions.map(async (sub) => {
            let test = null;
            if (useMongo) {
                test = await TestConfigModel.findById(sub.testId).lean();
            } else {
                const db = getJSONData();
                test = (db.tests || []).find(t => String(t.id || t._id) === String(sub.testId));
            }

            (sub.objections || []).forEach(obj => {
                let targetAns = (sub.answers || []).find(a => String(a.questionId) === String(obj.questionId));
                if (!targetAns && sub.answers && sub.answers[obj.questionIndex]) {
                    targetAns = sub.answers[obj.questionIndex];
                }

                let targetQuest = null;
                if (test && test.questions) {
                    targetQuest = test.questions.find(q => String(q.id || q._id) === String(obj.questionId)) || test.questions[obj.questionIndex];
                }
                if (!targetQuest && targetAns) {
                    targetQuest = {
                        title: targetAns.questionTitle || targetAns.title || `Question #${(obj.questionIndex || 0) + 1}`,
                        description: targetAns.questionDescription || targetAns.questionText || targetAns.description || targetAns.problemStatement || '',
                        type: targetQuest?.type || targetAns?.type || (targetAns?.submittedHtml !== undefined || targetAns?.submittedCss !== undefined || targetAns?.submittedJs !== undefined ? 'web' : (targetAns?.submittedCode ? 'coding' : 'mcq'))
                    };
                }

                allObjections.push({
                    objectionId: obj.objectionId || `OBJ-${new Date(obj.raisedAt || sub.submittedAt || Date.now()).getFullYear()}-${String(obj.questionIndex + 1)}`,
                    submissionId: sub._id || sub.id,
                    candidateId: sub.candidateId,
                    candidateName: sub.candidateName,
                    studentId: sub.studentId,
                    testId: sub.testId,
                    testTitle: sub.testTitle,
                    submittedAt: sub.submittedAt,
                    questionIndex: obj.questionIndex,
                    questionId: obj.questionId,
                    reason: obj.reason || 'General Grievance',
                    details: obj.details || obj.studentComment || obj.description || '',
                    attachments: obj.attachments || [],
                    status: obj.status || 'pending',
                    raisedAt: obj.raisedAt || obj.createdAt || sub.submittedAt || new Date(),
                    adminRemarks: obj.adminRemarks || obj.resolutionNote || '',
                    resolvedMarks: (obj.resolvedMarks !== undefined && obj.resolvedMarks !== null) ? obj.resolvedMarks : null,
                    resolvedAt: obj.resolvedAt || null,
                    submittedAnswer: targetAns || null,
                    targetQuestion: targetQuest || null,
                    questionPoints: Number(targetQuest?.points || targetAns?.maxPoints || 10)
                });
            });
        }));

        allObjections.sort((a, b) => new Date(b.raisedAt) - new Date(a.raisedAt));
        return res.json(allObjections);
    } catch (err) {
        console.error("Failed to fetch admin objections:", err);
        return res.status(500).json({ error: err.message });
    }
});

// 10e. Get Candidate Objections List (Student view)
app.get('/api/tests/objections/student', async (req, res) => {
    const { candidateId } = req.query;
    if (!candidateId) {
        return res.status(400).json({ error: "candidateId is required" });
    }

    try {
        let submissions = [];
        if (useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            if (candFilter) {
                submissions = await TestSubmissionModel.find({ ...candFilter, "objections.0": { $exists: true } });
                await ensureObjectionIdsSaved(submissions);
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submissions = db.testSubmissions.filter(s => s.candidateId && s.candidateId.toString() === candidateId.toString() && s.objections && s.objections.length > 0);
            await ensureObjectionIdsSaved(submissions);
        }

        const studentObjections = [];
        await Promise.all(submissions.map(async (sub) => {
            let test = null;
            if (useMongo) {
                test = await TestConfigModel.findById(sub.testId).lean();
            } else {
                const db = getJSONData();
                test = (db.tests || []).find(t => String(t.id || t._id) === String(sub.testId));
            }

            (sub.objections || []).forEach(obj => {
                let targetAns = (sub.answers || []).find(a => String(a.questionId) === String(obj.questionId));
                if (!targetAns && sub.answers && sub.answers[obj.questionIndex]) {
                    targetAns = sub.answers[obj.questionIndex];
                }

                let targetQuest = null;
                if (test && test.questions) {
                    targetQuest = test.questions.find(q => String(q.id || q._id) === String(obj.questionId)) || test.questions[obj.questionIndex];
                }
                if (!targetQuest && targetAns) {
                    targetQuest = {
                        title: targetAns.questionTitle || targetAns.title || `Question #${(obj.questionIndex || 0) + 1}`,
                        description: targetAns.questionDescription || targetAns.questionText || targetAns.description || targetAns.problemStatement || '',
                        type: targetQuest?.type || targetAns?.type || (targetAns?.submittedHtml !== undefined || targetAns?.submittedCss !== undefined || targetAns?.submittedJs !== undefined ? 'web' : (targetAns?.submittedCode ? 'coding' : 'mcq'))
                    };
                }

                studentObjections.push({
                    objectionId: obj.objectionId || `OBJ-${new Date(obj.raisedAt || sub.submittedAt || Date.now()).getFullYear()}-${String(obj.questionIndex + 1)}`,
                    submissionId: sub._id || sub.id,
                    testId: sub.testId,
                    testTitle: sub.testTitle,
                    submittedAt: sub.submittedAt,
                    questionIndex: obj.questionIndex,
                    questionId: obj.questionId,
                    reason: obj.reason || 'General Grievance',
                    details: obj.details || obj.studentComment || obj.description || '',
                    attachments: obj.attachments || [],
                    status: obj.status || 'pending',
                    raisedAt: obj.raisedAt || obj.createdAt || sub.submittedAt || new Date(),
                    adminRemarks: obj.adminRemarks || obj.resolutionNote || '',
                    resolvedMarks: (obj.resolvedMarks !== undefined && obj.resolvedMarks !== null) ? obj.resolvedMarks : null,
                    resolvedAt: obj.resolvedAt || null,
                    submittedAnswer: targetAns || null,
                    targetQuestion: targetQuest || null,
                    questionPoints: Number(targetQuest?.points || targetAns?.maxPoints || 10)
                });
            });
        }));

        studentObjections.sort((a, b) => new Date(b.raisedAt) - new Date(a.raisedAt));
        return res.json(studentObjections);
    } catch (err) {
        console.error("Failed to fetch candidate objections:", err);
        return res.status(500).json({ error: err.message });
    }
});

// 11. Fetch System Logs (Admin only)
app.get('/api/admin/system-logs', async (req, res) => {
    try {
        let logs = [];
        if (useMongo) {
            logs = await SystemLogModel.find({}).sort({ timestamp: -1 }).limit(100);
        } else {
            const db = getJSONData();
            db.systemLogs = db.systemLogs || [];
            // Sort by timestamp descending
            logs = [...db.systemLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
        }
        return res.json(logs);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 12. Save Live Proctoring Event during test (Student client)
app.post('/api/tests/proctoring/event/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { type, details } = req.body;
    if (!type) return res.status(400).json({ error: "Event type is required." });

    try {
        let submission = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found." });

            submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
            submission.proctoringLog.events = submission.proctoringLog.events || [];
            submission.proctoringLog.events.push({ type, details, timestamp: new Date() });

            if (type === 'FULLSCREEN_EXIT') {
                submission.proctoringLog.fullscreenExits = (submission.proctoringLog.fullscreenExits || 0) + 1;
            } else if (type === 'TAB_SWITCH') {
                submission.proctoringLog.tabSwitches = (submission.proctoringLog.tabSwitches || 0) + 1;
            } else if (type === 'WEBCAM_LOST' || type === 'WEBCAM_RESTORED') {
                submission.proctoringLog.webcamStatus = type === 'WEBCAM_LOST' ? 'inactive' : 'active';
            }

            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found." });

            submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' };
            submission.proctoringLog.events = submission.proctoringLog.events || [];
            submission.proctoringLog.events.push({ type, details, timestamp: new Date() });

            if (type === 'FULLSCREEN_EXIT') {
                submission.proctoringLog.fullscreenExits = (submission.proctoringLog.fullscreenExits || 0) + 1;
            } else if (type === 'TAB_SWITCH') {
                submission.proctoringLog.tabSwitches = (submission.proctoringLog.tabSwitches || 0) + 1;
            } else if (type === 'WEBCAM_LOST' || type === 'WEBCAM_RESTORED') {
                submission.proctoringLog.webcamStatus = type === 'WEBCAM_LOST' ? 'inactive' : 'active';
            }

            saveJSONData(db);
        }

        // Trigger system log for high severity events
        if (type === 'FULLSCREEN_EXIT' || type === 'TAB_SWITCH') {
            await logSystemAction(
                submission.candidateName || 'Candidate',
                `PROCTOR_ALERT_${type}`,
                `Candidate triggered proctoring warning: ${details} during exam ${submission.testTitle}`,
                'warning'
            );
        }

        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 13. WebRTC Signal Exchange Broker (Serverless REST channel)
app.post('/api/tests/proctoring/signal/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { sender, type, data } = req.body;
    if (!sender || !type || !data) return res.status(400).json({ error: "Sender, type, and data are required." });

    try {
        if (useMongo) {
            const sig = new TestSignalModel({ submissionId, sender, type, data });
            await sig.save();
        } else {
            const db = getJSONData();
            db.testSignals = db.testSignals || [];
            db.testSignals.push({
                id: Date.now().toString() + Math.random().toString(),
                submissionId,
                sender,
                type,
                data,
                createdAt: new Date()
            });
            saveJSONData(db);
        }
        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to write WebRTC signals for submission ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/tests/proctoring/signal/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { sender } = req.query;
    if (!sender) return res.status(400).json({ error: "Query target sender is required." });

    try {
        let signals = [];
        if (useMongo) {
            signals = await TestSignalModel.find({ submissionId, sender });
        } else {
            const db = getJSONData();
            db.testSignals = db.testSignals || [];
            signals = db.testSignals.filter(s => s.submissionId === submissionId && s.sender === sender);
        }
        return res.json({ success: true, signals });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to read WebRTC signals for submission ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// C++ Execution Engine Helpers
let gppChecked = null;
const isGppAvailable = async () => {
    if (gppChecked !== null) return gppChecked;
    return new Promise((resolve) => {
        exec('g++ --version', (err) => {
            gppChecked = !err;
            resolve(gppChecked);
        });
    });
};

const runLocalGpp = async (sourceCode, testCases, timeLimitMs = 2000) => {
    return new Promise((resolve) => {
        const dir = path.join(__dirname, 'temp_runs');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const fileId = Math.random().toString(36).substring(7);
        const codeFile = path.join(dir, `${fileId}.cpp`);
        const isWin = process.platform === 'win32';
        const execFile = path.join(dir, isWin ? `${fileId}.exe` : `${fileId}.out`);

        fs.writeFileSync(codeFile, sourceCode);

        exec(`g++ "${codeFile}" -o "${execFile}"`, async (compileErr, stdout, stderr) => {
            if (compileErr || stderr) {
                try {
                    if (fs.existsSync(codeFile)) fs.unlinkSync(codeFile);
                } catch (unlinkErr) {
                    console.warn("Temporary code file cleanup warning (compile phase):", unlinkErr.message);
                }
                return resolve({
                    success: false,
                    status: 'Compilation Error',
                    compileError: stderr || compileErr.message,
                    results: []
                });
            }

            const results = [];
            try {
                for (let i = 0; i < testCases.length; i++) {
                    const tc = testCases[i];
                    const res = await new Promise((runResolve) => {
                        const child = exec(`"${execFile}"`, { timeout: timeLimitMs }, (runErr, runStdout, runStderr) => {
                            if (runErr && runErr.killed) {
                                return runResolve({ status: 'Time Limit Exceeded (TLE)', stdout: '', stderr: 'Time limit exceeded.' });
                            }
                            if (runErr || runStderr) {
                                return runResolve({ status: 'Runtime Error', stdout: '', stderr: runStderr || runErr.message });
                            }
                            const cleanExpected = (tc.output || tc.expectedOutput || '').trim().replace(/\r\n/g, '\n');
                            const cleanActual = (runStdout || '').trim().replace(/\r\n/g, '\n');
                            const isCorrect = cleanActual === cleanExpected;

                            runResolve({
                                status: isCorrect ? 'Accepted' : 'Wrong Answer',
                                stdout: runStdout,
                                stderr: ''
                            });
                        });

                        child.stdin.on('error', (stdinErr) => {
                            console.warn("Local runner stdin write error (process probably exited early):", stdinErr.message);
                        });

                        if (tc.input) {
                            child.stdin.write(tc.input);
                            child.stdin.end();
                        } else {
                            child.stdin.end();
                        }
                    });
                    results.push({
                        testcaseId: tc.testcaseId || tc.testCaseId || tc.id || tc._id || (20260101 + i),
                        id: tc.id || tc._id || tc.testcaseId || (20260101 + i),
                        input: tc.input,
                        expectedOutput: tc.output || tc.expectedOutput,
                        actualOutput: res.stdout,
                        status: res.status,
                        stderr: res.stderr
                    });
                }
            } catch (runLoopErr) {
                console.error("Local runner loop crashed:", runLoopErr);
            } finally {
                try {
                    if (fs.existsSync(codeFile)) fs.unlinkSync(codeFile);
                } catch (unlinkErr) {
                    console.warn("Temporary code file cleanup warning:", unlinkErr.message);
                }
                try {
                    if (fs.existsSync(execFile)) fs.unlinkSync(execFile);
                } catch (unlinkErr) {
                    console.warn("Temporary executable cleanup warning:", unlinkErr.message);
                }
            }

            resolve({
                success: true,
                status: 'Success',
                results
            });
        });
    });
};

const JUDGE0_URL = process.env.JUDGE0_API_URL || "https://demo.judge0.com/submissions?wait=true";
const JUDGE0_KEY = process.env.JUDGE0_API_KEY;

const runOnJudge0 = async (sourceCode, testCases) => {
    try {
        const promises = testCases.map(async (tc) => {
            const body = {
                source_code: sourceCode,
                language_id: 54, // C++
                stdin: tc.input || "",
                cpu_time_limit: 2.0
            };
            const headers = { "Content-Type": "application/json" };
            if (JUDGE0_KEY) {
                if (JUDGE0_URL.includes('rapidapi')) {
                    headers['x-rapidapi-key'] = JUDGE0_KEY;
                    headers['x-rapidapi-host'] = new URL(JUDGE0_URL).hostname;
                } else {
                    headers['X-Auth-Token'] = JUDGE0_KEY;
                }
            }
            const res = await fetch(JUDGE0_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const data = await res.json();
                const statusDesc = data.status?.description || "Runtime Error";
                const expected = (tc.output || tc.expectedOutput || '');
                const cleanExpected = expected.trim().replace(/\r\n/g, '\n');
                const cleanActual = (data.stdout || '').trim().replace(/\r\n/g, '\n');
                const isCorrect = cleanActual === cleanExpected;
                
                return {
                    input: tc.input,
                    expectedOutput: expected,
                    actualOutput: data.stdout || "",
                    status: isCorrect ? "Accepted" : (statusDesc === "Accepted" ? "Wrong Answer" : statusDesc),
                    stderr: (data.stderr || data.compile_output) ? (data.stderr || data.compile_output) : ""
                };
            }
            return {
                input: tc.input,
                expectedOutput: tc.output || tc.expectedOutput,
                actualOutput: "",
                status: "Error",
                stderr: "Cloud compiler unreachable."
            };
        });

        const results = await Promise.all(promises);
        const hasCompileError = results.some(r => r.status.includes("Compilation Error"));
        return {
            success: !hasCompileError,
            status: hasCompileError ? 'Compilation Error' : 'Success',
            compileError: hasCompileError ? results.find(r => r.status.includes("Compilation Error")).stderr : '',
            results
        };
    } catch (e) {
        console.error("Judge0 parallel execution failed:", e);
        return {
            success: false,
            status: 'Error',
            compileError: 'Cloud compiler failed or is offline.',
            results: []
        };
    }
};

const isSafeCode = (sourceCode) => {
    const unsafePatterns = [
        /system\s*\(/,
        /popen\s*\(/,
        /fork\s*\(/,
        /exec\s*\(/,
        /fstream/,
        /ofstream/,
        /ifstream/,
        /#include\s*<filesystem>/,
        /#include\s*<fstream>/,
        /std::filesystem/
    ];
    return !unsafePatterns.some(pattern => pattern.test(sourceCode));
};

const executeCode = async (sourceCode, testCases) => {
    if (!isSafeCode(sourceCode)) {
        return {
            success: false,
            status: 'Compilation Error',
            compileError: 'Security violation: Unsafe file operations or process commands detected in code. Run blocked.',
            results: []
        };
    }
    const localCompiler = await isGppAvailable();
    if (localCompiler) {
        console.log(`--> Compiling & executing locally using g++`);
        return await runLocalGpp(sourceCode, testCases);
    } else {
        console.log(`--> Local compiler unavailable. Offloading to Judge0 Cloud Compiler`);
        return await runOnJudge0(sourceCode, testCases);
    }
};

// Compile and run code endpoint
app.post('/api/tests/run', async (req, res) => {
    const { sourceCode, testCases } = req.body;
    if (!sourceCode || !testCases || !Array.isArray(testCases)) {
        return res.status(400).json({ error: "sourceCode and testCases list are required." });
    }
    try {
        const result = await executeCode(sourceCode, testCases);
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 14. Helpdesk & Tickets Endpoints

// Create a new helpdesk ticket (Student portal submit)
app.post('/api/candidate/tickets/:candidateId', async (req, res) => {
    const { candidateId } = req.params;
    const { category, subject, message } = req.body;
    if (!category || !subject || !message) {
        return res.status(400).json({ error: "Category, subject, and message are required." });
    }

    try {
        let newTicket = null;
        let candidateName = 'Unknown Candidate';
        let studentId = 'Unknown ID';

        if (useMongo) {
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
            const cand = db.candidates.find(c => c.id === candidateId || c._id === candidateId);
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

// Fetch student's own tickets (Student portal history view)
app.get('/api/candidate/tickets/list/:candidateId', async (req, res) => {
    const { candidateId } = req.params;
    try {
        let tickets = [];
        if (useMongo) {
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

// Fetch all tickets (Admin dashboard view)
app.get('/api/admin/tickets', async (req, res) => {
    try {
        let tickets = [];
        if (useMongo) {
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

// Resolve/Update ticket status (Admin dashboard resolution)
app.post('/api/admin/tickets/resolve/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    const { status, resolutionFeedback } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required." });

    try {
        let ticket = null;
        if (useMongo) {
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
            `Admin updated ticket ID ${ticketId} status to "${status}"`,
            'info'
        );

        return res.json({ success: true, ticket });
    } catch (e) {
        console.error(e);
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to resolve ticket: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// --- Google Classroom Webhook & Submissions Endpoints ---

// 1. Webhook receiver
app.post('/api/webhooks/google-classroom/submission', async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    if (!apiKey || apiKey !== GOOGLE_CLASSROOM_WEBHOOK_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Key." });
    }

    let { email, studentId, courseCode, courseName, title, type, submissionDate, dueDate, score, maxScore, classroomLink } = req.body;

    if (!courseCode || !title || !type) {
        return res.status(400).json({ error: "Required fields (courseCode, title, type) missing." });
    }
    courseCode = courseCode.trim().toUpperCase();

    try {
        let resolvedStudentId = (studentId || "STU1001").trim().toUpperCase();
        let resolvedStudentName = "Siyam Bubere";

        // Attempt to resolve student by email or username if not explicitly STU1001
        if (email) {
            const lowercaseEmail = email.toLowerCase().trim();
            const usernamePart = email.split('@')[0].toLowerCase().trim();
            if (useMongo) {
                const cand = await CandidateModel.findOne({
                    $or: [
                        { 'registrationData.personalEmail': { $regex: new RegExp(`^${lowercaseEmail}$`, 'i') } },
                        { 'registrationData.collegeEmail': { $regex: new RegExp(`^${lowercaseEmail}$`, 'i') } },
                        { email: { $regex: new RegExp(`^${lowercaseEmail}$`, 'i') } },
                        { username: { $regex: new RegExp(`^${usernamePart}$`, 'i') } }
                    ]
                });
                if (cand) {
                    resolvedStudentId = (cand.studentId || "STU1001").trim().toUpperCase();
                    resolvedStudentName = cand.name || "Siyam Bubere";
                }
            } else {
                const db = getJSONData();
                const cand = (db.candidates || []).find(c => 
                    (c.registrationData?.personalEmail || '').toLowerCase().trim() === lowercaseEmail || 
                    (c.registrationData?.collegeEmail || '').toLowerCase().trim() === lowercaseEmail || 
                    (c.email || '').toLowerCase().trim() === lowercaseEmail || 
                    (c.username || '').toLowerCase().trim() === usernamePart
                );
                if (cand) {
                    resolvedStudentId = (cand.studentId || "STU1001").trim().toUpperCase();
                    resolvedStudentName = cand.name || "Siyam Bubere";
                }
            }
        }

        // Calculate late vs on-time tag
        let computedStatus = 'on_time';
        if (submissionDate && dueDate) {
            const subTime = new Date(submissionDate).getTime();
            const dueTime = new Date(dueDate).getTime();
            if (subTime > dueTime) {
                computedStatus = 'late';
            }
        } else if (!submissionDate) {
            computedStatus = 'pending';
        }

        let submission;
        if (useMongo) {
            // Find existing submission to update or create new
            submission = await ClassroomSubmissionModel.findOne({
                studentId: resolvedStudentId,
                courseCode,
                title
            });

            if (!submission) {
                submission = new ClassroomSubmissionModel({
                    studentId: resolvedStudentId,
                    studentName: resolvedStudentName,
                    courseCode,
                    title,
                    type
                });
            }

            submission.courseName = courseName || submission.courseName || courseCode;
            submission.submissionDate = submissionDate ? new Date(submissionDate) : null;
            submission.dueDate = dueDate ? new Date(dueDate) : null;
            submission.status = computedStatus;
            submission.score = Number(score || 0);
            submission.maxScore = Number(maxScore || 0);
            submission.classroomLink = classroomLink || '';

            await submission.save();
        } else {
            const db = getJSONData();
            db.classroomSubmissions = db.classroomSubmissions || [];
            let idx = db.classroomSubmissions.findIndex(s => 
                s.studentId === resolvedStudentId && 
                s.courseCode === courseCode && 
                s.title === title
            );

            submission = {
                studentId: resolvedStudentId,
                studentName: resolvedStudentName,
                courseCode,
                courseName: courseName || courseCode,
                title,
                type,
                submissionDate: submissionDate || null,
                dueDate: dueDate || null,
                status: computedStatus,
                score: Number(score || 0),
                maxScore: Number(maxScore || 0),
                classroomLink: classroomLink || ''
            };

            if (idx !== -1) {
                db.classroomSubmissions[idx] = submission;
            } else {
                db.classroomSubmissions.push(submission);
            }
            saveJSONData(db);
        }

        await logSystemAction(
            'system',
            'CLASSROOM_SUBMISSION_TRIGGERED',
            `Received Google Classroom submission for ${resolvedStudentName} (${courseCode}): "${title}". Auto-tagged as: ${computedStatus}`,
            'info'
        );

        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. Fetch submissions for student
app.get('/api/student/submissions/:studentId', async (req, res) => {
    let { studentId } = req.params;
    if (studentId) {
        studentId = studentId.trim().toUpperCase();
    }
    try {
        if (useMongo) {
            const list = await ClassroomSubmissionModel.find({ studentId });
            return res.json(list);
        } else {
            const db = getJSONData();
            db.classroomSubmissions = db.classroomSubmissions || [];
            const list = db.classroomSubmissions.filter(s => s.studentId && s.studentId.trim().toUpperCase() === studentId);
            return res.json(list);
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. List all submissions (Admin Only)
app.get('/api/admin/submissions', async (req, res) => {
    try {
        if (useMongo) {
            const list = await ClassroomSubmissionModel.find({});
            return res.json(list);
        } else {
            const db = getJSONData();
            db.classroomSubmissions = db.classroomSubmissions || [];
            return res.json(db.classroomSubmissions);
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Save/Update submission manually (Admin Only)
app.post('/api/admin/submissions/save', async (req, res) => {
    let { _id, studentId, studentName, courseCode, courseName, title, type, submissionDate, dueDate, status, score, maxScore, classroomLink } = req.body;
    if (!studentId || !courseCode || !title || !type) {
        return res.status(400).json({ error: "Required fields missing." });
    }
    studentId = studentId.trim().toUpperCase();
    courseCode = courseCode.trim().toUpperCase();

    try {
        let submission;
        // Determine status: if not explicitly 'excused' or manual override, compute it
        let finalStatus = status || 'on_time';
        if (status !== 'excused' && status !== 'pending') {
            if (submissionDate && dueDate) {
                const subTime = new Date(submissionDate).getTime();
                const dueTime = new Date(dueDate).getTime();
                finalStatus = subTime > dueTime ? 'late' : 'on_time';
            } else if (!submissionDate) {
                finalStatus = 'pending';
            }
        }

        if (useMongo) {
            if (_id) {
                submission = await ClassroomSubmissionModel.findById(_id);
            }
            if (!submission && studentId && courseCode && title) {
                submission = await ClassroomSubmissionModel.findOne({ studentId, courseCode, title });
            }
            if (!submission) {
                submission = new ClassroomSubmissionModel({});
            }

            submission.studentId = studentId;
            submission.studentName = studentName || "Siyam Bubere";
            submission.courseCode = courseCode;
            submission.courseName = courseName || courseCode;
            submission.title = title;
            submission.type = type;
            submission.submissionDate = submissionDate ? new Date(submissionDate) : null;
            submission.dueDate = dueDate ? new Date(dueDate) : null;
            submission.status = finalStatus;
            submission.score = Number(score || 0);
            submission.maxScore = Number(maxScore || 0);
            submission.classroomLink = classroomLink || '';

            await submission.save();
        } else {
            const db = getJSONData();
            db.classroomSubmissions = db.classroomSubmissions || [];
            
            submission = {
                studentId,
                studentName: studentName || "Siyam Bubere",
                courseCode,
                courseName: courseName || courseCode,
                title,
                type,
                submissionDate: submissionDate || null,
                dueDate: dueDate || null,
                status: finalStatus,
                score: Number(score || 0),
                maxScore: Number(maxScore || 0),
                classroomLink: classroomLink || ''
            };

            // Using title/studentId matching for local ID replacement
            let idx = -1;
            if (_id) {
                // If it's local db.json mock _id, or index
                idx = db.classroomSubmissions.findIndex(s => s.studentId === studentId && s.courseCode === courseCode && s.title === title);
            }
            
            if (idx === -1) {
                idx = db.classroomSubmissions.findIndex(s => s.studentId === studentId && s.courseCode === courseCode && s.title === title);
            }

            if (idx !== -1) {
                db.classroomSubmissions[idx] = submission;
            } else {
                db.classroomSubmissions.push(submission);
            }
            saveJSONData(db);
        }

        await logSystemAction(
            'admin',
            'SUBMISSION_MANUALLY_SAVED',
            `Admin manually updated classroom submission for ${studentId} (${courseCode}): "${title}"`,
            'info'
        );

        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Delete submission (Admin Only)
app.delete('/api/admin/submissions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (useMongo) {
            let deleted = null;
            // Avoid throwing CastError on invalid ObjectId strings (like titles)
            if (mongoose.Types.ObjectId.isValid(id)) {
                deleted = await ClassroomSubmissionModel.findByIdAndDelete(id);
            }
            if (!deleted) {
                // Try treating id as a title lookup
                deleted = await ClassroomSubmissionModel.findOneAndDelete({ title: id });
            }
        } else {
            const db = getJSONData();
            db.classroomSubmissions = db.classroomSubmissions || [];
            db.classroomSubmissions = db.classroomSubmissions.filter(s => s.title !== id && String(s._id) !== id);
            saveJSONData(db);
        }

        await logSystemAction(
            'admin',
            'SUBMISSION_MANUALLY_DELETED',
            `Admin deleted classroom submission ID/Title: "${id}"`,
            'info'
        );

        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// --- Counterfoil Marks Entry & Admin Approval Endpoints ---

// 1. Get student's counterfoil submissions
app.get('/api/counterfoil/my-submissions/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        if (useMongo) {
            const submissions = await CounterfoilSubmissionModel.find({ 
                studentId: new RegExp(`^${studentId.trim()}$`, 'i') 
            }).sort({ submittedAt: -1 });
            return res.json(submissions);
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            const submissions = db.counterfoilSubmissions.filter(s => 
                s.studentId && s.studentId.trim().toUpperCase() === studentId.trim().toUpperCase()
            );
            return res.json(submissions);
        }
    } catch (e) {
        console.error("Counterfoil fetch error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. Submit or update student counterfoil
app.post('/api/counterfoil/submit', async (req, res) => {
    const { studentId, studentName, courseCode, courseName, examType, examinationName, questionMarks } = req.body;
    if (!studentId || !courseCode || !examType || !questionMarks || !Array.isArray(questionMarks)) {
        return res.status(400).json({ error: "Missing required counterfoil fields." });
    }

    const sId = studentId.trim().toUpperCase();
    const cCode = courseCode.trim().toUpperCase();

    let totalObtained = 0;
    let totalMax = 0;
    questionMarks.forEach(q => {
        totalObtained += Number(q.obtainedMarks || 0);
        totalMax += Number(q.maxMarks || 0);
    });

    try {
        let submission;
        if (useMongo) {
            submission = await CounterfoilSubmissionModel.findOne({
                studentId: sId,
                courseCode: cCode,
                examType
            });

            if (submission) {
                if (submission.status === 'approved') {
                    return res.status(400).json({ error: "Counterfoil for this course has already been approved by admin and cannot be modified." });
                }
                submission.studentName = studentName || submission.studentName;
                submission.courseName = courseName || submission.courseName;
                submission.examinationName = examinationName || submission.examinationName;
                submission.questionMarks = questionMarks;
                submission.totalObtained = totalObtained;
                submission.totalMax = totalMax;
                submission.status = 'pending_approval';
                submission.adminRemarks = '';
                submission.submittedAt = new Date();
                await submission.save();
            } else {
                submission = new CounterfoilSubmissionModel({
                    studentId: sId,
                    studentName: studentName || "Candidate",
                    courseCode: cCode,
                    courseName: courseName || cCode,
                    examType,
                    examinationName: examinationName || (examType === 'midsem' ? 'Mid Semester Examination 2026' : 'End Semester Examination 2026'),
                    questionMarks,
                    totalObtained,
                    totalMax,
                    status: 'pending_approval',
                    submittedAt: new Date()
                });
                await submission.save();
            }
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            const idx = db.counterfoilSubmissions.findIndex(s => s.studentId === sId && s.courseCode === cCode && s.examType === examType);
            if (idx !== -1) {
                if (db.counterfoilSubmissions[idx].status === 'approved') {
                    return res.status(400).json({ error: "Counterfoil for this course has already been approved by admin and cannot be modified." });
                }
                db.counterfoilSubmissions[idx].studentName = studentName || db.counterfoilSubmissions[idx].studentName;
                db.counterfoilSubmissions[idx].courseName = courseName || db.counterfoilSubmissions[idx].courseName;
                db.counterfoilSubmissions[idx].examinationName = examinationName || db.counterfoilSubmissions[idx].examinationName;
                db.counterfoilSubmissions[idx].questionMarks = questionMarks;
                db.counterfoilSubmissions[idx].totalObtained = totalObtained;
                db.counterfoilSubmissions[idx].totalMax = totalMax;
                db.counterfoilSubmissions[idx].status = 'pending_approval';
                db.counterfoilSubmissions[idx].adminRemarks = '';
                db.counterfoilSubmissions[idx].submittedAt = new Date().toISOString();
                submission = db.counterfoilSubmissions[idx];
            } else {
                submission = {
                    _id: "counterfoil_" + Date.now(),
                    studentId: sId,
                    studentName: studentName || "Candidate",
                    courseCode: cCode,
                    courseName: courseName || cCode,
                    examType,
                    examinationName: examinationName || (examType === 'midsem' ? 'Mid Semester Examination 2026' : 'End Semester Examination 2026'),
                    questionMarks,
                    totalObtained,
                    totalMax,
                    status: 'pending_approval',
                    submittedAt: new Date().toISOString()
                };
                db.counterfoilSubmissions.push(submission);
            }
            saveJSONData(db);
        }

        await logSystemAction(
            sId,
            'COUNTERFOIL_SUBMITTED',
            `Student ${sId} submitted counterfoil for ${cCode} (${examType}): ${totalObtained}/${totalMax}`,
            'info'
        );

        return res.json({ success: true, submission });
    } catch (e) {
        console.error("Counterfoil submit error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Admin: list all counterfoil submissions
app.get('/api/admin/counterfoil/list', async (req, res) => {
    try {
        if (useMongo) {
            const submissions = await CounterfoilSubmissionModel.find().sort({ submittedAt: -1 });
            return res.json(submissions);
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            return res.json(db.counterfoilSubmissions);
        }
    } catch (e) {
        console.error("Admin counterfoil list error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Admin: approve or reject counterfoil submission
app.post('/api/admin/counterfoil/action/:id', async (req, res) => {
    const { id } = req.params;
    const { status, adminRemarks } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Invalid status parameter. Must be 'approved' or 'rejected'." });
    }

    try {
        let submission;
        if (useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                submission = await CounterfoilSubmissionModel.findById(id);
            }
            if (!submission) {
                submission = await CounterfoilSubmissionModel.findOne({ _id: id });
            }
            if (!submission) {
                return res.status(404).json({ error: "Counterfoil submission not found." });
            }
            submission.status = status;
            submission.adminRemarks = adminRemarks || '';
            if (status === 'approved') {
                submission.approvedAt = new Date();
            }
            await submission.save();
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            const idx = db.counterfoilSubmissions.findIndex(s => String(s._id) === String(id) || String(s.id) === String(id));
            if (idx === -1) {
                return res.status(404).json({ error: "Counterfoil submission not found." });
            }
            db.counterfoilSubmissions[idx].status = status;
            db.counterfoilSubmissions[idx].adminRemarks = adminRemarks || '';
            if (status === 'approved') {
                db.counterfoilSubmissions[idx].approvedAt = new Date().toISOString();
            }
            submission = db.counterfoilSubmissions[idx];
            saveJSONData(db);
        }

        await logSystemAction(
            'admin',
            'COUNTERFOIL_ACTION',
            `Admin marked counterfoil ${id} as ${status.toUpperCase()}. Remarks: "${adminRemarks || 'N/A'}"`,
            'info'
        );

        return res.json({ success: true, submission });
    } catch (e) {
        console.error("Admin counterfoil action error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ACADEMIC COURSE MARKS LEDGER & GRADING APIS
// ==========================================

const DEFAULT_ACADEMIC_COURSES = [
    { code: "R526CS01T", name: "Introduction to Computer Science", type: "theory" },
    { code: "R526CS02T", name: "Programming Fundamentals with C++", type: "theory" },
    { code: "R526CS03T", name: "Basics of Web Development", type: "theory" },
    { code: "R526CS04T", name: "Mathematical Thinking", type: "theory" },
    { code: "R526CS02L", name: "Programming Fundamentals with C++ Lab", type: "lab" },
    { code: "R526CS03L", name: "Basics of Web Development Lab", type: "lab" }
];

function calculateMarksLedgerEntry(m, type) {
    const isTheory = type === 'theory';

    // 1. Teacher Assessment (TA) Computation
    let totalTa = 0;
    if (isTheory) {
        totalTa = Number(m.taAssignment || 0) + Number(m.taClassTest || 0) + Number(m.taQuiz || 0) + Number(m.taIdeation || 0);
        totalTa = Math.min(20, Math.max(0, totalTa));
    } else {
        totalTa = Number(m.taPracticalEval || 0) + Number(m.taLabQuiz || 0) + Number(m.taProject || 0);
        totalTa = Math.min(40, Math.max(0, totalTa));
    }

    // 2. Mid Semester Test (MST) Computation
    let scaledMst = 0;
    let rawMst = 0;
    const wMst = Math.min(40, Math.max(0, Number(m.mstWritten || 0)));
    if (isTheory) {
        scaledMst = (wMst / 40) * 30;
    } else {
        const oMst = Math.min(40, Math.max(0, Number(m.mstOnline || 0)));
        const vMst = Math.min(20, Math.max(0, Number(m.mstViva || 0)));
        rawMst = wMst + oMst + vMst;
        scaledMst = (rawMst / 100) * 20;
    }

    // 3. End Semester Exam (ESE) Computation
    let scaledEse = 0;
    let rawEse = 0;
    const wEse = Math.min(100, Math.max(0, Number(m.eseWritten || 0)));
    if (isTheory) {
        scaledEse = (wEse / 100) * 50;
    } else {
        const oEse = Math.min(100, Math.max(0, Number(m.eseOnline || 0)));
        const vEse = Math.min(40, Math.max(0, Number(m.eseViva || 0)));
        rawEse = wEse + oEse + vEse;
        scaledEse = (rawEse / 240) * 40;
    }

    // 4. Final Consolidated Score & Letter Grade Computation (100 Marks Max)
    const finalScore = Math.round((totalTa + scaledMst + scaledEse) * 100) / 100;

    let grade = 'FF';
    let gradePoint = 0;
    let status = 'FAIL';

    if (finalScore >= 91) { grade = 'AA'; gradePoint = 10; status = 'PASS'; }
    else if (finalScore >= 81) { grade = 'AB'; gradePoint = 9; status = 'PASS'; }
    else if (finalScore >= 71) { grade = 'BB'; gradePoint = 8; status = 'PASS'; }
    else if (finalScore >= 65) { grade = 'CC'; gradePoint = 7; status = 'PASS'; }
    else if (finalScore >= 60) { grade = 'DD'; gradePoint = 6; status = 'PASS'; }
    else { grade = 'FF'; gradePoint = 0; status = 'FAIL'; }

    return {
        ...m,
        totalTa: Math.round(totalTa * 100) / 100,
        scaledMst: Math.round(scaledMst * 100) / 100,
        scaledEse: Math.round(scaledEse * 100) / 100,
        finalScore,
        grade,
        gradePoint,
        status
    };
}

// 1. Get Course List & Status
app.get('/api/admin/marks-ledger/courses', async (req, res) => {
    try {
        let ledgers = [];
        if (useMongo) {
            ledgers = await AcademicMarksLedgerModel.find().lean();
        } else {
            const db = getJSONData();
            ledgers = db.academicMarksLedgers || [];
        }

        const courses = DEFAULT_ACADEMIC_COURSES.map(c => {
            const l = ledgers.find(l => l.courseCode === c.code);
            return {
                ...c,
                linkedOnlineTestId: l?.linkedOnlineTestId || '',
                linkedMstOnlineTestId: l?.linkedMstOnlineTestId || '',
                linkedEseOnlineTestId: l?.linkedEseOnlineTestId || '',
                isLocked: l?.isLocked || false,
                studentCount: l?.studentMarks?.length || 0,
                updatedAt: l?.updatedAt || null
            };
        });

        return res.json(courses);
    } catch (e) {
        console.error("Failed to list marks ledger courses:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. Get Available Online Tests (Excludes test IDs already linked to any course/component)
app.get('/api/admin/marks-ledger/available-tests', async (req, res) => {
    try {
        const { currentCourseCode, targetExam } = req.query;
        let ledgers = [];
        let tests = [];

        if (useMongo) {
            ledgers = await AcademicMarksLedgerModel.find().lean();
            tests = await TestConfigModel.find().lean();
        } else {
            const db = getJSONData();
            ledgers = db.academicMarksLedgers || [];
            tests = db.tests || [];
        }

        // Gather all linked test IDs across all OTHER courses and components
        const assignedTestIds = new Set();
        ledgers.forEach(l => {
            if (l.courseCode !== currentCourseCode) {
                if (l.linkedOnlineTestId) assignedTestIds.add(String(l.linkedOnlineTestId));
                if (l.linkedMstOnlineTestId) assignedTestIds.add(String(l.linkedMstOnlineTestId));
                if (l.linkedEseOnlineTestId) assignedTestIds.add(String(l.linkedEseOnlineTestId));
            } else {
                // For the current course, only exclude the test assigned to the OTHER exam component
                if (targetExam === 'mst' && l.linkedEseOnlineTestId) {
                    assignedTestIds.add(String(l.linkedEseOnlineTestId));
                }
                if (targetExam === 'ese' && l.linkedMstOnlineTestId) {
                    assignedTestIds.add(String(l.linkedMstOnlineTestId));
                }
            }
        });

        // Deduplicate tests by ID and filter available ones
        const seenIds = new Set();
        const available = [];
        for (let t of tests) {
            const tid = String(t._id || t.id);
            if (!assignedTestIds.has(tid) && !seenIds.has(tid)) {
                seenIds.add(tid);
                available.push({
                    id: tid,
                    title: t.title,
                    marks: t.marks || t.totalMarks || 100,
                    courseCode: t.courseCode || ''
                });
            }
        }

        return res.json(available);
    } catch (e) {
        console.error("Failed to list available online tests:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Get Course Marks Ledger (Auto-fetches Counterfoil Written Marks)
app.get('/api/admin/marks-ledger/ledger/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    try {
        let ledger = null;
        let candidates = [];
        let counterfoils = [];

        if (useMongo) {
            ledger = await AcademicMarksLedgerModel.findOne({ courseCode }).lean();
            candidates = await CandidateModel.find().lean();
            counterfoils = await CounterfoilSubmissionModel.find({ courseCode }).lean();
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            ledger = db.academicMarksLedgers.find(l => l.courseCode === courseCode);
            candidates = db.candidates || [];
            counterfoils = (db.counterfoilSubmissions || []).filter(s => s.courseCode === courseCode);
        }

        const existingMap = new Map();
        if (ledger && Array.isArray(ledger.studentMarks)) {
            ledger.studentMarks.forEach(sm => existingMap.set(String(sm.studentId), sm));
        }

        // Map candidates to studentMarks array
        const studentMarks = candidates.map(cand => {
            const sId = String(cand.studentId || cand.registrationData?.studentId || cand._id);
            const sName = cand.name || cand.registrationData?.fullName || 'Candidate';
            const rollNo = cand.rollNo || cand.studentId || '';

            const existing = existingMap.get(sId) || {};

            // Auto-fetch Written MST (Midsem) counterfoil
            const mstCf = counterfoils.find(c => String(c.studentId) === sId && (c.examType === 'midsem' || c.examinationName?.toLowerCase().includes('mid')));
            let mstWritten = existing.mstWritten ?? (mstCf ? Number(mstCf.totalObtained || 0) : 0);
            let mstWrittenStatus = existing.mstWrittenStatus;
            if (!mstWrittenStatus) {
                if (mstCf) {
                    mstWrittenStatus = mstCf.status === 'approved' ? 'approved' : 'pending_approval';
                } else {
                    mstWrittenStatus = 'manual';
                }
            }

            // Auto-fetch Written ESE (Endsem) counterfoil
            const eseCf = counterfoils.find(c => String(c.studentId) === sId && (c.examType === 'endsem' || c.examinationName?.toLowerCase().includes('end')));
            let eseWritten = existing.eseWritten ?? (eseCf ? Number(eseCf.totalObtained || 0) : 0);
            let eseWrittenStatus = existing.eseWrittenStatus;
            if (!eseWrittenStatus) {
                if (eseCf) {
                    eseWrittenStatus = eseCf.status === 'approved' ? 'approved' : 'pending_approval';
                } else {
                    eseWrittenStatus = 'manual';
                }
            }

            const rawEntry = {
                studentId: sId,
                studentName: sName,
                rollNo,
                taAssignment: Number(existing.taAssignment || 0),
                taClassTest: Number(existing.taClassTest || 0),
                taQuiz: Number(existing.taQuiz || 0),
                taIdeation: Number(existing.taIdeation || 0),
                taPracticalEval: Number(existing.taPracticalEval || 0),
                taLabQuiz: Number(existing.taLabQuiz || 0),
                taProject: Number(existing.taProject || 0),

                mstWritten,
                mstWrittenStatus,
                mstOnline: Number(existing.mstOnline || 0),
                mstViva: Number(existing.mstViva || 0),

                eseWritten,
                eseWrittenStatus,
                eseOnline: Number(existing.eseOnline || 0),
                eseViva: Number(existing.eseViva || 0)
            };

            return calculateMarksLedgerEntry(rawEntry, courseDef.type);
        });

        const fullLedger = {
            courseCode: courseDef.code,
            courseName: courseDef.name,
            courseType: courseDef.type,
            linkedOnlineTestId: ledger?.linkedOnlineTestId || '',
            linkedMstOnlineTestId: ledger?.linkedMstOnlineTestId || '',
            linkedEseOnlineTestId: ledger?.linkedEseOnlineTestId || '',
            isLocked: ledger?.isLocked || false,
            lockedAt: ledger?.lockedAt || null,
            lockedBy: ledger?.lockedBy || '',
            studentMarks
        };

        return res.json(fullLedger);
    } catch (e) {
        console.error("Failed to fetch course marks ledger:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Save Course Marks Ledger
app.post('/api/admin/marks-ledger/save/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { studentMarks, linkedOnlineTestId, linkedMstOnlineTestId, linkedEseOnlineTestId } = req.body;

    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    try {
        const recalculated = (studentMarks || []).map(m => calculateMarksLedgerEntry(m, courseDef.type));

        if (useMongo) {
            let ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (!ledger) {
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestId: linkedOnlineTestId || '',
                    linkedMstOnlineTestId: linkedMstOnlineTestId || '',
                    linkedEseOnlineTestId: linkedEseOnlineTestId || '',
                    studentMarks: recalculated
                });
            } else {
                if (ledger.isLocked) {
                    return res.status(403).json({ error: "This course marks ledger is locked by administration and cannot be modified." });
                }
                if (linkedOnlineTestId !== undefined) ledger.linkedOnlineTestId = linkedOnlineTestId;
                if (linkedMstOnlineTestId !== undefined) ledger.linkedMstOnlineTestId = linkedMstOnlineTestId;
                if (linkedEseOnlineTestId !== undefined) ledger.linkedEseOnlineTestId = linkedEseOnlineTestId;
                ledger.studentMarks = recalculated;
            }
            await ledger.save();
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            const idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx !== -1 && db.academicMarksLedgers[idx].isLocked) {
                return res.status(403).json({ error: "This course marks ledger is locked by administration and cannot be modified." });
            }
            const record = {
                courseCode: courseDef.code,
                courseName: courseDef.name,
                courseType: courseDef.type,
                linkedOnlineTestId: linkedOnlineTestId !== undefined ? linkedOnlineTestId : (db.academicMarksLedgers[idx]?.linkedOnlineTestId || ''),
                linkedMstOnlineTestId: linkedMstOnlineTestId !== undefined ? linkedMstOnlineTestId : (db.academicMarksLedgers[idx]?.linkedMstOnlineTestId || ''),
                linkedEseOnlineTestId: linkedEseOnlineTestId !== undefined ? linkedEseOnlineTestId : (db.academicMarksLedgers[idx]?.linkedEseOnlineTestId || ''),
                isLocked: db.academicMarksLedgers[idx]?.isLocked || false,
                studentMarks: recalculated,
                updatedAt: new Date().toISOString()
            };
            if (idx !== -1) {
                db.academicMarksLedgers[idx] = record;
            } else {
                db.academicMarksLedgers.push(record);
            }
            saveJSONData(db);
        }

        await logSystemAction('admin', 'MARKS_LEDGER_SAVED', `Admin updated marks ledger for course ${courseCode}`, 'info');
        return res.json({ success: true, message: `Marks ledger for ${courseCode} saved successfully.` });
    } catch (e) {
        console.error("Failed to save marks ledger:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Link Online Test to Course & Sync Scores (Lab Courses Only)
app.post('/api/admin/marks-ledger/link-test/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { testId, targetExam = 'mst', syncOnlineScores } = req.body; // targetExam: 'mst' (40m) or 'ese' (100m)

    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    if (courseDef.type !== 'lab') {
        return res.status(400).json({ error: "Online test linking applies strictly to Lab Courses (MST Online - 40m, ESE Online - 100m). Theory courses are evaluated via Written Counterfoil & TA." });
    }

    try {
        let allLedgers = [];
        let submissions = [];

        if (useMongo) {
            allLedgers = await AcademicMarksLedgerModel.find().lean();
            if (testId) {
                submissions = await TestSubmissionModel.find({ testId }).lean();
            }
        } else {
            const db = getJSONData();
            allLedgers = db.academicMarksLedgers || [];
            if (testId) {
                submissions = (db.testSubmissions || []).filter(s => String(s.testId) === String(testId));
            }
        }

        // Check if test is assigned elsewhere
        if (testId) {
            const conflict = allLedgers.find(l => {
                const sameCourse = l.courseCode === courseCode;
                if (!sameCourse) {
                    return String(l.linkedOnlineTestId) === String(testId) ||
                           String(l.linkedMstOnlineTestId) === String(testId) ||
                           String(l.linkedEseOnlineTestId) === String(testId);
                } else {
                    if (targetExam === 'mst') {
                        return String(l.linkedEseOnlineTestId) === String(testId);
                    } else {
                        return String(l.linkedMstOnlineTestId) === String(testId);
                    }
                }
            });

            if (conflict) {
                return res.status(400).json({ error: `Test ID ${testId} is already assigned to course ${conflict.courseCode} (${conflict.courseName}) and cannot be reused.` });
            }
        }

        let ledger = null;
        if (useMongo) {
            ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (!ledger) {
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestId: '',
                    linkedMstOnlineTestId: targetExam === 'mst' ? (testId || '') : '',
                    linkedEseOnlineTestId: targetExam === 'ese' ? (testId || '') : ''
                });
            } else {
                ledger.linkedOnlineTestId = '';
                if (targetExam === 'mst') ledger.linkedMstOnlineTestId = testId || '';
                else ledger.linkedEseOnlineTestId = testId || '';
            }
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            let idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx === -1) {
                ledger = {
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestId: '',
                    linkedMstOnlineTestId: targetExam === 'mst' ? (testId || '') : '',
                    linkedEseOnlineTestId: targetExam === 'ese' ? (testId || '') : '',
                    studentMarks: []
                };
                db.academicMarksLedgers.push(ledger);
            } else {
                db.academicMarksLedgers[idx].linkedOnlineTestId = '';
                if (targetExam === 'mst') db.academicMarksLedgers[idx].linkedMstOnlineTestId = testId || '';
                else db.academicMarksLedgers[idx].linkedEseOnlineTestId = testId || '';
                ledger = db.academicMarksLedgers[idx];
            }
        }

        // Sync online scores if requested
        if (syncOnlineScores && testId && submissions.length > 0) {
            const subMap = new Map();
            submissions.forEach(s => subMap.set(String(s.candidateId), s));

            ledger.studentMarks = (ledger.studentMarks || []).map(m => {
                const s = subMap.get(String(m.studentId));
                if (s) {
                    const totalScored = Number(s.totalScore || s.evaluation?.totalScore || s.score || 0);
                    const totalMax = Number(s.evaluation?.totalMaxMarks || 100);
                    
                    if (targetExam === 'mst') {
                        // MST Online Exam is scaled out of 40 marks
                        const normalized40 = Math.round(((totalScored / totalMax) * 40) * 100) / 100;
                        m.mstOnline = Math.min(40, normalized40);
                    } else if (targetExam === 'ese') {
                        // ESE Online Exam is scaled out of 100 marks
                        const normalized100 = Math.round(((totalScored / totalMax) * 100) * 100) / 100;
                        m.eseOnline = Math.min(100, normalized100);
                    }
                }
                return calculateMarksLedgerEntry(m, courseDef.type);
            });
        }

        if (useMongo) {
            await ledger.save();
        } else {
            const db = getJSONData();
            saveJSONData(db);
        }

        const examLabel = targetExam === 'mst' ? 'Lab MST Online (40m max)' : 'Lab ESE Online (100m max)';
        await logSystemAction('admin', 'TEST_LINKED', `Linked online test ${testId} to ${examLabel} for course ${courseCode}`, 'info');
        return res.json({ 
            success: true, 
            message: testId ? `Successfully linked online test to ${examLabel} for course ${courseCode}.` : `Unlinked online test from ${examLabel} for course ${courseCode}.`,
            targetExam,
            testId
        });
    } catch (e) {
        console.error("Failed to link online test:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 6. Toggle Lock Status
app.post('/api/admin/marks-ledger/toggle-lock/:courseCode', async (req, res) => {
    const { courseCode } = req.params;

    try {
        let isLocked = false;
        if (useMongo) {
            let ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (!ledger) {
                const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    isLocked: true,
                    lockedAt: new Date(),
                    lockedBy: 'admin'
                });
            } else {
                ledger.isLocked = !ledger.isLocked;
                ledger.lockedAt = ledger.isLocked ? new Date() : null;
                ledger.lockedBy = ledger.isLocked ? 'admin' : '';
            }
            await ledger.save();
            isLocked = ledger.isLocked;
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            let idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx === -1) {
                const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };
                db.academicMarksLedgers.push({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    isLocked: true,
                    lockedAt: new Date().toISOString(),
                    studentMarks: []
                });
                isLocked = true;
            } else {
                db.academicMarksLedgers[idx].isLocked = !db.academicMarksLedgers[idx].isLocked;
                isLocked = db.academicMarksLedgers[idx].isLocked;
            }
            saveJSONData(db);
        }

        await logSystemAction('admin', 'LEDGER_LOCK_TOGGLED', `Admin set lock status to ${isLocked} for course ${courseCode}`, 'info');
        return res.json({ success: true, isLocked, message: `Course ${courseCode} is now ${isLocked ? 'locked' : 'unlocked'}.` });
    } catch (e) {
        console.error("Failed to toggle ledger lock:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 7. Get Master Transcripts Grid (All Students * All Courses)
app.get('/api/admin/marks-ledger/master-transcripts', async (req, res) => {
    try {
        let candidates = [];
        let ledgers = [];

        if (useMongo) {
            candidates = await CandidateModel.find().lean();
            ledgers = await AcademicMarksLedgerModel.find().lean();
        } else {
            const db = getJSONData();
            candidates = db.candidates || [];
            ledgers = db.academicMarksLedgers || [];
        }

        const courseDefs = DEFAULT_ACADEMIC_COURSES;
        const masterRows = candidates.map(cand => {
            const sId = String(cand.studentId || cand.registrationData?.studentId || cand._id);
            const sName = cand.name || cand.registrationData?.fullName || 'Candidate';
            const rollNo = cand.rollNo || cand.studentId || '';

            const courseScores = {};
            let totalGradePoints = 0;
            let countCourses = 0;

            courseDefs.forEach(c => {
                const ledger = ledgers.find(l => l.courseCode === c.code);
                const sm = (ledger?.studentMarks || []).find(m => String(m.studentId) === sId);
                if (sm) {
                    courseScores[c.code] = {
                        finalScore: sm.finalScore,
                        grade: sm.grade,
                        gradePoint: sm.gradePoint,
                        status: sm.status
                    };
                    totalGradePoints += Number(sm.gradePoint || 0);
                    countCourses++;
                } else {
                    courseScores[c.code] = {
                        finalScore: 0,
                        grade: 'FF',
                        gradePoint: 0,
                        status: 'FAIL'
                    };
                }
            });

            const cgpa = countCourses > 0 ? Math.round((totalGradePoints / countCourses) * 100) / 100 : 0;

            return {
                studentId: sId,
                studentName: sName,
                rollNo,
                courseScores,
                cgpa
            };
        });

        return res.json({
            courses: courseDefs,
            transcripts: masterRows
        });
    } catch (e) {
        console.error("Failed to generate master transcripts:", e);
        return res.status(500).json({ error: e.message });
    }
});

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

// Start Express Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`BICS Portal Backend server running on port ${PORT} (0.0.0.0)`);
    });
}

module.exports = app;
