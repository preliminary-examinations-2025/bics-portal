import React from 'react';
import { Grid } from 'lucide-react';
import { DEFAULT_TEMPLATES } from '../../config/constants';
import { isQuestionAnswered as checkIsAnswered } from '../../utils/examAnswerStatus';

/**
 * QuestionPalette: Contains the popup Question Navigation Matrix modal.
 */
export const QuestionPalette = ({
  test,
  examAnswers,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  onNavigate,
  showQuestionPalette,
  setShowQuestionPalette,
  draftQIdx,
  draftMCQ,
  draftCode,
  draftLanguage,
  draftHtml,
  draftCss,
  draftJs
}) => {
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

  return (
    <>
      {/* Question Overview Grid Popover Modal */}
      {showQuestionPalette && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px'
          }} 
          onClick={() => setShowQuestionPalette(false)}
        >
          <div 
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '11pt', color: '#002147', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Grid size={16} style={{ color: '#3b5998' }} />
                <span>Question Navigation Matrix ({test?.questions?.length || 0} Items)</span>
              </h3>
              <button 
                onClick={() => setShowQuestionPalette(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12pt', color: '#64748b', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            {/* Status Legend */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '8.5pt', color: '#475569', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#dbeafe', border: '1px solid #2563eb', borderRadius: '2px', display: 'inline-block' }}></span>
                <span>Active</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '2px', display: 'inline-block' }}></span>
                <span>Answered</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '2px', display: 'inline-block' }}></span>
                <span>Unanswered</span>
              </div>
            </div>

            {/* Question Grid Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))', gap: '8px', maxHeight: '320px', overflowY: 'auto', padding: '2px' }}>
              {test?.questions?.map((q, qIdx) => {
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
                    onClick={() => {
                      if (typeof onNavigate === 'function') {
                        onNavigate(qIdx);
                      } else {
                        setSelectedQuestionIndex(qIdx);
                      }
                      setShowQuestionPalette(false);
                    }}
                    style={{
                      height: '38px',
                      fontSize: '9pt',
                      fontWeight: isActive ? 'bold' : 'normal',
                      backgroundColor: bgColor,
                      color: textColor,
                      border: isActive ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    title={`Jump to Question ${qIdx + 1} (${isAnswered ? 'Answered' : 'Unanswered'})`}
                  >
                    {qIdx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
