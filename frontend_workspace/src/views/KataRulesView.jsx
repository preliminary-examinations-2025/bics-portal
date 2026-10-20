import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import KataHeader from '../components/KataHeader';
import KataFooter from '../components/KataFooter';
import { useAuth } from '../context/AuthContext';

export default function KataRulesView() {
    const { candidate: authUser, profile: authProfile } = useAuth();
    const [profile, setProfile] = useState(authProfile);
    const [candidate, setCandidate] = useState(authUser);

    useEffect(() => {
        document.title = 'Kata Contest Rules & Competitive Arena Guidelines';
        if (authProfile) setProfile(authProfile);
        if (authUser) setCandidate(authUser);
    }, [authProfile, authUser]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            color: '#222222',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            <KataHeader user={candidate} profile={profile} />

            {/* Main Layout Container */}
            <main style={{
                maxWidth: '1100px',
                width: '100%',
                margin: '18px auto 40px auto',
                padding: '0 10px',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 240px',
                gap: '20px',
                alignItems: 'start',
                flex: 1,
                boxSizing: 'border-box'
            }}>
                {/* Left Column: Codeforces Blog Post Style */}
                <div style={{
                    minWidth: 0,
                    border: '1px solid #b9b9b9',
                    borderRadius: '5px',
                    padding: '24px 26px',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}>
                    {/* Blog Post Title in Codeforces Blue */}
                    <h1 style={{
                        fontSize: '22px',
                        fontWeight: '500',
                        color: '#3b5998',
                        margin: '0 0 6px 0',
                        lineHeight: '1.3',
                        letterSpacing: '-0.2px',
                        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
                    }}>
                        Kata Contest Rules & Competitive Arena Guidelines
                    </h1>

                    {/* Byline / Author metadata */}
                    <div style={{
                        fontSize: '11px',
                        color: '#777777',
                        marginBottom: '18px',
                        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
                    }}>
                        By <span style={{ color: '#3b5998', fontWeight: 'bold' }}>KataAdministration</span>, recently, 🇬🇧
                    </div>

                    {/* Blog Content with vertical gray bar on the left */}
                    <div style={{
                        borderLeft: '4px solid #b9b9b9',
                        paddingLeft: '22px',
                        color: '#222222',
                        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
                    }}>
                        {/* Subheading Greeting */}
                        <h2 style={{
                            fontSize: '18px',
                            fontWeight: '500',
                            color: '#222222',
                            margin: '0 0 16px 0',
                            lineHeight: '1.4'
                        }}>
                            Welcome to the Kata Competitive Arena!
                        </h2>

                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0' }}>
                            The Kata Competitive Arena is the official performance and evaluation platform designed to assess software engineering proficiency, high-performance computing, and modern frontend application development. This document specifies the operational rules, scoring mechanics, submission criteria, evaluation standards, virtual participation, and academic code of conduct across both arena tracks.
                        </p>

                        {/* SECTION 1 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            1. Arena Overview & Dual-Track System
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Competitions on Kata are divided into two distinct tracks catering to complementary domains of computer science and software development:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '8px' }}>
                                <strong>Kata Shin (C++ Algorithmic Track):</strong> Pure algorithmic competitive programming conducted in C++ (C++17 and C++20). Shin challenges emphasize time complexity, memory allocation limits, dynamic programming, graph algorithms, number theory, discrete mathematics, and robust edge-case handling. Solutions are executed against high-performance automated test suites with sub-second time limits.
                            </li>
                            <li>
                                <strong>Kata Forma (Web Development Frontend Track):</strong> Engineering and design challenges focusing on modern frontend web development. Forma challenges require participants to construct user interfaces, implement responsive layouts, manage client-side state, interact with browser APIs, and deliver accurate visual components using HTML5, CSS3, JavaScript (ES6+), and React. Solutions are evaluated against functional requirements, visual layout fidelity, event handling, and interface specifications.
                            </li>
                        </ul>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 16px 0' }}>
                            <strong>Independent Ratings:</strong> Every participant holds an independent <em>Shin Rating</em> (for C++ algorithms) and <em>Forma Rating</em> (for Frontend Web Dev). Competing in a Shin contest only affects your Shin rating, and competing in Forma only updates your Forma rating.
                        </p>

                        {/* SECTION 2 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            2. Live Rated Contests
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Live contests are scheduled competitive rounds open to all registered BICS candidates:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Registration Window:</strong> Contest registration opens 24 to 48 hours prior to the scheduled start time. Candidates must register before the countdown timer hits <code>00:00:00</code>. You may freely deregister at any time before the contest commences.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Duration:</strong> Contests typically run for <strong>2 hours to 2 hours and 30 minutes</strong>.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Problem Progression:</strong> Contests present problems ordered alphabetically by difficulty (A, B, C, D, E...). Each problem contains complete specifications, constraints, input/output formats, and sample test cases (for Shin) or design requirements and component behavioral specifications (for Forma).
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Free Navigation:</strong> Participants may solve, edit, and submit solutions to any problem in any order throughout the round.
                            </li>
                            <li>
                                <strong>Submission Cooldown:</strong> To ensure server responsiveness and prevent submission flooding, a mandatory submission gap is enforced between consecutive submissions (<strong>30 seconds for Shin</strong> and <strong>45 seconds for Forma</strong>).
                            </li>
                        </ul>

                        {/* SECTION 3 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            3. Scoring Mechanics & Attempt Penalties
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Kata employs standard dynamic point decay to reward both correctness and solving speed:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Initial Point Ceilings:</strong> Problems carry initial point weights based on difficulty (e.g., 500, 1000, 1500, 2000 points).
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Dynamic Point Decay:</strong> As time passes during the round, the awarded score for an Accepted submission decreases continuously with each elapsed minute.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Attempt Penalties:</strong> Each unsuccessful attempt (Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error) submitted <em>prior</em> to achieving Accepted deducts <strong>50 points</strong> from that problem's final earned score.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Compilation Error (CE):</strong> Submissions that fail compilation or syntax linting do not count as incorrect attempts and carry <strong>0 penalty points</strong>.
                            </li>
                            <li>
                                <strong>Score Floor:</strong> Regardless of time decay or failed attempts, an Accepted submission will always yield at least <strong>30%</strong> of the problem's initial point ceiling.
                            </li>
                        </ul>

                        {/* SECTION 4 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            4. Evaluation Engine & Verdicts
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Submissions are evaluated through an automated testing pipeline in an isolated execution sandbox. The following standard verdicts are returned:
                        </p>

                        {/* Monochromatic Table */}
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            margin: '14px 0 18px 0',
                            fontSize: '13px'
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #cccccc' }}>
                                    <th style={{ border: '1px solid #d0d0d0', padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Code</th>
                                    <th style={{ border: '1px solid #d0d0d0', padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Verdict</th>
                                    <th style={{ border: '1px solid #d0d0d0', padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Evaluation Meaning</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>AC</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Accepted</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Passed all test cases and functional requirements within resource constraints.</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>WA</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Wrong Answer</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>The output or component behavior failed to match the expected specification.</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>TLE</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Time Limit Exceeded</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Execution duration exceeded the problem CPU time limit on at least one test case.</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>MLE</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Memory Limit Exceeded</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>The solution exceeded the allocated resident RAM memory constraint.</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>RTE</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Runtime Error</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>The process crashed or exited with a non-zero exit code (segfault, exception, fatal error).</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>CE</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Compilation Error</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Code failed to compile or bundle. Does not incur an attempt penalty.</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>PEND</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Awaiting Evaluation</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Submission has been received and is queued for automated sandbox execution.</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold', fontFamily: 'monospace' }}>DEP</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Deprecated</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px' }}>Historical or superseded submission run.</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* SECTION 5 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            5. Pretests vs. System Testing
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Contests utilize a structured two-stage testing protocol:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Pretests:</strong> Submissions made during the contest are immediately evaluated against preliminary test suites. Passing pretests grants tentative points and provisional standings on the live scoreboard.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>System Testing Phase:</strong> Once the contest clock finishes, the round enters System Testing. All preliminary accepted solutions are tested against comprehensive, hidden test suites containing stress cases, maximum constraints, and rigorous edge tests.
                            </li>
                            <li>
                                <strong>Score Finalization:</strong> If a solution fails system testing, its points are retracted. Once system testing concludes, contest standings become final and immutable.
                            </li>
                        </ul>

                        {/* SECTION 6 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            6. Rating Adjustments & Ranks
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Kata employs an adapted competitive Elo performance formula. Following official system testing, each participant's rating delta is calculated by comparing their actual finish against their statistically expected rank:
                        </p>

                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            margin: '14px 0 18px 0',
                            fontSize: '13px'
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #cccccc' }}>
                                    <th style={{ border: '1px solid #d0d0d0', padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Rank Title</th>
                                    <th style={{ border: '1px solid #d0d0d0', padding: '6px 10px', textAlign: 'left', fontWeight: 'bold' }}>Rating Range</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Newbie</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>0 — 1199</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Pupil</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>1200 — 1399</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Specialist</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>1400 — 1599</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Expert</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>1600 — 1899</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Candidate Master</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>1900 — 2199</td>
                                </tr>
                                <tr style={{ backgroundColor: '#fafafa' }}>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Master</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>2200 — 2399</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontWeight: 'bold' }}>Grandmaster</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '6px 10px', fontFamily: 'monospace' }}>2400+</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* SECTION 7 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            7. Virtual Contests (The Gym)
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            The Gym allows participants to simulate a concluded live contest with authentic timing and evaluation conditions:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Strictly Unrated:</strong> Virtual contests are practice simulations. To preserve leaderboard integrity, virtual rounds do not adjust official ratings.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Authentic Countdown:</strong> The virtual contest timer ticks down in real time matching the original contest duration.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Scoreboard Placement:</strong> Submissions are evaluated in real time, projecting your score directly into the historical contest scoreboard alongside original participants.
                            </li>
                            <li>
                                <strong>Single Attempt Limit:</strong> A contest can only be taken virtually once per handle. After completion, all problems remain open for untimed practice in the Problemset.
                            </li>
                        </ul>

                        {/* SECTION 8 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            8. Problemset Catalog
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Following contest finalization, problems are moved to the public <strong>Problemset</strong>:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Untimed Practice:</strong> Work on problems at your own pace without timer constraints.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Immediate Full Suite Evaluation:</strong> Submissions in the problemset are immediately tested against the entire system test suite.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Topic & Track Filtering:</strong> Filter by track (Kata Shin for C++ algorithms vs. Kata Forma for Web Dev Frontend) and by topic tags (e.g. Dynamic Programming, Graph Theory, Trees, Greedy, DOM Manipulation, CSS Flexbox/Grid, React Components, Client State).
                            </li>
                            <li>
                                <strong>Profile Record:</strong> Solved problems permanently count toward your profile problem total and activity heatmap.
                            </li>
                        </ul>

                        {/* SECTION 9 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            9. Execution Sandbox & Constraints
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            All code submitted is compiled and evaluated in an isolated sandbox environment enforcing strict operational constraints:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Shin I/O Streams:</strong> For C++ algorithmic problems, solutions must read exclusively from <code>stdin</code> and write to <code>stdout</code>. File access and network sockets are blocked.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Exit Code:</strong> C++ programs must exit cleanly with code <code>0</code>. Non-zero exit codes trigger a <em>Runtime Error (RTE)</em>.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Per-Test Limits:</strong> The stated CPU time limit applies individually to each test case, not cumulatively across the test suite.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                <strong>Fast I/O Recommendation:</strong> For C++ solutions handling large datasets (\(N \ge 10^5\)), include <code>std::cin.tie(NULL); std::ios_base::sync_with_stdio(false);</code> and use <code>'\n'</code> instead of <code>std::endl</code>.
                            </li>
                            <li>
                                <strong>Forma Sandbox:</strong> For Web Dev Frontend challenges, component code is evaluated against automated functional suites, DOM structure assertions, and behavioral UI tests.
                            </li>
                        </ul>

                        {/* SECTION 10 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            10. Academic Integrity & Fair Play
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                            Kata maintains zero tolerance for competitive dishonesty:
                        </p>
                        <ul style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 14px 0', paddingLeft: '22px' }}>
                            <li style={{ marginBottom: '6px' }}>
                                All code submitted during a live contest must be written solely by the registered participant during the active round.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                Sharing, discussing, or posting solutions or partial solutions during the contest is strictly forbidden.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                Operating multiple handles or using proxy accounts during rated contests is prohibited.
                            </li>
                            <li style={{ marginBottom: '6px' }}>
                                Automated post-contest code similarity analysis is run on all accepted solutions.
                            </li>
                            <li>
                                Violations result in immediate contest disqualification, rating rollback, and disciplinary referral under BICS institutional policies.
                            </li>
                        </ul>

                        {/* SECTION 11 */}
                        <h3 style={{
                            color: '#3b5998',
                            fontSize: '16.5px',
                            fontWeight: '600',
                            margin: '24px 0 10px 0',
                            borderBottom: '1px solid #e5e5e5',
                            paddingBottom: '4px'
                        }}>
                            11. Frequently Asked Questions
                        </h3>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 6px 0' }}>
                            <strong>Q: Can I use pre-written templates or standard library utilities?</strong><br />
                            A: Yes. Standard libraries (e.g., C++ STL, standard web APIs) and personal templates authored by you prior to the round are fully permitted.
                        </p>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 6px 0' }}>
                            <strong>Q: What happens if my browser closes or network drops?</strong><br />
                            A: Contest timing is tracked centrally on the server. You can immediately reopen the contest from any authenticated session and continue where you left off.
                        </p>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 6px 0' }}>
                            <strong>Q: Does Compilation Error (CE) add penalty time?</strong><br />
                            A: No. Compilation errors carry no penalty points and do not add to your penalty time.
                        </p>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', margin: '0 0 0 0' }}>
                            <strong>Q: Why did my rating not change after a virtual contest?</strong><br />
                            A: Virtual contests are unrated practice sessions. Only live rated contests adjust official participant ratings.
                        </p>
                    </div>
                </div>

                {/* Right Column: Codeforces Style Side Boxes */}
                <div>
                    {/* Contest Notice Box */}
                    <div style={{
                        border: '1px solid #b9b9b9',
                        borderRadius: '5px',
                        backgroundColor: '#ffffff',
                        marginBottom: '16px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{
                            borderBottom: '1px solid #b9b9b9',
                            padding: '6px 10px',
                            fontWeight: 'bold',
                            color: '#3b5998',
                            fontSize: '12px',
                            backgroundColor: '#f8f8f8'
                        }}>
                            → Quick Links
                        </div>
                        <div style={{ padding: '10px 12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <Link to="/kata/contests" style={{ color: '#3b5998', textDecoration: 'none' }}>
                                » Upcoming Contests
                            </Link>
                            <Link to="/kata/gym" style={{ color: '#3b5998', textDecoration: 'none' }}>
                                » Virtual Gym
                            </Link>
                            <Link to="/kata/problemset" style={{ color: '#3b5998', textDecoration: 'none' }}>
                                » Problemset Archive
                            </Link>
                            <Link to="/kata/submissions" style={{ color: '#3b5998', textDecoration: 'none' }}>
                                » Global Submissions
                            </Link>
                        </div>
                    </div>

                    {/* Arena Tracks Box */}
                    <div style={{
                        border: '1px solid #b9b9b9',
                        borderRadius: '5px',
                        backgroundColor: '#ffffff',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{
                            borderBottom: '1px solid #b9b9b9',
                            padding: '6px 10px',
                            fontWeight: 'bold',
                            color: '#3b5998',
                            fontSize: '12px',
                            backgroundColor: '#f8f8f8'
                        }}>
                            → Competition Tracks
                        </div>
                        <div style={{ padding: '10px 12px', fontSize: '12px', lineHeight: '1.5' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <strong style={{ color: '#222222' }}>Kata Shin:</strong><br />
                                C++ Algorithmic track. Tests data structures, computational complexity, and runtime efficiency.
                            </div>
                            <div>
                                <strong style={{ color: '#222222' }}>Kata Forma:</strong><br />
                                Web Dev Frontend track. Tests UI engineering, components, responsive styling, and client state.
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <KataFooter />
        </div>
    );
}
