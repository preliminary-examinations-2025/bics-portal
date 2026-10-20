const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { CandidateModel } = require('../models/Candidate');
const { KataQuestionBankModel } = require('../models/KataQuestionBank');
const { KataContestModel } = require('../models/KataContest');
const { KataSubmissionModel } = require('../models/KataSubmission');
const { enqueueSubmission } = require('../utils/judgeEngine');
const { generateContestForTrack, getUpcomingWeekendDates, configureThursdayWeeklyContests } = require('../utils/kataScheduler');
const { runHourlyAiEvaluatorTick, evaluateKataFormaSubmission, evaluateKataFormaVirtualWithGroq } = require('../services/kataAiEvaluator');
const { processContestRatings } = require('../utils/ratingEngine');
const { authenticateToken, requireAdmin, requireBicsStudentOrAdmin } = require('../middleware/auth');
const { comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const { logSystemAction } = require('../utils/logger');

// Cooldown tracker for post-contest practice submissions:
// Shin: 30s per candidate, Forma: 45s per candidate
const practiceSubmissionCooldowns = new Map();

// Escape regular expression special characters to prevent regex crashes and ReDoS
function escapeRegex(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check if code contains substantive solution content (not empty, whitespace, or just default comments/boilerplate)
function isSubstantiveCode(val) {
    if (!val || typeof val !== 'string') return false;
    const stripped = val
        .replace(/<!--[\s\S]*?-->/g, '') // html comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // css/js multiline comments
        .replace(/\/\/.*/g, '') // single-line comments
        .replace(/<div\s+class=["']container["']>\s*<\/div>/gi, '') // empty container tag
        .replace(/\.container\s*\{\s*\}/g, '') // empty css container rule
        .trim();
    return stripped.length > 0;
}

let lastSubmissionEpoch = 0;

// Generate pure Unix timestamp submission ID in the format: 1792... (no student ID)
function generateSubmissionId(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    let epochSec = isNaN(d.getTime()) ? Math.floor(Date.now() / 1000) : Math.floor(d.getTime() / 1000);
    if (!dateInput) {
        if (epochSec <= lastSubmissionEpoch) {
            epochSec = lastSubmissionEpoch + 1;
        }
        lastSubmissionEpoch = epochSec;
    }
    return String(epochSec);
}


// Build safe, type-checked MongoDB query for candidate identity resolution
function buildUserQuery(user) {
    if (!user) return null;
    const orClauses = [];
    if (typeof user.username === 'string' && user.username.trim()) {
        orClauses.push({ username: user.username.trim() });
    }
    if (typeof user.studentId === 'string' && user.studentId.trim()) {
        orClauses.push({ studentId: user.studentId.trim() });
    }
    if (typeof user.id === 'string' && mongoose.Types.ObjectId.isValid(user.id)) {
        orClauses.push({ _id: user.id });
    }
    return orClauses.length > 0 ? { $or: orClauses } : null;
}

// Enforce strict BICS student / admin authentication across all Kata routes
router.use(requireBicsStudentOrAdmin);

// Tier Helper to compute rank title & color from ELO
const getRatingTier = (rating) => {
    const r = Number(rating) || 1200;
    if (r < 1200) return { title: 'Initiate', color: '#808080', bg: '#cccccc' };
    if (r < 1400) return { title: 'Apprentice', color: '#008000', bg: '#77ff77' };
    if (r < 1600) return { title: 'Specialist', color: '#03a89e', bg: '#77ddbb' };
    if (r < 1900) return { title: 'Expert', color: '#0000ff', bg: '#aaaaee' };
    if (r < 2200) return { title: 'Shogun', color: '#aa00aa', bg: '#ff88ff' };
    if (r < 2400) return { title: 'Master', color: '#ff8c00', bg: '#ffcc88' };
    return { title: 'Grandmaster', color: '#ff0000', bg: '#ff7777' };
};

// Helper: Calculate dynamic candidate solved problem stats, streaks, and heatmap from actual submission history
async function calculateCandidateKataStats(candidateId, username, existingProfile = {}) {
    if (!candidateId && !username) return existingProfile;

    const regexClauses = [];
    if (username) regexClauses.push({ username: new RegExp(`^${escapeRegex(username)}$`, 'i') });
    if (candidateId) regexClauses.push({ candidateId: new RegExp(`^${escapeRegex(String(candidateId))}$`, 'i') });
    if (regexClauses.length === 0) return existingProfile;

    // 1. Accepted non-superseded submissions
    const acceptedSubs = await KataSubmissionModel.find({
        $or: regexClauses,
        verdict: 'Accepted',
        isSuperseded: { $ne: true }
    }).sort({ submittedAt: 1 }).lean();

    const distinctProblemMap = new Map();
    const now = Date.now();
    const oneMonthAgo = now - 30 * 86400 * 1000;
    const oneYearAgo = now - 365 * 86400 * 1000;

    let shinSolvedCount = 0;
    let formaSolvedCount = 0;
    let easy = 0, medium = 0, hard = 0, boss = 0;

    for (const s of acceptedSubs) {
        const probKey = `${s.contestId}_${s.problemLetter}`;
        if (!distinctProblemMap.has(probKey)) {
            distinctProblemMap.set(probKey, s);
            const isForma = s.track === 'forma' || (s.contestId && s.contestId.toUpperCase().includes('FORMA'));
            if (isForma) formaSolvedCount++;
            else shinSolvedCount++;

            const pts = s.pointsAwarded || 100;
            if (pts <= 100) easy++;
            else if (pts <= 200) medium++;
            else if (pts <= 300) hard++;
            else boss++;
        }
    }

    const allTimeSolved = distinctProblemMap.size;
    let lastMonthSolved = 0;
    let lastYearSolved = 0;

    for (const s of distinctProblemMap.values()) {
        const t = s.submittedAt ? new Date(s.submittedAt).getTime() : now;
        if (t >= oneMonthAgo) lastMonthSolved++;
        if (t >= oneYearAgo) lastYearSolved++;
    }

    // 2. Submission Heatmap across all submissions
    const allSubs = await KataSubmissionModel.find({
        $or: regexClauses
    }).select('submittedAt').lean();

    const submissionHeatmap = {};
    for (const s of allSubs) {
        if (!s.submittedAt) continue;
        const d = new Date(s.submittedAt);
        const dateStr = d.toISOString().slice(0, 10);
        submissionHeatmap[dateStr] = (submissionHeatmap[dateStr] || 0) + 1;
    }

    // 3. Compute active day streaks
    const activeDates = Object.keys(submissionHeatmap).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;

    for (const ds of activeDates) {
        const curr = new Date(ds + 'T00:00:00Z');
        if (lastDate) {
            const diffDays = Math.round((curr - lastDate) / (86400 * 1000));
            if (diffDays === 1) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
        } else {
            tempStreak = 1;
        }
        lastDate = curr;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
    }

    if (activeDates.length > 0) {
        const latestDate = new Date(activeDates[activeDates.length - 1] + 'T00:00:00Z');
        const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
        const diffFromToday = Math.round((todayUtc - latestDate) / (86400 * 1000));
        if (diffFromToday <= 1) {
            currentStreak = tempStreak;
        } else {
            currentStreak = 0;
        }
    }

    const solvedStats = {
        allTime: allTimeSolved,
        lastYear: lastYearSolved,
        lastMonth: lastMonthSolved,
        shinSolved: shinSolvedCount,
        formaSolved: formaSolvedCount,
        easy,
        medium,
        hard,
        boss
    };

    const streak = {
        current: currentStreak,
        longest: longestStreak,
        lastSubmissionDate: activeDates.length > 0 ? activeDates[activeDates.length - 1] : null
    };

    return {
        ...existingProfile,
        solvedStats,
        submissionHeatmap,
        streak
    };
}

// Helper: computes candidate's individual contest / virtual window status
// Live & virtual contest window: 2 hours.
// Submission gap cooldown for virtual practice: Shin 30 seconds, Forma 45 seconds.
function getCandidateTimer(contest, identifier) {
    const liveDurationSeconds = 2 * 3600;

    if (!contest || !identifier) {
        return {
            isRegistered: false,
            isStarted: false,
            startedAt: null,
            expiresAt: null,
            remainingSeconds: liveDurationSeconds,
            totalSeconds: liveDurationSeconds,
            isExpired: false
        };
    }
    const lower = identifier.toLowerCase();
    const now = new Date();
    const hasEnded = contest.status === 'ended' || (contest.endTime && now > new Date(contest.endTime));

    // First check virtual participation candidates (2-hour virtual window)
    const virtualCand = (contest.virtualCandidates || []).find(c =>
        (c.username && c.username.toLowerCase() === lower) ||
        (c.candidateId && c.candidateId.toLowerCase() === lower)
    );

    if (virtualCand) {
        const virtualDuration = (virtualCand.durationSeconds || liveDurationSeconds) * 1000;
        const expiresAt = new Date(virtualCand.expiresAt || (new Date(virtualCand.startedAt || now).getTime() + virtualDuration));
        const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        const isExpired = now > expiresAt;
        return {
            isRegistered: true,
            isStarted: true,
            isVirtual: true,
            startedAt: virtualCand.startedAt || now,
            expiresAt: expiresAt,
            remainingSeconds,
            totalSeconds: virtualCand.durationSeconds || liveDurationSeconds,
            isExpired
        };
    }

    const cand = (contest.registeredCandidates || []).find(c => 
        (c.username && c.username.toLowerCase() === lower) ||
        (c.candidateId && c.candidateId.toLowerCase() === lower)
    );

    if (cand && !hasEnded) {
        if (cand.startedAt && cand.expiresAt) {
            const expiresAt = new Date(cand.expiresAt);
            const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
            const isExpired = now > expiresAt;
            return {
                isRegistered: true,
                isStarted: true,
                startedAt: cand.startedAt,
                expiresAt: cand.expiresAt,
                remainingSeconds,
                totalSeconds: liveDurationSeconds,
                isExpired
            };
        } else {
            return {
                isRegistered: true,
                isStarted: false,
                startedAt: null,
                expiresAt: null,
                remainingSeconds: liveDurationSeconds,
                totalSeconds: liveDurationSeconds,
                isExpired: false
            };
        }
    }

    return {
        isRegistered: false,
        isStarted: false,
        startedAt: null,
        expiresAt: null,
        remainingSeconds: liveDurationSeconds,
        totalSeconds: liveDurationSeconds,
        isExpired: false
    };
}

/**
 * Helper: finds if candidate currently has an active, unexpired virtual contest running
 * Enforces rule: Candidate can only have ONE virtual contest running at once across the platform.
 * @param {string|string[]} identifiers - username, studentId, or kataHandle
 * @param {string} [excludeContestId] - contest ID to exclude from check (e.g. current contest)
 * @returns {Promise<{ contestId: string, title: string, track: string, startedAt: Date, expiresAt: Date, remainingSeconds: number } | null>}
 */
async function getActiveVirtualContestForCandidate(identifiers, excludeContestId = null) {
    const idList = (Array.isArray(identifiers) ? identifiers : [identifiers])
        .filter(Boolean)
        .map(id => String(id).trim());
    if (idList.length === 0) return null;

    const lowerSet = new Set(idList.map(id => id.toLowerCase()));
    const regexList = Array.from(lowerSet).map(id => new RegExp(`^${escapeRegex(id)}$`, 'i'));
    const now = new Date();

    if (dbState.useMongo) {
        const query = {
            'virtualCandidates': {
                $elemMatch: {
                    $or: [
                        { username: { $in: regexList } },
                        { candidateId: { $in: regexList } }
                    ],
                    startedAt: { $ne: null },
                    expiresAt: { $gt: now }
                }
            }
        };
        if (excludeContestId) {
            query.contestId = { $ne: excludeContestId.toUpperCase() };
        }

        const activeContests = await KataContestModel.find(query).lean();
        for (const c of activeContests) {
            const entry = (c.virtualCandidates || []).find(v =>
                ((v.username && lowerSet.has(v.username.toLowerCase())) ||
                 (v.candidateId && lowerSet.has(v.candidateId.toLowerCase()))) &&
                v.startedAt &&
                new Date(v.expiresAt) > now
            );
            if (entry) {
                const remainingSeconds = Math.max(0, Math.floor((new Date(entry.expiresAt).getTime() - now.getTime()) / 1000));
                return {
                    contestId: c.contestId,
                    title: c.title,
                    track: c.track,
                    startedAt: entry.startedAt,
                    expiresAt: entry.expiresAt,
                    remainingSeconds
                };
            }
        }
    } else {
        const db = getJSONData();
        const contests = db.kataContests || [];
        for (const c of contests) {
            if (excludeContestId && c.contestId?.toUpperCase() === excludeContestId.toUpperCase()) continue;
            const entry = (c.virtualCandidates || []).find(v =>
                ((v.username && lowerSet.has(v.username.toLowerCase())) ||
                 (v.candidateId && lowerSet.has(v.candidateId.toLowerCase()))) &&
                v.startedAt &&
                new Date(v.expiresAt) > now
            );
            if (entry) {
                const remainingSeconds = Math.max(0, Math.floor((new Date(entry.expiresAt).getTime() - now.getTime()) / 1000));
                return {
                    contestId: c.contestId,
                    title: c.title,
                    track: c.track,
                    startedAt: entry.startedAt,
                    expiresAt: entry.expiresAt,
                    remainingSeconds
                };
            }
        }
    }

    return null;
}

/**
 * GET /api/kata/me
 * Retrieves current candidate's Kata profile or returns needsRegistration = true
 */
router.get('/me', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ authenticated: false, error: 'Authentication required' });
        }

        // Admin Identity Handler
        if (req.user.role === 'admin') {
            return res.json({
                authenticated: true,
                needsRegistration: false,
                isAdmin: true,
                candidate: {
                    name: req.user.name || 'System Administrator',
                    username: req.user.username || 'admin',
                    studentId: 'ADMIN',
                    email: process.env.ADMIN_EMAIL || 'admin@bics.edu',
                    role: 'admin',
                    lastLoginAt: new Date(),
                    lastLoginIp: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown'
                },
                profile: {
                    handle: req.user.username || 'admin',
                    shinRating: 3000,
                    shinRank: 'Grandmaster',
                    shinRankColor: '#ff0000',
                    shinMaxRating: 3000,
                    shinMaxRank: 'Grandmaster',
                    formaRating: 3000,
                    formaRank: 'Grandmaster',
                    formaRankColor: '#ff0000',
                    formaMaxRank: 'Grandmaster',
                    contestsLive: 0,
                    contestsVirtual: 0,
                    contribution: 999
                }
            });
        }

        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        let candidate = req.candidate;

        if (!candidate && dbState.useMongo) {
            const query = buildUserQuery(req.user);
            if (query) candidate = await CandidateModel.findOne(query);
        } else if (!candidate) {
            const db = getJSONData();
            const username = req.user.username;
            const studentId = req.user.studentId;
            candidate = (db.candidates || []).find(c =>
                c.username === username ||
                c.studentId === studentId ||
                String(c.id || c._id) === String(req.user.id)
            );
        }

        if (!candidate) {
            return res.status(404).json({ authenticated: false, error: 'Candidate profile not found' });
        }

        const email = candidate.registrationData?.collegeEmail || 
                      candidate.registrationData?.personalEmail || 
                      candidate.email || 
                      '';

        const candidatePayload = {
            id: candidate._id,
            name: candidate.name,
            username: candidate.username,
            studentId: candidate.studentId,
            email: email,
            personalEmail: candidate.registrationData?.personalEmail || '',
            collegeEmail: candidate.registrationData?.collegeEmail || '',
            personalPhone: candidate.registrationData?.personalPhone || '',
            registrationStatus: candidate.registrationStatus || 'Approved',
            lastLoginAt: candidate.lastLoginAt || null,
            lastLoginIp: candidate.lastLoginIp || null,
            lastWorkspaceAccessAt: candidate.lastWorkspaceAccessAt || null,
            clientIp: clientIp
        };

        if (!candidate.kataProfile || !candidate.kataProfile.handle) {
            return res.json({
                authenticated: true,
                needsRegistration: true,
                candidate: candidatePayload,
                student: candidatePayload
            });
        }

        // Candidate has an initialized Kata profile
        let profile = candidate.kataProfile;
        if (dbState.useMongo) {
            profile = await calculateCandidateKataStats(candidate.studentId || candidate._id, candidate.username, profile);
            await CandidateModel.updateOne({ _id: candidate._id }, { $set: { kataProfile: profile } });
        }
        const shinTier = getRatingTier(profile.shinRating || 1200);
        const formaTier = getRatingTier(profile.formaRating || 1200);

        return res.json({
            authenticated: true,
            needsRegistration: false,
            candidate: candidatePayload,
            profile: {
                ...profile,
                shinRank: shinTier.title,
                shinRankColor: shinTier.color,
                shinMaxRank: getRatingTier(profile.shinMaxRating || 1200).title,
                formaRank: formaTier.title,
                formaRankColor: formaTier.color,
                formaMaxRank: getRatingTier(profile.formaMaxRating || 1200).title,
                globalPercentile: profile.globalPercentile || null,
                batchPercentile: profile.batchPercentile || null
            }
        });
    } catch (err) {
        console.error('Error fetching Kata me profile:', err);
        return res.status(500).json({ error: 'Server error retrieving profile' });
    }
});

/**
 * GET /api/kata/check-handle/:handle
 * Verifies handle format and availability
 */
router.get('/check-handle/:handle', async (req, res) => {
    try {
        const rawHandle = (req.params.handle || '').trim();
        const handleRegex = /^[a-zA-Z0-9_-]{3,24}$/;

        if (!handleRegex.test(rawHandle)) {
            return res.json({
                available: false,
                message: 'Handle must be 3-24 characters, containing only letters, numbers, hyphens, and underscores.'
            });
        }

        const safeRegex = new RegExp(`^${escapeRegex(rawHandle)}$`, 'i');

        let existing = null;
        if (dbState.useMongo) {
            existing = await CandidateModel.findOne({
                'kataProfile.handle': { $regex: safeRegex }
            });
        } else {
            const db = getJSONData();
            existing = (db.candidates || []).find(c =>
                c.kataProfile &&
                c.kataProfile.handle &&
                c.kataProfile.handle.toLowerCase() === rawHandle.toLowerCase()
            );
        }

        if (existing) {
            return res.json({
                available: false,
                message: `Handle "${rawHandle}" is already taken.`
            });
        }

        return res.json({
            available: true,
            message: `Handle "${rawHandle}" is available!`
        });
    } catch (err) {
        console.error('Error checking handle:', err);
        return res.status(500).json({ error: 'Error checking handle' });
    }
});

/**
 * POST /api/kata/register-handle
 * Sets the initial unique Kata handle for an enrolled BICS student after verifying their BICS portal password.
 * Issues a fresh 7-day JWT session token with kataHandle included.
 */
router.post('/register-handle', async (req, res) => {
    try {
        const rawHandle = (req.body.handle || '').trim();
        const rawPassword = req.body.password;
        const handleRegex = /^[a-zA-Z0-9_-]{3,24}$/;

        if (!handleRegex.test(rawHandle)) {
            return res.status(400).json({
                error: 'Invalid handle format. Must be 3-24 characters (letters, numbers, hyphens, underscores).'
            });
        }

        if (!rawPassword || typeof rawPassword !== 'string' || !rawPassword.trim()) {
            return res.status(400).json({
                error: 'Your BICS portal password is required to verify identity and claim your workspace handle.'
            });
        }

        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        if (req.user?.role === 'admin') {
            return res.status(400).json({ error: 'Admin accounts do not require handle registration.' });
        }

        let candidate = req.candidate;
        if (!candidate && dbState.useMongo) {
            const query = buildUserQuery(req.user);
            if (query) candidate = await CandidateModel.findOne(query);
        } else if (!candidate) {
            const db = getJSONData();
            const username = req.user?.username;
            const studentId = req.user?.studentId;
            candidate = (db.candidates || []).find(c =>
                c.username === username ||
                c.studentId === studentId ||
                String(c.id || c._id) === String(req.user?.id)
            );
        }

        if (!candidate) {
            return res.status(404).json({ error: 'Candidate record not found' });
        }

        // Verify BICS portal password
        const isPasswordValid = await comparePassword(rawPassword.trim(), candidate.password);
        if (!isPasswordValid) {
            await logSystemAction({
                actor: candidate.username || 'unknown',
                actorId: String(candidate._id || candidate.id),
                actorRole: 'student',
                action: 'KATA_HANDLE_REGISTER_PASSWORD_FAILED',
                resourceType: 'candidate',
                resourceId: String(candidate._id || candidate.id),
                details: `Failed password verification during handle registration for ${candidate.username}`,
                ipAddress: clientIp,
                userAgent: userAgent,
                severity: 'warning'
            });
            return res.status(401).json({
                error: 'Incorrect BICS portal password. Please enter the password you use to log in to the BICS portal.'
            });
        }

        const safeHandleRegex = new RegExp(`^${escapeRegex(rawHandle)}$`, 'i');

        if (dbState.useMongo) {
            const taken = await CandidateModel.findOne({
                'kataProfile.handle': { $regex: safeHandleRegex }
            });
            if (taken && String(taken._id) !== String(candidate._id)) {
                return res.status(400).json({ error: `Handle "${rawHandle}" is already taken.` });
            }

            const now = new Date();
            const kataProfile = {
                handle: rawHandle,
                registeredAt: now,
                shinRating: 1200,
                shinMaxRating: 1200,
                shinRank: 'Apprentice',
                shinMaxRank: 'Apprentice',
                formaRating: 1200,
                formaMaxRating: 1200,
                formaRank: 'Apprentice',
                formaMaxRank: 'Apprentice',
                contestsLive: 0,
                contestsVirtual: 0,
                contribution: 0,
                solvedStats: {
                    easy: 0,
                    medium: 0,
                    hard: 0,
                    boss: 0,
                    shinSolved: 0,
                    formaSolved: 0
                },
                contestHistory: [],
                submissionHeatmap: {},
                streak: {
                    current: 0,
                    longest: 0,
                    lastSubmissionDate: null
                }
            };

            candidate.kataProfile = kataProfile;
            candidate.lastWorkspaceAccessAt = now;
            candidate.lastWorkspaceIp = clientIp;
            await candidate.save();

            // Generate fresh JWT session token with registered kataHandle
            const token = generateToken({
                id: candidate._id,
                studentId: candidate.studentId,
                username: candidate.username,
                kataHandle: rawHandle,
                role: 'student'
            }, '7d');

            await logSystemAction({
                actor: candidate.username,
                actorId: String(candidate._id),
                actorRole: 'student',
                action: 'KATA_HANDLE_INITIALIZED',
                resourceType: 'candidate',
                resourceId: String(candidate._id),
                details: `Candidate ${candidate.username} (${candidate.studentId}) successfully registered Kata handle "${rawHandle}"`,
                ipAddress: clientIp,
                userAgent: userAgent,
                severity: 'info'
            });

            const candidateEmail = candidate.registrationData?.collegeEmail ||
                                   candidate.registrationData?.personalEmail ||
                                   candidate.email ||
                                   '';

            return res.json({
                success: true,
                token,
                profile: kataProfile,
                candidate: {
                    name: candidate.name,
                    username: candidate.username,
                    studentId: candidate.studentId,
                    email: candidateEmail
                }
            });
        } else {
            const db = getJSONData();
            const candidates = db.candidates || [];
            const taken = candidates.find(c =>
                c.kataProfile &&
                c.kataProfile.handle &&
                c.kataProfile.handle.toLowerCase() === rawHandle.toLowerCase() &&
                c.username !== candidate.username
            );
            if (taken) {
                return res.status(400).json({ error: `Handle "${rawHandle}" is already taken.` });
            }

            const now = new Date().toISOString();
            candidate.kataProfile = {
                handle: rawHandle,
                registeredAt: now,
                shinRating: 1200,
                shinMaxRating: 1200,
                shinRank: 'Apprentice',
                shinMaxRank: 'Apprentice',
                formaRating: 1200,
                formaMaxRating: 1200,
                formaRank: 'Apprentice',
                formaMaxRank: 'Apprentice',
                contestsLive: 0,
                contestsVirtual: 0,
                contribution: 0,
                solvedStats: {
                    easy: 0,
                    medium: 0,
                    hard: 0,
                    boss: 0,
                    shinSolved: 0,
                    formaSolved: 0
                },
                contestHistory: [],
                submissionHeatmap: {},
                streak: {
                    current: 0,
                    longest: 0,
                    lastSubmissionDate: null
                }
            };

            saveJSONData(db);

            const token = generateToken({
                id: candidate._id || candidate.id,
                studentId: candidate.studentId,
                username: candidate.username,
                kataHandle: rawHandle,
                role: 'student'
            }, '7d');

            const candidateEmail = candidate.registrationData?.collegeEmail ||
                                   candidate.registrationData?.personalEmail ||
                                   candidate.email ||
                                   '';

            return res.json({
                success: true,
                token,
                profile: candidate.kataProfile,
                candidate: {
                    name: candidate.name,
                    username: candidate.username,
                    studentId: candidate.studentId,
                    email: candidateEmail
                }
            });
        }
    } catch (err) {
        console.error('Error registering handle:', err);
        return res.status(500).json({ error: 'Failed to register handle' });
    }
});

/**
 * GET /api/kata/leaderboard
 * Returns top rated competitors strictly from actual database records
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const track = (req.query.track || 'shin').toLowerCase();
        let topStudents = [];

        if (dbState.useMongo) {
            const sortField = track === 'forma' ? 'kataProfile.formaRating' : 'kataProfile.shinRating';
            const docs = await CandidateModel.find({ 'kataProfile.handle': { $exists: true, $ne: null } })
                .sort({ [sortField]: -1 })
                .limit(20)
                .lean();

            topStudents = docs.map((doc, idx) => {
                const rating = track === 'forma' ? (doc.kataProfile.formaRating || 1200) : (doc.kataProfile.shinRating || 1200);
                const tier = getRatingTier(rating);
                return {
                    rank: idx + 1,
                    handle: doc.kataProfile.handle,
                    rating: rating,
                    tier: tier.title,
                    color: tier.color
                };
            });
        } else {
            const db = getJSONData();
            const registered = (db.candidates || []).filter(c => c.kataProfile && c.kataProfile.handle);
            registered.sort((a, b) => {
                const rA = track === 'forma' ? (a.kataProfile.formaRating || 1200) : (a.kataProfile.shinRating || 1200);
                const rB = track === 'forma' ? (b.kataProfile.formaRating || 1200) : (b.kataProfile.shinRating || 1200);
                return rB - rA;
            });
            topStudents = registered.slice(0, 20).map((doc, idx) => {
                const rating = track === 'forma' ? (doc.kataProfile.formaRating || 1200) : (doc.kataProfile.shinRating || 1200);
                const tier = getRatingTier(rating);
                return {
                    rank: idx + 1,
                    handle: doc.kataProfile.handle,
                    rating: rating,
                    tier: tier.title,
                    color: tier.color
                };
            });
        }

        return res.json({
            success: true,
            track,
            topRated: topStudents,
            topContributors: []
        });
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        return res.status(500).json({ error: 'Error fetching leaderboard' });
    }
});

/**
 * GET /api/kata/contests
 * Returns current/upcoming contests (retained for 4 hours post-contest)
 * and past contests (shifted after 4 hours so candidates can review standings)
 */
router.get('/contests', async (req, res) => {
    try {
        const handle = req.query.handle || req.user?.username || '';
        const now = new Date();

        const contests = await KataContestModel.find({}).sort({ startTime: 1 }).lean();

        const currentAndUpcoming = [];
        const past = [];

        for (const c of contests) {
            const startTime = new Date(c.startTime);
            const endTime = new Date(c.endTime);
            const fourHoursPostEnd = new Date(endTime.getTime() + 4 * 60 * 60 * 1000);
            const thirtySixHoursPostEnd = new Date(endTime.getTime() + 36 * 60 * 60 * 1000);

            const isLive = now >= startTime && now <= endTime;
            const hasEnded = now > endTime;
            const isWithinFourHoursPostEnd = hasEnded && now <= fourHoursPostEnd;
            const isPastFourHours = hasEnded && now > fourHoursPostEnd;
            const isUpcoming = now < startTime;
            const isStandingsReleased = now >= thirtySixHoursPostEnd;

            let status = 'scheduled';
            if (isLive) status = 'running';
            else if (hasEnded) status = 'ended';

            const isRegistered = (c.registeredCandidates || []).some(cand => 
                (handle && (cand.username?.toLowerCase() === handle.toLowerCase() || cand.candidateId === handle)) ||
                (req.user?.username && cand.username === req.user.username) ||
                (req.user?.studentId && cand.candidateId === req.user.studentId)
            );

            const contestPayload = {
                contestId: c.contestId,
                title: c.title,
                track: c.track,
                writers: c.writers || ['BICS Academic Council'],
                startTime: c.startTime,
                endTime: c.endTime,
                fourHoursPostEnd: fourHoursPostEnd.toISOString(),
                thirtySixHoursPostEnd: thirtySixHoursPostEnd.toISOString(),
                fortyEightHoursPostEnd: thirtySixHoursPostEnd.toISOString(), // alias for compatibility
                durationSeconds: 15 * 3600,
                durationHours: 15,
                status,
                isLive,
                hasEnded,
                isUpcoming,
                isWithinFourHoursPostEnd,
                isPastFourHours,
                isStandingsReleased,
                registeredCount: (c.registeredCandidates || []).length,
                isRegistered,
                canRegister: isUpcoming,
                canEnter: isLive || hasEnded
            };

            // Rule: When the contest ends, it remains listed under current contests for 4 hours
            if (isUpcoming || isLive || isWithinFourHoursPostEnd) {
                currentAndUpcoming.push(contestPayload);
            } else if (isPastFourHours) {
                // The contest that has ended then should be listed under the past contests after the 4 hour timer,
                // so that candidates can navigate to look at their standings.
                past.push(contestPayload);
            }
        }

        // Sort past contests by endTime descending (most recent first)
        past.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

        return res.json({
            success: true,
            currentAndUpcoming,
            past
        });
    } catch (err) {
        console.error('Error fetching contests:', err);
        return res.status(500).json({ error: 'Failed to fetch contests' });
    }
});

/**
 * GET /api/kata/gym
 * Concluded contests for Virtual Participation
 */
router.get('/gym', async (req, res) => {
    try {
        const now = new Date();
        const handle = req.query.handle || req.user?.username || req.user?.studentId || '';

        let userSolvedByContest = {};
        if (handle) {
            const safeHandleRegex = new RegExp(`^${escapeRegex(handle)}$`, 'i');
            const accepted = await KataSubmissionModel.find({
                $or: [
                    { username: { $regex: safeHandleRegex } },
                    { candidateId: { $regex: safeHandleRegex } }
                ],
                verdict: { $regex: /^Accepted$/i }
            }).select('contestId problemLetter').lean();
            for (const a of accepted) {
                if (!userSolvedByContest[a.contestId]) userSolvedByContest[a.contestId] = new Set();
                userSolvedByContest[a.contestId].add(a.problemLetter);
            }
        }

        // Shift contests to Gym strictly 4 hours after contest ending
        const shiftThreshold = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const concludedContests = await KataContestModel.find({
            endTime: { $lte: shiftThreshold }
        }).sort({ endTime: -1 }).lean();

        const gymContests = concludedContests.map(c => {
            const solvedSet = userSolvedByContest[c.contestId];
            return {
                contestId: c.contestId,
                title: c.title,
                track: c.track,
                writers: c.writers || ['BICS Academic Council'],
                startTime: c.startTime,
                endTime: c.endTime,
                durationHours: 15,
                totalScore: c.totalScore || 1500,
                problemCount: (c.problems || []).length,
                userSolvedCount: solvedSet ? solvedSet.size : 0,
                canVirtualParticipate: true
            };
        });

        // Check if candidate has an active virtual contest running across the platform
        const candidateIdentifiers = [
            handle,
            req.user?.username,
            req.user?.studentId,
            req.user?.kataHandle
        ];
        const activeVirtualContest = await getActiveVirtualContestForCandidate(candidateIdentifiers);

        return res.json({
            success: true,
            contests: gymContests,
            activeVirtualContest
        });
    } catch (err) {
        console.error('Error fetching gym contests:', err);
        return res.status(500).json({ error: 'Failed to fetch gym contests' });
    }
});

/**
 * GET /api/kata/problemset
 * Codeforces-style catalog of problems from concluded contests
 */
router.get('/problemset', async (req, res) => {
    try {
        const now = new Date();
        const handle = req.query.handle || req.user?.username || req.user?.studentId || '';

        // Query candidate's accepted and partially accepted submissions
        let solvedCodes = new Set();
        let partiallySolvedCodes = new Set();
        if (handle) {
            const safeHandleRegex = new RegExp(`^${escapeRegex(handle)}$`, 'i');
            const candidateSubs = await KataSubmissionModel.find({
                $or: [
                    { username: { $regex: safeHandleRegex } },
                    { candidateId: { $regex: safeHandleRegex } }
                ],
                verdict: { $nin: ['Deprecated', 'Superseded', 'In queue', 'Compiling', 'Submitted (Awaiting Evaluation)'] }
            }).select('contestId problemLetter verdict pointsAwarded').lean();

            for (const s of candidateSubs) {
                const code = `${s.contestId}${s.problemLetter}`;
                if (s.verdict === 'Accepted') {
                    solvedCodes.add(code);
                } else if (s.verdict === 'Partially Accepted' || (s.pointsAwarded && s.pointsAwarded > 0)) {
                    partiallySolvedCodes.add(code);
                }
            }
        }

        // 1. Check if any contest is currently running (for "Pay attention" box)
        const runningContest = await KataContestModel.findOne({
            startTime: { $lte: now },
            endTime: { $gte: now }
        }).lean();

        let activeContestAlert = null;
        if (runningContest) {
            const diffMs = new Date(runningContest.endTime).getTime() - now.getTime();
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
            activeContestAlert = {
                contestId: runningContest.contestId,
                title: runningContest.title,
                timeLeft: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
            };
        }

        // 2. Query concluded contests whose problems are safely published (strictly 4 hours after contest end)
        const shiftThreshold = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const endedContests = await KataContestModel.find({
            endTime: { $lte: shiftThreshold }
        }).sort({ endTime: -1 }).lean();

        // Batch-fetch all required question definitions in a single database query (O(1) instead of N+1)
        const allQuestionIds = [];
        for (const c of endedContests) {
            for (const p of (c.problems || [])) {
                if (p.questionId) allQuestionIds.push(p.questionId);
            }
        }

        const questions = await KataQuestionBankModel.find({
            _id: { $in: allQuestionIds }
        }).select('_id title tags difficulty points').lean();

        const questionMap = new Map();
        for (const q of questions) {
            questionMap.set(String(q._id), q);
        }

        const problemList = [];
        for (const c of endedContests) {
            for (const p of (c.problems || [])) {
                const q = questionMap.get(String(p.questionId));
                if (q) {
                    const code = `${c.contestId}${p.letter}`;
                    const isSolved = solvedCodes.has(code);
                    const isPartiallySolved = !isSolved && partiallySolvedCodes.has(code);
                    problemList.push({
                        code,
                        contestId: c.contestId,
                        letter: p.letter,
                        title: q.title,
                        tags: q.tags || ['math', 'algorithms'],
                        difficulty: q.difficulty || '800',
                        points: p.points || q.points || 100,
                        solvedCount: p.solvedCount || 0,
                        track: c.track,
                        isSolved,
                        isPartiallySolved
                    });
                }
            }
        }

        return res.json({
            success: true,
            activeContest: activeContestAlert,
            problems: problemList
        });
    } catch (err) {
        console.error('Error fetching problemset:', err);
        return res.status(500).json({ error: 'Failed to fetch problemset' });
    }
});


/**
 * GET /api/kata/upcoming-contests
 * Backwards compatibility for Kata Hub
 */
router.get('/upcoming-contests', async (req, res) => {
    try {
        const handle = req.query.handle || req.user?.username || '';
        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const contests = await KataContestModel.find({
            $or: [
                { status: { $in: ['scheduled', 'running'] } },
                { endTime: { $gte: fourHoursAgo } }
            ]
        })
            .sort({ startTime: 1 })
            .limit(5)
            .lean();

        const formatted = contests
            .filter(c => now <= new Date(new Date(c.endTime).getTime() + 4 * 60 * 60 * 1000))
            .map(c => {
                const startTime = new Date(c.startTime);
                const endTime = new Date(c.endTime);
                const isLive = now >= startTime && now <= endTime;
                const hasEnded = now > endTime;

                const isRegistered = (c.registeredCandidates || []).some(cand => 
                    (handle && (cand.username?.toLowerCase() === handle.toLowerCase() || cand.candidateId === handle)) ||
                    (req.user?.username && cand.username === req.user.username) ||
                    (req.user?.studentId && cand.candidateId === req.user.studentId)
                );
                return {
                    id: c.contestId,
                    contestId: c.contestId,
                    title: c.title,
                    track: c.track,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    duration: '15:00',
                    status: isLive ? 'running' : (hasEnded ? 'ended' : 'scheduled'),
                    isRegistered,
                    hasEnded
                };
            });

        return res.json({
            success: true,
            contests: formatted
        });
    } catch (err) {
        return res.json({ success: true, contests: [] });
    }
});

/**
 * POST /api/kata/contests/:contestId/register
 * Codeforces-style contest registration requiring BICS portal password verification
 */
router.post('/contests/:contestId/register', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const now = new Date();
        if (now > contest.endTime) {
            return res.status(400).json({ error: 'Contest has already ended' });
        }

        const rawPassword = req.body.password;
        if (!rawPassword || typeof rawPassword !== 'string' || !rawPassword.trim()) {
            return res.status(400).json({ error: 'BICS portal password is required to register for this contest.' });
        }

        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        let candidate = req.candidate;
        if (!candidate && dbState.useMongo) {
            const query = buildUserQuery(req.user);
            if (query) candidate = await CandidateModel.findOne(query);
        } else if (!candidate) {
            const db = getJSONData();
            const u = req.user?.username;
            const sid = req.user?.studentId;
            candidate = (db.candidates || []).find(c =>
                c.username === u ||
                c.studentId === sid ||
                String(c.id || c._id) === String(req.user?.id)
            );
        }

        if (!candidate) {
            return res.status(404).json({ error: 'Candidate account not found. Please log in again.' });
        }

        // Verify BICS portal password with candidate's hashed password
        const isPasswordValid = await comparePassword(rawPassword.trim(), candidate.password);
        if (!isPasswordValid) {
            await logSystemAction({
                actor: candidate.username || 'unknown',
                actorId: String(candidate._id || candidate.id),
                actorRole: 'student',
                action: 'KATA_CONTEST_REGISTER_PASSWORD_FAILED',
                resourceType: 'contest',
                resourceId: contestId,
                details: `Failed password verification during contest registration for ${contestId} by ${candidate.username}`,
                ipAddress: clientIp,
                userAgent: userAgent,
                severity: 'warning'
            });
            return res.status(401).json({
                error: 'Incorrect BICS portal password. Please enter the password you use to log in to the BICS portal.'
            });
        }

        const username = req.body.handle || candidate.kataProfile?.handle || req.user?.username || candidate.username;
        const candidateId = candidate.studentId || req.user?.studentId || username;
        const email = req.body.email || candidate.registrationData?.collegeEmail || candidate.registrationData?.personalEmail || '';
        const mode = req.body.mode || 'individual';

        if (!username) {
            return res.status(400).json({ error: 'Candidate username or handle required for registration' });
        }

        const alreadyRegistered = (contest.registeredCandidates || []).some(c => 
            c.username?.toLowerCase() === username.toLowerCase() || c.candidateId === candidateId
        );

        if (!alreadyRegistered) {
            contest.registeredCandidates.push({
                candidateId,
                username,
                email,
                registeredAt: now,
                mode
            });
            await contest.save();
        }

        await logSystemAction({
            actor: candidate.username || 'unknown',
            actorId: String(candidate._id || candidate.id),
            actorRole: 'student',
            action: 'KATA_CONTEST_REGISTERED',
            resourceType: 'contest',
            resourceId: contestId,
            details: `Candidate ${candidate.username} (${candidate.studentId}) registered for contest ${contestId}`,
            ipAddress: clientIp,
            userAgent: userAgent,
            severity: 'info'
        });

        return res.json({
            success: true,
            message: `Successfully registered for ${contest.title}`,
            contestId: contest.contestId,
            mode
        });
    } catch (err) {
        console.error('Error registering for contest:', err);
        return res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/kata/contests/:contestId/virtual-register
 * Virtual Participation Registration:
 * Verifies BICS portal password and immediately starts candidate's individual 2-hour virtual timer.
 */
router.post('/contests/:contestId/virtual-register', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const rawPassword = req.body.password;
        if (!rawPassword || typeof rawPassword !== 'string' || !rawPassword.trim()) {
            return res.status(400).json({ error: 'BICS portal password is required to enter virtual participation.' });
        }

        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        let candidate = req.candidate;
        if (!candidate && dbState.useMongo) {
            const query = buildUserQuery(req.user);
            if (query) candidate = await CandidateModel.findOne(query);
        } else if (!candidate) {
            const db = getJSONData();
            const u = req.user?.username;
            const sid = req.user?.studentId;
            candidate = (db.candidates || []).find(c =>
                c.username === u ||
                c.studentId === sid ||
                String(c.id || c._id) === String(req.user?.id)
            );
        }

        if (!candidate) {
            return res.status(404).json({ error: 'Candidate account not found. Please log in again.' });
        }

        // Verify BICS portal password with candidate's hashed password
        const isPasswordValid = await comparePassword(rawPassword.trim(), candidate.password);
        if (!isPasswordValid) {
            await logSystemAction({
                actor: candidate.username || 'unknown',
                actorId: String(candidate._id || candidate.id),
                actorRole: 'student',
                action: 'KATA_VIRTUAL_REGISTER_PASSWORD_FAILED',
                resourceType: 'contest',
                resourceId: contestId,
                details: `Failed password verification during virtual participation registration for ${contestId} by ${candidate.username}`,
                ipAddress: clientIp,
                userAgent: userAgent,
                severity: 'warning'
            });
            return res.status(401).json({
                error: 'Incorrect BICS portal password. Please enter the password you use to log in to the BICS portal.'
            });
        }

        const username = req.body.handle || candidate.kataProfile?.handle || req.user?.username || candidate.username;
        const candidateId = candidate.studentId || req.user?.studentId || username;
        const email = req.body.email || candidate.registrationData?.collegeEmail || candidate.registrationData?.personalEmail || '';

        if (!username) {
            return res.status(400).json({ error: 'Candidate username or handle required for registration' });
        }

        // STRICT ENFORCEMENT: Candidate can only have ONE virtual contest running at once
        const candidateIdentifiers = [
            username,
            candidateId,
            candidate.username,
            candidate.studentId,
            candidate.kataProfile?.handle,
            req.user?.username,
            req.user?.studentId
        ];
        const activeVirtualConflict = await getActiveVirtualContestForCandidate(candidateIdentifiers, contestId);
        if (activeVirtualConflict) {
            const minsLeft = Math.ceil(activeVirtualConflict.remainingSeconds / 60);
            return res.status(409).json({
                error: `You already have an active virtual contest running: "${activeVirtualConflict.title || activeVirtualConflict.contestId}" (${minsLeft} min${minsLeft === 1 ? '' : 's'} remaining). Candidates can only participate in one virtual contest at a time.`,
                activeVirtualContest: activeVirtualConflict
            });
        }

        const now = new Date();
        const durationSeconds = 2 * 3600;
        const virtualExpiresAt = new Date(now.getTime() + durationSeconds * 1000);

        if (!contest.virtualCandidates) {
            contest.virtualCandidates = [];
        }

        let virtualEntry = contest.virtualCandidates.find(c =>
            (c.username && c.username.toLowerCase() === username.toLowerCase()) ||
            (c.candidateId && c.candidateId === candidateId)
        );

        if (!virtualEntry) {
            contest.virtualCandidates.push({
                candidateId,
                username,
                email,
                registeredAt: now,
                startedAt: now,
                expiresAt: virtualExpiresAt,
                durationSeconds,
                mode: 'virtual'
            });
        } else {
            // If already started and unexpired on this contest, preserve existing running timer
            if (!virtualEntry.startedAt || new Date() > new Date(virtualEntry.expiresAt)) {
                virtualEntry.startedAt = now;
                virtualEntry.expiresAt = virtualExpiresAt;
                virtualEntry.durationSeconds = durationSeconds;
            }
        }

        await contest.save();

        await logSystemAction({
            actor: candidate.username || 'unknown',
            actorId: String(candidate._id || candidate.id),
            actorRole: 'student',
            action: 'KATA_VIRTUAL_CONTEST_REGISTERED',
            resourceType: 'contest',
            resourceId: contestId,
            details: `Candidate ${candidate.username} (${candidate.studentId}) started Virtual Participation for contest ${contestId}`,
            ipAddress: clientIp,
            userAgent: userAgent,
            severity: 'info'
        });

        return res.json({
            success: true,
            message: `Successfully entered Virtual Participation for ${contest.title}`,
            contestId: contest.contestId,
            candidateTimer: {
                isRegistered: true,
                isStarted: true,
                isVirtual: true,
                startedAt: now,
                expiresAt: virtualExpiresAt,
                remainingSeconds: 2 * 3600,
                isExpired: false
            }
        });
    } catch (err) {
        console.error('Error in virtual participation registration:', err);
        return res.status(500).json({ error: 'Virtual registration failed' });
    }
});

/**
 * GET /api/kata/contests/:contestId
 * Contest dashboard data with strict anti-leak protection and candidate timer
 */
router.get('/contests/:contestId', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const contest = await KataContestModel.findOne({ contestId }).lean();
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const now = new Date();
        const isLive = now >= new Date(contest.startTime) && now <= new Date(contest.endTime);
        const hasEnded = now > new Date(contest.endTime);
        const handle = req.query.handle || req.user?.username || req.user?.studentId || '';

        const isRegistered = (contest.registeredCandidates || []).some(c => 
            (handle && (c.username?.toLowerCase() === handle.toLowerCase() || c.candidateId === handle)) ||
            (req.user?.username && c.username?.toLowerCase() === req.user.username.toLowerCase())
        ) || (contest.virtualCandidates || []).some(c => 
            (handle && (c.username?.toLowerCase() === handle.toLowerCase() || c.candidateId === handle)) ||
            (req.user?.username && c.username?.toLowerCase() === req.user.username.toLowerCase())
        );

        const isVirtual = (contest.virtualCandidates || []).some(c => 
            (handle && (c.username?.toLowerCase() === handle.toLowerCase() || c.candidateId === handle)) ||
            (req.user?.username && c.username?.toLowerCase() === req.user.username.toLowerCase())
        );

        const candidateTimer = getCandidateTimer(contest, handle);
        const thirtySixHoursAfterEnd = contest.endTime ? new Date(new Date(contest.endTime).getTime() + 36 * 3600 * 1000) : null;
        const isStandingsReleased = Boolean(contest.standingsReleased) || (thirtySixHoursAfterEnd && now >= thirtySixHoursAfterEnd);
        const isForma = contest.track === 'forma' || contest.contestId?.toUpperCase().includes('FORMA') || contestId.toUpperCase().includes('FORMA');
        const isAdmin = req.user?.role === 'admin';

        // Check candidate's latest non-superseded submissions and evaluations for each problem
        // On contest problem listing, scores to be displayed should be earned during contests
        const identifiers = new Set();
        if (handle) identifiers.add(handle.trim());
        if (req.user?.username) identifiers.add(req.user.username.trim());
        if (req.user?.studentId) identifiers.add(req.user.studentId.trim());
        if (req.user?.kataHandle) identifiers.add(req.user.kataHandle.trim());

        let candidateSubmissionsMap = new Map();
        if (identifiers.size > 0) {
            const regexList = Array.from(identifiers).map(id => new RegExp(`^${escapeRegex(id)}$`, 'i'));
            const subFilter = {
                contestId,
                $or: [
                    { username: { $in: regexList } },
                    { candidateId: { $in: regexList } }
                ],
                isSuperseded: { $ne: true },
                isLatest: { $ne: false },
                verdict: { $nin: ['Deprecated', 'Superseded'] }
            };

            // Rule: on contest problem listing the scores to be displayed should be earned during contests
            if (candidateTimer?.isVirtual) {
                // In virtual contest participation, match virtual contest submissions
                subFilter.isVirtual = true;
            } else {
                // In official contest listing, only submissions earned during live contest count
                subFilter.isLiveSubmission = true;
            }

            const subs = await KataSubmissionModel.find(subFilter).sort({ submittedAt: -1 }).lean();

            for (const s of subs) {
                if (!candidateSubmissionsMap.has(s.problemLetter)) {
                    candidateSubmissionsMap.set(s.problemLetter, s);
                }
            }
        }

        // Anti-leak protection:
        let problemsPayload = [];
        if (isLive || hasEnded) {
            for (const p of contest.problems) {
                const q = await KataQuestionBankModel.findById(p.questionId).select('title letter points').lean();
                const candSub = candidateSubmissionsMap.get(p.letter);

                let isEvaluated = false;
                let marksAwarded = null;
                let percentage = null;
                let scoreTier = null; // 'green' (80-100) | 'yellow' (40-79) | 'red' (0-39)

                if (candSub) {
                    // Forma Rule: Live contest scores are NOT to be displayed before official standings are released
                    const isConcealedForma = isForma && candSub.isLiveSubmission && !isStandingsReleased && !isAdmin;

                    if (!isConcealedForma) {
                        const hasAdminScore = candSub.adminOverriddenScore !== null && candSub.adminOverriddenScore !== undefined;
                        const hasAiScore = candSub.aiEvaluation && (candSub.aiEvaluation.ratedAt || candSub.aiEvaluation.ratingScore !== undefined);
                        const isAwaiting = candSub.verdict === 'Submitted (Awaiting Evaluation)' || 
                                           candSub.verdict === 'In queue' || 
                                           candSub.verdict?.toLowerCase().includes('awaiting');

                        // Forma rule: mark question with green, yellow, red ONLY after evaluator has marked the question its marks
                        if (hasAdminScore || hasAiScore || (!isAwaiting && candSub.pointsAwarded !== undefined && candSub.pointsAwarded !== null && candSub.verdict !== 'Virtual Practice')) {
                            isEvaluated = true;
                            marksAwarded = hasAdminScore 
                                ? candSub.adminOverriddenScore 
                                : (candSub.aiEvaluation?.ratingScore !== undefined && candSub.aiEvaluation?.ratingScore !== null
                                    ? candSub.aiEvaluation.ratingScore 
                                    : candSub.pointsAwarded);
                            marksAwarded = Math.max(0, marksAwarded);
                            const maxPoints = p.points || 100;
                            percentage = Math.round((marksAwarded / maxPoints) * 100);

                            if (percentage >= 80) {
                                scoreTier = 'green';
                            } else if (percentage >= 40) {
                                scoreTier = 'yellow';
                            } else {
                                scoreTier = 'red';
                            }
                        }
                    }
                }

                problemsPayload.push({
                    letter: p.letter,
                    title: q ? q.title : `Problem ${p.letter}`,
                    points: p.points,
                    solvedCount: p.solvedCount || 0,
                    isSolved: isForma 
                        ? Boolean(isEvaluated && (candSub?.verdict === 'Accepted' || scoreTier === 'green'))
                        : (candSub?.verdict === 'Accepted'),
                    hasSubmission: Boolean(candSub),
                    isEvaluated,
                    marksAwarded,
                    percentage,
                    scoreTier
                });
            }
        } else {
            // Pre-contest state: only show letters and points, obfuscate titles
            problemsPayload = contest.problems.map(p => ({
                letter: p.letter,
                title: `Problem ${p.letter}`,
                points: p.points,
                solvedCount: 0,
                isSolved: false,
                hasSubmission: false,
                isEvaluated: false,
                marksAwarded: null,
                percentage: null,
                scoreTier: null
            }));
        }

        const candidateIdentifiers = Array.from(identifiers);
        const activeVirtualContest = await getActiveVirtualContestForCandidate(candidateIdentifiers, contestId);

        return res.json({
            success: true,
            candidateTimer,
            activeVirtualContest,
            contest: {
                contestId: contest.contestId,
                title: contest.title,
                track: contest.track,
                writers: contest.writers || ['BICS Academic Council'],
                startTime: contest.startTime,
                endTime: contest.endTime,
                status: isLive ? 'running' : (hasEnded ? 'ended' : 'scheduled'),
                isLive,
                hasEnded,
                isRegistered,
                isVirtual,
                canEnter: (isLive || isVirtual) && isRegistered && (!candidateTimer.isStarted || !candidateTimer.isExpired),
                registeredCount: (contest.registeredCandidates || []).length + (contest.virtualCandidates || []).length,
                totalScore: contest.totalScore || 1500,
                problems: problemsPayload
            }
        });
    } catch (err) {
        console.error('Error fetching contest details:', err);
        return res.status(500).json({ error: 'Failed to fetch contest details' });
    }
});

/**
 * POST /api/kata/contests/:contestId/start-timer
 * Starts candidate's 2-hour window countdown upon clicking "Enter Contest"
 */
router.post('/contests/:contestId/start-timer', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const handle = req.body.handle || req.user?.username || req.body.username || req.user?.studentId;

        if (!handle) {
            return res.status(400).json({ error: 'Candidate handle or username required' });
        }

        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const now = new Date();
        const isLive = now >= contest.startTime && now <= contest.endTime;
        const hasEnded = now > contest.endTime || contest.status === 'ended';

        if (isLive) {
            let cand = (contest.registeredCandidates || []).find(c =>
                (c.username && c.username.toLowerCase() === handle.toLowerCase()) ||
                (c.candidateId && c.candidateId.toLowerCase() === handle.toLowerCase()) ||
                (req.user?.username && c.username?.toLowerCase() === req.user.username.toLowerCase()) ||
                (req.user?.studentId && c.candidateId?.toLowerCase() === req.user.studentId.toLowerCase())
            );

            if (!cand) {
                return res.status(403).json({ error: 'You must register for this contest with your BICS portal password before entering.' });
            }

            // Candidate timer starts right then and there upon clicking Enter!
            if (!cand.startedAt) {
                cand.startedAt = now;
                cand.expiresAt = new Date(Math.min(now.getTime() + 2 * 3600 * 1000, contest.endTime.getTime()));
                await contest.save();
            }
        } else if (hasEnded) {
            // STRICT ENFORCEMENT: Only one virtual contest running at once per candidate
            const candidateIdentifiers = [
                handle,
                req.user?.username,
                req.user?.studentId,
                req.user?.kataHandle
            ];
            const activeVirtualConflict = await getActiveVirtualContestForCandidate(candidateIdentifiers, contestId);
            if (activeVirtualConflict) {
                const minsLeft = Math.ceil(activeVirtualConflict.remainingSeconds / 60);
                return res.status(409).json({
                    error: `You already have an active virtual contest running: "${activeVirtualConflict.title || activeVirtualConflict.contestId}" (${minsLeft} min${minsLeft === 1 ? '' : 's'} remaining). Candidates can only participate in one virtual contest at a time.`,
                    activeVirtualContest: activeVirtualConflict
                });
            }

            // Post-contest virtual solving timer (2 hours)
            const durationSec = 2 * 3600;
            if (!contest.virtualCandidates) contest.virtualCandidates = [];
            let virtualCand = contest.virtualCandidates.find(c =>
                (c.username && c.username.toLowerCase() === handle.toLowerCase()) ||
                (c.candidateId && c.candidateId.toLowerCase() === handle.toLowerCase()) ||
                (req.user?.studentId && c.candidateId?.toLowerCase() === req.user.studentId.toLowerCase())
            );

            if (!virtualCand) {
                virtualCand = {
                    candidateId: req.user?.studentId || handle,
                    username: handle,
                    registeredAt: now,
                    startedAt: now,
                    expiresAt: new Date(now.getTime() + durationSec * 1000),
                    durationSeconds: durationSec,
                    mode: 'virtual'
                };
                contest.virtualCandidates.push(virtualCand);
            } else if (!virtualCand.startedAt || new Date() > new Date(virtualCand.expiresAt)) {
                virtualCand.startedAt = now;
                virtualCand.expiresAt = new Date(now.getTime() + durationSec * 1000);
                virtualCand.durationSeconds = durationSec;
            }
            await contest.save();
        } else {
            return res.status(400).json({ error: 'Contest has not started yet' });
        }

        const candidateTimer = getCandidateTimer(contest, handle);
        return res.json({
            success: true,
            candidateTimer
        });
    } catch (err) {
        console.error('Error starting candidate timer:', err);
        return res.status(500).json({ error: 'Failed to start candidate timer' });
    }
});

/**
 * GET /api/kata/contests/:contestId/problem/:letter
 * GET /api/kata/problemset/problem/:contestId/:letter
 * Problem statement with LaTeX support and anti-leak gate
 */
router.get(['/contests/:contestId/problem/:letter', '/problemset/problem/:contestId/:letter'], async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const letter = req.params.letter.toUpperCase();
        const handle = req.query.handle || req.user?.username || req.user?.studentId || '';

        const contest = await KataContestModel.findOne({ contestId }).lean();
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const now = new Date();
        const startTime = new Date(contest.startTime);
        const endTime = new Date(contest.endTime);
        const fourHoursPostEnd = new Date(endTime.getTime() + 4 * 60 * 60 * 1000);

        const isLive = now >= startTime && now <= endTime;
        const isWithinFourHoursPostEnd = now > endTime && now <= fourHoursPostEnd;
        const isPastFourHours = now > fourHoursPostEnd;
        const hasEnded = now > endTime || contest.status === 'ended';

        if (!isLive && !hasEnded) {
            return res.status(403).json({
                error: 'Contest has not started yet. Problem statements unlock when the contest begins.',
                startTime: contest.startTime
            });
        }

        const contestProblem = contest.problems.find(p => p.letter === letter);
        if (!contestProblem) {
            return res.status(404).json({ error: `Problem ${letter} not found in this contest` });
        }

        const question = await KataQuestionBankModel.findById(contestProblem.questionId)
            .select('-hiddenTestCases')
            .lean();

        if (!question) {
            return res.status(404).json({ error: 'Problem definition not found' });
        }

        const candidateTimer = getCandidateTimer(contest, handle);

        // Anti-leak check: during live contest, candidate must have entered contest and started timer to view statement!
        if (isLive && (!candidateTimer || !candidateTimer.isStarted)) {
            return res.json({
                success: true,
                isLive,
                hasEnded: false,
                isWithinFourHoursPostEnd: false,
                isPastFourHours: false,
                fourHoursPostEnd: fourHoursPostEnd.toISOString(),
                isLocked: true,
                candidateTimer,
                isSolved: false,
                contestId: contest.contestId,
                contestTitle: contest.title,
                track: contest.track || 'shin',
                letter: contestProblem.letter,
                points: contestProblem.points,
                problem: {
                    title: `Problem ${contestProblem.letter}`,
                    letter: contestProblem.letter,
                    points: contestProblem.points,
                    timeLimit: question.timeLimit || 1.0,
                    memoryLimit: question.memoryLimit || 256,
                    statementHtml: '<div style="padding: 24px; text-align: center; color: #555;"><h3>Problem Locked</h3><p>Please click <strong>Enter Contest</strong> on the contest dashboard to begin your individual 2-hour timer and view the problem statement.</p></div>',
                    isLocked: true
                }
            });
        }

        let isSolved = false;
        if (handle) {
            const safeHandleRegex = new RegExp(`^${escapeRegex(handle)}$`, 'i');
            const accepted = await KataSubmissionModel.findOne({
                contestId,
                problemLetter: letter,
                $or: [
                    { username: { $regex: safeHandleRegex } },
                    { candidateId: { $regex: safeHandleRegex } }
                ],
                verdict: { $regex: /^Accepted$/i },
                isSuperseded: { $ne: true }
            }).lean();
            if (accepted) {
                const thirtySixHoursAfterEnd = contest.endTime ? new Date(new Date(contest.endTime).getTime() + 36 * 3600 * 1000) : null;
                const isStandingsReleased = Boolean(contest.standingsReleased) || (thirtySixHoursAfterEnd && now >= thirtySixHoursAfterEnd);
                const isForma = contest.track === 'forma' || contest.contestId?.toUpperCase().includes('FORMA') || contestId.toUpperCase().includes('FORMA');
                const isAdmin = req.user?.role === 'admin';
                if (!isForma || isStandingsReleased || isAdmin || !accepted.isLiveSubmission) {
                    isSolved = true;
                }
            }
        }

        return res.json({
            success: true,
            isLive,
            hasEnded,
            isWithinFourHoursPostEnd,
            isPastFourHours,
            fourHoursPostEnd: fourHoursPostEnd.toISOString(),
            candidateTimer,
            isSolved,
            contestId: contest.contestId,
            contestTitle: contest.title,
            track: contest.track || 'shin',
            letter: contestProblem.letter,
            points: contestProblem.points,
            problem: {
                title: question.title,
                letter: contestProblem.letter,
                timeLimit: question.timeLimit || 1.0,
                memoryLimit: question.memoryLimit || 256,
                statementHtml: question.statementHtml,
                inputFormat: question.inputFormat,
                outputFormat: question.outputFormat,
                sampleInput: question.sampleInput,
                sampleOutput: question.sampleOutput,
                note: question.note,
                points: contestProblem.points
            }
        });
    } catch (err) {
        console.error('Error fetching problem details:', err);
        return res.status(500).json({ error: 'Failed to fetch problem statement' });
    }
});

/**
 * POST /api/kata/contests/:contestId/submit
 * Non-blocking asynchronous code submission
 */
router.post('/contests/:contestId/submit', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const { problemLetter, code, language = 'cpp', handle, html, css, js } = req.body;

        if (!problemLetter) {
            return res.status(400).json({ error: 'Problem selection is required' });
        }

        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const isForma = (contest.track === 'forma') || contestId.startsWith('FORMA');
        const isFormaPayload = html !== undefined || css !== undefined || js !== undefined || isForma;

        if (isFormaPayload) {
            const hasSubstantive = isSubstantiveCode(html) || isSubstantiveCode(css) || isSubstantiveCode(js) || isSubstantiveCode(code);
            if (!hasSubstantive) {
                return res.status(400).json({ error: 'Submission cannot be empty. Please choose a file or write your solution.' });
            }
        } else {
            if (!code || !code.trim()) {
                return res.status(400).json({ error: 'Source code cannot be empty' });
            }
        }

        const now = new Date();
        if (now < contest.startTime) {
            return res.status(403).json({ error: 'Contest has not started yet' });
        }

        const isLive = now >= contest.startTime && now <= contest.endTime;
        const username = handle || req.user?.username || 'candidate';
        const candidateId = req.user?.studentId || username;

        let isVirtual = false;

        // Check candidate 2-hour timer during live contest
        if (isLive) {
            const cand = (contest.registeredCandidates || []).find(c =>
                (c.username && c.username.toLowerCase() === username.toLowerCase()) ||
                (c.candidateId && c.candidateId.toLowerCase() === candidateId.toLowerCase())
            );

            if (!cand || !cand.startedAt) {
                return res.status(403).json({
                    error: 'You must enter the contest to start your 2-hour window before submitting code.'
                });
            }

            if (cand.expiresAt && now > new Date(cand.expiresAt)) {
                return res.status(403).json({
                    error: 'Your 2-hour contest window has expired. Submissions are now locked.'
                });
            }
        } else {
            // Check if candidate is participating virtually in a 2-hour virtual contest
            const virtualCand = (contest.virtualCandidates || []).find(c =>
                (c.username && c.username.toLowerCase() === username.toLowerCase()) ||
                (c.candidateId && c.candidateId.toLowerCase() === candidateId.toLowerCase())
            );

            if (virtualCand) {
                isVirtual = true;
                if (virtualCand.expiresAt && now > new Date(virtualCand.expiresAt)) {
                    return res.status(403).json({
                        error: 'Your 2-hour virtual contest window has expired. Submissions are now locked.'
                    });
                }

                // Verify candidate does not have a conflicting active virtual contest elsewhere
                const candidateIdentifiers = [
                    username,
                    candidateId,
                    req.user?.username,
                    req.user?.studentId,
                    req.user?.kataHandle
                ];
                const activeConflict = await getActiveVirtualContestForCandidate(candidateIdentifiers, contestId);
                if (activeConflict) {
                    return res.status(409).json({
                        error: `Submission blocked: You have an active virtual contest running on "${activeConflict.title || activeConflict.contestId}". Candidates can only participate in one virtual contest at a time.`,
                        activeVirtualContest: activeConflict
                    });
                }
            }

            // Post-contest practice & virtual submission rate limiting (gap between submissions):
            // Shin: minimum gap of 30 seconds per candidate
            // Forma: minimum gap of 45 seconds per candidate (to protect server & LLM APIs from overload)
            const userKey = (candidateId || username).toLowerCase();
            const trackKey = `${userKey}_${contest.track || 'shin'}`;
            const lastSubTime = practiceSubmissionCooldowns.get(trackKey) || 0;
            const cooldownSec = (contest.track === 'forma') ? 45 : 30;
            const elapsedSec = (Date.now() - lastSubTime) / 1000;
            if (elapsedSec < cooldownSec) {
                const waitSec = Math.ceil(cooldownSec - elapsedSec);
                return res.status(429).json({
                    error: `Submission cooldown active: Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before submitting again (${cooldownSec}s gap between submissions for ${contest.track === 'forma' ? 'KataForma' : 'KataShin'}).`,
                    cooldownRemaining: waitSec,
                    cooldownTotal: cooldownSec
                });
            }
            practiceSubmissionCooldowns.set(trackKey, Date.now());

            // Memory pruning: evict timestamps older than 5 minutes if map grows
            if (practiceSubmissionCooldowns.size > 200) {
                const cutoff = Date.now() - 300000;
                for (const [k, v] of practiceSubmissionCooldowns.entries()) {
                    if (v < cutoff) practiceSubmissionCooldowns.delete(k);
                }
            }
        }

        // If contest is over, live contest marks are NOT saved and assigned 0 (Virtual Practice mode)
        const initialVerdict = isLive 
            ? (contest.track === 'forma' ? 'Submitted (Awaiting Evaluation)' : 'In queue')
            : 'Virtual Practice';

        let finalCode = code;
        let finalLang = language || 'cpp';

        if (contest.track === 'forma') {
            if (isFormaPayload) {
                finalCode = JSON.stringify({
                    html: html || '',
                    css: css || '',
                    js: js || ''
                });
                finalLang = 'web';
            } else if (!language || language === 'cpp') {
                finalLang = 'web';
            }
        }

        // Forma Rule: During Live contests, only one solution is evaluated per candidate (the latest solution)
        // to protect the Gemini Direct API quota (20 RPD limit).
        // For virtual contests or problemset practice, solutions are evaluated on the spot via Groq
        // and each submission is treated as different/independent and NEVER marked as deprecated!
        if (isLive && isForma) {
            const candidateIdentifierQuery = {
                contestId,
                problemLetter: problemLetter.toUpperCase(),
                isLiveSubmission: true,
                $or: [
                    { candidateId: candidateId },
                    { username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } }
                ]
            };

            await KataSubmissionModel.updateMany(candidateIdentifierQuery, {
                $set: {
                    isSuperseded: true,
                    isLatest: false,
                    verdict: 'Deprecated'
                }
            });
        }

        const generatedSubId = generateSubmissionId(now);

        const submission = await KataSubmissionModel.create({
            submissionId: generatedSubId,
            contestId,
            problemLetter: problemLetter.toUpperCase(),
            candidateId,
            username,
            language: finalLang,
            code: finalCode,
            track: contest.track || 'shin',
            isLiveSubmission: isLive,
            isVirtual: isVirtual,
            isSuperseded: false,
            isLatest: true,
            verdict: initialVerdict,
            pointsAwarded: 0,
            submittedAt: now
        });

        // Pipeline execution:
        let evaluatedSubmission = submission;
        if (isLive) {
            if (contest.track === 'shin') {
                enqueueSubmission(submission._id);
            }
            // For live Forma, worker evaluates 4 hours post-contest using Gemini API direct
        } else {
            // Post-contest practice / virtual mode:
            if (contest.track === 'forma') {
                // Virtual practice submission evaluated directly on the spot using Groq models
                // in order: llama -> qwen -> gpt -> whatever is available
                try {
                    const evaluated = await evaluateKataFormaVirtualWithGroq(submission._id);
                    if (evaluated) {
                        evaluatedSubmission = evaluated;
                    }
                } catch (evalErr) {
                    console.error('[KataSubmit] Error evaluating virtual Forma submission on the spot:', evalErr);
                }
            } else {
                // Post-contest Shin checks testcases
                enqueueSubmission(submission._id);
            }
        }

        return res.json({
            success: true,
            submissionId: generatedSubId,
            id: submission._id,
            verdict: evaluatedSubmission.verdict || initialVerdict,
            pointsAwarded: evaluatedSubmission.pointsAwarded || 0,
            isLiveSubmission: isLive,
            isVirtual: isVirtual,
            message: isLive 
                ? 'Code submitted successfully' 
                : (isVirtual ? 'Virtual contest submission evaluated.' : 'Virtual practice submission evaluated on the spot.')
        });

    } catch (err) {
        console.error('Error submitting code:', err);
        return res.status(500).json({ error: 'Submission failed' });
    }
});

/**
 * GET /api/kata/contests/:contestId/submissions
 * Contest submissions list
 */
router.get('/contests/:contestId/submissions', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const handle = req.query.handle || req.user?.username;
        const all = req.query.all === 'true';

        const filter = { contestId };
        if (!all && handle) {
            filter.$or = [{ username: handle }, { candidateId: handle }];
        }

        const [submissions, contest] = await Promise.all([
            KataSubmissionModel.find(filter)
                .sort({ submittedAt: -1 })
                .limit(50)
                .lean(),
            KataContestModel.findOne({ contestId }).select('problems track endTime standingsReleased').lean()
        ]);

        const now = new Date();
        const thirtySixHoursAfterEnd = contest?.endTime ? new Date(new Date(contest.endTime).getTime() + 36 * 3600 * 1000) : null;
        const isStandingsReleased = Boolean(contest?.standingsReleased) || (thirtySixHoursAfterEnd && now >= thirtySixHoursAfterEnd);
        const isForma = contest?.track === 'forma' || contestId.toUpperCase().includes('FORMA');
        const isAdmin = req.user?.role === 'admin';

        const problemTitles = {};
        if (contest && contest.problems) {
            for (const p of contest.problems) {
                problemTitles[p.letter] = p.title;
            }
        }

        return res.json({
            success: true,
            submissions: submissions.map(s => {
                let displayVerdict = s.verdict;
                let displayPoints = s.pointsAwarded;

                // For live submissions, conceal evaluated verdict and marks before official standings release (36h after end)
                if (s.isLiveSubmission && !isStandingsReleased && !isAdmin) {
                    displayVerdict = s.verdict === 'Deprecated' ? 'Deprecated' : 'Awaiting Evaluation';
                    displayPoints = 0;
                }

                return {
                    id: s._id,
                    submissionId: s.submissionId || generateSubmissionId(s.submittedAt),
                    contestId: s.contestId,
                    problemLetter: s.problemLetter,
                    problemTitle: problemTitles[s.problemLetter] || `Problem ${s.problemLetter}`,
                    username: s.username,
                    candidateId: s.candidateId,
                    language: s.language,
                    verdict: displayVerdict,
                    testPassed: s.testPassed,
                    totalTests: s.totalTests,
                    timeUsedMs: s.timeUsedMs,
                    memoryUsedKb: s.memoryUsedKb,
                    pointsAwarded: displayPoints,
                    compileOutput: s.compileOutput,
                    code: s.code,
                    submittedAt: s.submittedAt
                };
            })
        });
    } catch (err) {
        console.error('Error fetching submissions:', err);
        return res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

/**
 * GET /api/kata/submissions
 * Overall submissions across all contests and problem sets
 */
router.get('/submissions', async (req, res) => {
    try {
        const handle = req.query.handle;
        const problemLetter = req.query.problemLetter;
        const track = req.query.track;
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

        const filter = {};
        if (handle) {
            filter.$or = [{ username: handle }, { candidateId: handle }];
        }
        if (problemLetter && problemLetter !== 'ALL') {
            filter.problemLetter = problemLetter.toUpperCase();
        }
        if (track && (track === 'shin' || track === 'forma')) {
            filter.track = track;
        }

        const submissions = await KataSubmissionModel.find(filter)
            .sort({ submittedAt: -1 })
            .limit(limit)
            .lean();

        // Collect all distinct contestIds to get problem titles and embargo metadata
        const contestIds = [...new Set(submissions.map(s => s.contestId))];
        const contests = await KataContestModel.find({ contestId: { $in: contestIds } })
            .select('contestId problems track endTime standingsReleased')
            .lean();

        const now = new Date();
        const isAdmin = req.user?.role === 'admin';
        const contestMap = {};
        for (const c of contests) {
            const thirtySixHoursAfterEnd = c.endTime ? new Date(new Date(c.endTime).getTime() + 36 * 3600 * 1000) : null;
            const isStandingsReleased = Boolean(c.standingsReleased) || (thirtySixHoursAfterEnd && now >= thirtySixHoursAfterEnd);
            contestMap[c.contestId] = {
                problems: {},
                isStandingsReleased
            };
            for (const p of (c.problems || [])) {
                contestMap[c.contestId].problems[p.letter] = p.title;
            }
        }

        return res.json({
            success: true,
            submissions: submissions.map(s => {
                const cInfo = contestMap[s.contestId];
                let displayVerdict = s.verdict;
                let displayPoints = s.pointsAwarded;

                const isStandingsReleased = cInfo ? cInfo.isStandingsReleased : true;
                if (s.isLiveSubmission && !isStandingsReleased && !isAdmin) {
                    displayVerdict = s.verdict === 'Deprecated' ? 'Deprecated' : 'Awaiting Evaluation';
                    displayPoints = 0;
                }

                return {
                    id: s._id,
                    submissionId: s.submissionId || generateSubmissionId(s.submittedAt),
                    contestId: s.contestId,
                    problemLetter: s.problemLetter,
                    problemTitle: cInfo?.problems?.[s.problemLetter] || `Problem ${s.problemLetter}`,
                    username: s.username,
                    candidateId: s.candidateId,
                    language: s.language,
                    verdict: displayVerdict,
                    testPassed: s.testPassed,
                    totalTests: s.totalTests,
                    timeUsedMs: s.timeUsedMs,
                    memoryUsedKb: s.memoryUsedKb,
                    pointsAwarded: displayPoints,
                    compileOutput: s.compileOutput,
                    code: s.code,
                    submittedAt: s.submittedAt
                };
            })
        });
    } catch (err) {
        console.error('Error fetching overall submissions:', err);
        return res.status(500).json({ error: 'Failed to fetch overall submissions' });
    }
});

/**
 * GET /api/kata/contests/:contestId/standings
 * Real-time Codeforces-style contest standings:
 * Supports:
 * - ?mode=live (default): Official live contest standings (isLiveSubmission: true, registered candidates)
 * - ?mode=virtual: Virtual participation standings (isVirtual: true, virtual candidates, penalty calculated from individual virtual timer start)
 * - ?mode=all: Combined standings with [Virtual] indicators
 * - Concealment check: Standings are concealed during live round and 4h post-contest AI audit unless requester is admin or auditStatus === 'completed'
 */
router.get('/contests/:contestId/standings', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const mode = (req.query.mode || 'live').toLowerCase(); // 'live' | 'virtual' | 'all'
        const contest = await KataContestModel.findOne({ contestId }).lean();
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const now = new Date();
        const startTime = new Date(contest.startTime);
        const endTime = new Date(contest.endTime);
        const isScheduled = now < startTime || contest.status === 'scheduled';
        const isLive = now >= startTime && now <= endTime && contest.status !== 'scheduled';
        const thirtySixHoursAfterEnd = new Date(endTime.getTime() + 36 * 3600 * 1000);
        const isAuditPending = now > endTime && now < thirtySixHoursAfterEnd;
        const isConcealed = (isLive || isAuditPending) && req.user?.role !== 'admin';

        if (isScheduled) {
            return res.json({
                success: true,
                notStarted: true,
                message: 'The contest has not started yet. Standings will become available once the contest begins.',
                contest: {
                    contestId: contest.contestId,
                    title: contest.title,
                    track: contest.track,
                    status: 'scheduled',
                    startTime: contest.startTime,
                    endTime: contest.endTime,
                    durationHours: contest.durationHours || 2,
                    registeredCount: (contest.registeredCandidates || []).length
                },
                standings: [],
                letters: []
            });
        }

        if (isConcealed) {
            return res.json({
                success: true,
                concealed: true,
                mode,
                releaseTime: thirtySixHoursAfterEnd.toISOString(),
                remainingHours: Math.max(0, Math.ceil((thirtySixHoursAfterEnd.getTime() - now.getTime()) / (1000 * 3600))),
                remainingSeconds: Math.max(0, Math.floor((thirtySixHoursAfterEnd.getTime() - now.getTime()) / 1000)),
                message: isLive 
                    ? 'Standings are concealed during the live contest to preserve competitive integrity.' 
                    : 'Standings are concealed while evaluations and post-contest audits are in progress. Official final standings and candidate rating updates will be released 36 hours after the contest ends.',
                contest: {
                    contestId: contest.contestId,
                    title: contest.title,
                    track: contest.track,
                    status: isLive ? 'running' : 'ended',
                    startTime: contest.startTime,
                    endTime: contest.endTime,
                    problems: contest.problems
                },
                standings: [],
                letters: (contest.problems || []).map(p => p.letter).sort()
            });
        }

        const letters = (contest.problems || []).map(p => p.letter).sort();
        const problemPoints = {};
        for (const p of (contest.problems || [])) {
            problemPoints[p.letter] = p.points || 100;
        }

        // Submissions filter based on mode:
        // live: only isLiveSubmission: true
        // virtual: only isVirtual: true
        // all: isLiveSubmission: true OR isVirtual: true
        const subFilter = { 
            contestId,
            isSuperseded: { $ne: true },
            isLatest: { $ne: false },
            verdict: { $nin: ['Deprecated', 'Superseded'] }
        };
        if (mode === 'live') {
            subFilter.isLiveSubmission = true;
        } else if (mode === 'virtual') {
            subFilter.isVirtual = true;
        } else {
            subFilter.$or = [{ isLiveSubmission: true }, { isVirtual: true }];
        }

        const submissions = await KataSubmissionModel.find(subFilter)
            .sort({ submittedAt: 1 })
            .lean();

        // Map submissions by candidate
        const candidatesMap = new Map();

        // Helper to seed candidates into candidatesMap
        const seedCandidate = (reg, isVirtualCand) => {
            const handle = reg.username;
            const candId = reg.candidateId || reg.username;
            const key = (handle || candId).toLowerCase();
            candidatesMap.set(key, {
                candidateId: candId,
                handle: handle,
                username: handle,
                startedAt: reg.startedAt,
                isRegistered: true,
                isVirtual: isVirtualCand,
                problems: {},
                totalPoints: 0,
                totalPenalty: 0,
                solvedCount: 0,
                lastAcceptedAt: null
            });
        };

        if (mode === 'live' || mode === 'all') {
            for (const reg of (contest.registeredCandidates || [])) {
                seedCandidate(reg, false);
            }
        }
        if (mode === 'virtual' || mode === 'all') {
            for (const vreg of (contest.virtualCandidates || [])) {
                const key = (vreg.username || vreg.candidateId).toLowerCase();
                if (!candidatesMap.has(key)) {
                    seedCandidate(vreg, true);
                }
            }
        }

        // Process all filtered submissions chronologically
        for (const sub of submissions) {
            if (sub.isSuperseded) continue;
            const handle = sub.username || sub.candidateId;
            if (!handle) continue;
            const key = handle.toLowerCase();

            if (!candidatesMap.has(key)) {
                if (mode === 'live' && !sub.isLiveSubmission) continue;
                candidatesMap.set(key, {
                    candidateId: sub.candidateId || handle,
                    handle: handle,
                    username: handle,
                    startedAt: null,
                    isRegistered: false,
                    isVirtual: !!sub.isVirtual,
                    problems: {},
                    totalPoints: 0,
                    totalPenalty: 0,
                    solvedCount: 0,
                    lastAcceptedAt: null
                });
            }

            const cand = candidatesMap.get(key);
            const letter = sub.problemLetter.toUpperCase();

            if (!cand.problems[letter]) {
                cand.problems[letter] = {
                    solved: false,
                    points: 0,
                    rejectedAttemptsBeforeAc: 0,
                    penalty: 0,
                    acceptedAt: null,
                    display: ''
                };
            }

            const probState = cand.problems[letter];

            if (contest.track === 'forma' || sub.track === 'forma') {
                // Forma: Only the latest solution counts as the candidate's solution
                const pts = (sub.pointsAwarded !== undefined && sub.pointsAwarded !== null)
                    ? sub.pointsAwarded 
                    : (sub.verdict === 'Accepted' ? (problemPoints[letter] || 100) : 0);
                const isAccepted = sub.verdict === 'Accepted' || (pts > 0 && pts === (problemPoints[letter] || 100));

                probState.solved = isAccepted || pts > 0;
                probState.points = pts;
                probState.acceptedAt = sub.submittedAt;

                const startTime = cand.startedAt ? new Date(cand.startedAt) : new Date(contest.startTime);
                const subTime = new Date(sub.submittedAt || Date.now());
                const minsFromStart = Math.max(0, Math.floor((subTime.getTime() - startTime.getTime()) / 60000));
                probState.penalty = minsFromStart;

                if (pts > 0) {
                    probState.display = `${pts}`;
                } else if (sub.verdict === 'Submitted (Awaiting Evaluation)' || sub.verdict === 'In queue') {
                    probState.display = '?';
                } else {
                    probState.display = '0';
                }

                cand.totalPoints += probState.points;
                cand.totalPenalty += probState.penalty;
                if (probState.solved) cand.solvedCount += 1;
                cand.lastAcceptedAt = sub.submittedAt;
            } else {
                // Shin CP rules with penalty for rejected attempts
                if (probState.solved) continue;

                if (sub.verdict === 'Accepted') {
                    probState.solved = true;
                    probState.points = sub.pointsAwarded || problemPoints[letter] || 100;
                    probState.acceptedAt = sub.submittedAt;

                    // Time from candidate timer start:
                    // For virtual: startedAt from virtual registration
                    // For live: startedAt from live enter, or contest.startTime
                    const startTime = cand.startedAt ? new Date(cand.startedAt) : new Date(contest.startTime);
                    const subTime = new Date(sub.submittedAt || Date.now());
                    const minsFromStart = Math.max(0, Math.floor((subTime.getTime() - startTime.getTime()) / 60000));

                    // Codeforces penalty: minutes + (rejected attempts * 10)
                    probState.penalty = minsFromStart + (probState.rejectedAttemptsBeforeAc * 10);
                    probState.display = probState.rejectedAttemptsBeforeAc > 0 ? `+${probState.rejectedAttemptsBeforeAc}` : '+';

                    cand.totalPoints += probState.points;
                    cand.totalPenalty += probState.penalty;
                    cand.solvedCount += 1;
                    cand.lastAcceptedAt = sub.submittedAt;
                } else {
                    // Rejected attempt
                    probState.rejectedAttemptsBeforeAc += 1;
                    probState.display = `-${probState.rejectedAttemptsBeforeAc}`;
                }
            }
        }

        // Fetch rating information for all candidates
        const allHandles = Array.from(candidatesMap.values()).map(c => c.handle);
        const candidateDocs = await CandidateModel.find({
            $or: [
                { 'kataProfile.handle': { $in: allHandles } },
                { username: { $in: allHandles } },
                { studentId: { $in: allHandles } }
            ]
        }).select('username studentId kataProfile').lean();

        const profileLookup = new Map();
        for (const doc of candidateDocs) {
            const h = doc.kataProfile?.handle || doc.username;
            if (h) profileLookup.set(h.toLowerCase(), doc.kataProfile);
            if (doc.username) profileLookup.set(doc.username.toLowerCase(), doc.kataProfile);
            if (doc.studentId) profileLookup.set(doc.studentId.toLowerCase(), doc.kataProfile);
        }

        const track = contest.track || 'shin';

        const standings = Array.from(candidatesMap.values()).map(cand => {
            const prof = profileLookup.get(cand.handle.toLowerCase()) || {};
            const rating = track === 'forma' ? (prof.formaRating || 1200) : (prof.shinRating || 1200);
            const tier = getRatingTier(rating);

            // Format problem matrix for each letter in contest
            const problemResults = {};
            for (const l of letters) {
                const p = cand.problems[l];
                if (!p) {
                    problemResults[l] = { solved: false, display: '', points: 0, penalty: 0 };
                } else {
                    problemResults[l] = {
                        solved: p.solved,
                        display: p.display,
                        points: p.points,
                        penalty: p.penalty
                    };
                }
            }

            return {
                candidateId: cand.candidateId,
                handle: cand.handle,
                rating,
                rankTitle: tier.title,
                rankColor: tier.color,
                totalPoints: cand.totalPoints,
                totalPenalty: cand.totalPenalty,
                solvedCount: cand.solvedCount,
                lastAcceptedAt: cand.lastAcceptedAt,
                isRegistered: cand.isRegistered,
                isVirtual: !!cand.isVirtual,
                problemResults
            };
        });

        // Sort standings:
        // 1. Total Points descending
        // 2. Total Penalty ascending
        // 3. Last accepted submission time ascending
        standings.sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (a.totalPenalty !== b.totalPenalty) return a.totalPenalty - b.totalPenalty;
            if (a.lastAcceptedAt && b.lastAcceptedAt) {
                return new Date(a.lastAcceptedAt) - new Date(b.lastAcceptedAt);
            }
            return 0;
        });

        // Assign dense ranks
        for (let i = 0; i < standings.length; i++) {
            if (i > 0) {
                const prev = standings[i - 1];
                const curr = standings[i];
                if (curr.totalPoints === prev.totalPoints && curr.totalPenalty === prev.totalPenalty) {
                    curr.rank = prev.rank;
                } else {
                    curr.rank = i + 1;
                }
            } else {
                standings[i].rank = 1;
            }
        }

        return res.json({
            success: true,
            mode,
            concealed: false,
            contest: {
                contestId: contest.contestId,
                title: contest.title,
                track: contest.track,
                status: contest.status,
                startTime: contest.startTime,
                endTime: contest.endTime,
                problems: contest.problems
            },
            letters,
            problemPoints,
            standings
        });
    } catch (err) {
        console.error('Error computing contest standings:', err);
        return res.status(500).json({ error: 'Failed to compute standings' });
    }
});

/**
 * GET /api/kata/submissions/:id/status
 * Live submission polling
 */
router.get('/submissions/:id/status', async (req, res) => {
    try {
        const submission = await KataSubmissionModel.findById(req.params.id).lean();
        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        let displayVerdict = submission.verdict;
        let displayPoints = submission.pointsAwarded;
        const isAdmin = req.user?.role === 'admin';

        if (submission.isLiveSubmission && !isAdmin) {
            const contest = await KataContestModel.findOne({ contestId: submission.contestId }).select('endTime standingsReleased').lean();
            const now = new Date();
            const thirtySixHoursAfterEnd = contest?.endTime ? new Date(new Date(contest.endTime).getTime() + 36 * 3600 * 1000) : null;
            const isStandingsReleased = Boolean(contest?.standingsReleased) || (thirtySixHoursAfterEnd && now >= thirtySixHoursAfterEnd);
            if (!isStandingsReleased) {
                displayVerdict = submission.verdict === 'Deprecated' ? 'Deprecated' : 'Awaiting Evaluation';
                displayPoints = 0;
            }
        }

        return res.json({
            success: true,
            submission: {
                id: submission._id,
                contestId: submission.contestId,
                problemLetter: submission.problemLetter,
                verdict: displayVerdict,
                testPassed: submission.testPassed,
                totalTests: submission.totalTests,
                timeUsedMs: submission.timeUsedMs,
                memoryUsedKb: submission.memoryUsedKb,
                pointsAwarded: displayPoints,
                compileOutput: submission.compileOutput
            }
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch status' });
    }
});

/**
 * Admin: Question Bank CRUD & Manual Contest Generation
 * Strictly locked to administrative identity
 */
router.use('/admin', authenticateToken, requireAdmin);

router.get('/admin/questions', async (req, res) => {
    try {
        const { track, letter } = req.query;
        const query = {};
        if (track) query.track = track;
        if (letter) query.letter = letter.toUpperCase();

        const questions = await KataQuestionBankModel.find(query).sort({ letter: 1, createdAt: -1 }).lean();
        return res.json({
            success: true,
            questions: questions.map(q => ({
                id: q._id,
                track: q.track,
                letter: q.letter,
                title: q.title,
                points: q.points,
                timeLimit: q.timeLimit,
                memoryLimit: q.memoryLimit,
                difficulty: q.difficulty,
                tags: q.tags,
                statementHtml: q.statementHtml,
                inputFormat: q.inputFormat,
                outputFormat: q.outputFormat,
                sampleInput: q.sampleInput,
                sampleOutput: q.sampleOutput,
                note: q.note,
                hiddenTestCasesCount: (q.hiddenTestCases || []).length,
                createdAt: q.createdAt
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

router.post('/admin/questions', async (req, res) => {
    try {
        const { track, letter, title, statementHtml, inputFormat, outputFormat, sampleInput, sampleOutput, note, hiddenTestCases, points, timeLimit, memoryLimit, tags, difficulty } = req.body;

        if (!track || !letter || !title || !statementHtml || !sampleInput || !sampleOutput) {
            return res.status(400).json({ error: 'Missing required question fields' });
        }

        const pointMap = { A: 100, B: 200, C: 300, D: 400, E: 500 };
        const question = await KataQuestionBankModel.create({
            track,
            letter: letter.toUpperCase(),
            title,
            statementHtml,
            inputFormat: inputFormat || '',
            outputFormat: outputFormat || '',
            sampleInput,
            sampleOutput,
            note: note || '',
            hiddenTestCases: hiddenTestCases || [],
            points: points || pointMap[letter.toUpperCase()] || 100,
            timeLimit: Number(timeLimit) || 1.0,
            memoryLimit: Number(memoryLimit) || 256,
            tags: tags || [],
            difficulty: difficulty || 'Medium'
        });

        return res.json({ success: true, question });
    } catch (err) {
        console.error('Error creating question:', err);
        return res.status(500).json({ error: 'Failed to create question' });
    }
});

router.put('/admin/questions/:id', async (req, res) => {
    try {
        const updated = await KataQuestionBankModel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        return res.json({ success: true, question: updated });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update question' });
    }
});

router.delete('/admin/questions/:id', async (req, res) => {
    try {
        await KataQuestionBankModel.findByIdAndDelete(req.params.id);
        return res.json({ success: true, message: 'Question deleted successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete question' });
    }
});

router.post('/admin/generate-contest', async (req, res) => {
    try {
        const { track = 'shin' } = req.body;
        const { saturday, sunday } = getUpcomingWeekendDates();
        const targetDate = track === 'shin' ? saturday : sunday;
        const contest = await generateContestForTrack(track, targetDate);
        return res.json({ success: true, contest });
    } catch (err) {
        return res.status(500).json({ error: err.message || 'Contest generation failed' });
    }
});

/**
 * Admin Dev Mode: List all contests with full admin details
 */
router.get('/admin/contests', async (req, res) => {
    try {
        const contests = await KataContestModel.find({}).sort({ startTime: -1 }).lean();
        return res.json({
            success: true,
            contests: contests.map(c => ({
                contestId: c.contestId,
                title: c.title,
                track: c.track,
                roundNumber: c.roundNumber,
                startTime: c.startTime,
                endTime: c.endTime,
                status: c.status,
                registeredCount: (c.registeredCandidates || []).length,
                registeredCandidates: (c.registeredCandidates || []).map(cand => ({
                    username: cand.username,
                    candidateId: cand.candidateId,
                    startedAt: cand.startedAt,
                    expiresAt: cand.expiresAt
                })),
                problemCount: (c.problems || []).length,
                problems: c.problems
            }))
        });
    } catch (err) {
        console.error('Error fetching admin contests:', err);
        return res.status(500).json({ error: 'Failed to fetch contests' });
    }
});

/**
 * Admin Dev Mode: Override contest schedule (e.g. Set Live Now (+2h), Set Ended)
 */
router.put('/admin/contests/:contestId/schedule', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const { action, startTime, endTime, status } = req.body;
        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        const now = new Date();
        if (action === 'set-live-2h') {
            contest.startTime = new Date(now.getTime() - 2 * 60 * 1000); // started 2 mins ago
            contest.endTime = new Date(now.getTime() + 2 * 3600 * 1000); // 2 hours from now
            contest.status = 'running';
        } else if (action === 'set-ended') {
            contest.startTime = new Date(now.getTime() - 4 * 3600 * 1000);
            contest.endTime = new Date(now.getTime() - 5 * 60 * 1000); // ended 5 mins ago
            contest.status = 'ended';
        } else {
            if (startTime) contest.startTime = new Date(startTime);
            if (endTime) contest.endTime = new Date(endTime);
            if (status) contest.status = status;
        }

        await contest.save();
        return res.json({ success: true, message: `Schedule updated for ${contestId}`, contest });
    } catch (err) {
        console.error('Error updating contest schedule:', err);
        return res.status(500).json({ error: 'Failed to update contest schedule' });
    }
});

/**
 * Admin Dev Mode: Re-roll questions A-E from question bank
 */
router.post('/admin/contests/:contestId/reconfigure', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        const letters = ['A', 'B', 'C', 'D', 'E'];
        const pointValues = { A: 100, B: 200, C: 300, D: 400, E: 500 };
        const selectedProblems = [];

        for (const letter of letters) {
            const candidates = await KataQuestionBankModel.find({ track: contest.track, letter });
            if (candidates.length > 0) {
                const chosen = candidates[Math.floor(Math.random() * candidates.length)];
                selectedProblems.push({
                    letter,
                    questionId: chosen._id,
                    points: pointValues[letter],
                    solvedCount: 0
                });
            }
        }

        contest.problems = selectedProblems;
        await contest.save();

        return res.json({ 
            success: true, 
            message: `Re-rolled problems A-E for ${contestId} from ${contest.track} bank`, 
            problemCount: selectedProblems.length 
        });
    } catch (err) {
        console.error('Error reconfiguring contest:', err);
        return res.status(500).json({ error: 'Failed to reconfigure contest problems' });
    }
});

/**
 * Admin Dev Mode: Reset all candidate timers for this contest
 */
router.post('/admin/contests/:contestId/reset-timers', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const contest = await KataContestModel.findOne({ contestId });
        if (!contest) return res.status(404).json({ error: 'Contest not found' });

        for (const cand of contest.registeredCandidates) {
            cand.startedAt = null;
            cand.expiresAt = null;
        }

        await contest.save();
        return res.json({ 
            success: true, 
            message: `Reset candidate timers for ${contest.registeredCandidates.length} participants in ${contestId}` 
        });
    } catch (err) {
        console.error('Error resetting candidate timers:', err);
        return res.status(500).json({ error: 'Failed to reset candidate timers' });
    }
});

/**
 * Admin: Recalculate Ratings for an ended contest
 * POST /api/kata/admin/contests/:contestId/recalculate-ratings
 */
router.post('/admin/contests/:contestId/recalculate-ratings', async (req, res) => {
    try {
        const contestId = req.params.contestId.toUpperCase();
        const result = await processContestRatings(contestId, {
            CandidateModel,
            KataContestModel,
            KataSubmissionModel,
            dbState,
            getJSONData,
            saveJSONData
        });
        return res.json({
            success: true,
            message: `Ratings successfully calculated and updated for ${contestId}`,
            result
        });
    } catch (err) {
        console.error('Error recalculating ratings:', err);
        return res.status(500).json({ error: err.message || 'Failed to recalculate ratings' });
    }
});

/**
 * Admin Dev Mode: Force trigger Thursday weekly contest auto-configuration
 */
router.post('/admin/trigger-weekly-config', async (req, res) => {
    try {
        await configureThursdayWeeklyContests(true);
        return res.json({ success: true, message: 'Thursday weekly contest configuration triggered successfully' });
    } catch (err) {
        console.error('Error triggering weekly config:', err);
        return res.status(500).json({ error: 'Failed to trigger weekly configuration' });
    }
});

/**
 * GET /api/kata/profile/:handle
 * Public profile data by handle
 */
router.get('/profile/:handle', async (req, res) => {
    try {
        const handle = req.params.handle;
        let candidate = null;

        if (dbState.useMongo) {
            const safeHandleRegex = new RegExp(`^${escapeRegex(handle)}$`, 'i');
            candidate = await CandidateModel.findOne({
                'kataProfile.handle': { $regex: safeHandleRegex }
            }).lean();
        } else {
            const db = getJSONData();
            candidate = (db.candidates || []).find(c =>
                c.kataProfile &&
                c.kataProfile.handle &&
                c.kataProfile.handle.toLowerCase() === handle.toLowerCase()
            );
        }

        if (!candidate || !candidate.kataProfile) {
            return res.status(404).json({ error: `Handle "${handle}" not found` });
        }

        let profile = candidate.kataProfile;
        if (dbState.useMongo) {
            profile = await calculateCandidateKataStats(candidate.studentId || candidate._id, candidate.username, profile);
            await CandidateModel.updateOne({ _id: candidate._id }, { $set: { kataProfile: profile } });
        }
        const shinTier = getRatingTier(profile.shinRating || 1200);
        const formaTier = getRatingTier(profile.formaRating || 1200);

        return res.json({
            success: true,
            candidate: {
                name: candidate.name,
                username: candidate.username,
                email: candidate.registrationData?.collegeEmail ||
                       candidate.registrationData?.personalEmail ||
                       candidate.email ||
                       ''
            },
            profile: {
                ...profile,
                shinRank: shinTier.title,
                shinRankColor: shinTier.color,
                shinMaxRank: getRatingTier(profile.shinMaxRating || 1200).title,
                formaRank: formaTier.title,
                formaRankColor: formaTier.color,
                formaMaxRank: getRatingTier(profile.formaMaxRating || 1200).title
            }
        });
    } catch (err) {
        console.error('Error fetching handle profile:', err);
        return res.status(500).json({ error: 'Error fetching handle profile' });
    }
});

/**
 * Admin: Plagiarism Review Queue & AI Evaluation Triggers
 */

router.get('/admin/plagiarism', async (req, res) => {
    try {
        const flagged = await KataSubmissionModel.find({
            $or: [
                { flaggedForAdminReview: true },
                { isPlagiarized: true },
                { plagiarismScore: { $gte: 60 } }
            ]
        }).sort({ submittedAt: -1 }).limit(100).lean();

        return res.json({
            success: true,
            submissions: flagged
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch plagiarism reports' });
    }
});

router.post('/admin/plagiarism/:id/action', async (req, res) => {
    try {
        const { action, score } = req.body;
        const submission = await KataSubmissionModel.findById(req.params.id);
        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        const adminUser = req.user?.username || 'admin';
        submission.adminReviewed = true;
        submission.adminReviewedAt = new Date();
        submission.adminReviewedBy = adminUser;

        if (action === 'plagiarism' || action === 'penalize') {
            submission.pointsAwarded = 0;
            submission.verdict = 'Disqualified (Plagiarism Confirmed)';
            submission.isPlagiarized = true;
            submission.flaggedForAdminReview = false;
            submission.adminVerdict = 'plagiarism';
        } else if (action === 'correct' || action === 'dismiss') {
            submission.flaggedForAdminReview = false;
            submission.isPlagiarized = false;
            submission.adminVerdict = 'correct';
            // Restore earned score if previously cleared
            if (submission.track === 'shin') {
                const contest = await KataContestModel.findOne({ contestId: submission.contestId }).lean();
                const prob = contest?.problems?.find(p => p.letter === submission.problemLetter);
                submission.pointsAwarded = prob?.points || 100;
                submission.verdict = 'Accepted';
            } else if (submission.track === 'forma' && submission.aiEvaluation?.ratingScore) {
                submission.pointsAwarded = submission.aiEvaluation.ratingScore;
            }
        } else if (action === 'override_score') {
            const newScore = Math.max(0, Number(score) || 0);
            submission.pointsAwarded = newScore;
            submission.adminOverriddenScore = newScore;
            submission.adminVerdict = 'overridden';
            submission.flaggedForAdminReview = false;
        }

        await submission.save();

        // Synchronize TA normalized contest marks for this candidate
        try {
            const { syncCandidateNormalizedMarks } = require('../utils/taNormalizedMarks');
            await syncCandidateNormalizedMarks(submission.candidateId || submission.username, submission.contestId);
        } catch (normErr) {
            console.error('[KataRoutes] Error syncing TA normalized marks after admin action:', normErr);
        }

        return res.json({ success: true, submission });
    } catch (err) {
        return res.status(500).json({ error: 'Action failed' });
    }
});

router.post('/admin/trigger-ai-evaluation', async (req, res) => {
    try {
        runHourlyAiEvaluatorTick();
        return res.json({ success: true, message: 'AI evaluation cycle triggered in background.' });
    } catch (err) {
        return res.status(500).json({ error: 'Trigger failed' });
    }
});

module.exports = router;


