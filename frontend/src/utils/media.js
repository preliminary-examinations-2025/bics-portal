/**
 * Utility function to convert any Cloudinary URL to Netlify /media/ proxy URL.
 * Ensures media, documents, attachments, photos, signatures, undertakings, and ledgers
 * open seamlessly via bicsportal.netlify.app/media/... rather than direct res.cloudinary.com URLs.
 */
export const formatMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  // If already a relative /media/ or domain-relative /media/ URL (e.g. accidental localhost/Render /media/)
  if (trimmed.startsWith('/media/')) return trimmed;
  if (/^media\//i.test(trimmed)) return `/${trimmed}`;
  if (trimmed.includes('.netlify.app/media/')) {
    return trimmed.substring(trimmed.indexOf('/media/'));
  }
  const backendMediaMatch = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|[^/]+\.onrender\.com)(?::\d+)?(\/media\/.+)$/i);
  if (backendMediaMatch && backendMediaMatch[1]) {
    return backendMediaMatch[1];
  }

  // Match Cloudinary upload URLs (image/raw/video/auto upload)
  const match = trimmed.match(/cloudinary\.com\/[^/]+\/(image|raw|video|auto)\/upload\/(?:v\d+\/)?(?:BICS_2026\/)?(.+)$/i);
  if (match && match[2]) {
    const resourceType = match[1].toLowerCase();
    const subPath = match[2];
    if (subPath.toLowerCase().startsWith('otrf/')) {
      return `/media/${subPath}`;
    }
    if (resourceType === 'raw' && !subPath.toLowerCase().startsWith('raw/')) {
      return `/media/raw/${subPath}`;
    }
    return `/media/${subPath}`;
  }

  return trimmed;
};

/**
 * Resolves proctoring snapshots, baseline photos, and supporting proof URLs across both
 * local Vite dev (localhost:5173 -> 127.0.0.1:5000 / Vite /media proxy) and production
 * (bicsportal.netlify.app -> Netlify /media/* and /api/* -> Render).
 */
export const resolveMediaOrBackendUrl = (url, apiBase = '') => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  const formatted = formatMediaUrl(trimmed);
  if (formatted.startsWith('/media/')) {
    return formatted;
  }

  const normalizedApiBase = String(apiBase || '').replace(/\/+$/, '');
  const backendBase = normalizedApiBase.replace(/\/api$/, '');
  const isLocalApi = !backendBase || /^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.|10\.|172\.)/i.test(backendBase);

  // If a DB record stored an absolute localhost /public/... URL, rewrite it for production callers
  const localhostPublicMatch = formatted.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/public\/.+)$/i);
  if (localhostPublicMatch && localhostPublicMatch[1]) {
    if (isLocalApi) return formatted;
    return `${normalizedApiBase || '/api'}${localhostPublicMatch[1]}`;
  }

  if (formatted.startsWith('http://') || formatted.startsWith('https://')) {
    return formatted;
  }

  const cleanRel = formatted.startsWith('/') ? formatted : `/${formatted}`;
  if (cleanRel.startsWith('/public/') && !isLocalApi) {
    // Route /public/... via /api/public/... so Render serves it reliably through Netlify's /api/* proxy
    return `${normalizedApiBase || '/api'}${cleanRel}`;
  }

  return `${backendBase}${cleanRel}`;
};
