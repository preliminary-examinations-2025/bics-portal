/**
 * Utility function to convert any Cloudinary URL to Netlify /media/ proxy URL.
 * Ensures media, documents, attachments, photos, signatures, undertakings, and ledgers
 * open seamlessly via bicsportal.netlify.app/media/... rather than direct res.cloudinary.com URLs.
 */
export const formatMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return url;

  // If already a relative /media/ or domain-relative /media/ URL
  if (url.startsWith('/media/')) return url;
  if (url.includes('.netlify.app/media/')) {
    return url.substring(url.indexOf('/media/'));
  }

  // Match Cloudinary upload URLs (image/raw/video/auto upload)
  const match = url.match(/cloudinary\.com\/[^/]+\/(?:image|raw|video|auto)\/upload\/(?:v\d+\/)?(?:BICS_2026\/)?(.+)$/i);
  if (match && match[1]) {
    return `/media/${match[1]}`;
  }

  return url;
};
