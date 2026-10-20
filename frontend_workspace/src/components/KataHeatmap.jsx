import React, { useState } from 'react';

/**
 * KataHeatmap Component
 * Replicates the exact Codeforces activity heatmap & 6 statistics cards (img ref 1 / media_1792319595538_db2fa181.png):
 * - Top controls: "Only public activity" & "What activity will be shown to other users: [Only public v] [Choose year v]"
 * - Heatmap grid: 52 weeks x 7 days with Month labels (Nov-Oct) and Day labels (Mon, Wed, Fri)
 * - 4-tier green intensity palette with tooltips
 * - 6 summary statistics cards in a 2x3 grid:
 *     1. XX problems solved for all time
 *     2. XX problems solved for the last year
 *     3. XX problems solved for the last month
 *     4. X days in a row max.
 *     5. X days in a row for the last year
 *     6. X days in a row for the last month
 */
export default function KataHeatmap({ profile }) {
    const [visibilityFilter, setVisibilityFilter] = useState('public');
    const [yearFilter, setYearFilter] = useState('2026');
    const [hoveredCell, setHoveredCell] = useState(null);

    // Strictly real heatmap from DB (no hardcoded mock data)
    const rawHeatmap = (profile?.submissionHeatmap && typeof profile.submissionHeatmap === 'object')
        ? profile.submissionHeatmap
        : {};

    const weeksCount = 52;
    const daysCount = 7;

    const months = [
        { label: 'Nov', col: 0 },
        { label: 'Dec', col: 4 },
        { label: 'Jan', col: 9 },
        { label: 'Feb', col: 13 },
        { label: 'Mar', col: 17 },
        { label: 'Apr', col: 21 },
        { label: 'May', col: 26 },
        { label: 'Jun', col: 30 },
        { label: 'Jul', col: 35 },
        { label: 'Aug', col: 39 },
        { label: 'Sep', col: 43 },
        { label: 'Oct', col: 48 }
    ];

    // Calendar mapping for the 52-week grid ending on current week
    const today = new Date();
    const todayDayOfWeek = (today.getDay() + 6) % 7; // Monday = 0, Sunday = 6

    const getCellDate = (col, row) => {
        const weeksAgo = (weeksCount - 1) - col;
        const daysDiff = weeksAgo * 7 + (todayDayOfWeek - row);
        return new Date(today.getTime() - daysDiff * 24 * 60 * 60 * 1000);
    };

    const getCellDateStr = (col, row) => {
        const d = getCellDate(col, row);
        return d.toISOString().split('T')[0];
    };

    // Resolves submission count from database using grid key or YYYY-MM-DD date key
    const getIntensity = (col, row) => {
        const gridKey = `w${col}_d${row}`;
        if (rawHeatmap[gridKey] !== undefined) {
            return Number(rawHeatmap[gridKey]) || 0;
        }
        const dateStr = getCellDateStr(col, row);
        if (rawHeatmap[dateStr] !== undefined) {
            return Number(rawHeatmap[dateStr]) || 0;
        }
        return 0;
    };

    // Compute metrics strictly from real DB records
    let totalProblemsFromMap = 0;
    let yearProblemsFromMap = 0;
    let monthProblemsFromMap = 0;

    for (let c = 0; c < weeksCount; c++) {
        for (let r = 0; r < daysCount; r++) {
            const count = getIntensity(c, r);
            if (count > 0) {
                totalProblemsFromMap += count;
                yearProblemsFromMap += count;
                if (c >= 48) {
                    monthProblemsFromMap += count;
                }
            }
        }
    }

    const solvedStats = profile?.solvedStats || {};
    const candidateSolvedTotal = (solvedStats.allTime !== undefined && solvedStats.allTime !== null)
        ? Number(solvedStats.allTime)
        : ((Number(solvedStats.shinSolved) || 0) + (Number(solvedStats.formaSolved) || 0));

    // Strictly real values from database (0 if candidate has not solved problems yet)
    const allTimeSolved = candidateSolvedTotal > 0 ? candidateSolvedTotal : totalProblemsFromMap;
    const lastYearSolved = Number(solvedStats.lastYear) || yearProblemsFromMap || 0;
    const lastMonthSolved = Number(solvedStats.lastMonth) || monthProblemsFromMap || 0;

    const streak = profile?.streak || {};
    const maxStreak = Number(streak.longest) || 0;
    const yearStreak = Number(streak.current) || 0;
    const monthStreak = Number(streak.lastMonth) || (monthProblemsFromMap > 0 ? Math.min(yearStreak, monthProblemsFromMap) : 0);

    // 4-tier green intensity palette
    const getColor = (intensity) => {
        if (!intensity || intensity === 0) return '#ebedf0';
        if (intensity <= 2) return '#9be9a8'; // tier 1: light green
        if (intensity <= 4) return '#40c463'; // tier 2: medium green
        if (intensity <= 7) return '#30a14e'; // tier 3: darker green
        return '#216e39';                   // tier 4: dark forest green
    };

    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #b9b9b9',
            borderRadius: '4px',
            marginBottom: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            padding: '14px 18px',
            fontFamily: 'Verdana, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* Top Bar: Activity Filter Controls matching img ref 1 */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                fontSize: '11px',
                color: '#666666'
            }}>
                <span>Only public activity</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>What activity will be shown to other users:</span>
                    <select
                        value={visibilityFilter}
                        onChange={(e) => setVisibilityFilter(e.target.value)}
                        style={{
                            fontSize: '11px',
                            fontFamily: 'inherit',
                            padding: '1px 6px',
                            border: '1px solid #b9b9b9',
                            borderRadius: '3px',
                            background: '#ffffff',
                            color: '#222222'
                        }}
                    >
                        <option value="public">Only public</option>
                        <option value="all">All activity</option>
                    </select>

                    <select
                        value={yearFilter}
                        onChange={(e) => setYearFilter(e.target.value)}
                        style={{
                            fontSize: '11px',
                            fontFamily: 'inherit',
                            padding: '1px 6px',
                            border: '1px solid #b9b9b9',
                            borderRadius: '3px',
                            background: '#ffffff',
                            color: '#222222'
                        }}
                    >
                        <option value="2026">Choose year</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                    </select>
                </div>
            </div>

            {/* Heatmap Grid matching img ref 1 */}
            <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                <div style={{ minWidth: '720px' }}>
                    {/* Month labels */}
                    <div style={{ display: 'flex', marginLeft: '32px', marginBottom: '6px', position: 'relative', height: '14px' }}>
                        {months.map((m, idx) => (
                            <span
                                key={idx}
                                style={{
                                    position: 'absolute',
                                    left: `${m.col * 13.2}px`,
                                    fontSize: '10px',
                                    color: '#777777',
                                    fontWeight: 'normal'
                                }}
                            >
                                {m.label}
                            </span>
                        ))}
                    </div>

                    {/* Weekday labels (Mon, Wed, Fri) + 52-week Grid */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            width: '26px',
                            fontSize: '10px',
                            color: '#777777',
                            paddingTop: '2px',
                            paddingBottom: '2px',
                            height: '84px',
                            userSelect: 'none'
                        }}>
                            <span>Mon</span>
                            <span>Wed</span>
                            <span>Fri</span>
                        </div>

                        {/* 52 Columns Grid */}
                        <div style={{ display: 'flex', gap: '2.5px' }}>
                            {Array.from({ length: weeksCount }).map((_, col) => (
                                <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: '2.5px' }}>
                                    {Array.from({ length: daysCount }).map((_, row) => {
                                        const intensity = getIntensity(col, row);
                                        return (
                                            <div
                                                key={row}
                                                style={{
                                                    width: '10.5px',
                                                    height: '10.5px',
                                                    borderRadius: '1.5px',
                                                    backgroundColor: getColor(intensity),
                                                    cursor: intensity > 0 ? 'pointer' : 'default',
                                                    transition: 'transform 0.1s ease'
                                                }}
                                                onMouseEnter={() => setHoveredCell({
                                                    col,
                                                    row,
                                                    count: intensity,
                                                    dateStr: getCellDate(col, row).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                })}
                                                onMouseLeave={() => setHoveredCell(null)}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hover Tooltip Indicator */}
            <div style={{ minHeight: '16px', marginTop: '6px', fontSize: '10px', color: '#666666' }}>
                {hoveredCell ? (
                    hoveredCell.count > 0 ? (
                        <span>
                            <strong>{hoveredCell.count} problem{hoveredCell.count > 1 ? 's' : ''} solved</strong> on {hoveredCell.dateStr}.
                        </span>
                    ) : (
                        <span>No problems solved on {hoveredCell.dateStr}.</span>
                    )
                ) : (
                    <span>&nbsp;</span>
                )}
            </div>

            {/* 6 Summary Statistics Cards (2x3 Grid matching img ref 1 exactly) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px 24px',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #f0f0f0'
            }}>
                {/* 1. All-time solved */}
                <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#222222', lineHeight: '1.2' }}>
                        {allTimeSolved} problems
                    </div>
                    <div style={{ fontSize: '11px', color: '#777777', marginTop: '2px' }}>
                        solved for all time
                    </div>
                </div>

                {/* 2. Last year solved */}
                <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#222222', lineHeight: '1.2' }}>
                        {lastYearSolved} problems
                    </div>
                    <div style={{ fontSize: '11px', color: '#777777', marginTop: '2px' }}>
                        solved for the last year
                    </div>
                </div>

                {/* 3. Last month solved */}
                <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#222222', lineHeight: '1.2' }}>
                        {lastMonthSolved} problems
                    </div>
                    <div style={{ fontSize: '11px', color: '#777777', marginTop: '2px' }}>
                        solved for the last month
                    </div>
                </div>

                {/* 4. All-time max streak */}
                <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#222222', lineHeight: '1.2' }}>
                        {maxStreak} days
                    </div>
                    <div style={{ fontSize: '11px', color: '#777777', marginTop: '2px' }}>
                        in a row max.
                    </div>
                </div>

                {/* 5. Last year streak */}
                <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#222222', lineHeight: '1.2' }}>
                        {yearStreak} days
                    </div>
                    <div style={{ fontSize: '11px', color: '#777777', marginTop: '2px' }}>
                        in a row for the last year
                    </div>
                </div>

                {/* 6. Last month streak */}
                <div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#222222', lineHeight: '1.2' }}>
                        {monthStreak} days
                    </div>
                    <div style={{ fontSize: '11px', color: '#777777', marginTop: '2px' }}>
                        in a row for the last month
                    </div>
                </div>
            </div>
        </div>
    );
}
