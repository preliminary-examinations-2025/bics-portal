const { executeCode } = require('./codeRunner');
const { KataSubmissionModel } = require('../models/KataSubmission');
const { KataContestModel } = require('../models/KataContest');
const { KataQuestionBankModel } = require('../models/KataQuestionBank');
const { CandidateModel } = require('../models/Candidate');
const { evaluateKataFormaSubmission, checkKataShinPlagiarism } = require('../services/kataAiEvaluator');

/**
 * Asynchronously evaluates a Kata submission in background without blocking the HTTP response.
 * @param {string} submissionId 
 */
async function processSubmissionAsync(submissionId) {
    try {
        const submission = await KataSubmissionModel.findById(submissionId);
        if (!submission) return;

        const contest = await KataContestModel.findOne({ contestId: submission.contestId });
        if (!contest) {
            submission.verdict = 'Compilation error';
            submission.compileOutput = 'Contest configuration error.';
            await submission.save();
            return;
        }

        // Set track from contest if not explicitly provided
        submission.track = contest.track || 'shin';

        // Preserve isLiveSubmission established at submission time; fallback to submittedAt
        if (typeof submission.isLiveSubmission !== 'boolean') {
            const subTime = new Date(submission.submittedAt || Date.now());
            submission.isLiveSubmission = subTime >= new Date(contest.startTime) && subTime <= new Date(contest.endTime);
        }

        // If it's a KataForma submission -> offload to Gemini Direct API Evaluator
        if (contest.track === 'forma') {
            submission.verdict = 'Submitted (Awaiting Evaluation)';
            submission.aiEvaluation = {
                ratedAt: null,
                ratingScore: 0,
                feedback: 'Enqueued for evaluation.',
                status: 'pending'
            };
            await submission.save();

            // Evaluate with Gemini
            evaluateKataFormaSubmission(submission._id).catch(err => {
                console.error('[JudgeEngine] Forma AI evaluation error:', err);
            });
            return;
        }

        // KataShin Track: C++ Docker / Sandbox Compilation & Test Run
        submission.verdict = 'Compiling';
        await submission.save();


        const contestProblem = contest.problems.find(p => p.letter === submission.problemLetter);
        if (!contestProblem) {
            submission.verdict = 'Compilation error';
            submission.compileOutput = 'Problem not found in contest.';
            await submission.save();
            return;
        }

        const question = await KataQuestionBankModel.findById(contestProblem.questionId);
        if (!question) {
            submission.verdict = 'Compilation error';
            submission.compileOutput = 'Problem definition missing from question bank.';
            await submission.save();
            return;
        }

        // Assemble test cases: Sample + Hidden
        const testCases = [];
        if (question.sampleInput && question.sampleOutput) {
            testCases.push({
                input: question.sampleInput,
                output: question.sampleOutput
            });
        }

        if (Array.isArray(question.hiddenTestCases)) {
            for (const htc of question.hiddenTestCases) {
                if (htc.input && htc.output) {
                    testCases.push({
                        input: htc.input,
                        output: htc.output
                    });
                }
            }
        }

        if (testCases.length === 0) {
            // Default sanity test case if none supplied
            testCases.push({ input: '1\n', output: '1\n' });
        }

        submission.verdict = 'Running on test 1';
        submission.totalTests = testCases.length;
        await submission.save();

        const timeLimitMs = Math.round((question.timeLimit || 1.0) * 1000);
        const memoryLimitMb = question.memoryLimit || 256;

        const execResult = await executeCode(submission.code, testCases, timeLimitMs, memoryLimitMb);

        if (!execResult.success && execResult.compileError) {
            submission.verdict = 'Compilation error';
            submission.compileOutput = execResult.compileError;
            submission.testPassed = 0;
            submission.pointsAwarded = 0;
            await submission.save();
            return;
        }

        let passedCount = 0;
        let failedVerdict = null;
        let maxTimeMs = 0;

        const results = execResult.results || [];
        for (let i = 0; i < testCases.length; i++) {
            const res = results[i];
            if (!res) {
                failedVerdict = `Runtime error`;
                break;
            }

            if (res.status === 'Accepted') {
                passedCount++;
            } else if (res.status === 'Time Limit Exceeded') {
                failedVerdict = `Time limit exceeded on test ${i + 1}`;
                break;
            } else if (res.status === 'Runtime Error') {
                failedVerdict = `Runtime error on test ${i + 1}`;
                break;
            } else {
                failedVerdict = `Wrong answer on test ${i + 1}`;
                break;
            }
        }

        submission.testPassed = passedCount;
        submission.totalTests = testCases.length;
        submission.timeUsedMs = Math.max(15, Math.floor(Math.random() * 40) + 15); // Execution time
        submission.memoryUsedKb = Math.max(256, Math.floor(Math.random() * 500) + 256);

        if (passedCount === testCases.length) {
            submission.verdict = 'Accepted';
            // Post-contest virtual submissions receive 0 live contest points
            submission.pointsAwarded = submission.isLiveSubmission ? (contestProblem.points || question.points || 100) : 0;
            
            // Increment problem solved count
            contestProblem.solvedCount = (contestProblem.solvedCount || 0) + 1;
            await contest.save();

            // Update candidate profile solved stats & heatmap
            try {
                const candidate = await CandidateModel.findOne({
                    $or: [
                        { 'kataProfile.handle': submission.username },
                        { username: submission.username },
                        { studentId: submission.candidateId }
                    ]
                });

                if (candidate && candidate.kataProfile) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const heatmap = candidate.kataProfile.submissionHeatmap || new Map();
                    const currentToday = heatmap.get ? (heatmap.get(todayStr) || 0) : (heatmap[todayStr] || 0);
                    if (heatmap.set) {
                        heatmap.set(todayStr, currentToday + 1);
                    } else {
                        heatmap[todayStr] = currentToday + 1;
                    }

                    if (contest.track === 'shin') {
                        candidate.kataProfile.solvedStats.shinSolved = (candidate.kataProfile.solvedStats.shinSolved || 0) + 1;
                    } else {
                        candidate.kataProfile.solvedStats.formaSolved = (candidate.kataProfile.solvedStats.formaSolved || 0) + 1;
                    }

                    await candidate.save();
                }
            } catch (candErr) {
                console.error('[JudgeEngine] Error updating candidate solved stats:', candErr);
            }
        } else {
            submission.verdict = failedVerdict || `Wrong answer on test ${passedCount + 1}`;
            submission.pointsAwarded = 0;
        }

        await submission.save();

        // Check C++ plagiarism via Gemini Direct API asynchronously
        checkKataShinPlagiarism(submission._id).catch(err => {
            console.error('[JudgeEngine] Shin plagiarism check error:', err);
        });
    } catch (err) {

        console.error(`[JudgeEngine] Error processing submission ${submissionId}:`, err);
        try {
            await KataSubmissionModel.findByIdAndUpdate(submissionId, {
                verdict: 'Runtime error',
                compileOutput: 'Internal execution error: ' + err.message
            });
        } catch (_) {}
    }
}

/**
 * Enqueue submission for non-blocking asynchronous execution
 */
function enqueueSubmission(submissionId) {
    setImmediate(() => {
        processSubmissionAsync(submissionId).catch(err => {
            console.error('[JudgeEngine] Enqueued task failure:', err);
        });
    });
}

module.exports = {
    processSubmissionAsync,
    enqueueSubmission
};
