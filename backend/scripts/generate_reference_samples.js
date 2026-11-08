const fs = require('fs');
const path = require('path');
const { pdf } = require('pdf-to-img');
const {
    generateHallTicketPdfBuffer,
    generateEirfVerdictPdfBuffer,
    generateOtrfReportPdfBuffer
} = require('../services/pdf');

const ARTIFACT_DIR = 'C:\\Users\\Bubere\\.gemini\\antigravity\\brain\\9c915b72-1d2c-4aba-a5c4-9c279dd23f68';
const PUBLIC_SAMPLES_DIR = path.join(__dirname, '..', 'public', 'samples');

async function main() {
    console.log('📄 GENERATING OFFICIAL REFERENCE PDF SAMPLES FOR ALL 3 GENERATORS...');

    // Mock Candidate
    const candidate = {
        _id: '66f1a2b3c4d5e6f7a8b9c0d1',
        id: '66f1a2b3c4d5e6f7a8b9c0d1',
        studentId: '2026042',
        name: 'Aarav Sharma',
        program: 'Bachelor of Science (Computer Science Honours)',
        registrationData: {
            collegeEmail: 'aarav.sharma@bics.edu',
            personalEmail: 'aarav.sharma@gmail.com',
            permanentAddress: 'Flat 402, Greenfield Heights, Outer Ring Road, Bengaluru - 560001',
            photoUrl: path.join(__dirname, '..', 'public', 'uploads', 'question-1784488860298-pexels-christian-heitz-842711.jpg'),
            signatureUrl: '/public/uploads/sample-sig.png'
        },
        eligible: true,
        midSemConsentSigned: true,
        midSemFeedback: { rating: 5, comments: 'Excellent course coverage.' },
        midSemLedgerUrl: '/public/uploads/sample-ledger.pdf',
        midSemEmailVerified: true
    };

    // Mock Test
    const test = {
        _id: '66f1b2c3d4e5f6a7b8c9d0e1',
        id: '66f1b2c3d4e5f6a7b8c9d0e1',
        title: 'Introduction to Computer Science Mid-Semester Test',
        courseCode: 'R526CS01T',
        courseName: 'Introduction to Computer Science',
        durationMinutes: 120,
        totalMarks: 50,
        academicTerm: '2026-2027 Academic Term • Semester I',
        verificationStatus: 'closed',
        verificationClosedAt: new Date('2026-11-08T16:00:00Z'),
        questions: [
            { _id: 'q1', type: 'MCQ', maxMarks: 10, title: 'Algorithm Complexity Analysis' },
            { _id: 'q2', type: 'CODING', maxMarks: 10, title: 'Two-Pointer Subarray Sum' },
            { _id: 'q3', type: 'CODING', maxMarks: 20, title: 'Binary Tree Level Order Traversal' },
            { _id: 'q4', type: 'SUBJECTIVE', maxMarks: 10, title: 'Memory Hierarchy Principles' }
        ]
    };

    // Mock Submission
    const submission = {
        _id: '66f1a2b3c4d5e6f7a8b9c0d1',
        submissionRefId: '982341059281', // 12-digit numeric reference ID
        studentId: '2026042',
        candidateName: 'Aarav Sharma',
        candidateEmail: 'aarav.sharma@bics.edu',
        testId: test._id,
        testTitle: test.title,
        startedAt: new Date('2026-11-08T10:00:00Z'),
        submittedAt: new Date('2026-11-08T11:45:00Z'),
        verificationClosedAt: new Date('2026-11-08T16:00:00Z'),
        durationMinutes: 105,
        clientIp: '103.21.244.12',
        networkInfo: 'Airtel Broadband High-Speed Optical Fiber',
        location: { city: 'Bengaluru', region: 'Karnataka', country: 'India' },
        browser: 'Google Chrome 128.0.6613.120 (Secure Lockdown Engine)',
        os: 'Windows 11 Education x64 Build 22631',
        screenResolution: '1920x1080 (Primary Monitor 144Hz)',
        eirfReportId: 'EIRF-2026-89412',
        biometricVerification: {
            matchStatus: 'MATCH_CONFIRMED',
            confidenceScore: 98.6,
            challengesCompleted: '3 of 3 (Turn Head Left, Turn Head Right, Neutral Face)',
            baselinePhotoUrl: path.join(__dirname, '..', 'public', 'proctoring', '040i6i-awuh-qobz-htgmvk', '17937109805470.jpeg')
        },
        baselinePhotoUrl: path.join(__dirname, '..', 'public', 'proctoring', '040i6i-awuh-qobz-htgmvk', '17937109805470.jpeg'),
        proctoringLog: {
            fullscreenExits: 1,
            tabSwitches: 1,
            events: [
                {
                    type: 'FULLSCREEN_EXIT',
                    timestamp: new Date('2026-11-08T10:24:18Z'),
                    durationSeconds: 3,
                    details: 'Fullscreen departed for 3 seconds due to OS background window'
                }
            ]
        },
        answers: [
            { questionId: 'q1', score: 10, initialScore: 10, isObjected: false },
            { questionId: 'q2', score: 9, initialScore: 6, isObjected: true, scoreAfterObjection: 9 }, // Objected: initial 6, revised 9
            { questionId: 'q3', score: 16, initialScore: 16, isObjected: false },
            { questionId: 'q4', score: 8, initialScore: 8, isObjected: false }
        ],
        objections: [
            {
                objectionId: 'OBJ-2026-X8K9P', // Format OBJ-2026-XXXXX directly from DB
                questionId: 'q2',
                questionIndex: 1,
                reason: 'Discrepancy in handling zero-element boundary edge cases',
                details: 'My solution handles negative index constraints in O(N) time complexity as specified in Problem Statement 2.',
                marksBefore: 6,
                marksAfter: 9,
                marksDiff: 3,
                status: 'resolved',
                raisedAt: new Date('2026-11-08T12:30:00Z'),
                resolvedAt: new Date('2026-11-08T15:15:00Z'),
                adminRemarks: 'Candidate solution validated against expanded test harness. Edge case handling confirmed compliant.'
            }
        ]
    };

    // Mock EIRF Report
    const eirfReport = {
        reportId: 'EIRF-2026-89412',
        studentId: '2026042',
        candidateName: 'Aarav Sharma',
        status: 'approved',
        createdAt: new Date('2026-11-08T12:00:00Z'),
        reviewedAt: new Date('2026-11-08T14:30:00Z'),
        primaryCause: 'Transient OS Focus Interruption',
        detailedExplanation: 'An automatic system notification momentarily stole application focus for approximately 3 seconds. The browser testing terminal was immediately restored to fullscreen.',
        formAnswers: {
            section1: { ackUnderstand: 'Yes, candidate acknowledged recorded proctoring trigger.', warningCount: '1 warning remembered' },
            section2: { tabReason: 'Antivirus background update banner', fullscreenReason: 'Returned to terminal immediately within 3s' },
            section3: { peripherals: 'None. Standard integrated laptop keyboard and trackpad only.' },
            section4: { explanation: 'An automatic system notification momentarily stole application focus for approximately 3 seconds. The browser testing terminal was immediately restored to fullscreen.' }
        },
        technicalContext: {
            ip: '103.21.244.12',
            browser: 'Google Chrome 128.0.6613.120',
            os: 'Windows 11 Education x64',
            screenResolution: '1920x1080',
            hardwareConcurrency: 8
        },
        proctoringLogSnapshot: submission.proctoringLog
    };

    // -------------------------------------------------------------------------
    // 1. GENERATE HALL TICKET PDF
    // -------------------------------------------------------------------------
    console.log('Generating Hall Ticket Reference Sample...');
    const hallTicketBuffer = await generateHallTicketPdfBuffer({
        candidate,
        examType: 'mid',
        ticketNumber: '882341905214'
    });

    const hallTicketPathPub = path.join(PUBLIC_SAMPLES_DIR, 'hallticket_reference_sample.pdf');
    const hallTicketPathArt = path.join(ARTIFACT_DIR, 'hallticket_reference_sample.pdf');
    fs.writeFileSync(hallTicketPathPub, hallTicketBuffer);
    fs.writeFileSync(hallTicketPathArt, hallTicketBuffer);
    console.log(`Saved Hall Ticket PDF: ${hallTicketBuffer.length} bytes`);

    // -------------------------------------------------------------------------
    // 2. GENERATE EIRF VERDICT PDF (Strict B&W, 2 Pages, Top-Right QR)
    // -------------------------------------------------------------------------
    console.log('Generating EIRF Verdict Reference Sample...');
    const eirfBuffer = await generateEirfVerdictPdfBuffer({
        report: eirfReport,
        submission,
        test,
        candidate,
        courseCode: test.courseCode,
        courseName: test.courseName
    });

    const eirfPathPub = path.join(PUBLIC_SAMPLES_DIR, 'eirf_verdict_reference_sample.pdf');
    const eirfPathArt = path.join(ARTIFACT_DIR, 'eirf_verdict_reference_sample.pdf');
    fs.writeFileSync(eirfPathPub, eirfBuffer);
    fs.writeFileSync(eirfPathArt, eirfBuffer);
    console.log(`Saved EIRF Verdict PDF: ${eirfBuffer.length} bytes`);

    // -------------------------------------------------------------------------
    // 3. GENERATE OTRF REPORT PDF (Strict B&W, Top-Right QR, 7 Sections)
    // -------------------------------------------------------------------------
    console.log('Generating OTRF Report Reference Sample...');
    const otrfBuffer = await generateOtrfReportPdfBuffer({
        submission,
        test,
        candidate,
        eirfReport,
        verificationClosureDate: submission.verificationClosedAt
    });

    const otrfPathPub = path.join(PUBLIC_SAMPLES_DIR, 'otrf_report_reference_sample.pdf');
    const otrfPathArt = path.join(ARTIFACT_DIR, 'otrf_report_reference_sample.pdf');
    fs.writeFileSync(otrfPathPub, otrfBuffer);
    fs.writeFileSync(otrfPathArt, otrfBuffer);
    console.log(`Saved OTRF Report PDF: ${otrfBuffer.length} bytes`);

    // -------------------------------------------------------------------------
    // 4. CONVERT PDF PAGES TO PNG IMAGES FOR DIRECT VISUAL PREVIEW
    // -------------------------------------------------------------------------
    console.log('Converting PDF pages to PNG images for preview...');

    // Convert Hall Ticket
    let pIdx = 1;
    for await (const page of await pdf(hallTicketBuffer, { scale: 2.0 })) {
        const outName = `ref_hallticket_page_${pIdx}.png`;
        fs.writeFileSync(path.join(PUBLIC_SAMPLES_DIR, outName), page);
        fs.writeFileSync(path.join(ARTIFACT_DIR, outName), page);
        console.log(`Rendered ${outName}`);
        pIdx++;
    }

    // Convert EIRF
    pIdx = 1;
    for await (const page of await pdf(eirfBuffer, { scale: 2.0 })) {
        const outName = `ref_eirf_page_${pIdx}.png`;
        fs.writeFileSync(path.join(PUBLIC_SAMPLES_DIR, outName), page);
        fs.writeFileSync(path.join(ARTIFACT_DIR, outName), page);
        console.log(`Rendered ${outName}`);
        pIdx++;
    }

    // Convert OTRF
    pIdx = 1;
    for await (const page of await pdf(otrfBuffer, { scale: 2.0 })) {
        const outName = `ref_otrf_page_${pIdx}.png`;
        fs.writeFileSync(path.join(PUBLIC_SAMPLES_DIR, outName), page);
        fs.writeFileSync(path.join(ARTIFACT_DIR, outName), page);
        console.log(`Rendered ${outName}`);
        pIdx++;
    }

    console.log('✅ ALL REFERENCE SAMPLES SUCCESSFULLY GENERATED AND RENDERED!');
}

main().catch(err => {
    console.error('Fatal error during sample generation:', err);
    process.exit(1);
});
