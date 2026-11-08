/**
 * Submission Data Model Migrator & Multi-ID Resolver Helper
 * Backfills unique 12-digit numeric submissionRefId and locks initialScore on historical answers.
 */

const { TestSubmissionModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { generateSubmissionRefId, isSubmissionRefId, isBicsId, toMongoId, resolveToObjectId } = require('./bicsId');
const mongoose = require('mongoose');

/**
 * Ensures all historical submissions have a unique 12-digit numeric submissionRefId
 */
async function ensureSubmissionRefIds() {
    try {
        if (dbState.useMongo) {
            const missingSubs = await TestSubmissionModel.find({
                $or: [
                    { submissionRefId: { $exists: false } },
                    { submissionRefId: null },
                    { submissionRefId: '' }
                ]
            }).limit(200);

            if (missingSubs.length > 0) {
                console.log(`[MIGRATOR] Found ${missingSubs.length} submissions lacking 12-digit submissionRefId. Backfilling...`);
                for (const sub of missingSubs) {
                    let refId = generateSubmissionRefId();
                    // Ensure collision check
                    let existing = await TestSubmissionModel.findOne({ submissionRefId: refId });
                    while (existing) {
                        refId = generateSubmissionRefId();
                        existing = await TestSubmissionModel.findOne({ submissionRefId: refId });
                    }
                    sub.submissionRefId = refId;

                    // Ensure initialScore on historical answers
                    if (Array.isArray(sub.answers)) {
                        sub.answers.forEach(ans => {
                            if (ans.initialScore === null || ans.initialScore === undefined) {
                                ans.initialScore = typeof ans.score === 'number' ? ans.score : 0;
                            }
                        });
                    }

                    await sub.save();
                }
                console.log(`[MIGRATOR] Successfully backfilled 12-digit submissionRefId for ${missingSubs.length} submissions.`);
                return missingSubs.length;
            }
            return 0;
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            let updated = 0;
            const seen = new Set(db.testSubmissions.map(s => s.submissionRefId).filter(Boolean));

            db.testSubmissions.forEach(sub => {
                if (!sub.submissionRefId || !/^\d{12}$/.test(String(sub.submissionRefId))) {
                    let refId = generateSubmissionRefId();
                    while (seen.has(refId)) {
                        refId = generateSubmissionRefId();
                    }
                    seen.add(refId);
                    sub.submissionRefId = refId;
                    updated++;
                }

                if (Array.isArray(sub.answers)) {
                    sub.answers.forEach(ans => {
                        if (ans.initialScore === null || ans.initialScore === undefined) {
                            ans.initialScore = typeof ans.score === 'number' ? ans.score : 0;
                        }
                    });
                }
            });

            if (updated > 0) {
                saveJSONData(db);
                console.log(`[MIGRATOR] (JSON DB) Backfilled 12-digit submissionRefId for ${updated} submissions.`);
            }
            return updated;
        }
    } catch (err) {
        console.warn('[MIGRATOR] Notice during submissionRefId migration:', err.message);
        return 0;
    }
}

/**
 * Universal Multi-ID Submission Finder
 * Resolves submissions by 12-digit numeric Ref ID, BICS encrypted ID, or MongoDB ObjectId
 */
async function findSubmissionByAnyId(idParam) {
    if (!idParam) return null;
    const strId = String(idParam).trim();

    if (dbState.useMongo) {
        // 1. Direct 12-digit numeric Reference ID lookup
        if (isSubmissionRefId(strId)) {
            const sub = await TestSubmissionModel.findOne({ submissionRefId: strId }).lean();
            if (sub) return sub;
        }

        // 2. Decrypt BICS ObjId if encrypted
        let targetMongoId = strId;
        if (isBicsId(strId)) {
            const decrypted = toMongoId(strId);
            if (decrypted) targetMongoId = decrypted;
        }

        // 3. Hex ObjectId lookup
        if (mongoose.Types.ObjectId.isValid(targetMongoId)) {
            const sub = await TestSubmissionModel.findById(targetMongoId).lean();
            if (sub) return sub;
        }

        // 4. Secondary fallback match
        return await TestSubmissionModel.findOne({
            $or: [
                { _id: targetMongoId },
                { id: strId },
                { submissionRefId: strId }
            ]
        }).lean();
    } else {
        const db = getJSONData();
        const subs = db.testSubmissions || [];
        return subs.find(s => 
            String(s.submissionRefId) === strId ||
            String(s._id || s.id) === strId ||
            String(s._id || s.id) === resolveToObjectId(strId)
        ) || null;
    }
}

module.exports = {
    ensureSubmissionRefIds,
    findSubmissionByAnyId
};
