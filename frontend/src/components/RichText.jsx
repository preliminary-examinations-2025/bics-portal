import React, { useRef, useEffect } from 'react';

const RichText = React.memo(function RichText({ text, style, className }) {
  const containerRef = useRef(null);

  const formatText = (raw) => {
    if (!raw) return '';

    const mathBlocks = [];
    const imageBlocks = [];
    let formatted = raw;

    let placeholderIndex = 0;

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

    // Temporarily extract double-dollar display math blocks with HTML escaping
    formatted = formatted.replace(/\$\$(.*?)\$\$/gs, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `$$${escapeHtml(mathContent)}$$` });
      return placeholder;
    });

    // Temporarily extract single-dollar inline math blocks with HTML escaping
    formatted = formatted.replace(/\$(.*?)\$/g, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `$${escapeHtml(mathContent)}$` });
      return placeholder;
    });

    // Temporarily extract \[...\] display math with HTML escaping
    formatted = formatted.replace(/\\\[(.*?)\\\]/gs, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKD${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `\\[${escapeHtml(mathContent)}\\]` });
      return placeholder;
    });

    // Temporarily extract \(...\) inline math with HTML escaping
    formatted = formatted.replace(/\\\((.*?)\\\)/g, (match, mathContent) => {
      const placeholder = `%%MATHBLOCKI${placeholderIndex++}%%`;
      mathBlocks.push({ placeholder, content: `\\(${escapeHtml(mathContent)}\\)` });
      return placeholder;
    });

    // Escape raw text sections for safety
    formatted = formatted
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Markdown conversion rules
    formatted = formatted.replace(/\n/g, '<br />');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code style="font-family: monospace; background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 90%;">$1</code>');

    // Restore Image Blocks into styled centered cards
    imageBlocks.forEach(({ placeholder, alt, src }) => {
      const captionHtml = alt ? `<div style="font-size: 8pt; color: #64748b; margin-top: 6px; font-style: italic; text-align: center;">${alt}</div>` : '';
      const imgHtml = `<div style="margin: 8px auto; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;"><img src="${src}" alt="${alt}" style="max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.06);" />${captionHtml}</div>`;
      formatted = formatted.replace(placeholder, imgHtml);
    });

    // Restore safely escaped LaTeX formulas back inside placeholders
    mathBlocks.forEach(({ placeholder, content }) => {
      formatted = formatted.replace(placeholder, content);
    });

    return formatted;
  };

  useEffect(() => {
    let active = true;
    const renderMath = () => {
      if (!active) return;
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
    return () => {
      active = false;
    };
  }, [text]);

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
