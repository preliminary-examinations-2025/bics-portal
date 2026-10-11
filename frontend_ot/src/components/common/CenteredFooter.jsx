import React from 'react';

// Center 3-line Footer element helper
export function CenteredFooter() {
  return (
    <footer className="app-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '20px 10px', fontSize: '8.5pt', lineHeight: '1.4', width: '100%', borderTop: '1px solid var(--cf-border)', backgroundColor: '#ffffff' }}>
      <div style={{ fontWeight: 'bold', color: '#002147' }}>BICS Online Test Module</div>
      <div style={{ color: '#555' }}>Managed by Preliminary Examinations 2026</div>
      <div style={{ color: '#777', fontSize: '8pt' }}>All rights reserved © 2026</div>
    </footer>
  );
}

export default CenteredFooter;
