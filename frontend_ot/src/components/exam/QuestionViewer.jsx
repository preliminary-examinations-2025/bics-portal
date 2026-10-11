import React from 'react';
import { CheckSquare, Flag, HelpCircle, Grid } from 'lucide-react';
import { RichText } from '../common/RichText';
import { CandidateWatermark } from '../common/CandidateWatermark';
import { DEFAULT_TEMPLATES } from '../../config/constants';

/**
 * QuestionViewer: Displays the left pane of the active exam, including question prompt,
 * description, test cases table, diagram context, and bottom question navigation track.
 */
export const QuestionViewer = ({
  test,
  candidate,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  isSidebarOpen,
  setIsSidebarOpen,
  setShowQuestionPalette,
  setShowQuestionInfoModal,
  examAnswers,
  setTest,
  activeQuestionBtnRef,
  navTrackRef
}) => {
  const currentQuestion = test?.questions?.[selectedQuestionIndex];
  if (!currentQuestion) return null;

  const isFlagged = currentQuestion.flaggedForReview || false;

  const cleanStr = (str) => (str || '').replace(/\r\n/g, '\n').trim();

  return (
    <div className="cf-card" style={{ flex: '0 0 calc(50% - 10px)', margin: 0, height: '100%', maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <CandidateWatermark email={candidate?.email || candidate?.studentId || candidate?.name} />
      
      {/* 1. Fixed Header */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3b5998', paddingBottom: '8px', zIndex: 11, marginBottom: '10px' }}>
        <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>
          Question {selectedQuestionIndex + 1} of {test.questions.length}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              fontSize: '8.5pt',
              fontWeight: 'bold',
              backgroundColor: isSidebarOpen ? '#faf5ff' : '#ffffff',
              border: isSidebarOpen ? '2px solid #a855f7' : '1px solid #cbd5e1',
              color: '#7e22ce',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              margin: 0
            }}
            title={isSidebarOpen ? "Close Questions Panel" : "Open Questions Panel"}
          >
            <CheckSquare size={13} style={{ color: '#7e22ce' }} />
            <span>Questions Panel</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              const updatedQuestions = [...test.questions];
              updatedQuestions[selectedQuestionIndex].flaggedForReview = !isFlagged;
              setTest({ ...test, questions: updatedQuestions });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '8.5pt',
              fontWeight: 'bold',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              border: '1px solid #c084fc',
              backgroundColor: isFlagged ? '#a855f7' : '#ffffff',
              color: isFlagged ? '#ffffff' : '#7e22ce',
              transition: 'all 0.2s ease-in-out',
              margin: 0
            }}
            title={isFlagged ? "Remove Flag" : "Flag for Review"}
          >
            <Flag size={13} fill={isFlagged ? '#ffffff' : 'none'} style={{ color: isFlagged ? '#ffffff' : '#7e22ce' }} />
            <span>{isFlagged ? 'Flagged for Review' : 'Flag for Review'}</span>
          </button>

          <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '8pt', fontWeight: 'bold' }}>
            POINTS: {currentQuestion.points || 0}
          </span>
        </div>
      </div>

      {/* 2. Scrollable Question Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '15px', paddingRight: '4px', marginBottom: '10px' }}>
        {/* Question Title Header */}
        <div style={{ zIndex: 11, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RichText
              text={currentQuestion.title || `Question ${selectedQuestionIndex + 1}`}
              style={{ fontSize: '13pt', fontWeight: 'bold', color: '#0f172a', lineHeight: '1.4' }}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowQuestionInfoModal(true)}
            title="View Question Instructions & Evaluation Criteria"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 12px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '20px',
              color: '#0284c7',
              fontSize: '8.5pt',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <HelpCircle size={14} style={{ color: '#0284c7' }} />
            <span>Question Info</span>
          </button>
        </div>

        {/* MCQ Questions Rendering */}
        {currentQuestion.type === 'mcq' && (
          <div style={{ zIndex: 11, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
              <RichText
                text="Select the correct response option from the right workspace panel."
                style={{ fontSize: '8.5pt', color: '#64748b', lineHeight: '1.4', fontStyle: 'italic' }}
              />
            </div>
            <RichText
              text={currentQuestion.questionText || currentQuestion.description || ''}
              style={{ fontSize: '10.5pt', color: '#1e293b', lineHeight: '1.75', padding: '4px 0' }}
            />
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
        {currentQuestion.type !== 'mcq' && (
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
                      {currentQuestion.testCases.slice(0, 2).map((tc, tcIdx) => (
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

      {/* 3. Fixed Bottom Navigation Footer */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: 'auto', alignItems: 'center', flexWrap: 'nowrap', gap: '8px', width: '100%', overflow: 'hidden' }}>
        <button
          className="cf-btn-secondary"
          disabled={selectedQuestionIndex === 0}
          onClick={() => setSelectedQuestionIndex(selectedQuestionIndex - 1)}
          style={{ padding: '6px 10px', fontSize: '9pt', flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          ← Previous
        </button>
        
        <div 
          ref={navTrackRef}
          style={{ 
            display: 'flex', 
            gap: '5px', 
            overflowX: 'auto', 
            flex: 1, 
            padding: '2px 0', 
            alignItems: 'center',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {test.questions.map((q, qIdx) => {
            const ans = examAnswers[qIdx];
            let isAnswered = false;

            if (ans && ans.isSavedByUser) {
              if (q.type === 'mcq') {
                isAnswered = ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== undefined;
              } else if (q.type === 'coding') {
                const curCode = cleanStr(ans.submittedCode);
                const initC1 = cleanStr(q.initialTemplate);
                const initC2 = cleanStr(DEFAULT_TEMPLATES[ans.selectedLanguage || 'cpp']);
                isAnswered = curCode !== '' && curCode !== initC1 && curCode !== initC2;
              } else if (q.type === 'web') {
                const curHtml = cleanStr(ans.submittedHtml);
                const initH1 = cleanStr(q.initialHtml);
                const initH2 = cleanStr(q.initialCode?.html);

                const curCss = cleanStr(ans.submittedCss);
                const initC1 = cleanStr(q.initialCss);
                const initC2 = cleanStr(q.initialCode?.css);

                const curJs = cleanStr(ans.submittedJs);
                const initJ1 = cleanStr(q.initialJs);
                const initJ2 = cleanStr(q.initialCode?.js);

                const htmlMod = curHtml !== '' && curHtml !== initH1 && curHtml !== initH2;
                const cssMod = curCss !== '' && curCss !== initC1 && curCss !== initC2;
                const jsMod = curJs !== '' && curJs !== initJ1 && curJs !== initJ2;

                isAnswered = htmlMod || cssMod || jsMod;
              }
            }

            const isActive = selectedQuestionIndex === qIdx;

            let bgColor = '#fff';
            let textColor = '#64748b';
            let borderColor = '#cbd5e1';

            if (isActive) {
              bgColor = isAnswered ? '#16a34a' : '#3b5998';
              textColor = '#fff';
              borderColor = isAnswered ? '#16a34a' : '#3b5998';
            } else if (isAnswered) {
              bgColor = '#dcfce7';
              textColor = '#15803d';
              borderColor = '#86efac';
            }

            return (
              <button
                key={qIdx}
                ref={isActive ? activeQuestionBtnRef : null}
                onClick={() => setSelectedQuestionIndex(qIdx)}
                style={{
                  minWidth: '32px',
                  height: '32px',
                  padding: '0 6px',
                  fontSize: '9pt',
                  fontWeight: isActive ? 'bold' : 'normal',
                  backgroundColor: bgColor,
                  color: textColor,
                  border: isActive ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                  borderRadius: '4px',
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
            padding: '6px 8px',
            fontSize: '9pt',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap'
          }}
          title="Question Overview Palette"
        >
          <Grid size={14} />
          <span>Grid</span>
        </button>

        <button
          className="cf-btn-secondary"
          disabled={selectedQuestionIndex === test.questions.length - 1}
          onClick={() => setSelectedQuestionIndex(selectedQuestionIndex + 1)}
          style={{ padding: '6px 10px', fontSize: '9pt', flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          Next →
        </button>
      </div>
    </div>
  );
};
