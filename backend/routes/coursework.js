const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const { VideoLectureModel, CourseMaterialModel, ClassroomSubmissionModel, CandidateModel, LectureChatModel, WorkerLogModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { upload } = require('../middleware/upload');
const { authenticateToken, requireAuth, requireAdmin, requireOwnerOrAdmin } = require('../middleware/auth');
const { verifyToken } = require('../utils/jwt');
const { formatCloudinaryMediaUrl, uploadToCloudinary } = require('../config/cloudinary');
const { GOOGLE_CLASSROOM_WEBHOOK_KEY } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { extractYouTubeId, generateLectureSummary, generateSimpleSynopsis, askLectureQuestion } = require('../utils/aiLectureSummarizer');
const { getWorkerStatus, startIngestionWorker, stopIngestionWorker, resetLectureKnowledgeBase, fetchFullYouTubeMetadata } = require('../services/lectureIngestionWorker');

// In-Memory Sliding-Window Rate Limiter for BICS Cortex /ask endpoint
// Limit: max 15 queries per 5 minutes per student or IP address
const cortexRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 15;

function checkCortexRateLimit(clientKey) {
    const now = Date.now();
    const timestamps = cortexRateLimitMap.get(clientKey) || [];
    // Keep timestamps within the sliding window
    const recent = timestamps.filter(t => (now - t) < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
        cortexRateLimitMap.set(clientKey, recent);
        const oldest = recent[0];
        const waitSec = Math.ceil(((oldest + RATE_LIMIT_WINDOW_MS) - now) / 1000);
        return { allowed: false, waitSec: Math.max(waitSec, 1) };
    }
    recent.push(now);
    cortexRateLimitMap.set(clientKey, recent);
    return { allowed: true };
}

// 1. Video Lectures Endpoints
router.get('/video-lectures', requireAuth, async (req, res) => {
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
router.get('/video-lectures/:id/summary', requireAuth, async (req, res) => {
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

        // 1. Prefer knowledgeBase synopsis if ingestion engine has completed it
        if (lecture.knowledgeBase && lecture.knowledgeBase.synopsis) {
            return res.json({
                cached: true,
                summary: {
                    synopsis: lecture.knowledgeBase.synopsis,
                    keyConcepts: lecture.knowledgeBase.keyConcepts || [],
                    provider: 'BICS Knowledge Base (Verified Ground Truth)'
                }
            });
        }

        // 2. Return cached aiSummary if already generated
        if (lecture.aiSummary && lecture.aiSummary.synopsis) {
            return res.json({
                cached: true,
                summary: lecture.aiSummary
            });
        }

        // Auto-generate and cache simple synopsis when loaded if missing
        const generated = await generateSimpleSynopsis({
            title: lecture.title,
            section: lecture.section,
            youtubeUrl: lecture.youtubeUrl
        });

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
        console.error('[AI Lecture Summary Check/Load Error]', err);
        return res.status(500).json({ error: err.message || "Failed to load AI lecture summary" });
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

router.post('/video-lectures/:id/summary/generate', requireAuth, handleGenerateSummary);
router.post('/video-lectures/:id/summary', requireAuth, handleGenerateSummary);

// =========================================================================
// BICS CORTEX: Conversational Q&A Endpoint for Video Lectures
// Incomplete registration gate: Candidates without complete registration (registrationSubmitted === true)
// interact in real-time, but their chats are strictly NOT saved to the database.
// =========================================================================

/**
 * Persist user question and assistant response (including errors) to primary,
 * secondary, and fallback stores.
 * Strictly gated: Chat is NEVER saved if candidate's registration is incomplete.
 */
async function persistLectureChat({ lectureKey, youtubeKey, studentId, studentName, userMsg, assistantMsg, lectureId }) {
    const sId = String(studentId || '127.0.0.1').trim();
    const sName = studentName || (sId === '127.0.0.1' ? 'Local Tester' : 'Candidate');
    const effectiveLecKey = String(lectureKey || lectureId || '');

    // 1. Verify candidate registration completeness
    let cand = null;
    if (dbState.useMongo) {
        try {
            const orQuery = [{ studentId: sId }, { username: sId }];
            if (mongoose.Types.ObjectId.isValid(sId)) {
                orQuery.push({ _id: sId });
            }
            cand = await CandidateModel.findOne({ $or: orQuery });
        } catch (candErr) {
            console.warn('[Candidate Lookup Warning in persistLectureChat]', candErr.message);
        }
    } else {
        const db = getJSONData();
        cand = (db.candidates || []).find(c => c.studentId === sId || c.username === sId || c.id === sId || c._id === sId);
    }

    // STRICT INCOMPLETE REGISTRATION GATE:
    // If candidate does not exist or has not submitted complete registration, DO NOT save any chats!
    if (!cand || cand.registrationSubmitted !== true) {
        return;
    }

    if (dbState.useMongo) {
        // A. Primary Storage: Dedicated LectureChatModel per video lecture & student
        try {
            const chatQuery = {
                $or: [
                    { lectureId: effectiveLecKey, studentId: sId },
                    ...(youtubeKey ? [{ youtubeId: youtubeKey, studentId: sId }] : []),
                    ...(lectureId && String(lectureId) !== effectiveLecKey ? [{ lectureId: String(lectureId), studentId: sId }] : [])
                ]
            };
            let chatDoc = await LectureChatModel.findOne(chatQuery);
            if (!chatDoc) {
                chatDoc = new LectureChatModel({
                    lectureId: effectiveLecKey,
                    youtubeId: youtubeKey || '',
                    studentId: sId,
                    studentName: sName,
                    messages: []
                });
            } else {
                if (youtubeKey && !chatDoc.youtubeId) chatDoc.youtubeId = youtubeKey;
                if (sName && !chatDoc.studentName) chatDoc.studentName = sName;
            }

            chatDoc.messages.push(userMsg, assistantMsg);
            if (chatDoc.messages.length > 60) {
                chatDoc.messages = chatDoc.messages.slice(-60);
            }
            chatDoc.updatedAt = new Date();
            await chatDoc.save();
        } catch (chatDbErr) {
            console.warn('[LectureChat Mongo Save Warning]', chatDbErr.message);
        }

        // B. Secondary Storage: Student Profile Progress Map
        try {
            const progressMap = cand.lectureProgress || new Map();
            const existingEntry = progressMap.get(effectiveLecKey) || (youtubeKey ? progressMap.get(youtubeKey) : null) || {};
            const currentChat = Array.isArray(existingEntry.chatHistory) ? existingEntry.chatHistory : [];
            currentChat.push(userMsg, assistantMsg);
            existingEntry.chatHistory = currentChat.slice(-60);

            progressMap.set(effectiveLecKey, existingEntry);
            if (youtubeKey && youtubeKey !== effectiveLecKey) progressMap.set(youtubeKey, existingEntry);

            cand.lectureProgress = progressMap;
            cand.markModified('lectureProgress');
            await cand.save();
        } catch (candErr) {
            console.warn('[Candidate Progress Chat Save Warning]', candErr.message);
        }
    } else {
        // Fallback: db.json mode
        try {
            const db = getJSONData();
            db.lectureChats = db.lectureChats || [];
            let chatEntry = db.lectureChats.find(c =>
                c.studentId === sId && (c.lectureId === effectiveLecKey || (youtubeKey && c.youtubeId === youtubeKey) || (lectureId && c.lectureId === lectureId))
            );
            if (!chatEntry) {
                chatEntry = {
                    lectureId: effectiveLecKey,
                    youtubeId: youtubeKey || '',
                    studentId: sId,
                    studentName: sName,
                    messages: [],
                    updatedAt: new Date()
                };
                db.lectureChats.push(chatEntry);
            }
            chatEntry.messages.push(userMsg, assistantMsg);
            if (chatEntry.messages.length > 60) {
                chatEntry.messages = chatEntry.messages.slice(-60);
            }
            chatEntry.updatedAt = new Date();

            if (sId && sId !== 'guest') {
                const cand = (db.candidates || []).find(c => c.studentId === sId || c.username === sId || c.id === sId || c._id === sId);
                if (cand) {
                    if (!cand.lectureProgress) cand.lectureProgress = {};
                    const existingEntry = cand.lectureProgress[effectiveLecKey] || (youtubeKey ? cand.lectureProgress[youtubeKey] : null) || {};
                    const currentChat = Array.isArray(existingEntry.chatHistory) ? existingEntry.chatHistory : [];
                    currentChat.push(userMsg, assistantMsg);
                    existingEntry.chatHistory = currentChat.slice(-60);
                    cand.lectureProgress[effectiveLecKey] = existingEntry;
                    if (youtubeKey) cand.lectureProgress[youtubeKey] = existingEntry;
                }
            }
            saveJSONData(db);
        } catch (jsonErr) {
            console.warn('[Cortex Chat JSON Save Warning]', jsonErr.message);
        }
    }
}

router.post('/video-lectures/:id/ask', authenticateToken, requireAuth, async (req, res) => {
    const { id } = req.params;
    const { question, history = [], lectureContext = {} } = req.body;

    let authenticatedUser = req.user;
    const authHeader = req.headers['authorization'];
    if (!authenticatedUser && authHeader && authHeader.startsWith('Bearer ')) {
        authenticatedUser = verifyToken(authHeader.slice(7).trim());
    }

    const reqStudentId = (req.body?.studentId || req.query?.studentId || req.headers['x-student-id'] || '').trim();
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || req.ip || '';
    const cleanIp = (rawIp === '::1' || rawIp === '127.0.0.1' || rawIp.includes('127.0.0.1')) ? '127.0.0.1' : rawIp;

    // Resolve Student ID: token claims -> body/header parameter -> clean IP -> fallback
    let studentId = req.user?.studentId || req.user?.id || 
                    authenticatedUser?.studentId || 
                    authenticatedUser?.username || 
                    authenticatedUser?.id || 
                    reqStudentId || 
                    cleanIp || 
                    '127.0.0.1';

    if (!question || !question.trim()) {
        return res.status(400).json({ error: "Question cannot be empty" });
    }

    // Resolve Candidate name for chat metadata
    let studentName = authenticatedUser?.name || '';
    if (!studentName && dbState.useMongo) {
        try {
            const cDoc = await CandidateModel.findOne({
                $or: [
                    { studentId },
                    { username: studentId },
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ _id: studentId }] : [])
                ]
            });
            if (cDoc) {
                studentName = cDoc.name || cDoc.username || '';
            }
        } catch (e) {}
    }

    // 1. Sliding Window Rate Limiting Check (Tracked per studentId or client IP)
    const rateCheck = checkCortexRateLimit(String(studentId));
    if (!rateCheck.allowed) {
        const rateLimitError = `Rate limit reached. BICS Cortex allows up to 15 queries per 5-minute interval. Please try again in ${rateCheck.waitSec} seconds.`;

        const userMsg = {
            role: 'user',
            content: question.trim(),
            timestamp: new Date()
        };
        const assistantErrorMsg = {
            role: 'assistant',
            content: `⚠️ **BICS Cortex Rate Limit**: ${rateLimitError}`,
            timestamp: new Date(),
            provider: 'BICS Cortex (Rate Limit)',
            isError: true
        };

        // Persist rate-limit warning into chat DB so user sees it in their history
        await persistLectureChat({
            lectureKey: id,
            youtubeKey: extractYouTubeId(id) || extractYouTubeId(lectureContext?.youtubeUrl),
            studentId,
            studentName,
            userMsg,
            assistantMsg: assistantErrorMsg,
            lectureId: id
        });

        return res.status(429).json({
            isError: true,
            error: rateLimitError,
            answer: assistantErrorMsg.content,
            provider: assistantErrorMsg.provider,
            waitSec: rateCheck.waitSec,
            userMessage: userMsg,
            assistantMessage: assistantErrorMsg
        });
    }

    const userMsg = {
        role: 'user',
        content: question.trim(),
        timestamp: new Date()
    };

    let lecture = null;
    const cleanYtId = extractYouTubeId(id) || extractYouTubeId(lectureContext?.youtubeUrl);

    try {
        // 2. Fetch or augment lecture details if not fully provided
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                lecture = await VideoLectureModel.findById(id);
            }
            if (!lecture && id) {
                lecture = await VideoLectureModel.findOne({ youtubeId: id });
            }
            if (!lecture && cleanYtId) {
                lecture = await VideoLectureModel.findOne({
                    $or: [
                        { youtubeId: cleanYtId },
                        { youtubeUrl: new RegExp(cleanYtId) }
                    ]
                });
            }
        } else {
            const db = getJSONData();
            lecture = (db.videoLectures || []).find(l => 
                l.id === id || l._id === id || l.youtubeId === id ||
                (cleanYtId && (l.youtubeId === cleanYtId || (l.youtubeUrl && l.youtubeUrl.includes(cleanYtId))))
            );
        }

        const effectiveContext = {
            youtubeUrl: lecture?.youtubeUrl || lectureContext.youtubeUrl || (cleanYtId ? `https://www.youtube.com/watch?v=${cleanYtId}` : ''),
            title: lecture?.title || '',
            knowledgeBase: lecture?.knowledgeBase || null
        };

        const lectureKey = String(lecture?._id || lecture?.id || id);
        const youtubeKey = lecture?.youtubeId || cleanYtId || '';

        // 3. Call BICS Cortex Multi-Provider Engine (RAG Grounded)
        let cortexResponse;
        try {
            cortexResponse = await askLectureQuestion({
                question: question.trim(),
                history: Array.isArray(history) ? history : [],
                lectureContext: effectiveContext
            });
        } catch (engineErr) {
            cortexResponse = {
                isError: true,
                error: engineErr.message || "BICS Cortex encountered an error analyzing your question. Please try again."
            };
        }

        // 4. Handle Inference Error: STORE THE ERROR MESSAGE IN CHAT AS IT COMES
        if (cortexResponse && cortexResponse.isError) {
            console.warn('[BICS Cortex RAG Error]', cortexResponse.error);
            const errorContent = cortexResponse.error || "BICS Cortex is temporarily unavailable. Please try again in a moment.";

            const assistantErrorMsg = {
                role: 'assistant',
                content: `⚠️ **BICS Cortex Error**: ${errorContent}`,
                timestamp: new Date(),
                provider: cortexResponse.provider || 'BICS Cortex (Error)',
                isError: true
            };

            await persistLectureChat({
                lectureKey,
                youtubeKey,
                studentId,
                studentName,
                userMsg,
                assistantMsg: assistantErrorMsg,
                lectureId: id
            });

            return res.json({
                isError: true,
                error: errorContent,
                answer: assistantErrorMsg.content,
                provider: assistantErrorMsg.provider,
                suggestedFollowups: [],
                userMessage: userMsg,
                assistantMessage: assistantErrorMsg
            });
        }

        // 5. Success: Save user and assistant response in DB
        const assistantSuccessMsg = {
            role: 'assistant',
            content: cortexResponse.answer,
            timestamp: new Date(),
            provider: cortexResponse.provider || 'BICS Cortex',
            isError: false
        };

        await persistLectureChat({
            lectureKey,
            youtubeKey,
            studentId,
            studentName,
            userMsg,
            assistantMsg: assistantSuccessMsg,
            lectureId: id
        });

        return res.json({
            answer: cortexResponse.answer,
            suggestedFollowups: cortexResponse.suggestedFollowups || [],
            provider: cortexResponse.provider || 'BICS Cortex',
            userMessage: userMsg,
            assistantMessage: assistantSuccessMsg
        });

    } catch (err) {
        console.error('[BICS Cortex Ask Error]', err);
        const errorContent = err.message || "BICS Cortex encountered an unexpected error. Please try again.";
        const assistantCatchMsg = {
            role: 'assistant',
            content: `⚠️ **BICS Cortex Error**: ${errorContent}`,
            timestamp: new Date(),
            provider: 'BICS Cortex (Error)',
            isError: true
        };

        try {
            const lectureKey = String(lecture?._id || lecture?.id || id);
            const youtubeKey = lecture?.youtubeId || cleanYtId || '';
            await persistLectureChat({
                lectureKey,
                youtubeKey,
                studentId,
                studentName,
                userMsg,
                assistantMsg: assistantCatchMsg,
                lectureId: id
            });
        } catch (saveCatchErr) {
            console.warn('[Cortex Catch DB Save Notice]', saveCatchErr.message);
        }

        return res.json({
            isError: true,
            error: errorContent,
            answer: assistantCatchMsg.content,
            provider: assistantCatchMsg.provider,
            suggestedFollowups: [],
            userMessage: userMsg,
            assistantMessage: assistantCatchMsg
        });
    }
});

// GET Chat History for Current Student & Lecture
// Multi-alias resolver supports local testers, incomplete registration students, and full accounts
router.get('/video-lectures/:id/chat', requireAuth, async (req, res) => {
    const { id } = req.params;

    let authenticatedUser = req.user;
    const authHeader = req.headers['authorization'];
    if (!authenticatedUser && authHeader && authHeader.startsWith('Bearer ')) {
        authenticatedUser = verifyToken(authHeader.slice(7).trim());
    }

    const rawIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || req.ip || '';
    const cleanIp = (rawIp === '::1' || rawIp === '127.0.0.1' || rawIp.includes('127.0.0.1')) ? '127.0.0.1' : rawIp;

    const studentId = authenticatedUser?.studentId || 
                      authenticatedUser?.username || 
                      authenticatedUser?.id || 
                      req.query.studentId || 
                      req.headers['x-student-id'] || 
                      cleanIp || 
                      '127.0.0.1';

    try {
        const sId = String(studentId).trim();
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

        const lectureKey = String(lecture?._id || lecture?.id || id);
        const youtubeKey = lecture?.youtubeId || extractYouTubeId(lecture?.youtubeUrl || '') || (id.length === 11 ? id : '');

        // Gather all candidate aliases (studentId, username, Mongo _id, local testing synonyms)
        const possibleStudentIds = new Set([sId]);
        if (sId === '127.0.0.1' || sId === 'localhost' || sId === '::1' || sId === 'default_student' || sId === 'guest') {
            possibleStudentIds.add('127.0.0.1');
            possibleStudentIds.add('localhost');
            possibleStudentIds.add('default_student');
            possibleStudentIds.add('guest');
        }

        if (dbState.useMongo) {
            try {
                const cand = await CandidateModel.findOne({
                    $or: [
                        { studentId: sId },
                        { username: sId },
                        ...(mongoose.Types.ObjectId.isValid(sId) ? [{ _id: sId }] : [])
                    ]
                });
                if (cand) {
                    if (cand.studentId) possibleStudentIds.add(String(cand.studentId));
                    if (cand.username) possibleStudentIds.add(String(cand.username));
                    if (cand._id) possibleStudentIds.add(String(cand._id));
                }
            } catch (candErr) {}

            const studentIdList = Array.from(possibleStudentIds);

            // 1. Check dedicated LectureChatModel first
            const chatQuery = {
                $and: [
                    {
                        $or: [
                            { lectureId: lectureKey },
                            ...(youtubeKey ? [{ youtubeId: youtubeKey }] : []),
                            ...(lectureKey !== id ? [{ lectureId: id }] : [])
                        ]
                    },
                    {
                        $or: studentIdList.map(stId => ({ studentId: stId }))
                    }
                ]
            };
            const chatDoc = await LectureChatModel.findOne(chatQuery).sort({ updatedAt: -1 });
            if (chatDoc && Array.isArray(chatDoc.messages) && chatDoc.messages.length > 0) {
                return res.json({ chatHistory: chatDoc.messages });
            }

            // 2. Fallback check on CandidateModel.lectureProgress
            const cand = await CandidateModel.findOne({
                $or: studentIdList.flatMap(stId => [
                    { studentId: stId },
                    { username: stId },
                    ...(mongoose.Types.ObjectId.isValid(stId) ? [{ _id: stId }] : [])
                ])
            });
            if (cand && cand.lectureProgress) {
                const entry = cand.lectureProgress.get(lectureKey) || 
                              (youtubeKey ? cand.lectureProgress.get(youtubeKey) : null) || 
                              cand.lectureProgress.get(id);
                if (entry && Array.isArray(entry.chatHistory) && entry.chatHistory.length > 0) {
                    return res.json({ chatHistory: entry.chatHistory });
                }
            }

            return res.json({ chatHistory: [] });
        } else {
            const db = getJSONData();
            db.lectureChats = db.lectureChats || [];
            const studentIdList = Array.from(possibleStudentIds);

            const chatEntry = db.lectureChats.find(c =>
                studentIdList.includes(c.studentId) &&
                (c.lectureId === lectureKey || (youtubeKey && c.youtubeId === youtubeKey) || c.lectureId === id)
            );
            if (chatEntry && Array.isArray(chatEntry.messages) && chatEntry.messages.length > 0) {
                return res.json({ chatHistory: chatEntry.messages });
            }

            const cand = (db.candidates || []).find(c =>
                studentIdList.includes(c.studentId) ||
                studentIdList.includes(c.username) ||
                studentIdList.includes(c.id) ||
                studentIdList.includes(c._id)
            );
            if (cand && cand.lectureProgress) {
                const entry = cand.lectureProgress[lectureKey] || (youtubeKey ? cand.lectureProgress[youtubeKey] : null) || cand.lectureProgress[id];
                if (entry && Array.isArray(entry.chatHistory) && entry.chatHistory.length > 0) {
                    return res.json({ chatHistory: entry.chatHistory });
                }
            }
            return res.json({ chatHistory: [] });
        }
    } catch (err) {
        console.warn('[Cortex Chat History Fetch Warning]', err);
        return res.json({ chatHistory: [] });
    }
});


// Student Lecture Progress - Get Current Student's Progress Map (supports BICS ObjectID ?id=)
router.get('/student/lecture-progress', requireAuth, async (req, res) => {
    let targetId = req.query.id || req.query.studentId || req.user?.id || req.user?.studentId;

    if (req.user && req.user.role !== 'admin') {
        const allowedIds = [String(req.user.id || ''), String(req.user.studentId || ''), String(req.user.username || '')];
        if (targetId && !allowedIds.includes(String(targetId))) {
            return res.status(403).json({ error: "Access denied: You cannot view lecture progress for another candidate." });
        }
        targetId = req.user.id || req.user.studentId;
    }

    if (!targetId) {
        return res.status(400).json({ error: "Candidate identifier required" });
    }

    if (dbState.useMongo) {
        try {
            const orQuery = [{ studentId: targetId }, { username: targetId }];
            if (mongoose.Types.ObjectId.isValid(targetId)) {
                orQuery.push({ _id: targetId });
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
            c.studentId === targetId || 
            c.username === targetId || 
            c.id === targetId || 
            c._id === targetId
        );
        return res.json({ progress: (cand && cand.lectureProgress) || {} });
    }
});

// Student Lecture Progress - Update Watch Progress & Notes
router.post('/video-lectures/:id/progress', requireAuth, async (req, res) => {
    const { id } = req.params;
    let { studentId, currentTime, duration, percent, watchedSeconds, completed, personalNotes } = req.body;

    if (req.user && req.user.role !== 'admin') {
        studentId = req.user.id || req.user.studentId || req.user.username;
    }

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

            // Also persist browser-verified YouTube IFrame duration onto VideoLectureModel if missing
            if (dur > 10 && mongoose.Types.ObjectId.isValid(id)) {
                VideoLectureModel.updateOne(
                    { _id: id, $or: [{ durationSeconds: 0 }, { durationSeconds: { $exists: false } }] },
                    { $set: { durationSeconds: Math.round(dur) } }
                ).catch(() => {});
            }

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

router.post('/admin/video-lectures', requireAdmin, async (req, res) => {
    const { section, title, youtubeUrl, hasPlayground, playgroundLanguage, codeTemplate, webHtmlTemplate, webCssTemplate, webJsTemplate } = req.body;
    if (!section || !title || !youtubeUrl) {
        return res.status(400).json({ error: "Section, Title, and YouTube Link are required" });
    }

    const yId = extractYouTubeId(youtubeUrl);

    // Resolve exact YouTube duration and metadata upfront
    let detectedDurationSec = 0;
    try {
        if (yId) {
            const ytMeta = await fetchFullYouTubeMetadata(yId);
            if (ytMeta && ytMeta.durationSeconds > 0) {
                detectedDurationSec = ytMeta.durationSeconds;
            }
        }
    } catch (metaErr) {}

    const durationMin = detectedDurationSec > 0 ? Math.max(1, Math.round(detectedDurationSec / 60)) : 0;
    const expectedChunks = durationMin > 0 ? Math.max(1, Math.ceil(durationMin / 25)) : 1;

    // Automatically create a simple synopsis whenever a lecture is posted
    let initialSummary = null;
    try {
        initialSummary = await generateSimpleSynopsis({
            title,
            section,
            youtubeUrl
        });
    } catch (synErr) {
        console.warn('[Admin Video Lecture] Initial synopsis creation note:', synErr.message);
    }

    if (dbState.useMongo) {
        try {
            const lect = new VideoLectureModel({
                section,
                title,
                youtubeUrl,
                youtubeId: yId,
                durationSeconds: detectedDurationSec,
                hasPlayground: !!hasPlayground,
                playgroundLanguage: playgroundLanguage || 'cpp',
                codeTemplate: codeTemplate || '',
                webHtmlTemplate: webHtmlTemplate || '',
                webCssTemplate: webCssTemplate || '',
                webJsTemplate: webJsTemplate || '',
                aiSummary: initialSummary || {},
                knowledgeBase: {
                    status: 'pending',
                    totalDurationMinutes: durationMin,
                    totalChunksExpected: expectedChunks,
                    chunks: []
                }
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
            aiSummary: initialSummary || {},
            createdAt: new Date()
        };
        db.videoLectures.push(newLect);
        saveJSONData(db);
        return res.json({ success: true, lecture: newLect });
    }
});

router.delete('/admin/video-lectures/:id', requireAdmin, async (req, res) => {
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
        db.videoLectures = (db.videoLectures || []).filter(l => l.id !== id && l._id !== id);
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// Admin Status Monitor for Knowledge Base Ingestion Engine
router.get('/admin/knowledge-base/status', requireAdmin, async (req, res) => {
    try {
        const worker = getWorkerStatus();
        let totalCount = 0;
        let completedCount = 0;
        let pendingCount = 0;
        let inProgressCount = 0;
        let failedCount = 0;
        let flaggedLectures = [];

        if (dbState.useMongo) {
            totalCount = await VideoLectureModel.countDocuments();
            completedCount = await VideoLectureModel.countDocuments({ 'knowledgeBase.status': 'completed' });
            inProgressCount = await VideoLectureModel.countDocuments({ 'knowledgeBase.status': 'in_progress' });
            failedCount = await VideoLectureModel.countDocuments({ 
                $or: [
                    { 'knowledgeBase.status': 'failed' },
                    { 'knowledgeBase.flaggedForAdmin': true }
                ]
            });
            pendingCount = totalCount - completedCount - inProgressCount - failedCount;

            flaggedLectures = await VideoLectureModel.find({
                $or: [
                    { 'knowledgeBase.flaggedForAdmin': true },
                    { 'knowledgeBase.status': 'failed' }
                ]
            }).select('_id title section youtubeUrl youtubeId knowledgeBase.lastError knowledgeBase.attempts knowledgeBase.flaggedForAdmin knowledgeBase.failureDetails');
        }

        return res.json({
            worker,
            metrics: {
                totalLectures: totalCount,
                completed: completedCount,
                inProgress: inProgressCount,
                pending: Math.max(0, pendingCount),
                failed: failedCount
            },
            flaggedLectures
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Admin Worker Logs Stream / Fetch Endpoint (Dynamic Log Viewer)
router.get('/admin/knowledge-base/logs', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const search = (req.query.search || '').trim();
        const status = (req.query.status || 'all').trim();
        const action = (req.query.action || '').trim();
        const skip = (page - 1) * limit;

        if (dbState.useMongo) {
            const filter = {};
            if (status && status !== 'all') {
                if (status === 'error') {
                    filter.$or = [{ status: 'error' }, { action: 'FAILED_FLAGGED' }];
                } else if (status === 'warning') {
                    filter.$or = [{ status: 'warning' }, { action: 'RETRYING' }];
                } else if (status === 'success') {
                    filter.$or = [{ status: 'success' }, { action: 'CHUNK_EXTRACTED' }, { action: 'COMPLETED' }];
                } else {
                    filter.status = status;
                }
            }
            if (action && action !== 'all') {
                filter.action = action;
            }
            if (search) {
                const sRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                filter.$or = [
                    { message: sRegex },
                    { lectureTitle: sRegex },
                    { section: sRegex },
                    { action: sRegex },
                    { lectureId: sRegex }
                ];
            }

            const totalCount = await WorkerLogModel.countDocuments(filter);
            const logs = await WorkerLogModel.find(filter)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit);

            const totalPages = Math.max(1, Math.ceil(totalCount / limit));

            if (req.query.format === 'object' || req.query.paginate === 'true' || req.query.page) {
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

            return res.json(logs);
        }
        return res.json(req.query.format === 'object' ? { logs: [], totalCount: 0, page: 1, limit, totalPages: 1 } : []);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Admin Retry Endpoint for Flagged / Failed Lectures
router.post('/admin/knowledge-base/retry/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (dbState.useMongo) {
            const lec = await VideoLectureModel.findById(id);
            if (!lec) {
                return res.status(404).json({ error: 'Video lecture not found' });
            }
            lec.knowledgeBase = lec.knowledgeBase || {};
            lec.knowledgeBase.status = 'pending';
            lec.knowledgeBase.flaggedForAdmin = false;
            lec.knowledgeBase.lastError = '';
            lec.knowledgeBase.attempts = 0;
            lec.knowledgeBase.failureDetails = null;
            await lec.save();

            await WorkerLogModel.create({
                lectureId: String(lec._id),
                lectureTitle: lec.title,
                section: lec.section,
                youtubeId: lec.youtubeId,
                action: 'ADMIN_RETRY',
                status: 'info',
                message: `Admin manually reset failure flag and re-queued knowledge base ingestion for "${lec.title}"`
            });

            return res.json({ success: true, message: `Lecture "${lec.title}" re-queued for processing.` });
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Admin Start Worker Endpoint
router.post('/admin/knowledge-base/start', requireAdmin, async (req, res) => {
    try {
        const result = startIngestionWorker();
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Admin Stop / Shut Off Worker Endpoint
router.post('/admin/knowledge-base/stop', requireAdmin, async (req, res) => {
    try {
        const result = stopIngestionWorker();
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Admin Reset Lecture Knowledge Base Endpoint (Wipes hallucinations & re-queues)
router.post('/admin/knowledge-base/reset/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const success = await resetLectureKnowledgeBase(id);
        if (success) {
            return res.json({ success: true, message: 'Lecture knowledge base wiped and scheduled for fresh, non-hallucinatory ingestion.' });
        } else {
            return res.status(404).json({ error: 'Could not reset lecture knowledge base.' });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 2. Course Materials Endpoints
router.get('/course-materials', requireAuth, async (req, res) => {
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

router.post('/admin/course-materials', requireAdmin, upload.single('materialFile'), async (req, res) => {
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
router.post('/admin/upload-image', requireAdmin, upload.single('imageFile'), async (req, res) => {
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

router.delete('/admin/course-materials/:id', requireAdmin, async (req, res) => {
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
    const providedSecret = req.headers['x-api-secret'] || 
                           req.headers['x-api-key'] || 
                           req.headers['api-secret'] ||
                           req.headers['apisecret'] ||
                           req.headers['x-webhook-key'] || 
                           req.headers['x-classroom-key'] || 
                           req.query.apiSecret ||
                           req.query.key || 
                           req.query.apiKey || 
                           req.query.api_key || 
                           req.body?.apiSecret ||
                           req.body?.key || 
                           req.body?.apiKey;

    const validSecrets = [
        GOOGLE_CLASSROOM_WEBHOOK_KEY,
        process.env.GOOGLE_CLASSROOM_WEBHOOK_KEY,
        process.env.API_ACCESS_SECRET,
        "bics_classroom_secret_key_2026"
    ].filter(Boolean);

    if (!providedSecret || !validSecrets.includes(providedSecret)) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Secret." });
    }

    let { email, studentId, courseCode, courseName, title, type, submissionDate, dueDate, score, maxScore, classroomLink } = req.body;

    if (!courseCode || !title || !type) {
        return res.status(400).json({ error: "Required fields (courseCode, title, type) missing." });
    }
    courseCode = courseCode.trim().toUpperCase();

    try {
        let resolvedStudentId = (studentId || "").trim().toUpperCase();
        let resolvedStudentName = email ? email.split('@')[0] : "Candidate";

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
                    resolvedStudentId = (cand.studentId || cand.username || "STU_UNKNOWN").trim().toUpperCase();
                    resolvedStudentName = cand.name || cand.username || "Candidate";
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
                    resolvedStudentId = (cand.studentId || cand.username || "STU_UNKNOWN").trim().toUpperCase();
                    resolvedStudentName = cand.name || cand.username || "Candidate";
                }
            }
        }

        if (!resolvedStudentId) {
            return res.status(400).json({ error: "Unmatched submission: Could not associate submission with any candidate." });
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

router.get(['/student/submissions/:id', '/student/submissions/:studentId'], requireAuth, requireOwnerOrAdmin((req) => req.params.id || req.params.studentId || req.query.id), async (req, res) => {
    let target = req.params.id || req.params.studentId || req.query.id || (req.user && req.user.id);
    if (!target) {
        return res.status(400).json({ error: "Missing candidate identifier." });
    }

    try {
        let studentRoll = null;
        if (dbState.useMongo) {
            let cand = null;
            if (mongoose.Types.ObjectId.isValid(target)) {
                cand = await CandidateModel.findById(target);
            }
            if (!cand) {
                cand = await CandidateModel.findOne({ studentId: target.trim().toUpperCase() });
            }
            if (!cand && req.user && req.user.studentId) {
                studentRoll = req.user.studentId.trim().toUpperCase();
            } else if (cand && cand.studentId) {
                studentRoll = cand.studentId.trim().toUpperCase();
            } else {
                studentRoll = target.trim().toUpperCase();
            }

            const list = await ClassroomSubmissionModel.find({ studentId: studentRoll });
            return res.json(list);
        } else {
            const db = getJSONData();
            db.classroomSubmissions = db.classroomSubmissions || [];
            db.candidates = db.candidates || [];
            const cand = db.candidates.find(c => String(c._id) === target || String(c.id) === target || (c.studentId && c.studentId.trim().toUpperCase() === target.trim().toUpperCase()));
            const roll = cand ? cand.studentId.trim().toUpperCase() : target.trim().toUpperCase();
            const list = db.classroomSubmissions.filter(s => s.studentId && s.studentId.trim().toUpperCase() === roll);
            return res.json(list);
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

router.get('/admin/submissions', requireAdmin, async (req, res) => {
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

router.post('/admin/submissions/save', requireAdmin, async (req, res) => {
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

router.delete('/admin/submissions/:id', requireAdmin, async (req, res) => {
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
