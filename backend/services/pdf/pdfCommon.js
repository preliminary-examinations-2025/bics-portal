const qr = require('qr-image');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const FONTS_ROOT = path.join(__dirname, '..', '..', 'public', 'fonts');

const FONT_FILES = {
    'PJS-Regular': path.join(FONTS_ROOT, 'plus-jakarta-sans', 'PlusJakartaSans-Regular.ttf'),
    'PJS-Medium': path.join(FONTS_ROOT, 'plus-jakarta-sans', 'PlusJakartaSans-Medium.ttf'),
    'PJS-SemiBold': path.join(FONTS_ROOT, 'plus-jakarta-sans', 'PlusJakartaSans-SemiBold.ttf'),
    'PJS-Bold': path.join(FONTS_ROOT, 'plus-jakarta-sans', 'PlusJakartaSans-Bold.ttf'),
    'Inter-Regular': path.join(FONTS_ROOT, 'inter', 'Inter-Regular.ttf'),
    'Inter-Medium': path.join(FONTS_ROOT, 'inter', 'Inter-Medium.ttf'),
    'Inter-SemiBold': path.join(FONTS_ROOT, 'inter', 'Inter-SemiBold.ttf'),
    'Inter-Bold': path.join(FONTS_ROOT, 'inter', 'Inter-Bold.ttf')
};

/**
 * Registers Plus Jakarta Sans & Inter TTFs onto a PDFKit document and returns resolved font names
 */
function registerPdfFonts(doc) {
    const registered = {};
    for (const [alias, filePath] of Object.entries(FONT_FILES)) {
        if (fs.existsSync(filePath)) {
            try {
                doc.registerFont(alias, filePath);
                registered[alias] = alias;
                continue;
            } catch (err) {
                console.warn(`[PDF_COMMON] Failed registering font ${alias}:`, err.message);
            }
        }
        const isBold = alias.endsWith('Bold');
        registered[alias] = isBold ? 'Helvetica-Bold' : 'Helvetica';
    }
    return {
        titleRegular: registered['PJS-Regular'],
        titleMedium: registered['PJS-Medium'],
        titleSemiBold: registered['PJS-SemiBold'],
        titleBold: registered['PJS-Bold'],
        bodyRegular: registered['Inter-Regular'],
        bodyMedium: registered['Inter-Medium'],
        bodySemiBold: registered['Inter-SemiBold'],
        bodyBold: registered['Inter-Bold']
    };
}

/**
 * Resolves system examType config value to standardized display label
 */
function resolveExamTypeLabel(examTypeOrConfig) {
    const raw = (examTypeOrConfig && typeof examTypeOrConfig === 'object')
        ? (examTypeOrConfig.examType || examTypeOrConfig.type)
        : examTypeOrConfig;
    const norm = String(raw || '').trim().toLowerCase();
    if (!norm) return 'Details not available';
    if (norm === 'midsem' || norm === 'mid' || norm.includes('mid-sem') || norm.includes('mid sem')) {
        return 'Mid-Sem Test 2026';
    }
    if (norm === 'endsem' || norm === 'end' || norm.includes('end-sem') || norm.includes('end sem')) {
        return 'End-Sem Exam 2026';
    }
    return String(raw).trim();
}

/**
 * Universal safe fallback for missing/null/empty values
 */
function safeText(val, fallback = 'Details not available') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    if (
        s.length === 0 ||
        s.toLowerCase() === 'undefined' ||
        s.toLowerCase() === 'null' ||
        s.toLowerCase() === 'no details available'
    ) {
        return fallback;
    }
    return String(val).trim();
}

/**
 * Formats a Date object to Indian Standard Time (IST) string
 */
function formatISTDate(dateInput) {
    if (!dateInput) return 'Details not available';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Details not available';
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

    if (url.startsWith('data:image/')) {
        try {
            const base64Data = url.split(',')[1];
            if (base64Data) return Buffer.from(base64Data, 'base64');
        } catch (e) {
            console.error('[PDF_COMMON] Failed decoding data URL:', e.message);
            return null;
        }
    }

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
 * Draws the Page 1 Institutional Header with Top-Left Logo, Center Metadata Block,
 * Top-Right Framed QR Code, and a Clean Full-Width Divider strictly BELOW both.
 * Submission ID (BICSID) is displayed ONLY here on Page 1.
 */
function drawBwHeader(doc, {
    title = 'BICS DEPARTMENT OF EXAMINATION',
    subtitle = 'Academic Year 2026-27 • Semester I',
    docType = 'EXAMINATION RECORD',
    refId = 'Details not available',
    submissionId = null,
    bicsId = 'Details not available',
    qrPayload = 'BICS_VERIFY',
    fonts = null,
    startX = 30,
    pageWidth = 535
}) {
    const f = fonts || registerPdfFonts(doc);
    const qrSize = 58;
    const qrFrameW = 68;
    const qrFrameX = startX + pageWidth - qrFrameW;
    const topY = 26;

    // Top-Left Institutional Logo
    const bicsLogoPath = path.join(__dirname, '..', '..', 'public', 'bics_logo.png');
    let textStartX = startX;
    if (fs.existsSync(bicsLogoPath)) {
        try {
            doc.image(bicsLogoPath, startX, topY + 2, { width: 48 });
            textStartX = startX + 58;
        } catch (e) {}
    }

    const textWidth = qrFrameX - textStartX - 16;
    let ty = topY;

    doc.fillColor('#0f172a').fontSize(12.5).font(f.titleBold)
       .text(title, textStartX, ty, { width: textWidth, align: 'left', lineGap: 1.5 });
    ty = doc.y + 2;

    doc.fillColor('#334155').fontSize(8.2).font(f.bodyMedium)
       .text(subtitle, textStartX, ty, { width: textWidth, align: 'left', lineGap: 1.5 });
    ty = doc.y + 3;

    doc.fillColor('#000000').fontSize(9.8).font(f.titleBold)
       .text(docType, textStartX, ty, { width: textWidth, align: 'left', lineGap: 1.5 });
    ty = doc.y + 4;

    const resolvedSubId = safeText(submissionId || bicsId);
    const resolvedRefId = safeText(refId);
    const metaLine = `Submission ID: ${resolvedSubId}   •   Reference ID: ${resolvedRefId}`;
    doc.fillColor('#1e293b').fontSize(7.8).font(f.bodySemiBold)
       .text(metaLine, textStartX, ty, { width: textWidth, align: 'left', lineGap: 1.5 });
    const textBottomY = doc.y;

    // Top-Right QR Code (cleanly aligned, divider stays strictly below caption)
    let qrBottomY = topY + 68;
    const qrBuffer = generateQrBuffer(qrPayload);
    if (qrBuffer) {
        try {
            const qrImgX = qrFrameX + (qrFrameW - qrSize) / 2;
            doc.image(qrBuffer, qrImgX, topY, { width: qrSize, height: qrSize });
            doc.fillColor('#334155').fontSize(6.2).font(f.bodyMedium)
               .text('Scan to Verify', qrFrameX, topY + qrSize + 3, { width: qrFrameW, align: 'center' });
            qrBottomY = doc.y;
        } catch (e) {
            console.error('[PDF_COMMON] Error drawing header QR:', e);
        }
    }

    const dividerY = Math.max(textBottomY, qrBottomY, topY + 68) + 8;
    doc.moveTo(startX, dividerY).lineTo(startX + pageWidth, dividerY)
       .strokeColor('#0f172a').lineWidth(1.0).stroke();

    return dividerY + 12;
}

/**
 * Draws Continuation Header on Pages 2+ showing ONLY Reference ID (never BICSID / Submission ID)
 */
function drawBwContinuationHeader(doc, {
    title = 'BICS DEPARTMENT OF EXAMINATION',
    refId = 'Details not available',
    subLabel = '',
    examTypeLabel = '',
    fonts = null,
    startX = 30,
    pageWidth = 535
}) {
    const f = fonts || registerPdfFonts(doc);
    const bicsLogoPath = path.join(__dirname, '..', '..', 'public', 'bics_logo.png');
    let textStartX = startX;
    if (fs.existsSync(bicsLogoPath)) {
        try {
            doc.image(bicsLogoPath, startX, 24, { width: 28 });
            textStartX = startX + 38;
        } catch (e) {}
    }

    const availW = pageWidth - (textStartX - startX);
    doc.fillColor('#0f172a').fontSize(10).font(f.titleBold)
       .text(title, textStartX, 25, { width: availW, align: 'left' });
    const titleBottom = doc.y;

    const parts = [`Academic Year 2026-27 • Semester I`];
    if (examTypeLabel && examTypeLabel !== 'Details not available') parts.push(examTypeLabel);
    parts.push(`Reference ID: ${safeText(refId)}`);
    if (subLabel) parts.push(subLabel);

    doc.fillColor('#475569').fontSize(7.6).font(f.bodyMedium)
       .text(parts.join('   |   '), textStartX, Math.max(titleBottom + 2, 39), { width: availW, align: 'left' });
    const lineY = Math.max(doc.y, 52) + 7;

    doc.moveTo(startX, lineY).lineTo(startX + pageWidth, lineY)
       .strokeColor('#334155').lineWidth(0.75).stroke();

    return lineY + 12;
}

/**
 * Draws section banner using Plus Jakarta Sans Bold
 */
function drawBwSectionBand(doc, x, y, width, height, title, fonts = null) {
    const f = fonts || registerPdfFonts(doc);
    const bandH = Math.max(height || 20, 20);
    doc.rect(x, y, width, bandH).fillAndStroke('#e2e8f0', '#0f172a');
    doc.fillColor('#0f172a').fontSize(8.5).font(f.titleBold)
       .text(title, x + 8, y + 4.5, { width: width - 16, lineBreak: false });
    return y + bandH;
}

/**
 * Draws a horizontal key-value row with discrete Key and Value columns:
 * - 4 columns when `pairs.length === 2` (`| Key 1 (Bold) | Value 1 (Regular) | Key 2 (Bold) | Value 2 (Regular) |`)
 * - 2 columns when `pairs.length === 1` (`| Key (Bold) | Value (Regular, full width) |`)
 * Automatically paginates when `onNewPage` is provided and row would collide with footer.
 */
function drawBwSplitRow(doc, {
    x = 30,
    y,
    width = 535,
    pairs = [],
    colRatios = null,
    minHeight = 23,
    fonts = null,
    keyBg = '#f8fafc',
    keyFontSize = 7.4,
    valFontSize = 7.9,
    lineGap = 2.4,
    padX = 7,
    padY = 5.5,
    onNewPage = null
}) {
    const f = fonts || registerPdfFonts(doc);
    const isFourCol = pairs.length >= 2;
    const ratios = colRatios || (isFourCol ? [0.21, 0.29, 0.21, 0.29] : [0.21, 0.79]);

    const colWidths = ratios.map(r => width * r);
    const cells = isFourCol
        ? [
            { text: String(pairs[0]?.label || ''), isKey: true, w: colWidths[0] },
            { text: safeText(pairs[0]?.value), isKey: false, w: colWidths[1] },
            { text: String(pairs[1]?.label || ''), isKey: true, w: colWidths[2] },
            { text: safeText(pairs[1]?.value), isKey: false, w: colWidths[3] }
        ]
        : [
            { text: String(pairs[0]?.label || ''), isKey: true, w: colWidths[0] },
            { text: safeText(pairs[0]?.value), isKey: false, w: colWidths[1] }
        ];

    let maxContentH = 0;
    const measured = cells.map((cell) => {
        const innerW = Math.max(12, cell.w - padX * 2);
        const fontName = cell.isKey ? f.bodySemiBold : f.bodyRegular;
        const fontSize = cell.isKey ? keyFontSize : valFontSize;
        doc.font(fontName).fontSize(fontSize);
        const h = doc.heightOfString(cell.text || '', { width: innerW, lineGap });
        if (h > maxContentH) maxContentH = h;
        return { ...cell, innerW, fontName, fontSize, textH: h };
    });

    const rowHeight = Math.max(minHeight, Math.ceil(maxContentH + padY * 2));
    let curY = y;

    if (typeof onNewPage === 'function' && curY + rowHeight > 780) {
        doc.addPage();
        curY = onNewPage(doc);
    }

    // Paint key column background fills first
    let fillX = x;
    measured.forEach((cell) => {
        if (cell.isKey && keyBg) {
            doc.rect(fillX, curY, cell.w, rowHeight).fillColor(keyBg).fill();
        }
        fillX += cell.w;
    });

    // Outer row border & vertical column dividers
    doc.rect(x, curY, width, rowHeight).strokeColor('#334155').lineWidth(0.7).stroke();
    let divX = x;
    for (let i = 0; i < measured.length - 1; i++) {
        divX += measured[i].w;
        const isPairBoundary = isFourCol && i === 1;
        doc.moveTo(divX, curY).lineTo(divX, curY + rowHeight)
           .strokeColor(isPairBoundary ? '#0f172a' : '#64748b')
           .lineWidth(isPairBoundary ? 0.85 : 0.6).stroke();
    }

    // Draw cell text aligned cleanly
    let textX = x;
    measured.forEach((cell) => {
        const textY = curY + padY;
        doc.fillColor(cell.isKey ? '#0f172a' : '#000000')
           .font(cell.fontName)
           .fontSize(cell.fontSize)
           .text(cell.text, textX + padX, textY, { width: cell.innerW, lineGap });
        textX += cell.w;
    });

    return curY + rowHeight;
}

/**
 * Legacy helper preserved for backward compatibility (delegates to horizontal split style)
 */
function drawBwGridRow(doc, x, y, width, minHeight = 23, label1, val1, label2, val2, colSplit = 0.5, fonts = null) {
    const pairs = label2 !== undefined
        ? [{ label: label1, value: val1 }, { label: label2, value: val2 }]
        : [{ label: label1, value: val1 }];
    let ratios = null;
    if (label2 !== undefined && typeof colSplit === 'number' && colSplit > 0.25 && colSplit < 0.75) {
        const leftW = colSplit;
        const rightW = 1 - colSplit;
        ratios = [leftW * 0.40, leftW * 0.60, rightW * 0.40, rightW * 0.60];
    }
    return drawBwSplitRow(doc, { x, y, width, pairs, colRatios: ratios, minHeight, fonts });
}

/**
 * Draws a multi-column table with Plus Jakarta Sans headers, Inter body cells,
 * wrapped text, generous padding, full-height borders, and auto-pagination
 */
function drawBwTable(doc, {
    startX = 30,
    startY,
    width = 535,
    headers = [],
    rows = [],
    colWidths = [],
    headerHeight = 22,
    rowHeight = 22,
    lineGap = 2.4,
    padX = 6,
    padY = 5.5,
    fonts = null,
    onNewPage = null
}) {
    const f = fonts || registerPdfFonts(doc);
    let curY = startY;

    function renderHeader(y) {
        doc.fontSize(7.4).font(f.titleBold);
        let maxHeaderTextH = 0;
        const headerItems = headers.map((h, idx) => {
            const w = colWidths[idx] || (width / headers.length);
            const align = h.align || 'left';
            const label = typeof h === 'string' ? h : h.label;
            const innerW = Math.max(8, w - padX * 2);
            const textH = doc.heightOfString(label || '', { width: innerW, lineGap: 1.5 });
            if (textH > maxHeaderTextH) maxHeaderTextH = textH;
            return { w, align, label, innerW, textH };
        });
        const actualHeaderH = Math.max(headerHeight, Math.ceil(maxHeaderTextH + padY * 2));

        doc.rect(startX, y, width, actualHeaderH).fillAndStroke('#e2e8f0', '#0f172a');
        let colX = startX;
        headerItems.forEach((item, idx) => {
            const topPad = Math.max(padY, (actualHeaderH - item.textH) / 2);
            doc.fillColor('#0f172a').fontSize(7.4).font(f.titleBold)
               .text(item.label, colX + padX, y + topPad, { width: item.innerW, align: item.align, lineGap: 1.5 });
            colX += item.w;
            if (idx < headerItems.length - 1) {
                doc.moveTo(colX, y).lineTo(colX, y + actualHeaderH).strokeColor('#334155').lineWidth(0.7).stroke();
            }
        });
        return y + actualHeaderH;
    }

    curY = renderHeader(curY);

    rows.forEach((row) => {
        const isHighlight = row.isHighlight || false;
        const cells = Array.isArray(row) ? row : (row.cells || []);
        const font = (isHighlight || row.bold) ? f.bodyBold : f.bodyRegular;
        const fontSize = isHighlight ? 7.9 : 7.7;

        doc.fontSize(fontSize).font(font);
        let maxCellH = 0;
        const measuredCells = cells.map((cellVal, cIdx) => {
            const w = colWidths[cIdx] || (width / cells.length);
            const align = headers[cIdx]?.align || 'left';
            const innerW = Math.max(8, w - padX * 2);
            const cellText = safeText(cellVal);
            const h = doc.heightOfString(cellText, { width: innerW, lineGap });
            if (h > maxCellH) maxCellH = h;
            return { w, align, innerW, cellText };
        });
        const actualRowH = Math.max(rowHeight, Math.ceil(maxCellH + padY * 2));

        if (curY + actualRowH > 780) {
            doc.addPage();
            if (typeof onNewPage === 'function') {
                curY = onNewPage(doc);
            } else {
                curY = 30;
            }
            curY = renderHeader(curY);
        }

        if (isHighlight) {
            doc.rect(startX, curY, width, actualRowH).fillAndStroke('#f1f5f9', '#0f172a');
        } else {
            doc.rect(startX, curY, width, actualRowH).strokeColor('#334155').lineWidth(0.7).stroke();
        }

        let colX = startX;
        measuredCells.forEach((cell, cIdx) => {
            doc.fillColor('#000000').fontSize(fontSize).font(font)
               .text(cell.cellText, colX + padX, curY + padY, { width: cell.innerW, align: cell.align, lineGap });
            colX += cell.w;
            if (cIdx < measuredCells.length - 1) {
                doc.moveTo(colX, curY).lineTo(colX, curY + actualRowH).strokeColor('#475569').lineWidth(0.65).stroke();
            }
        });
        curY += actualRowH;
    });

    return curY;
}

/**
 * Draws page footer with Ref ID, page numbering, and institutional label using Inter
 */
function drawBwFooter(doc, currentPage, totalPages, docLabel = 'Official Examination Record', refId = null, fonts = null) {
    const f = fonts || registerPdfFonts(doc);
    const startX = 30;
    const pageWidth = 535;
    const y = 802;

    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor('#334155').lineWidth(0.7).stroke();
    const sep = (f.bodyRegular === 'Helvetica') ? '  |  ' : '  •  ';
    const refPart = (refId && safeText(refId) !== 'Details not available') ? `${sep}Reference ID: ${safeText(refId)}` : '';
    doc.fillColor('#334155').fontSize(7.4).font(f.bodyRegular)
       .text(`BICS Department of Examination${sep}${docLabel}${refPart}`, startX, y + 6, { width: 430 });
    doc.fillColor('#0f172a').fontSize(7.5).font(f.bodySemiBold)
       .text(`Page ${currentPage} of ${totalPages}`, startX + pageWidth - 95, y + 6, { width: 95, align: 'right' });
}

module.exports = {
    FONT_FILES,
    registerPdfFonts,
    resolveExamTypeLabel,
    safeText,
    formatISTDate,
    generateQrBuffer,
    generateHmacSignature,
    fetchImageBuffer,
    drawBwHeader,
    drawBwContinuationHeader,
    drawBwSectionBand,
    drawBwSplitRow,
    drawBwGridRow,
    drawBwTable,
    drawBwFooter
};
