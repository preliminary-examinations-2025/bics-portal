import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIST(date) {
    if (!date) return '';
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const ist = new Date(utc + 5.5 * 3600 * 1000);
    const m = MONTH_NAMES[ist.getMonth()];
    const d = String(ist.getDate()).padStart(2, '0');
    const y = ist.getFullYear();
    const h = String(ist.getHours()).padStart(2, '0');
    const min = String(ist.getMinutes()).padStart(2, '0');
    const s = String(ist.getSeconds()).padStart(2, '0');
    return `${m}/${d}/${y} ${h}:${min}:${s} UTC+5.5`;
}

export default function KataFooter({ style = {} }) {
    const [currentTimeStr, setCurrentTimeStr] = useState(() => formatIST(new Date()));

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTimeStr(formatIST(new Date()));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <footer style={{
            width: '100%',
            maxWidth: '1100px',
            margin: 'auto auto 0 auto',
            padding: '20px 20px 24px 20px',
            borderTop: '1px solid #e0e0e0',
            textAlign: 'center',
            fontSize: '11px',
            color: '#777777',
            lineHeight: '1.7',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
            boxSizing: 'border-box',
            flexShrink: 0,
            ...style
        }}>
            <div>
                <Link to="/kata" style={{ color: '#00a4d3', fontWeight: 'bold', textDecoration: 'none' }}>Kata</Link> (c) 2026 BICS Competitive Programming Arena
            </div>
            <div>
                The competitive programming contest platform for BICS candidates · Synchronized with BICS Portal
            </div>
            <div style={{ color: '#333333', fontWeight: '500', marginTop: '2px' }}>
                Server time: <span style={{ color: '#00a4d3', fontWeight: 'bold' }}>{currentTimeStr}</span>
            </div>
            <div style={{ marginTop: '2px', color: '#888888', fontSize: '10px' }}>
                Managed by Preliminary Examinations 2026 · All rights reserved.
            </div>
        </footer>
    );
}
