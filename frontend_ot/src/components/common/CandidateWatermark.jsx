import React from 'react';

// Low-opacity, repeating, rotated candidate email watermark overlay
export function CandidateWatermark({ email }) {
  if (!email) return null;
  
  // We can repeat the email in a grid pattern
  const repeatedEmails = Array(12).fill(email);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: 10,
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(4, 1fr)',
      opacity: 0.10,
      transform: 'rotate(-15deg) scale(1.2)'
    }}>
      {repeatedEmails.map((e, idx) => (
        <div key={idx} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11pt',
          fontWeight: 'bold',
          color: '#002147',
          fontFamily: 'monospace'
        }}>
          {e}
        </div>
      ))}
    </div>
  );
}

export default CandidateWatermark;
