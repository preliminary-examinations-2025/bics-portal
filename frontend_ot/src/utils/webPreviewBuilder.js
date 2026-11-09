import { injectLoopGuards } from './codeSandboxGuard.js';

/**
 * Resolves the active HTML, CSS, and JS strings for a Web Development question.
 * When `draftQIdx !== selectedQuestionIndex` (e.g., Render-1 of a question switch
 * before passive useEffect syncs React state), it ignores stale drafts from the
 * previous question and resolves directly from `answer` or starter `initial*` code.
 */
export function resolveWebQuestionDrafts({
  question,
  answer,
  selectedQuestionIndex,
  draftQIdx,
  draftHtml,
  draftCss,
  draftJs
} = {}) {
  if (!question) {
    return { html: '', css: '', js: '', isCurrent: false };
  }

  const starterHtml = question.initialHtml || question.initialCode?.html || '';
  const starterCss = question.initialCss || question.initialCode?.css || '';
  const starterJs = question.initialJs || question.initialCode?.js || '';

  const fallbackHtml = (answer && answer.submittedHtml !== undefined && answer.submittedHtml !== null && answer.submittedHtml !== '')
    ? answer.submittedHtml
    : starterHtml;
  const fallbackCss = (answer && answer.submittedCss !== undefined && answer.submittedCss !== null && answer.submittedCss !== '')
    ? answer.submittedCss
    : starterCss;
  const fallbackJs = (answer && answer.submittedJs !== undefined && answer.submittedJs !== null && answer.submittedJs !== '')
    ? answer.submittedJs
    : starterJs;

  const isCurrent =
    draftQIdx !== undefined &&
    draftQIdx !== null &&
    draftQIdx === selectedQuestionIndex;

  return {
    html: isCurrent
      ? ((draftHtml !== undefined && draftHtml !== null && draftHtml !== '') ? draftHtml : fallbackHtml)
      : fallbackHtml,
    css: isCurrent
      ? ((draftCss !== undefined && draftCss !== null && draftCss !== '') ? draftCss : fallbackCss)
      : fallbackCss,
    js: isCurrent
      ? ((draftJs !== undefined && draftJs !== null && draftJs !== '') ? draftJs : fallbackJs)
      : fallbackJs,
    isCurrent
  };
}

function escapeStyleContent(css) {
  return String(css || '').replace(/<\/style/gi, '<\\/style');
}

function escapeScriptContent(js) {
  return String(js || '').replace(/<\/script/gi, '<\\/script');
}

function buildConsoleShimScript() {
  return `(function() {
  function serializeArg(val) {
    if (typeof val === 'string') return val;
    if (val instanceof Error) return val.message || String(val);
    if (typeof val === 'object' && val !== null) {
      try { return JSON.stringify(val); } catch (_) { return String(val); }
    }
    return String(val);
  }
  function emitLog(level, argsLike) {
    try {
      var text = Array.prototype.map.call(argsLike, serializeArg).join(' ');
      window.parent.postMessage({ type: 'WEB_CONSOLE_LOG', level: level, text: text }, '*');
      window.parent.postMessage({ type: 'IFRAME_CONSOLE_LOG', level: level, text: text }, '*');
    } catch (_) {}
  }
  var _log = console.log;
  var _warn = console.warn;
  var _err = console.error;
  console.log = function() {
    if (_log) _log.apply(console, arguments);
    emitLog('log', arguments);
  };
  console.warn = function() {
    if (_warn) _warn.apply(console, arguments);
    emitLog('warn', arguments);
  };
  console.error = function() {
    if (_err) _err.apply(console, arguments);
    emitLog('error', arguments);
  };
  window.onerror = function(msg, url, line) {
    var errText = String(msg || 'Script Error') + (line ? ' (line ' + line + ')' : '');
    try {
      window.parent.postMessage({ type: 'WEB_CONSOLE_LOG', level: 'error', text: errText }, '*');
      window.parent.postMessage({ type: 'IFRAME_CONSOLE_LOG', level: 'error', text: errText }, '*');
    } catch (_) {}
    return true;
  };
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event && event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise rejection';
    try {
      window.parent.postMessage({ type: 'WEB_CONSOLE_LOG', level: 'error', text: reason }, '*');
      window.parent.postMessage({ type: 'IFRAME_CONSOLE_LOG', level: 'error', text: reason }, '*');
    } catch (_) {}
  });
})();`;
}

/**
 * Compiles HTML, CSS, and guarded JS into an isolated srcDoc HTML document.
 * Handles both HTML body fragments and full `<!DOCTYPE html>...</html>` templates.
 */
export function buildWebPreviewSrcDoc({
  html = '',
  css = '',
  js = '',
  timeoutMs = 2000
} = {}) {
  const safeCss = escapeStyleContent(css);
  const guardedJs = escapeScriptContent(injectLoopGuards(js || '', timeoutMs));
  const rawHtml = String(html || '');

  const headInjection = `<base href="https://invalid-sandbox-origin.invalid/">
<style>
  html, body {
    margin: 0;
    padding: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    word-wrap: break-word;
    box-sizing: border-box;
  }
  *, *:before, *:after {
    box-sizing: inherit;
  }
  ${safeCss}
</style>
<script>
${buildConsoleShimScript()}
</script>`;

  const userScriptBlock = `<script>
  try {
    ${guardedJs}
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
  }
</script>`;

  const isFullHtmlDoc =
    /<\s*html\b/i.test(rawHtml) &&
    /<\/\s*head\s*>/i.test(rawHtml) &&
    /<\/\s*body\s*>/i.test(rawHtml);

  if (isFullHtmlDoc) {
    let doc = rawHtml.replace(/<\/\s*head\s*>/i, (match) => `${headInjection}\n${match}`);
    doc = doc.replace(/<\/\s*body\s*>/i, (match) => `${userScriptBlock}\n${match}`);
    return doc;
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    ${headInjection}
  </head>
  <body>
    ${rawHtml}
    ${userScriptBlock}
  </body>
</html>`;
}
