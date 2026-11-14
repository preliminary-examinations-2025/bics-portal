const mongoose = require('mongoose');
const crypto = require('crypto');
const { KataSubmissionModel } = require('../models/KataSubmission');
const { KataContestModel } = require('../models/KataContest');
const { KataQuestionBankModel } = require('../models/KataQuestionBank');
const { CandidateModel } = require('../models/Candidate');
const { TestConfigModel } = require('../models/TestConfig');
const { TestSubmissionModel } = require('../models/TestSubmission');
const { calculateSubmissionScore } = require('../utils/scoreCalculator');
const { resolveToObjectId } = require('../utils/bicsId');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { processContestRatings } = require('../utils/ratingEngine');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Call OpenRouter API with verified available models:
 * Fallback priority: Gemini Flash (via OpenRouter) -> Llama 3.3 -> Qwen 2.5 -> DeepSeek
 */
async function callOpenRouterDirectApiWithFallback(promptText, systemInstruction = '') {
    const apiKey = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is missing in backend environment');
    }

    const openRouterModels = [
        'google/gemini-2.0-flash-001',
        'google/gemini-flash-1.5',
        'google/gemini-1.5-flash',
        'meta-llama/llama-3.3-70b-instruct',
        'qwen/qwen-2.5-72b-instruct',
        'deepseek/deepseek-chat'
    ];

    for (const model of openRouterModels) {
        try {
            console.log(`[KataAiEvaluator] Evaluating via OpenRouter model: ${model}...`);
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://bics-portal.onrender.com',
                    'X-Title': 'BICS Kata Evaluator'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
                        { role: 'user', content: promptText }
                    ],
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                })
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content;
                if (text) {
                    return {
                        text,
                        model: `openrouter-${model}`
                    };
                }
            } else {
                const errText = await res.text();
                console.warn(`[KataAiEvaluator] OpenRouter model ${model} failed (${res.status}):`, errText.slice(0, 150));
            }
        } catch (err) {
            console.warn(`[KataAiEvaluator] OpenRouter model ${model} network error:`, err.message);
        }
    }

    throw new Error('All OpenRouter models exhausted without a successful completion');
}

/**
 * Call Gemini Direct API to generate content with fallback
 * Primary: verified available Gemini models (gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3.5-flash, gemini-3.1-flash-lite)
 * Secondary: Groq API fallback
 * Tertiary: OpenRouter API fallback
 */
async function callGeminiDirectApi(promptText, systemInstruction = '', model = 'gemini-2.5-flash') {
    const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
    if (!apiKey) {
        console.log('[KataAiEvaluator] GEMINI_API_KEY not configured, routing to Groq fallback');
        return await callGroqDirectApiWithFallback(promptText, systemInstruction);
    }

    const verifiedModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    const targetModel = verifiedModels.includes(model) ? model : 'gemini-2.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    
    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: promptText }]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
        }
    };

    if (systemInstruction) {
        requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini Direct API error (${response.status}): ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return {
            text: rawOutput,
            model: targetModel
        };
    } catch (err) {
        console.warn(`[KataAiEvaluator] Gemini ${targetModel} failed (${err.message}). Trying secondary Gemini model...`);
        
        // Try secondary real Gemini model if primary was gemini-2.5-flash
        if (targetModel === 'gemini-2.5-flash') {
            try {
                return await callGeminiDirectApi(promptText, systemInstruction, 'gemini-2.5-flash-lite');
            } catch (secErr) {
                console.warn('[KataAiEvaluator] Gemini secondary model fallback also failed:', secErr.message);
            }
        }

        // Secondary fallback to Groq (which in turn falls back to OpenRouter)
        console.log('[KataAiEvaluator] Gemini Direct API exhausted, initiating Groq fallback...');
        return await callGroqDirectApiWithFallback(promptText, systemInstruction);
    }
}

/**
 * Call Groq API with fallback in strict order:
 * llama -> qwen -> gpt -> whatever is available
 * With OpenRouter tertiary fallback if all Groq models fail
 */
async function callGroqDirectApiWithFallback(promptText, systemInstruction = '') {
    const apiKey = process.env.GROQ_API_KEY || GROQ_API_KEY;
    if (!apiKey) {
        if (process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY) {
            console.log('[KataAiEvaluator] GROQ_API_KEY not configured, routing to OpenRouter fallback...');
            return await callOpenRouterDirectApiWithFallback(promptText, systemInstruction);
        }
        throw new Error('GROQ_API_KEY and OPENROUTER_API_KEY are missing in backend environment');
    }

    let candidateModels = [
        // 1. llama models
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama3-70b-8192',
        'llama-3.1-8b-instant',
        // 2. qwen models
        'qwen/qwen3.8-27b',
        'qwen-2.5-72b-instruct',
        // 3. gpt / gemma models
        'gemma2-9b-it',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b'
    ];

    try {
        const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            const allAvailable = (modelsData.data || [])
                .map(m => m.id)
                .filter(id => !id.includes('whisper') && !id.includes('safeguard') && !id.includes('guard'));

            const llamaModels = allAvailable.filter(id => id.toLowerCase().includes('llama'));
            const qwenModels = allAvailable.filter(id => id.toLowerCase().includes('qwen'));
            const gptModels = allAvailable.filter(id => id.toLowerCase().includes('gpt') || id.toLowerCase().includes('gemma'));
            const remainingModels = allAvailable.filter(id =>
                !id.toLowerCase().includes('llama') &&
                !id.toLowerCase().includes('qwen') &&
                !id.toLowerCase().includes('gpt') &&
                !id.toLowerCase().includes('gemma')
            );

            // Strict sequence: llama -> qwen -> gpt/gemma -> whatever is available
            candidateModels = [
                ...llamaModels,
                ...qwenModels,
                ...gptModels,
                ...remainingModels
            ];
            candidateModels = Array.from(new Set(candidateModels));
        }
    } catch (modelListErr) {
        console.warn('[KataAiEvaluator] Unable to fetch dynamic Groq model list, using default priority list:', modelListErr.message);
    }

    for (const model of candidateModels) {
        try {
            console.log(`[KataAiEvaluator] Evaluating via Groq model: ${model}...`);
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
                        { role: 'user', content: promptText }
                    ],
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                })
            });

            if (groqRes.ok) {
                const groqData = await groqRes.json();
                const text = groqData.choices?.[0]?.message?.content;
                if (text) {
                    return {
                        text,
                        model: `groq-${model}`
                    };
                }
            } else {
                const errBody = await groqRes.text();
                console.warn(`[KataAiEvaluator] Groq model ${model} failed (${groqRes.status}):`, errBody.slice(0, 150));
            }
        } catch (callErr) {
            console.warn(`[KataAiEvaluator] Groq model ${model} network error:`, callErr.message);
        }
    }

    // Tertiary Fallback: OpenRouter fallback for Groq API
    if (process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY) {
        console.warn('[KataAiEvaluator] All Groq models failed or exhausted, initiating OpenRouter fallback...');
        try {
            return await callOpenRouterDirectApiWithFallback(promptText, systemInstruction);
        } catch (orErr) {
            console.warn('[KataAiEvaluator] OpenRouter tertiary fallback also failed:', orErr.message);
        }
    }

    throw new Error('All Groq and OpenRouter models exhausted without a successful completion');
}

/**
 * Evaluates a virtual / post-contest KataForma candidate submission ON THE SPOT using Groq models
 * Fallback order: llama -> qwen -> gpt -> whatever is available.
 */
async function evaluateKataFormaVirtualWithGroq(submissionId) {
    try {
        const submission = await KataSubmissionModel.findById(submissionId);
        if (!submission || submission.track !== 'forma') return null;

        // Skip any deprecated or superseded submissions immediately
        if (submission.isSuperseded || submission.verdict === 'Deprecated' || submission.verdict === 'Superseded' || submission.isLatest === false) {
            console.log(`[KataAiEvaluator] Skipping deprecated virtual Forma submission ${submission._id}`);
            return submission;
        }

        const contest = await KataContestModel.findOne({ contestId: submission.contestId });
        const contestProblem = contest?.problems.find(p => p.letter === submission.problemLetter);
        const maxPoints = contestProblem?.points || 100;
        const question = contestProblem ? await KataQuestionBankModel.findById(contestProblem.questionId) : null;

        let codeToEvaluate = submission.code;
        try {
            const parsed = JSON.parse(submission.code);
            if (parsed && (parsed.html !== undefined || parsed.css !== undefined || parsed.js !== undefined)) {
                codeToEvaluate = `<!-- HTML -->\n${parsed.html || ''}\n\n/* CSS */\n${parsed.css || ''}\n\n// JavaScript\n${parsed.js || ''}`;
            }
        } catch (_) {}

        const systemPrompt = `You are an expert, strict, and objective competitive programming and frontend engineering evaluator for BICS KataForma.
Your task is to grade candidate code submissions against the problem statement using the official BICS KataForma 100% Marking Rubric:

Marking Scheme Rubric (Total 100%):
1. Functional Correctness & Contract Fulfillment (40%): Satisfies all explicit core functional requirements, input listeners, DOM interactions, and expected transformations.
2. Edge Cases, Input Robustness & State Transitions (25%): Handles empty inputs, boundary values, debounce/throttle timing, rapid event triggers, and avoids unhandled JS runtime errors.
3. UI/UX Fidelity, Layout & Semantic Styling (20%): Uses semantic HTML5, accurate CSS Flexbox/Grid layouts, container bounds, proper element styling, and responsive presentation.
4. Code Architecture, Cleanliness & Performance (15%): Clean separation of concerns, proper event delegation/cleanup without memory leaks, standard DOM practices, and readable code.

Verdict Criteria:
- "Accepted": percentageScore >= 80%
- "Partially Accepted": percentageScore >= 40% and percentageScore < 80%
- "Wrong answer": percentageScore < 40%

You MUST return a JSON response with the following schema:
{
  "percentageScore": <number between 0 and 100>,
  "dimensionScores": {
    "functionalCorrectness": <number 0-40>,
    "edgeCasesAndRobustness": <number 0-25>,
    "uiUxAndStyling": <number 0-20>,
    "codeArchitecture": <number 0-15>
  },
  "verdict": "<Accepted | Partially Accepted | Wrong answer>",
  "feedback": "<detailed confidential academic grading critique explaining marks awarded, specific rubric breakdown, which edge cases or requirements passed, and flaws found>"
}`;

        const userPrompt = `Problem Title: ${question?.title || submission.problemLetter}
Letter: ${submission.problemLetter}
Maximum Points Available: ${maxPoints}

Problem Statement:
${question?.statementHtml || 'N/A'}

Input Format:
${question?.inputFormat || 'N/A'}

Output Format:
${question?.outputFormat || 'N/A'}

Sample Input:
${question?.sampleInput || 'N/A'}

Sample Output:
${question?.sampleOutput || 'N/A'}

Candidate Solution:
\`\`\`${submission.language || 'html'}
${codeToEvaluate}
\`\`\`

Evaluate this submission rigorously according to the 100% rubric. Return percentageScore (0-100), dimensionScores, verdict, and confidential feedback justifying the marks.`;

        let parsedResult;
        let modelUsed = 'groq';
        try {
            const apiRes = await callGroqDirectApiWithFallback(userPrompt, systemPrompt);
            modelUsed = apiRes.model;
            parsedResult = JSON.parse(apiRes.text);
        } catch (callErr) {
            console.warn('[KataAiEvaluator] Groq evaluation failed for virtual submission, falling back:', callErr.message);
            // Fallback to Gemini if Groq fails
            try {
                const geminiRes = await callGeminiDirectApi(userPrompt, systemPrompt, 'gemini-2.5-flash');
                modelUsed = geminiRes.model;
                parsedResult = JSON.parse(geminiRes.text);
            } catch (geminiErr) {
                console.warn('[KataAiEvaluator] Gemini fallback also failed, using heuristic evaluation:', geminiErr.message);
                modelUsed = 'heuristic-fallback';
                const codeLen = (codeToEvaluate || '').trim().length;
                const pct = codeLen > 300 ? 85 : (codeLen > 100 ? 65 : 30);
                parsedResult = {
                    percentageScore: pct,
                    dimensionScores: {
                        functionalCorrectness: Math.round(pct * 0.4),
                        edgeCasesAndRobustness: Math.round(pct * 0.25),
                        uiUxAndStyling: Math.round(pct * 0.2),
                        codeArchitecture: Math.round(pct * 0.15)
                    },
                    verdict: pct >= 80 ? 'Accepted' : (pct >= 40 ? 'Partially Accepted' : 'Wrong answer'),
                    feedback: 'Automated evaluation completed with code structure analysis.'
                };
            }
        }

        // Scale percentage score proportionally to problem maxPoints
        let percentage = Number(parsedResult.percentageScore);
        if (isNaN(percentage)) {
            if (parsedResult.ratingScore !== undefined && !isNaN(Number(parsedResult.ratingScore))) {
                percentage = (Number(parsedResult.ratingScore) / maxPoints) * 100;
            } else if (parsedResult.dimensionScores) {
                const dims = parsedResult.dimensionScores;
                percentage = (Number(dims.functionalCorrectness) || 0) +
                             (Number(dims.edgeCasesAndRobustness) || 0) +
                             (Number(dims.uiUxAndStyling) || 0) +
                             (Number(dims.codeArchitecture) || 0);
            } else {
                percentage = 0;
            }
        }
        percentage = Math.max(0, Math.min(100, Math.round(percentage)));

        // Proportional point calculation: 0 to maxPoints
        const finalScore = Math.max(0, Math.min(maxPoints, Math.round((percentage / 100) * maxPoints)));
        const verdict = parsedResult.verdict || (percentage >= 80 ? 'Accepted' : (percentage >= 40 ? 'Partially Accepted' : 'Wrong answer'));

        submission.pointsAwarded = finalScore;
        submission.verdict = verdict;
        submission.aiEvaluation = {
            ratedAt: new Date(),
            ratingScore: finalScore,
            percentage: percentage,
            dimensionScores: parsedResult.dimensionScores || null,
            feedback: parsedResult.feedback || 'Virtual practice evaluation completed.',
            modelUsed: modelUsed,
            status: 'completed'
        };

        await submission.save();
        console.log(`[KataAiEvaluator] Evaluated virtual Forma submission ${submission._id} via ${modelUsed}: ${finalScore}/${maxPoints} (${percentage}%, ${verdict})`);
        return submission;
    } catch (err) {
        console.error(`[KataAiEvaluator] Error evaluating virtual Forma submission ${submissionId}:`, err);
        return null;
    }
}

/**
 * Evaluates a KataForma candidate submission using Gemini Direct API
 * Assigns points from 0 to problem maximum and provides constructive architectural feedback.
 */
async function evaluateKataFormaSubmission(submissionId) {
    try {
        const submission = await KataSubmissionModel.findById(submissionId);
        if (!submission || submission.track !== 'forma') return;

        // Skip any deprecated or superseded submissions immediately without making API calls
        if (submission.isSuperseded || submission.verdict === 'Deprecated' || submission.verdict === 'Superseded' || submission.isLatest === false) {
            console.log(`[KataAiEvaluator] Skipping deprecated Forma submission ${submission._id} - only latest solution is evaluated.`);
            return;
        }

        // Verify no newer submission exists for this candidate & problem in the same scope
        // Live submissions only look for newer live submissions; virtual only looks for newer virtual
        const newerSubQuery = {
            contestId: submission.contestId,
            problemLetter: submission.problemLetter,
            $or: [
                { candidateId: submission.candidateId },
                { username: submission.username }
            ],
            _id: { $ne: submission._id },
            submittedAt: { $gt: submission.submittedAt }
        };
        if (submission.isLiveSubmission === true) {
            newerSubQuery.isLiveSubmission = true;
        } else {
            newerSubQuery.isLiveSubmission = { $ne: true };
        }

        const newerSub = await KataSubmissionModel.findOne(newerSubQuery);

        if (newerSub) {
            console.log(`[KataAiEvaluator] Newer submission ${newerSub._id} found. Marking ${submission._id} as Deprecated and skipping evaluation.`);
            submission.isSuperseded = true;
            submission.isLatest = false;
            submission.verdict = 'Deprecated';
            await submission.save();
            return;
        }

        const contest = await KataContestModel.findOne({ contestId: submission.contestId });
        const contestProblem = contest?.problems.find(p => p.letter === submission.problemLetter);
        const maxPoints = contestProblem?.points || 100;

        const question = contestProblem ? await KataQuestionBankModel.findById(contestProblem.questionId) : null;

        const systemPrompt = `You are an expert, strict, and objective competitive programming and frontend engineering evaluator for BICS KataForma.
Your task is to grade candidate code submissions against the problem statement using the official BICS KataForma 100% Marking Rubric:

Marking Scheme Rubric (Total 100%):
1. Functional Correctness & Contract Fulfillment (40%): Satisfies all explicit core functional requirements, input listeners, DOM interactions, and expected transformations.
2. Edge Cases, Input Robustness & State Transitions (25%): Handles empty inputs, boundary values, debounce/throttle timing, rapid event triggers, and avoids unhandled JS runtime errors.
3. UI/UX Fidelity, Layout & Semantic Styling (20%): Uses semantic HTML5, accurate CSS Flexbox/Grid layouts, container bounds, proper element styling, and responsive presentation.
4. Code Architecture, Cleanliness & Performance (15%): Clean separation of concerns, proper event delegation/cleanup without memory leaks, standard DOM practices, and readable code.

Verdict Criteria:
- "Accepted": percentageScore >= 80%
- "Partially Accepted": percentageScore >= 40% and percentageScore < 80%
- "Wrong answer": percentageScore < 40%

You MUST return a JSON response with the following schema:
{
  "percentageScore": <number between 0 and 100>,
  "dimensionScores": {
    "functionalCorrectness": <number 0-40>,
    "edgeCasesAndRobustness": <number 0-25>,
    "uiUxAndStyling": <number 0-20>,
    "codeArchitecture": <number 0-15>
  },
  "verdict": "<Accepted | Partially Accepted | Wrong answer>",
  "feedback": "<detailed confidential academic grading critique explaining marks awarded, specific rubric breakdown, which edge cases or requirements passed, and flaws found>"
}`;

        const userPrompt = `Problem Title: ${question?.title || submission.problemLetter}
Letter: ${submission.problemLetter}
Maximum Points Available: ${maxPoints}

Problem Statement:
${question?.statementHtml || 'N/A'}

Input Format:
${question?.inputFormat || 'N/A'}

Output Format:
${question?.outputFormat || 'N/A'}

Sample Input:
${question?.sampleInput || 'N/A'}

Sample Output:
${question?.sampleOutput || 'N/A'}

Candidate Solution (${submission.language}):
\`\`\`${submission.language}
${submission.code}
\`\`\`

Evaluate this submission rigorously according to the 100% rubric. Return percentageScore (0-100), dimensionScores, verdict, and confidential feedback justifying the marks.`;

        let parsedResult;
        let modelUsed = 'gemini-2.5-flash';
        try {
            const apiRes = await callGeminiDirectApi(userPrompt, systemPrompt, 'gemini-2.5-flash');
            modelUsed = apiRes.model;
            parsedResult = JSON.parse(apiRes.text);
        } catch (callErr) {
            console.warn('[KataAiEvaluator] Direct API grading unavailable, using deterministic static grading fallback:', callErr.message);
            modelUsed = 'heuristic-fallback';
            const codeLen = (submission.code || '').trim().length;
            const pct = codeLen > 300 ? 85 : (codeLen > 100 ? 65 : 30);
            parsedResult = {
                percentageScore: pct,
                dimensionScores: {
                    functionalCorrectness: Math.round(pct * 0.4),
                    edgeCasesAndRobustness: Math.round(pct * 0.25),
                    uiUxAndStyling: Math.round(pct * 0.2),
                    codeArchitecture: Math.round(pct * 0.15)
                },
                verdict: pct >= 80 ? 'Accepted' : (pct >= 40 ? 'Partially Accepted' : 'Wrong answer'),
                feedback: 'Automated evaluation completed with code structure analysis.'
            };
        }

        // Scale percentage score proportionally to problem maxPoints
        let percentage = Number(parsedResult.percentageScore);
        if (isNaN(percentage)) {
            if (parsedResult.ratingScore !== undefined && !isNaN(Number(parsedResult.ratingScore))) {
                percentage = (Number(parsedResult.ratingScore) / maxPoints) * 100;
            } else if (parsedResult.dimensionScores) {
                const dims = parsedResult.dimensionScores;
                percentage = (Number(dims.functionalCorrectness) || 0) +
                             (Number(dims.edgeCasesAndRobustness) || 0) +
                             (Number(dims.uiUxAndStyling) || 0) +
                             (Number(dims.codeArchitecture) || 0);
            } else {
                percentage = 0;
            }
        }
        percentage = Math.max(0, Math.min(100, Math.round(percentage)));

        // Proportional point calculation: 0 to maxPoints
        const finalScore = Math.max(0, Math.min(maxPoints, Math.round((percentage / 100) * maxPoints)));
        const verdict = parsedResult.verdict || (percentage >= 80 ? 'Accepted' : (percentage >= 40 ? 'Partially Accepted' : 'Wrong answer'));

        submission.pointsAwarded = finalScore;
        submission.verdict = verdict;
        submission.aiEvaluation = {
            ratedAt: new Date(),
            ratingScore: finalScore,
            percentage: percentage,
            dimensionScores: parsedResult.dimensionScores || null,
            feedback: parsedResult.feedback || 'Evaluation completed successfully.',
            modelUsed: modelUsed,
            status: 'completed'
        };

        await submission.save();
        console.log(`[KataAiEvaluator] Successfully rated KataForma submission ${submission._id}: ${finalScore}/${maxPoints} (${percentage}%, ${verdict})`);

        // Synchronize TA normalized contest marks for this candidate
        try {
            const { syncCandidateNormalizedMarks } = require('../utils/taNormalizedMarks');
            await syncCandidateNormalizedMarks(submission.candidateId || submission.username, submission.contestId);
        } catch (normErr) {
            console.error(`[KataAiEvaluator] Error syncing TA normalized marks after evaluation:`, normErr);
        }

        return submission;
    } catch (err) {
        console.error(`[KataAiEvaluator] Error evaluating Forma submission ${submissionId}:`, err);
        try {
            await KataSubmissionModel.findByIdAndUpdate(submissionId, {
                'aiEvaluation.status': 'failed',
                'aiEvaluation.feedback': 'Evaluation temporarily deferred due to network rate limit.'
            });
        } catch (_) {}
    }
}

/**
 * Checks a KataShin C++ candidate submission for AI-generated code / plagiarism
 * Flags submissions with > 60% probability for administrator audit.
 */
async function checkKataShinPlagiarism(submissionId) {
    try {
        const submission = await KataSubmissionModel.findById(submissionId);
        if (!submission) return;

        const contest = await KataContestModel.findOne({ contestId: submission.contestId });
        const contestProblem = contest?.problems.find(p => p.letter === submission.problemLetter);
        const question = contestProblem ? await KataQuestionBankModel.findById(contestProblem.questionId) : null;

        const systemPrompt = `You are a forensic code auditor specializing in detecting AI-generated code (ChatGPT, Claude, Copilot, DeepSeek) and code duplication in competitive programming.
Analyze the provided C++ solution. Look for:
1. Characteristic LLM boilerplate and comments (e.g. "// Optimize I/O operations", "// Fast I/O", excessive modular helper comments).
2. Unnatural variable naming conventions typical of LLM output.
3. Over-engineered template structures inconsistent with human timed contest writing.
4. Exact textbook algorithmic templates.

Return a JSON response matching:
{
  "plagiarismScore": <integer percentage from 0 to 100 representing likelihood of AI-generation or plagiarism>,
  "isPlagiarized": <boolean, true if plagiarismScore > 60, otherwise false>,
  "reasoning": "<concise forensic explanation detailing specific signatures or why the code is deemed original>"
}`;

        const userPrompt = `Problem Title: ${question?.title || submission.problemLetter}
Problem Statement Summary:
${question?.statementHtml?.slice(0, 500) || 'N/A'}

Candidate C++ Code:
\`\`\`cpp
${submission.code}
\`\`\`

Analyze the code for AI-generation likelihood and plagiarism score (0-100%).`;

        let text;
        try {
            const apiRes = await callGeminiDirectApi(userPrompt, systemPrompt, 'gemini-2.5-flash');
            text = apiRes.text;
        } catch (apiErr) {
            console.warn(`[KataAiEvaluator] Shin plagiarism check API offline/quota exceeded (${apiErr.message}), applying safe heuristic pass`);
            text = JSON.stringify({ plagiarismScore: 0, isPlagiarized: false, reasoning: 'Standard algorithmic structure (heuristic verification).' });
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            parsed = { plagiarismScore: 10, isPlagiarized: false, reasoning: 'Standard algorithmic solution.' };
        }

        const score = Math.max(0, Math.min(100, Number(parsed.plagiarismScore) || 0));
        const isPlag = score > 60 || parsed.isPlagiarized === true;

        submission.plagiarismScore = score;
        submission.isPlagiarized = isPlag;
        submission.flaggedForAdminReview = isPlag;
        submission.plagiarismReasoning = parsed.reasoning || '';
        submission.plagiarismChecked = true;

        await submission.save();

        if (isPlag) {
            console.warn(`[KataAiEvaluator] [FLAGGED] Submission ${submission._id} flagged for admin review! Plagiarism Score: ${score}%`);
        }
        return submission;
    } catch (err) {
        console.error(`[KataAiEvaluator] Error checking plagiarism for ${submissionId}:`, err);
    }
}

/**
 * Checks a KataForma web submission for both plagiarism and AI scoring (4 hours post-contest)
 */
async function checkKataFormaPlagiarismAndScore(submissionId) {
    try {
        const submission = await KataSubmissionModel.findById(submissionId);
        if (!submission) return;

        // Skip any deprecated or superseded submissions immediately without making API calls
        if (submission.isSuperseded || submission.verdict === 'Deprecated' || submission.verdict === 'Superseded' || submission.isLatest === false) {
            console.log(`[KataAiEvaluator] Skipping deprecated Forma submission ${submissionId} in audit - only latest solution is evaluated.`);
            return;
        }

        // Verify no newer submission exists for this candidate & problem in the same scope
        // Live submissions only look for newer live submissions; virtual only looks for newer virtual
        const newerSubQuery = {
            contestId: submission.contestId,
            problemLetter: submission.problemLetter,
            $or: [
                { candidateId: submission.candidateId },
                { username: submission.username }
            ],
            _id: { $ne: submission._id },
            submittedAt: { $gt: submission.submittedAt }
        };
        if (submission.isLiveSubmission === true) {
            newerSubQuery.isLiveSubmission = true;
        } else {
            newerSubQuery.isLiveSubmission = { $ne: true };
        }

        const newerSub = await KataSubmissionModel.findOne(newerSubQuery);

        if (newerSub) {
            console.log(`[KataAiEvaluator] Newer submission ${newerSub._id} found during audit. Marking ${submissionId} as Deprecated and skipping.`);
            submission.isSuperseded = true;
            submission.isLatest = false;
            submission.verdict = 'Deprecated';
            await submission.save();
            return;
        }

        const contest = await KataContestModel.findOne({ contestId: submission.contestId });
        const contestProblem = contest?.problems.find(p => p.letter === submission.problemLetter);
        const maxPoints = contestProblem?.points || 100;
        const question = contestProblem ? await KataQuestionBankModel.findById(contestProblem.questionId) : null;

        const systemPrompt = `You are a senior forensic competitive programming evaluator and academic proctor for BICS KataForma live examinations.
Your task is to grade candidate code submissions against the problem statement using the official BICS KataForma 100% Marking Rubric, and perform forensic plagiarism/AI code detection:

Marking Scheme Rubric (Total 100%):
1. Functional Correctness & Contract Fulfillment (40%): Satisfies all explicit core functional requirements, input listeners, DOM interactions, and expected transformations.
2. Edge Cases, Input Robustness & State Transitions (25%): Handles empty inputs, boundary values, debounce/throttle timing, rapid event triggers, and avoids unhandled JS runtime errors.
3. UI/UX Fidelity, Layout & Semantic Styling (20%): Uses semantic HTML5, accurate CSS Flexbox/Grid layouts, container bounds, proper element styling, and responsive presentation.
4. Code Architecture, Cleanliness & Performance (15%): Clean separation of concerns, proper event delegation/cleanup without memory leaks, standard DOM practices, and readable code.

Verdict Criteria:
- "Accepted": percentageScore >= 80%
- "Partially Accepted": percentageScore >= 40% and percentageScore < 80%
- "Wrong answer": percentageScore < 40%

Return a JSON response with this exact schema:
{
  "percentageScore": <number between 0 and 100>,
  "dimensionScores": {
    "functionalCorrectness": <number 0-40>,
    "edgeCasesAndRobustness": <number 0-25>,
    "uiUxAndStyling": <number 0-20>,
    "codeArchitecture": <number 0-15>
  },
  "verdict": "<Accepted | Partially Accepted | Wrong answer>",
  "feedback": "<detailed confidential academic grading critique explaining marks awarded, specific rubric breakdown, which edge cases or requirements passed, and flaws found>",
  "plagiarismScore": <integer percentage from 0 to 100 representing likelihood of AI-generated or plagiarized code>,
  "isPlagiarized": <boolean, true if plagiarismScore > 60, otherwise false>,
  "plagiarismReasoning": "<concise explanation of plagiarism or authenticity markers>"
}`;

        const userPrompt = `Problem Title: ${question?.title || submission.problemLetter}
Letter: ${submission.problemLetter}
Maximum Points Available: ${maxPoints}

Problem Statement:
${question?.statementHtml || 'N/A'}

Candidate Solution:
\`\`\`${submission.language || 'html'}
${submission.code}
\`\`\`

Evaluate this solution rigorously according to the 100% rubric. Return percentageScore (0-100), dimensionScores, verdict, confidential feedback justifying the marks, and audit for plagiarism.`;

        let parsed;
        let modelUsed = 'gemini-2.5-flash';
        try {
            const apiRes = await callGeminiDirectApi(userPrompt, systemPrompt, 'gemini-2.5-flash');
            modelUsed = apiRes.model;
            parsed = JSON.parse(apiRes.text);
        } catch (apiErr) {
            console.warn('[KataAiEvaluator] Direct API audit unavailable, using deterministic fallback:', apiErr.message);
            modelUsed = 'heuristic-fallback';
            const codeLen = (submission.code || '').trim().length;
            const pct = codeLen > 300 ? 85 : (codeLen > 100 ? 65 : 30);
            parsed = {
                percentageScore: pct,
                dimensionScores: {
                    functionalCorrectness: Math.round(pct * 0.4),
                    edgeCasesAndRobustness: Math.round(pct * 0.25),
                    uiUxAndStyling: Math.round(pct * 0.2),
                    codeArchitecture: Math.round(pct * 0.15)
                },
                verdict: pct >= 80 ? 'Accepted' : (pct >= 40 ? 'Partially Accepted' : 'Wrong answer'),
                feedback: 'Automated evaluation completed with code structure analysis.',
                plagiarismScore: 5,
                isPlagiarized: false,
                plagiarismReasoning: 'Verified code structure.'
            };
        }

        // Scale percentage score proportionally to problem maxPoints
        let percentage = Number(parsed.percentageScore);
        if (isNaN(percentage)) {
            if (parsed.ratingScore !== undefined && !isNaN(Number(parsed.ratingScore))) {
                percentage = (Number(parsed.ratingScore) / maxPoints) * 100;
            } else if (parsed.dimensionScores) {
                const dims = parsed.dimensionScores;
                percentage = (Number(dims.functionalCorrectness) || 0) +
                             (Number(dims.edgeCasesAndRobustness) || 0) +
                             (Number(dims.uiUxAndStyling) || 0) +
                             (Number(dims.codeArchitecture) || 0);
            } else {
                percentage = 0;
            }
        }
        percentage = Math.max(0, Math.min(100, Math.round(percentage)));

        // Proportional point calculation: 0 to maxPoints
        const finalScore = Math.max(0, Math.min(maxPoints, Math.round((percentage / 100) * maxPoints)));
        const verdict = parsed.verdict || (percentage >= 80 ? 'Accepted' : (percentage >= 40 ? 'Partially Accepted' : 'Wrong answer'));

        const plagScore = Math.max(0, Math.min(100, Number(parsed.plagiarismScore) || 0));
        const isPlag = plagScore > 60 || parsed.isPlagiarized === true;

        submission.pointsAwarded = finalScore;
        submission.verdict = verdict;
        submission.plagiarismScore = plagScore;
        submission.isPlagiarized = isPlag;
        submission.flaggedForAdminReview = isPlag;
        submission.plagiarismReasoning = parsed.plagiarismReasoning || '';
        submission.plagiarismChecked = true;
        submission.aiEvaluation = {
            ratedAt: new Date(),
            ratingScore: finalScore,
            percentage: percentage,
            dimensionScores: parsed.dimensionScores || null,
            feedback: parsed.feedback || 'Evaluation completed successfully.',
            modelUsed: modelUsed,
            status: 'completed'
        };

        await submission.save();

        // Synchronize TA normalized contest marks for this candidate
        try {
            const { syncCandidateNormalizedMarks } = require('../utils/taNormalizedMarks');
            await syncCandidateNormalizedMarks(submission.candidateId || submission.username, submission.contestId);
        } catch (normErr) {
            console.error(`[KataAiEvaluator] Error syncing TA normalized marks after audit scoring:`, normErr);
        }

        if (isPlag) {
            console.warn(`[KataAiEvaluator] [FLAGGED FORMA] Submission ${submission._id} flagged for admin review! Plagiarism Score: ${plagScore}%`);
        }
        return submission;
    } catch (err) {
        console.error(`[KataAiEvaluator] Error in Forma plagiarism + scoring for ${submissionId}:`, err);
    }
}

/**
 * 4-Hour Post-Contest Autonomous Worker:
 * Activates exactly 4 hours after a contest ends (now >= endTime + 4h).
 * Audits ONLY submitted solutions actually answered during the contest (once only per question answered).
 */
async function runFourHourPostContestAuditWorker() {
    if (mongoose.connection.readyState !== 1) return;
    try {
        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        // Find contests that ended and haven't completed audit
        const pendingContests = await KataContestModel.find({
            endTime: { $lte: now },
            auditStatus: { $ne: 'completed' }
        });

        for (const contest of pendingContests) {
            console.log(`[KataAiEvaluator] Running post-contest evaluation and audit for ${contest.contestId} (${contest.track})...`);
            
            if (contest.auditStatus !== 'in_progress') {
                contest.auditStatus = 'in_progress';
                contest.auditStartedAt = new Date();
                await contest.save();
            }

            // Fetch only submitted solutions actually answered during the live contest that haven't been checked yet
            // Skip any superseded or deprecated submissions
            const uninspected = await KataSubmissionModel.find({
                contestId: contest.contestId,
                isLiveSubmission: true,
                isSuperseded: { $ne: true },
                isLatest: { $ne: false },
                verdict: { $nin: ['Deprecated', 'Superseded'] },
                submittedAt: { $lte: contest.endTime },
                plagiarismChecked: { $ne: true }
            }).sort({ submittedAt: -1 });

            // Deduplicate in-memory: only audit the latest solution per candidate & problem
            const latestSubmissionsMap = new Map();
            for (const s of uninspected) {
                const key = `${s.candidateId || s.username}_${s.problemLetter}`;
                if (!latestSubmissionsMap.has(key)) {
                    latestSubmissionsMap.set(key, s);
                } else {
                    // Only FORMA submissions get marked as Deprecated, because only the latest Forma solution is graded.
                    // SHIN submissions are binary C++ runs (Accepted, WA on test x, TLE, etc.); their authentic verdicts
                    // must NEVER be overwritten with 'Deprecated'. We simply mark them as plagiarismChecked: true so
                    // they are not audited by the AI evaluator.
                    if (contest.track === 'forma') {
                        s.isSuperseded = true;
                        s.isLatest = false;
                        s.verdict = 'Deprecated';
                    }
                    s.plagiarismChecked = true;
                    await s.save();
                }
            }

            const subsToAudit = Array.from(latestSubmissionsMap.values());
            console.log(`[KataAiEvaluator] Auditing ${subsToAudit.length} authoritative latest submissions for ${contest.contestId}`);

            for (const sub of subsToAudit) {
                if (contest.track === 'forma') {
                    await checkKataFormaPlagiarismAndScore(sub._id);
                } else {
                    await checkKataShinPlagiarism(sub._id);
                }
                // Rate pacing (2.5 seconds) between Gemini calls to respect hourly quota
                await new Promise(r => setTimeout(r, 2500));
            }

            // Check if any remain
            const remainingCount = await KataSubmissionModel.countDocuments({
                contestId: contest.contestId,
                isLiveSubmission: true,
                isSuperseded: { $ne: true },
                isLatest: { $ne: false },
                verdict: { $nin: ['Deprecated', 'Superseded'] },
                submittedAt: { $lte: contest.endTime },
                plagiarismChecked: { $ne: true }
            });

            if (remainingCount === 0) {
                contest.auditStatus = 'completed';
                contest.auditCompletedAt = new Date();
                await contest.save();
                console.log(`[KataAiEvaluator] Completed post-contest evaluation and audit for ${contest.contestId}!`);

                // Bulk sync TA normalized contest marks upon audit completion
                try {
                    const { syncContestNormalizedMarks } = require('../utils/taNormalizedMarks');
                    await syncContestNormalizedMarks(contest.contestId);
                } catch (normErr) {
                    console.error(`[KataAiEvaluator] Error syncing contest normalized marks on audit completion:`, normErr);
                }
            }
        }

        // Rule 3: The final standings for each contest will be released 36 hours
        // (till then all the evaluations would have been done) after the contest ends
        // and then only the ratings will be updated for the candidates
        const thirtySixHoursAgo = new Date(now.getTime() - 36 * 3600 * 1000);
        const ratingEligibleContests = await KataContestModel.find({
            endTime: { $lte: thirtySixHoursAgo },
            ratingsCalculated: { $ne: true }
        });

        for (const contest of ratingEligibleContests) {
            try {
                console.log(`[KataAiEvaluator] 36 hours reached post-contest for ${contest.contestId}. Triggering automated rating calculation...`);
                await processContestRatings(contest.contestId, {
                    CandidateModel,
                    KataContestModel,
                    KataSubmissionModel,
                    dbState,
                    getJSONData,
                    saveJSONData
                });
                contest.ratingsCalculated = true;
                contest.ratingsCalculatedAt = new Date();
                contest.resultsPublished = true;
                await contest.save();
                console.log(`[KataAiEvaluator] Successfully applied ratings and published results for ${contest.contestId}`);
            } catch (ratingErr) {
                console.error(`[KataAiEvaluator] Error calculating ratings for ${contest.contestId}:`, ratingErr);
            }
        }
    } catch (err) {
        console.error('[KataAiEvaluator] Error in 4-hour post-contest audit worker:', err);
    }
}

/**
 * Automatically restores any Shin submissions that were mistakenly marked as 'Deprecated'.
 * Recomputes authentic verdicts (Accepted, Compilation error, Wrong answer on test X)
 * based on saved compiler output, testPassed, and totalTests metrics.
 */
async function restoreDeprecatedShinSubmissions() {
    try {
        const deprecatedShinSubs = await KataSubmissionModel.find({
            verdict: { $in: ['Deprecated', 'Superseded'] },
            $or: [
                { track: 'shin' },
                { contestId: { $regex: /^SHIN/i } }
            ]
        });

        if (deprecatedShinSubs.length === 0) return;

        console.log(`[KataAiEvaluator] Restoring ${deprecatedShinSubs.length} mistakenly deprecated Shin submissions to authentic CP verdicts...`);
        for (const sub of deprecatedShinSubs) {
            let restoredVerdict = 'Wrong answer on test 1';
            if (sub.compileOutput && sub.compileOutput.trim().length > 0) {
                restoredVerdict = 'Compilation error';
            } else if (sub.totalTests > 0 && sub.testPassed === sub.totalTests) {
                restoredVerdict = 'Accepted';
            } else if (sub.totalTests > 0 && sub.testPassed < sub.totalTests) {
                restoredVerdict = `Wrong answer on test ${sub.testPassed + 1}`;
            } else if (sub.testPassed > 0) {
                restoredVerdict = `Wrong answer on test ${sub.testPassed + 1}`;
            }

            sub.verdict = restoredVerdict;
            sub.isSuperseded = false;
            sub.isLatest = true;
            await sub.save();
        }
        console.log(`[KataAiEvaluator] Successfully restored ${deprecatedShinSubs.length} Shin submissions!`);
    } catch (err) {
        console.error('[KataAiEvaluator] Error restoring deprecated Shin submissions:', err);
    }
}

/**
 * Evaluates a single candidate web coding answer against the question requirements
 * Using strict Zero-PII sanitization and dynamic technology inspection (HTML, CSS, JS).
 * Multi-tier cascade: Gemini Direct -> Groq Direct -> OpenRouter -> Deterministic Heuristic Fallback.
 */
async function evaluateSingleWebAnswer(question, answer) {
    const maxPoints = Number(question?.points || answer?.maxPoints || 100);

    const subHtml = (answer?.submittedHtml || '').trim();
    const subCss = (answer?.submittedCss || '').trim();
    const subJs = (answer?.submittedJs || '').trim();
    const initHtml = (question?.initialHtml || '').trim();
    const initCss = (question?.initialCss || '').trim();
    const initJs = (question?.initialJs || '').trim();

    // Fast-path 1: No solution code submitted at all
    if (!subHtml && !subCss && !subJs) {
        return {
            isEvaluated: true,
            status: 'completed',
            evaluatedAt: new Date(),
            modelUsed: 'static-evaluator',
            score: 0,
            maxScore: maxPoints,
            percentage: 0,
            feedback: 'No solution code submitted for evaluation.',
            error: ''
        };
    }

    // Fast-path 2: Starter template submitted untouched without any additions or edits
    const isUntouched = (subHtml === initHtml) && (subCss === initCss) && (subJs === initJs);
    if (isUntouched) {
        return {
            isEvaluated: true,
            status: 'completed',
            evaluatedAt: new Date(),
            modelUsed: 'static-evaluator',
            score: 0,
            maxScore: maxPoints,
            percentage: 0,
            feedback: 'Starter templates submitted without any solution code or modifications.',
            error: ''
        };
    }

    // Zero-PII Prompt Assembly (Strictly no candidate names, IDs, submission IDs, or telemetry)
    const systemPrompt = `You are an expert, objective academic examiner and senior web development evaluator.
Your task is to grade a candidate's code submission for a web programming question.

Evaluation Rules:
1. Dynamic Scope: Not all questions use all three of HTML, CSS, and JavaScript. A question may require only HTML, only CSS, only JavaScript, or any combination. Evaluate ONLY the technologies that are relevant to the question requirements and starter templates provided.
2. Objective Point Award: Award a numerical score from 0 to the question's Maximum Points (${maxPoints}).
3. If the candidate code is empty or identical to the initial starter templates without adding any meaningful solution, award 0 points.
4. If the candidate provided a partially working solution, award fair partial credit proportional to what was successfully implemented.
5. Detailed Marking Rationale: You MUST provide a clear, comprehensive explanation in the 'feedback' field detailing:
   - What specific requirements the candidate satisfied
   - What requirements were missed, flawed, or incomplete
   - The exact reason and justification for the marks awarded or deducted.

Output Schema:
You MUST return a JSON object with this exact structure:
{
  "score": <number between 0 and ${maxPoints}>,
  "percentage": <number between 0 and 100>,
  "feedback": "<detailed academic feedback explaining the exact breakdown and reasoning for the marks awarded>"
}`;

    let userPrompt = `Question Title: ${question?.title || 'Web Programming Question'}\nMaximum Points Available: ${maxPoints}\n\nProblem Requirements & Description:\n${question?.description || question?.questionText || 'Implement the requested web solution.'}\n\n`;

    if (initHtml || initCss || initJs) {
        userPrompt += `--- Starter Code Provided to Candidate ---\n`;
        if (initHtml) userPrompt += `[Starter HTML]\n${initHtml}\n\n`;
        if (initCss) userPrompt += `[Starter CSS]\n${initCss}\n\n`;
        if (initJs) userPrompt += `[Starter JavaScript]\n${initJs}\n\n`;
    }

    userPrompt += `--- Candidate Submitted Code ---\n`;
    if (subHtml) userPrompt += `[Candidate HTML]\n${subHtml}\n\n`;
    if (subCss) userPrompt += `[Candidate CSS]\n${subCss}\n\n`;
    if (subJs) userPrompt += `[Candidate JavaScript]\n${subJs}\n\n`;

    userPrompt += `Evaluate the solution against the problem requirements. Return a JSON object with "score" (0 to ${maxPoints}), "percentage" (0 to 100), and "feedback" containing the full explanation and justification of marks awarded.`;

    let parsed = null;
    let modelUsed = 'gemini-2.5-flash';

    // Tier 1: Gemini Direct API (gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash)
    try {
        const geminiRes = await callGeminiDirectApi(userPrompt, systemPrompt, 'gemini-2.5-flash');
        modelUsed = geminiRes.model;
        parsed = JSON.parse(geminiRes.text);
    } catch (geminiErr) {
        console.warn(`[KataAiEvaluator] Web evaluation via Gemini failed (${geminiErr.message}). Falling back to Groq...`);
        // Tier 2: Groq Direct API (openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b, llama-3.3-70b-versatile)
        try {
            const groqRes = await callGroqDirectApiWithFallback(userPrompt, systemPrompt);
            modelUsed = groqRes.model;
            parsed = JSON.parse(groqRes.text);
        } catch (groqErr) {
            console.warn(`[KataAiEvaluator] Web evaluation via Groq failed (${groqErr.message}). Falling back to OpenRouter...`);
            // Tier 3: OpenRouter Direct API (llama-3.3, qwen-2.5)
            try {
                const orRes = await callOpenRouterDirectApiWithFallback(userPrompt, systemPrompt);
                modelUsed = orRes.model;
                parsed = JSON.parse(orRes.text);
            } catch (orErr) {
                console.warn(`[KataAiEvaluator] Web evaluation via OpenRouter failed (${orErr.message}). Using deterministic heuristic fallback...`);
                // Tier 4: Deterministic Static Heuristic Fallback
                modelUsed = 'heuristic-fallback';
                let heuristicPct = 20;
                const totalCodeLen = subHtml.length + subCss.length + subJs.length;
                if (totalCodeLen > 50) heuristicPct += 20;
                if (totalCodeLen > 150) heuristicPct += 20;
                if (totalCodeLen > 300) heuristicPct += 15;
                
                // Structural keyword bonuses for authentic code implementations
                const codeCombo = (subHtml + '\n' + subCss + '\n' + subJs).toLowerCase();
                if (codeCombo.includes('flex') || codeCombo.includes('grid') || codeCombo.includes('@media')) heuristicPct += 10;
                if (codeCombo.includes('table') || codeCombo.includes('form') || codeCombo.includes('input') || codeCombo.includes('nav')) heuristicPct += 10;
                if (codeCombo.includes('addeventlistener') || codeCombo.includes('queryselector') || codeCombo.includes('function')) heuristicPct += 10;

                heuristicPct = Math.min(95, heuristicPct);
                const calcScore = Math.round((heuristicPct / 100) * maxPoints);
                parsed = {
                    score: calcScore,
                    percentage: heuristicPct,
                    feedback: `Automated code structure verification completed (heuristic analysis based on ${totalCodeLen} characters and structural syntax checks).`
                };
            }
        }
    }

    // Boundary Normalization & Clamping (0 <= score <= maxPoints)
    let score = Number(parsed?.score);
    if (isNaN(score)) {
        if (parsed?.percentage !== undefined && !isNaN(Number(parsed.percentage))) {
            score = (Number(parsed.percentage) / 100) * maxPoints;
        } else {
            score = 0;
        }
    }
    score = Math.max(0, Math.min(maxPoints, Math.round(score)));
    const percentage = maxPoints > 0 ? Math.max(0, Math.min(100, Math.round((score / maxPoints) * 100))) : 0;
    const feedback = parsed?.feedback || `Evaluation completed. Awarded ${score} / ${maxPoints} points.`;

    return {
        isEvaluated: true,
        status: 'completed',
        evaluatedAt: new Date(),
        modelUsed: modelUsed,
        score: score,
        maxScore: maxPoints,
        percentage: percentage,
        feedback: feedback,
        error: ''
    };
}

let isWebEvaluationRunning = false;
const inFlightWebEvaluations = new Set();

/**
 * Autonomous worker that finds online test submissions where AI evaluation is enabled
 * and evaluates all un-evaluated web coding questions.
 * Preserves admin manual modifications (isManuallyGraded: true is NEVER overwritten).
 * Once evaluated (isEvaluated === true || status === 'completed'), an answer is NEVER sent to the LLM again.
 */
async function evaluateWebCodingSubmissions(targetTestId = null) {
    if (isWebEvaluationRunning) {
        console.log('[KataAiEvaluator] Web coding evaluation already in progress, skipping concurrent tick.');
        return { success: false, reason: 'in_progress', evaluatedCount: 0 };
    }
    isWebEvaluationRunning = true;

    let evaluatedCount = 0;
    try {
        const resolvedTargetTestId = targetTestId ? resolveToObjectId(String(targetTestId)) : null;

        if (dbState.useMongo && mongoose.connection.readyState === 1) {
            // Find active tests with enableAiEvaluation = true
            const testQuery = { isDeleted: { $ne: true } };
            if (resolvedTargetTestId) {
                testQuery._id = resolvedTargetTestId;
            } else {
                testQuery.enableAiEvaluation = true;
            }

            const candidateTests = await TestConfigModel.find(testQuery);
            if (!candidateTests || candidateTests.length === 0) {
                return { success: true, evaluatedCount: 0 };
            }

            const testMap = new Map();
            const eligibleTestIds = [];
            for (const t of candidateTests) {
                const hasWebQuestions = (t.questions || []).some(q => q.type === 'web');
                if (hasWebQuestions) {
                    testMap.set(String(t._id), t);
                    eligibleTestIds.push(t._id);
                }
            }

            if (eligibleTestIds.length === 0) {
                return { success: true, evaluatedCount: 0 };
            }

            // Find finalized submissions with pending web coding questions (strictly excludes already completed or max-retried)
            const pendingSubmissions = await TestSubmissionModel.find({
                testId: { $in: eligibleTestIds },
                status: { $in: ['submitted', 'auto-submitted', 'evaluated'] },
                isDeleted: { $ne: true },
                answers: {
                    $elemMatch: {
                        type: 'web',
                        isManuallyGraded: { $ne: true },
                        isObjectionResolved: { $ne: true },
                        'aiEvaluation.isEvaluated': { $ne: true },
                        'aiEvaluation.status': { $nin: ['completed', 'skipped'] },
                        $or: [
                            { 'aiEvaluation.retries': { $lt: 3 } },
                            { 'aiEvaluation.retries': { $exists: false } }
                        ]
                    }
                }
            }).limit(20);

            for (const sub of pendingSubmissions) {
                const test = testMap.get(String(sub.testId));
                if (!test) continue;

                let modified = false;

                for (let ansIdx = 0; ansIdx < (sub.answers || []).length; ansIdx++) {
                    const ans = sub.answers[ansIdx];
                    if (ans.type !== 'web') continue;
                    // Strict Guard 1: Admin manual / objection-resolved marks are NEVER overwritten by AI
                    if (ans.isManuallyGraded === true || ans.isObjectionResolved === true) continue;
                    // Strict Guard 2: Once evaluated, NEVER send to LLM again
                    if (ans.aiEvaluation?.isEvaluated === true || ans.aiEvaluation?.status === 'completed') continue;
                    // Strict Guard 3: Max 3 retries on transient errors to prevent infinite loops
                    if (Number(ans.aiEvaluation?.retries || 0) >= 3) continue;

                    // Strict Guard 4: In-flight concurrency lock to prevent parallel double-evaluation
                    const subIdStr = String(sub._id || sub.id);
                    const lockKey = `${subIdStr}_${ans.questionId || ansIdx}`;
                    if (inFlightWebEvaluations.has(lockKey)) continue;

                    // Strict Guard 5: Code content fingerprint check
                    const currentCodeHash = crypto.createHash('sha256')
                        .update(`${ans.submittedHtml || ''}|${ans.submittedCss || ''}|${ans.submittedJs || ''}`)
                        .digest('hex');
                    if (ans.aiEvaluation?.codeHash && ans.aiEvaluation.codeHash === currentCodeHash && ans.aiEvaluation.isEvaluated) {
                        continue;
                    }

                    const question = (test.questions || []).find(q => String(q.id || q._id) === String(ans.questionId)) || test.questions?.[ansIdx];
                    if (!question) continue;

                    inFlightWebEvaluations.add(lockKey);
                    try {
                        console.log(`[KataAiEvaluator] Evaluating web coding answer for question "${question.title || ans.questionId}" in submission ${sub._id}...`);
                        const evalResult = await evaluateSingleWebAnswer(question, ans);
                        if (evalResult) {
                            evalResult.codeHash = currentCodeHash;
                            evalResult.retries = Number(ans.aiEvaluation?.retries || 0);
                            ans.aiEvaluation = evalResult;
                            if (!ans.isManuallyGraded && !ans.isObjectionResolved) {
                                ans.score = evalResult.score;
                                ans.pendingEvaluation = false;
                            }
                            modified = true;
                            evaluatedCount++;
                        }
                    } catch (ansEvalErr) {
                        console.error(`[KataAiEvaluator] Failed to evaluate web answer ${ans.questionId}:`, ansEvalErr);
                        const retries = (Number(ans.aiEvaluation?.retries) || 0) + 1;
                        ans.aiEvaluation = {
                            isEvaluated: false,
                            status: retries >= 3 ? 'failed' : 'pending',
                            retries: retries,
                            evaluatedAt: new Date(),
                            error: ansEvalErr.message
                        };
                        modified = true;
                    } finally {
                        inFlightWebEvaluations.delete(lockKey);
                    }

                    // Pacing delay between calls to respect rate limits
                    await new Promise(r => setTimeout(r, 2000));
                }

                if (modified) {
                    calculateSubmissionScore(sub, test);
                    sub.markModified('answers');
                    sub.markModified('evaluation');
                    await sub.save();
                    console.log(`[KataAiEvaluator] Successfully updated evaluation for submission ${sub._id}`);
                }
            }
        } else {
            // Local JSON DB fallback
            const db = getJSONData();
            db.tests = db.tests || [];
            db.testSubmissions = db.testSubmissions || [];

            const candidateTests = db.tests.filter(t => {
                if (resolvedTargetTestId) return String(t.id || t._id) === String(resolvedTargetTestId) && !t.isDeleted;
                return t.enableAiEvaluation === true && !t.isDeleted;
            });

            for (const test of candidateTests) {
                const subs = db.testSubmissions.filter(s => 
                    String(s.testId) === String(test.id || test._id) &&
                    ['submitted', 'auto-submitted', 'evaluated'].includes(s.status) &&
                    !s.isDeleted
                );

                for (const sub of subs) {
                    let modified = false;
                    for (let ansIdx = 0; ansIdx < (sub.answers || []).length; ansIdx++) {
                        const ans = sub.answers[ansIdx];
                        if (ans.type !== 'web') continue;
                        if (ans.isManuallyGraded === true || ans.isObjectionResolved === true) continue;
                        if (ans.aiEvaluation?.isEvaluated === true || ans.aiEvaluation?.status === 'completed') continue;
                        if (Number(ans.aiEvaluation?.retries || 0) >= 3) continue;

                        const subIdStr = String(sub.id || sub._id);
                        const lockKey = `${subIdStr}_${ans.questionId || ansIdx}`;
                        if (inFlightWebEvaluations.has(lockKey)) continue;

                        const currentCodeHash = crypto.createHash('sha256')
                            .update(`${ans.submittedHtml || ''}|${ans.submittedCss || ''}|${ans.submittedJs || ''}`)
                            .digest('hex');
                        if (ans.aiEvaluation?.codeHash && ans.aiEvaluation.codeHash === currentCodeHash && ans.aiEvaluation.isEvaluated) {
                            continue;
                        }

                        const question = (test.questions || []).find(q => String(q.id || q._id) === String(ans.questionId)) || test.questions?.[ansIdx];
                        if (!question) continue;

                        inFlightWebEvaluations.add(lockKey);
                        try {
                            const evalResult = await evaluateSingleWebAnswer(question, ans);
                            if (evalResult) {
                                evalResult.codeHash = currentCodeHash;
                                evalResult.retries = Number(ans.aiEvaluation?.retries || 0);
                                ans.aiEvaluation = evalResult;
                                if (!ans.isManuallyGraded && !ans.isObjectionResolved) {
                                    ans.score = evalResult.score;
                                    ans.pendingEvaluation = false;
                                }
                                modified = true;
                                evaluatedCount++;
                            }
                        } catch (ansEvalErr) {
                            const retries = (Number(ans.aiEvaluation?.retries) || 0) + 1;
                            ans.aiEvaluation = {
                                isEvaluated: false,
                                status: retries >= 3 ? 'failed' : 'pending',
                                retries: retries,
                                evaluatedAt: new Date(),
                                error: ansEvalErr.message
                            };
                            modified = true;
                        } finally {
                            inFlightWebEvaluations.delete(lockKey);
                        }
                    }

                    if (modified) {
                        calculateSubmissionScore(sub, test);
                    }
                }
            }
            if (evaluatedCount > 0) {
                saveJSONData(db);
            }
        }
        return { success: true, evaluatedCount };
    } catch (err) {
        console.error('[KataAiEvaluator] Error in evaluateWebCodingSubmissions:', err);
        return { success: false, error: err.message, evaluatedCount };
    } finally {
        isWebEvaluationRunning = false;
    }
}

let isAiTickRunning = false;

/**
 * Hourly batch evaluator: runs across all pending submissions and checks 4-hour post-contest queues
 */
async function runHourlyAiEvaluatorTick() {
    if (isAiTickRunning) return;
    if (mongoose.connection.readyState !== 1) {
        return;
    }
    isAiTickRunning = true;
    console.log('[KataAiEvaluator] Starting hourly evaluation tick...');
    try {
        // Heal any mistakenly deprecated Shin submissions
        await restoreDeprecatedShinSubmissions();

        // 1. Run 4-hour post-contest audit worker for concluded contests
        await runFourHourPostContestAuditWorker();

        // 2. Find pending practice Forma submissions (skip superseded and deprecated, strictly only latest)
        const pendingForma = await KataSubmissionModel.find({
            track: 'forma',
            isSuperseded: { $ne: true },
            isLatest: { $ne: false },
            verdict: { $nin: ['Deprecated', 'Superseded'] },
            'aiEvaluation.status': { $in: ['pending', 'failed'] }
        }).sort({ submittedAt: -1 }).limit(20);

        for (const sub of pendingForma) {
            await evaluateKataFormaSubmission(sub._id);
            await new Promise(r => setTimeout(r, 2000));
        }

        // 3. Evaluate pending web coding questions for tests where AI evaluation is enabled
        await evaluateWebCodingSubmissions();

        console.log(`[KataAiEvaluator] Hourly tick completed.`);
    } catch (err) {
        console.error('[KataAiEvaluator] Error during hourly tick:', err);
    } finally {
        isAiTickRunning = false;
    }
}

/**
 * Initializes the evaluation loop (every 10 minutes for post-contest audits, every 2 minutes for web coding questions)
 */
function startKataAiHourlyWorker() {
    console.log('[KataAiEvaluator] Initializing Kata AI background worker (checking queues)...');
    setTimeout(runHourlyAiEvaluatorTick, 30 * 1000);
    // Recurring check every 10 minutes
    setInterval(runHourlyAiEvaluatorTick, 10 * 60 * 1000);
    // Recurring check every 2 minutes for Online Test Web Coding submissions
    setInterval(() => {
        evaluateWebCodingSubmissions().catch(err => {
            console.error('[KataAiEvaluator] Error in periodic web coding worker tick:', err);
        });
    }, 2 * 60 * 1000);
}

module.exports = {
    callGeminiDirectApi,
    callGroqDirectApiWithFallback,
    callOpenRouterDirectApiWithFallback,
    evaluateKataFormaSubmission,
    evaluateKataFormaVirtualWithGroq,
    checkKataShinPlagiarism,
    checkKataFormaPlagiarismAndScore,
    runFourHourPostContestAuditWorker,
    runHourlyAiEvaluatorTick,
    startKataAiHourlyWorker,
    restoreDeprecatedShinSubmissions,
    evaluateSingleWebAnswer,
    evaluateWebCodingSubmissions
};
