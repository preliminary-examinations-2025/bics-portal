const multer = require('multer');

// Allowed MIME types for student registrations, documents, and coursework
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
]);

// Multer Config with Strict Limits and MIME Filtering
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
        files: 5 // Max 5 files per multi-part request
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File upload rejected: MIME type "${file.mimetype}" is not permitted. Only JPEG, PNG, WEBP, and PDF files are allowed.`));
        }
    }
});

module.exports = upload;
module.exports.upload = upload;
