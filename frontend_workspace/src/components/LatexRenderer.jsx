import React from 'react';
import katex from 'katex';

/**
 * Parses a string containing LaTeX ($...$ and $$...$$) and renders with KaTeX.
 */
export default function LatexRenderer({ text, style }) {
    if (!text) return null;

    // Splits text into math and non-math segments
    // Matches $$...$$ (display math) or $...$ (inline math)
    const renderContent = () => {
        const parts = [];
        const regex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Push text before match
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: text.slice(lastIndex, match.index)
                });
            }

            const rawMath = match[0];
            const isDisplay = rawMath.startsWith('$$');
            const math = isDisplay 
                ? rawMath.slice(2, -2).trim() 
                : rawMath.slice(1, -1).trim();

            parts.push({
                type: 'math',
                content: math,
                displayMode: isDisplay
            });

            lastIndex = regex.lastIndex;
        }

        // Push remaining text
        if (lastIndex < text.length) {
            parts.push({
                type: 'text',
                content: text.slice(lastIndex)
            });
        }

        return parts.map((part, index) => {
            if (part.type === 'math') {
                try {
                    const html = katex.renderToString(part.content, {
                        displayMode: part.displayMode,
                        throwOnError: false
                    });
                    return (
                        <span 
                            key={index} 
                            dangerouslySetInnerHTML={{ __html: html }}
                            style={part.displayMode ? { display: 'block', margin: '8px 0', textAlign: 'center' } : {}}
                        />
                    );
                } catch (e) {
                    return <code key={index}>${part.content}$</code>;
                }
            } else {
                // Split lines to handle newlines
                const lines = part.content.split('\n');
                return lines.map((line, lIdx) => (
                    <React.Fragment key={`${index}-${lIdx}`}>
                        {line}
                        {lIdx < lines.length - 1 && <br />}
                    </React.Fragment>
                ));
            }
        });
    };

    return (
        <span style={style}>
            {renderContent()}
        </span>
    );
}
