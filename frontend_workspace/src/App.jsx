import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AuthGuard from './components/AuthGuard';

import KataHubView from './views/KataHubView';
import KataContestsListView from './views/KataContestsListView';
import KataContestRegisterView from './views/KataContestRegisterView';
import KataVirtualRegisterView from './views/KataVirtualRegisterView';
import KataContestDashboardView from './views/KataContestDashboardView';
import KataProblemDetailView from './views/KataProblemDetailView';
import KataContestSubmitView from './views/KataContestSubmitView';
import KataContestSubmissionsView from './views/KataContestSubmissionsView';
import KataGymView from './views/KataGymView';
import KataProblemsetView from './views/KataProblemsetView';
import KataStandingsView from './views/KataStandingsView';
import KataContestParticipantsView from './views/KataContestParticipantsView';
import KataRegisterPage from './views/KataRegisterPage';
import KataRulesView from './views/KataRulesView';
import { useAuth } from './context/AuthContext';

function RegisterRoute() {
    const { candidate, profile, onHandleRegistered } = useAuth();
    if (profile?.handle) {
        return <Navigate to="/kata" replace />;
    }
    return <KataRegisterPage candidate={candidate} onRegistered={onHandleRegistered} />;
}

function LogoutHandler() {
    React.useEffect(() => {
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) {}

        const isFramed = typeof window !== 'undefined' && window.self !== window.top;
        if (isFramed) {
            try {
                window.parent.postMessage({ type: 'KATA_LOGOUT_SUCCESS' }, '*');
            } catch (e) {}
            return;
        }

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const target = isLocal ? 'http://localhost:5173/main/login?clean=1' : '/main/login?clean=1';
        window.location.replace(target);
    }, []);

    return <div style={{ minHeight: '100vh', background: '#ffffff' }} />;
}

export default function App() {
    React.useEffect(() => {
        const handleMessage = (e) => {
            if (e.data?.type === 'BICS_LOGOUT') {
                try {
                    localStorage.clear();
                    sessionStorage.clear();
                } catch (err) {}
            }
        };
        window.addEventListener('message', handleMessage);

        let authChannel = null;
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                authChannel = new BroadcastChannel('bics_auth_sync');
                authChannel.onmessage = (e) => {
                    if (e.data?.type === 'BICS_LOGOUT') {
                        try {
                            localStorage.clear();
                            sessionStorage.clear();
                        } catch (err) {}
                    }
                };
            }
        } catch (e) {}

        return () => {
            window.removeEventListener('message', handleMessage);
            if (authChannel) {
                try { authChannel.close(); } catch (e) {}
            }
        };
    }, []);

    const isLogout = typeof window !== 'undefined' && (
        window.location.pathname.includes('/logout') || 
        window.location.search.includes('clean=1')
    );

    if (isLogout) {
        return <LogoutHandler />;
    }

    return (
        <AuthProvider>
            <BrowserRouter basename="/workspace">
                <AuthGuard>
                        <Routes>
                        {/* Registration Route */}
                        <Route path="/register" element={<RegisterRoute />} />
                        <Route path="/kata/register" element={<RegisterRoute />} />

                        {/* Kata Hub & Profile */}
                        <Route path="/kata" element={<KataHubView />} />
                        <Route path="/kata/profile/:handle" element={<KataHubView />} />
                        <Route path="/profile/:handle" element={<KataHubView />} />

                        {/* Contest Rules */}
                        <Route path="/kata/rules" element={<KataRulesView />} />
                        <Route path="/rules" element={<KataRulesView />} />

                        {/* Contests Hub */}
                        <Route path="/kata/contests" element={<KataContestsListView />} />

                        {/* Gym Hub (Virtual Participation for Concluded Contests) */}
                        <Route path="/kata/gym" element={<KataGymView />} />

                        {/* Problemset Catalog */}
                        <Route path="/problemset" element={<KataProblemsetView />} />
                        <Route path="/kata/problemset" element={<KataProblemsetView />} />

                        {/* Problem Statement Detail on Problemset Route (Concluded contests) */}
                        <Route path="/problemset/problem/:contestId/:letter" element={<KataProblemDetailView isProblemsetRoute={true} />} />
                        <Route path="/kata/problemset/problem/:contestId/:letter" element={<KataProblemDetailView isProblemsetRoute={true} />} />

                        {/* Problemset Status Route */}
                        <Route path="/problemset/status" element={<KataContestSubmissionsView isProblemsetRoute={true} />} />
                        <Route path="/kata/problemset/status" element={<KataContestSubmissionsView isProblemsetRoute={true} />} />

                        {/* Contest Registration */}
                        <Route path="/kata/contests/:contestId/register" element={<KataContestRegisterView />} />
                        <Route path="/contests/:contestId/register" element={<KataContestRegisterView />} />

                        {/* Contest Participants */}
                        <Route path="/kata/contests/:contestId/participants" element={<KataContestParticipantsView />} />
                        <Route path="/contests/:contestId/participants" element={<KataContestParticipantsView />} />

                        {/* Virtual Participation Registration */}
                        <Route path="/kata/contests/:contestId/virtual-register" element={<KataVirtualRegisterView />} />
                        <Route path="/contests/:contestId/virtual-register" element={<KataVirtualRegisterView />} />
                        <Route path="/kata/gym/:contestId/register" element={<KataVirtualRegisterView />} />
                        <Route path="/gym/:contestId/register" element={<KataVirtualRegisterView />} />

                        {/* Contest Dashboard & Problemset */}
                        <Route path="/kata/contests/:contestId" element={<KataContestDashboardView />} />
                        <Route path="/contests/:contestId" element={<KataContestDashboardView />} />
                        <Route path="/contest/:contestId" element={<KataContestDashboardView />} />

                        {/* Problem Statement Detail on Contest Route (Live / Running contests) */}
                        <Route path="/kata/contests/:contestId/problem/:letter" element={<KataProblemDetailView isProblemsetRoute={false} />} />
                        <Route path="/contests/:contestId/problem/:letter" element={<KataProblemDetailView isProblemsetRoute={false} />} />
                        <Route path="/contest/:contestId/problem/:letter" element={<KataProblemDetailView isProblemsetRoute={false} />} />
                        <Route path="/contest/problem/:contestId/:letter" element={<KataProblemDetailView isProblemsetRoute={false} />} />

                        {/* Submit Code */}
                        <Route path="/kata/contests/:contestId/submit" element={<KataContestSubmitView />} />
                        <Route path="/contests/:contestId/submit" element={<KataContestSubmitView />} />

                        {/* Contest Submissions Log & Overall Submissions Feed */}
                        <Route path="/kata/contests/:contestId/submissions" element={<KataContestSubmissionsView />} />
                        <Route path="/contests/:contestId/submissions" element={<KataContestSubmissionsView />} />
                        <Route path="/contest/:contestId/submissions" element={<KataContestSubmissionsView />} />
                        <Route path="/kata/submissions" element={<KataContestSubmissionsView />} />
                        <Route path="/submissions" element={<KataContestSubmissionsView />} />
                        <Route path="/kata/status" element={<KataContestSubmissionsView />} />
                        <Route path="/status" element={<KataContestSubmissionsView />} />

                        {/* Contest Standings */}
                        <Route path="/kata/contests/:contestId/standings" element={<KataStandingsView />} />
                        <Route path="/contests/:contestId/standings" element={<KataStandingsView />} />
                        <Route path="/contest/:contestId/standings" element={<KataStandingsView />} />

                        {/* Short aliases */}
                        <Route path="/contests" element={<KataContestsListView />} />
                        <Route path="/gym" element={<KataGymView />} />

                        {/* Fallback routes */}
                        <Route path="/" element={<Navigate to="/kata" replace />} />
                        <Route path="*" element={<Navigate to="/kata" replace />} />
                    </Routes>
                </AuthGuard>
            </BrowserRouter>
        </AuthProvider>
    );
}
