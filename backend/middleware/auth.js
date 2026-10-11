const FORBIDDEN_HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Error</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #e6e6e6;
            font-family: Arial, "Segoe UI", sans-serif;
        }
        .header-bar {
            background-color: #505050;
            color: #ffffff;
            font-size: 20px;
            font-weight: normal;
            padding: 10px 20px;
        }
        .main-container {
            margin: 15px 20px;
            background-color: #ffffff;
            border: 1px solid #d4d4d4;
            padding: 12px;
        }
        .error-card {
            border: 1px solid #dcdcdc;
            padding: 12px 16px;
            background-color: #ffffff;
        }
        .error-title {
            color: #cc0000;
            font-size: 16px;
            font-weight: bold;
            margin: 0 0 6px 0;
        }
        .error-message {
            color: #000000;
            font-size: 13px;
            font-weight: bold;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="header-bar">Server Error</div>
    <div class="main-container">
        <div class="error-card">
            <h1 class="error-title">403 - Forbidden: Access is denied.</h1>
            <p class="error-message">You do not have permission to view this directory or page using the credentials that you supplied.</p>
        </div>
    </div>
</body>
</html>`;

const authorizeApiRequest = (req, res, next) => {
    const secret = process.env.API_ACCESS_SECRET;

    // Allow pass-through if process.env.API_ACCESS_SECRET is not configured in environment
    if (!secret) {
        return next();
    }

    const fullPath = (req.originalUrl || req.path).split('?')[0].toLowerCase();
    const relativePath = req.path.toLowerCase();

    // Whitelist rules: OPTIONS preflight, health checks, authentication, and external webhooks
    const isWhitelisted = 
        req.method === 'OPTIONS' ||
        fullPath === '/health' || relativePath === '/health' ||
        fullPath === '/api/health' || relativePath === '/health' ||
        fullPath.startsWith('/api/webhooks/') || relativePath.startsWith('/webhooks/') ||
        fullPath === '/api/login' || relativePath === '/login' ||
        fullPath === '/api/register' || relativePath === '/register' ||
        fullPath === '/api/candidate/login' || relativePath === '/candidate/login' ||
        fullPath === '/api/candidate/register' || relativePath === '/candidate/register' ||
        fullPath.startsWith('/api/candidate/send-verification-code') || relativePath.startsWith('/candidate/send-verification-code') ||
        fullPath === '/api/candidate/verify-email-code' || relativePath === '/candidate/verify-email-code' ||
        fullPath.startsWith('/api/candidate/verify-code') || relativePath.startsWith('/candidate/verify-code') ||
        fullPath === '/api/tests/verify-token' || relativePath === '/tests/verify-token' ||
        fullPath === '/api/config' || relativePath === '/config' ||
        fullPath === '/api/system-config' || relativePath === '/system-config' ||
        fullPath.startsWith('/api/candidate/generate-hallticket') || relativePath.startsWith('/candidate/generate-hallticket') ||
        fullPath.startsWith('/api/tests/submission-verification') || relativePath.startsWith('/tests/submission-verification') ||
        fullPath.startsWith('/api/test/eirf') || relativePath.startsWith('/test/eirf') ||
        fullPath.startsWith('/api/counterfoil') || relativePath.startsWith('/counterfoil') ||
        fullPath === '/api/log-client-error' || relativePath === '/log-client-error';

    if (isWhitelisted) {
        return next();
    }

    // Check credentials via apiSecret or apiKey query parameter, or header
    const clientSecret = req.query.apiSecret || 
                         req.query.apiKey || 
                         req.headers['x-portal-api-key'] ||
                         (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);

    if (clientSecret && clientSecret === secret) {
        return next();
    }

    console.warn(`[SECURITY ALERT] Unauthorized API access blocked: ${req.method} ${req.originalUrl} from IP ${req.ip}`);
    
    // Direct browser navigation (GET requesting text/html) gets the custom Server Error HTML page
    const acceptHeader = req.headers['accept'] || '';
    if (req.method === 'GET' && acceptHeader.includes('text/html')) {
        return res.status(403).type('html').send(FORBIDDEN_HTML_PAGE);
    }

    // Programmatic fetch / API calls get clean JSON response
    return res.status(403).json({
        success: false,
        error: "403 Forbidden: Access is denied. Invalid or missing API Secret."
    });
};

module.exports = {
    authorizeApiRequest,
    FORBIDDEN_HTML_PAGE
};
