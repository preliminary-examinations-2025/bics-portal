import React, { useState, useRef, useEffect } from 'react';

/**
 * CodeforcesEditor Component
 * Replicates the exact Codeforces code submission editor (img ref 1):
 * - "Source:" top label
 * - Left line-number gutter (#ececec background, #d4d4d4 border, right-aligned numbers)
 * - Synchronized line scrolling
 * - Active line indicator
 * - Tab and Shift+Tab indentation support without losing focus
 * - Clean horizontal and vertical scrollbars
 */
export default function CodeforcesEditor({
    label = "Source:",
    value = "",
    onChange = () => {},
    placeholder = "",
    height = "380px",
    readOnly = false,
    fontSize = "13px",
    lineHeight = "20px"
}) {
    const textareaRef = useRef(null);
    const gutterRef = useRef(null);
    const [activeLine, setActiveLine] = useState(0);

    const lines = (value || '').split('\n');
    const totalLines = Math.max(lines.length, 1);

    // Sync scroll between textarea and line number gutter
    const handleScroll = () => {
        if (textareaRef.current && gutterRef.current) {
            gutterRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    // Calculate active line from cursor position
    const updateActiveLine = (e) => {
        const el = e.target;
        if (!el) return;
        const cursorPos = el.selectionStart || 0;
        const textBeforeCursor = el.value.slice(0, cursorPos);
        const currentLineIdx = textBeforeCursor.split('\n').length - 1;
        setActiveLine(currentLineIdx);
    };

    // Handle Tab and Shift+Tab key presses inside editor
    const handleKeyDown = (e) => {
        if (readOnly) return;

        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = textareaRef.current;
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const val = textarea.value;

            if (e.shiftKey) {
                // Shift+Tab: Unindent 4 spaces
                const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                const linePrefix = val.slice(lineStart, lineStart + 4);
                if (linePrefix === '    ') {
                    const nextVal = val.slice(0, lineStart) + val.slice(lineStart + 4);
                    onChange(nextVal);
                    setTimeout(() => {
                        textarea.selectionStart = Math.max(lineStart, start - 4);
                        textarea.selectionEnd = Math.max(lineStart, end - 4);
                    }, 0);
                }
            } else {
                // Tab: Insert 4 spaces
                const nextVal = val.substring(0, start) + '    ' + val.substring(end);
                onChange(nextVal);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 4;
                }, 0);
            }
        }
    };

    return (
        <div style={{ width: '100%', marginBottom: '14px', fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
            {/* Top Label matching Codeforces "Source:" */}
            {label && (
                <div style={{
                    fontSize: '13px',
                    fontWeight: 'normal',
                    color: '#000000',
                    marginBottom: '4px',
                    userSelect: 'none'
                }}>
                    {label}
                </div>
            )}

            {/* Editor Box */}
            <div style={{
                display: 'flex',
                height: height,
                width: '100%',
                border: '1px solid #b9b9b9',
                borderRadius: '1px',
                background: '#ffffff',
                boxSizing: 'border-box',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Left Line Number Gutter */}
                <div
                    ref={gutterRef}
                    style={{
                        width: '42px',
                        minWidth: '42px',
                        background: '#ececec',
                        borderRight: '1px solid #d4d4d4',
                        padding: '4px 6px 4px 2px',
                        boxSizing: 'border-box',
                        overflowY: 'hidden',
                        userSelect: 'none',
                        textAlign: 'right',
                        fontFamily: 'Consolas, Monaco, "Courier New", Courier, monospace',
                        fontSize: fontSize,
                        lineHeight: lineHeight,
                        color: '#777777'
                    }}
                >
                    {Array.from({ length: totalLines }).map((_, idx) => {
                        const isLineActive = idx === activeLine;
                        return (
                            <div
                                key={idx}
                                style={{
                                    height: lineHeight,
                                    lineHeight: lineHeight,
                                    fontWeight: isLineActive ? 'bold' : 'normal',
                                    color: isLineActive ? '#333333' : '#888888',
                                    background: isLineActive ? '#e2e2e2' : 'transparent',
                                    borderRadius: isLineActive ? '1px' : '0'
                                }}
                            >
                                {idx + 1}
                            </div>
                        );
                    })}
                </div>

                {/* Main Code Area */}
                <div style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
                    <textarea
                        ref={textareaRef}
                        value={value}
                        readOnly={readOnly}
                        placeholder={placeholder}
                        spellCheck="false"
                        onScroll={handleScroll}
                        onKeyDown={handleKeyDown}
                        onClick={updateActiveLine}
                        onKeyUp={updateActiveLine}
                        onFocus={updateActiveLine}
                        onChange={(e) => {
                            onChange(e.target.value);
                            updateActiveLine(e);
                        }}
                        style={{
                            width: '100%',
                            height: '100%',
                            boxSizing: 'border-box',
                            border: 'none',
                            outline: 'none',
                            margin: 0,
                            padding: '4px 8px',
                            background: '#ffffff',
                            color: '#000000',
                            fontFamily: 'Consolas, Monaco, "Courier New", Courier, monospace',
                            fontSize: fontSize,
                            lineHeight: lineHeight,
                            whiteSpace: 'pre',
                            overflow: 'auto',
                            resize: 'none',
                            tabSize: 4
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
