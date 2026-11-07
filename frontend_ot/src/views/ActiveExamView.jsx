import React, { useState, useEffect, useRef } from 'react';
import { ExamHeader } from '../components/exam/ExamHeader';
import { QuestionPalette } from '../components/exam/QuestionPalette';
import { QuestionViewer } from '../components/exam/QuestionViewer';
import { CodeEditor } from '../components/exam/CodeEditor';
import { ExamProctorOverlay } from '../components/exam/ExamProctorOverlay';
import { ExamModals } from '../components/exam/ExamModals';
import { ProctorToast } from '../components/exam/ProctorToast';
import { isQuestionAnswered } from '../utils/examAnswerStatus';

/**
 * ActiveExamView: Modern edge-to-edge IDE layout with 2D resizable splitters.
 */
export const ActiveExamView = ({
  devModeActive,
  test,
  candidate,
  examTimeLeft,
  isOnline = true,
  networkQuality = 'good',
  disconnectCountdown,
  submittingExam,
  handleManualSubmitExam,
  webcamProctorWarning,
  onDismissProctorWarning,
  activeProctorToasts,
  onDismissProctorToast,
  onNetworkDropToast,
  examVideoRef,
  webcamStream,
  showQuestionPalette,
  setShowQuestionPalette,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  examAnswers,
  examAnswersRef,
  setExamAnswers,
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
  handleSaveAndNext,
  triggerCustomConfirm,
  showWarningModal,
  setShowWarningModal,
  proctoringWarnings,
  customModal,
  setCustomModal,
  isFullWebStudioOpen,
  setIsFullWebStudioOpen,
  webStudioViewportMode,
  setWebStudioViewportMode,
  webStudioConsoleOpen,
  setWebStudioConsoleOpen,
  webConsoleLogs,
  setWebConsoleLogs,
  saveServerDraft,
  activeQuestionBtnRef,
  navTrackRef,
  setTest,
  onClipboardAttempt
}) => {
  // Horizontal splitter state (Left Question Viewer width %: default 50%)
  const [leftWidthPercent, setLeftWidthPercent] = useState(50);
  const [isDraggingHorizontal, setIsDraggingHorizontal] = useState(false);
  const workspaceRef = useRef(null);

  // Horizontal resize drag listener
  useEffect(() => {
    if (!isDraggingHorizontal) return;

    const handleMouseMove = (e) => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const newPercent = (relativeX / rect.width) * 100;
      // Clamp between 25% and 75%
      const clamped = Math.max(25, Math.min(75, newPercent));
      setLeftWidthPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingHorizontal(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingHorizontal]);

  // Raise proctor toast when network connection transitions from online to offline
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (prevOnlineRef.current === true && isOnline === false) {
      if (typeof onNetworkDropToast === 'function') {
        onNetworkDropToast("Network connection offline: proctoring telemetry paused. Your work is safely cached locally.");
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, onNetworkDropToast]);

  // Atomic state persistence pipeline before question switching
  const commitAndSwitchQuestion = (targetIndex) => {
    if (targetIndex === selectedQuestionIndex) return;

    const currentQ = test?.questions?.[selectedQuestionIndex];
    const updated = [...(examAnswersRef?.current || examAnswers)];

    if (currentQ && updated[selectedQuestionIndex]) {
      // Determine if the candidate actually answered/modified the current question
      const hasAnswered = isQuestionAnswered(
        currentQ,
        updated[selectedQuestionIndex],
        {
          draftMCQ,
          draftCode,
          draftLanguage,
          draftHtml,
          draftCss,
          draftJs
        }
      );

      const isMulti = currentQ.isMultiChoice || currentQ.type === 'mcc' || currentQ.category === 'Multiple Choice';
      const selOptIndex = isMulti
        ? (Array.isArray(draftMCQ) && draftMCQ.length > 0 ? draftMCQ[0] : null)
        : (typeof draftMCQ === 'number' ? draftMCQ : null);
      const selOptIndices = isMulti
        ? (Array.isArray(draftMCQ) ? draftMCQ : (draftMCQ !== null && draftMCQ !== undefined ? [draftMCQ] : []))
        : (draftMCQ !== null && draftMCQ !== undefined ? [draftMCQ] : []);

      updated[selectedQuestionIndex] = {
        ...updated[selectedQuestionIndex],
        questionId: currentQ.id,
        type: currentQ.type,
        selectedOptionIndex: selOptIndex,
        selectedOptionIndices: selOptIndices,
        submittedCode: draftCode,
        selectedLanguage: draftLanguage,
        submittedHtml: draftHtml,
        submittedCss: draftCss,
        submittedJs: draftJs,
        isSavedByUser: hasAnswered
      };
    }

    if (examAnswersRef) {
      examAnswersRef.current = updated;
    }
    if (typeof setExamAnswers === 'function') {
      setExamAnswers(updated);
    }
    if (typeof saveServerDraft === 'function') {
      saveServerDraft(updated);
    }

    setSelectedQuestionIndex(targetIndex);
  };

  return (
    <div 
      onCopy={(e) => { e.preventDefault(); onClipboardAttempt?.('copy'); }}
      onCut={(e) => { e.preventDefault(); onClipboardAttempt?.('cut'); }}
      onPaste={(e) => { e.preventDefault(); onClipboardAttempt?.('paste'); }}
      onContextMenu={(e) => { e.preventDefault(); }}
      style={{ 
        height: '100%', 
        width: '100%',
        display: 'flex', 
        flexDirection: 'column', 
        backgroundColor: '#ffffff', 
        padding: 0, 
        margin: 0, 
        overflow: 'hidden', 
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      {/* Subtle Visual Space Above Floating Header (Ref User Request 1) */}
      <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }} />

      {/* 1. Top Floating Header Card */}
      <ExamHeader
        test={test}
        candidate={candidate}
        examTimeLeft={examTimeLeft}
        isOnline={isOnline}
        networkQuality={networkQuality}
        disconnectCountdown={disconnectCountdown}
        submittingExam={submittingExam}
        handleManualSubmitExam={handleManualSubmitExam}
        devModeActive={devModeActive}
        examAnswers={examAnswers}
      />

      {/* Subtle Visual Space Between Floating Header and Workspace Panels (Ref Img 1) */}
      <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }} />

      {/* 2. Main Edge-to-Edge Split Workspace with Horizontal Resizing */}
      <div 
        ref={workspaceRef}
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#ffffff'
        }}
      >
        {/* Question Navigation Matrix Popover */}
        <QuestionPalette
          test={test}
          examAnswers={examAnswers}
          selectedQuestionIndex={selectedQuestionIndex}
          setSelectedQuestionIndex={setSelectedQuestionIndex}
          onNavigate={commitAndSwitchQuestion}
          showQuestionPalette={showQuestionPalette}
          setShowQuestionPalette={setShowQuestionPalette}
          draftMCQ={draftMCQ}
          draftCode={draftCode}
          draftLanguage={draftLanguage}
          draftHtml={draftHtml}
          draftCss={draftCss}
          draftJs={draftJs}
        />

        {/* Left Pane: Question Description, LaTeX Math, and Navigation Track */}
        <div style={{
          width: `calc(${leftWidthPercent}% - 3px)`,
          minWidth: '25%',
          maxWidth: '75%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: isDraggingHorizontal ? 'none' : 'auto'
        }}>
          <QuestionViewer
            test={test}
            candidate={candidate}
            selectedQuestionIndex={selectedQuestionIndex}
            setSelectedQuestionIndex={setSelectedQuestionIndex}
            onNavigate={commitAndSwitchQuestion}
            setShowQuestionPalette={setShowQuestionPalette}
            examAnswers={examAnswers}
            setTest={setTest}
            activeQuestionBtnRef={activeQuestionBtnRef}
            navTrackRef={navTrackRef}
            draftMCQ={draftMCQ}
            draftCode={draftCode}
            draftLanguage={draftLanguage}
            draftHtml={draftHtml}
            draftCss={draftCss}
            draftJs={draftJs}
          />
        </div>

        {/* Horizontal Splitter Gutter */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingHorizontal(true);
          }}
          style={{
            width: '6px',
            height: '100%',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDraggingHorizontal ? '#eff6ff' : '#f8fafc',
            borderLeft: '1px solid #e2e8f0',
            borderRight: '1px solid #e2e8f0',
            userSelect: 'none',
            flexShrink: 0,
            zIndex: 20,
            transition: 'background-color 0.15s ease'
          }}
          title="Drag left or right to resize Problem and Workspace"
        >
          <div style={{
            width: '2px',
            height: '24px',
            backgroundColor: isDraggingHorizontal ? '#2563eb' : '#cbd5e1',
            borderRadius: '2px',
            transition: 'background-color 0.15s ease'
          }} />
        </div>

        {/* Right Pane: MCQ Options or Monaco Code Editor & Live Console */}
        <div style={{
          width: `calc(${100 - leftWidthPercent}% - 3px)`,
          minWidth: '25%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: isDraggingHorizontal ? 'none' : 'auto'
        }}>
          <CodeEditor
            test={test}
            candidate={candidate}
            selectedQuestionIndex={selectedQuestionIndex}
            examAnswers={examAnswers}
            setExamAnswers={setExamAnswers}
            examAnswersRef={examAnswersRef}
            saveServerDraft={saveServerDraft}
            draftMCQ={draftMCQ}
            setDraftMCQ={setDraftMCQ}
            draftCode={draftCode}
            setDraftCode={setDraftCode}
            draftLanguage={draftLanguage}
            draftQIdx={draftQIdx}
            setDraftQIdx={setDraftQIdx}
            handleLanguageChange={handleLanguageChange}
            webActiveTab={webActiveTab}
            setWebActiveTab={setWebActiveTab}
            draftHtml={draftHtml}
            setDraftHtml={setDraftHtml}
            draftCss={draftCss}
            setDraftCss={setDraftCss}
            draftJs={draftJs}
            setDraftJs={setDraftJs}
            consoleTab={consoleTab}
            setConsoleTab={setConsoleTab}
            isRunningCode={isRunningCode}
            handleRunCode={handleRunCode}
            runResults={runResults}
            compileError={compileError}
            isOnline={isOnline}
            handleSaveAndNext={handleSaveAndNext}
            triggerCustomConfirm={triggerCustomConfirm}
            setIsFullWebStudioOpen={setIsFullWebStudioOpen}
            webConsoleLogs={webConsoleLogs}
            onClipboardAttempt={onClipboardAttempt}
          />
        </div>
      </div>

      {/* Subtle Visual Space Below the Base of the Window */}
      <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderTop: '1px solid #e2e8f0', flexShrink: 0 }} />

      {/* 3. Background video tracker & proctor alert modals */}
      <ExamProctorOverlay
        examVideoRef={examVideoRef}
        webcamStream={webcamStream}
        showWarningModal={showWarningModal}
        setShowWarningModal={setShowWarningModal}
        proctoringWarnings={proctoringWarnings}
        customModal={customModal}
        setCustomModal={setCustomModal}
        devModeActive={devModeActive}
      />

      {/* 4. Full Web Studio modal and Submission screen loader */}
      <ExamModals
        isFullWebStudioOpen={isFullWebStudioOpen}
        setIsFullWebStudioOpen={setIsFullWebStudioOpen}
        test={test}
        selectedQuestionIndex={selectedQuestionIndex}
        webActiveTab={webActiveTab}
        setWebActiveTab={setWebActiveTab}
        webStudioViewportMode={webStudioViewportMode}
        setWebStudioViewportMode={setWebStudioViewportMode}
        webStudioConsoleOpen={webStudioConsoleOpen}
        setWebStudioConsoleOpen={setWebStudioConsoleOpen}
        webConsoleLogs={webConsoleLogs}
        setWebConsoleLogs={setWebConsoleLogs}
        examAnswers={examAnswers}
        setExamAnswers={setExamAnswers}
        draftQIdx={draftQIdx}
        setDraftQIdx={setDraftQIdx}
        draftHtml={draftHtml}
        setDraftHtml={setDraftHtml}
        draftCss={draftCss}
        setDraftCss={setDraftCss}
        draftJs={draftJs}
        setDraftJs={setDraftJs}
        submittingExam={submittingExam}
        onClipboardAttempt={onClipboardAttempt}
      />

      {/* 5. Bottom Right Floating Proctor Warning Toast */}
      <ProctorToast
        toasts={activeProctorToasts}
        message={webcamProctorWarning}
        onDismiss={onDismissProctorWarning}
        onDismissToast={onDismissProctorToast}
      />
    </div>
  );
};
