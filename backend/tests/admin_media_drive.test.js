/**
 * Automated Verification Suite for BICS Admin Media Drive
 * Tests:
 * 1. Unauthenticated access blocked (401)
 * 2. Student session blocked (403 Forbidden)
 * 3. Executable file extension upload rejected (400)
 * 4. Admin upload image succeeds with CDN & proxy URLs + Markdown syntax
 * 5. Admin upload PDF document succeeds
 * 6. Query and filter media assets (type filtering & search)
 * 7. Delete media asset (soft-delete & cleanup)
 */

const http = require('http');
const fs = require('fs');
const { generateToken } = require('../utils/jwt');
const { DB_FILE } = require('../config/db');

const PORT = 5003;
process.env.NODE_ENV = 'test';
process.env.PORT = PORT;
process.env.JWT_SECRET = 'test_media_drive_jwt_secret_9c915b721d2c4abaa5c49c279dd23f68';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';

const pipePath = process.platform === 'win32'
    ? `\\\\.\\pipe\\bics_media_audit_${process.pid}_${Date.now()}`
    : `/tmp/bics_media_audit_${process.pid}_${Date.now()}.sock`;

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { Host: `127.0.0.1:${PORT}`, ...headers };
        let payload = null;

        if (body && !(body instanceof Buffer)) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        } else if (body instanceof Buffer) {
            payload = body;
            reqHeaders['Content-Length'] = payload.length;
        }

        const req = http.request({
            socketPath: pipePath,
            path,
            method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    json = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: json
                });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function buildMultipartBuffer(boundary, filename, mimeType, fileContent) {
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    return Buffer.concat([
        Buffer.from(head, 'utf8'),
        Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent, 'utf8'),
        Buffer.from(tail, 'utf8')
    ]);
}

async function runMediaDriveAudit() {
    console.log('====================================================');
    console.log('   STARTING BICS MEDIA DRIVE VERIFICATION AUDIT    ');
    console.log('====================================================\n');

    const app = require('../server');
    let server;
    await new Promise((resolve) => {
        server = http.createServer(app).listen(pipePath, () => {
            console.log(`[TEST HARNESS] Media drive audit server listening on ${pipePath}\n`);
            resolve();
        });
    });

    const adminToken = generateToken({ id: 'admin', role: 'admin', username: 'admin' }, '1h');
    const studentToken = generateToken({ id: 'cand123', role: 'student', username: 'student1' }, '1h');

    const results = [];
    const assertTest = (name, condition, details = '') => {
        if (condition) {
            console.log(`[PASS] ${name}`);
            results.push({ name, passed: true });
        } else {
            console.error(`[FAIL] ${name} - ${details}`);
            results.push({ name, passed: false, details });
        }
    };

    try {
        // T-01: Direct unauthenticated request to /api/admin/media returns 401
        const resT01 = await request('GET', '/api/admin/media');
        assertTest('T-01: Direct unauthenticated GET /api/admin/media returns 401', resT01.status === 401, `Got status ${resT01.status}`);

        // T-02: Student JWT attempting GET /api/admin/media is rejected with 403 Forbidden
        const resT02 = await request('GET', '/api/admin/media', null, {
            'Authorization': `Bearer ${studentToken}`
        });
        assertTest('T-02: Student JWT attempting GET /api/admin/media is rejected with 403', resT02.status === 403, `Got status ${resT02.status}`);

        // T-03: Admin JWT querying /api/admin/media succeeds (200)
        const resT03 = await request('GET', '/api/admin/media', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assertTest('T-03: Admin JWT querying GET /api/admin/media returns 200', resT03.status === 200 && resT03.body?.success === true, `Got status ${resT03.status}`);

        // T-04: Security check: Executable upload is strictly rejected
        const boundaryExe = '----WebKitFormBoundaryExeTest123';
        const exePayload = buildMultipartBuffer(boundaryExe, 'malicious.exe', 'application/x-msdownload', 'MZ90000000');
        const resT04 = await request('POST', '/api/admin/media/upload', exePayload, {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundaryExe}`
        });
        assertTest('T-04: Executable file upload (.exe) is rejected with 500 error / security restriction', resT04.status >= 400, `Got status ${resT04.status}`);

        // T-05: Admin uploading a PNG image generates CDN URL, proxy URL and Markdown Image tag
        const boundaryImg = '----WebKitFormBoundaryImgTest456';
        const imgDummyContent = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489', 'hex');
        const imgPayload = buildMultipartBuffer(boundaryImg, 'circuit_diagram_sample.png', 'image/png', imgDummyContent);
        const resT05 = await request('POST', '/api/admin/media/upload', imgPayload, {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundaryImg}`
        });
        const uploadedImg = resT05.body?.assets?.[0];
        assertTest('T-05a: Admin uploading image succeeds (200)', resT05.status === 200 && resT05.body?.success === true, `Got status ${resT05.status}`);
        assertTest('T-05b: Asset has resourceType="image"', uploadedImg?.resourceType === 'image', `Got: ${uploadedImg?.resourceType}`);
        assertTest('T-05c: Asset generates proxyUrl starting with /media/', !!uploadedImg?.proxyUrl?.startsWith('/media/'), `Got: ${uploadedImg?.proxyUrl}`);
        assertTest('T-05d: Asset generates valid Markdown Image syntax: ![name](url)', !!uploadedImg?.markdownImage?.startsWith('!['), `Got: ${uploadedImg?.markdownImage}`);

        // T-06: Admin uploading a PDF document succeeds
        const boundaryPdf = '----WebKitFormBoundaryPdfTest789';
        const pdfDummyContent = Buffer.from('%PDF-1.4 sample pdf content for bics test', 'utf8');
        const pdfPayload = buildMultipartBuffer(boundaryPdf, 'ese_exam_circular.pdf', 'application/pdf', pdfDummyContent);
        const resT06 = await request('POST', '/api/admin/media/upload', pdfPayload, {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundaryPdf}`
        });
        const uploadedPdf = resT06.body?.assets?.[0];
        assertTest('T-06a: Admin uploading PDF succeeds (200)', resT06.status === 200 && resT06.body?.success === true, `Got status ${resT06.status}`);
        assertTest('T-06b: PDF asset has resourceType="pdf"', uploadedPdf?.resourceType === 'pdf', `Got: ${uploadedPdf?.resourceType}`);
        assertTest('T-06c: PDF asset generates valid Markdown Document link: [name](url)', !!uploadedPdf?.markdownLink?.startsWith('['), `Got: ${uploadedPdf?.markdownLink}`);

        // T-07: Search & Category filter on GET /api/admin/media
        const resT07Image = await request('GET', '/api/admin/media?type=image', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const hasOnlyImages = (resT07Image.body?.assets || []).every(a => a.resourceType === 'image');
        assertTest('T-07a: Filter type=image returns only image assets', hasOnlyImages && resT07Image.body?.assets?.length > 0, `Assets: ${resT07Image.body?.assets?.length}`);

        const resT07Search = await request('GET', '/api/admin/media?search=circular', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const foundPdf = (resT07Search.body?.assets || []).some(a => a.filename.includes('circular') || a.originalName.includes('circular'));
        assertTest('T-07b: Search query filters matching assets', foundPdf, `Search found ${resT07Search.body?.assets?.length} assets`);

        // T-08: Delete asset removes from database
        const targetId = uploadedImg?.id || uploadedImg?._id;
        const resT08 = await request('DELETE', `/api/admin/media/${targetId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assertTest('T-08a: Delete asset returns 200 success', resT08.status === 200 && resT08.body?.success === true, `Got status ${resT08.status}`);

        const resT08Check = await request('GET', '/api/admin/media', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const stillPresent = (resT08Check.body?.assets || []).some(a => (a.id || a._id) === targetId);
        assertTest('T-08b: Deleted asset is no longer returned in media list', !stillPresent, `Still present: ${stillPresent}`);

    } catch (err) {
        console.error("Test execution exception:", err);
    } finally {
        if (server) server.close();
    }

    const passedCount = results.filter(r => r.passed).length;
    console.log(`\n====================================================`);
    console.log(`MEDIA DRIVE AUDIT RESULT: ${passedCount} OF ${results.length} PASSED`);
    console.log(`====================================================\n`);

    if (passedCount === results.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runMediaDriveAudit();
