import React, { useRef, useEffect, useState } from 'react';

// Helper component to render KaTeX math expressions + basic bold/italics/code markdown
export const RichText = React.memo(function RichText({ text, style, className }) {
  const containerRef = useRef(null);

  // Check if window.katex is ready for synchronous string rendering
  const [katexLoaded, setKatexLoaded] = useState(
    () => typeof window !== 'undefined' && Boolean(window.katex && window.katex.renderToString)
  );

  useEffect(() => {
    if (!katexLoaded) {
      if (typeof window !== 'undefined' && window.katex && window.katex.renderToString) {
        setKatexLoaded(true);
      } else {
        const timer = setInterval(() => {
          if (typeof window !== 'undefined' && window.katex && window.katex.renderToString) {
            setKatexLoaded(true);
            clearInterval(timer);
          }
        }, 50);
        return () => clearInterval(timer);
      }
    }
  }, [katexLoaded]);

  const formatText = (raw) => {
    if (!raw) return '';

    const mathBlocks = [];
    const codeBlocks = [];
    const imageBlocks = [];
    let placeholderIndex = 0;
    let formatted = String(raw)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00A0/g, ' ');

    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    // Extract markdown images BEFORE HTML escaping: ![alt](url) or [](image_url) or [alt](image_url)
    formatted = formatted.replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      const cleanSrc = (src || '').trim();
      const isImage = match.startsWith('!') ||
        /\.(?:png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i.test(cleanSrc) ||
        /\/images\//i.test(cleanSrc) ||
        /\/drive\/images\//i.test(cleanSrc) ||
        /^data:image\//i.test(cleanSrc) ||
        !alt.trim();

      if (isImage) {
        const placeholder = `%%IMAGEBLOCK${placeholderIndex++}%%`;
        const isSafeUrl = /^(https?:\/\/|\/|data:image\/)/i.test(cleanSrc);
        imageBlocks.push({
          placeholder,
          alt: match.startsWith('!') ? escapeHtml((alt || '').trim()) : '',
          src: isSafeUrl ? escapeHtml(cleanSrc) : 'about:blank'
        });
        return placeholder;
      }
      return match;
    });

    // Temporarily extract triple-backtick code blocks
    formatted = formatted.replace(/```(?:cpp|c|python|java|html|css|js)?\n?([\s\S]*?)```/gi, (match, code) => {
      const placeholder = `%%CODEBLOCK${placeholderIndex++}%%`;
      codeBlocks.push({ placeholder, code: code.trim() });
      return placeholder;
    });

    // Temporarily extract double-dollar display math blocks with HTML escaping
    formatted = formatted.replace(/\$\$(.*?)\$\$/gs, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `$$${escapeHtml(mathContent)}$$`, isDisplay: true });
      return placeholder;
    });

    // Temporarily extract single-dollar inline math blocks with HTML escaping
    formatted = formatted.replace(/\$(.*?)\$/g, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `$${escapeHtml(mathContent)}$`, isDisplay: false });
      return placeholder;
    });

    // Temporarily extract \[...\] display math with HTML escaping
    formatted = formatted.replace(/\\\[(.*?)\\\]/gs, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `\\[${escapeHtml(mathContent)}\\]`, isDisplay: true });
      return placeholder;
    });

    // Temporarily extract \(...\) inline math with HTML escaping
    formatted = formatted.replace(/\\\((.*?)\\\)/g, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `\\(${escapeHtml(mathContent)}\\)`, isDisplay: false });
      return placeholder;
    });

    // Escape raw text sections for safety
    formatted = formatted
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Markdown inline styling
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code style="font-family: \'Roboto Mono\', Consolas, monospace; background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 90%; border: 1px solid #cbd5e1; color: #002147; font-weight: 600;">$1</code>');

    // Auto-detect and format raw/escaped HTML tags (excluding img) into markdown code pills
    formatted = formatted.replace(/&lt;(?:\/?(?!img)[a-z1-6]+(?:[\s=][^&>]*?)?)\/?&gt;/gi, (tag) => {
      return `<code style="font-family: 'Roboto Mono', Consolas, monospace; background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 90%; border: 1px solid #cbd5e1; color: #002147; font-weight: 600;">${tag}</code>`;
    });

    // Convert horizontal rules: ---, ***, ___ on their own line
    formatted = formatted.replace(/^(?:---|___|\*\*\*)\s*$/gm, '%%HORIZONTALRULE%%');

    // Convert generic markdown headings: # through ###### into section titles (supporting indentation, wrappers & trailing hashes)
    formatted = formatted.replace(/^[ \t]*(?:&lt;p&gt;|&lt;div&gt;|<p>|<div>)?\s*#{1,6}\s*(.+?)\s*#*\s*(?:&lt;\/p&gt;|&lt;\/div&gt;|<\/p>|<\/div>)?$/gim, (m, heading) => {
      return `%%SECTIONTITLE%%${heading.trim()}%%ENDSECTIONTITLE%%`;
    });

    // Convert section headers without # or with optional # (Input, Output, Note, Constraints, Example 1, etc.)
    formatted = formatted.replace(/^[ \t]*(?:&lt;p&gt;|&lt;div&gt;|<p>|<div>)?\s*(?:#{1,6}\s*)?(?:&lt;h[1-6]&gt;)?(?:<strong>)?(Input|Output|Input Format|Output Format|Note|Notes|Constraints|Interaction|Sample Input|Sample Output|Explanation|Additional Requirements|Question|Example(?:\s+\d+)?(?::[^\n]*)?):?(?:<\/strong>)?(?:&lt;\/h[1-6]&gt;)?\s*(?:&lt;\/p&gt;|&lt;\/div&gt;|<\/p>|<\/div>)?$/gim, (m, title) => {
      return `%%SECTIONTITLE%%${title.trim()}%%ENDSECTIONTITLE%%`;
    });

    // Parse lines in a paragraph into formatted HTML with tab-indented points
    const parseLinesWithIndentation = (paragraphText) => {
      const lines = paragraphText.split('\n');
      const resultLines = [];

      lines.forEach((line) => {
        const rawLine = line;
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        // Check for sub-bullet (indented with 2+ spaces or tab)
        const subBulletMatch = rawLine.match(/^(\s{2,}|\t+)([-*•])\s+(.*)$/);
        if (subBulletMatch) {
          resultLines.push(`
            <div style="display: flex; gap: 8px; margin: 4px 0 4px 32px; align-items: flex-start;">
              <span style="font-weight: 700; color: #0284c7; font-size: 9pt; margin-top: 1px;">•</span>
              <div style="flex: 1; color: #334155; line-height: 1.65;">${subBulletMatch[3]}</div>
            </div>
          `);
          return;
        }

        // Check for numbered point or bullet point: 1. 2. 1) A. B. - * •
        const listMatch = trimmedLine.match(/^(([0-9]+|[A-Z])[\.\)]|[-*•])\s+(.*)$/);
        if (listMatch) {
          const marker = listMatch[1];
          const content = listMatch[3];
          const isBullet = marker === '-' || marker === '*' || marker === '•';

          resultLines.push(`
            <div style="display: flex; gap: 10px; margin: 6px 0 6px 16px; align-items: flex-start;">
              <span style="font-weight: bold; color: #0284c7; min-width: ${isBullet ? '12px' : '22px'}; font-family: ${isBullet ? 'sans-serif' : '\'Roboto Mono\', monospace'}; text-align: left;">
                ${isBullet ? '•' : marker}
              </span>
              <div style="flex: 1; color: #0f172a; line-height: 1.65; text-align: justify; text-align-last: left;">${content}</div>
            </div>
          `);
          return;
        }

        // Check for horizontal rule: ---, ***, ___
        if (/^(?:---|___|\*\*\*)\s*$/.test(trimmedLine) || trimmedLine === '%%HORIZONTALRULE%%') {
          resultLines.push('<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />');
          return;
        }

        // Check for standalone LaTeX math block (e.g. $$...$$, $...$, \[...\], \(...\))
        // or a standalone mathematical equation (e.g., "p = 2+ i;", "y = mx + c")
        // Centers the equation horizontally with respect to the question viewer pane
        const isStandaloneMathPh = /^(?:%%MATHBLOCK[ID]\d+%%\s*)+[;,.]?$/.test(trimmedLine);
        const hasLatexMacro = /\\[a-zA-Z]+/.test(trimmedLine) && !/\b(if|for|while|return|const|let|var|function)\b/.test(trimmedLine) && trimmedLine.split(/\s+/).length <= 6;
        const isStandaloneRawEquation = !trimmedLine.includes('%%') &&
          !trimmedLine.includes('<') &&
          !trimmedLine.includes('>') &&
          /^[a-zA-Z\d_\^\{\}\(\)\[\]\s\*\+\-\/\\]+\s*=\s*[^=;]+;?$/.test(trimmedLine) &&
          !/^(if|for|while|return|const|let|var|def|class|public|private|function|case|switch|import|export)\b/i.test(trimmedLine) &&
          trimmedLine.split(/\s+/).length <= 10;

        if (isStandaloneMathPh || hasLatexMacro || isStandaloneRawEquation) {
          let mathLine = trimmedLine;
          if (isStandaloneMathPh) {
            // Upgrade inline math ($...$) to display math ($$...$$) if alone on its line for prominent typography
            mathBlocks.forEach(b => {
              if (mathLine.includes(b.placeholder)) {
                b.isDisplay = true;
                if (b.content.startsWith('$') && !b.content.startsWith('$$')) {
                  const inner = b.content.slice(1, -1);
                  b.content = `$$${inner}$$`;
                }
              }
            });
          } else {
            mathLine = `$$${trimmedLine}$$`;
          }

          resultLines.push(`
            <div class="cf-display-equation" style="display: flex; justify-content: center; align-items: center; width: 100%; margin: 14px 0; padding: 4px 0; line-height: 1.8; font-size: 18px; text-align: center; overflow: visible;">
              <div style="display: inline-block; text-align: center; max-width: 100%; overflow: visible;">
                ${mathLine}
              </div>
            </div>
          `);
          return;
        }

        // Normal paragraph line
        resultLines.push(`<div style="line-height: 1.7; margin-bottom: 4px; text-align: justify; text-align-last: left;">${trimmedLine}</div>`);
      });

      return resultLines.join('');
    };

    // Parse markdown tables (| col | col | rows) before paragraph splitting
    formatted = formatted.replace(
      /((?:(?:\|[^\n]+\|[ \t]*)\n?)+)/g,
      (block) => {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return block;
        const isSep = (l) => /^\|[\s\-:|]+\|$/.test(l);
        if (!isSep(lines[1])) return block;
        const parseRow = (l) => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const headers = parseRow(lines[0]);
        const alignLine = parseRow(lines[1]);
        const align = alignLine.map(a => {
          if (/^:-+:$/.test(a)) return 'center';
          if (/^-+:$/.test(a)) return 'right';
          return 'left';
        });
        const bodyRows = lines.slice(2).map(parseRow);
        const thCells = headers.map((h, i) =>
          `<th style="padding: 8px 14px; border: 1px solid #cbd5e1; background: #e8eef7; color: #002147; font-size: 8.5pt; font-weight: 700; text-align: ${align[i] || 'left'}; white-space: nowrap;">${h}</th>`
        ).join('');
        const bodyHtml = bodyRows.map(row =>
          `<tr>${row.map((c, i) =>
            `<td style="padding: 6px 14px; border: 1px solid #e2e8f0; font-size: 8.5pt; color: #334155; text-align: ${align[i] || 'left'};">${c}</td>`
          ).join('')}</tr>`
        ).join('');
        return `\n\n%%TABLEBLOCK%%<div style="overflow-x: auto; margin: 12px 0;"><table style="border-collapse: collapse; width: 100%; font-family: inherit; border: 1px solid #cbd5e1; border-radius: 4px; background: #ffffff;"><thead><tr>${thCells}</tr></thead><tbody>${bodyHtml}</tbody></table></div>%%ENDTABLEBLOCK%%\n\n`;
      }
    );

    // Split by double newlines into clean paragraphs
    const rawParagraphs = formatted.split(/\n\s*\n/);
    const htmlChunks = [];

    rawParagraphs.forEach((p) => {
      const trimmed = p.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('%%TABLEBLOCK%%') && trimmed.endsWith('%%ENDTABLEBLOCK%%')) {
        const tableHtml = trimmed.replace(/^%%TABLEBLOCK%%/, '').replace(/%%ENDTABLEBLOCK%%$/, '');
        htmlChunks.push(tableHtml);
        return;
      }

      if (trimmed === '%%HORIZONTALRULE%%' || /^(?:---|___|\*\*\*)\s*$/.test(trimmed)) {
        htmlChunks.push('<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />');
        return;
      }

      if (/^%%IMAGEBLOCK\d+%%$/.test(trimmed)) {
        htmlChunks.push(trimmed);
        return;
      }

      if (trimmed.includes('%%SECTIONTITLE%%') || trimmed.includes('%%HORIZONTALRULE%%')) {
        const parts = trimmed.split(/(%%SECTIONTITLE%%.*?%%ENDSECTIONTITLE%%|%%HORIZONTALRULE%%)/g);
        parts.forEach(part => {
          const pt = part.trim();
          if (!pt) return;
          if (pt.startsWith('%%SECTIONTITLE%%') && pt.endsWith('%%ENDSECTIONTITLE%%')) {
            const titleName = pt.replace('%%SECTIONTITLE%%', '').replace('%%ENDSECTIONTITLE%%', '');
            htmlChunks.push(`<div class="cf-section-title" style="font-weight: bold; color: #002147; font-size: 10.5pt; margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-align: left;">${titleName}</div>`);
          } else if (pt === '%%HORIZONTALRULE%%' || /^(?:---|___|\*\*\*)\s*$/.test(pt)) {
            htmlChunks.push('<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />');
          } else {
            const content = parseLinesWithIndentation(pt);
            htmlChunks.push(`<div class="cf-paragraph" style="margin-bottom: 10px; line-height: 1.7; text-align: justify; text-align-last: left;">${content}</div>`);
          }
        });
      } else {
        const content = parseLinesWithIndentation(trimmed);
        htmlChunks.push(`<div class="cf-paragraph" style="margin-bottom: 10px; line-height: 1.7; text-align: justify; text-align-last: left;">${content}</div>`);
      }
    });

    let resultHtml = htmlChunks.length > 0 ? htmlChunks.join('') : parseLinesWithIndentation(formatted);

    // Restore Image Blocks into styled centered cards
    imageBlocks.forEach(({ placeholder, alt, src }) => {
      const captionHtml = alt ? `<div style="font-size: 8pt; color: #64748b; margin-top: 6px; font-style: italic; text-align: center;">${alt}</div>` : '';
      const imgHtml = `<div style="margin: 8px auto; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;"><img src="${src}" alt="${alt}" style="max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.06);" />${captionHtml}</div>`;
      resultHtml = resultHtml.replace(placeholder, imgHtml);
    });

    // Restore Code Blocks with Light Theme
    codeBlocks.forEach(({ placeholder, code }) => {
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const codeHtml = `<pre style="background-color: #f8fafc; color: #0f172a; padding: 12px 16px; border-radius: 6px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 9.5pt; overflow-x: auto; margin: 12px 0; border: 1px solid #cbd5e1; line-height: 1.5; text-align: left;"><code>${escapedCode}</code></pre>`;
      resultHtml = resultHtml.replace(placeholder, codeHtml);
    });

    // Restore LaTeX formulas directly as rendered KaTeX HTML strings if window.katex is ready!
    mathBlocks.forEach(({ placeholder, content, isDisplay }) => {
      let replacement = content;
      if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
        try {
          let inner = content;
          if (content.startsWith('$$') && content.endsWith('$$')) {
            inner = content.slice(2, -2);
          } else if (content.startsWith('$') && content.endsWith('$')) {
            inner = content.slice(1, -1);
          } else if (content.startsWith('\\[') && content.endsWith('\\]')) {
            inner = content.slice(2, -2);
          } else if (content.startsWith('\\(') && content.endsWith('\\)')) {
            inner = content.slice(2, -2);
          }

          // Unescape HTML entities from inner so KaTeX receives clean mathematical syntax
          inner = inner
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

          replacement = window.katex.renderToString(inner, {
            displayMode: Boolean(isDisplay),
            throwOnError: false
          });
        } catch (e) {
          replacement = content;
        }
      }
      resultHtml = resultHtml.replace(placeholder, replacement);
    });

    return resultHtml;
  };

  useEffect(() => {
    // Fallback: If any unrendered LaTeX expressions remain in the DOM, run auto-render
    if (containerRef.current && window.renderMathInElement) {
      const html = containerRef.current.innerHTML || '';
      if (html.includes('$') || html.includes('\\(') || html.includes('\\[') || html.includes('%%MATHBLOCK')) {
        try {
          window.renderMathInElement(containerRef.current, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
          });
        } catch (err) {
          console.error("KaTeX fallback auto-render failed:", err);
        }
      }
    }
  });

  return (
    <div
      ref={containerRef}
      style={style}
      className={className}
      dangerouslySetInnerHTML={{ __html: formatText(text) }}
    />
  );
}, (prevProps, nextProps) => {
  if (prevProps.text !== nextProps.text) return false;
  if (prevProps.className !== nextProps.className) return false;
  const s1 = prevProps.style || {};
  const s2 = nextProps.style || {};
  const keys1 = Object.keys(s1);
  const keys2 = Object.keys(s2);
  if (keys1.length !== keys2.length) return false;
  for (let key of keys1) {
    if (s1[key] !== s2[key]) return false;
  }
  return true;
});

export default RichText;
