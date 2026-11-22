const { generateHallTicketPdfBuffer } = require('../services/pdf/hallTicketPdf');

async function testPdf() {
    const pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const candidate = {
        studentId: 'STU1001',
        name: 'Siyam Bubere',
        registrationData: {
            personalEmail: 'demo@example.com',
            permanentAddress: '123 Main St'
        }
    };
    const buffer = await generateHallTicketPdfBuffer({ candidate, examType: 'end' });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    let fullText = '';
    const allItems = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        allItems.push(...tc.items.map(i => i.str.trim()).filter(Boolean));
        fullText += ' ' + tc.items.map(i => i.str).join(' ');
    }
    console.log('Includes INVIGILATOR\'S SIGN:', fullText.includes("INVIGILATOR'S SIGN"));
    console.log('Includes REPORT TIME:', fullText.includes('REPORT TIME'));
    
    // Check if any table cell has "Details not available"
    const dnaCount = allItems.filter(s => s === 'Details not available').length;
    console.log('Occurrences of "Details not available":', dnaCount);

    if (!fullText.includes("INVIGILATOR'S SIGN") || fullText.includes('REPORT TIME') || dnaCount > 0) {
        throw new Error(`Verification failed! dnaCount=${dnaCount}`);
    }
    console.log('HALL TICKET PDF VERIFICATION SUCCESSFUL: Invigilator Sign column is completely empty!');
}

testPdf().catch(err => {
    console.error(err);
    process.exit(1);
});
