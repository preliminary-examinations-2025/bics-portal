import React from 'react';
import Editor from '@monaco-editor/react';
import { Maximize2, Play, CheckSquare, Loader2, Check, X } from 'lucide-react';
import { RichText } from '../common/RichText';
import { DEFAULT_TEMPLATES } from '../../config/constants';

/**
 * CodeEditor: Renders the right workspace panel containing MCQ selection or Monaco editor
 * for C++ / Web development questions along with the testcase / diagnostic console.
 */
export const CodeEditor = ({
  test,
  selectedQuestionIndex,
  examAnswers,
  draftMCQ,
  setDraftMCQ,
  draftCode,
  setDraftCode,
  draftLanguage,
  draftQIdx,
  setDraftQIdx,
  handleLanguageChange,
  webActiveTab,
  setWebActiveTab,
  draftHtml,
  setDraftHtml,
  draftCss,
  setDraftCss,
  draftJs,
  setDraftJs,
  consoleTab,
  setConsoleTab,
  isRunningCode,
  handleRunCode,
  runResults,
  compileError,
  isOnline,
  handleSaveAndNext,
  triggerCustomConfirm,
  setIsFullWebStudioOpen,
  webConsoleLogs
}) => {
  const currentQuestion = test?.questions?.[selectedQuestionIndex];
  if (!currentQuestion) return null;

  return (
    <div className="cf-card" style={{
      flex: '0 0 calc(50% - 10px)',
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      maxHeight: '100%',
      overflow: 'hidden',
      padding: '15px'
    }}>
      <style>{`
        @keyframes cf-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .cf-spinner {
          animation: cf-spin 1s linear infinite;
        }
      `}</style>

      <div style={{ borderBottom: '2px solid #3b5998', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
          {currentQuestion.type === 'mcq' ? 'Select Option' : 'Workspace Editor'}
        </h4>
      </div>

      {currentQuestion.type === 'mcq' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px', overflowY: 'auto', minHeight: 0 }}>
          {currentQuestion.options?.map((opt, oIdx) => {
            const isSelected = draftMCQ === oIdx;
            return (
              <div
                key={oIdx}
                onClick={() => setDraftMCQ(oIdx)}
                style={{
                  padding: '15px',
                  borderRadius: '6px',
                  border: isSelected ? '2px solid #3b5998' : '1px solid #cbd5e1',
                  backgroundColor: isSelected ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.2s',
                  userSelect: 'none'
                }}
              >
                <input
                  type="radio"
                  name={`mcq_${selectedQuestionIndex}`}
                  checked={isSelected}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
                <RichText
                  text={opt}
                  style={{ fontSize: '9.5pt', fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#1e3a8a' : '#333' }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
          
          {/* Language Selection Tabs & Reset Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #cbd5e1', paddingBottom: '0', marginBottom: '10px', height: '40px' }}>
            {currentQuestion.type === 'coding' ? (
              <div style={{ display: 'flex', gap: '5px' }}>
                {[
                  { id: 'c', label: 'C' },
                  { id: 'cpp', label: 'C++' },
                  { id: 'python', label: 'Python' },
                  { id: 'java', label: 'Java' }
                ].map(lang => {
                  const isActive = draftLanguage === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => handleLanguageChange(lang.id)}
                      style={{
                        padding: '6px 16px',
                        fontSize: '9pt',
                        fontWeight: 'bold',
                        borderRadius: '4px 4px 0 0',
                        border: '1px solid #cbd5e1',
                        borderBottom: isActive ? '1px solid #ffffff' : '1px solid #cbd5e1',
                        backgroundColor: isActive ? '#ffffff' : '#f8fafc',
                        color: isActive ? '#002147' : '#64748b',
                        cursor: 'pointer',
                        marginBottom: '-1px',
                        zIndex: isActive ? 2 : 1,
                        transition: 'all 0.15s ease-in-out'
                      }}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '5px' }}>
                {[
                  { id: 'html', label: 'index.html' },
                  { id: 'css', label: 'style.css' },
                  { id: 'js', label: 'script.js' }
                ].map(tab => {
                  const isActive = webActiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWebActiveTab(tab.id)}
                      style={{
                        padding: '6px 16px',
                        fontSize: '9pt',
                        fontWeight: 'bold',
                        borderRadius: '4px 4px 0 0',
                        border: '1px solid #cbd5e1',
                        borderBottom: isActive ? '1px solid #ffffff' : '1px solid #cbd5e1',
                        backgroundColor: isActive ? '#ffffff' : '#f8fafc',
                        color: isActive ? '#002147' : '#64748b',
                        cursor: 'pointer',
                        marginBottom: '-1px',
                        zIndex: isActive ? 2 : 1,
                        transition: 'all 0.15s ease-in-out'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ paddingBottom: '4px', display: 'flex', gap: '8px' }}>
              {currentQuestion.type === 'web' && (
                <button
                  type="button"
                  style={{
                    padding: '5px 14px',
                    fontSize: '8.5pt',
                    border: '1px solid #0284c7',
                    borderRadius: '4px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 'bold',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                  onClick={() => setIsFullWebStudioOpen(true)}
                >
                  <Maximize2 size={13} style={{ color: '#ffffff' }} />
                  <span>Open Full Web Studio</span>
                </button>
              )}
              <button
                className="cf-btn-secondary"
                style={{ padding: '4px 10px', fontSize: '8pt', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#ffffff', cursor: 'pointer' }}
                onClick={() => {
                  triggerCustomConfirm(
                    "Reset Code Template?",
                    "Are you sure you want to reset the editor content? This will overwrite your current progress for this question.",
                    () => {
                      if (currentQuestion.type === 'coding') {
                        setDraftCode(currentQuestion.initialTemplate || DEFAULT_TEMPLATES[draftLanguage]);
                      } else {
                        if (webActiveTab === 'html') setDraftHtml(currentQuestion.initialHtml || '');
                        if (webActiveTab === 'css') setDraftCss(currentQuestion.initialCss || '');
                        if (webActiveTab === 'js') setDraftJs(currentQuestion.initialJs || '');
                      }
                    }
                  );
                }}
              >
                Reset Template
              </button>
            </div>
          </div>

          {/* Monaco Editor Workspace */}
          <div style={{ flex: 1, minHeight: '150px', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            {currentQuestion.type === 'coding' ? (
              <Editor
                height="100%"
                language={draftLanguage}
                theme="vs-light"
                value={draftQIdx === selectedQuestionIndex ? draftCode : (examAnswers[selectedQuestionIndex]?.submittedCode ?? (currentQuestion.initialTemplate || DEFAULT_TEMPLATES[draftLanguage]))}
                onChange={(value) => {
                  setDraftQIdx(selectedQuestionIndex);
                  setDraftCode(value || '');
                }}
                loading={<div style={{ padding: '20px', fontSize: '9pt', color: '#64748b', fontFamily: 'monospace' }}>Loading Monaco IDE Engine...</div>}
                options={{
                  fontSize: 13,
                  fontFamily: 'Consolas, Courier New, monospace',
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  automaticLayout: true,
                  tabSize: 4,
                  cursorBlinking: 'blink',
                  padding: { top: 10, bottom: 10 },
                  scrollbar: { vertical: 'auto', horizontal: 'auto' }
                }}
              />
            ) : (
              <Editor
                height="100%"
                language={webActiveTab === 'js' ? 'javascript' : webActiveTab}
                theme="vs-light"
                value={(() => {
                  const isCurrent = (draftQIdx === selectedQuestionIndex);
                  const activeAns = examAnswers[selectedQuestionIndex];
                  if (webActiveTab === 'html') return isCurrent ? draftHtml : (activeAns?.submittedHtml ?? (currentQuestion.initialHtml || currentQuestion.initialCode?.html || ''));
                  if (webActiveTab === 'css') return isCurrent ? draftCss : (activeAns?.submittedCss ?? (currentQuestion.initialCss || currentQuestion.initialCode?.css || ''));
                  return isCurrent ? draftJs : (activeAns?.submittedJs ?? (currentQuestion.initialJs || currentQuestion.initialCode?.js || ''));
                })()}
                onChange={(value) => {
                  setDraftQIdx(selectedQuestionIndex);
                  if (webActiveTab === 'html') setDraftHtml(value || '');
                  if (webActiveTab === 'css') setDraftCss(value || '');
                  if (webActiveTab === 'js') setDraftJs(value || '');
                }}
                loading={<div style={{ padding: '20px', fontSize: '9pt', color: '#64748b', fontFamily: 'monospace' }}>Loading Monaco Web Editor...</div>}
                options={{
                  fontSize: 13,
                  fontFamily: 'Consolas, Courier New, monospace',
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  automaticLayout: true,
                  tabSize: 4,
                  cursorBlinking: 'blink',
                  padding: { top: 10, bottom: 10 },
                  scrollbar: { vertical: 'auto', horizontal: 'auto' }
                }}
              />
            )}
          </div>

          {/* Console Panel */}
          <div style={{
            marginTop: '12px',
            borderTop: '1px solid #cbd5e1',
            paddingTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            flex: currentQuestion.type === 'web' ? '1.2 1 0%' : '1 1 0%',
            minHeight: '180px',
            overflow: 'hidden'
          }}>
            {/* Console Tabs */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', borderBottom: '1px solid #cbd5e1' }}>
              {currentQuestion.type === 'coding' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('testcase')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      borderRadius: '4px 4px 0 0',
                      border: '1px solid #cbd5e1',
                      borderBottom: consoleTab === 'testcase' ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                      backgroundColor: consoleTab === 'testcase' ? '#f8fafc' : '#ffffff',
                      color: consoleTab === 'testcase' ? '#002147' : '#64748b',
                      cursor: 'pointer',
                      marginBottom: '-1px',
                      zIndex: consoleTab === 'testcase' ? 2 : 1
                    }}
                  >
                    Testcase
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('result')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      borderRadius: '4px 4px 0 0',
                      border: '1px solid #cbd5e1',
                      borderBottom: consoleTab === 'result' ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                      backgroundColor: consoleTab === 'result' ? '#f8fafc' : '#ffffff',
                      color: consoleTab === 'result' ? '#002147' : '#64748b',
                      cursor: 'pointer',
                      marginBottom: '-1px',
                      zIndex: consoleTab === 'result' ? 2 : 1
                    }}
                  >
                    &gt;_ Test Result
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('testcase')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      borderRadius: '4px 4px 0 0',
                      border: '1px solid #cbd5e1',
                      borderBottom: (consoleTab === 'testcase' || consoleTab === 'preview') ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                      backgroundColor: (consoleTab === 'testcase' || consoleTab === 'preview') ? '#f8fafc' : '#ffffff',
                      color: (consoleTab === 'testcase' || consoleTab === 'preview') ? '#002147' : '#64748b',
                      cursor: 'pointer',
                      marginBottom: '-1px',
                      zIndex: 2
                    }}
                  >
                    Live Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('result')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      borderRadius: '4px 4px 0 0',
                      border: '1px solid #cbd5e1',
                      borderBottom: consoleTab === 'result' ? '1px solid #f8fafc' : '1px solid #cbd5e1',
                      backgroundColor: consoleTab === 'result' ? '#f8fafc' : '#ffffff',
                      color: consoleTab === 'result' ? '#002147' : '#64748b',
                      cursor: 'pointer',
                      marginBottom: '-1px',
                      zIndex: 2
                    }}
                  >
                    &gt;_ Console Logs
                  </button>
                </>
              )}
            </div>

            {/* Console Body Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}>
              {currentQuestion.type === 'coding' ? (
                consoleTab === 'testcase' ? (
                  <div>
                    {(() => {
                      const sampleCases = (currentQuestion.testCases || []).filter(tc => tc.isSample);
                      if (sampleCases.length === 0) {
                        return <div style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic' }}>No sample test cases configured for this question.</div>;
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {sampleCases.map((tc, tcIdx) => (
                            <div key={tcIdx} style={{ fontSize: '8.5pt', borderBottom: '1px dashed #cbd5e1', paddingBottom: '6px' }}>
                              <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '2px' }}>Test Case {tcIdx + 1}:</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                  <span style={{ color: '#64748b' }}>Input: </span>
                                  <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace' }}>{tc.input || '(empty)'}</code>
                                </div>
                                <div>
                                  <span style={{ color: '#64748b' }}>Expected: </span>
                                  <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace' }}>{tc.output || '(empty)'}</code>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    {isRunningCode ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px', gap: '8px' }}>
                        <Loader2 className="cf-spinner" size={24} style={{ color: '#3b5998' }} />
                        <span style={{ fontSize: '9pt', color: '#475569', fontFamily: 'monospace' }}>Compiling &amp; Running Code...</span>
                      </div>
                    ) : (!runResults && !compileError) ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', fontSize: '9.5pt', color: '#94a3b8', fontStyle: 'italic' }}>
                        You must run your C++ code first
                      </div>
                    ) : (
                      <div>
                        {compileError && (
                          <div style={{
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fee2e2',
                            borderRadius: '4px',
                            padding: '10px',
                            color: '#991b1b',
                            fontFamily: 'monospace',
                            fontSize: '8.5pt',
                            whiteSpace: 'pre-wrap'
                          }}>
                            <strong>Compilation Error:</strong>
                            <div style={{ marginTop: '5px' }}>{compileError}</div>
                          </div>
                        )}

                        {runResults && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {runResults.map((res, rIdx) => {
                              const isPassed = res.status === 'Accepted';
                              const tcObj = currentQuestion.testCases?.[rIdx];
                              const tcId = res.testcaseId || res.testCaseId || res.id || res._id || tcObj?.testcaseId || tcObj?.id || tcObj?._id || (20260101 + rIdx);
                              const isSample = tcObj?.isSample;
                              return (
                                <div key={rIdx} style={{
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  backgroundColor: '#ffffff',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '5px 10px',
                                    borderBottom: isSample ? '1px solid #cbd5e1' : 'none',
                                    backgroundColor: isPassed ? '#f0fdf4' : '#fef2f2'
                                  }}>
                                    <span style={{
                                      fontSize: '8.5pt',
                                      fontWeight: 'bold',
                                      color: isPassed ? '#15803d' : '#b91c1c',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}>
                                      {isPassed ? (
                                        <Check size={14} style={{ color: '#15803d' }} />
                                      ) : (
                                        <X size={14} style={{ color: '#b91c1c' }} />
                                      )}
                                      <span>{isPassed ? 'Passed' : (res.status || 'Wrong Answer')} - Testcase #{tcId} ({isSample ? 'Sample' : 'Hidden'})</span>
                                    </span>
                                  </div>
                                  {isSample && (
                                    <div style={{ padding: '6px 10px', fontSize: '8pt', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div>
                                        <strong>Input:</strong> <code style={{ fontFamily: 'monospace' }}>{res.input || '(empty)'}</code>
                                      </div>
                                      <div>
                                        <strong>Expected:</strong> <code style={{ color: '#15803d', fontFamily: 'monospace' }}>{res.expectedOutput || '(empty)'}</code>
                                      </div>
                                      <div>
                                        <strong>Your Output:</strong> <code style={{ color: isPassed ? '#15803d' : '#b91c1c', fontFamily: 'monospace' }}>{res.actualOutput || '(empty)'}</code>
                                      </div>
                                      {res.stderr && (
                                        <div style={{ color: '#b91c1c', marginTop: '2px' }}>
                                          <strong>Error:</strong> <pre style={{ display: 'inline', fontFamily: 'monospace', margin: 0 }}>{res.stderr}</pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* HTML/CSS/JS Web Console contents */
                (consoleTab === 'testcase' || consoleTab === 'preview') ? (() => {
                  const activeAnsForWeb = examAnswers?.[selectedQuestionIndex];
                  const isCurrent = (draftQIdx === selectedQuestionIndex);
                  const livePreviewHtml = isCurrent ? draftHtml : (activeAnsForWeb?.submittedHtml ?? (currentQuestion.initialHtml || currentQuestion.initialCode?.html || ''));
                  const livePreviewCss = isCurrent ? draftCss : (activeAnsForWeb?.submittedCss ?? (currentQuestion.initialCss || currentQuestion.initialCode?.css || ''));
                  const livePreviewJs = isCurrent ? draftJs : (activeAnsForWeb?.submittedJs ?? (currentQuestion.initialJs || currentQuestion.initialCode?.js || ''));

                  return (
                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', flex: 1, minHeight: 0, backgroundColor: '#ffffff' }}>
                      <iframe
                        key={`web_preview_q_${selectedQuestionIndex}`}
                        id="web-sandbox-preview"
                        title="Web Sandbox Preview"
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <meta charset="utf-8">
                              <base href="https://invalid-sandbox-origin.invalid/">
                              <style>
                                html, body {
                                  margin: 0;
                                  padding: 10px;
                                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                  word-wrap: break-word;
                                  word-break: break-word;
                                  overflow-x: hidden;
                                  box-sizing: border-box;
                                }
                                *, *:before, *:after {
                                  box-sizing: inherit;
                                }
                                img, video, iframe, canvas {
                                  max-width: 100%;
                                  height: auto;
                                  display: block;
                                }
                                pre, code {
                                  white-space: pre-wrap;
                                  word-break: break-all;
                                }
                              </style>
                              <style>${livePreviewCss}</style>
                              <script>
                                window.onerror = function(message, source, lineno, colno, error) {
                                  window.parent.postMessage({
                                    type: 'IFRAME_CONSOLE_LOG',
                                    level: 'error',
                                    text: message + (lineno ? ' (line ' + lineno + ')' : '')
                                  }, '*');
                                  return true;
                                };
                                const _log = console.log;
                                const _error = console.error;
                                console.log = function(...args) {
                                  _log.apply(console, args);
                                  window.parent.postMessage({
                                    type: 'IFRAME_CONSOLE_LOG',
                                    level: 'log',
                                    text: args.join(' ')
                                  }, '*');
                                };
                                console.error = function(...args) {
                                  _error.apply(console, args);
                                  window.parent.postMessage({
                                    type: 'IFRAME_CONSOLE_LOG',
                                    level: 'error',
                                    text: args.join(' ')
                                  }, '*');
                                };
                                document.addEventListener('DOMContentLoaded', function() {
                                  try {
                                    ${livePreviewJs || ''}
                                  } catch(err) {
                                    console.error(err.message || String(err));
                                  }
                                });
                              </script>
                            </head>
                            <body>
                              ${livePreviewHtml || ''}
                            </body>
                          </html>
                        `}
                        sandbox="allow-scripts"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      />
                    </div>
                  );
                })() : (
                  <div style={{
                    backgroundColor: '#1e1e1e',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '8.5pt',
                    padding: '10px',
                    borderRadius: '4px',
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    {webConsoleLogs.length === 0 ? (
                      <span style={{ color: '#64748b', fontStyle: 'italic' }}>Console is clean. No logs captured.</span>
                    ) : (
                      webConsoleLogs.map((log, lIdx) => (
                        <div key={lIdx} style={{ display: 'flex', gap: '6px' }}>
                          <span style={{ color: log.level === 'error' ? '#f87171' : '#64748b', fontWeight: 'bold' }}>
                            {log.level === 'error' ? '[error]' : '[log]'}
                          </span>
                          <span style={{ color: log.level === 'error' ? '#fca5a5' : '#e2e8f0' }}>{log.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save & Next bottom bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '15px', marginTop: 'auto', height: '50px' }}>
        {currentQuestion.type === 'coding' ? (
          <button
            type="button"
            className="cf-btn-secondary"
            style={{
              padding: '8px 16px',
              fontSize: '9pt',
              fontWeight: 'bold',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              cursor: (isRunningCode || !isOnline) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              margin: 0,
              opacity: !isOnline ? 0.6 : 1
            }}
            onClick={handleRunCode}
            disabled={isRunningCode || !isOnline}
          >
            {isRunningCode ? <Loader2 className="cf-spinner" size={14} /> : <Play size={14} />}
            {!isOnline ? 'Compiler Offline' : (isRunningCode ? 'Running...' : 'Run Code')}
          </button>
        ) : (
          <div></div>
        )}
        <button
          type="button"
          className="cf-btn-primary"
          style={{ background: '#10b981', borderColor: '#10b981', color: '#ffffff', padding: '8px 16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer', margin: 0 }}
          onClick={handleSaveAndNext}
        >
          <CheckSquare size={14} />
          <span>Save &amp; {selectedQuestionIndex === test.questions.length - 1 ? 'Finish Question' : 'Next Question'}</span>
        </button>
      </div>
    </div>
  );
};
