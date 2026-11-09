/**
 * Authoritative Server-Side EIRF Incident Evaluator
 * 
 * Implements the 4 Golden Flag Rules for Emergency Incident Report Form (EIRF) triggering:
 * 
 * Rule 1: Total Minor Warnings Exceeded
 *   - Cumulative minor warning duration >= 5% of exam duration (e.g. >= 180s for 60m exam), OR
 *   - Explicit 'MINOR_WARNINGS_EXCEEDED' event present in proctoring telemetry.
 * 
 * Rule 2: Major Warnings Severity & Frequency
 *   - Any individual major violation (Fullscreen exit, Tab switch, Inspect attempt) duration > 5s, OR
 *   - totalMajorWarnings > 1 (fullscreenExits + tabSwitches + inspectAttempts > 1).
 * 
 * Rule 3: Network Disconnection Duration (> 5 seconds)
 *   - Any 'NETWORK_OFFLINE' event with durationSeconds > 5, OR
 *   - Any server-observed heartbeat gap >= 10s (2 consecutive missed 5s heartbeats).
 *   - Transient network drops <= 5s are within normal internet jitter tolerance and DO NOT flag EIRF.
 * 
 * Rule 4: Involuntary Auto-Submitted Sessions
 *   - Session status is 'auto-submitted' due to proctoring violation limit, overtime (> 120s grace),
 *     or Dead-Man Reaper harvesting an abandoned session.
 *   - CRITICAL EXCEPTION: Natural timer countdown to 00:00 submitted with status 'submitted'
 *     is normal, compliant student behavior and NEVER triggers an EIRF flag.
 * 
 * @param {Object} submission - TestSubmission document / plain object
 * @param {Object} testConfig - TestConfig document / plain object (duration, title, etc.)
 * @returns {Object} { hasEirfFlag: boolean, eirfStatus: string, flaggedReasons: string[], ruleBreakdown: Object }
 */

function evaluateEirfIncident(submission, testConfig = {}) {
    const flaggedReasons = [];
    const proctoringLog = submission?.proctoringLog || {};
    const events = Array.isArray(proctoringLog.events) ? proctoringLog.events : [];
    
    const fsExits = Number(proctoringLog.fullscreenExits || 0);
    const tabSwitches = Number(proctoringLog.tabSwitches || 0);
    const inspectAttempts = Number(proctoringLog.inspectAttempts || 0);
    const totalMajorWarnings = fsExits + tabSwitches + inspectAttempts;

    const ruleBreakdown = {
        rule1_minorWarningsExceeded: false,
        rule2_majorWarningSeverityOrCount: false,
        rule3_networkDisconnectOver5s: false,
        rule4_involuntaryAutoSubmitted: false,
        details: {
            totalMajorWarnings,
            maxMajorDurationSec: 0,
            maxOfflineDurationSec: 0,
            cumulativeMinorSec: 0,
            minorThresholdSec: 0
        }
    };

    // -------------------------------------------------------------
    // RULE 1: Total Minor Warnings Exceeded
    // -------------------------------------------------------------
    const examDurationMin = Number(testConfig?.duration || submission?.testDuration || 60);
    const minorThresholdSec = Math.max(10, Math.round(examDurationMin * 60 * 0.05));
    ruleBreakdown.details.minorThresholdSec = minorThresholdSec;

    let hasMinorThresholdEvent = false;
    let cumulativeMinorSec = 0;

    events.forEach(ev => {
        if (!ev) return;
        const evType = String(ev.type || '');
        if (evType === 'MINOR_WARNINGS_EXCEEDED') {
            hasMinorThresholdEvent = true;
        }

        const isMinorType = [
            'VOICE_DETECTED', 
            'FACE_MISSING', 
            'LOOKING_AWAY', 
            'MULTI_FACE', 
            'RIGHT_CLICK_BLOCKED'
        ].includes(evType);

        if (isMinorType) {
            let dur = Number(ev.durationSeconds || 0);
            if (!dur && ev.details) {
                const match = ev.details.match(/(?:for|after)\s+(\d+)\s+seconds/i) || ev.details.match(/(\d+)\s*seconds/i);
                if (match && match[1]) dur = parseInt(match[1], 10);
            }
            cumulativeMinorSec += (dur > 0 ? dur : 1);
        }
    });

    ruleBreakdown.details.cumulativeMinorSec = cumulativeMinorSec;

    if (hasMinorThresholdEvent || cumulativeMinorSec >= minorThresholdSec) {
        ruleBreakdown.rule1_minorWarningsExceeded = true;
        flaggedReasons.push(
            `Cumulative minor proctoring warnings exceeded 5% exam duration threshold (${minorThresholdSec}s).`
        );
    }

    // -------------------------------------------------------------
    // RULE 2: Major Warnings Severity (> 5s) OR Frequency (> 1)
    // -------------------------------------------------------------
    let maxMajorDurationSec = 0;
    let majorViolationName = '';

    events.forEach(ev => {
        if (!ev) return;
        const evType = String(ev.type || '');
        const isMajor = [
            'FULLSCREEN_EXIT', 
            'FULLSCREEN_RETURNED', 
            'TAB_SWITCH', 
            'TAB_RETURNED', 
            'INSPECT_ATTEMPT', 
            'DEVTOOLS_SHORTCUT',
            'DEVTOOLS_OPENED'
        ].some(t => evType.includes(t));

        if (isMajor) {
            let dur = Number(ev.durationSeconds || 0);
            if (!dur && ev.details) {
                const match = ev.details.match(/(?:for|after)\s+(\d+)\s+seconds/i) || ev.details.match(/(\d+)\s*seconds/i);
                if (match && match[1]) dur = parseInt(match[1], 10);
            }
            if (dur > maxMajorDurationSec) {
                maxMajorDurationSec = dur;
                majorViolationName = evType;
            }
        }
    });

    ruleBreakdown.details.maxMajorDurationSec = maxMajorDurationSec;

    const hasLongMajorViolation = maxMajorDurationSec > 5;
    const hasMultipleMajorWarnings = totalMajorWarnings > 1;

    if (hasLongMajorViolation || hasMultipleMajorWarnings) {
        ruleBreakdown.rule2_majorWarningSeverityOrCount = true;
        if (hasLongMajorViolation) {
            flaggedReasons.push(
                `Major proctoring violation (${majorViolationName || 'Fullscreen/Tab focus'}) exceeded 5 seconds duration (${maxMajorDurationSec}s).`
            );
        }
        if (hasMultipleMajorWarnings) {
            flaggedReasons.push(
                `Total major proctoring violations exceeded allowed limit: ${totalMajorWarnings} major warnings recorded.`
            );
        }
    }

    // -------------------------------------------------------------
    // RULE 3: Network Disconnection Duration (> 5 seconds)
    // -------------------------------------------------------------
    let maxOfflineDurationSec = 0;

    // 3A. Check client monotonic duration telemetry
    events.forEach(ev => {
        if (!ev) return;
        const evType = String(ev.type || '');
        if (evType === 'NETWORK_OFFLINE' || evType === 'EMERGENCY_SUBMISSION') {
            let dur = Number(ev.durationSeconds || 0);
            if (!dur && ev.details) {
                const match = ev.details.match(/(?:for|after|lasted)\s+(\d+(?:\.\d+)?)\s*s(?:econds)?/i);
                if (match && match[1]) dur = parseFloat(match[1]);
            }
            if (dur > maxOfflineDurationSec) {
                maxOfflineDurationSec = dur;
            }
        }
    });

    // 3B. Check server-observed heartbeat gaps (>= 10s gap proves >= 5s downtime on 5s heartbeat pulse)
    const serverOfflineGaps = Array.isArray(proctoringLog.serverOfflineGaps) ? proctoringLog.serverOfflineGaps : [];
    serverOfflineGaps.forEach(gap => {
        const gapSec = Number(gap.gapSeconds || 0);
        const downtimeSec = Number(gap.downtimeSeconds || (gapSec >= 10 ? gapSec - 5 : 0));
        if (downtimeSec > maxOfflineDurationSec) {
            maxOfflineDurationSec = downtimeSec;
        }
    });

    ruleBreakdown.details.maxOfflineDurationSec = maxOfflineDurationSec;

    if (maxOfflineDurationSec > 5) {
        ruleBreakdown.rule3_networkDisconnectOver5s = true;
        flaggedReasons.push(
            `Network disconnection exceeded 5-second tolerance (${maxOfflineDurationSec}s offline).`
        );
    }

    // -------------------------------------------------------------
    // RULE 4: Involuntary Auto-Submitted Sessions
    // -------------------------------------------------------------
    // Note: If the exam timer ran down to 00:00 normally, submission.status is 'submitted' (clean).
    // Only involuntary system terminations are marked 'auto-submitted'.
    if (submission?.status === 'auto-submitted') {
        ruleBreakdown.rule4_involuntaryAutoSubmitted = true;
        flaggedReasons.push(
            `Exam session was auto-finalized by system (reaper worker, duration expiration, or maximum warnings strike).`
        );
    }

    // -------------------------------------------------------------
    // Final Decision & Synthesis
    // -------------------------------------------------------------
    const hasEirfFlag = flaggedReasons.length > 0;
    const uniqueReasons = Array.from(new Set(flaggedReasons));

    return {
        hasEirfFlag,
        eirfStatus: hasEirfFlag ? 'pending' : 'none',
        flaggedReasons: uniqueReasons,
        ruleBreakdown
    };
}

module.exports = {
    evaluateEirfIncident
};
