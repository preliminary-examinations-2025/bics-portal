import React, { useRef, useEffect } from 'react';

// Helper component to render KaTeX math expressions + basic bold/italics/code markdown
export const RichText = React.memo(function RichText({ text, style, className }) {
  const containerRef = useRef(null);

  const formatText = (raw) => {
    if (!raw) return '';

    const mathBlocks = [];
    const codeBlocks = [];
    const imageBlocks = [];
    let placeholderIndex = 0;
    let formatted = String(raw).replace(/\r\n/g, '\n');

    // Extract markdown images BEFORE HTML escaping: ![alt](url)
    formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      const placeholder = `%%IMAGEBLOCK${placeholderIndex++}%%`;
      imageBlocks.push({ placeholder, alt: alt || 'Question Image', src: src.trim() });
      return placeholder;
    });

    // Temporarily extract triple-backtick code blocks
    formatted = formatted.replace(/```(?:cpp|c|python|java|html|css|js)?\n?([\s\S]*?)```/gi, (match, code) => {
      const placeholder = `%%CODEBLOCK${placeholderIndex++}%%`;
      codeBlocks.push({ placeholder, code: code.trim() });
      return placeholder;
    });

    // Temporarily extract double-dollar display math blocks
    formatted = formatted.replace(/\$\$(.*?)\$\$/gs, (match) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: match });
      return placeholder;
    });

    // Temporarily extract single-dollar inline math blocks
    formatted = formatted.replace(/\$(.*?)\$/g, (match) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: match });
      return placeholder;
    });

    // Temporarily extract \[...\] display math
    formatted = formatted.replace(/\\\[(.*?)\\\]/gs, (match) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: match });
      return placeholder;
    });

    // Temporarily extract \(...\) inline math
    formatted = formatted.replace(/\\\((.*?)\\\)/g, (match) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: match });
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

    // Convert section headers (Input, Output, Note, Constraints, etc.)
    formatted = formatted.replace(/^(?:#{1,6}\s+)?(?:&lt;h[1-6]&gt;)?(?:<strong>)?(Input|Output|Note|Notes|Constraints|Interaction|Sample Input|Sample Output|Explanation|Additional Requirements|Question):?(?:<\/strong>)?(?:&lt;\/h[1-6]&gt;)?$/gim, (m, title) => {
      return `%%SECTIONTITLE%%${title}%%ENDSECTIONTITLE%%`;
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

        // Normal paragraph line
        resultLines.push(`<div style="line-height: 1.7; margin-bottom: 4px; text-align: justify; text-align-last: left;">${trimmedLine}</div>`);
      });

      return resultLines.join('');
    };

    // Split by double newlines into clean paragraphs
    const rawParagraphs = formatted.split(/\n\s*\n/);
    const htmlChunks = [];

    rawParagraphs.forEach((p) => {
      const trimmed = p.trim();
      if (!trimmed) return;

      if (trimmed.includes('%%SECTIONTITLE%%')) {
        const parts = trimmed.split(/(%%SECTIONTITLE%%.*?%%ENDSECTIONTITLE%%)/g);
        parts.forEach(part => {
          const pt = part.trim();
          if (!pt) return;
          if (pt.startsWith('%%SECTIONTITLE%%') && pt.endsWith('%%ENDSECTIONTITLE%%')) {
            const titleName = pt.replace('%%SECTIONTITLE%%', '').replace('%%ENDSECTIONTITLE%%', '');
            htmlChunks.push(`<div class="cf-section-title" style="font-weight: bold; color: #002147; font-size: 10.5pt; margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-align: left;">${titleName}</div>`);
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
      const imgHtml = `<div style="margin: 14px 0; text-align: center; border: 1px solid #bae6fd; border-radius: 6px; padding: 10px; background-color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><img src="${src}" alt="${alt}" style="max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 4px; display: inline-block;" /><div style="font-size: 8pt; color: #64748b; margin-top: 6px; font-style: italic;">${alt}</div></div>`;
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

    // Restore original LaTeX formulas back inside placeholders
    mathBlocks.forEach(({ placeholder, content }) => {
      resultHtml = resultHtml.replace(placeholder, content);
    });

    return resultHtml;
  };

  useEffect(() => {
    const renderMath = () => {
      if (containerRef.current && window.renderMathInElement) {
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
          console.error("KaTeX auto-render failed:", err);
        }
      } else if (!window.renderMathInElement) {
        setTimeout(renderMath, 100);
      }
    };

    renderMath();
  }); // Run math rendering on every render cycle so KaTeX math is always preserved!

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
