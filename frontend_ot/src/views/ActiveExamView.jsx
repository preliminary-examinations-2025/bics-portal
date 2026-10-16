import React from 'react';
import { ExamHeader } from '../components/exam/ExamHeader';
import { QuestionPalette } from '../components/exam/QuestionPalette';
import { QuestionViewer } from '../components/exam/QuestionViewer';
import { CodeEditor } from '../components/exam/CodeEditor';
import { ExamProctorOverlay } from '../components/exam/ExamProctorOverlay';
import { ExamModals } from '../components/exam/ExamModals';
import { ProctorToast } from '../components/exam/ProctorToast';

/**
 * ActiveExamView: Assembles all subcomponents of the active proctored examination workspace.
 */
export const ActiveExamView = ({
  test,
  candidate,
  examTimeLeft,
  isOnline,
  submittingExam,
  handleManualSubmitExam,
  webcamProctorWarning,
  onDismissProctorWarning,
  examVideoRef,
  isSidebarOpen,
  setIsSidebarOpen,
  showQuestionPalette,
  setShowQuestionPalette,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  examAnswers,
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
  showQuestionInfoModal,
  setShowQuestionInfoModal,
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
  return (
    <div 
      onCopy={(e) => { e.preventDefault(); onClipboardAttempt?.('copy'); }}
      onCut={(e) => { e.preventDefault(); onClipboardAttempt?.('cut'); }}
      onPaste={(e) => { e.preventDefault(); onClipboardAttempt?.('paste'); }}
      onContextMenu={(e) => { e.preventDefault(); }}
      style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundColor: '#f8fafc', 
        padding: '20px', 
        gap: '20px', 
        overflow: 'hidden', 
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      
      {/* 1. Top floating status bar & proctor banner */}
      <ExamHeader
        test={test}
        candidate={candidate}
        examTimeLeft={examTimeLeft}
        isOnline={isOnline}
        submittingExam={submittingExam}
        handleManualSubmitExam={handleManualSubmitExam}
        webcamProctorWarning={webcamProctorWarning}
      />

      {/* 2. Main split workspace layout */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        
        {/* Floating Side Drawer Questions Panel & Navigation Matrix Popover */}
        <QuestionPalette
          test={test}
          examAnswers={examAnswers}
          selectedQuestionIndex={selectedQuestionIndex}
          setSelectedQuestionIndex={setSelectedQuestionIndex}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          showQuestionPalette={showQuestionPalette}
          setShowQuestionPalette={setShowQuestionPalette}
          draftMCQ={draftMCQ}
          draftCode={draftCode}
          draftLanguage={draftLanguage}
          draftHtml={draftHtml}
          draftCss={draftCss}
          draftJs={draftJs}
          setExamAnswers={setExamAnswers}
          saveServerDraft={saveServerDraft}
        />

        {/* Left Pane: Question Description, LaTeX Math, and Navigation Track */}
        <QuestionViewer
          test={test}
          candidate={candidate}
          selectedQuestionIndex={selectedQuestionIndex}
          setSelectedQuestionIndex={setSelectedQuestionIndex}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          setShowQuestionPalette={setShowQuestionPalette}
          setShowQuestionInfoModal={setShowQuestionInfoModal}
          examAnswers={examAnswers}
          setTest={setTest}
          activeQuestionBtnRef={activeQuestionBtnRef}
          navTrackRef={navTrackRef}
        />

        {/* Right Pane: MCQ Options or Monaco Code Editor & Live Console */}
        <CodeEditor
          test={test}
          selectedQuestionIndex={selectedQuestionIndex}
          examAnswers={examAnswers}
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

      {/* 3. Background video tracker & proctor alert modals */}
      <ExamProctorOverlay
        examVideoRef={examVideoRef}
        showWarningModal={showWarningModal}
        setShowWarningModal={setShowWarningModal}
        proctoringWarnings={proctoringWarnings}
        customModal={customModal}
        setCustomModal={setCustomModal}
      />

      {/* 4. Full Web Studio modal, Question Info guidelines modal, and Submission screen loader */}
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
        showQuestionInfoModal={showQuestionInfoModal}
        setShowQuestionInfoModal={setShowQuestionInfoModal}
        submittingExam={submittingExam}
        onClipboardAttempt={onClipboardAttempt}
      />

      {/* 5. Bottom Right Floating Proctor Warning Toast (Reference Design) */}
      <ProctorToast
        message={webcamProctorWarning}
        onDismiss={onDismissProctorWarning}
      />
    </div>
  );
};
