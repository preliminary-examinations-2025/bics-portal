const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { exec } = require('child_process');
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
            id: "demo_test_id",
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
        hallTicketUrl: '/public/textbooks/CS_Introduction_Textbook.pdf',
        timetableNotice: 'Mid semester test for BICS 2026 will be held in mid-August',
        examType: 'midsem',
        timetable: [
            { code: "CS-101", course: "Introduction to Computer Science", date: "2026-08-10", time: "10:00 AM - 01:00 PM", marks: 50 },
            { code: "CS-102", course: "Programming Fundamentals with C++", date: "2026-08-12", time: "10:00 AM - 01:00 PM", marks: 50 },
            { code: "CS-103", course: "Basics of Web Development", date: "2026-08-14", time: "10:00 AM - 01:00 PM", marks: 50 },
            { code: "CS-104", course: "Mathematical Thinking (Discrete Structures)", date: "2026-08-17", time: "10:00 AM - 01:00 PM", marks: 50 }
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
    exitFormSubmitted: { type: Boolean, default: false },
    exitAnswers: { type: Map, of: String, default: {} }
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
    points: Number,
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
}, { _id: false });

const TestConfigSchema = new mongoose.Schema({
    title: String,
    marks: Number,
    instructions: String,
    duration: Number, // in minutes
    startDate: Date,
    endDate: Date,
    questions: [QuestionSchema],
    answersReleased: { type: Boolean, default: false }, // Admin release toggle for answer sheets
    isPublished: { type: Boolean, default: false } // Admin display/publish toggle for student visibility
});
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
    score: { type: Number, default: 0 } // Scored marks for this question
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
    }
}, { versionKey: false });
const TestSubmissionModel = mongoose.model('TestSubmissionV3', TestSubmissionSchema, 'testsubmissions_v3');

function recalculateMCQScore(submission, test) {
    if (!test || !submission) return;
    let mcqPoints = 0;
    submission.answers = submission.answers || [];
    submission.answers.forEach(ans => {
        const quest = test.questions.find(q => String(q.id) === String(ans.questionId));
        if (quest && quest.type === 'mcq') {
            if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null) {
                if (Number(quest.correctOptionIndex) === Number(ans.selectedOptionIndex)) {
                    ans.score = Number(quest.points || 0);
                    mcqPoints += Number(quest.points || 0);
                } else {
                    ans.score = 0;
                }
            } else {
                ans.score = 0;
            }
        }
    });
    submission.evaluation = submission.evaluation || {};
    submission.evaluation.mcqScore = mcqPoints;
}

async function recalculateCodingScore(submission, test) {
    if (!test || !submission) return;
    let totalCodingScore = 0;
    submission.answers = submission.answers || [];
    for (let i = 0; i < submission.answers.length; i++) {
        const ans = submission.answers[i];
        const quest = test.questions.find(q => String(q.id) === String(ans.questionId));
        if (quest && quest.type === 'coding') {
            if (!ans.submittedCode || ans.submittedCode.trim() === '') {
                ans.score = 0;
                continue;
            }
            try {
                const runRes = await executeCode(ans.submittedCode, quest.testCases || []);
                let codingPoints = 0;
                if (runRes && runRes.success && runRes.results) {
                    runRes.results.forEach((res, resIdx) => {
                        const tc = quest.testCases[resIdx];
                        if (res.status === 'Accepted' && tc) {
                            codingPoints += Number(tc.points || 0);
                        }
                    });
                }
                ans.score = codingPoints;
                totalCodingScore += codingPoints;
            } catch (err) {
                console.error("Autograding failed for question", quest.id, err);
                ans.score = 0;
            }
        } else if (quest && quest.type === 'web') {
            if (ans.score === undefined) ans.score = 0;
        }
    }
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
    if (useMongo) {
        try {
            const conf = await ConfigModel.findOne();
            if (conf && !conf.timetableNotice) {
                conf.timetableNotice = 'Mid semester test for BICS 2026 will be held in mid-August';
                await conf.save();
            }
            return res.json(conf);
        } catch (e) {
            await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to fetch system configuration: ${e.message || e}`, 'error');
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        if (db && db.config && !db.config.timetableNotice) {
            db.config.timetableNotice = 'Mid semester test for BICS 2026 will be held in mid-August';
            saveJSONData(db);
        }
        return res.json(db.config);
    }
});

// 3. Update System Configuration (Admin Only)
app.post('/api/admin/config', async (req, res) => {
    const { courseRegistrationActive, onlineExamActive, midSemFeedbackActive, endSemFeedbackActive, exitFormActive, hallTicketDownloadActive, timetable, timetableNotice, announcements, hallTicketUrl, examType, classTests } = req.body;

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
    const { role, id, newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters long" });
    }

    if (role === 'admin') {
        return res.json({ success: true, message: "Admin password changed successfully (session mock update)." });
    }

    if (useMongo) {
        try {
            const student = await CandidateModel.findById(id);
            if (!student) return res.status(404).json({ error: "Candidate not found" });
            student.password = newPassword;
            await student.save();
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const student = db.candidates.find(c => c._id === id || c.studentId === id);
        if (!student) return res.status(404).json({ error: "Candidate not found" });
        student.password = newPassword;
        saveJSONData(db);
        return res.json({ success: true });
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

    try {
        if (useMongo) {
            const cand = await CandidateModel.findById(id);
            cand.signedConsent = true;
            await cand.save();
            await logSystemAction(cand.name || id, 'CONSENT_SIGNED', `Candidate signed malpractice & proctoring consent, unlocking Hall Ticket`, 'info');
            return res.json({ success: true, signedConsent: true });
        } else {
            const db = getJSONData();
            const cand = db.candidates.find(c => c.id === id);
            cand.signedConsent = true;
            saveJSONData(db);
            await logSystemAction(cand.name || id, 'CONSENT_SIGNED', `Candidate signed malpractice & proctoring consent, unlocking Hall Ticket`, 'info');
            return res.json({ success: true, signedConsent: true });
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
            if (type === 'mid') {
                cand.midSemFeedback = feedback;
            } else {
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
        if (type === 'mid') {
            cand.midSemFeedback = feedback;
        } else {
            cand.endSemFeedback = feedback;
        }
        saveJSONData(db);
        return res.json({ success: true });
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
            // Local fallback upload to verify locally without configured keys
            const uploadsDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const fileName = `question-${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
            const filePath = path.join(uploadsDir, fileName);
            fs.writeFileSync(filePath, file.buffer);
            fileUrl = `/public/uploads/${fileName}`;
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
// ==========================================

// 1. Get active tests for student dashboard (Strips answer keys for security)
app.get('/api/tests/active', async (req, res) => {
    const { candidateId } = req.query;
    try {
        const now = new Date();
        let activeTests = [];

        if (useMongo) {
            activeTests = await TestConfigModel.find({
                $or: [{ isPublished: true }, { isPublished: { $exists: false } }],
                endDate: { $gte: now }
            }).lean();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            activeTests = db.tests.filter(t => {
                const end = new Date(t.endDate);
                return t.isPublished !== false && end >= now;
            });
        }

        const sanitizedTests = await Promise.all(activeTests.map(async (t) => {
            const tObj = { ...t };
            const testId = tObj.id || tObj._id;
            let submissionStatus = null;
            if (candidateId) {
                if (useMongo) {
                    if (mongoose.Types.ObjectId.isValid(candidateId)) {
                        const queryCandidateId = new mongoose.Types.ObjectId(candidateId);
                        const queryTestId = mongoose.Types.ObjectId.isValid(testId.toString()) ? new mongoose.Types.ObjectId(testId.toString()) : testId;
                        const sub = await TestSubmissionModel.findOne({ candidateId: queryCandidateId, testId: queryTestId }).sort({ startedAt: -1 });
                        if (sub) submissionStatus = sub.status;
                    }
                } else {
                    const db = getJSONData();
                    db.testSubmissions = db.testSubmissions || [];
                    const sub = db.testSubmissions.find(s => 
                        s.candidateId && s.testId &&
                        s.candidateId.toString() === candidateId.toString() && 
                        s.testId.toString() === testId.toString()
                    );
                    if (sub) submissionStatus = sub.status;
                }
            }
            const qSanitized = (tObj.questions || []).map(q => {
                if (q.type === 'mcq') {
                    const { correctOptionIndex, ...rest } = q;
                    return rest;
                }
                return q;
            });
            return { 
                id: testId,
                _id: testId,
                title: tObj.title,
                marks: tObj.marks,
                duration: tObj.duration,
                startDate: tObj.startDate,
                endDate: tObj.endDate,
                instructions: tObj.instructions,
                questions: qSanitized,
                submissionStatus 
            };
        }));

        return res.json(sanitizedTests);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
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
            const queryCandidateId = mongoose.Types.ObjectId.isValid(candidateId) ? new mongoose.Types.ObjectId(candidateId) : candidateId;
            submissions = await TestSubmissionModel.find({ candidateId: queryCandidateId });
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

            const isReleased = !!test.answersReleased;

            return {
                id: testId,
                title: test.title,
                marks: test.marks,
                startDate: test.startDate,
                endDate: test.endDate,
                answersReleased: isReleased,
                submission: {
                    id: sub._id || sub.id,
                    status: sub.status,
                    submittedAt: sub.submittedAt,
                    proctoringLog: sub.proctoringLog,
                    evaluation: sub.evaluation,
                    reevaluation: sub.reevaluation,
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
            const queryCandidateId = mongoose.Types.ObjectId.isValid(candidateId) ? new mongoose.Types.ObjectId(candidateId) : candidateId;
            const queryTestId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
            submission = await TestSubmissionModel.findOne({ candidateId: queryCandidateId, testId: queryTestId });
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }
            submission = new TestSubmissionModel({
                candidateId,
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
            const queryCandidateId = mongoose.Types.ObjectId.isValid(candidateId) ? new mongoose.Types.ObjectId(candidateId) : candidateId;
            const queryTestId = mongoose.Types.ObjectId.isValid(testId) ? new mongoose.Types.ObjectId(testId) : testId;
            submission = await TestSubmissionModel.findOne({ candidateId: queryCandidateId, testId: queryTestId });
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

// 4. Submit candidate exam answers and auto-grade MCQ parts
app.post('/api/tests/submit', async (req, res) => {
    const { submissionId, answers, proctoringLog, status } = req.body;

    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });
    console.log(`DEBUG: POST /api/tests/submit submissionId=${submissionId} answersLength=${answers?.length} status=${status}`);

    try {
        let submission = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

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
                if (status !== 'started') {
                    await recalculateCodingScore(submission, test);
                }
            } else {
                submission.evaluation = {
                    mcqScore: 0,
                    codingScore: 0,
                    feedback: '',
                    evaluatedAt: null
                };
            }

            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

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
                if (status !== 'started') {
                    await recalculateCodingScore(submission, test);
                }
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
            tests = await TestConfigModel.find({});
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            tests = db.tests;
        }
        return res.json(tests);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 5b. Toggle answers release state for candidate answer sheets view (Admin only)
app.post('/api/admin/tests/toggle-release/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let answersReleased = false;
        if (useMongo) {
            const test = await TestConfigModel.findById(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.answersReleased = !test.answersReleased;
            await test.save();
            answersReleased = test.answersReleased;
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Toggled answersReleased for test "${test.title}" (${id}) to ${answersReleased}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === id || t._id === id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.answersReleased = !test.answersReleased;
            answersReleased = test.answersReleased;
            saveJSONData(db);
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Toggled answersReleased for test "${test.title}" (${id}) to ${answersReleased}`, 'info');
        }
        return res.json({ success: true, answersReleased });
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
            const test = await TestConfigModel.findById(id);
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

// 6. Create/configure a new test (Admin only)
app.post('/api/admin/tests', async (req, res) => {
    const { title, marks, instructions, duration, startDate, endDate, questions, isPublished } = req.body;
    console.log("DEBUG: POST /api/admin/tests req.body =", JSON.stringify(req.body, null, 2));
    if (!title || !duration || !startDate || !endDate) {
        return res.status(400).json({ error: "Title, Duration, Start Date, and End Date are required" });
    }

    try {
        let savedTest = null;
        if (useMongo) {
            const test = new TestConfigModel({ title, marks, instructions, duration, startDate, endDate, questions, isPublished: isPublished || false });
            await test.save();
            savedTest = test;
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            savedTest = {
                id: Date.now().toString(),
                _id: Date.now().toString(),
                title,
                marks,
                instructions,
                duration: Number(duration),
                startDate,
                endDate,
                questions: questions || [],
                answersReleased: false,
                isPublished: isPublished || false
            };
            db.tests.push(savedTest);
            saveJSONData(db);
        }
        await logSystemAction('admin', 'TEST_CREATED', `Created new test config: "${title}" (${marks} marks, Duration: ${duration} mins)`, 'info');
        return res.json({ success: true, test: savedTest });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to create new test config: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 7. Delete test config (Admin only)
app.delete('/api/admin/tests/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (useMongo) {
            await TestConfigModel.findByIdAndDelete(id);
            await TestSubmissionModel.deleteMany({ testId: id });
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.tests = db.tests.filter(t => t.id !== id && t._id !== id);
            db.testSubmissions = db.testSubmissions || [];
            db.testSubmissions = db.testSubmissions.filter(s => s.testId !== id);
            saveJSONData(db);
        }
        await logSystemAction('admin', 'TEST_DELETED', `Deleted test config with ID: ${id} and all related student submissions`, 'info');
        return res.json({ success: true });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to delete test config ID ${id}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 8. Fetch candidate submissions for a test (Admin only)
app.get('/api/admin/tests/submissions/:testId', async (req, res) => {
    const { testId } = req.params;
    try {
        let subs = [];
        let test = null;
        if (useMongo) {
            test = await TestConfigModel.findById(testId);
            const queryTestId = mongoose.Types.ObjectId.isValid(testId) ? new mongoose.Types.ObjectId(testId) : testId;
            subs = await TestSubmissionModel.find({ testId: queryTestId });
            
            // Auto-heal MCQ scores dynamically
            if (test) {
                for (let sub of subs) {
                    recalculateMCQScore(sub, test);
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            subs = db.testSubmissions.filter(s => s.testId === testId);
            test = db.tests.find(t => t.id === testId || t._id === testId);
            if (test) {
                subs.forEach(sub => recalculateMCQScore(sub, test));
                saveJSONData(db);
            }
        }
        return res.json(subs);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 9. Save manual grading score and feedback for coding tasks (Admin only)
app.post('/api/admin/tests/evaluate/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { codingScore, feedback, reevaluationStatus, resolutionFeedback, answers } = req.body;

    try {
        let submission = null;
        if (useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            if (answers && Array.isArray(answers)) {
                submission.answers = answers;
            }
            const test = await TestConfigModel.findById(submission.testId);
            if (test) {
                recalculateMCQScore(submission, test);
            }
            submission.evaluation.codingScore = Number(codingScore || 0);
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
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            if (answers && Array.isArray(answers)) {
                submission.answers = answers;
            }
            const test = db.tests.find(t => t.id === submission.testId || t._id === submission.testId);
            if (test) {
                recalculateMCQScore(submission, test);
            }
            submission.evaluation.codingScore = Number(codingScore || 0);
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
        await logSystemAction('admin', 'STUDENT_EVALUATED', `Evaluated exam submission ID: ${submissionId} for student "${submission?.candidateName || 'Unknown'}" (Coding: ${codingScore} marks)`, 'info');
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

        exec(`g++ -O3 "${codeFile}" -o "${execFile}"`, async (compileErr, stdout, stderr) => {
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

                        if (tc.input) {
                            child.stdin.write(tc.input);
                            child.stdin.end();
                        } else {
                            child.stdin.end();
                        }
                    });
                    results.push({
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
                stdin: tc.input || ""
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
    app.listen(PORT, () => {
        console.log(`BICS Portal Backend server running on port ${PORT}`);
    });
}

module.exports = app;
