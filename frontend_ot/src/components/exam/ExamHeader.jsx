import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, Wifi, WifiOff } from 'lucide-react';
import { formatTimer } from '../../config/constants';
import { isQuestionAnswered } from '../../utils/examAnswerStatus';

/**
 * ExamHeader: Preserves the original header style and height with requested additions:
 * - Circular BICS logo on clean background (no dark container)
 * - Original title, candidate identity, and DEV MODE tag
 * - Dynamic answered questions counter (✔ X/Y)
 * - 4-state subtle WiFi telemetry badge with 70s countdown timer on disconnect
 * - Original centered timer display widget
 * - Original submit test CTA with 5m unlock logic
 */
export const ExamHeader = ({
  test,
  candidate,
  examTimeLeft,
  isOnline = true,
  networkQuality = 'good',
  disconnectCountdown,
  submittingExam,
  handleManualSubmitExam,
  devModeActive,
  examAnswers = []
}) => {
  // Authoritative countdown is passed from parent App orchestrator (disconnectCountdown)
  const isDisconnected = !isOnline || (disconnectCountdown !== null && disconnectCountdown !== undefined);
  const effectiveNetworkQuality = isDisconnected ? 'disconnected' : networkQuality;
  const currentCountdown = (disconnectCountdown !== null && disconnectCountdown !== undefined) ? disconnectCountdown : 70;

  // Compute live answered questions count using standardized answer checker
  const totalQuestions = test?.questions?.length || 0;
  const answeredCount = (examAnswers || []).filter((ans, idx) => {
    const q = test?.questions?.[idx];
    return isQuestionAnswered(q, ans);
  }).length;

  // 4-state WiFi telemetry visual styles & hover tooltips
  const getWifiMeta = () => {
    switch (effectiveNetworkQuality) {
      case 'fair':
        return {
          bg: '#fefce8',
          border: '#fef08a',
          color: '#ca8a04',
          icon: <Wifi size={13} />,
          label: null,
          title: "Network latency elevated (Fair connection)"
        };
      case 'poor':
        return {
          bg: '#fff7ed',
          border: '#fed7aa',
          color: '#ea580c',
          icon: <Wifi size={13} />,
          label: null,
          title: "Weak network connection - local auto-save active"
        };
      case 'disconnected':
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          color: '#dc2626',
          icon: <WifiOff size={13} />,
          label: `${currentCountdown}s`,
          title: `Connection is down. Reconnecting... Auto-submitting in ${currentCountdown}s`
        };
      case 'good':
      default:
        return {
          bg: '#f0fdf4',
          border: '#bbf7d0',
          color: '#16a34a',
          icon: <Wifi size={13} />,
          label: null,
          title: "Network connection active (Stable)"
        };
    }
  };

  const wifiMeta = getWifiMeta();

  return (
    <div
      className="cf-card"
      style={{
        backgroundColor: '#ffffff',
        margin: 0,
        padding: '12px 20px',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
        flexShrink: 0,
        zIndex: 100,
        userSelect: 'none',
        boxSizing: 'border-box'
      }}
    >
      {/* Left Column: BICS Circular Emblem, Vertical Divider, Test Title, Candidate Info, Answered Counter & WiFi Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {/* Clean BICS Circular Logo shifted slightly right (Ref Img 2) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '45px',
          height: '45px',
          marginLeft: '8px',
          flexShrink: 0
        }}>
          <img
            src="/bics_logo.png"
            alt="BICS Emblem"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
            onError={(e) => {
              if (e.currentTarget.getAttribute('src') !== `${import.meta.env.BASE_URL}bics_logo.png`) {
                e.currentTarget.src = `${import.meta.env.BASE_URL}bics_logo.png`;
              } else {
                e.currentTarget.style.display = 'none';
              }
            }}
          />
        </div>

        {/* Subtle Vertical Separator Line (Matching Ref Img 1) */}
        <div style={{
          height: '28px',
          width: '1px',
          backgroundColor: '#e2e8f0',
          margin: '0 2px',
          flexShrink: 0
        }} />

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{
              fontSize: '12.5pt',
              color: '#002147',
              fontWeight: 'bold',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {test?.title || 'Advanced Examination'}
            </h3>
            {devModeActive && (
              <span style={{
                fontSize: '7.5pt',
                fontWeight: 'bold',
                backgroundColor: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                padding: '2px 6px',
                borderRadius: '4px',
                flexShrink: 0
              }}>
                DEV MODE
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: '8.5pt', color: '#64748b', whiteSpace: 'nowrap' }}>
              Candidate: <strong style={{ color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>{candidate?.name} ({candidate?.studentId})</strong>
            </span>

            {/* Answered Questions Counter: Plus Jakarta Sans, regular weight (not semi-bold), nature green tick, no outer box */}
            <div
              title={`${answeredCount} of ${totalQuestions} questions answered`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11pt',
                fontWeight: 400,
                color: '#1e293b',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginLeft: '22px',
                flexShrink: 0,
                userSelect: 'none'
              }}
            >
              <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              <span style={{ letterSpacing: '0.2px', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400 }}>{answeredCount}/{totalQuestions}</span>
            </div>

            {/* 4-State WiFi Telemetry Badge with conditional 70s countdown timer on disconnect */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '16px', flexShrink: 0 }}>
              <div
                title={wifiMeta.title}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: `1px solid ${wifiMeta.border}`,
                  backgroundColor: wifiMeta.bg,
                  color: wifiMeta.color,
                  cursor: 'help',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                {wifiMeta.icon}
              </div>

              {/* 70s Countdown Timer: Only when network drops, styled in regular Plus Jakarta Sans */}
              {effectiveNetworkQuality === 'disconnected' && (
                <span
                  title={`Connection is down. Reconnecting... Auto-submitting in ${currentCountdown}s`}
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 400,
                    fontSize: '9.5pt',
                    color: '#dc2626',
                    letterSpacing: '0.2px',
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                  }}
                >
                  {currentCountdown}s
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center Column: Original Timer Display Widget */}
      <div style={{
        padding: '8px 15px',
        borderRadius: '4px',
        backgroundColor: examTimeLeft < 300 ? '#ffe4e6' : '#e0f2fe',
        color: examTimeLeft < 300 ? '#be123c' : '#0369a1',
        border: examTimeLeft < 300 ? '1px solid #fda4af' : '1px solid #7dd3fc',
        fontWeight: 'bold',
        fontFamily: 'monospace',
        fontSize: '11pt',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        justifySelf: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}>
        <Clock size={16} style={{ color: examTimeLeft < 300 ? '#ef4444' : '#0284c7' }} />
        <span>{formatTimer(examTimeLeft)} remaining</span>
      </div>

      {/* Right Column: Original Submit Test CTA */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
        <button
          className="cf-btn-primary"
          disabled={submittingExam || examTimeLeft > 300}
          title={examTimeLeft > 300 ? `Manual submission will unlock in the final 5 minutes (${formatTimer(examTimeLeft - 300)} left)` : "Finalize and submit your test"}
          style={{
            borderColor: (submittingExam || examTimeLeft > 300) ? '#cbd5e1' : '#ef4444',
            color: (submittingExam || examTimeLeft > 300) ? '#94a3b8' : '#ef4444',
            background: (submittingExam || examTimeLeft > 300) ? '#f8fafc' : 'transparent',
            fontWeight: 'bold',
            padding: '6px 14px',
            fontSize: '9pt',
            borderRadius: '4px',
            cursor: (submittingExam || examTimeLeft > 300) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={handleManualSubmitExam}
        >
          {examTimeLeft > 300
            ? `Submit (Available in ${Math.ceil((examTimeLeft - 300) / 60)}m)`
            : (submittingExam ? "Submitting..." : "Finalize & Submit Test")}
        </button>
        {examTimeLeft > 300 && (
          <span style={{ fontSize: '7.5pt', color: '#64748b' }}>
            Submission unlocks at 05:00
          </span>
        )}
      </div>
    </div>
  );
};
