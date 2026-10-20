import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataProfileCard from '../components/KataProfileCard';
import KataRatingGraph from '../components/KataRatingGraph';
import KataHeatmap from '../components/KataHeatmap';
import KataSidebar from '../components/KataSidebar';
import KataFooter from '../components/KataFooter';
import CodeforcesPillFilter from '../components/CodeforcesPillFilter';
import { kataApi } from '../utils/kataApi';
import { useAuth } from '../context/AuthContext';

export default function KataHubView() {
    const { handle: routeHandle } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const queryHandle = new URLSearchParams(location.search).get('handle');
    const targetHandle = routeHandle || queryHandle;

    const { candidate: authUser, profile: authProfile } = useAuth();
    const [profile, setProfile] = useState(authProfile);
    const [candidate, setCandidate] = useState(authUser);
    const [leaderboard, setLeaderboard] = useState({ shin: [], forma: [], topContributors: [] });
    const [upcomingContests, setUpcomingContests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState('profile');

    const handle = profile?.handle || candidate?.username || 'siyam-bubere';

    const subNavItems = [
        { id: 'profile', label: handle.toUpperCase() },
        { id: 'settings', label: 'SETTINGS' },
        { id: 'lists', label: 'LISTS' },
        { id: 'blog', label: 'BLOG' },
        { id: 'teams', label: 'TEAMS' },
        { id: 'submissions', label: 'SUBMISSIONS' },
        { id: 'contests', label: 'CONTESTS' }
    ];

    const handleSubTabChange = (id) => {
        setActiveSubTab(id);
        if (id === 'submissions') {
            navigate('/kata/submissions');
        } else if (id === 'contests') {
            navigate('/kata/contests');
        }
    };

    useEffect(() => {
        document.title = `${handle} - Codeforces | Kata`;
        if (targetHandle) {
            handleFindUser(targetHandle);
        } else {
            if (authProfile) setProfile(authProfile);
            if (authUser) setCandidate(authUser);
        }
    }, [authProfile, authUser, targetHandle]);

    useEffect(() => {
        loadAuxData();
    }, []);

    const loadAuxData = async () => {
        setIsLoading(true);
        try {
            const [shinLb, formaLb, contestsRes] = await Promise.all([
                kataApi.getLeaderboard('shin'),
                kataApi.getLeaderboard('forma'),
                kataApi.getUpcomingContests()
            ]);

            setLeaderboard({
                shin: shinLb.topRated || [],
                forma: formaLb.topRated || [],
                topContributors: shinLb.topContributors || []
            });

            setUpcomingContests(contestsRes.contests || []);
        } catch (err) {
            console.error('Error loading Kata Hub auxiliary data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFindUser = async (targetHandle) => {
        try {
            const res = await kataApi.getProfile(targetHandle);
            if (res.success && res.profile) {
                setProfile(res.profile);
                setCandidate(res.candidate);
            } else {
                alert(`User "${targetHandle}" not found.`);
            }
        } catch {
            alert(`Error finding user "${targetHandle}".`);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            color: '#222222',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Header */}
            <KataHeader
                user={candidate}
                profile={profile}
                onSearch={handleFindUser}
            />

            {/* Profile Subnav Tabs above Main Grid */}
            <div style={{
                maxWidth: '1100px',
                width: '100%',
                margin: '10px auto 10px auto',
                padding: '0 10px',
                boxSizing: 'border-box'
            }}>
                <CodeforcesPillFilter
                    items={subNavItems}
                    activeId={activeSubTab}
                    onChange={handleSubTabChange}
                    gap={6}
                />
            </div>

            {/* Main Content Layout Container */}
            <main style={{
                maxWidth: '1100px',
                width: '100%',
                margin: '0 auto 30px auto',
                padding: '0 10px',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 250px',
                gap: '16px',
                alignItems: 'start',
                flex: 1,
                boxSizing: 'border-box'
            }}>
                {/* Left Column: Profile Card + Rating Curve + Heatmap */}
                <div style={{ minWidth: 0 }}>
                    <KataProfileCard profile={profile} candidate={candidate} />
                    <KataRatingGraph profile={profile} />
                    <KataHeatmap profile={profile} />
                </div>

                {/* Right Sidebar: Pay Attention, Streams, Mini User, Top Rated, Top Contributors */}
                <div>
                    <KataSidebar
                        profile={profile}
                        candidate={candidate}
                        leaderboard={leaderboard}
                        upcomingContests={upcomingContests}
                        onFindUser={handleFindUser}
                    />
                </div>
            </main>

            {/* Common Authenticated Footer */}
            <KataFooter />
        </div>
    );
}
