import React, { useState, useEffect } from 'react';
import { BookOpen, ShieldCheck, Clock, FileText, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Maximize2 } from 'lucide-react';
import { getReturnUrl } from '../config/constants';
import { RichText } from '../components/common/RichText';
import { TestSetupStepProgress } from '../components/common/TestSetupStepProgress';

export function GuidelinesSetupView({
  test,
  candidate,
  isFullscreen,
  handleLockFullscreen,
  onBackToBiometrics,
  handleStartExam,
  devModeActive
}) {
  const triggerFullscreen = async () => {
    if (handleLockFullscreen) {
      handleLockFullscreen();
      return;
    }
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) await elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen();
      else if (elem.mozRequestFullScreen) await elem.mozRequestFullScreen();
      else if (elem.msRequestFullscreen) await elem.msRequestFullscreen();
    } catch (e) {
      console.warn("Fullscreen request notice:", e);
    }
  };

  // 1.00 Minute (60 Seconds) Test Environment Preparation Holding Timer (Matching Image 1)
  // When devModeActive is true, immediately bypass the 60-second wait!
  const [prepSecondsRemaining, setPrepSecondsRemaining] = useState(devModeActive ? 0 : 60);
  const [prepCompleted, setPrepCompleted] = useState(!!devModeActive);

  useEffect(() => {
    if (devModeActive) {
      setPrepSecondsRemaining(0);
      setPrepCompleted(true);
      return;
    }
    // Strict production mode: Reset holding states to ensure zero leakage from any dev mode session
    setPrepCompleted(false);
    setPrepSecondsRemaining(60);
    const timer = setInterval(() => {
      setPrepSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setPrepCompleted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [devModeActive]);

  const canStartTest = prepCompleted && isFullscreen;

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Main Outerbox Container (Exact Codeforces / BICS Card) */}
      <div className="cf-card" style={{ maxWidth: '1020px', width: '100%', margin: '0 auto', padding: '15px' }}>
        
        {/* Exact Main Portal Card Title Bar: Clean view name only */}
        <div className="cf-card-title">
          <BookOpen size={16} style={{ color: '#3b5998' }} />
          <span>Proctoring and test instructions</span>
        </div>

        {/* 4-Step Test Setup Progress Bar */}
        <TestSetupStepProgress currentStep={4} />

        {/* 1.00 Minute Preparation Timer vs Ready Banner with Smooth Transition */}
        <style>{`
          @keyframes cfFadeSlideIn {
            0% {
              opacity: 0;
              transform: translateY(-8px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .cf-prep-ready-banner {
            animation: cfFadeSlideIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            transition: all 0.4s ease;
          }
        `}</style>

        {!prepCompleted ? (
          <div style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginBottom: '16px',
            transition: 'opacity 0.4s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={15} /> Setting up secure test environment... Please review instructions while environment prepares
              </span>
              <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e40af', fontFamily: "'Roboto Mono', monospace" }}>
                0:{prepSecondsRemaining < 10 ? `0${prepSecondsRemaining}` : prepSecondsRemaining} remaining
              </span>
            </div>
            {/* Animated Progress Bar */}
            <div style={{ width: '100%', height: '5px', backgroundColor: '#dbeafe', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${((60 - prepSecondsRemaining) / 60) * 100}%`,
                height: '100%',
                backgroundColor: '#3b5998',
                transition: 'width 1s linear'
              }} />
            </div>
          </div>
        ) : (
          <div 
            className="cf-prep-ready-banner"
            style={{
              backgroundColor: devModeActive ? '#fffbeb' : '#f0fdf4',
              border: devModeActive ? '1px solid #fde68a' : '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: devModeActive ? '#b45309' : '#15803d',
              fontSize: '9pt',
              fontWeight: '600',
              marginBottom: '16px',
              boxShadow: devModeActive ? '0 1px 3px rgba(217, 119, 6, 0.1)' : '0 1px 3px rgba(22, 163, 74, 0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} style={{ color: devModeActive ? '#d97706' : '#16a34a', flexShrink: 0 }} />
              <span>You can start the test now.</span>
            </div>
            {devModeActive && (
              <span style={{ fontSize: '8pt', backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fcd34d' }}>
                ⚡ Dev Mode: 1-Min Wait Bypassed
              </span>
            )}
          </div>
        )}

        {/* Fullscreen Alert Reminder if fullscreen dropped */}
        {!isFullscreen && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#991b1b', fontSize: '8.5pt', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              <span><strong>Fullscreen Mode Required:</strong> You must maintain locked fullscreen mode throughout the test session.</span>
            </div>
            <button
              className="cf-btn-primary"
              onClick={async () => {
                const elem = document.documentElement;
                if (elem.requestFullscreen) await elem.requestFullscreen().catch(() => {});
                else if (elem.webkitRequestFullscreen) await elem.webkitRequestFullscreen().catch(() => {});
              }}
              style={{ padding: '4px 12px', fontSize: '8pt', fontWeight: 'bold' }}
            >
              Re-lock Fullscreen
            </button>
          </div>
        )}

        {/* Content Section: Test Instructions + General Regulations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          
          {/* Test Specific Instructions (Database-Fetched with Markdown & LaTeX KaTeX) */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--cf-border)', borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={15} style={{ color: '#3b5998' }} /> About this test &amp; Specific Instructions:
            </h4>

            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px 14px', borderRadius: '3px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.65' }}>
              <RichText 
                text={
                  test?.instructions && test.instructions.trim().length > 0
                    ? test.instructions
                    : `This assessment (**${test?.title || 'Examination'}**) is scheduled for **${test?.duration || 60} minutes**.

- **Attempt All Questions:** Carefully review each question in the question palette before submitting.
- **Save Answers:** You must explicitly click **Save & Next** on each problem to record and lock your answers on the server.
- **Code Execution:** For coding questions, compile and verify your code against visible test cases prior to advancing.
- **Session Protection:** All progress is encrypted and cached locally (\`.eirf\`) to ensure resilience against unexpected network interruptions.
- **Final Submission:** Review all answered items thoroughly before completing the assessment.`
                } 
              />
            </div>
          </div>

          {/* General Examination Regulations */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--cf-border)', borderRadius: '4px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#002147', margin: 0 }}>
              General Examination Regulations:
            </h4>

            <ul style={{ listStyleType: 'disc', paddingLeft: '20px', fontSize: '8.5pt', color: '#334155', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <li>The allocated time limit for this exam is <strong>{test?.duration || 60} minutes</strong>. An automated countdown timer is displayed during the test.</li>
              <li>Exiting Fullscreen or switching browser tabs will record a violation. Accumulating <strong>3 warnings results in instant automatic submission</strong>.</li>
              <li>Dual automated AI proctors (Vision and Audio) monitor your session. Keep your face centered, do not speak, and ensure no secondary voices or background chatter are present.</li>
              <li>You must explicitly click <strong>Save &amp; Next</strong> to record each answer. Draft answers or unsubmitted code will not be scored.</li>
              <li>Opening developer tools, secondary displays, or attempting clipboard shortcuts is strictly tracked as a violation.</li>
            </ul>
          </div>

        </div>

        {/* Footer Action Bar */}
        <div style={{
          borderTop: '1px solid var(--cf-border)',
          margin: '0 -15px -15px -15px',
          padding: '12px 15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
          borderBottomLeftRadius: '3px',
          borderBottomRightRadius: '3px'
        }}>
          <button 
            className="cf-btn-secondary" 
            style={{ padding: '6px 18px', fontSize: '8.5pt', display: 'flex', alignItems: 'center', gap: '6px' }} 
            onClick={onBackToBiometrics || (() => {
              window.location.href = getReturnUrl('/coursework/online-tests');
            })}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isFullscreen && (
              <span style={{ color: '#dc2626', fontSize: '8pt', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={13} style={{ color: '#dc2626' }} />
                Fullscreen lock is mandatory
              </span>
            )}
            <button 
              className="cf-btn-primary" 
              disabled={!prepCompleted} 
              style={{ 
                padding: '6px 26px', 
                fontSize: '8.5pt', 
                fontWeight: 'bold',
                cursor: prepCompleted ? 'pointer' : 'not-allowed',
                opacity: prepCompleted ? 1 : 0.6,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }} 
              onClick={() => {
                if (!isFullscreen) {
                  triggerFullscreen();
                  return;
                }
                if (!canStartTest) return;
                handleStartExam();
              }}
            >
              {!prepCompleted ? (
                <span>Preparing Environment (0:{prepSecondsRemaining < 10 ? `0${prepSecondsRemaining}` : prepSecondsRemaining})</span>
              ) : !isFullscreen ? (
                <span>Lock Fullscreen to Start</span>
              ) : (
                <span>Start test</span>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default GuidelinesSetupView;
