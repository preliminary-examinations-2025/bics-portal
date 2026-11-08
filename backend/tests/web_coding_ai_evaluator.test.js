require('dotenv').config();
const assert = require('assert');
const { evaluateSingleWebAnswer, evaluateWebCodingSubmissions } = require('../services/kataAiEvaluator');
const { calculateSubmissionScore } = require('../utils/scoreCalculator');

async function runTestSuite() {
    console.log("===============================================================================");
    console.log("   BICS WEB CODING AI EVALUATOR TEST SUITE");
    console.log("===============================================================================");

    let passedTests = 0;
    let failedTests = 0;

    function report(name, fn) {
        try {
            fn();
            console.log(`[PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`[FAIL] ${name}:`, err.message);
            failedTests++;
        }
    }

    async function reportAsync(name, fn) {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`[FAIL] ${name}:`, err.message);
            failedTests++;
        }
    }

    // TEST 1: Fast-Path 1 - Completely Blank Submission
    await reportAsync("Fast-Path: Blank code returns 0 marks without external API calls", async () => {
        const question = {
            id: 'q_web_1',
            type: 'web',
            title: 'Build a Contact Form',
            description: 'Create an accessible HTML contact form with name, email, and submit button.',
            points: 20,
            initialHtml: ''
        };
        const blankAnswer = {
            questionId: 'q_web_1',
            type: 'web',
            submittedHtml: '',
            submittedCss: '',
            submittedJs: '',
            maxPoints: 20
        };

        const result = await evaluateSingleWebAnswer(question, blankAnswer);
        assert.strictEqual(result.isEvaluated, true);
        assert.strictEqual(result.score, 0);
        assert.strictEqual(result.percentage, 0);
        assert.strictEqual(result.modelUsed, 'static-evaluator');
        assert(result.feedback.includes('No solution code submitted'), "Feedback should note blank code");
    });

    // TEST 2: Fast-Path 2 - Untouched Starter Template
    await reportAsync("Fast-Path: Untouched starter templates return 0 marks", async () => {
        const question = {
            id: 'q_web_2',
            type: 'web',
            title: 'Design a Card',
            description: 'Style the provided card component with modern CSS Flexbox layout.',
            points: 25,
            initialHtml: '<div class="card"><h3>Title</h3></div>',
            initialCss: '.card { margin: 0; }',
            initialJs: ''
        };
        const untouchedAnswer = {
            questionId: 'q_web_2',
            type: 'web',
            submittedHtml: '<div class="card"><h3>Title</h3></div>',
            submittedCss: '.card { margin: 0; }',
            submittedJs: '',
            maxPoints: 25
        };

        const result = await evaluateSingleWebAnswer(question, untouchedAnswer);
        assert.strictEqual(result.isEvaluated, true);
        assert.strictEqual(result.score, 0);
        assert.strictEqual(result.percentage, 0);
        assert.strictEqual(result.modelUsed, 'static-evaluator');
        assert(result.feedback.includes('Starter templates submitted without any solution code'), "Feedback should note unmodified templates");
    });

    // TEST 3: Zero-PII Prompt Assembly & Technology Agnostic Evaluation (HTML-only)
    await reportAsync("Evaluation: HTML-only question evaluated accurately with marks rationale", async () => {
        const question = {
            id: 'q_html_only',
            type: 'web',
            title: 'Semantic Data Table',
            description: 'Create a semantic table with thead, tbody, th scope="col", and caption elements.',
            points: 15,
            initialHtml: ''
        };
        const candidateAnswer = {
            questionId: 'q_html_only',
            type: 'web',
            submittedHtml: `<table>
  <caption>Quarterly Academic Performance</caption>
  <thead>
    <tr><th scope="col">Subject</th><th scope="col">Grade</th></tr>
  </thead>
  <tbody>
    <tr><td>Computer Science</td><td>A+</td></tr>
  </tbody>
</table>`,
            submittedCss: '',
            submittedJs: '',
            maxPoints: 15
        };

        const result = await evaluateSingleWebAnswer(question, candidateAnswer);
        assert.strictEqual(result.isEvaluated, true);
        assert(result.score > 0, "Candidate should receive points for correct HTML semantics");
        assert(result.score <= 15, "Score must not exceed maxPoints (15)");
        assert(typeof result.feedback === 'string' && result.feedback.length > 10, "Feedback must explain marking rationale");
        console.log(`       [Awarded]: ${result.score} / 15 pts (${result.percentage}%) via ${result.modelUsed}`);
        console.log(`       [Rationale]: ${result.feedback.slice(0, 120)}...`);
    });

    // TEST 4: Heterogeneous Technology - CSS-only Question
    await reportAsync("Evaluation: CSS-only layout question evaluated with feedback", async () => {
        const question = {
            id: 'q_css_only',
            type: 'web',
            title: 'Responsive Flexbox Navigation Bar',
            description: 'Write CSS to align navigation links using display: flex, justify-content: space-between, and a media query for mobile screens under 600px.',
            points: 20,
            initialHtml: '<nav class="navbar"><a href="#">Home</a><a href="#">About</a><a href="#">Contact</a></nav>',
            initialCss: '/* Add navbar styling here */'
        };
        const candidateAnswer = {
            questionId: 'q_css_only',
            type: 'web',
            submittedHtml: '<nav class="navbar"><a href="#">Home</a><a href="#">About</a><a href="#">Contact</a></nav>',
            submittedCss: `.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background-color: #1e293b;
}
.navbar a {
  color: #ffffff;
  text-decoration: none;
}
@media (max-width: 600px) {
  .navbar {
    flex-direction: column;
    gap: 8px;
  }
}`,
            submittedJs: '',
            maxPoints: 20
        };

        const result = await evaluateSingleWebAnswer(question, candidateAnswer);
        assert.strictEqual(result.isEvaluated, true);
        assert(result.score >= 12, "Candidate should score high marks for meeting all flexbox and media query requirements");
        assert(result.score <= 20, "Score must not exceed maxPoints (20)");
        console.log(`       [Awarded]: ${result.score} / 20 pts (${result.percentage}%) via ${result.modelUsed}`);
    });

    // TEST 5: Score Calculator Aggregation
    report("ScoreCalculator: Preserves AI web score and aggregates cleanly into total score", () => {
        const mockTest = {
            id: 'test_123',
            marks: 100,
            questions: [
                { id: 'q_mcq_1', type: 'mcq', points: 10, correctOptionIndex: 2 },
                { id: 'q_code_1', type: 'coding', points: 30 },
                { id: 'q_web_1', type: 'web', points: 40 }
            ]
        };

        const mockSubmission = {
            testId: 'test_123',
            answers: [
                { questionId: 'q_mcq_1', type: 'mcq', selectedOptionIndex: 2, score: 10 },
                {
                    questionId: 'q_code_1',
                    type: 'coding',
                    score: 25,
                    testCaseResults: [{ status: 'Accepted', scoredPoints: 25 }]
                },
                {
                    questionId: 'q_web_1',
                    type: 'web',
                    score: 0,
                    isManuallyGraded: false,
                    aiEvaluation: {
                        isEvaluated: true,
                        status: 'completed',
                        score: 36,
                        maxScore: 40,
                        percentage: 90,
                        feedback: 'Good implementation of layout and interaction.'
                    }
                }
            ],
            evaluation: {}
        };

        calculateSubmissionScore(mockSubmission, mockTest);

        assert.strictEqual(mockSubmission.answers[0].score, 10, "MCQ score should be 10");
        assert.strictEqual(mockSubmission.answers[1].score, 25, "Coding score should be 25");
        assert.strictEqual(mockSubmission.answers[2].score, 36, "Web score should be updated from aiEvaluation to 36");
        assert.strictEqual(mockSubmission.evaluation.mcqScore, 10, "mcqScore should be 10");
        assert.strictEqual(mockSubmission.evaluation.webScore, 36, "webScore should be 36");
        assert.strictEqual(mockSubmission.evaluation.codingScore, 61, "codingScore should be coding(25) + web(36) = 61");
        assert.strictEqual(mockSubmission.totalScore, 71, "totalScore should be 10 + 25 + 36 = 71");
    });

    // TEST 6: Manual Adjustment Lock (Admin override is protected)
    report("Admin Lock: isManuallyGraded: true is NEVER overwritten by AI calculation", () => {
        const mockTest = {
            id: 'test_123',
            marks: 100,
            questions: [
                { id: 'q_web_1', type: 'web', points: 40 }
            ]
        };

        const mockSubmission = {
            testId: 'test_123',
            answers: [
                {
                    questionId: 'q_web_1',
                    type: 'web',
                    score: 18, // Admin manually assigned 18
                    isManuallyGraded: true, // ADMIN LOCK
                    aiEvaluation: {
                        isEvaluated: true,
                        status: 'completed',
                        score: 36, // AI had scored 36
                        maxScore: 40
                    }
                }
            ],
            evaluation: {}
        };

        calculateSubmissionScore(mockSubmission, mockTest);

        // Score must remain 18, NOT 36
        assert.strictEqual(mockSubmission.answers[0].score, 18, "Admin manual score (18) must strictly prevail over AI score (36)");
        assert.strictEqual(mockSubmission.evaluation.webScore, 18, "webScore must be 18");
        assert.strictEqual(mockSubmission.totalScore, 18, "totalScore must be 18");
    });

    // TEST 7: Evaluated Solution Never Sent to LLM Again (Idempotency Guarantee)
    await reportAsync("Idempotency: Evaluated solution is strictly skipped on subsequent ticks", async () => {
        const { getJSONData, saveJSONData } = require('../config/db');
        const db = getJSONData();
        const testId = 'test_idempotent_1';
        const subId = 'sub_idempotent_1';

        db.tests = db.tests || [];
        db.testSubmissions = db.testSubmissions || [];

        // Setup test with enableAiEvaluation: true
        db.tests = db.tests.filter(t => String(t.id || t._id) !== testId);
        db.tests.push({
            id: testId,
            _id: testId,
            title: 'Idempotency Test Exam',
            enableAiEvaluation: true,
            isDeleted: false,
            questions: [{ id: 'q_web_1', type: 'web', points: 20, title: 'Web Test', description: 'Create a header.' }]
        });

        // Setup submission with an already-completed evaluation
        db.testSubmissions = db.testSubmissions.filter(s => String(s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            testId: testId,
            status: 'submitted',
            isDeleted: false,
            answers: [{
                questionId: 'q_web_1',
                type: 'web',
                submittedHtml: '<header><h1>Title</h1></header>',
                isManuallyGraded: false,
                aiEvaluation: {
                    isEvaluated: true,
                    status: 'completed',
                    evaluatedAt: new Date(),
                    score: 18,
                    maxScore: 20,
                    modelUsed: 'gemini-2.5-flash',
                    feedback: 'Already graded perfectly.'
                }
            }]
        });
        saveJSONData(db);

        // Run worker
        const result = await evaluateWebCodingSubmissions(testId);
        assert.strictEqual(result.evaluatedCount, 0, "Evaluated count must be 0 because answer is already completed!");

        // Clean up
        db.tests = db.tests.filter(t => String(t.id || t._id) !== testId);
        db.testSubmissions = db.testSubmissions.filter(s => String(s.id || s._id) !== subId);
        saveJSONData(db);
    });

    console.log("===============================================================================");
    console.log(`   TEST RUN COMPLETED: ${passedTests} Passed, ${failedTests} Failed`);
    console.log("===============================================================================");

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error("Unhandled test suite error:", err);
    process.exit(1);
});
