import React from 'react';
import { Check } from 'lucide-react';

export function TestSetupStepProgress({ currentStep = 1 }) {
  const steps = [
    { number: 1, label: 'Terms and conditions' },
    { number: 2, label: 'System checks' },
    { number: 3, label: 'Biometric checks' },
    { number: 4, label: 'Proctoring and test instructions' }
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '12px 20px',
      marginBottom: '16px',
      gap: '12px'
    }}>
      {steps.map((s, idx) => {
        const isCompleted = s.number < currentStep;
        const isCurrent = s.number === currentStep;

        return (
          <React.Fragment key={s.number}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              {/* Ref Image 2 Outlined Circle Style - No Dark Fills */}
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9.5pt',
                fontWeight: isCurrent ? '600' : '500',
                backgroundColor: isCompleted ? '#f0fdf4' : '#ffffff',
                border: isCurrent 
                  ? '2px solid #8ab4f8' 
                  : isCompleted 
                    ? '2px solid #86efac' 
                    : '1.5px solid #e2e8f0',
                color: isCompleted 
                  ? '#16a34a' 
                  : isCurrent 
                    ? '#0f172a' 
                    : '#94a3b8',
                flexShrink: 0
              }}>
                {isCompleted ? <Check size={14} strokeWidth={2.5} /> : s.number}
              </div>

              <span style={{
                fontSize: '9pt',
                fontWeight: isCurrent ? '600' : isCompleted ? '500' : '400',
                color: isCurrent 
                  ? '#0f172a' 
                  : isCompleted 
                    ? '#16a34a' 
                    : '#94a3b8',
                whiteSpace: 'nowrap'
              }}>
                {s.label}
              </span>
            </div>

            {idx < steps.length - 1 && (
              <div style={{
                flex: 1,
                height: '2px',
                backgroundColor: isCompleted ? '#bbf7d0' : '#f1f5f9',
                margin: '0 8px',
                minWidth: '16px'
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default TestSetupStepProgress;
