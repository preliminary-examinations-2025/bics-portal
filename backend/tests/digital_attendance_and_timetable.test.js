const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { ExamAttendanceModel } = require('../models/ExamAttendance');
const authRouter = require('../routes/auth');
const normalizeTimetableRows = authRouter.normalizeTimetableRows;

const SYSTEM_SECRET = process.env.ATTENDANCE_SECRET_KEY || process.env.JWT_SECRET || 'bics_attendance_cryptographic_secret_2026';

function getTodayIST() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function generateSignedPaperToken({ courseCode, courseTitle, category, examDate, variant = 'Standard' }) {
    const cleanCourse = String(courseCode || '').trim();
    const cleanCategory = String(category || 'written').trim().toLowerCase();
    const cleanDate = String(examDate || getTodayIST()).trim();
    const salt = crypto.randomBytes(8).toString('hex');

    const payload = {
        courseCode: cleanCourse,
        courseTitle: String(courseTitle || cleanCourse).trim(),
        category: cleanCategory,
        examDate: cleanDate,
        variant,
        salt,
        issuedAt: Date.now()
    };

    const encodedData = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SYSTEM_SECRET).update(encodedData).digest('hex');
    const token = `${encodedData}.${signature}`;

    return { token, payload };
}

function verifyPaperToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Empty or invalid token structure.' };
    }
    const parts = token.trim().split('.');
    if (parts.length !== 2) {
        return { valid: false, error: 'Malformed token structure. Expected base64url.signature' };
    }

    const [encodedData, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SYSTEM_SECRET).update(encodedData).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        return { valid: false, error: 'Cryptographic signature mismatch. Token has been tampered with or expired.' };
    }

    try {
        const jsonStr = Buffer.from(encodedData, 'base64url').toString('utf-8');
        const payload = JSON.parse(jsonStr);
        return { valid: true, payload };
    } catch {
        return { valid: false, error: 'Invalid payload encoding.' };
    }
}

function deriveTrackingCode(digitalSignature, candidateId, courseCode) {
    const hash = crypto.createHash('sha256').update(`${digitalSignature}:${candidateId}:${courseCode}`).digest('hex');
    const numericBigInt = BigInt('0x' + hash.slice(0, 15));
    const tenDigit = (numericBigInt % 10000000000n).toString().padStart(10, '0');
    return tenDigit;
}

async function runTests() {
    console.log('--- STARTING DIGITAL ATTENDANCE & TIMETABLE SUITE ---');

    // 1. Paper Token Generation & HMAC Verification
    console.log('[Test 1] Testing paper token generation and cryptographic HMAC signature...');
    const today = getTodayIST();
    const { token, payload } = generateSignedPaperToken({
        courseCode: 'R526CS01L',
        courseTitle: 'C++ Programming Lab',
        category: 'online',
        examDate: today
    });

    assert.ok(token, 'Token must not be empty');
    assert.strictEqual(payload.courseCode, 'R526CS01L');
    assert.strictEqual(payload.category, 'online');
    assert.strictEqual(payload.examDate, today);

    const verified = verifyPaperToken(token);
    assert.strictEqual(verified.valid, true, 'Original token must be cryptographically valid');
    assert.strictEqual(verified.payload.courseCode, 'R526CS01L');
    console.log('  -> PASS: Valid token successfully verified.');

    // 2. Tampered Token Rejection
    console.log('[Test 2] Testing tamper detection on altered payload and altered signature...');
    const tamperedParts = token.split('.');
    const fakeData = Buffer.from(JSON.stringify({ ...payload, courseCode: 'TAMPERED' })).toString('base64url');
    const tamperedToken1 = `${fakeData}.${tamperedParts[1]}`;
    const tamperedCheck1 = verifyPaperToken(tamperedToken1);
    assert.strictEqual(tamperedCheck1.valid, false, 'Tampered payload must be rejected');

    const tamperedToken2 = `${tamperedParts[0]}.0000000000000000000000000000000000000000000000000000000000000000`;
    const tamperedCheck2 = verifyPaperToken(tamperedToken2);
    assert.strictEqual(tamperedCheck2.valid, false, 'Tampered signature must be rejected');
    console.log('  -> PASS: Tampered tokens strictly rejected.');

    // 3. Exam-Day IST Date Validation
    console.log('[Test 3] Testing Exam-Day date restriction...');
    const futureDateToken = generateSignedPaperToken({
        courseCode: 'R526CS01T',
        courseTitle: 'Theory Exam',
        category: 'written',
        examDate: '2026-12-25'
    }).token;

    const futureCheck = verifyPaperToken(futureDateToken);
    assert.strictEqual(futureCheck.valid, true);
    const isFutureExamToday = futureCheck.payload.examDate === today;
    assert.strictEqual(isFutureExamToday, false, 'Future exam date (2026-12-25) must not match today');
    console.log(`  -> PASS: Date matching verified. Token for 2026-12-25 correctly detected as not today (${today}).`);

    // 4. 10-Digit Tracking Code Derivation
    console.log('[Test 4] Testing 10-Digit Tracking Code generation...');
    const dummySig = crypto.createHmac('sha256', SYSTEM_SECRET).update('test-session').digest('hex');
    const code1 = deriveTrackingCode(dummySig, '241070001', 'R526CS01L');
    const code2 = deriveTrackingCode(dummySig, '241070002', 'R526CS01L');

    assert.strictEqual(code1.length, 10, 'Tracking code must be exactly 10 digits');
    assert.ok(/^\d{10}$/.test(code1), 'Tracking code must be purely numeric digits');
    assert.strictEqual(code2.length, 10, 'Tracking code must be exactly 10 digits');
    assert.notStrictEqual(code1, code2, 'Different candidates must receive different tracking codes');
    console.log(`  -> PASS: 10-digit codes derived: Candidate 1 = ${code1}, Candidate 2 = ${code2}`);

    // 5. Timetable Multi-Category Sanitization
    console.log('[Test 5] Testing Timetable Multi-Category schema normalization...');
    const rawTimetable = [
        { code: 'R526CS01T', course: 'Computer Science Theory', category: 'theory', date: '2026-11-20', time: '10:00 AM - 01:00 PM', marks: 100 },
        { code: 'R526CS01L', course: 'Computer Science Lab - Written', category: 'written', date: '2026-11-22', time: '02:00 PM - 05:00 PM', marks: 100 },
        { code: 'R526CS01L', course: 'Computer Science Lab - Online', category: 'online', date: '2026-11-23', time: '10:00 AM - 01:00 PM', marks: 100 },
        { code: 'R526CS01L', course: 'Computer Science Lab - Practical', category: 'practical', date: '2026-11-24', time: '09:00 AM - 01:00 PM', marks: 50 },
        { code: 'R526CS02T', course: 'Maths' } // category omitted, should default to theory
    ];

    const normalized = normalizeTimetableRows(rawTimetable);
    assert.strictEqual(normalized.length, 5);
    assert.strictEqual(normalized[0].category, 'theory');
    assert.strictEqual(normalized[1].category, 'written');
    assert.strictEqual(normalized[2].category, 'online');
    assert.strictEqual(normalized[3].category, 'practical');
    assert.strictEqual(normalized[4].category, 'theory', 'Omitted category must default to theory');
    console.log('  -> PASS: Timetable multi-categories successfully normalized and preserved.');

    console.log('--- ALL 5 DIGITAL ATTENDANCE & TIMETABLE TESTS PASSED ---');
}

runTests().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
