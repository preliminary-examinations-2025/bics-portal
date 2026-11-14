const cloudinary = require('cloudinary').v2;

let useCloudinary = false;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    useCloudinary = true;
    console.log("--> Cloudinary SDK active: uploads will route directly in-memory.");
} else {
    console.warn("--> Cloudinary credentials missing in .env. Falling back to mock URLs during registration.");
}

const isCloudinaryConfigured = () => !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

// Helper to convert Cloudinary URLs to Netlify /media/ proxy URLs
const formatCloudinaryMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('/media/') || url.includes('.netlify.app/media/')) return url;
    const match = url.match(/cloudinary\.com\/[^/]+\/(image|raw|video|auto)\/upload\/(?:v\d+\/)?(?:BICS_2026\/)?(.+)$/i);
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
    return url;
};

// Helper to stream file buffers to Cloudinary
const uploadToCloudinary = (fileBuffer, folder, resourceType = 'auto', customPublicId = null) => {
    return new Promise((resolve, reject) => {
        if (isCloudinaryConfigured()) {
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
        }
        const options = { 
            folder: folder, 
            resource_type: resourceType,
            overwrite: true,
            invalidate: true
        };
        if (customPublicId) {
            options.public_id = customPublicId;
            options.use_filename = true;
            options.unique_filename = false;
        }
        const stream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                if (error) return reject(error);
                const rawUrl = result.secure_url || result.url;
                resolve(formatCloudinaryMediaUrl(rawUrl));
            }
        );
        stream.end(fileBuffer);
    });
};

// Helper to upload media drive assets with full metadata return
const uploadDriveAssetToCloudinary = (fileBuffer, { folder = 'BICS_2026/drive', resourceType = 'auto', filename = null }) => {
    return new Promise((resolve, reject) => {
        const safeName = filename || `file_${Date.now()}`;
        if (!isCloudinaryConfigured()) {
            const mockUrl = `/media/${folder.replace('BICS_2026/', '')}/${safeName}`;
            return resolve({
                cdnUrl: `https://res.cloudinary.com/dl7xqcnmr/image/upload/${folder}/${safeName}`,
                proxyUrl: mockUrl,
                publicId: `${folder}/${safeName}`,
                bytes: fileBuffer ? fileBuffer.length : 0,
                format: safeName.split('.').pop() || 'bin',
                resourceType: resourceType === 'auto' ? 'image' : resourceType
            });
        }
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        const options = {
            folder,
            resource_type: resourceType,
            overwrite: true,
            invalidate: true,
            use_filename: true,
            unique_filename: false
        };
        if (filename) {
            const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
            options.public_id = nameWithoutExt;
        }
        const stream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                if (error) return reject(error);
                const cdnUrl = result.secure_url || result.url;
                const proxyUrl = formatCloudinaryMediaUrl(cdnUrl);
                resolve({
                    cdnUrl,
                    proxyUrl,
                    publicId: result.public_id,
                    bytes: result.bytes,
                    format: result.format || (filename ? filename.split('.').pop() : 'bin'),
                    resourceType: result.resource_type
                });
            }
        );
        stream.end(fileBuffer);
    });
};

// Helper to remove asset from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
    if (!isCloudinaryConfigured() || !publicId) return { result: 'ok' };
    try {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
    } catch (err) {
        console.warn(`[CLOUDINARY_DELETE_WARN]: Could not destroy ${publicId}:`, err.message);
        return { result: 'error', error: err.message };
    }
};

module.exports = {
    cloudinary,
    useCloudinary,
    isCloudinaryConfigured,
    formatCloudinaryMediaUrl,
    uploadToCloudinary,
    uploadDriveAssetToCloudinary,
    deleteFromCloudinary
};
