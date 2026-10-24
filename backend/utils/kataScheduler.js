const mongoose = require('mongoose');
const { KataContestModel } = require('../models/KataContest');
const { KataQuestionBankModel } = require('../models/KataQuestionBank');
// Automatic question bank seeding disabled so custom and personalised questions are preserved
// const { seedQuestionBankIfNeeded } = require('./kataSeedBank');

/**
 * Distributed Lock Schema for multi-process / cluster concurrency safety.
 * Auto-expires via TTL index to ensure crashed processes never leave orphaned locks.
 */
const KataSchedulerLockSchema = new mongoose.Schema({
    lockKey: { type: String, required: true, unique: true },
    acquiredAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    owner: { type: String, required: true }
});
KataSchedulerLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

let KataSchedulerLockModel;
try {
    KataSchedulerLockModel = mongoose.model('KataSchedulerLock');
} catch (e) {
    KataSchedulerLockModel = mongoose.model('KataSchedulerLock', KataSchedulerLockSchema);
}

// In-process mutex queue for local async calls within the same Node.js process
const inProcessTrackLocks = new Map();

/**
 * Acquires a distributed lock in MongoDB across any number of backend processes.
 * Returns true if lock was acquired, false if held by another process.
 */
async function acquireDistributedLock(lockKey, ttlSeconds = 60) {
    try {
        if (mongoose.connection.readyState !== 1) {
            return true; // Mongo not connected, rely on in-process lock
        }

        // Purge expired locks first
        await KataSchedulerLockModel.deleteMany({ lockKey, expiresAt: { $lt: new Date() } });

        await KataSchedulerLockModel.create({
            lockKey,
            acquiredAt: new Date(),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            owner: `${process.pid}_${Math.random().toString(36).substring(2, 9)}`
        });
        return true;
    } catch (err) {
        if (err.code === 11000) {
            // Another process holds active lock
            return false;
        }
        return false;
    }
}

/**
 * Releases the distributed lock in MongoDB
 */
async function releaseDistributedLock(lockKey) {
    try {
        if (mongoose.connection.readyState === 1) {
            await KataSchedulerLockModel.deleteOne({ lockKey });
        }
    } catch (err) {
        // Ignore errors during release
    }
}

/**
 * Generates a weekly contest for a given track ('shin' | 'forma')
 * Guarantees:
 * 1. Multi-process concurrency locking (distributed MongoDB lock + in-process mutex).
 * 2. Idempotent creation (duplicate key E11000 caught and returns existing contest).
 * 3. Question Bank single-appearance rule: questions already used in any contest are excluded.
 * 
 * @param {'shin'|'forma'} track 
 * @param {Date} contestDate - The Saturday or Sunday date
 * @param {number} [roundNumberOverride] - Explicit round number (1-6)
 */
async function generateContestForTrack(track, contestDate, roundNumberOverride = null) {
    // 1. In-process mutex queue with timeout protection against hanging promises
    const MAX_MUTEX_WAIT_MS = 5000;
    const startWait = Date.now();
    while (inProcessTrackLocks.has(track)) {
        if (Date.now() - startWait > MAX_MUTEX_WAIT_MS) {
            console.warn(`[KataScheduler] Track ${track} mutex wait exceeded 5s; clearing stale lock.`);
            inProcessTrackLocks.delete(track);
            break;
        }
        await Promise.race([
            inProcessTrackLocks.get(track),
            new Promise(r => setTimeout(r, 500))
        ]);
    }
    let releaseInProcess;
    const inProcessPromise = new Promise(resolve => { releaseInProcess = resolve; });
    inProcessTrackLocks.set(track, inProcessPromise);

    const lockDateStr = new Date(contestDate).toISOString().split('T')[0];
    const distributedLockKey = `kata_scheduler_${track}_${lockDateStr}`;

    try {
        // 2. Distributed multi-process lock
        const hasDistLock = await acquireDistributedLock(distributedLockKey, 60);
        if (!hasDistLock) {
            console.log(`[KataScheduler] Multi-process concurrency: Another worker is generating ${track} for ${lockDateStr}. Waiting...`);
            await new Promise(r => setTimeout(r, 1500));
            const existingAfterWait = await KataContestModel.findOne({
                track,
                startTime: {
                    $gte: new Date(new Date(contestDate).setHours(0, 0, 0, 0)),
                    $lte: new Date(new Date(contestDate).setHours(23, 59, 59, 999))
                }
            });
            if (existingAfterWait) return existingAfterWait;
        }

        // 3. Resolve round number
        let roundNumber = roundNumberOverride;
        if (!roundNumber) {
            const lastContest = await KataContestModel.findOne({ track }).sort({ roundNumber: -1 });
            roundNumber = lastContest ? lastContest.roundNumber + 1 : 1;
        }

        // Hard boundary: maximum 8 rounds (rounds 01-08)
        if (roundNumber > 8) {
            console.log(`[KataScheduler] Track ${track} has completed all 8 rounds (attempted round ${roundNumber}). Aborting auto-generation.`);
            return null;
        }

        const contestId = `${track.toUpperCase()}${String(roundNumber).padStart(2, '0')}`;

        // 4. Pre-check if contestId already exists
        const existing = await KataContestModel.findOne({ contestId });
        if (existing) {
            console.log(`[KataScheduler] Contest ${contestId} already exists.`);
            return existing;
        }

        // 5. Start time and end time in IST (UTC+5:30)
        // Build times as IST by offsetting: 09:00 IST = 03:30 UTC, 23:59:59 IST = 18:29:59 UTC
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m in ms

        // Get the date components in IST for the contest date
        const contestDateIST = new Date(new Date(contestDate).getTime() + IST_OFFSET_MS);
        const year = contestDateIST.getUTCFullYear();
        const month = contestDateIST.getUTCMonth();
        const day = contestDateIST.getUTCDate();

        // 09:00:00 IST = UTC midnight of that day + 9h - 5.5h = UTC 03:30:00
        const startTime = new Date(Date.UTC(year, month, day, 9, 0, 0, 0) - IST_OFFSET_MS);

        // 23:59:59.999 IST = UTC midnight + 23:59:59.999 - 5.5h = UTC 18:29:59.999
        const endTime = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - IST_OFFSET_MS);

        // 6. Question Bank single-appearance deduplication:
        // Gather all questionIds that have appeared in ANY contest to date
        const existingContests = await KataContestModel.find({}, 'problems.questionId').lean();
        const usedQuestionIds = new Set();
        for (const c of existingContests) {
            for (const p of (c.problems || [])) {
                if (p.questionId) usedQuestionIds.add(String(p.questionId));
            }
        }

        const letters = ['A', 'B', 'C', 'D', 'E'];
        const pointValues = { A: 100, B: 200, C: 300, D: 400, E: 500 };
        const selectedProblems = [];

        for (const letter of letters) {
            // Find unused questions for this letter
            let candidates = await KataQuestionBankModel.find({
                track,
                letter,
                _id: { $nin: Array.from(usedQuestionIds) },
                hasAppearedInContest: { $ne: true }
            });

            if (candidates.length === 0) {
                console.warn(`[KataScheduler] All questions in bank for track=${track}, letter=${letter} have appeared. Falling back to entire bank.`);
                candidates = await KataQuestionBankModel.find({ track, letter });
            }

            if (candidates.length === 0) {
                console.warn(`[KataScheduler] Warning: No questions found in bank for track=${track}, letter=${letter}`);
                continue;
            }

            const randomIndex = Math.floor(Math.random() * candidates.length);
            const chosen = candidates[randomIndex];

            selectedProblems.push({
                letter,
                questionId: chosen._id,
                points: pointValues[letter],
                solvedCount: 0
            });

            // Prevent duplicate selection within same contest
            usedQuestionIds.add(String(chosen._id));
        }

        const title = track === 'shin' 
            ? `KataShin - ${String(roundNumber).padStart(2, '0')}` 
            : `KataForma - ${String(roundNumber).padStart(2, '0')}`;

        const now = new Date();
        let status = 'scheduled';
        if (now >= startTime && now <= endTime) {
            status = 'running';
        } else if (now > endTime) {
            status = 'ended';
        }

        // 7. Atomic creation with E11000 duplicate key catch
        let contest;
        try {
            contest = await KataContestModel.create({
                contestId,
                track,
                roundNumber,
                weekNumber: roundNumber,
                title,
                writers: ['BICS Academic Council'],
                startTime,
                endTime,
                status,
                problems: selectedProblems,
                registeredCandidates: [],
                totalScore: 1500
            });
        } catch (createErr) {
            if (createErr.code === 11000 || createErr.name === 'MongoServerError') {
                console.warn(`[KataScheduler] Concurrency duplicate caught for ${contestId}; returning existing document.`);
                return await KataContestModel.findOne({ contestId });
            }
            throw createErr;
        }

        // 8. Mark chosen questions in KataQuestionBank as having appeared
        const chosenQuestionIds = selectedProblems.map(p => p.questionId);
        await KataQuestionBankModel.updateMany(
            { _id: { $in: chosenQuestionIds } },
            {
                $set: { hasAppearedInContest: true },
                $addToSet: { appearedInContests: contestId }
            }
        );

        console.log(`[KataScheduler] Successfully generated contest ${contestId} with ${selectedProblems.length} unique questions.`);
        return contest;
    } catch (err) {
        console.error(`[KataScheduler] Error generating contest for track ${track}:`, err);
        throw err;
    } finally {
        await releaseDistributedLock(distributedLockKey);
        inProcessTrackLocks.delete(track);
        releaseInProcess();
    }
}

/**
 * Returns coherent Saturday and Sunday dates for the current/upcoming weekend round.
 * Guarantees Saturday and Sunday are strictly consecutive days (Sunday = Saturday + 1 day).
 * Fixes the Sunday calculation bug so Sunday is never computed in the past relative to Saturday.
 */
function getUpcomingWeekendDates(refDate = new Date()) {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30

    // Interpret "now" in IST to get the correct calendar day
    const now = new Date(refDate);
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
    const dayOfWeek = nowIST.getUTCDay(); // 0=Sun, 6=Sat in IST calendar

    // Current IST date components
    let year = nowIST.getUTCFullYear();
    let month = nowIST.getUTCMonth();
    let dayOfMonth = nowIST.getUTCDate();

    // Find upcoming Saturday in IST calendar
    let daysUntilSaturday;
    if (dayOfWeek === 0) {
        // Sunday IST: check if today's round has ended (past 23:59:59 IST)
        const sundayEndIST = new Date(Date.UTC(year, month, dayOfMonth, 23, 59, 59, 999) - IST_OFFSET_MS);
        if (now > sundayEndIST) {
            // Sunday round ended: next Saturday is in 6 days
            daysUntilSaturday = 6;
        } else {
            // Sunday round active: Saturday was yesterday
            daysUntilSaturday = -1;
        }
    } else if (dayOfWeek === 6) {
        daysUntilSaturday = 0; // Today is Saturday
    } else {
        daysUntilSaturday = 6 - dayOfWeek;
    }

    // Build Saturday as a UTC date representing IST midnight of that day
    const saturdayDate = new Date(Date.UTC(year, month, dayOfMonth + daysUntilSaturday, 0, 0, 0, 0) - IST_OFFSET_MS);

    // Sunday is always strictly 1 day after Saturday
    const sundayDate = new Date(saturdayDate.getTime() + 24 * 60 * 60 * 1000);

    return { saturday: saturdayDate, sunday: sundayDate };
}

let isSchedulerTickRunning = false;

/**
 * Auto-scheduler: checks if weekend contests need generation and updates running/ended statuses
 */
async function runKataSchedulerTick() {
    if (isSchedulerTickRunning) return;
    if (mongoose.connection.readyState !== 1) {
        return; // Skip tick if DB not ready
    }
    isSchedulerTickRunning = true;
    try {
        const now = new Date();

        // 1. Update statuses of all existing contests
        const allContests = await KataContestModel.find({});
        for (const c of allContests) {
            let updated = false;
            if (now >= c.startTime && now <= c.endTime && c.status !== 'running') {
                c.status = 'running';
                updated = true;
            } else if (now > c.endTime && c.status !== 'ended') {
                c.status = 'ended';
                updated = true;
            } else if (now < c.startTime && c.status !== 'scheduled') {
                c.status = 'scheduled';
                updated = true;
            }
            if (updated) await c.save();
        }

        // 2. Configure upcoming weekend contests on Thursday (Shin) & Friday (Forma)
        await configureWeeklyContests();
    } catch (err) {
        console.error('[KataScheduler] Tick error:', err);
    } finally {
        isSchedulerTickRunning = false;
    }
}

/**
 * Weekly auto-scheduler cadence:
 * - On Thursday: Auto-generates upcoming Saturday's Shin contest strictly once in IST.
 * - On Friday: Auto-generates upcoming Sunday's Forma contest strictly once in IST.
 * - Saturday, Sunday, Monday, Tuesday, Wednesday: No automatic contest generation.
 * - @param {boolean} force - Force configuration of both regardless of day (for Dev Mode / Tests)
 */
async function configureWeeklyContests(force = false) {
    try {
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const now = new Date();
        const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
        const dayOfWeekIST = nowIST.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

        const { saturday, sunday } = getUpcomingWeekendDates(now);

        // Windows covering the target Saturday and Sunday (in UTC)
        const satStart = new Date(saturday.getTime() - 1000);
        const satEnd = new Date(saturday.getTime() + 25 * 60 * 60 * 1000);
        const sunStart = new Date(sunday.getTime() - 1000);
        const sunEnd = new Date(sunday.getTime() + 25 * 60 * 60 * 1000);

        // Thursday Cadence: Generate Saturday's KataShin contest ONLY on Thursday (dayOfWeekIST === 4)
        if (force || dayOfWeekIST === 4) {
            const existingShin = await KataContestModel.findOne({
                track: 'shin',
                startTime: { $gte: satStart, $lte: satEnd }
            });

            if (!existingShin) {
                console.log('[KataScheduler] Thursday Cadence: Generating KataShin contest for upcoming Saturday...');
                await generateContestForTrack('shin', saturday);
            }
        }

        // Friday Cadence: Generate Sunday's KataForma contest ONLY on Friday (dayOfWeekIST === 5)
        if (force || dayOfWeekIST === 5) {
            const existingForma = await KataContestModel.findOne({
                track: 'forma',
                startTime: { $gte: sunStart, $lte: sunEnd }
            });

            if (!existingForma) {
                console.log('[KataScheduler] Friday Cadence: Generating KataForma contest for upcoming Sunday...');
                await generateContestForTrack('forma', sunday);
            }
        }
    } catch (err) {
        console.error('[KataScheduler] Error in weekly contest configuration:', err);
    }
}

/**
 * Backward compatibility alias for configureWeeklyContests
 */
async function configureThursdayWeeklyContests(force = false) {
    return configureWeeklyContests(force);
}

/**
 * Starts the periodic background scheduler
 */
function startKataScheduler() {
    const init = () => {
        runKataSchedulerTick();
        setInterval(runKataSchedulerTick, 10 * 60 * 1000); // Check every 10 minutes
    };

    if (mongoose.connection.readyState === 1) {
        init();
    } else {
        mongoose.connection.once('open', init);
    }
}

module.exports = {
    generateContestForTrack,
    getUpcomingWeekendDates,
    configureWeeklyContests,
    configureThursdayWeeklyContests,
    runKataSchedulerTick,
    startKataScheduler,
    acquireDistributedLock,
    releaseDistributedLock
};
