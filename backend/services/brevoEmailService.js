/**
 * @deprecated Brevo email service is deprecated in favor of Gmail REST API over HTTPS.
 * This proxy delegates all transactional email calls to `gmailEmailService.js`.
 */
const gmailEmailService = require('./gmailEmailService');

module.exports = {
    ...gmailEmailService,
    // Aliases for any legacy calls
    sendBrevoTransactionalEmail: gmailEmailService.sendGmailRestEmail
};
