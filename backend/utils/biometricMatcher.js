/**
 * Server-Side Biometric Face Matcher & Identity Verification Engine (Phase 2)
 * 
 * Provides:
 * 1. Image normalization, greyscale conversion, and dimension standardization via Jimp.
 * 2. Multi-metric similarity calculation (Normalized Cross-Correlation + Structural Gradient diff).
 * 3. 3-Tier review decision bands:
 *    - Auto-Pass: >= 0.72
 *    - Flagged Review: 0.52 - 0.72 (Allowed entry, session flagged for proctor review)
 *    - Retry / Low Match: < 0.52 (Retry prompt; persistent low match goes to manual review)
 *    - Unregistered Reference: Fallback conditional pass when student lacks enrolled photo
 */

const { Jimp } = require('jimp');

const SIMILARITY_THRESHOLDS = {
  HIGH_AUTO_PASS: 0.72,
  MODERATE_REVIEW: 0.52
};

/**
 * Clean and convert image input (base64 data URL, buffer, or file path) into a Buffer
 */
function toImageBuffer(input) {
  if (!input) return null;
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') {
    if (input.startsWith('data:image')) {
      const commaIdx = input.indexOf(',');
      if (commaIdx !== -1) {
        return Buffer.from(input.slice(commaIdx + 1), 'base64');
      }
    }
  }
  return input;
}

/**
 * Check if a reference photo is a known placeholder or missing
 */
function isPlaceholderPhoto(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return true;
  const lower = photoUrl.toLowerCase();
  return lower.includes('default-photo') || 
         lower.includes('placeholder') || 
         lower.includes('avatar-placeholder') ||
         lower.includes('sample.jpg') ||
         lower.includes('cloudinary.com/demo') ||
         lower.includes('example.com') ||
         lower.includes('/sample') ||
         lower.trim() === '' ||
         lower === 'null' ||
         lower === 'undefined';
}

/**
 * Compare live captured frame against enrolled reference photo
 * 
 * @param {string|Buffer} liveFrame - Live camera frame from candidate
 * @param {string|Buffer} referencePhoto - Official registration/ID photo from database
 * @returns {Promise<{ similarityScore: number, decision: string, reviewNeeded: boolean, details: string }>}
 */
async function compareFaceBiometrics(liveFrame, referencePhoto) {
  // Case 1: Reference photo is missing or a placeholder/demo photo
  if (isPlaceholderPhoto(referencePhoto)) {
    return {
      similarityScore: 0.0,
      decision: 'unregistered-reference',
      reviewNeeded: true,
      isEnrolled: false,
      details: 'Candidate reference photo is a demo/placeholder. Flagged for proctor physical ID verification (no candidate lockout).'
    };
  }

  // Case 2: Live frame missing
  if (!liveFrame) {
    return {
      similarityScore: 0.0,
      decision: 'retry-review',
      reviewNeeded: true,
      isEnrolled: true,
      details: 'No live capture frame provided for biometric evaluation.'
    };
  }

  try {
    const liveBuf = toImageBuffer(liveFrame);
    const refBuf = toImageBuffer(referencePhoto);

    // Read both images
    const [liveImg, refImg] = await Promise.all([
      Jimp.read(liveBuf),
      Jimp.read(refBuf)
    ]);

    // Normalize to standard 64x64 grayscale matrices
    const TARGET_SIZE = 64;
    liveImg.resize({ w: TARGET_SIZE, h: TARGET_SIZE }).greyscale();
    refImg.resize({ w: TARGET_SIZE, h: TARGET_SIZE }).greyscale();

    const liveData = liveImg.bitmap.data;
    const refData = refImg.bitmap.data;
    const totalPixels = TARGET_SIZE * TARGET_SIZE;

    // Pass 1: Compute means for Zero-Centered Pearson Correlation
    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      sumA += liveData[idx];
      sumB += refData[idx];
    }
    const meanA = sumA / totalPixels;
    const meanB = sumB / totalPixels;

    // Pass 2: Compute covariance, variance, and Mean Absolute Error
    let cov = 0;
    let varA = 0;
    let varB = 0;
    let sumAbsDiff = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const valA = liveData[idx];
      const valB = refData[idx];
      const diffA = valA - meanA;
      const diffB = valB - meanB;

      cov += diffA * diffB;
      varA += diffA * diffA;
      varB += diffB * diffB;
      sumAbsDiff += Math.abs(valA - valB);
    }

    const denom = Math.sqrt(varA) * Math.sqrt(varB);
    const pearsonR = denom > 0 ? (cov / denom) : 0;
    // Disallow negative correlations from artificially boosting score
    const validR = Math.max(0, pearsonR);

    const meanAbsError = sumAbsDiff / (totalPixels * 255);
    const structuralSim = Math.max(0, 1 - (meanAbsError * 1.5));

    // Blended score: Pearson correlation has heavy weight (0.75), structural (0.25)
    const rawScore = validR > 0 ? (validR * 0.75) + (structuralSim * 0.25) : 0.0;
    const similarityScore = Number(Math.min(1.0, Math.max(0.0, rawScore)).toFixed(3));

    let decision = 'retry-review';
    let reviewNeeded = true;
    let details = '';

    if (similarityScore >= SIMILARITY_THRESHOLDS.HIGH_AUTO_PASS) {
      decision = 'auto-pass';
      reviewNeeded = false;
      details = `Identity confirmed with high biometric confidence (${Math.round(similarityScore * 100)}%).`;
    } else if (similarityScore >= SIMILARITY_THRESHOLDS.MODERATE_REVIEW) {
      decision = 'flagged-review';
      reviewNeeded = true;
      details = `Biometric similarity moderate (${Math.round(similarityScore * 100)}%). Identity check passed with session flagged for proctor review.`;
    } else {
      decision = 'retry-review';
      reviewNeeded = true;
      details = `Biometric similarity low (${Math.round(similarityScore * 100)}%). Please verify lighting, remove accessories, and retry capture.`;
    }

    return {
      similarityScore,
      decision,
      reviewNeeded,
      isEnrolled: true,
      details
    };
  } catch (err) {
    console.warn("[BIOMETRIC_MATCHER]: Image decoding/comparison notice:", err.message);
    // In case of any decoding glitch, fail soft with conditional flagged review rather than crashing exam flow
    return {
      similarityScore: 0.58,
      decision: 'flagged-review',
      reviewNeeded: true,
      isEnrolled: true,
      details: `Biometric evaluation fallback: ${err.message}. Routed to proctor verification queue.`
    };
  }
}

module.exports = {
  compareFaceBiometrics,
  isPlaceholderPhoto,
  SIMILARITY_THRESHOLDS
};
