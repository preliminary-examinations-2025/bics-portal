const { executeCode } = require('./codeRunner');

function calculateSubmissionScore(submission, test) {
    if (!test || !submission) return submission;
    
    submission.answers = submission.answers || [];
    let mcqPoints = 0;
    let codingPoints = 0;
    let webPoints = 0;

    const questionMap = new Map();
    (test.questions || []).forEach((q, idx) => {
        const key = q.id ? String(q.id) : (q._id ? String(q._id) : String(idx));
        questionMap.set(key, q);
    });

    submission.answers.forEach((ans, index) => {
        let quest = null;
        if (ans.questionId && String(ans.questionId) !== 'undefined') {
            quest = questionMap.get(String(ans.questionId));
        }
        if (!quest && test.questions && test.questions[index]) {
            quest = test.questions[index];
        }

        const qPoints = Number(quest?.points || ans.maxPoints || 0);

        // Check if an objection was resolved for this question
        const resolvedObj = (submission.objections || []).find(o => 
            (o.status === 'resolved' || o.status === 'resolved_accepted') &&
            (o.questionIndex === index || (o.questionId && String(o.questionId) === String(ans.questionId)))
        );

        if (resolvedObj && resolvedObj.resolvedMarks !== undefined && resolvedObj.resolvedMarks !== null && !isNaN(resolvedObj.resolvedMarks)) {
            ans.score = Number(resolvedObj.resolvedMarks);
            ans.isObjectionResolved = true;
        }
        // 1. Check Bonus Question Rules
        else if (quest && (quest.isBonus || quest.grantBonusToAll || quest.isBonusQuestion)) {
            ans.score = qPoints;
            ans.isBonusAwarded = true;
        } 
        // 2. MCQ Automated Scoring (if not manually overridden or objection resolved)
        else if (quest && quest.type === 'mcq') {
            if (!ans.isManuallyGraded && !ans.isObjectionResolved) {
                if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null) {
                    if (Number(quest.correctOptionIndex) === Number(ans.selectedOptionIndex)) {
                        ans.score = qPoints;
                    } else {
                        ans.score = 0;
                    }
                } else {
                    ans.score = 0;
                }
            }
        }
        // 3. Coding Automated Scoring (if testCaseResults exist and not manually graded)
        else if (quest && quest.type === 'coding') {
            if (!ans.isManuallyGraded && !ans.isObjectionResolved) {
                if (ans.testCaseResults && ans.testCaseResults.length > 0) {
                    let tcPoints = 0;
                    ans.testCaseResults.forEach(tc => {
                        const pts = Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' ? (tc.points || 0) : 0));
                        tcPoints += pts;
                    });
                    ans.score = tcPoints;
                } else if (ans.score === undefined || ans.score === null) {
                    ans.score = 0;
                }
            }
        }

        // Strict per-question boundary guard (0 <= ans.score <= qPoints)
        ans.score = Math.max(0, Math.min(Number(ans.score || 0), qPoints));

        // Accumulate by type
        if (quest?.type === 'coding') {
            codingPoints += ans.score;
        } else if (quest?.type === 'web') {
            webPoints += ans.score;
        } else {
            mcqPoints += ans.score;
        }
    });

    const rawTotal = mcqPoints + codingPoints + webPoints;
    const testMaxMarks = Number(test.marks || 100);
    const finalTotal = Math.min(rawTotal, testMaxMarks);

    submission.score = finalTotal;
    submission.totalScore = finalTotal;

    submission.evaluation = submission.evaluation || {};
    submission.evaluation.mcqScore = mcqPoints;
    submission.evaluation.codingScore = codingPoints + webPoints;
    submission.evaluation.webScore = webPoints;
    submission.evaluation.totalScore = finalTotal;
    submission.evaluation.score = finalTotal;

    return submission;
}

function recalculateMCQScore(submission, test) {
    return calculateSubmissionScore(submission, test);
}

function calculateCodingScoreFast(submission, test) {
    if (!test || !submission) return;
    submission.answers = submission.answers || [];
    let totalCodingPoints = 0;

    submission.answers.forEach(ans => {
        const quest = test.questions ? test.questions.find(q => String(q.id) === String(ans.questionId)) : null;
        if (quest && quest.type === 'coding') {
            if (ans.testCaseResults && ans.testCaseResults.length > 0) {
                let questionPoints = 0;
                ans.testCaseResults.forEach(tc => {
                    const pts = Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' ? (tc.points || 0) : 0));
                    questionPoints += pts;
                });
                ans.score = Number(ans.score !== undefined ? ans.score : questionPoints);
            } else if (ans.score === undefined || ans.score === null) {
                ans.score = 0;
            }
            totalCodingPoints += Number(ans.score || 0);
        }
    });

    submission.evaluation = submission.evaluation || {};
    submission.evaluation.codingScore = totalCodingPoints;
    submission.evaluation.evaluatedAt = new Date();
}

async function recalculateCodingScore(submission, test) {
    if (!test || !submission) return;
    submission.answers = submission.answers || [];
    const codingTasks = [];

    for (let i = 0; i < submission.answers.length; i++) {
        const ans = submission.answers[i];
        const quest = test.questions.find(q => String(q.id) === String(ans.questionId));
        if (quest && quest.type === 'coding') {
            ans.testCaseResults = [];
            if (!ans.submittedCode || ans.submittedCode.trim() === '') {
                ans.score = 0;
                if (quest.testCases) {
                    quest.testCases.forEach(tc => {
                        ans.testCaseResults.push({
                            status: 'No Submission',
                            points: Number(tc.points || 0),
                            scoredPoints: 0,
                            actualOutput: '',
                            expectedOutput: tc.output || '',
                            input: tc.input || ''
                        });
                    });
                }
                continue;
            }

            codingTasks.push((async () => {
                try {
                    const runRes = await executeCode(
                        ans.submittedCode, 
                        quest.testCases || [], 
                        quest.timeLimitMs || 2000, 
                        quest.memoryLimitMb || 128
                    );
                    let codingPoints = 0;
                    if (runRes && runRes.success && runRes.results) {
                        runRes.results.forEach((res, resIdx) => {
                            const tc = quest.testCases[resIdx];
                            const tcStatus = res.status || 'Failed';
                            const isAccepted = tcStatus === 'Accepted';
                            const pts = tc ? Number(tc.points || 0) : 0;
                            const scored = isAccepted ? pts : 0;
                            if (isAccepted) {
                                codingPoints += pts;
                            }
                            ans.testCaseResults.push({
                                status: tcStatus,
                                points: pts,
                                scoredPoints: scored,
                                actualOutput: res.actualOutput !== undefined ? res.actualOutput : (res.stdout || ''),
                                expectedOutput: tc ? (tc.output || '') : '',
                                input: tc ? (tc.input || '') : ''
                            });
                        });
                    } else if (runRes && runRes.status === 'Compilation Error') {
                        if (quest.testCases) {
                            quest.testCases.forEach(tc => {
                                ans.testCaseResults.push({
                                    status: 'Compilation Error',
                                    points: Number(tc.points || 0),
                                    scoredPoints: 0,
                                    actualOutput: runRes ? (runRes.compileError || runRes.error || 'Compilation Error') : 'Compilation Error',
                                    expectedOutput: tc.output || '',
                                    input: tc.input || ''
                                });
                            });
                        }
                    } else {
                        if (quest.testCases) {
                            quest.testCases.forEach(tc => {
                                ans.testCaseResults.push({
                                    status: 'Runtime Error',
                                    points: Number(tc.points || 0),
                                    scoredPoints: 0,
                                    actualOutput: 'Runtime Error',
                                    expectedOutput: tc.output || '',
                                    input: tc.input || ''
                                });
                            });
                        }
                    }
                    ans.score = codingPoints;
                } catch (err) {
                    console.error("Autograding failed for question", quest.id, err);
                    ans.score = 0;
                    if (quest.testCases) {
                        quest.testCases.forEach(tc => {
                            ans.testCaseResults.push({
                                status: 'Autograding Error',
                                points: Number(tc.points || 0),
                                scoredPoints: 0,
                                actualOutput: err?.message || 'Autograding Error',
                                expectedOutput: tc.output || '',
                                input: tc.input || ''
                            });
                        });
                    }
                }
            })());
        } else if (quest && quest.type === 'web') {
            if (ans.score === undefined) ans.score = 0;
        }
    }

    if (codingTasks.length > 0) {
        await Promise.all(codingTasks);
    }

    let totalCodingScore = 0;
    submission.answers.forEach(ans => {
        const quest = test.questions.find(q => String(q.id) === String(ans.questionId));
        if (quest && quest.type === 'coding') {
            totalCodingScore += Number(ans.score || 0);
        }
    });

    submission.evaluation = submission.evaluation || {};
    submission.evaluation.codingScore = totalCodingScore;
}

function getSubmissionScore(sub) {
    if (!sub) return 0;
    if (sub.score !== undefined && sub.score !== null && !isNaN(sub.score)) return Number(sub.score);
    if (sub.totalScore !== undefined && sub.totalScore !== null && !isNaN(sub.totalScore)) return Number(sub.totalScore);
    if (sub.evaluation) {
        if (sub.evaluation.score !== undefined && sub.evaluation.score !== null && !isNaN(sub.evaluation.score)) return Number(sub.evaluation.score);
        if (sub.evaluation.totalScore !== undefined && sub.evaluation.totalScore !== null && !isNaN(sub.evaluation.totalScore)) return Number(sub.evaluation.totalScore);
        const mcq = Number(sub.evaluation.mcqScore || 0);
        const coding = Number(sub.evaluation.codingScore || 0);
        const web = Number(sub.evaluation.webScore || 0);
        if (mcq > 0 || coding > 0 || web > 0) return mcq + coding + web;
    }
    if (Array.isArray(sub.answers) && sub.answers.length > 0) {
        let sum = 0;
        sub.answers.forEach(a => { sum += Number(a.score || 0); });
        return sum;
    }
    return 0;
}

function buildSubmissionMap(submissions) {
    const map = new Map();
    (submissions || []).forEach(sub => {
        if (sub.candidateId) map.set(String(sub.candidateId), sub);
        if (sub.studentId) map.set(String(sub.studentId), sub);
        if (sub.candidateName) map.set(String(sub.candidateName).toLowerCase().trim(), sub);
    });
    return map;
}

function findSubmissionForStudent(cand, existingSm, subMap) {
    if (!subMap) return null;
    const sId = String(cand?.studentId || cand?.registrationData?.studentId || cand?.rollNo || cand?._id || existingSm?.studentId || '');
    const candId = String(cand?._id || cand?.id || '');
    const candName = String(cand?.name || cand?.registrationData?.preferredName || cand?.registrationData?.fullName || existingSm?.studentName || '').toLowerCase().trim();

    return subMap.get(sId) || subMap.get(candId) || subMap.get(candName) || null;
}

function findCounterfoilForStudent(cand, existingSm, counterfoils, examType) {
    if (!Array.isArray(counterfoils) || counterfoils.length === 0) return null;

    const sId = String(cand?.studentId || cand?.registrationData?.studentId || cand?.rollNo || cand?._id || existingSm?.studentId || '').toUpperCase().trim();
    const candId = String(cand?._id || cand?.id || '').toUpperCase().trim();
    const candName = String(cand?.name || cand?.registrationData?.preferredName || cand?.registrationData?.fullName || existingSm?.studentName || '').toLowerCase().trim();

    return counterfoils.find(c => {
        const isExamMatch = c.examType === examType || 
            (examType === 'midsem' && c.examinationName?.toLowerCase().includes('mid')) ||
            (examType === 'endsem' && c.examinationName?.toLowerCase().includes('end'));
        if (!isExamMatch) return false;

        const cfStudentId = String(c.studentId || '').toUpperCase().trim();
        const cfName = String(c.studentName || '').toLowerCase().trim();

        return (
            (cfStudentId && (cfStudentId === sId || cfStudentId === candId)) ||
            (cfName && candName && cfName === candName)
        );
    }) || null;
}

function calculateMarksLedgerEntry(m, type) {
    const isTheory = type === 'theory';

    let totalTa = 0;
    let scaledAssignment = 0;
    let scaledClassTest = 0;
    let scaledQuiz = 0;
    let scaledProject = 0;

    let scaledPracticals = 0;
    let scaledKata = 0;
    let scaledLabQuiz = 0;
    let scaledLabProject = 0;

    if (isTheory) {
        // 1. Assignments: 5 * 100 = 500m -> scaled to 5m
        const a1 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a1 ?? m.a1 ?? 0)));
        const a2 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a2 ?? m.a2 ?? 0)));
        const a3 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a3 ?? m.a3 ?? 0)));
        const a4 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a4 ?? m.a4 ?? 0)));
        const a5 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a5 ?? m.a5 ?? 0)));
        const sumA = a1 + a2 + a3 + a4 + a5;

        if (m.theoryAssignments || sumA > 0) {
            scaledAssignment = Math.min(5, Math.max(0, (sumA / 500) * 5));
        } else {
            scaledAssignment = Math.min(5, Math.max(0, Number(m.taAssignment || 0)));
        }

        // 2. Class Tests: 5 * 20 = 100m -> scaled to 5m
        const ct1 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct1 ?? m.ct1 ?? 0)));
        const ct2 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct2 ?? m.ct2 ?? 0)));
        const ct3 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct3 ?? m.ct3 ?? 0)));
        const ct4 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct4 ?? m.ct4 ?? 0)));
        const ct5 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct5 ?? m.ct5 ?? 0)));
        const sumCT = ct1 + ct2 + ct3 + ct4 + ct5;

        if (m.theoryClassTests || sumCT > 0) {
            scaledClassTest = Math.min(5, Math.max(0, (sumCT / 100) * 5));
        } else {
            scaledClassTest = Math.min(5, Math.max(0, Number(m.taClassTest || 0)));
        }

        // 3. Quizzes: MST Q1(20) + MST Q2(40) + MST Q3(40) + ESE Q1(30) + ESE Q2(60) + ESE Q3(60) = 250m -> scaled to 5m
        const mq1 = Math.min(20, Math.max(0, Number(m.theoryQuizzes?.mstQuiz1 ?? m.mstQuiz1 ?? 0)));
        const mq2 = Math.min(40, Math.max(0, Number(m.theoryQuizzes?.mstQuiz2 ?? m.mstQuiz2 ?? 0)));
        const mq3 = Math.min(40, Math.max(0, Number(m.theoryQuizzes?.mstQuiz3 ?? m.mstQuiz3 ?? 0)));
        const eq1 = Math.min(30, Math.max(0, Number(m.theoryQuizzes?.eseQuiz1 ?? m.eseQuiz1 ?? 0)));
        const eq2 = Math.min(60, Math.max(0, Number(m.theoryQuizzes?.eseQuiz2 ?? m.eseQuiz2 ?? 0)));
        const eq3 = Math.min(60, Math.max(0, Number(m.theoryQuizzes?.eseQuiz3 ?? m.eseQuiz3 ?? 0)));
        const sumQ = mq1 + mq2 + mq3 + eq1 + eq2 + eq3;

        if (m.theoryQuizzes || sumQ > 0) {
            scaledQuiz = Math.min(5, Math.max(0, (sumQ / 250) * 5));
        } else {
            scaledQuiz = Math.min(5, Math.max(0, Number(m.taQuiz || 0)));
        }

        // 4. Project: 250m -> scaled to 5m
        const rawProj = Math.min(250, Math.max(0, Number(m.theoryProject ?? m.project ?? 0)));
        if (m.theoryProject !== undefined || rawProj > 0) {
            scaledProject = Math.min(5, Math.max(0, (rawProj / 250) * 5));
        } else {
            scaledProject = Math.min(5, Math.max(0, Number(m.taIdeation || m.taProject || 0)));
        }

        totalTa = Math.min(20, Math.max(0, scaledAssignment + scaledClassTest + scaledQuiz + scaledProject));
    } else {
        // Lab Course
        // 1. Practicals: 10 * 10 = 100m -> scaled to 20m
        let sumP = 0;
        const pObj = m.labPracticals || {};
        for (let i = 1; i <= 10; i++) {
            const pVal = Math.min(10, Math.max(0, Number(pObj[`p${i}`] ?? m[`p${i}`] ?? 0)));
            sumP += pVal;
        }

        if (m.labPracticals || sumP > 0) {
            scaledPracticals = Math.min(20, Math.max(0, (sumP / 100) * 20));
        } else {
            scaledPracticals = Math.min(20, Math.max(0, Number(m.taPracticalEval || 0)));
        }

        // 2. Kata Contests: 6 Contests -> 6m (1 mark per contest max)
        if (Array.isArray(m.labKataContests) && m.labKataContests.length > 0) {
            let kataSum = 0;
            m.labKataContests.forEach(kc => {
                const cMark = kc.scaledMark !== undefined && kc.scaledMark !== null
                    ? Number(kc.scaledMark)
                    : (kc.normalizedScore !== undefined ? (Number(kc.normalizedScore) / 5) : 0);
                kataSum += Math.min(1.0, Math.max(0, cMark));
            });
            scaledKata = Math.min(6, Math.max(0, kataSum));
        } else if (m.taKata !== undefined) {
            scaledKata = Math.min(6, Math.max(0, Number(m.taKata || 0)));
        } else {
            scaledKata = Math.min(6, Math.max(0, Number(m.taPracticalEval ? (m.taPracticalEval > 20 ? (m.taPracticalEval - 20) : 0) : 0)));
        }

        // 3. Lab Quizzes: Lab Quiz 1 (60m) + Lab Quiz 2 (60m) = 120m -> scaled to 4m
        const lq1 = Math.min(60, Math.max(0, Number(m.labQuizzes?.quiz1 ?? m.labQuiz1 ?? 0)));
        const lq2 = Math.min(60, Math.max(0, Number(m.labQuizzes?.quiz2 ?? m.labQuiz2 ?? 0)));
        const sumLQ = lq1 + lq2;

        if (m.labQuizzes || sumLQ > 0) {
            scaledLabQuiz = Math.min(4, Math.max(0, (sumLQ / 120) * 4));
        } else {
            scaledLabQuiz = Math.min(4, Math.max(0, Number(m.taLabQuiz || 0)));
        }

        // 4. Lab Project: 250m -> scaled to 10m
        const rawLabProj = Math.min(250, Math.max(0, Number(m.labProject ?? m.project ?? 0)));
        if (m.labProject !== undefined || rawLabProj > 0) {
            scaledLabProject = Math.min(10, Math.max(0, (rawLabProj / 250) * 10));
        } else {
            scaledLabProject = Math.min(10, Math.max(0, Number(m.taProject || 0)));
        }

        totalTa = Math.min(40, Math.max(0, scaledPracticals + scaledKata + scaledLabQuiz + scaledLabProject));
    }

    // 2. Mid Semester Test (MST) Computation
    let scaledMst = 0;
    const wMst = Math.min(40, Math.max(0, Number(m.mstWritten || 0)));
    if (isTheory) {
        // Theory: MST 40m graded to 30m
        scaledMst = (wMst / 40) * 30;
    } else {
        // Lab: MST Online (40) + MST Written (40) + MST Viva (20) = 100m graded to 20m
        const oMst = Math.min(40, Math.max(0, Number(m.mstOnline || 0)));
        const vMst = Math.min(20, Math.max(0, Number(m.mstViva || 0)));
        const rawMst = wMst + oMst + vMst;
        scaledMst = (rawMst / 100) * 20;
    }

    // 3. End Semester Exam (ESE) Computation
    let scaledEse = 0;
    const wEse = Math.min(100, Math.max(0, Number(m.eseWritten || 0)));
    if (isTheory) {
        // Theory: ESE 100m graded down to 50m
        scaledEse = (wEse / 100) * 50;
    } else {
        // Lab: ESE Online (100) + ESE Written (100) + ESE Viva (40) = 240m graded to 40m
        const oEse = Math.min(100, Math.max(0, Number(m.eseOnline || 0)));
        const vEse = Math.min(40, Math.max(0, Number(m.eseViva || 0)));
        const rawEse = wEse + oEse + vEse;
        scaledEse = (rawEse / 240) * 40;
    }

    // 4. Final Consolidated Score & Letter Grade Computation (100 Marks Max)
    const finalScore = Math.round((totalTa + scaledMst + scaledEse) * 100) / 100;

    let grade = 'FF';
    let gradePoint = 0;
    let status = 'FAIL';

    if (finalScore >= 91) { grade = 'AA'; gradePoint = 10; status = 'PASS'; }
    else if (finalScore >= 81) { grade = 'AB'; gradePoint = 9; status = 'PASS'; }
    else if (finalScore >= 71) { grade = 'BB'; gradePoint = 8; status = 'PASS'; }
    else if (finalScore >= 65) { grade = 'CC'; gradePoint = 7; status = 'PASS'; }
    else if (finalScore >= 60) { grade = 'DD'; gradePoint = 6; status = 'PASS'; }
    else { grade = 'FF'; gradePoint = 0; status = 'FAIL'; }

    return {
        ...m,
        // Preserve legacy and computed fields
        taAssignment: Math.round(scaledAssignment * 100) / 100,
        taClassTest: Math.round(scaledClassTest * 100) / 100,
        taQuiz: Math.round(scaledQuiz * 100) / 100,
        taIdeation: Math.round(scaledProject * 100) / 100,

        taPracticalEval: Math.round(scaledPracticals * 100) / 100,
        taKata: Math.round(scaledKata * 100) / 100,
        taLabQuiz: Math.round(scaledLabQuiz * 100) / 100,
        taProject: Math.round((isTheory ? scaledProject : scaledLabProject) * 100) / 100,

        totalTa: Math.round(totalTa * 100) / 100,
        scaledMst: Math.round(scaledMst * 100) / 100,
        scaledEse: Math.round(scaledEse * 100) / 100,
        finalScore,
        grade,
        gradePoint,
        status
    };
}

module.exports = {
    calculateSubmissionScore,
    recalculateMCQScore,
    calculateCodingScoreFast,
    recalculateCodingScore,
    getSubmissionScore,
    buildSubmissionMap,
    findSubmissionForStudent,
    findCounterfoilForStudent,
    calculateMarksLedgerEntry
};
