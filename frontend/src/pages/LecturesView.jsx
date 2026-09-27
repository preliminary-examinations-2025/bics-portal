import React from 'react';
import { Video, Code, Loader2 } from 'lucide-react';
import Editor from '@monaco-editor/react';

export default function LecturesView({
  videoLectures = [],
  selectedLecture,
  setSelectedLecture,
  getYouTubeEmbedUrl,
  playgroundMode,
  setPlaygroundMode,
  playgroundCppCode,
  setPlaygroundCppCode,
  terminalLines = [],
  setTerminalLines,
  bufferedStdin = [],
  setBufferedStdin,
  terminalInput,
  setTerminalInput,
  isPlayinggroundRunning,
  handleRunPlaygroundCpp,
  terminalEndRef,
  isTerminalWaiting,
  handleTerminalSubmit,
  playgroundWebTab,
  setPlaygroundWebTab,
  playgroundWebHtml,
  setPlaygroundWebHtml,
  playgroundWebCss,
  setPlaygroundWebCss,
  playgroundWebJs,
  setPlaygroundWebJs
}) {
  return (
    <div className="cf-card">
      <div className="cf-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Video size={18} style={{ color: '#3b5998' }} />
        <span>Course Video Lectures</span>
      </div>
      {videoLectures.length === 0 ? (
        <div className="cf-alert cf-alert-info">No video lectures uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
          
          {/* Lecture Player Viewport */}
          <div style={{ flex: '2 1 600px', minWidth: '300px' }}>
            {selectedLecture ? (
              <div>
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#000' }}>
                  <iframe
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    src={getYouTubeEmbedUrl && getYouTubeEmbedUrl(selectedLecture.youtubeUrl)}
                    title={selectedLecture.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  ></iframe>
                </div>
                <h3 style={{ marginTop: '15px', color: '#002147', fontSize: '14pt', fontWeight: 'bold' }}>
                  {selectedLecture.title}
                </h3>
                <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', display: 'inline-block', marginTop: '5px' }}>
                  {selectedLecture.section}
                </span>

                {/* Interactive Practice Playground (Light Mode) */}
                <div style={{
                  marginTop: '30px',
                  padding: '24px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Code size={18} style={{ color: '#3b5998' }} />
                      <h4 style={{ margin: 0, color: '#002147', fontSize: '12pt', fontWeight: 'bold' }}>
                        BICS Interactive Practice Playground
                      </h4>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setPlaygroundMode && setPlaygroundMode('cpp')}
                        className="cf-btn-secondary"
                        style={{
                          padding: '4px 12px',
                          fontSize: '8.5pt',
                          backgroundColor: playgroundMode === 'cpp' ? '#3b5998' : '#fff',
                          color: playgroundMode === 'cpp' ? '#fff' : '#475569',
                          border: '1px solid #cbd5e1'
                        }}
                      >
                        C++ Compiler
                      </button>
                      <button
                        onClick={() => setPlaygroundMode && setPlaygroundMode('web')}
                        className="cf-btn-secondary"
                        style={{
                          padding: '4px 12px',
                          fontSize: '8.5pt',
                          backgroundColor: playgroundMode === 'web' ? '#3b5998' : '#fff',
                          color: playgroundMode === 'web' ? '#fff' : '#475569',
                          border: '1px solid #cbd5e1'
                        }}
                      >
                        Web Canvas (HTML/CSS/JS)
                      </button>
                    </div>
                  </div>

                  {playgroundMode === 'cpp' ? (
                    <div>
                      {/* C++ Practice mode */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {/* Editor Header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          backgroundColor: '#e2e8f0',
                          padding: '6px 12px',
                          borderTopLeftRadius: '6px',
                          borderTopRightRadius: '6px',
                          border: '1px solid #cbd5e1',
                          borderBottom: 'none'
                        }}>
                          <span style={{ fontSize: '8pt', fontFamily: 'monospace', color: '#334155', fontWeight: 'bold' }}>
                            main.cpp (BICS C++ Editor)
                          </span>
                        </div>
                        {/* Monaco Editor Wrapper */}
                        <div style={{ border: '1px solid #cbd5e1', borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', overflow: 'hidden' }}>
                          <Editor
                            height="400px"
                            language="cpp"
                            theme="vs"
                            value={playgroundCppCode}
                            onChange={(val) => setPlaygroundCppCode && setPlaygroundCppCode(val || '')}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 13,
                              lineHeight: 20,
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              fontFamily: 'Consolas, Monaco, monospace'
                            }}
                          />
                        </div>

                        {/* Controls & Unified Terminal Panel */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                          
                          {/* Terminal Header & Actions */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <label style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', margin: 0 }}>
                              BICS Interactive Console Terminal
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => {
                                  if (setTerminalLines) setTerminalLines([]);
                                  if (setBufferedStdin) setBufferedStdin([]);
                                  if (setTerminalInput) setTerminalInput('');
                                }}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: '9pt',
                                  fontWeight: 'bold',
                                  backgroundColor: '#fff',
                                  color: '#475569',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Clear
                              </button>
                              <button
                                onClick={handleRunPlaygroundCpp}
                                disabled={isPlayinggroundRunning}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '8px 20px',
                                  fontSize: '9.5pt',
                                  fontWeight: 'bold',
                                  backgroundColor: '#3b5998',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: isPlayinggroundRunning ? 'not-allowed' : 'pointer',
                                  boxShadow: '0 2px 4px rgba(59, 89, 152, 0.15)',
                                  transition: 'background-color 0.2s'
                                }}
                              >
                                {isPlayinggroundRunning && (
                                  <Loader2 size={14} className="spinner" style={{ marginRight: '8px' }} />
                                )}
                                {isPlayinggroundRunning ? 'Running...' : 'Run C++ Code'}
                              </button>
                            </div>
                          </div>

                          {/* Console Box (Light Color Scheme) */}
                          <div style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontFamily: 'Consolas, Monaco, Courier, monospace',
                            fontSize: '9.5pt',
                            padding: '16px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}>
                            
                            {/* Terminal Lines Container */}
                            <div style={{
                              maxHeight: '240px',
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px'
                            }}>
                              {terminalLines.map((line, idx) => {
                                let lineStyle = { margin: 0, whiteSpace: 'pre-wrap' };
                                if (line.startsWith('$')) {
                                  lineStyle.color = '#16a34a'; // Green for shell commands and inputs
                                  lineStyle.fontWeight = 'bold';
                                } else if (line.startsWith('Compilation Error') || line.startsWith('Runtime Error') || line.startsWith('Error:')) {
                                  lineStyle.color = '#dc2626'; // Red for errors
                                }
                                return (
                                  <p key={idx} style={lineStyle}>{line}</p>
                                );
                              })}
                              <div ref={terminalEndRef} />
                            </div>

                            {/* Input Prompt Row - Active when waiting for input */}
                            {isTerminalWaiting && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                borderTop: '1px solid #e2e8f0',
                                paddingTop: '8px',
                                marginTop: '4px'
                              }}>
                                <span style={{ color: '#16a34a', fontWeight: 'bold', marginRight: '8px', userSelect: 'none' }}>$</span>
                                <input
                                  type="text"
                                  value={terminalInput}
                                  onChange={(e) => setTerminalInput && setTerminalInput(e.target.value)}
                                  onKeyDown={handleTerminalSubmit}
                                  disabled={isPlayinggroundRunning && !isTerminalWaiting}
                                  placeholder="Type standard input and press Enter..."
                                  autoFocus
                                  style={{
                                    flex: 1,
                                    background: 'transparent',
                                    color: '#0f172a',
                                    border: 'none',
                                    outline: 'none',
                                    fontFamily: 'Consolas, Monaco, Courier, monospace',
                                    fontSize: '9.5pt',
                                    caretColor: '#0f172a'
                                  }}
                                />
                              </div>
                            )}

                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {/* File tabs */}
                        <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1' }}>
                          {['html', 'css', 'js'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setPlaygroundWebTab && setPlaygroundWebTab(t)}
                              style={{
                                padding: '6px 16px',
                                fontSize: '8.5pt',
                                fontWeight: 'bold',
                                backgroundColor: playgroundWebTab === t ? '#fff' : 'transparent',
                                color: playgroundWebTab === t ? '#3b5998' : '#64748b',
                                border: '1px solid transparent',
                                borderBottomColor: playgroundWebTab === t ? '#fff' : 'transparent',
                                borderTopLeftRadius: '4px',
                                borderTopRightRadius: '4px',
                                marginBottom: '-1px',
                                zIndex: playgroundWebTab === t ? 1 : 0
                              }}
                            >
                              index.{t.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        {/* Web Editor Area */}
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                          <Editor
                            height="400px"
                            language={playgroundWebTab === 'js' ? 'javascript' : playgroundWebTab}
                            theme="vs"
                            value={playgroundWebTab === 'html' ? playgroundWebHtml : playgroundWebTab === 'css' ? playgroundWebCss : playgroundWebJs}
                            onChange={(val) => {
                              if (playgroundWebTab === 'html' && setPlaygroundWebHtml) setPlaygroundWebHtml(val || '');
                              else if (playgroundWebTab === 'css' && setPlaygroundWebCss) setPlaygroundWebCss(val || '');
                              else if (playgroundWebTab === 'js' && setPlaygroundWebJs) setPlaygroundWebJs(val || '');
                            }}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 13,
                              lineHeight: 20,
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              fontFamily: 'Consolas, Monaco, monospace'
                            }}
                          />
                        </div>

                        {/* Sandbox Live Preview Iframe */}
                        <div>
                          <label style={{ display: 'block', fontSize: '9pt', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                            Live Sandbox Canvas Visual Preview:
                          </label>
                          <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#fff' }}>
                            <iframe
                              title="BICS Playground Sandbox Preview"
                              srcDoc={`
                                <!DOCTYPE html>
                                <html>
                                  <head>
                                    <meta charset="utf-8">
                                    <base href="https://invalid-sandbox-origin.invalid/">
                                    <style>${playgroundWebCss}</style>
                                  </head>
                                  <body>
                                    ${playgroundWebHtml}
                                    <script>
                                      try {
                                        ${playgroundWebJs}
                                      } catch (err) {
                                        console.error(err);
                                      }
                                    </script>
                                  </body>
                                </html>
                              `}
                              style={{
                                width: '100%',
                                height: '240px',
                                border: 'none',
                                backgroundColor: '#fff'
                              }}
                              sandbox="allow-scripts"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="cf-alert cf-alert-info">Select a lecture from the side list to begin playing.</div>
            )}
          </div>

          {/* Lecture Navigation Side List */}
          <div style={{ flex: '1 1 280px', minWidth: '240px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px', maxHeight: '550px', overflowY: 'auto' }}>
            <h4 style={{ color: '#333', fontWeight: 'bold', marginBottom: '12px', paddingBottom: '5px', borderBottom: '2px solid #3b5998' }}>
              Lecture Sections
            </h4>
            {Array.from(new Set(videoLectures.map(l => l.section))).map((section, sIdx) => (
              <div key={sIdx} style={{ marginBottom: '20px' }}>
                <h5 style={{ color: '#002147', fontWeight: 'bold', fontSize: '10pt', marginBottom: '8px', textTransform: 'uppercase' }}>
                  {section}
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {videoLectures.filter(l => l.section === section).map((lect, lIdx) => (
                    <button
                      key={lIdx}
                      onClick={() => setSelectedLecture && setSelectedLecture(lect)}
                      className="cf-btn-secondary"
                      style={{
                        textAlign: 'left',
                        fontSize: '9pt',
                        padding: '8px 10px',
                        width: '100%',
                        border: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                          ? '2px solid #3b5998'
                          : '1px solid #e2e8f0',
                        backgroundColor: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                          ? '#f1f5f9'
                          : '#fff',
                        fontWeight: selectedLecture && (selectedLecture.id === lect.id || selectedLecture._id === lect._id)
                          ? 'bold'
                          : 'normal'
                      }}
                    >
                      {lect.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
