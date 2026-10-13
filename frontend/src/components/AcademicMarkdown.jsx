import React, { useMemo } from 'react';

/**
 * Pure React Academic Markdown Renderer
 * Formats:
 * - Fenced code blocks: ```lang ... ``` with light, subtle syntax container in Consolas font
 * - Headings: ## H2, ### H3, #### H4
 * - Unordered & numbered bullet lists with indentation
 * - Bold text: **bold**
 * - Inline code: `code`
 * - Clean light academic typography
 */
export default function AcademicMarkdown({ content, style = {} }) {
  const renderedElements = useMemo(() => {
    if (!content || typeof content !== 'string') return null;

    const lines = content.split('\n');
    const elements = [];
    let currentList = [];

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            style={{
              paddingLeft: '22px',
              margin: '8px 0 12px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            {currentList.map((item, idx) => (
              <li
                key={idx}
                style={{
                  lineHeight: '1.6',
                  color: '#334155',
                  fontSize: '9.5pt',
                  marginLeft: item.indent ? `${item.indent * 16}px` : 0,
                  listStyleType: item.indent ? 'circle' : 'disc'
                }}
              >
                {formatInlineMarkdown(item.text)}
              </li>
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      // 1. Fenced Code Block: ```lang ... ``` (Strict Light Color Scheme & Consolas font)
      if (trimmed.startsWith('```')) {
        flushList();
        const lang = trimmed.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <div
            key={`code-${i}`}
            style={{
              margin: '12px 0 16px 0',
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid #b9c9fe',
              backgroundColor: '#f8fafd'
            }}
          >
            {lang && (
              <div
                style={{
                  backgroundColor: '#e8eff7',
                  color: '#3b5998',
                  fontSize: '7.5pt',
                  padding: '4px 12px',
                  textTransform: 'uppercase',
                  fontFamily: "Consolas, 'Courier New', Courier, monospace",
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #b9c9fe'
                }}
              >
                {lang}
              </div>
            )}
            <pre
              style={{
                margin: 0,
                padding: '12px 16px',
                backgroundColor: '#f8fafd',
                color: '#1e293b',
                fontSize: '9pt',
                fontFamily: "Consolas, 'Courier New', Courier, monospace",
                overflowX: 'auto',
                lineHeight: '1.55',
                whiteSpace: 'pre'
              }}
            >
              <code style={{ fontFamily: "Consolas, 'Courier New', Courier, monospace" }}>
                {codeLines.join('\n')}
              </code>
            </pre>
          </div>
        );
        continue;
      }

      // 2. Heading 4: #### Title
      if (trimmed.startsWith('#### ')) {
        flushList();
        const title = trimmed.replace(/^####\s+/, '');
        elements.push(
          <h5
            key={`h4-${i}`}
            style={{
              fontSize: '10pt',
              fontWeight: '700',
              color: '#3b5998',
              margin: '14px 0 6px 0',
              letterSpacing: '0.2px'
            }}
          >
            {formatInlineMarkdown(title)}
          </h5>
        );
        continue;
      }

      // 3. Heading 3: ### Title
      if (trimmed.startsWith('### ')) {
        flushList();
        const title = trimmed.replace(/^###\s+/, '');
        elements.push(
          <h4
            key={`h3-${i}`}
            style={{
              fontSize: '11pt',
              fontWeight: 'bold',
              color: '#3b5998',
              margin: '18px 0 8px 0',
              borderBottom: '1px solid #b9c9fe',
              paddingBottom: '4px'
            }}
          >
            {formatInlineMarkdown(title)}
          </h4>
        );
        continue;
      }

      // 4. Heading 2: ## Title
      if (trimmed.startsWith('## ')) {
        flushList();
        const title = trimmed.replace(/^##\s+/, '');
        elements.push(
          <h3
            key={`h2-${i}`}
            style={{
              fontSize: '12pt',
              fontWeight: 'bold',
              color: '#3b5998',
              margin: '20px 0 10px 0',
              borderBottom: '2px solid #b9c9fe',
              paddingBottom: '5px'
            }}
          >
            {formatInlineMarkdown(title)}
          </h3>
        );
        continue;
      }

      // 5. Bullet list items: - item, * item, or 1. item
      const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+\.)\s+(.*)/);
      if (bulletMatch) {
        const indentLevel = Math.floor(bulletMatch[1].length / 2);
        currentList.push({
          indent: indentLevel,
          text: bulletMatch[2]
        });
        continue;
      }

      // Centered math / formula block ($$ ... $$)
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
        flushList();
        const mathContent = trimmed.slice(2, -2).trim();
        elements.push(
          <div
            key={`math-${i}`}
            className="math-centered"
            style={{
              textAlign: 'center',
              margin: '10px 0',
              padding: '6px',
              fontFamily: 'KaTeX_Main, "Times New Roman", serif',
              fontSize: '10.5pt',
              color: '#1e293b'
            }}
          >
            {mathContent}
          </div>
        );
        continue;
      }

      // Otherwise regular paragraph text
      flushList();
      elements.push(
        <p
          key={`p-${i}`}
          style={{
            margin: '6px 0',
            lineHeight: '1.65',
            color: '#334155',
            fontSize: '9.5pt',
            textAlign: 'justify',
            textJustify: 'inter-word',
            textAlignLast: 'left'
          }}
        >
          {formatInlineMarkdown(trimmed)}
        </p>
      );
    }

    flushList();
    return elements;
  }, [content]);

  return (
    <div
      className="academic-markdown-container"
      style={{
        lineHeight: '1.65',
        color: '#334155',
        ...style
      }}
    >
      {renderedElements}
    </div>
  );
}

/**
 * Parses bold (**text**), inline code (`code`), and nested combinations with Consolas font
 */
function formatInlineMarkdown(text) {
  if (!text) return '';

  // Normalize patterns like `**code**` or **`code`**
  const normalized = text.replace(/`\*\*(.*?)\*\*`/g, '**`$1`**');

  // Split tokens by **`code`** or **bold** or `code`
  const regex = /(\*\*`.*?`\*\*|\*\*.*?\*\*|`.*?`)/g;
  const parts = normalized.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**`') && part.endsWith('`**')) {
      const inner = part.slice(3, -3);
      return (
        <strong key={index} style={{ color: '#0f172a', fontWeight: '700' }}>
          <code
            style={{
              backgroundColor: '#f1f5f9',
              color: '#1e293b',
              padding: '2px 5px',
              borderRadius: '3px',
              fontFamily: "Consolas, 'Courier New', Courier, monospace",
              fontSize: '8.5pt',
              border: '1px solid #cbd5e1',
              fontWeight: '700'
            }}
          >
            {inner}
          </code>
        </strong>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} style={{ color: '#0f172a', fontWeight: '700' }}>
          {inner}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={index}
          style={{
            backgroundColor: '#f1f5f9',
            color: '#1e293b',
            padding: '2px 5px',
            borderRadius: '3px',
            fontFamily: "Consolas, 'Courier New', Courier, monospace",
            fontSize: '8.5pt',
            border: '1px solid #cbd5e1'
          }}
        >
          {inner}
        </code>
      );
    }
    return part;
  });
}
