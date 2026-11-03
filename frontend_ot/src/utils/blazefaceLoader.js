/**
 * blazefaceLoader.js
 * 
 * High-performance, zero-UI-lag BlazeFace singleton loader with non-blocking idle scheduling.
 * Prevents WebGL shader compilation from blocking the JavaScript event loop or freezing
 * initial candidate flow (verify_login, terms_conditions, and system_checks).
 */

let sharedModel = null;
let loadPromise = null;
let isWarming = false;
let isWarmed = false;

/**
 * Returns true if the BlazeFace model has been loaded and initialized.
 */
export function isBlazeFaceReady() {
  return Boolean(sharedModel || (typeof window !== 'undefined' && window._sharedBlazefaceModel));
}

/**
 * Pre-warms TensorFlow.js WebGL shaders on a tiny dummy canvas without blocking the main thread.
 * WebGL synchronous shader compilation is deferred across animation frames.
 */
async function prewarmBlazeFaceShaders(model) {
  if (isWarmed || !model) return;
  try {
    // Yield to the browser frame loop before triggering WebGL compilation
    await new Promise(resolve => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => setTimeout(resolve, 30));
      } else {
        setTimeout(resolve, 50);
      }
    });

    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = 16;
    dummyCanvas.height = 16;
    const ctx = dummyCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);
    }

    await model.estimateFaces(dummyCanvas, false);
    isWarmed = true;
    console.log("[BLAZEFACE_LOADER]: WebGL shaders pre-warmed smoothly in background idle frame.");
  } catch (err) {
    console.warn("[BLAZEFACE_LOADER]: Shader pre-warm notice:", err.message);
  }
}

/**
 * Retrieves or initializes the shared BlazeFace singleton model instance.
 * Guarantees that window.blazeface.load() is invoked exactly once across the application lifecycle.
 */
export async function getBlazeFaceModel(options = { prewarm: true }) {
  if (typeof window === 'undefined') return null;

  if (sharedModel) {
    if (options.prewarm && !isWarmed && !isWarming) {
      isWarming = true;
      prewarmBlazeFaceShaders(sharedModel).finally(() => { isWarming = false; });
    }
    return sharedModel;
  }

  if (window._sharedBlazefaceModel) {
    sharedModel = window._sharedBlazefaceModel;
    if (options.prewarm && !isWarmed && !isWarming) {
      isWarming = true;
      prewarmBlazeFaceShaders(sharedModel).finally(() => { isWarming = false; });
    }
    return sharedModel;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      // 1. Check if window.blazeface is immediately available
      let blazefaceLib = window.blazeface;

      // 2. If CDN script is still hydrating, poll politely with non-blocking yields
      if (!blazefaceLib) {
        const startTime = Date.now();
        while (!window.blazeface && Date.now() - startTime < 8000) {
          await new Promise(r => setTimeout(r, 100));
        }
        blazefaceLib = window.blazeface;
      }

      if (!blazefaceLib) {
        console.warn("[BLAZEFACE_LOADER]: BlazeFace script not found on window.");
        loadPromise = null;
        return null;
      }

      console.log("[BLAZEFACE_LOADER]: Loading BlazeFace singleton model...");
      const model = await blazefaceLib.load();
      sharedModel = model;
      window._sharedBlazefaceModel = model;
      console.log("[BLAZEFACE_LOADER]: BlazeFace singleton model loaded successfully.");

      if (options.prewarm && !isWarmed) {
        prewarmBlazeFaceShaders(model).catch(() => {});
      }

      return model;
    } catch (err) {
      console.error("[BLAZEFACE_LOADER]: Failed to load BlazeFace model:", err);
      loadPromise = null;
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Triggers non-blocking idle pre-loading and WebGL pre-warming.
 * Scheduled via requestIdleCallback so it NEVER interferes with UI gestures, typing, or screen transitions.
 */
export function preloadBlazeFaceIdle() {
  if (typeof window === 'undefined') return;
  if ((sharedModel && isWarmed) || isWarming) return;

  const scheduleIdle = typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 200);

  scheduleIdle(async (deadline) => {
    // If the browser main thread is currently busy, defer to another idle tick
    if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 12) {
      setTimeout(preloadBlazeFaceIdle, 300);
      return;
    }

    try {
      isWarming = true;
      const model = await getBlazeFaceModel({ prewarm: false });
      if (model && !isWarmed) {
        await prewarmBlazeFaceShaders(model);
      }
    } catch (err) {
      console.warn("[BLAZEFACE_LOADER]: Idle preload notice:", err.message);
    } finally {
      isWarming = false;
    }
  }, { timeout: 5000 });
}
