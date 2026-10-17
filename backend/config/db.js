const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'db.json');

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
            id: "demo_test_1",
            title: "Programming Fundamentals Mock Test",
            marks: 30,
            instructions: "Answer all questions. Each correct MCQ gives +10, Coding problem gives +20.",
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
        devModeActive: false,
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

const dbState = {
    useMongo: false,
    isConnected: false
};

let isConnecting = false;
let lastConnectAttempt = 0;
const RECONNECT_COOLDOWN_MS = 30000; // 30 seconds

// Mongoose connection lifecycle listeners
mongoose.connection.on('connected', () => {
    dbState.isConnected = true;
    dbState.useMongo = true;
    console.log("--> MongoDB connection established.");
});

mongoose.connection.on('disconnected', () => {
    dbState.isConnected = false;
    dbState.useMongo = false;
    console.warn("--> MongoDB disconnected. Active in local JSON database mode.");
});

mongoose.connection.on('error', (err) => {
    dbState.isConnected = false;
    dbState.useMongo = false;
    console.error("--> MongoDB connection error:", err.message);
});

const connectDB = async (models = {}) => {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bics_db';
    if (dbState.isConnected && mongoose.connection.readyState === 1) {
        dbState.useMongo = true;
        return;
    }
    if (isConnecting || mongoose.connection.readyState === 2) {
        return;
    }
    const now = Date.now();
    if (now - lastConnectAttempt < RECONNECT_COOLDOWN_MS) {
        return;
    }
    lastConnectAttempt = now;
    isConnecting = true;

    try {
        console.log("--> Connecting to MongoDB Atlas...");
        await mongoose.connect(MONGO_URI, { 
            serverSelectionTimeoutMS: 3000,
            bufferCommands: false
        });
        dbState.isConnected = true;
        dbState.useMongo = true;
        console.log("--> Connected to MongoDB successfully.");
        
        // Seed default database schema configurations if completely empty
        if (models.ConfigModel) {
            const count = await models.ConfigModel.countDocuments();
            if (count === 0) {
                const config = new models.ConfigModel(initialDB.config);
                await config.save();
                console.log("--> Default system config seeded in MongoDB.");

                if (models.CandidateModel) {
                    const candCount = await models.CandidateModel.countDocuments();
                    if (candCount === 0) {
                        const defaultCand = new models.CandidateModel(initialDB.candidates[0]);
                        await defaultCand.save();
                        console.log("--> Default eligible candidate seeded in MongoDB.");
                    }
                }

                if (models.TestConfigModel) {
                    const testCount = await models.TestConfigModel.countDocuments();
                    if (testCount === 0) {
                        const defaultTest = new models.TestConfigModel(initialDB.tests[0]);
                        await defaultTest.save();
                        console.log("--> Default practice examination seeded in MongoDB.");
                    }
                }

                if (models.ClassroomSubmissionModel) {
                    const submissionCount = await models.ClassroomSubmissionModel.countDocuments();
                    if (submissionCount === 0) {
                        await models.ClassroomSubmissionModel.insertMany(initialDB.classroomSubmissions);
                        console.log("--> Default classroom submissions seeded in MongoDB.");
                    }
                }
            }
        }
    } catch (err) {
        console.error("--> MongoDB connection failed:", err.message);
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
        dbState.isConnected = false;
        dbState.useMongo = false;
        if (isProduction) {
            console.error("--> [CRITICAL PRODUCTION FAILURE] Cannot fall back to local db.json in production environment. Failing loudly.");
        }
    } finally {
        isConnecting = false;
    }
};

module.exports = {
    dbState,
    connectDB,
    getJSONData,
    saveJSONData,
    initialDB,
    DB_FILE
};
