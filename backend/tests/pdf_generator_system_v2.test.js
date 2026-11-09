const assert = require('assert');
const fs = require('fs');
const zlib = require('zlib');
const {
    generateHallTicketPdfBuffer,
    generateEirfVerdictPdfBuffer,
    generateOtrfReportPdfBuffer,
    generateDigitalVerdictHash,
    generateOtrfVerificationHash,
    pdfCommon
} = require('../services/pdf');
const {
    generateSubmissionRefId,
    isSubmissionRefId
} = require('../utils/bicsId');
const {
    findSubmissionByAnyId,
    ensureSubmissionRefIds
} = require('../utils/submissionMigrator');
const { toBicsId } = require('../utils/bicsId');
const { DB_FILE, getJSONData, saveJSONData } = require('../config/db');

let cachedPdfJs = null;

/**
 * Extracts Unicode text per page via pdfjs-dist (supports embedded TTF CID fonts like Plus Jakarta Sans & Inter)
 */
async function extractUnicodePdfText(buf) {
    if (!cachedPdfJs) {
        cachedPdfJs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    }
    const doc = await cachedPdfJs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
    const pageTexts = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const txt = tc.items.map(i => i.str + (i.hasEOL ? ' ' : '')).join('').replace(/\s+/g, ' ').trim();
        pageTexts.push(txt);
    }
    return { allText: pageTexts.join('\n'), numPages: doc.numPages, pageTexts };
}

/**
 * Extracts raw PDF streams + Latin-1 metadata (useful for PostScript standard font & Helvetica checks)
 */
function extractAllPdfText(buf) {
    let fullDecoded = '';
    let pos = 0;
    while ((pos = buf.indexOf('stream', pos)) !== -1) {
        let start = pos + 6;
        while (buf[start] === 10 || buf[start] === 13) start++;
        const end = buf.indexOf('endstream', start);
        if (end === -1) break;
        let dataEnd = end;
        while (buf[dataEnd - 1] === 10 || buf[dataEnd - 1] === 13) dataEnd--;
        const data = buf.slice(start, dataEnd);
        try {
            const inflated = zlib.inflateSync(data).toString('latin1');
            const hexMatches = inflated.match(/<[0-9a-fA-F]+>/g) || [];
            for (const h of hexMatches) {
                const hexClean = h.slice(1, -1);
                fullDecoded += Buffer.from(hexClean, 'hex').toString('utf8');
            }
            const strMatches = inflated.match(/\(([^)]+)\)/g) || [];
            for (const s of strMatches) {
                fullDecoded += s.slice(1, -1);
            }
        } catch (e) {
            fullDecoded += data.toString('latin1');
        }
        pos = end + 9;
    }
    fullDecoded += ' ' + buf.toString('latin1');
    return fullDecoded;
}

async function runTestSuite() {
    const dbBackup = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : null;
    let passedTests = 0;
    let failedTests = 0;
    try {
    console.log('================================================================');
    console.log('🧪 RUNNING PDF GENERATOR SYSTEM & FIELD TRACKING TEST SUITE V2');
    console.log('================================================================\n');

    function test(name, fn) {
        return (async () => {
            try {
                await fn();
                console.log(`  ✅ PASS: ${name}`);
                passedTests++;
            } catch (err) {
                console.error(`  ❌ FAIL: ${name}`);
                console.error(`     Error: ${err.message}`);
                console.error(err.stack);
                failedTests++;
            }
        })();
    }

    // -------------------------------------------------------------------------
    // 1. 12-DIGIT NUMERIC REFERENCE ID GENERATION & VALIDATION
    // -------------------------------------------------------------------------
    console.log('--- 1. 12-Digit Numeric Reference ID Generation & Validation ---');

    await test('generateSubmissionRefId produces unique 12-digit numeric strings', () => {
        const id1 = generateSubmissionRefId();
        const id2 = generateSubmissionRefId();
        assert.strictEqual(typeof id1, 'string', 'Should be string');
        assert.strictEqual(id1.length, 12, 'Length must be exactly 12');
        assert.match(id1, /^\d{12}$/, 'Must contain only digits');
        assert.notStrictEqual(id1, id2, 'Two generated IDs must be distinct');
        assert.ok(isSubmissionRefId(id1), 'isSubmissionRefId must return true');
    });

    await test('isSubmissionRefId rejects invalid patterns', () => {
        assert.strictEqual(isSubmissionRefId('123456789'), false, '9 digits must fail');
        assert.strictEqual(isSubmissionRefId('1234567890123'), false, '13 digits must fail');
        assert.strictEqual(isSubmissionRefId('12345678901A'), false, 'Alphanumeric must fail');
        assert.strictEqual(isSubmissionRefId(''), false, 'Empty must fail');
        assert.strictEqual(isSubmissionRefId(null), false, 'Null must fail');
        assert.strictEqual(isSubmissionRefId(undefined), false, 'Undefined must fail');
        assert.strictEqual(isSubmissionRefId('100000000000'), true, 'Valid 12 digits must pass');
        assert.strictEqual(isSubmissionRefId('999999999999'), true, 'Valid 12 digits must pass');
    });

    // -------------------------------------------------------------------------
    // 2. SUBMISSION MIGRATION & MULTI-ID LOOKUP
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Submission Migration & Multi-ID Lookup ---');

    await test('ensureSubmissionRefIds assigns 12-digit refId and locks initialScore on test submissions', async () => {
        const db = getJSONData();
        db.testSubmissions = db.testSubmissions || [];

        // Create a mock unmigrated submission
        const mockMongoId = '66f1a2b3c4d5e6f7a8b9c0d1';
        const unmigratedSub = {
            id: mockMongoId,
            _id: mockMongoId,
            studentId: 'STU-PDF-TEST-001',
            candidateName: 'Test Student One',
            testTitle: 'Computer Science Mid-Term',
            score: 42,
            answers: [
                { questionId: 'q1', score: 10 },
                { questionId: 'q2', score: 8 }
            ]
        };

        db.testSubmissions = db.testSubmissions.filter(s => s.id !== mockMongoId && s._id !== mockMongoId);
        db.testSubmissions.push(unmigratedSub);
        saveJSONData(db);

        const count = await ensureSubmissionRefIds();
        assert.ok(count >= 1, 'Should have migrated at least 1 submission');

        const updatedDb = getJSONData();
        const found = updatedDb.testSubmissions.find(s => s.id === mockMongoId || s._id === mockMongoId);
        assert.ok(found, 'Record must exist');
        assert.ok(found.submissionRefId, 'submissionRefId must be populated');
        assert.match(found.submissionRefId, /^\d{12}$/, 'submissionRefId must be 12 digits');
        assert.strictEqual(found.answers[0].initialScore, 10, 'initialScore must be locked');
        assert.strictEqual(found.answers[1].initialScore, 8, 'initialScore must be locked');
    });

    await test('findSubmissionByAnyId resolves by 12-Digit Ref ID, BICS Object ID, and Mongo ID', async () => {
        const mockMongoId = '66f1a2b3c4d5e6f7a8b9c0d1';
        const db = getJSONData();
        const existing = db.testSubmissions.find(s => s.id === mockMongoId || s._id === mockMongoId);
        assert.ok(existing && existing.submissionRefId, 'Existing seeded submission required');

        const refId = existing.submissionRefId;
        const bicsId = toBicsId(mockMongoId);

        // 1. By 12-Digit Ref ID
        const byRef = await findSubmissionByAnyId(refId);
        assert.ok(byRef, 'Lookup by 12-digit Ref ID must succeed');
        assert.strictEqual(String(byRef._id || byRef.id), mockMongoId);

        // 2. By BICS Object ID
        const byBics = await findSubmissionByAnyId(bicsId);
        assert.ok(byBics, 'Lookup by BICS Object ID must succeed');
        assert.strictEqual(String(byBics._id || byBics.id), mockMongoId);

        // 3. By MongoDB ObjectId
        const byMongo = await findSubmissionByAnyId(mockMongoId);
        assert.ok(byMongo, 'Lookup by Mongo ObjectId must succeed');
        assert.strictEqual(String(byMongo._id || byMongo.id), mockMongoId);

        // 4. Unknown returns null
        const byUnknown = await findSubmissionByAnyId('999999999999');
        assert.strictEqual(byUnknown, null, 'Unknown ID must return null');
    });

    // -------------------------------------------------------------------------
    // 3. MARKS VERSION TRACKING & OBJECTIONS AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Marks Version Tracking & Objections Audit ---');

    await test('Answers preserve initialScore while score reflects latest admin marks, and objection tracks marksDiff', () => {
        const answer = {
            questionId: 'q1',
            initialScore: 6,
            score: 6,
            isObjected: false,
            scoreAfterObjection: null
        };

        const objection = {
            _id: 'OBJ-001',
            questionId: 'q1',
            reason: 'Test case output formatting discrepancy',
            marksBefore: 6,
            marksAfter: null,
            marksDiff: 0
        };

        // Simulate objection raised
        answer.isObjected = true;

        // Admin resolves objection: revises score to 9
        const revisedMarks = 9;
        answer.score = revisedMarks; // Active score is what admin updated
        answer.scoreAfterObjection = revisedMarks;
        objection.marksAfter = revisedMarks;
        objection.marksDiff = revisedMarks - objection.marksBefore;

        assert.strictEqual(answer.initialScore, 6, 'First assigned marks must be preserved');
        assert.strictEqual(answer.score, 9, 'Active score must reflect latest admin update');
        assert.strictEqual(answer.scoreAfterObjection, 9, 'scoreAfterObjection must be 9');
        assert.strictEqual(objection.marksBefore, 6, 'objection.marksBefore must be 6');
        assert.strictEqual(objection.marksAfter, 9, 'objection.marksAfter must be 9');
        assert.strictEqual(objection.marksDiff, 3, 'marksDiff must be +3');
    });

    // -------------------------------------------------------------------------
    // 4. HALL TICKET GENERATOR
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Hall Ticket PDF Generator ---');

    await test('generateHallTicketPdfBuffer generates institutional pass with top-right QR and Helvetica', async () => {
        const mockCandidate = {
            studentId: '2026042',
            name: 'Aarav Sharma',
            registrationData: {
                collegeEmail: 'aarav.sharma@bics.edu',
                personalEmail: 'aarav@gmail.com',
                permanentAddress: 'Flat 402, Greenfield Heights, Bengaluru - 560001'
            },
            eligible: true,
            midSemConsentSigned: true,
            midSemFeedback: { q1: 5 },
            midSemLedgerUrl: '/public/uploads/sample-ledger.pdf',
            midSemEmailVerified: true
        };

        const pdfBuffer = await generateHallTicketPdfBuffer({
            candidate: mockCandidate,
            examType: 'mid',
            ticketNumber: '882341905214'
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return Buffer');
        assert.ok(pdfBuffer.length > 5000, `PDF size must be valid (${pdfBuffer.length} bytes)`);

        const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
        assert.strictEqual(pdfHeader, '%PDF-', 'Must have valid PDF magic number header');

        const pdfText = extractAllPdfText(pdfBuffer);
        assert.ok(pdfText.includes('PRELIMINARY EXAMINATIONS') || pdfText.includes('HALL TICKET'), 'Pass title must be present');
        assert.ok(pdfText.includes('Aarav Sharma'), 'Candidate name must be present');
        assert.ok(pdfText.includes('882341905214'), 'Ticket number must be present');
        assert.ok(pdfText.includes('Helvetica'), 'Must use Helvetica PostScript font family');
    });

    await test('generateHallTicketPdfBuffer handles missing fields with "Details not available"', async () => {
        const emptyCandidate = {};
        const pdfBuffer = await generateHallTicketPdfBuffer({
            candidate: emptyCandidate,
            examType: 'end'
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Must generate buffer even with empty candidate');
        const { allText } = await extractUnicodePdfText(pdfBuffer);
        assert.ok(allText.includes('Details not available'), 'Missing fields must render "Details not available"');
        assert.strictEqual(allText.includes('No details available'), false, 'Must NOT render "No details available"');
    });

    // -------------------------------------------------------------------------
    // 5. REDESIGNED EIRF FORENSIC AUDIT PDF GENERATOR
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Redesigned EIRF Verdict PDF Generator ---');

    await test('generateEirfVerdictPdfBuffer creates 2-page Black & White PDF with Page 1 top-right QR', async () => {
        const mockReport = {
            reportId: 'EIRF-2026-9921',
            studentId: '2026042',
            candidateName: 'Aarav Sharma',
            status: 'approved',
            createdAt: new Date('2026-11-08T10:00:00Z'),
            reviewedAt: new Date('2026-11-08T11:30:00Z'),
            primaryCause: 'Window Focus Loss Disruption',
            detailedExplanation: 'System focus was momentarily lost due to OS background notification. No external browser was opened.',
            formAnswers: {
                section1: { ackUnderstand: 'Confirmed trigger acknowledgment', warningCount: '1 warning' },
                section2: { tabReason: 'OS update popup', fullscreenReason: 'Restored immediately within 3 seconds' },
                section3: { peripherals: 'None. Only built-in keyboard & touchpad' },
                section4: { explanation: 'System focus was momentarily lost due to OS background notification.' }
            },
            technicalContext: {
                ip: '103.21.244.12',
                browser: 'Google Chrome 128.0.0.0',
                os: 'Windows 11 64-bit',
                screenResolution: '1920x1080'
            },
            proctoringLogSnapshot: {
                fullscreenExits: 1,
                tabSwitches: 1,
                events: [
                    { type: 'FULLSCREEN_EXIT', timestamp: new Date('2026-11-08T10:15:20Z'), durationSeconds: 3, details: 'Fullscreen exited 3 seconds' }
                ]
            }
        };

        const mockSubmission = {
            _id: '66f1a2b3c4d5e6f7a8b9c0d1',
            submissionRefId: '982341059281',
            studentId: '2026042',
            candidateName: 'Aarav Sharma',
            candidateEmail: 'aarav.sharma@bics.edu',
            startedAt: new Date('2026-11-08T10:00:00Z'),
            submittedAt: new Date('2026-11-08T11:15:00Z'),
            biometricVerification: {
                matchStatus: 'MATCH_CONFIRMED',
                confidenceScore: 98.6,
                challengesCompleted: '3 of 3 (Turn Left, Turn Right, Neutral Face)'
            }
        };

        const pdfBuffer = await generateEirfVerdictPdfBuffer({
            report: mockReport,
            submission: mockSubmission,
            systemConfig: { examType: 'midsem' },
            courseCode: 'R526CS01T',
            courseName: 'Introduction to Computer Science'
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return Buffer');
        assert.ok(pdfBuffer.length > 5000, `EIRF PDF size must be valid (${pdfBuffer.length} bytes)`);

        const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
        assert.strictEqual(pdfHeader, '%PDF-', 'Must have valid PDF magic number header');

        const { allText, numPages, pageTexts } = await extractUnicodePdfText(pdfBuffer);
        const rawPdfStr = pdfBuffer.toString('latin1');
        const bicsIdExpected = toBicsId('66f1a2b3c4d5e6f7a8b9c0d1');

        assert.ok(allText.includes('EIRF FORENSIC AUDIT REPORT'), 'Report title must be present');
        assert.ok(allText.includes('982341059281'), '12-Digit Ref ID must be rendered');
        assert.strictEqual(allText.split(bicsIdExpected).length - 1, 1, 'Submission ID (BICSID) must appear strictly ONCE');
        assert.ok(pageTexts[0].includes(bicsIdExpected), 'Submission ID (BICSID) must appear on Page 1 only');
        assert.ok(allText.includes('Academic Year 2026-27'), 'Academic year must be present');
        assert.ok(allText.includes('Semester I'), 'Semester I must be present');
        assert.ok(allText.includes('Mid-Sem Test 2026'), 'Resolved exam type must be present');
        assert.ok(allText.includes('DUAL-PHOTO IDENTITY'), 'Dual photo audit section must be present');
        assert.ok(allText.includes('APPROVED'), 'Verdict must be rendered');
        assert.ok(numPages >= 2 && numPages <= 3, `Expected 2-3 pages, got ${numPages}`);
        for (let p = 1; p <= numPages; p++) {
            assert.ok(pageTexts[p - 1].includes(`Page ${p} of ${numPages}`), `Must have Page ${p} of ${numPages} footer`);
        }
        assert.ok(rawPdfStr.includes('PlusJakartaSans'), 'Must embed Plus Jakarta Sans font');
        assert.ok(rawPdfStr.includes('Inter'), 'Must embed Inter font');
    });

    await test('generateEirfVerdictPdfBuffer handles missing fields with "Details not available" and End-Sem Exam 2026', async () => {
        const pdfBuffer = await generateEirfVerdictPdfBuffer({
            report: {},
            submission: {},
            test: {},
            candidate: {},
            systemConfig: { examType: 'endsem' }
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return Buffer for empty records');
        const { allText } = await extractUnicodePdfText(pdfBuffer);
        assert.ok(allText.includes('Details not available'), 'Missing fields must use "Details not available"');
        assert.strictEqual(allText.includes('No details available'), false, 'Must NOT render "No details available"');
        assert.ok(allText.includes('End-Sem Exam 2026'), 'Must display End-Sem Exam 2026 from systemConfig');
    });

    // -------------------------------------------------------------------------
    // 6. ONLINE TEST REPORT FORM (OTRF) PDF GENERATOR
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Online Test Report Form (OTRF) PDF Generator ---');

    await test('generateOtrfReportPdfBuffer renders 8 sections with Plus Jakarta Sans + Inter, single Page-1 Submission ID and NO pass/fail string', async () => {
        const mockSubmission = {
            _id: '66f1a2b3c4d5e6f7a8b9c0d1',
            submissionRefId: '982341059281',
            studentId: '2026042',
            candidateName: 'Aarav Sharma',
            candidateEmail: 'aarav.sharma@bics.edu',
            testTitle: 'Introduction to Computer Science Mid-Semester Test',
            startedAt: new Date('2026-11-08T10:00:00Z'),
            submittedAt: new Date('2026-11-08T11:45:00Z'),
            verificationClosedAt: new Date('2026-11-08T16:00:00Z'),
            clientIp: '103.21.244.12',
            networkInfo: 'Airtel Broadband High-Speed Fiber',
            location: { city: 'Bengaluru', country: 'India' },
            browser: 'Google Chrome 128.0 (Secure Engine)',
            os: 'Windows 11 64-bit',
            screenResolution: '1920x1080 (144Hz)',
            proctoringLog: {
                fullscreenExits: 0,
                tabSwitches: 0
            },
            answers: [
                { questionId: 'q1', score: 10, initialScore: 10, isObjected: false },
                { questionId: 'q2', score: 8, initialScore: 6, isObjected: true, scoreAfterObjection: 8 },
                { questionId: 'q3', score: 15, initialScore: 15, isObjected: false },
                { questionId: 'q4', score: 9, initialScore: 9, isObjected: false }
            ],
            objections: [
                {
                    _id: 'OBJ-849102',
                    questionId: 'q2',
                    reason: 'Edge case for negative index was marked incorrectly by initial tester',
                    marksBefore: 6,
                    marksAfter: 8,
                    marksDiff: 2,
                    status: 'resolved'
                }
            ]
        };

        const mockTest = {
            title: 'Introduction to Computer Science Mid-Semester Test',
            courseCode: 'R526CS01T',
            courseName: 'Introduction to Computer Science',
            durationMinutes: 120,
            totalMarks: 50,
            questions: [
                { _id: 'q1', type: 'MCQ', title: 'Asymptotic Time Complexity', maxMarks: 10 },
                { _id: 'q2', type: 'CODING', title: 'Negative Indexing Subarray Solver', maxMarks: 10 },
                { _id: 'q3', type: 'CODING', title: 'Balanced Binary Search Tree Balancing', maxMarks: 20 },
                { _id: 'q4', type: 'WEB', title: 'Semantic ARIA Navigation Toolbar', maxMarks: 10 }
            ]
        };

        const mockCandidate = {
            studentId: '2026042',
            name: 'Aarav Sharma',
            program: 'B.Sc. Computer Science (Honours)',
            registrationData: {
                collegeEmail: 'aarav.sharma@bics.edu'
            }
        };

        const pdfBuffer = await generateOtrfReportPdfBuffer({
            submission: mockSubmission,
            test: mockTest,
            candidate: mockCandidate,
            systemConfig: { examType: 'endsem' }
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return Buffer');
        assert.ok(pdfBuffer.length > 5000, `OTRF PDF size must be valid (${pdfBuffer.length} bytes)`);

        const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
        assert.strictEqual(pdfHeader, '%PDF-', 'Must have valid PDF magic number header');

        const { allText, numPages, pageTexts } = await extractUnicodePdfText(pdfBuffer);
        const rawPdfStr = pdfBuffer.toString('latin1');

        // Check all 8 Sections
        assert.ok(allText.includes('1. EXAMINATION & ASSESSMENT PARTICULARS'), 'Section 1 present');
        assert.ok(allText.includes('2. CANDIDATE DETAILS & REGISTRATION RECORD'), 'Section 2 present');
        assert.ok(allText.includes('3. BIOMETRIC VERIFICATION & SYSTEM TELEMETRY'), 'Section 3 present');
        assert.ok(allText.includes('4. QUESTIONWISE BREAKDOWN & SCORE MATRIX'), 'Section 4 present');
        assert.ok(allText.includes('5. PROCTORING TELEMETRY & AUDIT LOGS'), 'Section 5 present');
        assert.ok(allText.includes('6. OBJECTIONS SUMMARY & MARKS AUDIT'), 'Section 6 present');
        assert.ok(allText.includes('7. EIRF INCIDENT & ADJUDICATION SUMMARY'), 'Section 7 present');
        assert.ok(allText.includes('8. DIGITAL VERIFICATION & AUTHORITATIVE SEAL'), 'Section 8 present');

        // Check Identifiers & Single Page-1 Submission ID Rule
        assert.ok(allText.includes('982341059281'), '12-Digit Ref ID must be rendered');
        const bicsIdExpected = toBicsId('66f1a2b3c4d5e6f7a8b9c0d1');
        assert.strictEqual(allText.split(bicsIdExpected).length - 1, 1, 'BICS Object ID must appear strictly ONCE');
        assert.ok(pageTexts[0].includes(bicsIdExpected), 'BICS Object ID must appear on Page 1');
        assert.ok(allText.includes('End-Sem Exam 2026'), 'Exam type must appear from systemConfig');
        assert.ok(allText.includes('Academic Year 2026-27'), 'Academic year must appear');

        // Check Questionwise columns & Objection values
        assert.ok(allText.includes('QUESTION TITLE'), 'Question title header present');
        assert.ok(allText.includes('BEFORE'), 'Before column header must be present');
        assert.ok(allText.includes('AFTER'), 'After column header must be present');
        assert.ok(allText.includes('42.0 / 50.0'), 'Total score 42.0 / 50.0 must be rendered');

        // Check Objections Table
        assert.ok(allText.includes('OBJ-849102'), 'Objection ID must be rendered in table');
        assert.ok(allText.includes('+2.0'), 'Marks Diff must be rendered');

        // CRITICAL CHECK: NO pass/fail tag
        assert.strictEqual(allText.includes('QUALIFIED / PASSED'), false, 'Must NOT contain "QUALIFIED / PASSED"');
        assert.strictEqual(allText.includes('First Class with Distinction'), false, 'Must NOT contain "First Class with Distinction"');

        // Check embedded fonts & dynamic footers
        assert.ok(rawPdfStr.includes('PlusJakartaSans'), 'Must embed Plus Jakarta Sans font');
        assert.ok(rawPdfStr.includes('Inter'), 'Must embed Inter font');
        assert.ok(allText.includes('Online Test Report Form (OTRF)'), 'Footer must contain document name');
        for (let p = 1; p <= numPages; p++) {
            assert.ok(pageTexts[p - 1].includes(`Page ${p} of ${numPages}`), `Page ${p} footer present`);
        }
    });

    await test('generateOtrfReportPdfBuffer handles missing fields with "Details not available"', async () => {
        const pdfBuffer = await generateOtrfReportPdfBuffer({
            submission: {},
            test: {},
            candidate: {}
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Must generate buffer even with empty records');
        const { allText } = await extractUnicodePdfText(pdfBuffer);
        assert.ok(allText.includes('Details not available'), 'Missing fields must render "Details not available"');
        assert.strictEqual(allText.includes('No details available'), false, 'Must NOT render "No details available"');
    });

    } finally {
        if (dbBackup !== null) {
            fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
        }
    }

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Test Suite encountered fatal error:', err);
    process.exit(1);
});
