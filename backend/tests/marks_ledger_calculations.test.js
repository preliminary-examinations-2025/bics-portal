const assert = require('assert');
const { calculateMarksLedgerEntry } = require('../utils/scoreCalculator');

console.log('--- Starting Marks Ledger Lab Calculation Verification Suite ---');

// TC-01: Best 5 of 7 Kata Contests
{
    const entry = {
        studentId: 'STU001',
        studentName: 'Alice',
        labPracticals: { p1: 10, p2: 10, p3: 10, p4: 10, p5: 10, p6: 10, p7: 10, p8: 10, p9: 10, p10: 10 }, // 20m
        labKataContests: [
            { contestId: 'SHIN01', scaledMark: 1.0 },
            { contestId: 'SHIN02', scaledMark: 0.8 },
            { contestId: 'SHIN03', scaledMark: 0.6 },
            { contestId: 'SHIN04', scaledMark: 0.4 },
            { contestId: 'SHIN05', scaledMark: 0.2 },
            { contestId: 'SHIN06', scaledMark: 0.9 },
            { contestId: 'SHIN07', scaledMark: 0.5 }
        ],
        labQuizzes: { quiz1: 40, quiz2: 60 }, // 5m
        labProject: 250 // 10m
    };
    const res = calculateMarksLedgerEntry(entry, 'lab');
    // Top 5 sorted: 1.0, 0.9, 0.8, 0.6, 0.5 => sum = 3.80
    assert.strictEqual(res.taKata, 3.80, `TC-01 Failed: expected 3.80, got ${res.taKata}`);
    console.log('✅ TC-01 Passed: Best 5 of 7 Kata Contests correctly evaluated to 3.80 / 5.0m');
}

// TC-02: Fewer than 5 Kata Contests Attempted
{
    const entry = {
        studentId: 'STU002',
        studentName: 'Bob',
        labKataContests: [
            { contestId: 'SHIN01', scaledMark: 1.0 },
            { contestId: 'SHIN02', scaledMark: 1.0 },
            { contestId: 'SHIN03', scaledMark: 0.5 }
        ]
    };
    const res = calculateMarksLedgerEntry(entry, 'lab');
    // Top 5: 1.0, 1.0, 0.5 => sum = 2.50
    assert.strictEqual(res.taKata, 2.50, `TC-02 Failed: expected 2.50, got ${res.taKata}`);
    console.log('✅ TC-02 Passed: Student with 3 contests evaluated to 2.50 / 5.0m');
}

// TC-03: Perfect Score Capping
{
    const entry = {
        studentId: 'STU003',
        studentName: 'Charlie',
        labKataContests: [
            { contestId: 'FORMA01', scaledMark: 1.0 },
            { contestId: 'FORMA02', scaledMark: 1.0 },
            { contestId: 'FORMA03', scaledMark: 1.0 },
            { contestId: 'FORMA04', scaledMark: 1.0 },
            { contestId: 'FORMA05', scaledMark: 1.0 },
            { contestId: 'FORMA06', scaledMark: 1.0 },
            { contestId: 'FORMA07', scaledMark: 1.0 }
        ]
    };
    const res = calculateMarksLedgerEntry(entry, 'lab');
    assert.strictEqual(res.taKata, 5.00, `TC-03 Failed: expected 5.00, got ${res.taKata}`);
    console.log('✅ TC-03 Passed: Perfect 7 contests strictly capped at 5.00m');
}

// TC-04: Lab Quizzes (Online 40m + Written 60m = 100m -> scaled to 5m)
{
    const entry = {
        studentId: 'STU004',
        studentName: 'Diana',
        labQuizzes: { quiz1: 36, quiz2: 54 } // 36 + 54 = 90 / 100 => 4.5m
    };
    const res = calculateMarksLedgerEntry(entry, 'lab');
    assert.strictEqual(res.taLabQuiz, 4.50, `TC-04 Failed: expected 4.50, got ${res.taLabQuiz}`);
    console.log('✅ TC-04 Passed: Lab Quizzes (36/40 + 54/60 = 90/100) scaled to 4.50 / 5.0m');
}

// TC-05: Total TA Balance (Practicals 20 + Kata 5 + Quizzes 5 + Project 10 = 40m)
{
    const entry = {
        studentId: 'STU005',
        studentName: 'Evan',
        labPracticals: { p1: 9.5, p2: 9.5, p3: 9.5, p4: 9.5, p5: 9.5, p6: 9, p7: 9, p8: 9, p9: 9, p10: 9 }, // 92.5/100 * 20 = 18.5m
        labKataContests: [
            { contestId: 'SHIN01', scaledMark: 1.0 },
            { contestId: 'SHIN02', scaledMark: 1.0 },
            { contestId: 'SHIN03', scaledMark: 1.0 },
            { contestId: 'SHIN04', scaledMark: 0.9 },
            { contestId: 'SHIN05', scaledMark: 0.6 }
        ], // 4.5m
        labQuizzes: { quiz1: 36, quiz2: 54 }, // 4.5m
        labProject: 225 // 225/250 * 10 = 9.0m
    };
    const res = calculateMarksLedgerEntry(entry, 'lab');
    // totalTa = 18.5 + 4.5 + 4.5 + 9.0 = 36.50
    assert.strictEqual(res.totalTa, 36.50, `TC-05 Failed: expected 36.50, got ${res.totalTa}`);
    console.log('✅ TC-05 Passed: Total TA summation = 36.50 / 40.0m');
}

// TC-06: ESE Lab Exam (100 Online + 100 Written + 25 Experiment + 25 Viva = 250m -> scaled to 40m)
{
    const entry = {
        studentId: 'STU006',
        studentName: 'Fiona',
        eseWritten: 85,
        eseOnline: 90,
        eseExperiment: 22.5,
        eseViva: 20
        // rawEse = 85 + 90 + 22.5 + 20 = 217.5 / 250 * 40 = 34.80m
    };
    const res = calculateMarksLedgerEntry(entry, 'lab');
    assert.strictEqual(res.scaledEse, 34.80, `TC-06 Failed: expected 34.80, got ${res.scaledEse}`);
    console.log('✅ TC-06 Passed: ESE Lab (217.5/250 * 40) scaled to 34.80 / 40.0m');
}

// TC-07: Full Consolidated Score and Grade
{
    const entry = {
        studentId: 'STU007',
        studentName: 'George',
        labPracticals: { p1: 9.5, p2: 9.5, p3: 9.5, p4: 9.5, p5: 9.5, p6: 9, p7: 9, p8: 9, p9: 9, p10: 9 }, // 18.5m
        labKataContests: [
            { contestId: 'SHIN01', scaledMark: 1.0 },
            { contestId: 'SHIN02', scaledMark: 1.0 },
            { contestId: 'SHIN03', scaledMark: 1.0 },
            { contestId: 'SHIN04', scaledMark: 0.9 },
            { contestId: 'SHIN05', scaledMark: 0.6 }
        ], // 4.5m
        labQuizzes: { quiz1: 36, quiz2: 54 }, // 4.5m
        labProject: 225, // 9.0m -> Total TA = 36.50m
        mstWritten: 36,
        mstOnline: 36,
        mstViva: 18, // rawMst = 90 / 100 * 20 = 18.00m
        eseWritten: 85,
        eseOnline: 90,
        eseExperiment: 22.5,
        eseViva: 20 // rawEse = 217.5 / 250 * 40 = 34.80m
    };
    // Final score = 36.50 + 18.00 + 34.80 = 89.30m
    const res = calculateMarksLedgerEntry(entry, 'lab');
    assert.strictEqual(res.totalTa, 36.50, `TC-07 totalTa: expected 36.50, got ${res.totalTa}`);
    assert.strictEqual(res.scaledMst, 18.00, `TC-07 scaledMst: expected 18.00, got ${res.scaledMst}`);
    assert.strictEqual(res.scaledEse, 34.80, `TC-07 scaledEse: expected 34.80, got ${res.scaledEse}`);
    assert.strictEqual(res.finalScore, 89.30, `TC-07 finalScore: expected 89.30, got ${res.finalScore}`);
    assert.strictEqual(res.grade, 'AB', `TC-07 grade: expected AB, got ${res.grade}`);
    assert.strictEqual(res.gradePoint, 9, `TC-07 gradePoint: expected 9, got ${res.gradePoint}`);
    assert.strictEqual(res.status, 'PASS', `TC-07 status: expected PASS, got ${res.status}`);
    console.log('✅ TC-07 Passed: Full consolidated course grade = 89.30 / 100m, Grade: AB (9 GP), Status: PASS');
}

console.log('🎉 ALL 7 TEST CASES PASSED SUCCESSFULLY!');
