import React from 'react';
import { X, Grid } from 'lucide-react';
import { DEFAULT_TEMPLATES } from '../../config/constants';

/**
 * QuestionPalette: Contains both the side drawer questions panel and the popup matrix grid modal.
 */
export const QuestionPalette = ({
  test,
  examAnswers,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  isSidebarOpen,
  setIsSidebarOpen,
  showQuestionPalette,
  setShowQuestionPalette,
  draftMCQ,
  draftCode,
  draftLanguage,
  draftHtml,
  draftCss,
  draftJs,
  setExamAnswers,
  saveServerDraft
}) => {
  const cleanStr = (str) => (str || '').replace(/\r\n/g, '\n').trim();

  const isQuestionAnswered = (q, qIdx) => {
    const ans = examAnswers[qIdx];
    if (!ans) return false;

    if (q.type === 'mcq') {
      return qIdx === selectedQuestionIndex
        ? (draftMCQ !== null && draftMCQ !== undefined)
        : (ans?.selectedOptionIndex !== null && ans?.selectedOptionIndex !== undefined);
    } else if (q.type === 'web') {
      const initHtml = cleanStr(q.initialHtml || q.initialCode?.html || '');
      const initCss = cleanStr(q.initialCss || q.initialCode?.css || '');
      const initJs = cleanStr(q.initialJs || q.initialCode?.js || '');

      if (qIdx === selectedQuestionIndex) {
        return (cleanStr(draftHtml) !== initHtml || cleanStr(draftCss) !== initCss || cleanStr(draftJs) !== initJs);
      } else {
        const curHtml = cleanStr(ans.submittedHtml);
        const curCss = cleanStr(ans.submittedCss);
        const curJs = cleanStr(ans.submittedJs);
        return (curHtml !== '' && curHtml !== initHtml) || (curCss !== '' && curCss !== initCss) || (curJs !== '' && curJs !== initJs);
      }
    } else {
      const initCode = cleanStr(q.initialTemplate || DEFAULT_TEMPLATES[ans?.selectedLanguage || 'cpp']);
      if (qIdx === selectedQuestionIndex) {
        return (draftCode && cleanStr(draftCode).length > 0 && cleanStr(draftCode) !== initCode);
      } else {
        return (ans?.submittedCode && cleanStr(ans.submittedCode).length > 0 && cleanStr(ans.submittedCode) !== initCode);
      }
    }
  };

  const handleSelectQuestion = (targetIndex) => {
    // Sync current changes before switching
    const updated = [...examAnswers];
    updated[selectedQuestionIndex] = {
      ...updated[selectedQuestionIndex],
      selectedOptionIndex: draftMCQ,
      submittedCode: draftCode,
      selectedLanguage: draftLanguage,
      submittedHtml: draftHtml,
      submittedCss: draftCss,
      submittedJs: draftJs
    };
    setExamAnswers(updated);
    if (saveServerDraft) saveServerDraft(updated);
    setSelectedQuestionIndex(targetIndex);
  };

  return (
    <>
      {/* Floating Side Drawer Questions Panel */}
      {isSidebarOpen && (
        <div className="cf-card" style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          width: '280px',
          maxHeight: 'calc(100% - 30px)',
          margin: 0,
          padding: '15px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          zIndex: 1500,
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          borderRadius: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
            <h4 style={{ color: '#002147', fontWeight: 'bold', fontSize: '9.5pt', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions Panel</h4>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', margin: 0, padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Group questions by section */}
          {(() => {
            const groups = {};
            (test?.questions || []).forEach((q, idx) => {
              const sec = q.section || 'General Questions';
              if (!groups[sec]) groups[sec] = [];
              groups[sec].push({ ...q, originalIndex: idx });
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {Object.entries(groups).map(([sectionTitle, list]) => {
                  if (list.length === 0) return null;
                  return (
                    <div key={sectionTitle} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <h5 style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 'bold', margin: '5px 0 2px 0' }}>{sectionTitle}</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {list.map((q) => {
                          const isCurrent = selectedQuestionIndex === q.originalIndex;
                          const isSaved = isQuestionAnswered(q, q.originalIndex);
                          const isFlagged = q.flaggedForReview;

                          return (
                            <button
                              key={q.originalIndex}
                              type="button"
                              onClick={() => handleSelectQuestion(q.originalIndex)}
                              style={{
                                padding: '8px 0',
                                fontSize: '8.5pt',
                                fontWeight: 'bold',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                border: isCurrent 
                                  ? '2px solid #a855f7' 
                                  : (isFlagged ? '1px solid #c084fc' : '1px solid #cbd5e1'),
                                backgroundColor: isCurrent 
                                  ? '#f3e8ff' 
                                  : (isSaved ? '#10b981' : (isFlagged ? '#faf5ff' : '#f8fafc')),
                                color: isCurrent 
                                  ? '#6b21a8' 
                                  : (isSaved ? '#ffffff' : (isFlagged ? '#7e22ce' : '#475569')),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                              }}
                              title={`Question ${q.originalIndex + 1}: ${q.type.toUpperCase()}`}
                            >
                              {q.originalIndex + 1}
                              {isFlagged && (
                                <span style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '2px',
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: '#a855f7'
                                }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          
          {/* Legend guide */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '7.5pt', color: '#64748b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#dbeafe', border: '1px solid #2563eb' }} />
              <span>Current</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#10b981' }} />
              <span>Attempted</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#faf5ff', border: '1px solid #a855f7' }} />
              <span>Flagged</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }} />
              <span>Unvisited</span>
            </div>
          </div>
        </div>
      )}

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
                <span style={{ width: '12px', height: '12px', backgroundColor: '#3b5998', borderRadius: '2px', display: 'inline-block' }}></span>
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
                    onClick={() => {
                      setSelectedQuestionIndex(qIdx);
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
