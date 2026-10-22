import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import KataContestSubNav from '../components/KataContestSubNav';
import { useAuth } from '../context/AuthContext';

export default function KataContestParticipantsView() {
    const { contestId } = useParams();
    const { candidate: authUser, profile: authProfile } = useAuth();

    const [contest, setContest] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [searchFilter, setSearchFilter] = useState('');

    const profile = authProfile;
    const user = authUser;

    useEffect(() => {
        document.title = `Participants | ${contestId} | Kata`;

        const token = localStorage.getItem('bics_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        fetch(`/api/kata/contests/${contestId}/participants`, { headers })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setContest(data.contest);
                    setParticipants(data.participants || []);
                } else {
                    setErrorMsg(data.error || 'Failed to load contest participants');
                }
                setLoading(false);
            })
            .catch(err => {
                setErrorMsg('Network error fetching participants');
                setLoading(false);
            });
    }, [contestId]);

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }) + ' IST';
    };

    const filteredParticipants = participants.filter(p => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        return (
            (p.username || '').toLowerCase().includes(q) ||
            (p.displayName || '').toLowerCase().includes(q) ||
            (p.rank || '').toLowerCase().includes(q)
        );
    });

    const isScheduled = contest ? (contest.isScheduled ?? (new Date() < new Date(contest.startTime))) : true;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#222' }}>
            <KataHeader user={user} profile={profile} />

            <main style={{ maxWidth: '1100px', width: '100%', margin: '18px auto', padding: '0 10px', flex: 1, boxSizing: 'border-box' }}>
                <KataContestSubNav contestId={contestId} isScheduled={isScheduled} />

                {/* Main Card */}
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #b9b9b9',
                    borderRadius: '5px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    overflow: 'hidden',
                    fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
                }}>
                    {/* Header bar */}
                    <div style={{
                        background: 'linear-gradient(to bottom, #f8f8f8 0%, #ebebeb 100%)',
                        padding: '10px 16px',
                        borderBottom: '1px solid #b9b9b9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div>
                            <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#3b5998' }}>
                                Participants of {contest?.title || contestId}
                            </span>
                            <span style={{ marginLeft: '10px', fontSize: '11px', color: '#666666' }}>
                                Total registered: <strong>{participants.length}</strong>
                            </span>
                        </div>

                        {/* Search input */}
                        <div>
                            <input
                                type="text"
                                placeholder="Search by handle or name..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    border: '1px solid #cccccc',
                                    borderRadius: '3px',
                                    width: '200px'
                                }}
                            />
                        </div>
                    </div>

                    {/* Table Body */}
                    <div style={{ padding: '0' }}>
                        {loading ? (
                            <div style={{ padding: '36px', textAlign: 'center', color: '#777777', fontSize: '12px' }}>
                                Loading participants list...
                            </div>
                        ) : errorMsg ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#dc2626', fontSize: '12px' }}>
                                ⚠️ {errorMsg}
                            </div>
                        ) : filteredParticipants.length === 0 ? (
                            <div style={{ padding: '36px', textAlign: 'center', color: '#666666', fontSize: '12px' }}>
                                {participants.length === 0 
                                    ? 'No candidates have registered for this contest yet.' 
                                    : 'No participants match your search criteria.'}
                            </div>
                        ) : (
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '12px'
                            }}>
                                <thead>
                                    <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #d4d4d4', textAlign: 'left', height: '32px' }}>
                                        <th style={{ padding: '6px 12px', width: '45px', textAlign: 'center', fontWeight: 'bold', color: '#333333' }}>#</th>
                                        <th style={{ padding: '6px 12px', fontWeight: 'bold', color: '#333333' }}>Handle</th>
                                        <th style={{ padding: '6px 12px', fontWeight: 'bold', color: '#333333' }}>Name</th>
                                        <th style={{ padding: '6px 12px', width: '90px', textAlign: 'center', fontWeight: 'bold', color: '#333333' }}>Rating</th>
                                        <th style={{ padding: '6px 12px', width: '130px', textAlign: 'center', fontWeight: 'bold', color: '#333333' }}>Rank Tier</th>
                                        <th style={{ padding: '6px 14px', width: '170px', textAlign: 'right', fontWeight: 'bold', color: '#333333' }}>Registered (IST)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredParticipants.map((p, idx) => {
                                        const isEven = idx % 2 === 0;
                                        return (
                                            <tr
                                                key={p.candidateId || idx}
                                                style={{
                                                    background: isEven ? '#ffffff' : '#f9f9f9',
                                                    borderBottom: '1px solid #e7e7e7',
                                                    height: '34px'
                                                }}
                                            >
                                                <td style={{ padding: '6px 12px', textAlign: 'center', color: '#777777', fontSize: '11px' }}>
                                                    {p.index || idx + 1}
                                                </td>
                                                <td style={{ padding: '6px 12px' }}>
                                                    <span style={{
                                                        color: p.rankColor || '#008000',
                                                        fontWeight: 'bold',
                                                        fontSize: '12px'
                                                    }}>
                                                        {p.username}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '6px 12px', color: '#444444' }}>
                                                    {p.displayName || p.username}
                                                </td>
                                                <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', color: p.rankColor || '#333333' }}>
                                                    {p.rating || 1200}
                                                </td>
                                                <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 'bold',
                                                        color: p.rankColor || '#666666'
                                                    }}>
                                                        {p.rank || 'Apprentice'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '6px 14px', textAlign: 'right', color: '#555555', fontSize: '11px' }}>
                                                    {formatDateTime(p.registeredAt)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>

            <KataFooter />
        </div>
    );
}
