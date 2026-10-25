/**
 * ratingEngine.js
 * Competitive programming Elo / Codeforces rating calculator for Kata platform.
 * Computes post-contest rating adjustments (delta R), rank seeds, max ratings,
 * contest history, solved stats, and submission heatmaps.
 */

const getRatingTier = (r) => {
    const rating = Number(r) || 1200;
    if (rating < 1200) return { title: 'Initiate', color: '#808080', bg: '#cccccc' };
    if (rating < 1400) return { title: 'Apprentice', color: '#008000', bg: '#77ff77' };
    if (rating < 1600) return { title: 'Specialist', color: '#03a89e', bg: '#77ddbb' };
    if (rating < 1900) return { title: 'Expert', color: '#0000ff', bg: '#aaaaee' };
    if (rating < 2200) return { title: 'Shogun', color: '#aa00aa', bg: '#ff88ff' };
    if (rating < 2400) return { title: 'Master', color: '#ff8c00', bg: '#ffcc88' };
    return { title: 'Grandmaster', color: '#ff0000', bg: '#ff7777' };
};

/**
 * Calculates Codeforces Elo expected probability P(j beats i)
 * P(j > i) = 1 / (1 + 10^((R_j - R_i) / 400))
 */
function getExpectedProbability(rA, rB) {
    return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/**
 * Computes participant's expected rank (seed) based on the ratings of all participants
 */
function getSeed(ratings, index) {
    const rI = ratings[index];
    let seed = 1.0;
    for (let j = 0; j < ratings.length; j++) {
        if (j !== index) {
            seed += getExpectedProbability(rI, ratings[j]);
        }
    }
    return seed;
}

/**
 * Computes rating adjustments for a list of participants.
 * Each participant object: { candidateId, username, handle, rank, points, oldRating }
 * @param {Array} participants
 * @returns {Array} participants with delta and newRating
 */
function computeRatingChanges(participants) {
    if (!participants || participants.length === 0) return [];
    const N = participants.length;

    // Single participant case
    if (N === 1) {
        const p = participants[0];
        const delta = p.points > 0 ? 50 : 0;
        return [{
            ...p,
            delta,
            newRating: Math.max(500, p.oldRating + delta)
        }];
    }

    const ratings = participants.map(p => p.oldRating || 1200);

    // 1. Calculate seed for each competitor
    const seeds = participants.map((_, i) => getSeed(ratings, i));

    // 2. Calculate geometric mean rank m_i = sqrt(actualRank * seed)
    const geometricRanks = participants.map((p, i) => Math.sqrt(p.rank * seeds[i]));

    // 3. Calculate preliminary delta: K * (seed - actualRank)
    // Scale K by competitor count so larger pools have appropriate rating volatility
    const K = Math.min(120, Math.max(30, 240 / Math.sqrt(N)));

    let rawDeltas = participants.map((p, i) => {
        // If candidate scored 0 points, cap delta to avoid unfair heavy penalization
        if (p.points === 0) {
            return Math.min(0, Math.max(-40, Math.round((seeds[i] - p.rank) * (K / 2.5))));
        }
        const delta = Math.round((seeds[i] - p.rank) * K);
        return Math.max(-150, Math.min(300, delta));
    });

    // 4. Zero-sum adjustment (prevent global rating inflation / deflation)
    const avgDelta = rawDeltas.reduce((a, b) => a + b, 0) / N;
    const balancedDeltas = rawDeltas.map(d => Math.round(d - avgDelta));

    return participants.map((p, i) => {
        const delta = balancedDeltas[i];
        const newRating = Math.max(500, p.oldRating + delta);
        return {
            ...p,
            seed: Math.round(seeds[i] * 10) / 10,
            delta,
            newRating
        };
    });
}

/**
 * Calculates and persists rating changes for a completed contest.
 * Updates Candidate models, contest history, solved stats, and streak.
 * @param {string} contestId
 * @param {object} models - { CandidateModel, KataContestModel, KataSubmissionModel, dbState, getJSONData, saveJSONData }
 */
async function processContestRatings(contestId, models) {
    const { CandidateModel, KataContestModel, KataSubmissionModel, dbState, getJSONData, saveJSONData } = models;
    const cid = contestId.toUpperCase();

    let contest = null;
    if (dbState?.useMongo) {
        contest = await KataContestModel.findOne({ contestId: cid });
    } else {
        const db = getJSONData();
        contest = (db.kataContests || []).find(c => c.contestId === cid);
    }

    if (!contest) {
        throw new Error(`Contest ${cid} not found`);
    }

    const track = contest.track || 'shin';

    // 1. Fetch all live submissions for this contest
    let liveSubmissions = [];
    if (dbState?.useMongo) {
        liveSubmissions = await KataSubmissionModel.find({
            contestId: cid,
            isLiveSubmission: true,
            isSuperseded: { $ne: true },
            isLatest: { $ne: false },
            verdict: { $nin: ['Deprecated', 'Superseded'] }
        }).lean();
    } else {
        const db = getJSONData();
        liveSubmissions = (db.kataSubmissions || []).filter(s =>
            s.contestId === cid && s.isLiveSubmission === true && !s.isSuperseded && s.verdict !== 'Deprecated' && s.verdict !== 'Superseded'
        );
    }

    // 2. Identify all candidates who actively participated (submitted at least once)
    const candidateMap = new Map();

    for (const sub of liveSubmissions) {
        const key = sub.candidateId || sub.username;
        if (!key) continue;

        if (!candidateMap.has(key)) {
            candidateMap.set(key, {
                candidateId: sub.candidateId,
                username: sub.username,
                handle: sub.handle || sub.username,
                solvedProblems: new Set(),
                totalPoints: 0,
                totalPenaltyMinutes: 0,
                submissions: []
            });
        }

        const cand = candidateMap.get(key);
        cand.submissions.push(sub);

        const isForma = contest.track === 'forma';
        const isSolvedOrScored = isForma 
            ? (sub.pointsAwarded > 0 || sub.verdict === 'Accepted')
            : (sub.verdict === 'Accepted');

        if (isSolvedOrScored) {
            if (!cand.solvedProblems.has(sub.problemLetter)) {
                cand.solvedProblems.add(sub.problemLetter);
                cand.totalPoints += (sub.pointsAwarded !== undefined && sub.pointsAwarded !== null ? sub.pointsAwarded : 100);

                // Calculate penalty time (minutes from contest/timer start)
                const candTimer = (contest.candidateTimers || []).find(t => t.candidateId === sub.candidateId);
                const startTime = candTimer?.startedAt ? new Date(candTimer.startedAt) : new Date(contest.startTime);
                const subTime = new Date(sub.submittedAt || sub.createdAt || Date.now());
                const minsFromStart = Math.max(0, Math.floor((subTime.getTime() - startTime.getTime()) / 60000));
                cand.totalPenaltyMinutes += minsFromStart;
            }
        }
    }

    // Include all registered candidates who started timer even if 0 submissions
    for (const candReg of (contest.registeredCandidates || [])) {
        const key = candReg.candidateId || candReg.username;
        if (!key) continue;
        if (!candidateMap.has(key) && candReg.startedAt) {
            candidateMap.set(key, {
                candidateId: candReg.candidateId,
                username: candReg.username,
                handle: candReg.username,
                solvedProblems: new Set(),
                totalPoints: 0,
                totalPenaltyMinutes: 0,
                submissions: []
            });
        }
    }

    if (candidateMap.size === 0) {
        console.log(`[RatingEngine] Contest ${cid} has no active participants. Skipping rating calculation.`);
        contest.ratingsCalculated = true;
        if (dbState?.useMongo) await contest.save();
        return { contestId: cid, participantsCount: 0, message: 'No participants to rate' };
    }

    // 3. Fetch each candidate's existing rating from database
    const participantsList = [];

    for (const [key, candData] of candidateMap.entries()) {
        let candidateDoc = null;
        if (dbState?.useMongo) {
            candidateDoc = await CandidateModel.findOne({
                $or: [
                    { studentId: candData.candidateId },
                    { username: candData.username },
                    { 'kataProfile.handle': candData.handle }
                ]
            });
        } else {
            const db = getJSONData();
            candidateDoc = (db.candidates || []).find(c =>
                c.studentId === candData.candidateId ||
                c.username === candData.username ||
                c.kataProfile?.handle === candData.handle
            );
        }

        const profile = candidateDoc?.kataProfile || {};
        const existingHistory = (profile.contestHistory || []).find(h => h.contestId === cid);
        const oldRating = existingHistory 
            ? (existingHistory.oldRating ?? (track === 'forma' ? (profile.formaRating || 1200) : (profile.shinRating || 1200)))
            : (track === 'forma' ? (profile.formaRating || 1200) : (profile.shinRating || 1200));

        participantsList.push({
            candidateId: candData.candidateId,
            username: candData.username,
            handle: profile.handle || candData.handle,
            candidateDoc,
            points: candData.totalPoints,
            penalty: candData.totalPenaltyMinutes,
            solvedCount: candData.solvedProblems.size,
            solvedLetters: Array.from(candData.solvedProblems),
            oldRating
        });
    }

    // 4. Sort participants into official contest standings
    // Points descending -> Penalty ascending
    participantsList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.penalty - b.penalty;
    });

    // Assign integer ranks
    participantsList.forEach((p, idx) => {
        p.rank = idx + 1;
    });

    // 5. Compute rating changes
    const ratedResults = computeRatingChanges(participantsList);

    // 6. Persist rating updates to candidates
    const contestDate = new Date(contest.endTime || Date.now());

    for (const res of ratedResults) {
        const candidate = res.candidateDoc;
        if (!candidate) continue;

        if (!candidate.kataProfile) {
            candidate.kataProfile = {};
        }

        const p = candidate.kataProfile;
        p.contestHistory = p.contestHistory || [];

        // Avoid duplicate contest history entries
        const existingHistoryIdx = p.contestHistory.findIndex(h => h.contestId === cid);
        const historyEntry = {
            contestId: cid,
            contestTitle: contest.title || cid,
            track,
            date: contestDate,
            rank: res.rank,
            oldRating: res.oldRating,
            newRating: res.newRating,
            delta: res.delta,
            isRated: true
        };

        if (existingHistoryIdx >= 0) {
            p.contestHistory[existingHistoryIdx] = historyEntry;
        } else {
            p.contestHistory.push(historyEntry);
        }

        // Update ratings, max ratings, rank tiers
        const tier = getRatingTier(res.newRating);
        if (track === 'forma') {
            p.formaRating = res.newRating;
            p.formaMaxRating = Math.max(p.formaMaxRating || 1200, res.newRating);
            p.formaRank = tier.title;
            p.formaMaxRank = getRatingTier(p.formaMaxRating).title;
        } else {
            p.shinRating = res.newRating;
            p.shinMaxRating = Math.max(p.shinMaxRating || 1200, res.newRating);
            p.shinRank = tier.title;
            p.shinMaxRank = getRatingTier(p.shinMaxRating).title;
        }

        // Increment live contest count
        p.contestsLive = (p.contestsLive || 0) + (existingHistoryIdx >= 0 ? 0 : 1);

        // Update solved stats and activity heatmap only if this contest wasn't already processed (idempotency)
        if (existingHistoryIdx < 0) {
            p.solvedStats = p.solvedStats || {};
            if (track === 'forma') {
                p.solvedStats.formaSolved = (p.solvedStats.formaSolved || 0) + res.solvedCount;
            } else {
                p.solvedStats.shinSolved = (p.solvedStats.shinSolved || 0) + res.solvedCount;
            }

            for (const letter of res.solvedLetters) {
                if (letter === 'A') p.solvedStats.easy = (p.solvedStats.easy || 0) + 1;
                else if (letter === 'B') p.solvedStats.easy = (p.solvedStats.easy || 0) + 1;
                else if (letter === 'C') p.solvedStats.medium = (p.solvedStats.medium || 0) + 1;
                else if (letter === 'D') p.solvedStats.hard = (p.solvedStats.hard || 0) + 1;
                else if (letter === 'E') p.solvedStats.boss = (p.solvedStats.boss || 0) + 1;
            }

            // Update submission heatmap
            const dayKey = contestDate.toISOString().slice(0, 10);
            if (!p.submissionHeatmap) p.submissionHeatmap = new Map();
            if (p.submissionHeatmap instanceof Map) {
                const currentCount = p.submissionHeatmap.get(dayKey) || 0;
                p.submissionHeatmap.set(dayKey, currentCount + Math.max(1, res.solvedCount));
            } else {
                p.submissionHeatmap[dayKey] = (p.submissionHeatmap[dayKey] || 0) + Math.max(1, res.solvedCount);
            }
        }

        if (dbState?.useMongo) {
            await candidate.save();
        }
    }

    if (!dbState?.useMongo) {
        saveJSONData(getJSONData());
    }

    // 7. Mark contest as ratingsCalculated
    contest.ratingsCalculated = true;
    contest.ratingsCalculatedAt = new Date();
    if (dbState?.useMongo) {
        await contest.save();
    } else {
        saveJSONData(getJSONData());
    }

    // 8. Sync TA normalized contest marks for all participants (for admin marks-ledger)
    try {
        const { syncContestNormalizedMarks } = require('./taNormalizedMarks');
        await syncContestNormalizedMarks(cid);
    } catch (normErr) {
        console.error(`[RatingEngine] Error syncing TA normalized marks for contest ${cid}:`, normErr);
    }

    console.log(`[RatingEngine] Successfully calculated and applied ratings for ${ratedResults.length} participants in contest ${cid}`);

    return {
        success: true,
        contestId: cid,
        participantsCount: ratedResults.length,
        results: ratedResults.map(r => ({
            handle: r.handle,
            rank: r.rank,
            points: r.points,
            oldRating: r.oldRating,
            newRating: r.newRating,
            delta: r.delta
        }))
    };
}

module.exports = {
    getExpectedProbability,
    getSeed,
    computeRatingChanges,
    processContestRatings
};
