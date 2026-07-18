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
    candidates: [],
    config: {
        courseRegistrationActive: true,
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

// Connect to MongoDB
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 })
    .then(async () => {
        console.log("--> Connected to MongoDB successfully.");
        useMongo = true;
        // Seed default config if empty
        const count = await ConfigModel.countDocuments();
        if (count === 0) {
            const config = new ConfigModel(initialDB.config);
            await config.save();
        }
    })
    .catch(err => {
        console.warn("--> MongoDB connection timed out/failed. Falling back to local JSON database (db.json).");
        useMongo = false;
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
    const { courseRegistrationActive, midSemFeedbackActive, endSemFeedbackActive, exitFormActive, hallTicketDownloadActive, timetable, timetableNotice, announcements, hallTicketUrl } = req.body;

    if (useMongo) {
        try {
            const conf = await ConfigModel.findOne();
            if (courseRegistrationActive !== undefined) conf.courseRegistrationActive = courseRegistrationActive;
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

// Start Express Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`BICS Portal Backend server running on port ${PORT}`);
    });
}

module.exports = app;
