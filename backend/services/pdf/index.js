const { generateHallTicketPdfBuffer, streamHallTicketPdf } = require('./hallTicketPdf');
const { generateEirfVerdictPdfBuffer, generateDigitalVerdictHash, generateForensicSynthesis } = require('./eirfVerdictPdf');
const {
    generateOtrfReportPdfBuffer,
    generateOtrfVerificationHash,
    resolveOtrfArtifactMeta,
    persistOtrfPdfArtifact
} = require('./otrfReportPdf');
const pdfCommon = require('./pdfCommon');

module.exports = {
    generateHallTicketPdfBuffer,
    streamHallTicketPdf,
    generateEirfVerdictPdfBuffer,
    generateDigitalVerdictHash,
    generateForensicSynthesis,
    generateOtrfReportPdfBuffer,
    generateOtrfVerificationHash,
    resolveOtrfArtifactMeta,
    persistOtrfPdfArtifact,
    pdfCommon
};
