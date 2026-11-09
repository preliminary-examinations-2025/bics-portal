import React, { useEffect } from 'react';
import { Grid } from 'lucide-react';
import { RichText } from '../common/RichText';
import { CandidateWatermark } from '../common/CandidateWatermark';
import { DEFAULT_TEMPLATES } from '../../config/constants';
import { isQuestionAnswered as checkIsAnswered } from '../../utils/examAnswerStatus';

/**
 * QuestionViewer: Displays the left pane of the active exam, including question prompt,
 * description, test cases table, diagram context, and bottom question navigation track.
 */
export const QuestionViewer = ({
  test,
  candidate,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  onNavigate,
  setShowQuestionPalette,
  examAnswers,
  setTest,
  activeQuestionBtnRef,
  navTrackRef,
  draftQIdx,
  draftMCQ,
  draftCode,
  draftLanguage,
  draftHtml,
  draftCss,
  draftJs
}) => {
  const currentQuestion = test?.questions?.[selectedQuestionIndex];

  const navigateTo = (idx) => {
    if (typeof onNavigate === 'function') {
      onNavigate(idx);
    } else {
      setSelectedQuestionIndex(idx);
    }
  };

  const isQuestionAnswered = (q, qIdx) => {
    const ans = examAnswers[qIdx];
    const isCurrent =
      qIdx === selectedQuestionIndex &&
      (draftQIdx === undefined || draftQIdx === selectedQuestionIndex);
    const drafts = isCurrent ? {
      draftMCQ,
      draftCode,
      draftLanguage,
      draftHtml,
      draftCss,
      draftJs
    } : {};
    return checkIsAnswered(q, ans, drafts);
  };

  // Auto-scroll active question button into view centered within the navigation track
  useEffect(() => {
    if (activeQuestionBtnRef?.current && navTrackRef?.current) {
      const btn = activeQuestionBtnRef.current;
      const track = navTrackRef.current;
      const btnLeft = btn.offsetLeft;
      const btnWidth = btn.offsetWidth;
      const trackWidth = track.clientWidth;
      const targetScrollLeft = btnLeft - (trackWidth / 2) + (btnWidth / 2);

      track.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      });
    }
  }, [selectedQuestionIndex]);

  if (!currentQuestion) return null;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      position: 'relative',
      padding: 0,
      margin: 0,
      boxSizing: 'border-box'
    }}>
      <CandidateWatermark email={candidate?.email || candidate?.studentId || candidate?.name} />
      
      {/* 1. Fixed Header with Question Index, Section Name (Ref Img 3), Category and Points */}
      <div style={{
        height: '56px',
        minHeight: '56px',
        maxHeight: '56px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 20px',
        zIndex: 11,
        gap: '10px',
        flexWrap: 'nowrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Question Index with generous word and letter spacing (Ref Img 1) */}
          <h4 style={{
            color: '#0f172a',
            fontWeight: 600,
            fontSize: '11pt',
            margin: 0,
            whiteSpace: 'nowrap',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            letterSpacing: '0.4px',
            wordSpacing: '4px'
          }}>
            Question {selectedQuestionIndex + 1} of {test.questions.length}
          </h4>

          {/* Section Pill (Ref Img 3) */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#f1f5f9',
            color: '#1e293b',
            borderRadius: '14px',
            padding: '3px 12px',
            fontSize: '8.5pt',
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            whiteSpace: 'nowrap'
          }}>
            Section: {currentQuestion.section || currentQuestion.sectionName || (currentQuestion.type === 'coding' ? 'Easy-c-moca' : (currentQuestion.type === 'web' ? 'Web Studio' : 'General Aptitude'))}
          </span>

          {/* Question Category / Type Tag next to Section */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#f1f5f9',
            color: '#475569',
            borderRadius: '14px',
            padding: '3px 12px',
            fontSize: '8.5pt',
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            whiteSpace: 'nowrap'
          }}>
            {currentQuestion.category || (currentQuestion.type === 'coding' ? 'Programming' : (currentQuestion.type === 'web' ? 'Web Development' : ((currentQuestion.isMultiChoice || currentQuestion.type === 'mcc') ? 'Multiple Choice' : 'Single Choice')))}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            title={`Full score for this question: ${Number(currentQuestion.points || 0).toFixed(2)}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
              userSelect: 'none',
              cursor: 'help'
            }}
          >
            <svg width="18px" height="18px" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="#9CA3AF" strokeWidth="2" />
              <path d="M12 7l1.5 3.5h3.5l-2.8 2.3L15 16.5l-3-2.2-3 2.2 1.3-3.7L7.5 10.5h3.5L12 7z" stroke="#4B5563" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '10pt',
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '0.2px'
            }}>
              {Number(currentQuestion.points || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Question Content Body with comfortable typography & smooth transition */}
      <div 
        key={`q-body-${selectedQuestionIndex}`}
        className="ot-question-content-transition"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '16px 20px',
          fontSize: '10pt',
          lineHeight: '1.65',
          color: '#334155'
        }}>
        {/* Question Title Header: Prominently sized in Plus Jakarta Sans */}
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
          .cf-question-title-text,
          .cf-question-title-text * {
            font-family: 'Plus Jakarta Sans', sans-serif !important;
          }
          .cf-question-title-text,
          .cf-question-title-text .cf-paragraph,
          .cf-question-title-text .cf-paragraph div,
          .cf-question-title-text div {
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            font-size: 15pt !important;
            font-weight: 700 !important;
            color: #0f172a !important;
            line-height: 1.35 !important;
            letter-spacing: -0.2px !important;
            margin: 0 !important;
            padding: 0 !important;
            text-align: left !important;
            text-align-last: left !important;
          }
          .cf-question-title-text .katex,
          .cf-question-title-text .katex * {
            font-family: KaTeX_Main, 'Times New Roman', serif !important;
          }
        `}</style>
        <div style={{ zIndex: 11, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <RichText
              text={currentQuestion.title || `Question ${selectedQuestionIndex + 1}`}
              className="cf-question-title-text"
              style={{
                fontSize: '15pt',
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: '1.35',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '-0.2px'
              }}
            />
          </div>
        </div>

        {/* MCQ Questions Rendering: Question statement FIRST, prompt guidance AFTER question ends */}
        {(currentQuestion.type === 'mcq' || currentQuestion.type === 'scc' || currentQuestion.type === 'mcc') && (
          <div style={{ zIndex: 11, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {(currentQuestion.description || currentQuestion.questionText || currentQuestion.statement) && (
              <div style={{ fontSize: '10pt', lineHeight: '1.7', color: '#334155' }}>
                <RichText
                  text={currentQuestion.description || currentQuestion.questionText || currentQuestion.statement}
                />
              </div>
            )}
            <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '5px', marginTop: '2px' }}>
              <RichText
                text={
                  (currentQuestion.isMultiChoice || currentQuestion.type === 'mcc' || currentQuestion.category === 'Multiple Choice')
                    ? "Select one or more correct options from the right workspace panel."
                    : "Select the correct response option from the right workspace panel."
                }
                style={{ fontSize: '9pt', color: '#64748b', lineHeight: '1.45', fontStyle: 'italic' }}
              />
            </div>
          </div>
        )}

        {currentQuestion.imageUrl && (
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', backgroundColor: '#fff', textAlign: 'center', zIndex: 11 }}>
            <img
              src={currentQuestion.imageUrl}
              alt="Question Diagram Context"
              style={{ maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '2px' }}
            />
          </div>
        )}

        {/* Coding & Web questions: Render description in blue container */}
        {currentQuestion.type !== 'mcq' && currentQuestion.type !== 'scc' && currentQuestion.type !== 'mcc' && (
          <div style={{ zIndex: 11, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ backgroundColor: '#f0f9ff', padding: '16px', border: '1px solid #bae6fd', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <RichText
                text={currentQuestion.description || currentQuestion.questionText || ''}
                style={{ fontSize: '10pt', color: '#0f172a', lineHeight: '1.7' }}
              />
            </div>

            {currentQuestion.testCases?.length > 0 && (
              <div>
                <h5 style={{ fontSize: '9pt', color: '#002147', fontWeight: 'bold', marginBottom: '6px' }}>Example Inputs &amp; Outputs:</h5>
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  <table className="cf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', border: '1px solid #cbd5e1' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <th style={{ textAlign: 'left', width: '22%', padding: '6px 10px', border: '1px solid #cbd5e1' }}>Test Case</th>
                        <th style={{ textAlign: 'left', width: '39%', padding: '6px 10px', border: '1px solid #cbd5e1' }}>Sample Input</th>
                        <th style={{ textAlign: 'left', width: '39%', padding: '6px 10px', border: '1px solid #cbd5e1' }}>Expected Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentQuestion.testCases || []).map((tc, tcIdx) => (
                        <tr key={tcIdx}>
                          <td style={{ padding: '6px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}>
                            Test Case {tcIdx + 1}
                          </td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}>{tc.input}</td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}>{tc.output}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Fixed Bottom Navigation Footer - Base aligned at exactly 56px height to match right pane */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid #e2e8f0',
        padding: '10px 20px',
        marginTop: 'auto',
        height: '56px',
        boxSizing: 'border-box',
        flexWrap: 'nowrap',
        gap: '8px',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: '#ffffff'
      }}>
        <button
          className="cf-btn-secondary"
          disabled={selectedQuestionIndex === 0}
          onClick={() => navigateTo(selectedQuestionIndex - 1)}
          style={{
            padding: '7px 12px',
            fontSize: '9pt',
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            flexShrink: 0,
            whiteSpace: 'nowrap',
            borderRadius: '5px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            cursor: selectedQuestionIndex === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          ← Previous
        </button>
        
        <div 
          ref={navTrackRef}
          style={{ 
            display: 'flex', 
            gap: '6px', 
            overflowX: 'auto', 
            flex: 1, 
            padding: '2px 0', 
            alignItems: 'center',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {test.questions.map((q, qIdx) => {
            const isAnswered = isQuestionAnswered(q, qIdx);
            const isActive = selectedQuestionIndex === qIdx;

            let bgColor = '#fff';
            let textColor = '#64748b';
            let borderColor = '#cbd5e1';

            if (isActive) {
              bgColor = isAnswered ? '#dcfce7' : '#dbeafe';
              textColor = isAnswered ? '#15803d' : '#1d4ed8';
              borderColor = isAnswered ? '#16a34a' : '#2563eb';
            } else if (isAnswered) {
              bgColor = '#dcfce7';
              textColor = '#15803d';
              borderColor = '#86efac';
            }

            return (
              <button
                key={qIdx}
                ref={isActive ? activeQuestionBtnRef : null}
                onClick={() => navigateTo(qIdx)}
                style={{
                  minWidth: '32px',
                  height: '32px',
                  padding: '0 4px',
                  fontSize: '9pt',
                  fontWeight: isActive ? 700 : 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  backgroundColor: bgColor,
                  color: textColor,
                  border: isActive ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                  borderRadius: '5px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s'
                }}
                title={`Question ${qIdx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}`}
              >
                {qIdx + 1}
              </button>
            );
          })}
        </div>

        <button
          className="cf-btn-secondary"
          onClick={() => setShowQuestionPalette(true)}
          style={{
            padding: '6px 10px',
            fontSize: '9pt',
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
            borderRadius: '5px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            cursor: 'pointer'
          }}
          title="Question Overview Grid"
        >
          <Grid size={13} />
          <span>Grid</span>
        </button>

        <button
          className="cf-btn-secondary"
          disabled={selectedQuestionIndex === test.questions.length - 1}
          onClick={() => navigateTo(selectedQuestionIndex + 1)}
          style={{
            padding: '7px 12px',
            fontSize: '9pt',
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            flexShrink: 0,
            whiteSpace: 'nowrap',
            borderRadius: '5px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            cursor: selectedQuestionIndex === test.questions.length - 1 ? 'not-allowed' : 'pointer'
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
};
