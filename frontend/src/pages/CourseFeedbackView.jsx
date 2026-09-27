import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function CourseFeedbackView({
  feedbackType,
  studentProfile,
  systemConfig,
  setView,
  COURSES_LIST,
  feedbackAnswers,
  activeCourseFeedbackIdx,
  setActiveCourseFeedbackIdx,
  feedbackSuccess,
  handleFeedbackSubmit,
  handleFeedbackValueChange
}) {
  const isFeedbackSubmitted = feedbackType === 'mid' ? 
    (studentProfile?.midSemFeedback && Object.keys(studentProfile.midSemFeedback).length > 0) : 
    (studentProfile?.endSemFeedback && Object.keys(studentProfile.endSemFeedback).length > 0);

  return (
    <div className="cf-card" style={{ padding: '25px' }}>
      <div className="cf-card-title" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <span>Course Feedback Survey - {feedbackType === 'mid' ? 'Mid' : 'End'} Semester</span>
      </div>

      {((feedbackType === 'mid' && !systemConfig?.midSemFeedbackActive) || (feedbackType === 'end' && !systemConfig?.endSemFeedbackActive)) ? (
        <div className="cf-alert cf-alert-info" style={{ margin: '0' }}>
          {feedbackType === 'mid' ? 'Mid' : 'End'} Semester Course Feedback is currently closed by the administrator.
        </div>
      ) : isFeedbackSubmitted ? (
        /* Completed State: Success Message, No Form */
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px auto' }}>
            <CheckCircle size={36} style={{ color: '#16a34a' }} />
          </div>
          
          <h2 style={{ fontSize: '15pt', fontWeight: 'bold', color: '#14532d', marginBottom: '10px' }}>
            Feedback Survey Completed
          </h2>
          <p style={{ fontSize: '10pt', color: '#166534', maxWidth: '500px', margin: '0 auto 25px auto', lineHeight: '1.6' }}>
            You have already successfully completed and submitted your Course Feedback Survey for the {feedbackType === 'mid' ? 'Mid-Semester' : 'End-Semester'} exams. Thank you for your response!
          </p>

          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button 
              className="cf-btn-primary" 
              onClick={() => setView('hallticket')}
              style={{ padding: '10px 24px', fontSize: '10pt', fontWeight: 'bold' }}
            >
              Proceed to Hall Ticket &rarr;
            </button>
            <button 
              className="cf-btn-secondary" 
              onClick={() => setView('announcements')}
              style={{ padding: '10px 20px', fontSize: '10pt' }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        /* Survey Form */
        <div>
          <div style={{ marginBottom: '20px', backgroundColor: '#eff6ff', padding: '15px 18px', borderRadius: '8px', borderLeft: '4px solid #1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '3px' }}>
                Course Feedback Survey Notice
              </div>
              <p style={{ fontSize: '9pt', color: '#1e40af', margin: 0, lineHeight: '1.4' }}>
                Please rate your academic experience for all 6 enrolled course modules. All 6 course reviews are required for submission.
              </p>
            </div>
            {(() => {
              const filledCoursesCount = COURSES_LIST.filter(c => {
                const a = feedbackAnswers[c];
                return a && a[0] && a[1] && a[2] && a[3] && a[4] && a[4].trim() !== '';
              }).length;
              const pct = Math.round((filledCoursesCount / COURSES_LIST.length) * 100);
              return (
                <div style={{ textAlign: 'right', minWidth: '150px' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '4px' }}>
                    Overall Progress: {filledCoursesCount} / {COURSES_LIST.length} ({pct}%)
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#bfdbfe', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? '#16a34a' : '#2563eb', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })()}
          </div>

          {feedbackSuccess && <div className="cf-alert cf-alert-success">{feedbackSuccess}</div>}

          {/* Course Stepper / Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '20px' }}>
            {COURSES_LIST.map((course, idx) => {
              const isSelected = activeCourseFeedbackIdx === idx;
              const a = feedbackAnswers[course];
              const isCourseDone = a && a[0] && a[1] && a[2] && a[3] && a[4] && a[4].trim() !== '';
              const courseCode = course.split(' - ')[0] || course;
              const courseTitle = course.split(' - ')[1] || course;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveCourseFeedbackIdx(idx)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #002147' : isCourseDone ? '1.5px solid #86efac' : '1px solid #cbd5e1',
                    backgroundColor: isSelected ? '#002147' : isCourseDone ? '#f0fdf4' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 3px 8px rgba(0,33,71,0.2)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '4px' }}>
                    <span style={{ fontSize: '7.5pt', fontWeight: 'bold', letterSpacing: '0.5px', textTransform: 'uppercase', color: isSelected ? '#93c5fd' : isCourseDone ? '#16a34a' : '#64748b' }}>
                      Course 0{idx + 1}
                    </span>
                    {isCourseDone ? (
                      <CheckCircle size={14} color={isSelected ? '#86efac' : '#16a34a'} />
                    ) : (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isSelected ? '#93c5fd' : '#cbd5e1' }} />
                    )}
                  </div>
                  <div style={{ fontSize: '9pt', fontWeight: 'bold', lineHeight: '1.2', marginBottom: '2px' }}>
                    {courseCode}
                  </div>
                  <div style={{ fontSize: '7.5pt', color: isSelected ? '#e2e8f0' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                    {courseTitle}
                  </div>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleFeedbackSubmit}>
            {(() => {
              const currentCourse = COURSES_LIST[activeCourseFeedbackIdx] || COURSES_LIST[0];
              const currentAnswers = feedbackAnswers[currentCourse] || [];
              const isCurrentCourseDone = currentAnswers[0] && currentAnswers[1] && currentAnswers[2] && currentAnswers[3] && currentAnswers[4] && currentAnswers[4].trim() !== '';
              const currentCode = currentCourse.split(' - ')[0] || currentCourse;
              const currentTitle = currentCourse.split(' - ')[1] || currentCourse;

              const suggestionChips = currentCourse.includes('Lab') ? [
                "Excellent hands-on lab sessions",
                "Lab machines and compilers worked smoothly",
                "Need more practical coding assignments",
                "Lab instructors were very helpful",
                "Well designed lab worksheets"
              ] : [
                "Textbook and notes are very well structured",
                "Video lectures are clear and conceptual",
                "Need more practice and test examples",
                "Interactive sessions were informative",
                "Curriculum pace is optimal"
              ];

              const ratingLabels = {
                1: "Poor",
                2: "Fair",
                3: "Good",
                4: "Very Good",
                5: "Excellent"
              };

              return (
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                  {/* Course Header Banner */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                    <div>
                      <div style={{ display: 'inline-block', backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '8pt', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px', marginBottom: '4px' }}>
                        {currentCode}
                      </div>
                      <h3 style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', color: '#002147' }}>
                        {currentTitle}
                      </h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '8.5pt', color: '#64748b' }}>
                        Course {activeCourseFeedbackIdx + 1} of {COURSES_LIST.length}
                      </span>
                      {isCurrentCourseDone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontSize: '8pt', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px' }}>
                          <CheckCircle size={12} /> Completed
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#fef3c7', color: '#b45309', fontSize: '8pt', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px' }}>
                          Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Q1 */}
                  <div style={{ marginBottom: '22px', backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e293b', fontSize: '9.5pt', marginBottom: '10px' }}>
                      1. Rate the quality and coverage of the {currentCourse.includes('Lab') ? 'Lab manual and instructions' : 'textbook and study material'}
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5].map(num => {
                        const isSelected = currentAnswers[0] === num.toString();
                        let activeBg = isSelected ? '#002147' : '#ffffff';
                        let activeColor = isSelected ? '#ffffff' : '#334155';
                        let activeBorder = isSelected ? '#002147' : '#cbd5e1';
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleFeedbackValueChange(currentCourse, 0, num.toString())}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '70px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: `1.5px solid ${activeBorder}`,
                              backgroundColor: activeBg,
                              color: activeColor,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '11pt', fontWeight: 'bold' }}>{num}</span>
                            <span style={{ fontSize: '7pt', opacity: isSelected ? 0.9 : 0.7, marginTop: '2px' }}>{ratingLabels[num]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q2 */}
                  <div style={{ marginBottom: '22px', backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e293b', fontSize: '9.5pt', marginBottom: '10px' }}>
                      2. Rate the usefulness and clarity of video lectures / teaching sessions
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5].map(num => {
                        const isSelected = currentAnswers[1] === num.toString();
                        let activeBg = isSelected ? '#002147' : '#ffffff';
                        let activeColor = isSelected ? '#ffffff' : '#334155';
                        let activeBorder = isSelected ? '#002147' : '#cbd5e1';
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleFeedbackValueChange(currentCourse, 1, num.toString())}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '70px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: `1.5px solid ${activeBorder}`,
                              backgroundColor: activeBg,
                              color: activeColor,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '11pt', fontWeight: 'bold' }}>{num}</span>
                            <span style={{ fontSize: '7pt', opacity: isSelected ? 0.9 : 0.7, marginTop: '2px' }}>{ratingLabels[num]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q3 */}
                  <div style={{ marginBottom: '22px', backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e293b', fontSize: '9.5pt', marginBottom: '10px' }}>
                      3. Rate the layout and difficulty level of Assignments & Practice Exercises
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5].map(num => {
                        const isSelected = currentAnswers[2] === num.toString();
                        let activeBg = isSelected ? '#002147' : '#ffffff';
                        let activeColor = isSelected ? '#ffffff' : '#334155';
                        let activeBorder = isSelected ? '#002147' : '#cbd5e1';
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleFeedbackValueChange(currentCourse, 2, num.toString())}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '70px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: `1.5px solid ${activeBorder}`,
                              backgroundColor: activeBg,
                              color: activeColor,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '11pt', fontWeight: 'bold' }}>{num}</span>
                            <span style={{ fontSize: '7pt', opacity: isSelected ? 0.9 : 0.7, marginTop: '2px' }}>{ratingLabels[num]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q4 */}
                  <div style={{ marginBottom: '22px', backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e293b', fontSize: '9.5pt', marginBottom: '10px' }}>
                      4. Did the course curriculum and delivery meet your expectations?
                    </label>
                    <div style={{ display: 'flex', gap: '10px', maxWidth: '240px' }}>
                      {['Yes', 'No'].map(opt => {
                        const isSelected = currentAnswers[3] === opt;
                        const activeColor = opt === 'Yes' ? '#16a34a' : '#dc2626';
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleFeedbackValueChange(currentCourse, 3, opt)}
                            style={{
                              flex: '1',
                              padding: '10px 0',
                              border: isSelected ? `2px solid ${activeColor}` : '1px solid #cbd5e1',
                              backgroundColor: isSelected ? (opt === 'Yes' ? '#dcfce7' : '#fee2e2') : '#fff',
                              color: isSelected ? activeColor : '#64748b',
                              fontWeight: 'bold',
                              fontSize: '10pt',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {opt === 'Yes' ? '✓ Yes' : '✗ No'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q5 */}
                  <div style={{ marginBottom: '10px', backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1e293b', fontSize: '9.5pt', marginBottom: '6px' }}>
                      5. General Comments / Constructive Suggestions
                    </label>
                    
                    {/* Quick suggestion tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {suggestionChips.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const currentVal = currentAnswers[4] || '';
                            if (currentVal.includes(chip)) return;
                            const newVal = currentVal ? `${currentVal}. ${chip}` : chip;
                            handleFeedbackValueChange(currentCourse, 4, newVal);
                          }}
                          style={{
                            fontSize: '7.5pt',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            borderRadius: '12px',
                            padding: '3px 10px',
                            cursor: 'pointer',
                            transition: 'all 0.1s'
                          }}
                          title="Click to add to remarks"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>

                    <textarea 
                      className="cf-input" 
                      rows="3"
                      placeholder="Type your honest remarks or suggestions for this course module..." 
                      value={currentAnswers[4] || ''} 
                      onChange={e => handleFeedbackValueChange(currentCourse, 4, e.target.value)} 
                      style={{ width: '100%', padding: '10px', fontSize: '9.5pt', border: '1px solid #cbd5e1', borderRadius: '6px', resize: 'vertical', minHeight: '75px' }}
                    />
                  </div>

                  {/* Navigation Stepper Controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '10px' }}>
                    <button
                      type="button"
                      className="cf-btn-secondary"
                      onClick={() => setActiveCourseFeedbackIdx(prev => Math.max(0, prev - 1))}
                      disabled={activeCourseFeedbackIdx === 0}
                      style={{ padding: '8px 18px', fontSize: '9.5pt', opacity: activeCourseFeedbackIdx === 0 ? 0.5 : 1, cursor: activeCourseFeedbackIdx === 0 ? 'not-allowed' : 'pointer' }}
                    >
                      &larr; Previous Course
                    </button>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {activeCourseFeedbackIdx < COURSES_LIST.length - 1 && (
                        <button
                          type="button"
                          className="cf-btn-primary"
                          onClick={() => setActiveCourseFeedbackIdx(prev => Math.min(COURSES_LIST.length - 1, prev + 1))}
                          style={{ padding: '8px 20px', fontSize: '9.5pt' }}
                        >
                          Next Course &rarr;
                        </button>
                      )}

                      <button
                        type="submit"
                        className="cf-btn-primary"
                        style={{
                          padding: '8px 24px',
                          fontSize: '9.5pt',
                          fontWeight: 'bold',
                          backgroundColor: '#16a34a',
                          borderColor: '#15803d'
                        }}
                      >
                        Submit All Feedback &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </form>
        </div>
      )}
    </div>
  );
}
