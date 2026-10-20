const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { KataQuestionBankModel } = require('../models/KataQuestionBank');
const { KataContestModel } = require('../models/KataContest');
const { seedQuestionBankIfNeeded } = require('./kataSeedBank');

async function syncQuestionBank() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/bics_db';
        await mongoose.connect(mongoUri);
        console.log('[Sync] Connected to MongoDB.');

        // 1. Delete legacy duplicate forma questions
        const delForma = await KataQuestionBankModel.deleteMany({ track: 'forma' });
        console.log(`[Sync] Deleted ${delForma.deletedCount} legacy forma entries.`);

        // 2. Seed 40 Shin + 40 Forma questions (8 in A-E each)
        await seedQuestionBankIfNeeded();

        // 3. Remove pre-generated future contests (only keep current week's SHIN01 and FORMA01)
        const futureContests = ['SHIN02', 'FORMA02', 'SHIN03', 'FORMA03', 'SHIN04', 'FORMA04', 'SHIN05', 'FORMA05', 'SHIN06', 'FORMA06'];
        const delContests = await KataContestModel.deleteMany({ contestId: { $in: futureContests } });
        console.log(`[Sync] Removed ${delContests.deletedCount} future pre-generated contests.`);

        // 4. Re-configure FORMA01 to pick random questions from the fresh Forma bank
        const forma01 = await KataContestModel.findOne({ contestId: 'FORMA01' });
        if (forma01) {
            const letters = ['A', 'B', 'C', 'D', 'E'];
            const pointValues = { A: 100, B: 200, C: 300, D: 400, E: 500 };
            const newProblems = [];
            for (const l of letters) {
                const pool = await KataQuestionBankModel.find({ track: 'forma', letter: l });
                if (pool.length > 0) {
                    const chosen = pool[Math.floor(Math.random() * pool.length)];
                    newProblems.push({
                        letter: l,
                        questionId: chosen._id,
                        points: pointValues[l],
                        solvedCount: 0
                    });
                }
            }
            forma01.problems = newProblems;
            await forma01.save();
            console.log(`[Sync] Re-rolled FORMA01 problems with HTML/CSS/JS challenges: ${newProblems.length} problems.`);
        }

        const totalQ = await KataQuestionBankModel.countDocuments();
        const shinQ = await KataQuestionBankModel.countDocuments({ track: 'shin' });
        const formaQ = await KataQuestionBankModel.countDocuments({ track: 'forma' });
        console.log(`[Sync] Question Bank Totals -> Total: ${totalQ} (Shin: ${shinQ}, Forma: ${formaQ})`);

        const activeContests = await KataContestModel.find({}, 'contestId track status startTime');
        console.log('[Sync] Active Contests in Database:', activeContests);

        process.exit(0);
    } catch (err) {
        console.error('[Sync] Error:', err);
        process.exit(1);
    }
}

syncQuestionBank();
