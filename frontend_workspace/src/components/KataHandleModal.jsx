import React, { useState, useEffect } from 'react';
import { kataApi } from '../utils/kataApi';
import iconImg from '../assets/kata_icon.png';

export default function KataHandleModal({ isOpen, candidate, onRegistered }) {
    const [handle, setHandle] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState({ state: 'idle', message: '' }); // 'idle', 'checking', 'available', 'taken', 'invalid'
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setHandle('');
        setPassword('');
        setShowPassword(false);
        setStatus({ state: 'idle', message: '' });
        setSubmitError('');
    }, [isOpen]);

    // Live validation debounce for handle availability
    useEffect(() => {
        const trimmed = handle.trim();
        setSubmitError('');

        if (!trimmed) {
            setStatus({ state: 'idle', message: '' });
            return;
        }

        const handleRegex = /^[a-zA-Z0-9_-]{3,24}$/;
        if (!handleRegex.test(trimmed)) {
            setStatus({
                state: 'invalid',
                message: 'Handle must be 3–24 characters (letters, numbers, hyphens, underscores).'
            });
            return;
        }

        let isCancelled = false;
        setStatus({ state: 'checking', message: 'Checking availability...' });

        const timer = setTimeout(async () => {
            try {
                const res = await kataApi.checkHandle(trimmed);
                if (isCancelled) return;
                if (res.available) {
                    setStatus({ state: 'available', message: `Handle "${trimmed}" is available!` });
                } else {
                    setStatus({ state: 'taken', message: res.message || `Handle "${trimmed}" is already taken.` });
                }
            } catch {
                if (!isCancelled) {
                    setStatus({ state: 'idle', message: '' });
                }
            }
        }, 350);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [handle]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');

        const trimmedHandle = handle.trim();
        if (!trimmedHandle || status.state === 'taken' || status.state === 'invalid') {
            setSubmitError('Please choose a valid and available handle.');
            return;
        }

        if (!password.trim()) {
            setSubmitError('Please enter your BICS portal password to verify your account.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await kataApi.registerHandle(trimmedHandle, password.trim());
            if (res.success && res.profile) {
                if (res.token) {
                    localStorage.setItem('bics_auth_token', res.token);
                }
                onRegistered && onRegistered(res.profile, res.candidate);
            } else {
                setSubmitError(res.error || 'Failed to register handle. Please check your password and try again.');
            }
        } catch (err) {
            console.error('Error submitting handle registration:', err);
            setSubmitError('Network or server error verifying credentials. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const studentName = candidate?.name || 'BICS Candidate';
    const studentId = candidate?.studentId || '—';
    const studentEmail = candidate?.email || candidate?.collegeEmail || candidate?.personalEmail || '—';

    const [isButtonHovered, setIsButtonHovered] = useState(false);

    const isSubmitDisabled = !handle.trim() || !password.trim() || status.state === 'invalid' || status.state === 'taken' || isSubmitting;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '24px',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            <div style={{
                background: '#ffffff',
                border: '1px solid #b9b9b9',
                borderRadius: '6px',
                width: '100%',
                maxWidth: '650px',
                boxShadow: '0 8px 28px rgba(0, 0, 0, 0.20)',
                overflow: 'hidden'
            }}>
                {/* Header matching Codeforces Roundbox Header */}
                <div style={{
                    background: '#ffffff',
                    borderBottom: '1px solid #b9b9b9',
                    padding: '10px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <img src={iconImg} alt="Kata" style={{ height: '18px', width: 'auto' }} />
                    <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#315682' }}>
                        Register for Kata Contests
                    </span>
                </div>

                {/* Body Content */}
                <form onSubmit={handleSubmit} style={{ padding: '24px 30px 20px 30px', margin: 0 }}>
                    {/* Welcome banner */}
                    <p style={{
                        fontSize: '13px',
                        color: '#333333',
                        lineHeight: '1.6',
                        margin: '0 0 20px 0',
                        textAlign: 'justify'
                    }}>
                        Welcome to the <strong style={{ color: '#315682' }}>BICS Workspace Kata Contests</strong>. Verify your registered student credentials below, choose your competitive handle, and enter your password to activate your profile:
                    </p>

                    {/* Submit Error Message */}
                    {submitError && (
                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#b91c1c',
                            borderRadius: '3px',
                            padding: '8px 14px',
                            fontSize: '12px',
                            marginBottom: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span>⚠️</span>
                            <span>{submitError}</span>
                        </div>
                    )}

                    {/* Two-Column Form Table matching Codeforces Ref Image */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                        <tbody>
                            {/* Row 1: Candidate Name (Prefilled Readonly) */}
                            <tr>
                                <td style={{
                                    width: '32%',
                                    textAlign: 'right',
                                    verticalAlign: 'middle',
                                    paddingRight: '16px',
                                    paddingBottom: '14px',
                                    fontSize: '13.5px',
                                    color: '#222222'
                                }}>
                                    Candidate Name
                                </td>
                                <td style={{ verticalAlign: 'middle', paddingBottom: '14px' }}>
                                    <input
                                        type="text"
                                        value={studentName}
                                        readOnly
                                        disabled
                                        title="Prefilled from BICS Student Record (Cannot be changed)"
                                        style={{
                                            width: '310px',
                                            boxSizing: 'border-box',
                                            height: '28px',
                                            padding: '4px 8px',
                                            fontSize: '13px',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            fontWeight: 'normal',
                                            border: '1px solid #b9b9b9',
                                            borderRadius: '2px',
                                            background: '#f4f5f7',
                                            color: '#333333',
                                            cursor: 'not-allowed'
                                        }}
                                    />
                                </td>
                            </tr>

                            {/* Row 2: Student ID (Prefilled Readonly) */}
                            <tr>
                                <td style={{
                                    textAlign: 'right',
                                    verticalAlign: 'middle',
                                    paddingRight: '16px',
                                    paddingBottom: '14px',
                                    fontSize: '13.5px',
                                    color: '#222222'
                                }}>
                                    Student ID
                                </td>
                                <td style={{ verticalAlign: 'middle', paddingBottom: '14px' }}>
                                    <input
                                        type="text"
                                        value={studentId}
                                        readOnly
                                        disabled
                                        title="Prefilled from BICS Student Record (Cannot be changed)"
                                        style={{
                                            width: '310px',
                                            boxSizing: 'border-box',
                                            height: '28px',
                                            padding: '4px 8px',
                                            fontSize: '13px',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            fontWeight: 'normal',
                                            border: '1px solid #b9b9b9',
                                            borderRadius: '2px',
                                            background: '#f4f5f7',
                                            color: '#333333',
                                            cursor: 'not-allowed'
                                        }}
                                    />
                                </td>
                            </tr>

                            {/* Row 3: Email Address (Prefilled Readonly) */}
                            <tr>
                                <td style={{
                                    textAlign: 'right',
                                    verticalAlign: 'middle',
                                    paddingRight: '16px',
                                    paddingBottom: '14px',
                                    fontSize: '13.5px',
                                    color: '#222222'
                                }}>
                                    Email Address
                                </td>
                                <td style={{ verticalAlign: 'middle', paddingBottom: '14px' }}>
                                    <input
                                        type="text"
                                        value={studentEmail}
                                        readOnly
                                        disabled
                                        title="Prefilled from BICS Student Record (Cannot be changed)"
                                        style={{
                                            width: '310px',
                                            boxSizing: 'border-box',
                                            height: '28px',
                                            padding: '4px 8px',
                                            fontSize: '13px',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            fontWeight: 'normal',
                                            border: '1px solid #b9b9b9',
                                            borderRadius: '2px',
                                            background: '#f4f5f7',
                                            color: '#333333',
                                            cursor: 'not-allowed'
                                        }}
                                    />
                                </td>
                            </tr>

                            {/* Row 4: Workspace Handle (Interactive) */}
                            <tr>
                                <td style={{
                                    textAlign: 'right',
                                    verticalAlign: 'top',
                                    paddingTop: '6px',
                                    paddingRight: '16px',
                                    paddingBottom: '14px',
                                    fontSize: '13.5px',
                                    color: '#222222'
                                }}>
                                    <label htmlFor="kata-handle-input" style={{ fontWeight: 'normal', cursor: 'pointer' }}>
                                        Workspace Handle
                                    </label>
                                </td>
                                <td style={{ verticalAlign: 'top', paddingBottom: '14px' }}>
                                    <input
                                        id="kata-handle-input"
                                        type="text"
                                        value={handle}
                                        onChange={(e) => setHandle(e.target.value)}
                                        placeholder="e.g. touring_ace, algo_shogun"
                                        autoFocus
                                        disabled={isSubmitting}
                                        style={{
                                            width: '310px',
                                            boxSizing: 'border-box',
                                            height: '28px',
                                            padding: '4px 8px',
                                            fontSize: '13px',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            border: `1px solid ${
                                                status.state === 'invalid' || status.state === 'taken'
                                                    ? '#ef4444'
                                                    : status.state === 'available'
                                                    ? '#15803d'
                                                    : '#888888'
                                            }`,
                                            borderRadius: '2px',
                                            outline: 'none',
                                            background: '#ffffff'
                                        }}
                                    />
                                    {status.message && (
                                        <div style={{
                                            marginTop: '5px',
                                            fontSize: '11px',
                                            color: status.state === 'available'
                                                ? '#15803d'
                                                : status.state === 'checking'
                                                ? '#555555'
                                                : '#b91c1c',
                                            fontWeight: status.state === 'available' ? 'bold' : 'normal'
                                        }}>
                                            {status.message}
                                        </div>
                                    )}
                                </td>
                            </tr>

                            {/* Row 5: Password (Interactive) */}
                            <tr>
                                <td style={{
                                    textAlign: 'right',
                                    verticalAlign: 'top',
                                    paddingTop: '6px',
                                    paddingRight: '16px',
                                    paddingBottom: '14px',
                                    fontSize: '13.5px',
                                    color: '#222222'
                                }}>
                                    <label htmlFor="kata-password-input" style={{ fontWeight: 'normal', cursor: 'pointer' }}>
                                        BICS Password
                                    </label>
                                </td>
                                <td style={{ verticalAlign: 'top', paddingBottom: '14px' }}>
                                    <div style={{ position: 'relative', width: '310px' }}>
                                        <input
                                            id="kata-password-input"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter BICS portal password"
                                            disabled={isSubmitting}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                height: '28px',
                                                padding: '4px 48px 4px 8px',
                                                fontSize: '13px',
                                                fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                                border: '1px solid #888888',
                                                borderRadius: '2px',
                                                outline: 'none',
                                                background: '#ffffff'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={{
                                                position: 'absolute',
                                                right: '6px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                color: '#315682',
                                                textDecoration: 'underline',
                                                padding: '2px 4px'
                                            }}
                                        >
                                            {showPassword ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                    <div style={{ marginTop: '5px', fontSize: '11px', color: '#666666', lineHeight: '1.3' }}>
                                        🔒 Verified once to bind this handle to your student account.
                                    </div>
                                </td>
                            </tr>

                            {/* Row 6: Remember session checkbox matching Ref Image */}
                            <tr>
                                <td></td>
                                <td style={{ paddingBottom: '16px' }}>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#222222' }}>
                                        <input type="checkbox" defaultChecked disabled style={{ margin: 0, cursor: 'pointer' }} />
                                        Remember session on this device
                                    </label>
                                </td>
                            </tr>

                            {/* Row 7: Action Button Centered in the Form */}
                            <tr>
                                <td colSpan={2} style={{ textAlign: 'center', paddingTop: '10px', paddingBottom: '6px' }}>
                                    <button
                                        type="submit"
                                        disabled={isSubmitDisabled}
                                        onMouseEnter={() => setIsButtonHovered(true)}
                                        onMouseLeave={() => setIsButtonHovered(false)}
                                        style={{
                                            display: 'inline-block',
                                            background: isSubmitDisabled
                                                ? '#f4f4f4'
                                                : isButtonHovered
                                                ? 'linear-gradient(to bottom, #f5f5f5 0%, #dedede 100%)'
                                                : 'linear-gradient(to bottom, #ffffff 0%, #ebebeb 100%)',
                                            color: isSubmitDisabled ? '#888888' : '#000000',
                                            border: isSubmitDisabled ? '1px solid #cccccc' : '1px solid #767676',
                                            borderRadius: '2px',
                                            padding: '3px 18px',
                                            fontSize: '13px',
                                            fontWeight: 'normal',
                                            cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                                            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif',
                                            boxShadow: isSubmitDisabled
                                                ? 'none'
                                                : 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(0,0,0,0.06)'
                                        }}
                                    >
                                        {isSubmitting ? 'Registering...' : 'Register'}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </form>

                {/* Footer bar matching Codeforces Ref Image bottom divider */}
                <div style={{
                    borderTop: '1px solid #b9b9b9',
                    padding: '10px 22px',
                    background: '#f8f9fa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '11.5px',
                    color: '#666666'
                }}>
                    <span>Session will be remembered automatically via JWT token.</span>
                    <a
                        href={typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5173/main/home' : '/main/home'}
                        style={{
                            color: '#315682',
                            textDecoration: 'underline',
                            fontSize: '12px'
                        }}
                    >
                        Student Dashboard
                    </a>
                </div>
            </div>
        </div>
    );
}
