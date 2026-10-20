import React from 'react';
import { Link } from 'react-router-dom';

export default function CodeforcesActionCell({ isSolved, isPartiallySolved, to, title = "Submit solution" }) {
    return (
        <td style={{
            padding: '4px 8px',
            textAlign: 'center',
            background: isSolved ? '#d4edc9' : (isPartiallySolved ? '#fef9c3' : 'transparent'),
            borderRight: '1px solid #e1e1e1',
            borderLeft: '1px solid #e1e1e1',
            width: '60px'
        }}>
            <Link
                to={to}
                title={title}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    textDecoration: 'none'
                }}
            >
                {/* Codeforces paper plane icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" stroke="#555555" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
                {/* Codeforces favorite star icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#c4c4db" stroke="#9999b0" strokeWidth="1.2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            </Link>
        </td>
    );
}
