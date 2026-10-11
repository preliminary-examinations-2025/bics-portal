const multer = require('multer');

// Multer Config using Memory Storage (keeps files as buffers, does NOT write to disk)
const upload = multer({ storage: multer.memoryStorage() });

module.exports = upload;
module.exports.upload = upload;
