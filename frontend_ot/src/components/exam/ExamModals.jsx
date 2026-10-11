import React from 'react';
import Editor from '@monaco-editor/react';
import { Code, Layers, FileCode, Laptop, Tablet, Smartphone, Terminal, X, HelpCircle, CheckSquare, Award, Info, Loader2 } from 'lucide-react';

/**
 * ExamModals: Encompasses the Full Web Studio Modal, Question Info Guidelines Modal,
 * and Examination Submitting Screen Loader Overlay.
 */
export const ExamModals = ({
  isFullWebStudioOpen,
  setIsFullWebStudioOpen,
  test,
  selectedQuestionIndex,
  webActiveTab,
  setWebActiveTab,
  webStudioViewportMode,
  setWebStudioViewportMode,
  webStudioConsoleOpen,
  setWebStudioConsoleOpen,
  webConsoleLogs,
  setWebConsoleLogs,
  examAnswers,
  setExamAnswers,
  draftQIdx,
  setDraftQIdx,
  draftHtml,
  setDraftHtml,
  draftCss,
  setDraftCss,
  draftJs,
  setDraftJs,
  showQuestionInfoModal,
  setShowQuestionInfoModal,
  submittingExam
}) => {
  const currentQuestion = test?.questions?.[selectedQuestionIndex];

  return (
    <>
      {/* FULL WEB STUDIO MODAL OVERLAY */}
      {isFullWebStudioOpen && currentQuestion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#f0f9ff',
          zIndex: 150000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          {/* Studio Header Bar */}
          <div style={{
            height: '48px',
            backgroundColor: '#e0f2fe',
            borderBottom: '1px solid #bae6fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            color: '#002147',
            flexShrink: 0
          }}>
            {/* Left Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7', fontWeight: 'bold', fontSize: '10pt' }}>
                <Code size={18} />
                <span>Full Web Studio</span>
              </div>
              <span style={{ color: '#94a3b8' }}>|</span>
              <span style={{ fontSize: '9pt', color: '#334155', fontWeight: 600, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Q{selectedQuestionIndex + 1}: {currentQuestion.title || 'Web Development Question'}
              </span>
            </div>

            {/* Center: File Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: '#f0f9ff', padding: '3px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
              {[
                { id: 'html', label: 'index.html', icon: FileCode },
                { id: 'css', label: 'style.css', icon: Layers },
                { id: 'js', label: 'script.js', icon: Code }
              ].map(tab => {
                const isActive = webActiveTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setWebActiveTab(tab.id)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '8.5pt',
                      fontWeight: 'bold',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: isActive ? '#0284c7' : 'transparent',
                      color: isActive ? '#ffffff' : '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Icon size={13} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#f0f9ff', padding: '3px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                {[
                  { mode: 'desktop', title: 'Desktop View (100%)', icon: Laptop },
                  { mode: 'tablet', title: 'Tablet View (768px)', icon: Tablet },
                  { mode: 'mobile', title: 'Mobile View (375px)', icon: Smartphone }
                ].map(v => {
                  const isActive = webStudioViewportMode === v.mode;
                  const VIcon = v.icon;
                  return (
                    <button
                      key={v.mode}
                      type="button"
                      title={v.title}
                      onClick={() => setWebStudioViewportMode(v.mode)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: isActive ? '#bae6fd' : 'transparent',
                        color: isActive ? '#0284c7' : '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <VIcon size={14} />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setWebStudioConsoleOpen(!webStudioConsoleOpen)}
                style={{
                  padding: '4px 10px',
                  fontSize: '8.5pt',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  border: '1px solid #93c5fd',
                  backgroundColor: webStudioConsoleOpen ? '#dbeafe' : '#ffffff',
                  color: '#1e40af',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Terminal size={14} />
                <span>Console</span>
                {webConsoleLogs.length > 0 && (
                  <span style={{ backgroundColor: '#0284c7', color: '#fff', fontSize: '7.5pt', padding: '1px 5px', borderRadius: '10px' }}>
                    {webConsoleLogs.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsFullWebStudioOpen(false)}
                style={{
                  padding: '4px 10px',
                  fontSize: '8.5pt',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  border: '1px solid #dc2626',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <X size={14} />
                <span>Close Studio</span>
              </button>
            </div>
          </div>

          {/* Studio Split Body */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {/* Left Pane: Code Editor */}
            <div style={{ flex: '1 1 50%', width: '50%', borderRight: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
              <div style={{ height: '30px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '8pt', color: '#475569', fontWeight: 'bold' }}>
                <span>CODE EDITOR ({webActiveTab === 'html' ? 'index.html' : webActiveTab === 'css' ? 'style.css' : 'script.js'})</span>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <Editor
                  height="100%"
                  language={webActiveTab === 'html' ? 'html' : webActiveTab === 'css' ? 'css' : 'javascript'}
                  theme="vs-light"
                  value={(() => {
                    const isCurrent = (draftQIdx === selectedQuestionIndex);
                    const activeAns = examAnswers[selectedQuestionIndex];
                    if (webActiveTab === 'html') return isCurrent ? draftHtml : (activeAns?.submittedHtml ?? (currentQuestion.initialHtml || currentQuestion.initialCode?.html || ''));
                    if (webActiveTab === 'css') return isCurrent ? draftCss : (activeAns?.submittedCss ?? (currentQuestion.initialCss || currentQuestion.initialCode?.css || ''));
                    return isCurrent ? draftJs : (activeAns?.submittedJs ?? (currentQuestion.initialJs || currentQuestion.initialCode?.js || ''));
                  })()}
                  onChange={(val) => {
                    setDraftQIdx(selectedQuestionIndex);
                    const value = val || '';
                    let newHtml = draftHtml;
                    let newCss = draftCss;
                    let newJs = draftJs;
                    if (webActiveTab === 'html') {
                      newHtml = value;
                      setDraftHtml(value);
                    } else if (webActiveTab === 'css') {
                      newCss = value;
                      setDraftCss(value);
                    } else {
                      newJs = value;
                      setDraftJs(value);
                    }
                    setExamAnswers(prev => {
                      const updated = Array.isArray(prev) ? [...prev] : [];
                      if (updated[selectedQuestionIndex]) {
                        updated[selectedQuestionIndex] = {
                          ...updated[selectedQuestionIndex],
                          submittedHtml: newHtml,
                          submittedCss: newCss,
                          submittedJs: newJs
                        };
                      }
                      return updated;
                    });
                  }}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    lineNumbers: 'on',
                    wordWrap: 'on'
                  }}
                />
              </div>
            </div>

            {/* Right Pane: Live Render Sandbox */}
            <div style={{ flex: '1 1 50%', width: '50%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
              <div style={{ height: '30px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: '8pt', color: '#475569', fontWeight: 'bold' }}>
                <span>LIVE PREVIEW ({webStudioViewportMode.toUpperCase()} VIEW)</span>
                <span style={{ fontSize: '7.5pt', color: '#64748b' }}>
                  {webStudioViewportMode === 'desktop' ? '100% Width' : webStudioViewportMode === 'tablet' ? '768px Width' : '375px Width'}
                </span>
              </div>

              <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: webStudioViewportMode === 'desktop' ? '0' : '20px', backgroundColor: '#e2e8f0' }}>
                <div style={{
                  width: webStudioViewportMode === 'desktop' ? '100%' : webStudioViewportMode === 'tablet' ? '768px' : '375px',
                  height: '100%',
                  backgroundColor: '#ffffff',
                  borderRadius: webStudioViewportMode === 'desktop' ? '0' : '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  border: '1px solid #cbd5e1'
                }}>
                  {(() => {
                    const activeAnsForWeb = examAnswers?.[selectedQuestionIndex];
                    const isCurrent = (draftQIdx === selectedQuestionIndex);
                    const livePreviewHtml = isCurrent ? draftHtml : (activeAnsForWeb?.submittedHtml ?? (currentQuestion.initialHtml || currentQuestion.initialCode?.html || ''));
                    const livePreviewCss = isCurrent ? draftCss : (activeAnsForWeb?.submittedCss ?? (currentQuestion.initialCss || currentQuestion.initialCode?.css || ''));
                    const livePreviewJs = isCurrent ? draftJs : (activeAnsForWeb?.submittedJs ?? (currentQuestion.initialJs || currentQuestion.initialCode?.js || ''));

                    return (
                      <iframe
                        title="Full Web Studio Sandbox"
                        srcDoc={`<!DOCTYPE html>
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
        box-sizing: border-box;
      }
      ${livePreviewCss || ''}
    </style>
    <script>
      (function() {
        var _log = console.log;
        var _err = console.error;
        console.log = function() {
          _log.apply(console, arguments);
          var text = Array.from(arguments).join(' ');
          window.parent.postMessage({ type: 'WEB_CONSOLE_LOG', level: 'log', text: text }, '*');
          window.parent.postMessage({ type: 'IFRAME_CONSOLE_LOG', level: 'log', text: text }, '*');
        };
        console.error = function() {
          _err.apply(console, arguments);
          var text = Array.from(arguments).join(' ');
          window.parent.postMessage({ type: 'WEB_CONSOLE_LOG', level: 'error', text: text }, '*');
          window.parent.postMessage({ type: 'IFRAME_CONSOLE_LOG', level: 'error', text: text }, '*');
        };
        window.onerror = function(msg, url, line) {
          var errText = msg + (line ? ' (line ' + line + ')' : '');
          window.parent.postMessage({ type: 'WEB_CONSOLE_LOG', level: 'error', text: errText }, '*');
          window.parent.postMessage({ type: 'IFRAME_CONSOLE_LOG', level: 'error', text: errText }, '*');
        };
        document.addEventListener('DOMContentLoaded', function() {
          try {
            ${livePreviewJs || ''}
          } catch(err) {
            console.error(err.message || String(err));
          }
        });
      })();
    </script>
  </head>
  <body>
    ${livePreviewHtml || ''}
  </body>
</html>`}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-scripts"
                      />
                    );
                  })()}
                </div>
              </div>

              {/* Console Drawer inside Studio */}
              {webStudioConsoleOpen && (
                <div style={{
                  height: '160px',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  fontSize: '8.5pt',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ padding: '6px 12px', backgroundColor: '#f1f5f9', color: '#334155', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold' }}>JS DIAGNOSTIC CONSOLE</span>
                    <button
                      type="button"
                      onClick={() => setWebConsoleLogs([])}
                      style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '7.5pt', fontWeight: 'bold' }}
                    >
                      Clear Console
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {webConsoleLogs.length === 0 ? (
                      <span style={{ color: '#64748b', fontStyle: 'italic' }}>Console clean. No output or exceptions logged.</span>
                    ) : (
                      webConsoleLogs.map((log, lIdx) => (
                        <div key={lIdx} style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ color: log.level === 'error' ? '#ef4444' : '#0284c7', fontWeight: 'bold' }}>
                            {log.level === 'error' ? '[error]' : '[log]'}
                          </span>
                          <span style={{ color: log.level === 'error' ? '#991b1b' : '#334155' }}>{log.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QUESTION INFO & EVALUATION GUIDELINES MODAL */}
      {showQuestionInfoModal && currentQuestion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 150000,
          padding: '16px'
        }}
        onClick={() => setShowQuestionInfoModal(false)}
        >
          <div 
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '580px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
              border: '1px solid #cbd5e1',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              backgroundColor: '#f0f9ff',
              color: '#0369a1',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #bae6fd'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={18} style={{ color: '#0284c7' }} />
                <span style={{ fontSize: '10.5pt', fontWeight: 'bold', letterSpacing: '0.3px', color: '#0369a1' }}>
                  Question Guidelines &amp; Evaluation Info
                </span>
              </div>
              <button
                onClick={() => setShowQuestionInfoModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                  transition: 'color 0.15s'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <span style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '4px', backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                  {currentQuestion.type === 'mcq' ? 'Multiple Choice Question (MCQ)' : (currentQuestion.type === 'coding' ? 'C++ Algorithmic Problem' : 'HTML / CSS / JS Web Application')}
                </span>
                <span style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 'bold' }}>
                  Q{selectedQuestionIndex + 1} of {test.questions.length} ({currentQuestion.points || 0} Marks)
                </span>
              </div>

              {/* MCQ Section */}
              {currentQuestion.type === 'mcq' && (
                <>
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckSquare size={15} style={{ color: '#0284c7' }} />
                      <span>How to Answer</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
                      <li>Read the question prompt carefully in the left pane.</li>
                      <li>Select your chosen response option (A, B, C, or D) from the choices listed in the right workspace panel.</li>
                      <li>Click <strong>Save &amp; Next</strong> to lock in your answer and proceed to the next question.</li>
                    </ul>
                  </div>

                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Award size={15} style={{ color: '#16a34a' }} />
                      <span>Evaluation &amp; Scoring Criteria</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
                      <li><strong>Full Credit</strong>: Awarded automatically if your selected option matches the correct answer key.</li>
                      <li><strong>No Negative Marking</strong>: Unanswered or incorrect responses receive 0 marks without penalty.</li>
                      <li>You may modify your selected option anytime before finalizing and submitting your exam.</li>
                    </ul>
                  </div>

                  <div style={{ border: '1px solid #bae6fd', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f0f9ff' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0369a1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={15} style={{ color: '#0284c7' }} />
                      <span>Question Status Indicator</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '8.5pt', color: '#1e3a8a', lineHeight: '1.5' }}>
                      A question turns GREEN in the bottom navigation bar only when you click "Save &amp; Next" with a valid option selected.
                    </p>
                  </div>
                </>
              )}

              {/* C++ Coding Section */}
              {currentQuestion.type === 'coding' && (
                <>
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Code size={15} style={{ color: '#0284c7' }} />
                      <span>How to Write &amp; Execute C++ Code</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
                      <li>Write standard C++ code inside the Monaco IDE editor in the right workspace.</li>
                      <li>Read input using <code>std::cin</code> / <code>scanf</code> and output results using <code>std::cout</code> / <code>printf</code>.</li>
                      <li><strong>Do NOT print extra text</strong> like <code>"Enter value: "</code> as this will cause exact output test cases to fail.</li>
                      <li>Click <strong>Run Code</strong> to compile with GCC and test your logic against sample inputs.</li>
                    </ul>
                  </div>

                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Award size={15} style={{ color: '#16a34a' }} />
                      <span>Evaluation &amp; Test Case Scoring</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
                      <li><strong>Automated Grading</strong>: Submissions are executed against hidden benchmark test cases upon exam submission.</li>
                      <li><strong>Partial Scoring</strong>: Marks are awarded proportionally based on the number of hidden test cases passed.</li>
                      <li>Sample test cases allow live testing but do not contribute to final marks.</li>
                    </ul>
                  </div>

                  <div style={{ border: '1px solid #bae6fd', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f0f9ff' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0369a1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Terminal size={15} style={{ color: '#0284c7' }} />
                      <span>Execution Limits &amp; Best Practices</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '8.5pt', color: '#1e3a8a', lineHeight: '1.5' }}>
                      Watch out for Time Limit Exceeded (TLE &gt; 2.0s), Segmentation Faults, and Memory Limits. Click "Save &amp; Next" to save your C++ solution.
                    </p>
                  </div>
                </>
              )}

              {/* Web Coding Section */}
              {currentQuestion.type === 'web' && (
                <>
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileCode size={15} style={{ color: '#0284c7' }} />
                      <span>How to Develop &amp; Inspect Web Code</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
                      <li>Use the tab bar (<strong>HTML</strong>, <strong>CSS</strong>, <strong>JS</strong>) above the editor to switch file buffers.</li>
                      <li>View live output rendered automatically in the <strong>Live Preview</strong> window at the bottom left.</li>
                      <li>Click <strong>Full Editor</strong> to open the full-screen split studio with Desktop, Tablet, and Mobile viewports.</li>
                      <li>Use the <strong>Console Logs</strong> tab to view JavaScript <code>console.log()</code> messages and runtime errors.</li>
                    </ul>
                  </div>

                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Award size={15} style={{ color: '#16a34a' }} />
                      <span>Evaluation &amp; Grading Rules</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
                      <li><strong>DOM &amp; HTML Structure</strong>: Checked for required semantic elements, IDs, classes, and hierarchy.</li>
                      <li><strong>CSS Styling</strong>: Evaluated for visual layout compliance, responsiveness, colors, and positioning.</li>
                      <li><strong>JavaScript Logic</strong>: Graded on dynamic interactivity, event handling, and functional requirements.</li>
                    </ul>
                  </div>

                  <div style={{ border: '1px solid #bae6fd', borderRadius: '6px', padding: '12px 14px', backgroundColor: '#f0f9ff' }}>
                    <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0369a1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={15} style={{ color: '#0284c7' }} />
                      <span>Auto-Saving &amp; Submitting</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '8.5pt', color: '#1e3a8a', lineHeight: '1.5' }}>
                      Draft changes are saved locally as you type. Always click "Save &amp; Next" to record your completed web project in the exam system.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 18px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={() => setShowQuestionInfoModal(false)}
                style={{
                  padding: '7px 20px',
                  fontSize: '9pt',
                  fontWeight: 'bold',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                }}
              >
                Got it, Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMITTING OVERLAY LOADER */}
      {submittingExam && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 200000,
          color: '#ffffff',
          flexDirection: 'column',
          gap: '15px'
        }}>
          <Loader2 className="cf-spinner" size={48} style={{ color: '#38bdf8' }} />
          <h3 style={{ fontSize: '14pt', fontWeight: 'bold', margin: 0 }}>Submitting Examination...</h3>
          <p style={{ fontSize: '10pt', color: '#94a3b8', margin: 0, maxWidth: '320px', textAlign: 'center', lineHeight: '1.5' }}>
            We are compiling and executing your coding solutions against all automated grading test cases. Please do not close or refresh this tab.
          </p>
        </div>
      )}
    </>
  );
};
