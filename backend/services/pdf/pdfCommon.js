const qr = require('qr-image');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Universal safe fallback for missing/null/empty values
 */
function safeText(val, fallback = 'No details available') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    if (s.length === 0 || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') {
        return fallback;
    }
    return String(val);
}

/**
 * Formats a Date object to Indian Standard Time (IST) string
 */
function formatISTDate(dateInput) {
    if (!dateInput) return 'No details available';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'No details available';
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }) + ' IST';
}

/**
 * Generates QR Code PNG buffer
 */
function generateQrBuffer(payloadText) {
    try {
        const text = String(payloadText || 'BICS_VERIFY');
        return qr.imageSync(text, { type: 'png', margin: 1 });
    } catch (e) {
        console.error('[PDF_COMMON] Error generating QR buffer:', e.message);
        return null;
    }
}

/**
 * Generates an HMAC SHA-256 digital signature
 */
function generateHmacSignature(payload, secret = process.env.SECRET_KEY || 'BICS_PORTAL_SIGNING_KEY_2026') {
    return crypto.createHmac('sha256', secret).update(String(payload)).digest('hex').toUpperCase();
}

/**
 * Robust image buffer fetcher (Cloudinary, local public uploads, data URLs, HTTP)
 */
async function fetchImageBuffer(url) {
    if (!url) return null;
    if (typeof url !== 'string') return null;

    // Data URL
    if (url.startsWith('data:image/')) {
        try {
            const base64Data = url.split(',')[1];
            if (base64Data) return Buffer.from(base64Data, 'base64');
        } catch (e) {
            console.error('[PDF_COMMON] Failed decoding data URL:', e.message);
            return null;
        }
    }

    // Local file path
    if (fs.existsSync(url)) {
        try {
            return fs.readFileSync(url);
        } catch (e) {
            // continue
        }
    }

    let targetUrl = url;
    if (targetUrl.startsWith('/media/')) {
        targetUrl = `https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026/${targetUrl.replace(/^\/media\//, '')}`;
    } else if (targetUrl.includes('.netlify.app/media/')) {
        const subPath = targetUrl.substring(targetUrl.indexOf('/media/') + 7);
        targetUrl = `https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026/${subPath}`;
    }

    if (targetUrl.includes('/public/uploads/')) {
        const fileName = targetUrl.substring(targetUrl.indexOf('/public/uploads/') + 16);
        const localPath = path.join(__dirname, '..', '..', 'public', 'uploads', fileName);
        if (fs.existsSync(localPath)) {
            try { return fs.readFileSync(localPath); } catch (e) {}
        }
    }

    try {
        const response = await fetch(targetUrl);
        if (response.ok) {
            return Buffer.from(await response.arrayBuffer());
        }
    } catch (e) {
        // Fallback or ignore
    }
    return null;
}

/**
 * Draws the official Page 1 Black & White header with QR on top-right
 */
function drawBwHeader(doc, {
    title = 'BICS DEPARTMENT OF EXAMINATION',
    subtitle = 'BICS Online Testing System — Academic Integrity & Assessment Authority',
    docType = 'EXAMINATION RECORD',
    refId = 'No details available',
    bicsId = 'No details available',
    qrPayload = 'BICS_VERIFY',
    startX = 30,
    pageWidth = 535
}) {
    const headerHeight = 72;
    const qrWidth = 65;
    const qrHeight = 65;
    const qrX = startX + pageWidth - qrWidth;
    const qrY = 28;

    // Header border box
    doc.rect(startX, 28, pageWidth, headerHeight).strokeColor('#000000').lineWidth(1.2).stroke();

    // Text block (left of QR)
    const textWidth = pageWidth - qrWidth - 16;
    doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold')
       .text(title, startX + 10, 34, { width: textWidth, align: 'left' });

    doc.fillColor('#000000').fontSize(8).font('Helvetica')
       .text(subtitle, startX + 10, 48, { width: textWidth, align: 'left' });

    doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold')
       .text(docType, startX + 10, 60, { width: textWidth, align: 'left' });

    // Reference meta line
    const metaLine = `Submission Ref ID: ${refId}  |  BICS Object ID: ${bicsId}`;
    doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
       .text(metaLine, startX + 10, 74, { width: textWidth, align: 'left', lineBreak: false });

    // QR Code on the top right
    const qrBuffer = generateQrBuffer(qrPayload);
    if (qrBuffer) {
        try {
            doc.image(qrBuffer, qrX, qrY + 2, { width: qrWidth, height: qrHeight - 8 });
            doc.fillColor('#000000').fontSize(5.5).font('Helvetica')
               .text('Scan for Verification', qrX, qrY + qrHeight - 5, { width: qrWidth, align: 'center' });
        } catch (e) {
            console.error('[PDF_COMMON] Error drawing header QR:', e);
        }
    }

    return 28 + headerHeight + 10; // returns next Y
}

/**
 * Draws filled section band header
 */
function drawBwSectionBand(doc, x, y, width, height, title) {
    doc.rect(x, y, width, height).fillAndStroke('#e5e7eb', '#000000');
    doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold')
       .text(title, x + 6, y + 4, { width: width - 12, lineBreak: false });
    return y + height;
}

/**
 * Draws a 2-column key-value grid row with crisp borders
 */
function drawBwGridRow(doc, x, y, width, height, label1, val1, label2, val2, colSplit = 0.5) {
    doc.rect(x, y, width, height).strokeColor('#000000').lineWidth(0.8).stroke();
    const midX = x + width * colSplit;
    if (label2 !== undefined) {
        doc.moveTo(midX, y).lineTo(midX, y + height).stroke();
    }

    // Col 1
    doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold').text(label1, x + 6, y + 3);
    doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text(safeText(val1), x + 6, y + 12, { width: (label2 !== undefined ? midX - x : width) - 12, lineBreak: false });

    // Col 2
    if (label2 !== undefined) {
        doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold').text(label2, midX + 6, y + 3);
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text(safeText(val2), midX + 6, y + 12, { width: x + width - midX - 12, lineBreak: false });
    }

    return y + height;
}

/**
 * Draws a multi-column table with borders, auto-pagination, and header repeating
 */
function drawBwTable(doc, {
    startX = 30,
    startY,
    width = 535,
    headers = [],
    rows = [],
    colWidths = [],
    headerHeight = 18,
    rowHeight = 16,
    onNewPage = null
}) {
    let curY = startY;

    function renderHeader(y) {
        doc.rect(startX, y, width, headerHeight).fillAndStroke('#e5e7eb', '#000000');
        let colX = startX;
        headers.forEach((h, idx) => {
            const w = colWidths[idx] || (width / headers.length);
            const align = h.align || 'left';
            const label = typeof h === 'string' ? h : h.label;
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold')
               .text(label, colX + 4, y + 5, { width: w - 8, align: align, lineBreak: false });
            colX += w;
            if (idx < headers.length - 1) {
                doc.moveTo(colX, y).lineTo(colX, y + headerHeight).strokeColor('#000000').lineWidth(0.8).stroke();
            }
        });
        return y + headerHeight;
    }

    curY = renderHeader(curY);

    rows.forEach((row, rIdx) => {
        // Page break check (leave room for row + footer)
        if (curY + rowHeight > 790) {
            doc.addPage();
            if (typeof onNewPage === 'function') {
                curY = onNewPage(doc);
            } else {
                curY = 30;
            }
            curY = renderHeader(curY);
        }

        const isHighlight = row.isHighlight || false;
        if (isHighlight) {
            doc.rect(startX, curY, width, rowHeight).fillAndStroke('#f3f4f6', '#000000');
        } else {
            doc.rect(startX, curY, width, rowHeight).strokeColor('#000000').lineWidth(0.8).stroke();
        }

        let colX = startX;
        const cells = Array.isArray(row) ? row : (row.cells || []);
        cells.forEach((cellVal, cIdx) => {
            const w = colWidths[cIdx] || (width / cells.length);
            const align = headers[cIdx]?.align || 'left';
            const font = (isHighlight || row.bold) ? 'Helvetica-Bold' : 'Helvetica';
            doc.fillColor('#000000').fontSize(7).font(font)
               .text(safeText(cellVal), colX + 4, curY + 4, { width: w - 8, align: align, lineBreak: false });
            colX += w;
            if (cIdx < cells.length - 1) {
                doc.moveTo(colX, curY).lineTo(colX, curY + rowHeight).strokeColor('#000000').lineWidth(0.8).stroke();
            }
        });
        curY += rowHeight;
    });

    return curY;
}

/**
 * Draws page footer with page numbering and institutional disclaimer
 */
function drawBwFooter(doc, currentPage, totalPages, docLabel = 'Official Examination Record') {
    const startX = 30;
    const pageWidth = 535;
    const y = 805;

    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor('#000000').lineWidth(0.8).stroke();
    doc.fillColor('#000000').fontSize(7).font('Helvetica')
       .text(`BICS Department of Examination • ${docLabel} • Confidential & Digitally Signed`, startX, y + 5, { width: 380 });
    doc.text(`Page ${currentPage} of ${totalPages}`, startX + pageWidth - 80, y + 5, { width: 80, align: 'right' });
}

module.exports = {
    safeText,
    formatISTDate,
    generateQrBuffer,
    generateHmacSignature,
    fetchImageBuffer,
    drawBwHeader,
    drawBwSectionBand,
    drawBwGridRow,
    drawBwTable,
    drawBwFooter
};
