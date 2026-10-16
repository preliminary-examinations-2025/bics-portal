/**
 * Web Preview Sandbox Execution Guard (Item 2.2)
 * 
 * Pre-parses candidate JavaScript before injection into the preview iframe.
 * Injects deterministic wall-clock timeout guards into all loops (for, while, do-while)
 * to prevent infinite loops from freezing the browser's main thread and terminal UI.
 */

export function injectLoopGuards(jsCode, timeoutMs = 2000) {
  if (!jsCode || typeof jsCode !== 'string') return jsCode || '';

  let transformed = '';
  let i = 0;
  const len = jsCode.length;
  let guardCount = 0;

  while (i < len) {
    const char = jsCode[i];
    const next = jsCode[i + 1];

    // 1. Skip single-line comments
    if (char === '/' && next === '/') {
      const lineEnd = jsCode.indexOf('\n', i);
      if (lineEnd === -1) {
        transformed += jsCode.slice(i);
        break;
      }
      transformed += jsCode.slice(i, lineEnd + 1);
      i = lineEnd + 1;
      continue;
    }

    // 2. Skip multi-line comments
    if (char === '/' && next === '*') {
      const commentEnd = jsCode.indexOf('*/', i + 2);
      if (commentEnd === -1) {
        transformed += jsCode.slice(i);
        break;
      }
      transformed += jsCode.slice(i, commentEnd + 2);
      i = commentEnd + 2;
      continue;
    }

    // 3. Skip string literals (single, double, template)
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      let j = i + 1;
      let escaped = false;
      while (j < len) {
        if (!escaped && jsCode[j] === quote) {
          j++;
          break;
        }
        if (jsCode[j] === '\\') {
          escaped = !escaped;
        } else {
          escaped = false;
        }
        j++;
      }
      transformed += jsCode.slice(i, j);
      i = j;
      continue;
    }

    // Helper: test if word boundary precedes index i
    const isWordBoundaryBefore = (idx) => {
      if (idx === 0) return true;
      const prevChar = jsCode[idx - 1];
      return !/[a-zA-Z0-9_$]/.test(prevChar);
    };

    // Helper: test if word boundary follows keyword
    const isWordBoundaryAfter = (idx) => {
      if (idx >= len) return true;
      const nextChar = jsCode[idx];
      return !/[a-zA-Z0-9_$]/.test(nextChar);
    };

    // 4. Detect 'for' or 'while' loops
    const isFor = jsCode.startsWith('for', i) && isWordBoundaryBefore(i) && isWordBoundaryAfter(i + 3);
    const isWhile = jsCode.startsWith('while', i) && isWordBoundaryBefore(i) && isWordBoundaryAfter(i + 5);
    const isDo = jsCode.startsWith('do', i) && isWordBoundaryBefore(i) && isWordBoundaryAfter(i + 2);

    // Make sure 'while' is not part of a 'do ... while' tail
    let isDoWhileTail = false;
    if (isWhile) {
      let lookBack = i - 1;
      while (lookBack >= 0 && /\s/.test(jsCode[lookBack])) lookBack--;
      if (lookBack >= 0 && jsCode[lookBack] === '}') {
        // Could be do { ... } while (...);
        // We only guard the 'do' body, not the tail 'while' condition
        isDoWhileTail = true;
      }
    }

    if ((isFor || (isWhile && !isDoWhileTail))) {
      const keyword = isFor ? 'for' : 'while';
      const keyLen = keyword.length;
      
      // Look for opening parenthesis of the loop condition/header
      let parenOpen = i + keyLen;
      while (parenOpen < len && /\s/.test(jsCode[parenOpen])) parenOpen++;

      if (parenOpen < len && jsCode[parenOpen] === '(') {
        // Find matching closing parenthesis
        let depth = 1;
        let parenClose = parenOpen + 1;
        while (parenClose < len && depth > 0) {
          if (jsCode[parenClose] === '(') depth++;
          else if (jsCode[parenClose] === ')') depth--;
          parenClose++;
        }

        if (depth === 0) {
          // parenClose is now right after the matching ')'
          const loopHeader = jsCode.slice(i, parenClose);
          guardCount++;
          const guardId = `_bics_loop_guard_${guardCount}`;
          const guardInit = `\nconst ${guardId} = Date.now();\n`;
          const guardCheck = `if (Date.now() - ${guardId} > ${timeoutMs}) { throw new Error("[SANDBOX_TIMEOUT]: Execution exceeded timeout limit of ${timeoutMs}ms. Infinite loop terminated."); }\n`;

          // Check if body starts with '{'
          let bodyStart = parenClose;
          while (bodyStart < len && /\s/.test(jsCode[bodyStart])) bodyStart++;

          if (bodyStart < len && jsCode[bodyStart] === '{') {
            // Braced loop body
            transformed += guardInit + loopHeader + jsCode.slice(parenClose, bodyStart + 1) + ' ' + guardCheck;
            i = bodyStart + 1;
            continue;
          } else if (bodyStart < len) {
            // Single-statement loop body without braces
            // Find end of single statement (semicolon or newline)
            let stmtEnd = bodyStart;
            while (stmtEnd < len && jsCode[stmtEnd] !== ';' && jsCode[stmtEnd] !== '\n') stmtEnd++;
            if (stmtEnd < len && jsCode[stmtEnd] === ';') stmtEnd++;
            
            const singleStmt = jsCode.slice(bodyStart, stmtEnd);
            transformed += guardInit + loopHeader + ' { ' + guardCheck + singleStmt + ' } ';
            i = stmtEnd;
            continue;
          }
        }
      }
    }

    // 5. Detect 'do' loop: do { ... } while (...);
    if (isDo) {
      guardCount++;
      const guardId = `_bics_loop_guard_${guardCount}`;
      const guardInit = `\nconst ${guardId} = Date.now();\n`;
      const guardCheck = `if (Date.now() - ${guardId} > ${timeoutMs}) { throw new Error("[SANDBOX_TIMEOUT]: Execution exceeded timeout limit of ${timeoutMs}ms. Infinite loop terminated."); }\n`;

      let braceOpen = i + 2;
      while (braceOpen < len && /\s/.test(jsCode[braceOpen])) braceOpen++;

      if (braceOpen < len && jsCode[braceOpen] === '{') {
        transformed += guardInit + 'do {' + ' ' + guardCheck;
        i = braceOpen + 1;
        continue;
      }
    }

    // Regular character
    transformed += char;
    i++;
  }

  return transformed;
}

export default injectLoopGuards;
