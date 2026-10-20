const mongoose = require('mongoose');
const { CandidateModel } = require('../models/Candidate');
const { KataContestModel } = require('../models/KataContest');
const { KataSubmissionModel } = require('../models/KataSubmission');
const { dbState, getJSONData, saveJSONData } = require('../config/db');

/**
 * Calculates and persists normalized contest marks for a candidate in a given contest.
 * Rules:
 * 1. Store Shin and Forma normalized marks separately under candidate.taNormalizedContestMarks[track]
 * 2. For Shin: each correct solved question constitutes 1, and incorrect or unanswered constitutes 0
 * 3. For Forma: whatever marks m given by the evaluator, stored for each question as m / max_score_of_that_question
 * 4. Completely concealed from candidate profile responses (select: false + toJSON/toObject/sanitize hooks)
 *
 * @param {string|Object} candidateIdentifier - studentId, username, candidateId, or candidate document
 * @param {string} contestId - The contest identifier (e.g. "SHIN-CONTEST-1", "FORMA-CONTEST-1")
 * @returns {Promise<Object|null>} The saved normalized contest entry
 */
async function syncCandidateNormalizedMarks(candidateIdentifier, contestId) {
    if (!candidateIdentifier || !contestId) return null;

    try {
        const cleanContestId = String(contestId).trim().toUpperCase();

        // 1. Fetch Candidate
        let candidate = null;
        if (typeof candidateIdentifier === 'object' && candidateIdentifier !== null && (candidateIdentifier._id || candidateIdentifier.studentId)) {
            candidate = candidateIdentifier;
            // Ensure taNormalizedContestMarks is populated if Mongoose document
            if (dbState?.useMongo && candidate.isSelected && !candidate.isSelected('taNormalizedContestMarks')) {
                candidate = await CandidateModel.findById(candidate._id).select('+taNormalizedContestMarks');
            }
        } else if (dbState?.useMongo) {
            const orClauses = [
                { studentId: candidateIdentifier },
                { username: candidateIdentifier }
            ];
            if (mongoose.isValidObjectId(candidateIdentifier)) {
                orClauses.push({ _id: candidateIdentifier });
            }
            candidate = await CandidateModel.findOne({ $or: orClauses }).select('+taNormalizedContestMarks');
        } else {
            const db = getJSONData();
            candidate = (db.candidates || []).find(c =>
                c.studentId === candidateIdentifier ||
                c.username === candidateIdentifier ||
                String(c.id || c._id) === String(candidateIdentifier)
            );
        }

        if (!candidate) {
            console.warn(`[taNormalizedMarks] Candidate not found for identifier: ${candidateIdentifier}`);
            return null;
        }

        // 2. Fetch Contest
        let contest = null;
        if (dbState?.useMongo) {
            contest = await KataContestModel.findOne({ contestId: cleanContestId }).lean();
            if (!contest) {
                // Case-insensitive fallback
                contest = await KataContestModel.findOne({
                    contestId: { $regex: new RegExp(`^${cleanContestId}$`, 'i') }
                }).lean();
            }
        } else {
            const db = getJSONData();
            contest = (db.kataContests || []).find(c => 
                String(c.contestId).toUpperCase() === cleanContestId
            );
        }

        if (!contest) {
            console.warn(`[taNormalizedMarks] Contest not found: ${cleanContestId}`);
            return null;
        }

        const track = (contest.track === 'forma') ? 'forma' : 'shin';
        const contestProblems = contest.problems || [];
        const candidateId = candidate.studentId || String(candidate._id || candidate.id || '');
        const candidateUsername = candidate.username;

        // 3. Fetch Candidate's Submissions for this contest
        let rawSubmissions = [];
        if (dbState?.useMongo) {
            const orFilters = [];
            if (candidateId) orFilters.push({ candidateId: candidateId });
            if (candidateUsername) orFilters.push({ username: candidateUsername });
            if (candidate._id) orFilters.push({ candidateId: String(candidate._id) });

            rawSubmissions = await KataSubmissionModel.find({
                contestId: contest.contestId,
                $or: orFilters,
                isSuperseded: { $ne: true },
                isLatest: { $ne: false },
                verdict: { $nin: ['Deprecated', 'Superseded'] }
            }).sort({ submittedAt: -1, createdAt: -1 }).lean();
        } else {
            const db = getJSONData();
            rawSubmissions = (db.kataSubmissions || []).filter(s =>
                String(s.contestId).toUpperCase() === cleanContestId &&
                !s.isSuperseded &&
                s.isLatest !== false &&
                s.verdict !== 'Deprecated' &&
                s.verdict !== 'Superseded' &&
                (s.candidateId === candidateId || s.username === candidateUsername || s.candidateId === String(candidate._id || candidate.id))
            );
            rawSubmissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        }

        // Pick authoritative latest submission per problem letter
        const latestSubmissionsByLetter = new Map();
        for (const sub of rawSubmissions) {
            if (!latestSubmissionsByLetter.has(sub.problemLetter)) {
                latestSubmissionsByLetter.set(sub.problemLetter, sub);
            }
        }

        // 4. Build per-question normalized breakdown
        const questionRecords = [];
        const letters = ['A', 'B', 'C', 'D', 'E'];
        const problemList = contestProblems.length > 0
            ? contestProblems
            : letters.map(l => ({ letter: l, points: 100 }));

        for (const prob of problemList) {
            const letter = prob.letter;
            const maxPoints = Number(prob.points) > 0 ? Number(prob.points) : 100;
            const candSub = latestSubmissionsByLetter.get(letter);

            if (track === 'shin') {
                // Shin rule: each correct solved question constitutes to 1 and incorrect or unanswered to 0
                const isSolved = candSub?.verdict === 'Accepted';
                const normalizedScore = isSolved ? 1 : 0;

                questionRecords.push({
                    letter,
                    isSolved,
                    marksAwarded: isSolved ? 1 : 0,
                    maxScore: 1,
                    normalizedScore
                });
            } else {
                // Forma rule: whatever marks m given by the evaluator, to be stored as for each question as m/max_score_of_that_question
                let marksAwarded = 0;

                if (candSub) {
                    const hasAdminScore = candSub.adminOverriddenScore !== null && candSub.adminOverriddenScore !== undefined;
                    const hasAiScore = candSub.aiEvaluation && (candSub.aiEvaluation.ratedAt || candSub.aiEvaluation.ratingScore !== undefined);

                    if (hasAdminScore) {
                        marksAwarded = Number(candSub.adminOverriddenScore) || 0;
                    } else if (hasAiScore && candSub.aiEvaluation?.ratingScore !== undefined && candSub.aiEvaluation?.ratingScore !== null) {
                        marksAwarded = Number(candSub.aiEvaluation.ratingScore) || 0;
                    } else if (candSub.pointsAwarded !== undefined && candSub.pointsAwarded !== null) {
                        marksAwarded = Number(candSub.pointsAwarded) || 0;
                    }
                }

                marksAwarded = Math.max(0, marksAwarded);
                const normalizedScore = maxPoints > 0
                    ? Math.max(0, Math.min(1, Number((marksAwarded / maxPoints).toFixed(4))))
                    : 0;
                const isSolved = candSub?.verdict === 'Accepted' || (normalizedScore >= 0.8);

                questionRecords.push({
                    letter,
                    isSolved,
                    marksAwarded,
                    maxScore: maxPoints,
                    normalizedScore
                });
            }
        }

        // 5. Aggregate contest total normalized scores
        const totalNormalizedScore = Number(
            questionRecords.reduce((sum, q) => sum + (Number(q.normalizedScore) || 0), 0).toFixed(4)
        );
        const maxPossibleScore = questionRecords.length; // Each question normalized score has max 1.0
        const normalizedPercentage = maxPossibleScore > 0
            ? Number(((totalNormalizedScore / maxPossibleScore) * 100).toFixed(2))
            : 0;

        const contestDate = contest.endTime
            ? new Date(contest.endTime)
            : (contest.startTime ? new Date(contest.startTime) : new Date());

        const contestEntry = {
            contestId: contest.contestId || cleanContestId,
            contestTitle: contest.title || cleanContestId,
            date: contestDate,
            totalNormalizedScore,
            maxPossibleScore,
            normalizedPercentage,
            questions: questionRecords
        };

        // 6. Update candidate's taNormalizedContestMarks
        if (!candidate.taNormalizedContestMarks) {
            candidate.taNormalizedContestMarks = { shin: [], forma: [] };
        }
        if (!candidate.taNormalizedContestMarks[track]) {
            candidate.taNormalizedContestMarks[track] = [];
        }

        const trackList = candidate.taNormalizedContestMarks[track];
        const existingIdx = trackList.findIndex(e => String(e.contestId).toUpperCase() === cleanContestId);

        if (existingIdx >= 0) {
            trackList[existingIdx] = contestEntry;
        } else {
            trackList.push(contestEntry);
        }

        // 7. Persist to storage
        if (dbState?.useMongo) {
            if (typeof candidate.markModified === 'function') {
                candidate.markModified('taNormalizedContestMarks');
                await candidate.save();
            } else {
                await CandidateModel.updateOne(
                    { _id: candidate._id },
                    { $set: { taNormalizedContestMarks: candidate.taNormalizedContestMarks } }
                );
            }
        } else {
            const db = getJSONData();
            const candIdx = (db.candidates || []).findIndex(c =>
                c.studentId === candidate.studentId ||
                c.username === candidate.username ||
                String(c.id || c._id) === String(candidate.id || candidate._id)
            );
            if (candIdx >= 0) {
                db.candidates[candIdx].taNormalizedContestMarks = candidate.taNormalizedContestMarks;
                saveJSONData(db);
            }
        }

        console.log(`[taNormalizedMarks] Synced ${track} contest ${cleanContestId} for candidate ${candidateUsername || candidateId}: ${totalNormalizedScore}/${maxPossibleScore} (${normalizedPercentage}%)`);
        return contestEntry;
    } catch (err) {
        console.error(`[taNormalizedMarks] Error syncing normalized marks for candidate ${candidateIdentifier} in contest ${contestId}:`, err);
        return null;
    }
}

/**
 * Bulk syncs normalized marks for all participants in a contest.
 *
 * @param {string} contestId - The contest identifier
 * @returns {Promise<Object>} Summary of sync results
 */
async function syncContestNormalizedMarks(contestId) {
    if (!contestId) return { success: false, error: 'contestId is required' };

    try {
        const cleanContestId = String(contestId).trim().toUpperCase();

        let contest = null;
        if (dbState?.useMongo) {
            contest = await KataContestModel.findOne({ contestId: cleanContestId }).lean();
            if (!contest) {
                contest = await KataContestModel.findOne({
                    contestId: { $regex: new RegExp(`^${cleanContestId}$`, 'i') }
                }).lean();
            }
        } else {
            const db = getJSONData();
            contest = (db.kataContests || []).find(c => String(c.contestId).toUpperCase() === cleanContestId);
        }

        if (!contest) {
            return { success: false, error: `Contest ${cleanContestId} not found` };
        }

        // Collect all distinct candidate identifiers who registered or submitted
        const candidateSet = new Set();

        // 1. Registered candidates
        for (const reg of (contest.registeredCandidates || [])) {
            if (reg.candidateId) candidateSet.add(reg.candidateId);
            if (reg.username) candidateSet.add(reg.username);
        }

        // 2. Candidates who submitted
        if (dbState?.useMongo) {
            const subs = await KataSubmissionModel.find({
                contestId: contest.contestId,
                isSuperseded: { $ne: true },
                isLatest: { $ne: false },
                verdict: { $nin: ['Deprecated', 'Superseded'] }
            }).select('candidateId username').lean();

            for (const s of subs) {
                if (s.candidateId) candidateSet.add(s.candidateId);
                if (s.username) candidateSet.add(s.username);
            }
        } else {
            const db = getJSONData();
            const subs = (db.kataSubmissions || []).filter(s =>
                String(s.contestId).toUpperCase() === cleanContestId &&
                !s.isSuperseded &&
                s.verdict !== 'Deprecated' &&
                s.verdict !== 'Superseded'
            );
            for (const s of subs) {
                if (s.candidateId) candidateSet.add(s.candidateId);
                if (s.username) candidateSet.add(s.username);
            }
        }

        const candidateIds = Array.from(candidateSet);
        console.log(`[taNormalizedMarks] Syncing normalized marks for ${candidateIds.length} candidate(s) in contest ${cleanContestId}...`);

        const results = [];
        for (const cid of candidateIds) {
            const res = await syncCandidateNormalizedMarks(cid, contest.contestId);
            if (res) results.push({ candidate: cid, ...res });
        }

        return {
            success: true,
            contestId: contest.contestId,
            track: contest.track || 'shin',
            totalParticipants: candidateIds.length,
            syncedCount: results.length,
            results
        };
    } catch (err) {
        console.error(`[taNormalizedMarks] Error bulk syncing contest ${contestId}:`, err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    syncCandidateNormalizedMarks,
    syncContestNormalizedMarks
};
