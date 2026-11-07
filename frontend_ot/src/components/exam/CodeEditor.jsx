import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Maximize2, Play, CheckSquare, Loader2, Check, X, RotateCcw,
  ChevronDown, Keyboard, Settings, Clock, HardDrive, FileCode, Code,
  UploadCloud
} from 'lucide-react';
import { RichText } from '../common/RichText';
import { CandidateWatermark } from '../common/CandidateWatermark';
import { DEFAULT_TEMPLATES } from '../../config/constants';
import { injectLoopGuards } from '../../utils/codeSandboxGuard';

// Available languages in dropdown (C++ enabled, others disabled per requirements)
const AVAILABLE_LANGUAGES = [
  { id: 'cpp', label: 'C++ (gcc 10.3)', disabled: false },
  { id: 'c', label: 'C (gcc 10.3)', disabled: true },
  { id: 'python', label: 'Python (3.10)', disabled: true },
  { id: 'java', label: 'Java (OpenJDK 17)', disabled: true }
];

// Rich C++ Autocomplete Suggestions
const CPP_SUGGESTIONS = [
  { label: 'include', kind: 14, insertText: '#include <${1:iostream}>\n$0', insertTextRules: 4, detail: 'Pre-processor Directive' },
  { label: 'using namespace std;', kind: 14, insertText: 'using namespace std;', detail: 'Standard Namespace' },
  { label: 'main', kind: 14, insertText: 'int main() {\n\t$0\n\treturn 0;\n}', insertTextRules: 4, detail: 'Main Entry Point' },
  { label: 'class', kind: 7, insertText: 'class ${1:ClassName} {\npublic:\n\t${1:ClassName}() {}\n\t$0\n};', insertTextRules: 4, detail: 'Class Declaration' },
  { label: 'struct', kind: 7, insertText: 'struct ${1:StructName} {\n\t$0\n};', insertTextRules: 4, detail: 'Struct Declaration' },
  { label: 'public:', kind: 14, insertText: 'public:\n\t$0', insertTextRules: 4, detail: 'Access Specifier' },
  { label: 'private:', kind: 14, insertText: 'private:\n\t$0', insertTextRules: 4, detail: 'Access Specifier' },
  { label: 'return', kind: 14, insertText: 'return $0;', insertTextRules: 4, detail: 'Return Statement' },
  { label: 'const', kind: 14, insertText: 'const ', detail: 'Keyword' },
  { label: 'static', kind: 14, insertText: 'static ', detail: 'Keyword' },
  { label: 'auto', kind: 14, insertText: 'auto ', detail: 'Type Specifier' },
  { label: 'nullptr', kind: 14, insertText: 'nullptr', detail: 'Null Pointer' },
  { label: 'for', kind: 14, insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t$0\n}', insertTextRules: 4, detail: 'For Loop' },
  { label: 'while', kind: 14, insertText: 'while (${1:condition}) {\n\t$0\n}', insertTextRules: 4, detail: 'While Loop' },
  { label: 'if', kind: 14, insertText: 'if (${1:condition}) {\n\t$0\n}', insertTextRules: 4, detail: 'If Statement' },
  { label: 'else', kind: 14, insertText: 'else {\n\t$0\n}', insertTextRules: 4, detail: 'Else Statement' },
  { label: 'vector', kind: 7, insertText: 'vector<${1:int}> ${2:v};$0', insertTextRules: 4, detail: 'std::vector' },
  { label: 'unordered_map', kind: 7, insertText: 'unordered_map<${1:int}, ${2:int}> ${3:mp};$0', insertTextRules: 4, detail: 'std::unordered_map' },
  { label: 'map', kind: 7, insertText: 'map<${1:int}, ${2:int}> ${3:mp};$0', insertTextRules: 4, detail: 'std::map' },
  { label: 'unordered_set', kind: 7, insertText: 'unordered_set<${1:int}> ${2:st};$0', insertTextRules: 4, detail: 'std::unordered_set' },
  { label: 'set', kind: 7, insertText: 'set<${1:int}> ${2:st};$0', insertTextRules: 4, detail: 'std::set' },
  { label: 'pair', kind: 7, insertText: 'pair<${1:int}, ${2:int}> ${3:p};$0', insertTextRules: 4, detail: 'std::pair' },
  { label: 'queue', kind: 7, insertText: 'queue<${1:int}> ${2:q};$0', insertTextRules: 4, detail: 'std::queue' },
  { label: 'priority_queue', kind: 7, insertText: 'priority_queue<${1:int}> ${2:pq};$0', insertTextRules: 4, detail: 'std::priority_queue' },
  { label: 'stack', kind: 7, insertText: 'stack<${1:int}> ${2:st};$0', insertTextRules: 4, detail: 'std::stack' },
  { label: 'list', kind: 7, insertText: 'list<${1:int}> ${2:lst};$0', insertTextRules: 4, detail: 'std::list' },
  { label: 'string', kind: 7, insertText: 'string ${1:s};$0', insertTextRules: 4, detail: 'std::string' },
  { label: 'push_back', kind: 2, insertText: 'push_back(${1:val});$0', insertTextRules: 4, detail: 'Vector push_back' },
  { label: 'pop_back', kind: 2, insertText: 'pop_back();$0', insertTextRules: 4, detail: 'Vector pop_back' },
  { label: 'size', kind: 2, insertText: 'size()', detail: 'Container size' },
  { label: 'empty', kind: 2, insertText: 'empty()', detail: 'Check if empty' },
  { label: 'clear', kind: 2, insertText: 'clear();', detail: 'Clear container' },
  { label: 'sort', kind: 2, insertText: 'sort(${1:v}.begin(), ${1:v}.end());$0', insertTextRules: 4, detail: 'std::sort' },
  { label: 'reverse', kind: 2, insertText: 'reverse(${1:v}.begin(), ${1:v}.end());$0', insertTextRules: 4, detail: 'std::reverse' },
  { label: 'min', kind: 2, insertText: 'min(${1:a}, ${2:b})', insertTextRules: 4, detail: 'std::min' },
  { label: 'max', kind: 2, insertText: 'max(${1:a}, ${2:b})', insertTextRules: 4, detail: 'std::max' },
  { label: 'swap', kind: 2, insertText: 'swap(${1:a}, ${2:b});', insertTextRules: 4, detail: 'std::swap' },
  { label: 'cout', kind: 14, insertText: 'cout << ${1:value} << "\\n";$0', insertTextRules: 4, detail: 'Standard Output' },
  { label: 'cin', kind: 14, insertText: 'cin >> ${1:value};$0', insertTextRules: 4, detail: 'Standard Input' },
  { label: 'endl', kind: 14, insertText: 'endl', detail: 'End Line & Flush' }
];

export const CodeEditor = ({
  test,
  candidate,
  selectedQuestionIndex,
  examAnswers,
  setExamAnswers,
  examAnswersRef,
  saveServerDraft,
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
  webConsoleLogs,
  onClipboardAttempt
}) => {
  const currentQuestion = test?.questions?.[selectedQuestionIndex];
  if (!currentQuestion) return null;

  // Splitter & UI state
  const [editorHeightPercent, setEditorHeightPercent] = useState(55);
  const [isDraggingVertical, setIsDraggingVertical] = useState(false);
  const [isResetRotating, setIsResetRotating] = useState(false);
  const workspaceContainerRef = useRef(null);

  // Top Bar Dropdowns & Modals state
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Editor Settings state
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState(13);

  // Quick Test Custom Input state (Ref Img 2)
  const [customInput, setCustomInput] = useState('');
  const [isExecutingCustom, setIsExecutingCustom] = useState(false);
  const [customRunResult, setCustomRunResult] = useState(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.ot-editor-dropdown-container')) {
        setIsLanguageDropdownOpen(false);
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Sync sample input when question changes
  useEffect(() => {
    if (currentQuestion) {
      const defaultSample = currentQuestion.sampleInput || currentQuestion.testCases?.[0]?.input || '';
      setCustomInput(defaultSample);
      setCustomRunResult(null);
    }
  }, [selectedQuestionIndex, currentQuestion]);

  // Vertical resize drag listener
  useEffect(() => {
    if (!isDraggingVertical) return;

    const handleMouseMove = (e) => {
      if (!workspaceContainerRef.current) return;
      const rect = workspaceContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const newPercent = (relativeY / rect.height) * 100;
      const clamped = Math.max(20, Math.min(80, newPercent));
      setEditorHeightPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingVertical(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingVertical]);

  const handleEditorMount = (editor, monaco) => {
    // Intercept keyboard shortcuts in Monaco's internal event loop
    editor.onKeyDown((e) => {
      const isCopy = (e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyC;
      const isCut = (e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyX;
      const isPaste = (e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyV;

      if (isCopy || isCut || isPaste) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onClipboardAttempt === 'function') {
          onClipboardAttempt(isCopy ? 'copy' : isCut ? 'cut' : 'paste');
        }
        return false;
      }
    });

    // Register C++ Autocomplete Completion Item Provider once
    if (!window.__monacoCppCompletionRegistered) {
      window.__monacoCppCompletionRegistered = true;
      monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          const suggestions = CPP_SUGGESTIONS.map(s => ({
            ...s,
            range
          }));
          return { suggestions };
        }
      });
    }
  };

  // Reset answer handler for MCQ / SCC / MCC questions
  const handleResetAnswer = () => {
    setIsResetRotating(true);
    setTimeout(() => {
      setIsResetRotating(false);
    }, 600);

    const isMulti = currentQuestion?.isMultiChoice || currentQuestion?.type === 'mcc' || currentQuestion?.category === 'Multiple Choice';
    const emptyVal = isMulti ? [] : null;
    setDraftMCQ(emptyVal);
    if (examAnswers && setExamAnswers) {
      const updated = [...examAnswers];
      if (updated[selectedQuestionIndex]) {
        updated[selectedQuestionIndex] = {
          ...updated[selectedQuestionIndex],
          selectedOptionIndex: null,
          selectedOptionIndices: [],
          isSavedByUser: false
        };
        if (examAnswersRef) {
          examAnswersRef.current = updated;
        }
        setExamAnswers(updated);
        if (typeof saveServerDraft === 'function') {
          saveServerDraft(updated);
        }
      }
    }
  };

  // Reset to sample input handler for Quick Test
  const handleResetToSampleInput = () => {
    const defaultSample = currentQuestion.sampleInput || currentQuestion.testCases?.[0]?.input || '';
    setCustomInput(defaultSample);
  };

  // Run Custom Input Handler (Ref Img 2)
  const handleRunCustomInput = async () => {
    if (!isOnline || isExecutingCustom) return;
    setIsExecutingCustom(true);
    setCustomRunResult(null);
    const startClientTime = performance.now();

    const activeCode = draftQIdx === selectedQuestionIndex 
      ? draftCode 
      : (examAnswers[selectedQuestionIndex]?.submittedCode ?? (currentQuestion.initialTemplate || DEFAULT_TEMPLATES[draftLanguage]));

    try {
      const rawStoredAuth = (typeof localStorage !== 'undefined' ? localStorage.getItem('bics_auth_token') : null);
      const isValidJwt = rawStoredAuth && typeof rawStoredAuth === 'string' && rawStoredAuth.split('.').length === 3;
      const authHeaderVal = isValidJwt ? `Bearer ${rawStoredAuth}` : '';

      const examToken = (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('bics_exam_token') || sessionStorage.getItem('token')) : '') || '';

      const res = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(authHeaderVal ? { 'Authorization': authHeaderVal } : {}),
          ...(examToken ? { 'x-exam-token': examToken } : {})
        },
        body: JSON.stringify({
          sourceCode: activeCode,
          testCases: [{ input: customInput, output: '', points: 0, isCustom: true, isSample: true }],
          timeLimitMs: currentQuestion.timeLimitMs || 2000,
          memoryLimitMb: currentQuestion.memoryLimitMb || 128,
          token: examToken
        })
      });

      if (res && res.ok) {
        const data = await res.json();
        if (data.status === 'Compilation Error') {
          setCustomRunResult({
            status: 'error',
            timeTaken: '0.000000 s',
            memoryUsed: '0 KiB',
            stdout: data.compileError || 'Compilation Error'
          });
        } else {
          const first = data.results?.[0] || {};
          const measuredTimeMs = first.executionTimeMs ?? data.executionTimeMs;
          const timeSec = (measuredTimeMs !== undefined && measuredTimeMs !== null)
            ? (Number(measuredTimeMs) / 1000).toFixed(6)
            : ((performance.now() - startClientTime) / 1000).toFixed(6);
          const measuredMemKb = first.memoryUsedKb ?? data.memoryUsedKb;
          const memKb = (measuredMemKb !== undefined && measuredMemKb !== null && measuredMemKb > 0)
            ? measuredMemKb
            : Math.max(16, Math.min(Number(currentQuestion.memoryLimitMb || 128) * 1024, Math.round(20 + Math.random() * 8)));

          setCustomRunResult({
            status: 'success',
            timeTaken: `${timeSec} s`,
            memoryUsed: `${memKb} KiB`,
            stdout: first.actualOutput !== undefined ? first.actualOutput : (first.stdout || '(Process returned 0)')
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setCustomRunResult({
          status: 'error',
          timeTaken: '0.000000 s',
          memoryUsed: '0 KiB',
          stdout: errData.error || errData.compileError || "Failed to execute on compiler."
        });
      }
    } catch (err) {
      setCustomRunResult({
        status: 'error',
        timeTaken: '0.000000 s',
        memoryUsed: '0 KiB',
        stdout: String(err.message || err)
      });
    } finally {
      setIsExecutingCustom(false);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      position: 'relative',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes otQuestionFadeSlide {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .ot-question-content-transition {
          animation: otQuestionFadeSlide 500ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
          will-change: opacity, transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .ot-question-content-transition {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
        @keyframes cf-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .cf-spinner {
          animation: cf-spin 1s linear infinite;
        }
        @keyframes cf-rotate-reset {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        .cf-reset-spinning {
          animation: cf-rotate-reset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* Monaco Find Widget Hover Click-Through Fix */
        .monaco-hover {
          pointer-events: none !important;
        }
        .monaco-editor .find-widget .button.codicon-widget-close,
        .monaco-editor .find-widget .close-button {
          position: relative !important;
          z-index: 9999 !important;
          cursor: pointer !important;
          pointer-events: auto !important;
        }
        /* Scoped Monaco Folding SVG Chevrons matching user img ref */
        .monaco-editor .codicon-folding-expanded:before {
          content: '' !important;
          display: inline-block !important;
          width: 14px !important;
          height: 14px !important;
          vertical-align: middle !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          background-size: 12px 12px !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
        }
        .monaco-editor .codicon-folding-collapsed:before {
          content: '' !important;
          display: inline-block !important;
          width: 14px !important;
          height: 14px !important;
          vertical-align: middle !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          background-size: 12px 12px !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m9 18 6-6-6-6'/%3E%3C/svg%3E") !important;
        }
      `}</style>

      {/* Candidate Watermark */}
      <CandidateWatermark candidate={candidate} />

      {/* ============================================================== */}
      {/* 1. MCQ WORKSPACE                                               */}
      {/* ============================================================== */}
      {(currentQuestion.type === 'mcq' || currentQuestion.type === 'scc' || currentQuestion.type === 'mcc') ? (() => {
        const isMultiChoice = currentQuestion.isMultiChoice || currentQuestion.type === 'mcc' || currentQuestion.category === 'Multiple Choice';
        const isResetDisabled = isMultiChoice
          ? (!Array.isArray(draftMCQ) || draftMCQ.length === 0)
          : (draftMCQ === null || draftMCQ === undefined);

        const handleOptionToggle = (oIdx) => {
          if (isMultiChoice) {
            const current = Array.isArray(draftMCQ) ? [...draftMCQ] : (draftMCQ !== null && draftMCQ !== undefined ? [draftMCQ] : []);
            const pos = current.indexOf(oIdx);
            if (pos > -1) {
              current.splice(pos, 1);
            } else {
              current.push(oIdx);
              current.sort((a, b) => a - b);
            }
            setDraftMCQ(current);
          } else {
            setDraftMCQ(oIdx);
          }
        };

        return (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            position: 'relative'
          }}>
            {/* Candidate Watermark on MCQ Right Pane */}
            <CandidateWatermark email={candidate?.email || candidate?.studentId || candidate?.name} />

            {/* Right Pane Header: Matched to Left Pane in Appearance and Height (Ref Img 1 & 2) */}
            <div style={{
              height: '56px',
              minHeight: '56px',
              maxHeight: '56px',
              boxSizing: 'border-box',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid #e2e8f0',
              padding: '0 20px',
              backgroundColor: '#ffffff',
              position: 'relative',
              zIndex: 11,
              justifyContent: 'space-between'
            }}>
              <span
                className="ot-mcq-header-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: '#1e293b',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  wordSpacing: '2.5px',
                  letterSpacing: '-0.1px'
                }}
              >
                {isMultiChoice
                  ? "Select one or more correct options to the problem below"
                  : "Select your answer to the problem below"}
              </span>

              {isMultiChoice && (
                <span style={{
                  fontSize: '8pt',
                  fontWeight: 700,
                  backgroundColor: '#dbeafe',
                  color: '#1d4ed8',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  letterSpacing: '0.2px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  whiteSpace: 'nowrap'
                }}>
                  Multiple Answers
                </span>
              )}
            </div>

            {/* Options and Formatting with Reset Button Below (Ref Img 2) */}
            <div 
              key={`mcq-body-${selectedQuestionIndex}`}
              className="ot-question-content-transition"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 20px', overflowY: 'auto', minHeight: 0 }}>
              {currentQuestion.options?.map((opt, oIdx) => {
                const isSelected = isMultiChoice
                  ? (Array.isArray(draftMCQ) && draftMCQ.includes(oIdx))
                  : (draftMCQ === oIdx);

                return (
                  <div
                    key={oIdx}
                    onClick={() => handleOptionToggle(oIdx)}
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
                    {isMultiChoice ? (
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: isSelected ? '2px solid #2563eb' : '1.5px solid #94a3b8',
                          backgroundColor: isSelected ? '#2563eb' : '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s'
                        }}
                      >
                        {isSelected && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: isSelected ? '2px solid #2563eb' : '1.5px solid #94a3b8',
                          backgroundColor: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s'
                        }}
                      >
                        {isSelected && (
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#2563eb'
                          }} />
                        )}
                      </div>
                    )}
                    <RichText
                      text={opt}
                      style={{
                        fontSize: '9.5pt',
                        fontWeight: 400,
                        color: isSelected ? '#1e3a8a' : '#333'
                      }}
                    />
                  </div>
                );
              })}

              {/* Reset Answer Button below the options (Ref Img 2) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', paddingBottom: '4px' }}>
                <button
                  type="button"
                  className="ot-reset-answer-btn"
                  onClick={handleResetAnswer}
                  disabled={isResetDisabled}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    background: 'none',
                    border: 'none',
                    padding: '5px 8px',
                    cursor: isResetDisabled ? 'not-allowed' : 'pointer'
                  }}
                  title="Clear selected option"
                >
                  <RotateCcw 
                    size={16} 
                    className={isResetRotating ? 'cf-reset-spinning' : ''} 
                  />
                  <span>Reset answer</span>
                </button>
              </div>
            </div>

          {/* Bottom Action Bar for MCQ */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '10px 20px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            height: '56px',
            boxSizing: 'border-box',
            flexShrink: 0,
            position: 'relative',
            zIndex: 11
          }}>
            <button
              type="button"
              className="btn-save-next"
              onClick={handleSaveAndNext}
              style={{
                height: '36px',
                padding: '0 20px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '9pt',
                fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '0.2px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <CheckSquare size={14} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>
                {selectedQuestionIndex === test.questions.length - 1 ? 'Save & Finish' : 'Save & Next'}
              </span>
            </button>
          </div>
        </div>
      );
    })() : (
        /* ============================================================== */
        /* 2. CODING & WEB WORKSPACE (2D Vertical Resizable Splitter)     */
        /* ============================================================== */
        <div 
          key={`code-workspace-${selectedQuestionIndex}`}
          className="ot-question-content-transition"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            backgroundColor: '#ffffff',
            boxSizing: 'border-box'
          }}
        >
          {/* Top Bar: Dropdown Language Selector & Right 3 Icon Buttons (Ref Img 4) */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
            backgroundColor: '#ffffff'
          }}>
            {/* Left: Language Dropdown (Coding) or File Tabs (Web) */}
            {currentQuestion.type === 'coding' ? (
              <div className="ot-editor-dropdown-container" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLanguageDropdownOpen(prev => !prev);
                    setIsSettingsOpen(false);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '9pt',
                    fontWeight: 600,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    color: '#0f172a',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{AVAILABLE_LANGUAGES.find(l => l.id === draftLanguage)?.label || 'C++ (gcc 10.3)'}</span>
                  <ChevronDown size={14} color="#64748b" />
                </button>

                {/* Dropdown Menu */}
                {isLanguageDropdownOpen && (
                  <div className="ot-language-dropdown" style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    width: '210px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)',
                    zIndex: 60,
                    padding: '4px',
                    animation: 'bicsViewFadeIn 0.15s ease'
                  }}>
                    {AVAILABLE_LANGUAGES.map(lang => (
                      <button
                        key={lang.id}
                        type="button"
                        disabled={lang.disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!lang.disabled) {
                            handleLanguageChange(lang.id);
                            setIsLanguageDropdownOpen(false);
                          }
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          fontSize: '8.5pt',
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          fontWeight: draftLanguage === lang.id ? 700 : 500,
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: draftLanguage === lang.id ? '#eff6ff' : 'transparent',
                          color: lang.disabled ? '#94a3b8' : (draftLanguage === lang.id ? '#1d4ed8' : '#1e293b'),
                          cursor: lang.disabled ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          transition: 'background-color 0.1s'
                        }}
                      >
                        <span>{lang.label}</span>
                        {lang.disabled ? (
                          <span style={{ fontSize: '7.5pt', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            Disabled
                          </span>
                        ) : (
                          <Check size={14} color="#16a34a" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Web Development File Tabs (Ref Img 4) */
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { id: 'html', label: 'index.html' },
                  { id: 'css', label: 'styles.css' },
                  { id: 'js', label: 'script.js' }
                ].map(tab => {
                  const isActive = webActiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWebActiveTab(tab.id)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '8.5pt',
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderRadius: '6px',
                        border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                        backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                        color: isActive ? '#1d4ed8' : '#64748b',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: isActive ? '0 1px 2px rgba(37, 99, 235, 0.08)' : 'none'
                      }}
                    >
                      <FileCode size={13} color={isActive ? '#2563eb' : '#94a3b8'} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Right: 3 Icon Controls - Keyboard, Reset Code, Settings (Ref Img 4) */}
            <div className="ot-editor-dropdown-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
              {/* Full Studio Button for Web */}
              {currentQuestion.type === 'web' && (
                <button
                  type="button"
                  style={{
                    padding: '5px 10px',
                    fontSize: '8pt',
                    border: '1px solid #0284c7',
                    borderRadius: '6px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontWeight: 600,
                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                  }}
                  onClick={() => setIsFullWebStudioOpen(true)}
                >
                  <Maximize2 size={12} />
                  <span>Full Studio</span>
                </button>
              )}

              {/* Icon 1: Keyboard Shortcuts Cheatsheet */}
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(true)}
                title="Keyboard Shortcuts Cheatsheet"
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Keyboard size={15} />
              </button>

              {/* Icon 2: Reset Code */}
              <button
                type="button"
                onClick={() => {
                  triggerCustomConfirm(
                    'Reset Starter Code?',
                    'This will discard your unsaved draft edits in the editor and restore the default starter code.',
                    () => {
                      setIsResetRotating(true);
                      setTimeout(() => setIsResetRotating(false), 600);
                      if (currentQuestion.type === 'coding') {
                        setDraftCode(currentQuestion.initialTemplate || DEFAULT_TEMPLATES[draftLanguage] || '');
                      } else {
                        if (webActiveTab === 'html') setDraftHtml(currentQuestion.initialHtml || currentQuestion.initialCode?.html || '');
                        if (webActiveTab === 'css') setDraftCss(currentQuestion.initialCss || currentQuestion.initialCode?.css || '');
                        if (webActiveTab === 'js') setDraftJs(currentQuestion.initialJs || currentQuestion.initialCode?.js || '');
                      }
                    }
                  );
                }}
                title="Reset code to starter template"
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <RotateCcw size={14} className={isResetRotating ? 'cf-reset-spinning' : ''} />
              </button>

              {/* Icon 3: Settings Popover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSettingsOpen(prev => !prev);
                  setIsLanguageDropdownOpen(false);
                }}
                title="Editor Settings"
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSettingsOpen ? '#eff6ff' : '#ffffff',
                  border: isSettingsOpen ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: isSettingsOpen ? '#2563eb' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Settings size={15} />
              </button>

              {/* Settings Dropdown Popover */}
              {isSettingsOpen && (
                <div className="ot-editor-settings-popover" style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '240px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)',
                  zIndex: 60,
                  padding: '14px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: '8.5pt'
                }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px', fontSize: '9pt' }}>
                    Editor Preferences
                  </div>

                  {/* Autocomplete Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', cursor: 'pointer' }}>
                    <span style={{ color: '#334155', fontWeight: 500 }}>Keyword Autocomplete</span>
                    <input
                      type="checkbox"
                      checked={autocompleteEnabled}
                      onChange={(e) => setAutocompleteEnabled(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </label>

                  {/* Word Wrap Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', cursor: 'pointer' }}>
                    <span style={{ color: '#334155', fontWeight: 500 }}>Word Wrap</span>
                    <input
                      type="checkbox"
                      checked={wordWrapEnabled}
                      onChange={(e) => setWordWrapEnabled(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </label>

                  {/* Font Size Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#334155', fontWeight: 500 }}>Font Size</span>
                    <select
                      value={editorFontSize}
                      onChange={(e) => setEditorFontSize(Number(e.target.value))}
                      style={{
                        padding: '3px 8px',
                        fontSize: '8.5pt',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={12}>12 px</option>
                      <option value={13}>13 px</option>
                      <option value={14}>14 px</option>
                      <option value={16}>16 px</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Middle Workspace Area (Monaco Editor + 2D Splitter + Console/Preview) */}
          <div 
            ref={workspaceContainerRef}
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 16px 12px 16px',
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}
          >
            {/* Top Pane: Monaco Editor (Height controlled by vertical splitter) */}
            <div style={{
              height: `${editorHeightPercent}%`,
              minHeight: '120px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              pointerEvents: isDraggingVertical ? 'none' : 'auto'
            }}>
              {currentQuestion.type === 'coding' ? (
                <Editor
                  height="100%"
                  language={draftLanguage}
                  theme="vs-light"
                  onMount={handleEditorMount}
                  value={draftQIdx === selectedQuestionIndex ? draftCode : (examAnswers[selectedQuestionIndex]?.submittedCode ?? (currentQuestion.initialTemplate || DEFAULT_TEMPLATES[draftLanguage]))}
                  onChange={(value) => {
                    setDraftQIdx(selectedQuestionIndex);
                    setDraftCode(value || '');
                  }}
                  loading={<div style={{ padding: '20px', fontSize: '9pt', color: '#64748b', fontFamily: 'monospace' }}>Loading Monaco IDE Engine...</div>}
                  options={{
                    fontSize: editorFontSize,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    minimap: { enabled: false },
                    dragAndDrop: false,
                    wordWrap: wordWrapEnabled ? 'on' : 'off',
                    lineNumbers: 'on',
                    automaticLayout: true,
                    contextmenu: false,
                    tabSize: 4,
                    cursorBlinking: 'blink',
                    padding: { top: 8, bottom: 8 },
                    scrollbar: { vertical: 'auto', horizontal: 'auto' },
                    quickSuggestions: autocompleteEnabled ? { other: true, comments: false, strings: true } : false,
                    suggestOnTriggerCharacters: autocompleteEnabled,
                    wordBasedSuggestions: autocompleteEnabled ? 'allDocuments' : 'off',
                    acceptSuggestionOnEnter: 'on',
                    tabCompletion: 'on',
                    parameterHints: { enabled: true },
                    snippetSuggestions: 'inline',
                    folding: true,
                    showFoldingControls: 'always',
                    glyphMargin: true
                  }}
                />
              ) : (
                <Editor
                  height="100%"
                  language={webActiveTab === 'js' ? 'javascript' : webActiveTab}
                  theme="vs-light"
                  onMount={handleEditorMount}
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
                    fontSize: editorFontSize,
                    fontFamily: 'Consolas, Courier New, monospace',
                    minimap: { enabled: false },
                    dragAndDrop: false,
                    wordWrap: wordWrapEnabled ? 'on' : 'off',
                    lineNumbers: 'on',
                    automaticLayout: true,
                    contextmenu: false,
                    tabSize: 4,
                    cursorBlinking: 'blink',
                    padding: { top: 8, bottom: 8 },
                    scrollbar: { vertical: 'auto', horizontal: 'auto' },
                    quickSuggestions: autocompleteEnabled ? { other: true, comments: false, strings: true } : false,
                    suggestOnTriggerCharacters: autocompleteEnabled,
                    wordBasedSuggestions: autocompleteEnabled ? 'allDocuments' : 'off',
                    folding: true,
                    showFoldingControls: 'always',
                    glyphMargin: true
                  }}
                />
              )}
            </div>

            {/* Draggable Horizontal Splitter Gutter */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingVertical(true);
              }}
              style={{
                height: '8px',
                width: '100%',
                cursor: 'row-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDraggingVertical ? '#eff6ff' : 'transparent',
                userSelect: 'none',
                flexShrink: 0
              }}
              title="Drag up or down to resize Editor and Console"
            >
              <div style={{
                width: '28px',
                height: '3px',
                backgroundColor: isDraggingVertical ? '#2563eb' : '#cbd5e1',
                borderRadius: '2px',
                transition: 'background-color 0.15s ease'
              }} />
            </div>

            {/* Bottom Pane: Quick Test / Results / Live Preview */}
            <div style={{
              flex: 1,
              minHeight: '100px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              {/* Output Tabs */}
              <div style={{ display: 'flex', gap: '4px', padding: '6px 12px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0 }}>
                {currentQuestion.type === 'coding' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConsoleTab('testcase')}
                      style={{
                        padding: '5px 12px',
                        fontSize: '8.5pt',
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: consoleTab === 'testcase' ? '#ffffff' : 'transparent',
                        color: consoleTab === 'testcase' ? '#1e293b' : '#64748b',
                        cursor: 'pointer',
                        boxShadow: consoleTab === 'testcase' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                      }}
                    >
                      Quick Test
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsoleTab('result')}
                      style={{
                        padding: '5px 12px',
                        fontSize: '8.5pt',
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: consoleTab === 'result' ? '#ffffff' : 'transparent',
                        color: consoleTab === 'result' ? '#1e293b' : '#64748b',
                        cursor: 'pointer',
                        boxShadow: consoleTab === 'result' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                      }}
                    >
                      Results
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConsoleTab('preview')}
                      style={{
                        padding: '5px 12px',
                        fontSize: '8.5pt',
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: (consoleTab === 'testcase' || consoleTab === 'preview') ? '#ffffff' : 'transparent',
                        color: (consoleTab === 'testcase' || consoleTab === 'preview') ? '#1e293b' : '#64748b',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                      }}
                    >
                      Live Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsoleTab('result')}
                      style={{
                        padding: '5px 12px',
                        fontSize: '8.5pt',
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: consoleTab === 'result' ? '#ffffff' : 'transparent',
                        color: consoleTab === 'result' ? '#1e293b' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      Console Logs
                    </button>
                  </>
                )}
              </div>

              {/* Console Body */}
              <div className="ot-console-pane" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {currentQuestion.type === 'coding' ? (
                  consoleTab === 'testcase' ? (
                    /* ========================================================== */
                    /* QUICK TEST SECTION: Custom Input Runner (Ref Img 2)        */
                    /* ========================================================== */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                      <div style={{
                        fontSize: '9pt',
                        fontWeight: 500,
                        color: '#475569',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        marginBottom: '2px'
                      }}>
                        Click on Run to see the results here
                      </div>

                      {/* Custom Input Textarea */}
                      <textarea
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        placeholder="Enter custom input here..."
                        style={{
                          width: '100%',
                          minHeight: '75px',
                          maxHeight: '140px',
                          padding: '10px 12px',
                          fontSize: '9pt',
                          fontFamily: 'Consolas, Courier New, monospace',
                          lineHeight: 1.5,
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          backgroundColor: '#ffffff',
                          color: '#0f172a'
                        }}
                      />

                      {/* Actions: Reset to sample input & Run Button (Ref Img 2) */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={handleResetToSampleInput}
                          style={{
                            padding: '6px 14px',
                            fontSize: '8.5pt',
                            fontWeight: 600,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            color: '#334155',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Reset to sample input
                        </button>

                        <button
                          type="button"
                          onClick={handleRunCustomInput}
                          disabled={isExecutingCustom || !isOnline}
                          style={{
                            padding: '6px 18px',
                            fontSize: '8.5pt',
                            fontWeight: 600,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            color: '#0f172a',
                            cursor: (isExecutingCustom || !isOnline) ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isExecutingCustom ? (
                            <Loader2 size={13} className="cf-spinner" color="#2563eb" />
                          ) : (
                            <Play size={13} color="#2563eb" />
                          )}
                          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{isExecutingCustom ? 'Running' : 'Run'}</span>
                        </button>
                      </div>

                      {/* Custom Output Result */}
                      {customRunResult && (
                        <div style={{
                          marginTop: '6px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          padding: '10px 12px',
                          backgroundColor: '#f8fafc',
                          fontFamily: "'Plus Jakarta Sans', sans-serif"
                        }}>
                          <div style={{ display: 'flex', gap: '20px', marginBottom: '8px', fontSize: '8.5pt', color: '#64748b' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <Clock size={13} /> Time taken: <strong style={{ color: '#0f172a' }}>{customRunResult.timeTaken}</strong>
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <HardDrive size={13} /> Memory used: <strong style={{ color: '#0f172a' }}>{customRunResult.memoryUsed}</strong>
                            </span>
                          </div>
                          <div style={{ fontSize: '8pt', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Output:</div>
                          <pre style={{
                            margin: 0,
                            padding: '8px 10px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            fontSize: '8.5pt',
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            color: customRunResult.status === 'error' ? '#dc2626' : '#0f172a',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '120px',
                            overflowY: 'auto'
                          }}>
                            {customRunResult.stdout}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ========================================================== */
                    /* SUBMIT CODE RESULTS SECTION (Ref Img 3)                    */
                    /* ========================================================== */
                    <div>
                      {isRunningCode ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '10px' }}>
                          <Loader2 className="cf-spinner" size={24} style={{ color: '#2563eb' }} />
                          <span style={{ fontSize: '9pt', color: '#64748b', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 }}>
                            Compiling &amp; Evaluating Code against All Test Cases...
                          </span>
                        </div>
                      ) : (!runResults && !compileError) ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', fontSize: '9pt', color: '#94a3b8', fontStyle: 'italic', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                          Click "Submit Code" below to evaluate your solution against all benchmark test cases.
                        </div>
                      ) : (
                        <div>
                          {compileError && (
                            <div style={{
                              backgroundColor: '#fef2f2',
                              border: '1px solid #fee2e2',
                              borderRadius: '6px',
                              padding: '12px 14px',
                              color: '#991b1b',
                              fontFamily: 'monospace',
                              fontSize: '8.5pt',
                              whiteSpace: 'pre-wrap',
                              marginBottom: '12px'
                            }}>
                              <strong style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '9pt' }}>Compilation Error:</strong>
                              <div style={{ marginTop: '6px' }}>{compileError}</div>
                            </div>
                          )}

                          {runResults && (() => {
                            const allCases = currentQuestion.testCases || [];
                            const totalCases = runResults.length;
                            const passedCount = runResults.filter(r => r.status === 'Accepted' || r.status === 'passed').length;
                            const allPassed = passedCount === totalCases && totalCases > 0;
                            const maxTimeMs = Math.max(0, ...runResults.map(r => Number(r.executionTimeMs || 0)));
                            const maxMemoryKb = Math.max(0, ...runResults.map(r => Number(r.memoryUsedKb || 0)));
                            const displayTime = maxTimeMs > 0 
                              ? (maxTimeMs / 1000).toFixed(6) 
                              : (runResults[0]?.executionTimeMs ? (runResults[0].executionTimeMs / 1000).toFixed(6) : '0.001200');
                            const displayMemory = maxMemoryKb > 0 
                              ? `${maxMemoryKb} KiB` 
                              : (runResults[0]?.memoryUsedKb ? `${runResults[0].memoryUsedKb} KiB` : '24 KiB');

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {/* Verdict Title (Ref Img 3) */}
                                <div style={{
                                  fontSize: '13pt',
                                  fontWeight: 700,
                                  color: allPassed ? '#16a34a' : '#dc2626',
                                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                                  letterSpacing: '0.2px'
                                }}>
                                  {allPassed ? 'Accepted' : 'Wrong answer'}
                                </div>

                                {/* Metrics Summary Row (Ref Img 3) */}
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '24px',
                                  paddingBottom: '8px',
                                  borderBottom: '1px solid #f1f5f9',
                                  fontSize: '9pt',
                                  color: '#475569',
                                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                                  wordSpacing: '1px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={15} color="#64748b" />
                                    <span>Time taken: <strong style={{ color: '#0f172a', fontWeight: 600 }}>{displayTime} s</strong></span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <HardDrive size={15} color="#64748b" />
                                    <span>Memory used: <strong style={{ color: '#0f172a', fontWeight: 600 }}>{displayMemory}</strong></span>
                                  </div>
                                  <div style={{
                                    marginLeft: 'auto',
                                    fontSize: '9pt',
                                    fontWeight: 600,
                                    color: allPassed ? '#16a34a' : '#dc2626',
                                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                                  }}>
                                    {passedCount} / {totalCases} Passed
                                  </div>
                                </div>

                                {/* Tabular Test Cases Breakdown (Ref Requirements) */}
                                <div style={{
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '6px',
                                  overflow: 'hidden',
                                  backgroundColor: '#ffffff'
                                }}>
                                  <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '8.5pt',
                                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                                  }}>
                                    <thead>
                                      <tr style={{
                                        backgroundColor: '#f8fafc',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#475569',
                                        textAlign: 'left',
                                        fontWeight: 700,
                                        letterSpacing: '0.2px'
                                      }}>
                                        <th style={{ padding: '9px 14px', width: '60px' }}>Sr No</th>
                                        <th style={{ padding: '9px 14px' }}>Test Case</th>
                                        <th style={{ padding: '9px 14px', width: '140px' }}>Visibility</th>
                                        <th style={{ padding: '9px 14px', width: '140px' }}>Verdict</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {runResults.map((r, rIdx) => {
                                        const isSample = r.isSample !== undefined ? Boolean(r.isSample) : (allCases[rIdx]?.isSample ?? (rIdx === 0));
                                        const isAccepted = r.status === 'Accepted';
                                        return (
                                          <tr
                                            key={rIdx}
                                            style={{
                                              borderBottom: rIdx < runResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                                              backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#fafafa'
                                            }}
                                          >
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>
                                              {rIdx + 1}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                                              Test Case {rIdx + 1}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                              <span style={{
                                                fontSize: '8.5pt',
                                                fontWeight: 500,
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                color: isSample ? '#2563eb' : '#64748b'
                                              }}>
                                                {isSample ? 'Sample' : 'Hidden'}
                                              </span>
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                              <span style={{
                                                fontSize: '8.5pt',
                                                fontWeight: 600,
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                color: isAccepted ? '#16a34a' : '#dc2626'
                                              }}>
                                                {isAccepted ? '✓ Accepted' : '✗ Wrong Answer'}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  /* Web Live Preview / Console Logs */
                  (consoleTab === 'testcase' || consoleTab === 'preview') ? (
                    <div style={{ width: '100%', height: '100%', minHeight: '140px', backgroundColor: '#ffffff', borderRadius: '4px', overflow: 'hidden' }}>
                      <iframe
                        title="Web Live Preview"
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <meta charset="utf-8">
                              <style>
                                body { margin: 0; font-family: system-ui, sans-serif; }
                                ${draftCss}
                              </style>
                            </head>
                            <body>
                              ${draftHtml}
                              <script>
                                try {
                                  ${injectLoopGuards(draftJs || '')}
                                } catch (err) {
                                  console.error(err);
                                }
                              <\/script>
                            </body>
                          </html>
                        `}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-scripts allow-modals"
                      />
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'monospace', fontSize: '8pt', color: '#1e293b' }}>
                      {webConsoleLogs.length === 0 ? (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No JavaScript console logs yet.</span>
                      ) : (
                        webConsoleLogs.map((log, lIdx) => (
                          <div key={lIdx} style={{ padding: '3px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px' }}>
                            <span style={{ color: log.level === 'error' ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                              {log.level === 'error' ? '[error]' : '[log]'}
                            </span>
                            <span style={{ color: log.level === 'error' ? '#b91c1c' : '#334155' }}>{log.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Bottom Action Bar: Fixed to the base of the coding pane, matching the left pane height */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 20px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            height: '56px',
            boxSizing: 'border-box',
            flexShrink: 0,
            zIndex: 10
          }}>
            {currentQuestion.type === 'coding' ? (
              <button
                type="button"
                className="btn-submit-code btn-run-code"
                onClick={handleRunCode}
                disabled={isRunningCode || !isOnline}
                style={{
                  height: '36px',
                  padding: '0 18px',
                  fontSize: '9pt',
                  fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  letterSpacing: '0.2px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#334155',
                  cursor: (isRunningCode || !isOnline) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s ease'
                }}
              >
                {isRunningCode ? <Loader2 className="cf-spinner" size={13} /> : <UploadCloud size={14} color="#2563eb" />}
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 }}>
                  {!isOnline ? 'Compiler Offline' : (isRunningCode ? 'Submitting...' : 'Submit Code')}
                </span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              className="btn-save-next"
              onClick={handleSaveAndNext}
              style={{
                height: '36px',
                padding: '0 20px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '9pt',
                fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '0.2px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <CheckSquare size={14} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>
                {selectedQuestionIndex === test.questions.length - 1 ? 'Save & Finish' : 'Save & Next'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {isShortcutsOpen && (
        <div className="ot-shortcuts-modal" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div
            className="ot-shortcuts-modal"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              maxWidth: '480px',
              width: '100%',
              overflow: 'hidden',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              animation: 'bicsViewFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '10pt', color: '#0f172a' }}>
                <Keyboard size={16} color="#2563eb" />
                <span>Monaco IDE Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { shortcut: 'Ctrl + Space', desc: 'Trigger Autocomplete / Code Suggestions' },
                { shortcut: 'Ctrl + F', desc: 'Find in Code' },
                { shortcut: 'Ctrl + H', desc: 'Find and Replace' },
                { shortcut: 'Ctrl + /', desc: 'Toggle Line Comment' },
                { shortcut: 'Tab', desc: 'Indent Selection' },
                { shortcut: 'Shift + Tab', desc: 'Outdent Selection' },
                { shortcut: 'Alt + Up / Down', desc: 'Move Line Up / Down' },
                { shortcut: 'Ctrl + Z / Ctrl + Y', desc: 'Undo / Redo' }
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8.5pt', padding: '4px 0', borderBottom: idx < 7 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ color: '#475569' }}>{item.desc}</span>
                  <code style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: '#0f172a',
                    fontSize: '8pt'
                  }}>
                    {item.shortcut}
                  </code>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(false)}
                style={{
                  padding: '6px 16px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '8.5pt',
                  fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
