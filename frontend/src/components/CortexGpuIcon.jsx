import React from 'react';

/**
 * CortexGpuIcon
 * Pure black & white vector GPU icon featuring:
 * - Outer chip carrier package with 20 connector pins
 * - Central silicon die with 4 black compute cores
 * - Circuit wire bus traces connecting die to package
 * - Alignment dot
 */
export default function CortexGpuIcon({ size = 20, className = '', style = {}, spin = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${spin ? 'cortex-spin-anim' : ''}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {/* Outer Carrier Package */}
      <rect x="20" y="20" width="80" height="80" rx="4" stroke="currentColor" strokeWidth="4" fill="transparent" />

      {/* Central GPU Die */}
      <rect x="40" y="40" width="40" height="40" rx="2" stroke="currentColor" strokeWidth="3" fill="transparent" />

      {/* 4 GPU Compute Cores */}
      <rect x="46" y="46" width="12" height="12" fill="currentColor" />
      <rect x="62" y="46" width="12" height="12" fill="currentColor" />
      <rect x="46" y="62" width="12" height="12" fill="currentColor" />
      <rect x="62" y="62" width="12" height="12" fill="currentColor" />

      {/* Internal Bus Lines */}
      <line x1="60" y1="40" x2="60" y2="80" stroke="white" strokeWidth="1.5" />
      <line x1="40" y1="60" x2="80" y2="60" stroke="white" strokeWidth="1.5" />

      {/* Circuit Wire Traces */}
      <line x1="30" y1="50" x2="40" y2="50" stroke="currentColor" strokeWidth="2.5" />
      <line x1="30" y1="70" x2="40" y2="70" stroke="currentColor" strokeWidth="2.5" />
      <line x1="80" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="2.5" />
      <line x1="80" y1="70" x2="90" y2="70" stroke="currentColor" strokeWidth="2.5" />
      <line x1="50" y1="30" x2="50" y2="40" stroke="currentColor" strokeWidth="2.5" />
      <line x1="70" y1="30" x2="70" y2="40" stroke="currentColor" strokeWidth="2.5" />
      <line x1="50" y1="80" x2="50" y2="90" stroke="currentColor" strokeWidth="2.5" />
      <line x1="70" y1="80" x2="70" y2="90" stroke="currentColor" strokeWidth="2.5" />

      {/* External Connector Pins (Top) */}
      <line x1="35" y1="8" x2="35" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="8" x2="50" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="8" x2="60" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="70" y1="8" x2="70" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="85" y1="8" x2="85" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

      {/* External Connector Pins (Bottom) */}
      <line x1="35" y1="100" x2="35" y2="112" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="100" x2="50" y2="112" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="100" x2="60" y2="112" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="70" y1="100" x2="70" y2="112" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="85" y1="100" x2="85" y2="112" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

      {/* External Connector Pins (Left) */}
      <line x1="8" y1="35" x2="20" y2="35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="50" x2="20" y2="50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="60" x2="20" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="70" x2="20" y2="70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="85" x2="20" y2="85" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

      {/* External Connector Pins (Right) */}
      <line x1="100" y1="35" x2="112" y2="35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="100" y1="50" x2="112" y2="50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="100" y1="60" x2="112" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="100" y1="70" x2="112" y2="70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="100" y1="85" x2="112" y2="85" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

      {/* Corner Registration Mark */}
      <circle cx="28" cy="28" r="3" fill="currentColor" />
    </svg>
  );
}
