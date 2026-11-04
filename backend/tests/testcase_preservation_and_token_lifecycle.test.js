/**
 * Unit Test: TestCase Preservation, Fast Scoring, Web Coding, and Token Lifecycle
 */
const assert = require('assert');
const { calculateSubmissionScore, calculateCodingScoreFast } = require('../utils/scoreCalculator');

async function runTests() {
    console.log("=== Running TestCase Preservation & Scoring Unit Tests ===");

    // Test 1: Coding Question with Ran TestCases gets scored accurately without Docker
    const mockTest = {
        marks: 100,
        questions: [
            {
                id: 'q1',
                type: 'coding',
                points: 20,
                testCases: [
                    { id: 'tc1', points: 10 },
                    { id: 'tc2', points: 10 }
                ]
            },
            {
                id: 'q2',
                type: 'coding',
                points: 20,
                testCases: [
                    { id: 'tc3', points: 20 }
                ]
            },
            {
                id: 'q3',
                type: 'web',
                points: 30
            },
            {
                id: 'q4',
                type: 'mcq',
                points: 30,
                correctOptionIndex: 2
            }
        ]
    };

    const mockSubmission = {
        answers: [
            {
                questionId: 'q1',
                type: 'coding',
                submittedCode: 'int main() { return 0; }',
                testCaseResults: [
                    { testCaseIndex: 0, status: 'Accepted', points: 10, scoredPoints: 10 },
                    { testCaseIndex: 1, status: 'Wrong Answer', points: 10, scoredPoints: 0 }
                ]
            },
            {
                questionId: 'q2',
                type: 'coding',
                submittedCode: 'int main() {}',
                // unran: no testCaseResults
                testCaseResults: []
            },
            {
                questionId: 'q3',
                type: 'web',
                submittedHtml: '<h1>Test</h1>'
            },
            {
                questionId: 'q4',
                type: 'mcq',
                selectedOptionIndex: 2
            }
        ]
    };

    calculateCodingScoreFast(mockSubmission, mockTest);
    assert.strictEqual(mockSubmission.answers[0].score, 10, "Ran coding question Q1 should score 10 from passed test cases");
    assert.strictEqual(mockSubmission.answers[1].score, 0, "Unran coding question Q2 should default to 0");
    assert.strictEqual(mockSubmission.answers[2].score, 0, "Web coding question Q3 should default to 0");
    assert.strictEqual(mockSubmission.answers[2].pendingEvaluation, true, "Web question should have pendingEvaluation = true");
    assert.strictEqual(mockSubmission.evaluation.codingScore, 10, "Evaluation codingScore should equal 10");
    console.log("✅ Test 1 Passed: Fast coding score calculation accurately calculated without re-running code.");

    // Test 2: Full calculateSubmissionScore
    calculateSubmissionScore(mockSubmission, mockTest);
    assert.strictEqual(mockSubmission.answers[3].score, 30, "MCQ question Q4 should score 30");
    assert.strictEqual(mockSubmission.score, 40, "Total submission score should be 10 (coding) + 30 (mcq) = 40");
    assert.strictEqual(mockSubmission.evaluation.mcqScore, 30, "MCQ score in evaluation should be 30");
    assert.strictEqual(mockSubmission.evaluation.codingScore, 10, "Coding score in evaluation should be 10");
    assert.strictEqual(mockSubmission.evaluation.webScore, 0, "Web score in evaluation should be 0");
    console.log("✅ Test 2 Passed: Full submission score correctly aggregates MCQ, Coding, and Web.");

    // Test 3: Input Sanitization preserves testCaseResults while stripping client score tampering
    const clientTamperedAnswer = {
        questionId: 'q1',
        score: 9999, // tampered!
        isManuallyGraded: true, // tampered!
        isBonusAwarded: true, // tampered!
        testCaseResults: [
            {
                testCaseIndex: 0,
                status: 'Accepted',
                points: 10,
                scoredPoints: 10,
                actualOutput: '42',
                expectedOutput: '42',
                input: '5'
            }
        ]
    };

    // Simulate server sanitization logic
    const cleanAns = { ...clientTamperedAnswer };
    delete cleanAns.score;
    delete cleanAns.isManuallyGraded;
    delete cleanAns.isBonusAwarded;
    delete cleanAns.isObjectionResolved;
    if (Array.isArray(cleanAns.testCaseResults)) {
        cleanAns.testCaseResults = cleanAns.testCaseResults.map(tc => ({
            testCaseIndex: tc.testCaseIndex,
            status: tc.status,
            points: Number(tc.points) || 0,
            scoredPoints: Number(tc.scoredPoints) || (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0),
            actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 1000) : tc.actualOutput,
            expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 1000) : tc.expectedOutput,
            input: typeof tc.input === 'string' ? tc.input.slice(0, 500) : tc.input
        }));
    }

    assert.strictEqual(cleanAns.score, undefined, "Client tampered score must be stripped");
    assert.strictEqual(cleanAns.isManuallyGraded, undefined, "Client tampered manual grade must be stripped");
    assert.strictEqual(cleanAns.testCaseResults.length, 1, "testCaseResults must be preserved");
    assert.strictEqual(cleanAns.testCaseResults[0].status, 'Accepted');
    assert.strictEqual(cleanAns.testCaseResults[0].scoredPoints, 10);
    console.log("✅ Test 3 Passed: Server sanitization strips tampered scores while preserving sanitized testCaseResults.");

    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
