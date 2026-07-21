const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bics_db';

// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json());
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
                        { input: "5, 10", output: "15" }
                    ]
                }
            ]
        }
    ],
    testSubmissions: [],
    config: {
        courseRegistrationActive: true,
        onlineExamActive: true,
        midSemFeedbackActive: false,
        endSemFeedbackActive: false,
        exitFormActive: false,
        hallTicketDownloadActive: true,
        hallTicketUrl: '/public/textbooks/CS_Introduction_Textbook.pdf',
        timetableNotice: 'Mid semester test for BICS 2026 will be held in mid-August',
        timetable: [
            { course: "Introduction to Computer Science", date: "2026-08-10", time: "10:00 AM - 01:00 PM" },
            { course: "Programming Fundamentals with C++", date: "2026-08-12", time: "10:00 AM - 01:00 PM" },
            { course: "Basics of Web Development", date: "2026-08-14", time: "10:00 AM - 01:00 PM" },
            { course: "Mathematical Thinking (Discrete Structures)", date: "2026-08-17", time: "10:00 AM - 01:00 PM" }
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

const ConfigSchema = new mongoose.Schema({
    courseRegistrationActive: { type: Boolean, default: true },
    onlineExamActive: { type: Boolean, default: true },
    midSemFeedbackActive: { type: Boolean, default: false },
    endSemFeedbackActive: { type: Boolean, default: false },
    exitFormActive: { type: Boolean, default: false },
    hallTicketDownloadActive: { type: Boolean, default: true },
    hallTicketUrl: { type: String, default: '/public/textbooks/CS_Introduction_Textbook.pdf' },
    timetableNotice: { type: String, default: 'Mid semester test for BICS 2026 will be held in mid-August' },
    timetable: [{ course: String, date: String, time: String }],
    announcements: [{ id: Number, date: String, text: String }]
});
const ConfigModel = mongoose.model('Config', ConfigSchema);

const VideoLectureSchema = new mongoose.Schema({
    section: String,
    title: String,
    youtubeUrl: String,
    createdAt: { type: Date, default: Date.now }
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
    type: String, // 'mcq' or 'coding'
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
    testCases: [{ input: String, output: String }],
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
    type: String, // 'mcq' or 'coding'
    selectedOptionIndex: Number, // for MCQ
    submittedCode: String, // for Coding
    selectedLanguage: String, // Selected programming language (c, cpp, python, java)
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
        webcamStatus: { type: String, default: 'active' }
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

const TestTokenSchema = new mongoose.Schema({
    token: { type: String, unique: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestConfigV2' },
    createdAt: { type: Date, default: Date.now, expires: 120 }
});
const TestTokenModel = mongoose.model('TestToken', TestTokenSchema, 'testtokens');

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
        
        // Seed default config if empty
        const count = await ConfigModel.countDocuments();
        if (count === 0) {
            const config = new ConfigModel(initialDB.config);
            await config.save();
            console.log("--> Default system config seeded in MongoDB.");
        }

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

    if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, role: 'admin', name: 'System Administrator' });
    }

    if (useMongo) {
        try {
            const student = await CandidateModel.findOne({ username, password });
            if (!student) return res.status(401).json({ error: "Invalid username or password" });
            return res.json({ success: true, role: 'student', id: student._id });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const student = db.candidates.find(c => c.username === username && c.password === password);
        if (!student) return res.status(401).json({ error: "Invalid username or password" });
        return res.json({ success: true, role: 'student', id: student.id });
    }
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
    const { courseRegistrationActive, onlineExamActive, midSemFeedbackActive, endSemFeedbackActive, exitFormActive, hallTicketDownloadActive, timetable, timetableNotice, announcements, hallTicketUrl } = req.body;

    if (useMongo) {
        try {
            const conf = await ConfigModel.findOne();
            if (courseRegistrationActive !== undefined) conf.courseRegistrationActive = courseRegistrationActive;
            if (onlineExamActive !== undefined) conf.onlineExamActive = onlineExamActive;
            if (midSemFeedbackActive !== undefined) conf.midSemFeedbackActive = midSemFeedbackActive;
            if (endSemFeedbackActive !== undefined) conf.endSemFeedbackActive = endSemFeedbackActive;
            if (exitFormActive !== undefined) conf.exitFormActive = exitFormActive;
            if (hallTicketDownloadActive !== undefined) conf.hallTicketDownloadActive = hallTicketDownloadActive;
            if (timetable !== undefined) conf.timetable = timetable;
            if (timetableNotice !== undefined) conf.timetableNotice = timetableNotice;
            if (announcements !== undefined) conf.announcements = announcements;
            if (hallTicketUrl !== undefined) conf.hallTicketUrl = hallTicketUrl;
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
            return res.json({ success: true, profile: cand });
        } else {
            const db = getJSONData();
            const cand = db.candidates.find(c => c.id === id);
            cand.registrationData = registrationData;
            cand.registeredCourses = parsedCourses;
            cand.registrationSubmitted = true;
            saveJSONData(db);
            return res.json({ success: true, profile: cand });
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Uploading files failed. Please verify Cloudinary keys." });
    }
});

// 9. Sign Malpractice Consent
app.post('/api/candidate/consent/:id', async (req, res) => {
    const { id } = req.params;

    if (useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            cand.signedConsent = true;
            await cand.save();
            return res.json({ success: true, signedConsent: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = db.candidates.find(c => c.id === id);
        cand.signedConsent = true;
        saveJSONData(db);
        return res.json({ success: true, signedConsent: true });
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
    const { section, title, youtubeUrl } = req.body;
    if (!section || !title || !youtubeUrl) {
        return res.status(400).json({ error: "Section, Title, and YouTube Link are required" });
    }

    if (useMongo) {
        try {
            const lect = new VideoLectureModel({ section, title, youtubeUrl });
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
                    const queryCandidateId = mongoose.Types.ObjectId.isValid(candidateId) ? new mongoose.Types.ObjectId(candidateId) : candidateId;
                    const queryTestId = mongoose.Types.ObjectId.isValid(testId.toString()) ? new mongoose.Types.ObjectId(testId.toString()) : testId;
                    const sub = await TestSubmissionModel.findOne({ candidateId: queryCandidateId, testId: queryTestId });
                    if (sub) submissionStatus = sub.status;
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
            submissions = await TestSubmissionModel.find({ candidateId: queryCandidateId }).lean();
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
                    await sub.save();
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
                status: 'submitted',
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
                status: 'submitted',
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' },
                answers: []
            };
            db.testSubmissions.push(submission);
            saveJSONData(db);
        }

        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
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
                submission.proctoringLog = proctoringLog;
            }
            submission.status = status || 'submitted';
            submission.submittedAt = new Date();

            const test = await TestConfigModel.findById(submission.testId);
            if (test) {
                recalculateMCQScore(submission, test);
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
                submission.proctoringLog = proctoringLog;
            }
            submission.status = status || 'submitted';
            submission.submittedAt = new Date();

            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === submission.testId || t._id === submission.testId);
            if (test) {
                recalculateMCQScore(submission, test);
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

        return res.json({ success: true, submission });
    } catch (e) {
        console.error("DEBUG ERROR: POST /api/tests/submit failed:", e);
        return res.status(500).json({ error: e.message });
    }
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
        return res.json({ success: true, test: savedTest });
    } catch (e) {
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
        return res.json({ success: true });
    } catch (e) {
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
                    await sub.save();
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
        return res.json({ success: true, submission });
    } catch (e) {
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

        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// Start Express Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`BICS Portal Backend server running on port ${PORT}`);
    });
}

module.exports = app;
