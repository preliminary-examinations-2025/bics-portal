/**
 * Backward compatibility wrapper forwarding to new modular PDF services
 */
const {
    generateEirfVerdictPdfBuffer,
    generateDigitalVerdictHash,
    generateForensicSynthesis
} = require('../services/pdf/eirfVerdictPdf');
const { formatISTDate } = require('../services/pdf/pdfCommon');

module.exports = {
    generateEirfVerdictPdfBuffer,
    generateDigitalVerdictHash,
    generateForensicSynthesis,
    formatToIST: formatISTDate
};
