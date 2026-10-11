const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { VideoLectureModel, CourseMaterialModel, ClassroomSubmissionModel, CandidateModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { upload } = require('../middleware/upload');
const { formatCloudinaryMediaUrl, uploadToCloudinary } = require('../config/cloudinary');
const { GOOGLE_CLASSROOM_WEBHOOK_KEY } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { extractYouTubeId, generateLectureSummary } = require('../utils/aiLectureSummarizer');

// 1. Video Lectures Endpoints
router.get('/video-lectures', async (req, res) => {
    if (dbState.useMongo) {
        try {
            const list = await VideoLectureModel.find({}).sort({ createdAt: 1 });
            // Ensure youtubeId is present for all items
            const updatedList = await Promise.all(list.map(async (lec) => {
                if (!lec.youtubeId && lec.youtubeUrl) {
                    const yId = extractYouTubeId(lec.youtubeUrl);
                    if (yId) {
                        lec.youtubeId = yId;
                        await VideoLectureModel.updateOne({ _id: lec._id }, { $set: { youtubeId: yId } });
                    }
                }
                return lec;
            }));
            return res.json(updatedList);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.videoLectures = db.videoLectures || [];
        db.videoLectures.forEach(l => {
            if (!l.youtubeId && l.youtubeUrl) {
                l.youtubeId = extractYouTubeId(l.youtubeUrl);
            }
        });
        saveJSONData(db);
        return res.json(db.videoLectures);
    }
});

// AI Summary Status Endpoint (Read-Only: checks DB cache, NEVER auto-generates)
router.get('/video-lectures/:id/summary', async (req, res) => {
    const { id } = req.params;
    try {
        let lecture = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                lecture = await VideoLectureModel.findById(id);
            }
            if (!lecture) {
                lecture = await VideoLectureModel.findOne({ youtubeId: id });
            }
        } else {
            const db = getJSONData();
            lecture = (db.videoLectures || []).find(l => l.id === id || l._id === id || l.youtubeId === id);
        }

        if (!lecture) {
            return res.status(404).json({ error: "Lecture not found" });
        }

        // Return cached summary if already generated
        if (lecture.aiSummary && lecture.aiSummary.synopsis) {
            return res.json({
                cached: true,
                summary: lecture.aiSummary
            });
        }

        // Return null summary if not generated yet (DO NOT auto-generate for all)
        return res.json({
            cached: false,
            summary: null
        });
    } catch (err) {
        console.error('[AI Lecture Summary Check Error]', err);
        return res.status(500).json({ error: err.message || "Failed to check AI lecture summary" });
    }
});

// Explicit AI Summary Generation Endpoint (Runs ONLY when student explicitly clicks "Summarize this Lecture")
const handleGenerateSummary = async (req, res) => {
    const { id } = req.params;
    try {
        let lecture = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                lecture = await VideoLectureModel.findById(id);
            }
            if (!lecture) {
                lecture = await VideoLectureModel.findOne({ youtubeId: id });
            }
        } else {
            const db = getJSONData();
            lecture = (db.videoLectures || []).find(l => l.id === id || l._id === id || l.youtubeId === id);
        }

        if (!lecture) {
            return res.status(404).json({ error: "Lecture not found" });
        }

        // If already cached, return immediately
        if (lecture.aiSummary && lecture.aiSummary.synopsis) {
            return res.json({
                cached: true,
                summary: lecture.aiSummary
            });
        }

        // Trigger cascading AI pipeline: 1. OpenRouter (Gemini Flash) -> 2. Gemini Direct -> 3. Groq (GPT models)
        const generated = await generateLectureSummary({
            title: lecture.title,
            section: lecture.section,
            youtubeUrl: lecture.youtubeUrl
        });

        // Cache permanently in database
        if (dbState.useMongo) {
            await VideoLectureModel.updateOne(
                { _id: lecture._id },
                { $set: { aiSummary: generated } }
            );
        } else {
            const db = getJSONData();
            const target = (db.videoLectures || []).find(l => l.id === lecture.id || l._id === lecture._id);
            if (target) {
                target.aiSummary = generated;
                saveJSONData(db);
            }
        }

        return res.json({
            cached: false,
            summary: generated
        });
    } catch (err) {
        console.error('[AI Lecture Summary Generation Error]', err);
        return res.status(500).json({ error: err.message || "Failed to generate AI lecture summary" });
    }
};

router.post('/video-lectures/:id/summary/generate', handleGenerateSummary);
router.post('/video-lectures/:id/summary', handleGenerateSummary);

// Student Lecture Progress - Get Current Student's Progress Map
router.get('/student/lecture-progress', async (req, res) => {
    const studentId = req.query.studentId || req.headers['x-student-id'];
    if (!studentId) {
        return res.status(400).json({ error: "Student ID required" });
    }

    if (dbState.useMongo) {
        try {
            const orQuery = [{ studentId }, { username: studentId }];
            if (mongoose.Types.ObjectId.isValid(studentId)) {
                orQuery.push({ _id: studentId });
            }
            const candidate = await CandidateModel.findOne({ $or: orQuery });
            if (!candidate) return res.json({ progress: {} });
            const progress = candidate.lectureProgress ? Object.fromEntries(candidate.lectureProgress) : {};
            return res.json({ progress });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => 
            c.studentId === studentId || 
            c.username === studentId || 
            c.id === studentId || 
            c._id === studentId
        );
        return res.json({ progress: (cand && cand.lectureProgress) || {} });
    }
});

// Student Lecture Progress - Update Watch Progress & Notes
router.post('/video-lectures/:id/progress', async (req, res) => {
    const { id } = req.params;
    const { studentId, currentTime, duration, percent, watchedSeconds, completed, personalNotes } = req.body;

    if (!studentId) {
        return res.status(400).json({ error: "Student ID required" });
    }

    const curTime = Number(currentTime) || 0;
    const dur = Number(duration) || 0;
    const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
    const watched = Number(watchedSeconds) || 0;
    const isCompleted = !!completed || pct >= 85;

    const progressEntry = {
        currentTime: curTime,
        duration: dur,
        percent: pct,
        watchedSeconds: watched,
        completed: isCompleted,
        lastWatchedAt: new Date(),
        personalNotes: personalNotes !== undefined ? String(personalNotes) : undefined
    };

    if (dbState.useMongo) {
        try {
            const orQuery = [{ studentId }, { username: studentId }];
            if (mongoose.Types.ObjectId.isValid(studentId)) {
                orQuery.push({ _id: studentId });
            }
            const candidate = await CandidateModel.findOne({ $or: orQuery });
            if (!candidate) {
                return res.status(404).json({ error: "Candidate not found" });
            }

            if (!candidate.lectureProgress) {
                candidate.lectureProgress = new Map();
            }

            const existing = candidate.lectureProgress.get(id) || {};
            const merged = {
                currentTime: Math.max(existing.currentTime || 0, progressEntry.currentTime),
                duration: progressEntry.duration || existing.duration || 0,
                percent: Math.max(existing.percent || 0, progressEntry.percent),
                watchedSeconds: Math.max(existing.watchedSeconds || 0, progressEntry.watchedSeconds || 0),
                completed: existing.completed || progressEntry.completed || Math.max(existing.percent || 0, progressEntry.percent) >= 85,
                lastWatchedAt: progressEntry.lastWatchedAt,
                personalNotes: progressEntry.personalNotes !== undefined ? progressEntry.personalNotes : (existing.personalNotes || '')
            };

            candidate.lectureProgress.set(id, merged);
            candidate.markModified('lectureProgress');
            await candidate.save();

            return res.json({ success: true, progress: merged });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => 
            c.studentId === studentId || 
            c.username === studentId || 
            c.id === studentId || 
            c._id === studentId
        );
        if (!cand) return res.status(404).json({ error: "Candidate not found" });

        cand.lectureProgress = cand.lectureProgress || {};
        const existing = cand.lectureProgress[id] || {};
        cand.lectureProgress[id] = {
            currentTime: Math.max(existing.currentTime || 0, progressEntry.currentTime),
            duration: progressEntry.duration || existing.duration || 0,
            percent: Math.max(existing.percent || 0, progressEntry.percent),
            watchedSeconds: Math.max(existing.watchedSeconds || 0, progressEntry.watchedSeconds || 0),
            completed: existing.completed || progressEntry.completed || Math.max(existing.percent || 0, progressEntry.percent) >= 85,
            lastWatchedAt: progressEntry.lastWatchedAt,
            personalNotes: progressEntry.personalNotes !== undefined ? progressEntry.personalNotes : (existing.personalNotes || '')
        };
        saveJSONData(db);
        return res.json({ success: true, progress: cand.lectureProgress[id] });
    }
});

router.post('/admin/video-lectures', async (req, res) => {
    const { section, title, youtubeUrl, hasPlayground, playgroundLanguage, codeTemplate, webHtmlTemplate, webCssTemplate, webJsTemplate } = req.body;
    if (!section || !title || !youtubeUrl) {
        return res.status(400).json({ error: "Section, Title, and YouTube Link are required" });
    }

    const yId = extractYouTubeId(youtubeUrl);

    if (dbState.useMongo) {
        try {
            const lect = new VideoLectureModel({
                section,
                title,
                youtubeUrl,
                youtubeId: yId,
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
            youtubeId: yId,
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

router.delete('/admin/video-lectures/:id', async (req, res) => {
    const { id } = req.params;

    if (dbState.useMongo) {
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

// 2. Course Materials Endpoints
router.get('/course-materials', async (req, res) => {
    const sanitizeMat = (m) => {
        if (!m) return m;
        const obj = typeof m.toObject === 'function' ? m.toObject() : JSON.parse(JSON.stringify(m));
        if (obj.fileUrl) obj.fileUrl = formatCloudinaryMediaUrl(obj.fileUrl);
        return obj;
    };
    if (dbState.useMongo) {
        try {
            const list = await CourseMaterialModel.find({}).sort({ createdAt: 1 });
            return res.json(list.map(sanitizeMat));
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        db.courseMaterials = db.courseMaterials || [];
        return res.json((db.courseMaterials || []).map(sanitizeMat));
    }
});

router.post('/admin/course-materials', upload.single('materialFile'), async (req, res) => {
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
        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

        if (useCloudinary) {
            fileUrl = await uploadToCloudinary(file.buffer, 'BICS_2026/materials');
        } else {
            fileUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
        }

        if (dbState.useMongo) {
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
router.post('/admin/upload-image', upload.single('imageFile'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "Image file upload is required." });

        let fileUrl = '';
        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

        if (useCloudinary) {
            fileUrl = await uploadToCloudinary(file.buffer, 'BICS_2026/questions');
        } else {
            if (process.env.VERCEL || process.env.RENDER) {
                fileUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            } else {
                const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
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

router.delete('/admin/course-materials/:id', async (req, res) => {
    const { id } = req.params;

    if (dbState.useMongo) {
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

// 3. Google Classroom Digital Submissions
router.post('/webhooks/google-classroom/submission', async (req, res) => {
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

        if (email) {
            const lowercaseEmail = email.toLowerCase().trim();
            const usernamePart = email.split('@')[0].toLowerCase().trim();
            if (dbState.useMongo) {
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
        if (dbState.useMongo) {
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

router.get('/student/submissions/:studentId', async (req, res) => {
    let { studentId } = req.params;
    if (studentId) {
        studentId = studentId.trim().toUpperCase();
    }
    try {
        if (dbState.useMongo) {
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

router.get('/admin/submissions', async (req, res) => {
    try {
        if (dbState.useMongo) {
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

router.post('/admin/submissions/save', async (req, res) => {
    let { _id, studentId, studentName, courseCode, courseName, title, type, submissionDate, dueDate, status, score, maxScore, classroomLink } = req.body;
    if (!studentId || !courseCode || !title || !type) {
        return res.status(400).json({ error: "Required fields missing." });
    }
    studentId = studentId.trim().toUpperCase();
    courseCode = courseCode.trim().toUpperCase();

    try {
        let submission;
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

        if (dbState.useMongo) {
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

            let idx = -1;
            if (_id) {
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

router.delete('/admin/submissions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (dbState.useMongo) {
            let deleted = null;
            if (mongoose.Types.ObjectId.isValid(id)) {
                deleted = await ClassroomSubmissionModel.findByIdAndDelete(id);
            }
            if (!deleted) {
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

module.exports = router;
