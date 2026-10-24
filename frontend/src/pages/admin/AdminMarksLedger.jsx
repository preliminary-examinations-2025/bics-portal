import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, BookOpen, RefreshCw, Save, Lock, Unlock, CheckCircle, 
  AlertTriangle, Edit3, Link as LinkIcon, FileText, Layers, Award, UserCheck, Search, 
  ChevronRight, Settings, Zap, Check, ExternalLink, HelpCircle
} from 'lucide-react';
import { API_BASE } from '../../config';

// Universal Online Test Components Metadata
const ONLINE_TEST_METADATA = {
  mstQuiz1: { label: 'MST Quiz 1', maxMarks: 20, courseType: 'theory', desc: 'Theory MST Online Quiz (20m max)' },
  eseQuiz1: { label: 'ESE Quiz 1', maxMarks: 30, courseType: 'theory', desc: 'Theory ESE Online Quiz (30m max)' },
  labQuiz1: { label: 'Lab Quiz 1', maxMarks: 60, courseType: 'lab', desc: 'Lab Online Quiz 1 (60m max)' },
  mstOnline: { label: 'Lab MST Online', maxMarks: 40, courseType: 'lab', desc: 'Lab Mid-Sem Online Exam (40m max)' },
  eseOnline: { label: 'Lab ESE Online', maxMarks: 100, courseType: 'lab', desc: 'Lab End-Sem Online Exam (100m max)' }
};

// Client-side real-time calculation engine mirroring backend
function calculateLiveStudentEntry(m, courseType) {
  const isTheory = courseType === 'theory';

  let scaledAssignment = 0;
  let scaledClassTest = 0;
  let scaledQuiz = 0;
  let scaledProject = 0;

  let scaledPracticals = 0;
  let scaledKata = 0;
  let scaledLabQuiz = 0;
  let scaledLabProject = 0;

  let totalTa = 0;

  if (isTheory) {
    // 1. Assignments: 5 * 100 = 500m -> scaled to 5m
    const a1 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a1 ?? 0)));
    const a2 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a2 ?? 0)));
    const a3 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a3 ?? 0)));
    const a4 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a4 ?? 0)));
    const a5 = Math.min(100, Math.max(0, Number(m.theoryAssignments?.a5 ?? 0)));
    const sumAssignments = a1 + a2 + a3 + a4 + a5;
    scaledAssignment = Math.min(5, (sumAssignments / 500) * 5);

    // 2. Class Tests: 5 * 20 = 100m -> scaled to 5m
    const ct1 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct1 ?? 0)));
    const ct2 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct2 ?? 0)));
    const ct3 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct3 ?? 0)));
    const ct4 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct4 ?? 0)));
    const ct5 = Math.min(20, Math.max(0, Number(m.theoryClassTests?.ct5 ?? 0)));
    const sumClassTests = ct1 + ct2 + ct3 + ct4 + ct5;
    scaledClassTest = Math.min(5, (sumClassTests / 100) * 5);

    // 3. Quizzes: MST Q1 (20) + MST Q2 (40) + MST Q3 (40) + ESE Q1 (30) + ESE Q2 (60) + ESE Q3 (60) = 250m -> scaled to 5m
    const mq1 = Math.min(20, Math.max(0, Number(m.theoryQuizzes?.mstQuiz1 ?? 0)));
    const mq2 = Math.min(40, Math.max(0, Number(m.theoryQuizzes?.mstQuiz2 ?? 0)));
    const mq3 = Math.min(40, Math.max(0, Number(m.theoryQuizzes?.mstQuiz3 ?? 0)));
    const eq1 = Math.min(30, Math.max(0, Number(m.theoryQuizzes?.eseQuiz1 ?? 0)));
    const eq2 = Math.min(60, Math.max(0, Number(m.theoryQuizzes?.eseQuiz2 ?? 0)));
    const eq3 = Math.min(60, Math.max(0, Number(m.theoryQuizzes?.eseQuiz3 ?? 0)));
    const sumQuizzes = mq1 + mq2 + mq3 + eq1 + eq2 + eq3;
    scaledQuiz = Math.min(5, (sumQuizzes / 250) * 5);

    // 4. Project: 250m -> scaled to 5m
    const rawProj = Math.min(250, Math.max(0, Number(m.theoryProject ?? m.project ?? 0)));
    scaledProject = Math.min(5, (rawProj / 250) * 5);

    totalTa = Math.min(20, scaledAssignment + scaledClassTest + scaledQuiz + scaledProject);
  } else {
    // Lab Course
    // 1. Practicals: 10 * 10 = 100m -> scaled to 20m
    let sumPracticals = 0;
    const pracs = m.labPracticals || {};
    for (let i = 1; i <= 10; i++) {
      sumPracticals += Math.min(10, Math.max(0, Number(pracs[`p${i}`] || 0)));
    }
    scaledPracticals = Math.min(20, (sumPracticals / 100) * 20);

    // 2. Kata Contests: 6 Contests -> 6m (1 mark max per contest)
    if (Array.isArray(m.labKataContests) && m.labKataContests.length > 0) {
      let kataSum = 0;
      m.labKataContests.forEach(kc => {
        const cMark = kc.scaledMark !== undefined && kc.scaledMark !== null
          ? Number(kc.scaledMark)
          : (kc.normalizedScore !== undefined ? (Number(kc.normalizedScore) / 5) : 0);
        kataSum += Math.min(1.0, Math.max(0, cMark));
      });
      scaledKata = Math.min(6, Math.max(0, kataSum));
    } else {
      scaledKata = Math.min(6, Math.max(0, Number(m.taKata || 0)));
    }

    // 3. Lab Quizzes: LQ1 (60) + LQ2 (60) = 120m -> scaled to 4m
    const lq1 = Math.min(60, Math.max(0, Number(m.labQuizzes?.quiz1 ?? 0)));
    const lq2 = Math.min(60, Math.max(0, Number(m.labQuizzes?.quiz2 ?? 0)));
    const sumLQ = lq1 + lq2;
    scaledLabQuiz = Math.min(4, Math.max(0, (sumLQ / 120) * 4));

    // 4. Lab Project: 250m -> scaled to 10m
    const rawLabProj = Math.min(250, Math.max(0, Number(m.labProject ?? m.project ?? 0)));
    scaledLabProject = Math.min(10, Math.max(0, (rawLabProj / 250) * 10));

    totalTa = Math.min(40, Math.max(0, scaledPracticals + scaledKata + scaledLabQuiz + scaledLabProject));
  }

  // MST
  let scaledMst = 0;
  const wMst = Math.min(40, Math.max(0, Number(m.mstWritten || 0)));
  if (isTheory) {
    scaledMst = (wMst / 40) * 30;
  } else {
    const oMst = Math.min(40, Math.max(0, Number(m.mstOnline || 0)));
    const vMst = Math.min(20, Math.max(0, Number(m.mstViva || 0)));
    scaledMst = ((wMst + oMst + vMst) / 100) * 20;
  }

  // ESE
  let scaledEse = 0;
  const wEse = Math.min(100, Math.max(0, Number(m.eseWritten || 0)));
  if (isTheory) {
    scaledEse = (wEse / 100) * 50;
  } else {
    const oEse = Math.min(100, Math.max(0, Number(m.eseOnline || 0)));
    const vEse = Math.min(40, Math.max(0, Number(m.eseViva || 0)));
    scaledEse = ((wEse + oEse + vEse) / 240) * 40;
  }

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

export default function AdminMarksLedger({ apiSecret = '' }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState('R526CS01T');
  const [activeTab, setActiveTab] = useState('ta'); // 'ta', 'mst', 'ese', 'consolidated', 'master'
  const [taSubTab, setTaSubTab] = useState('summary'); // 'summary', 'assignments', 'classtests', 'quizzes', 'practicals', 'kata', 'project'
  const [ledgerData, setLedgerData] = useState(null);

  // Universal Online Test Linking States
  const [selectedTestIds, setSelectedTestIds] = useState({
    mstQuiz1: '',
    eseQuiz1: '',
    labQuiz1: '',
    mstOnline: '',
    eseOnline: ''
  });
  const [availableTestsByTarget, setAvailableTestsByTarget] = useState({
    mstQuiz1: [],
    eseQuiz1: [],
    labQuiz1: [],
    mstOnline: [],
    eseOnline: []
  });

  // Kata Configuration Modal / Drawer
  const [showKataConfig, setShowKataConfig] = useState(false);
  const [customKataContests, setCustomKataContests] = useState([]);
  const [savingKataConfig, setSavingKataConfig] = useState(false);
  const [syncingKata, setSyncingKata] = useState(false);

  const [masterTranscripts, setMasterTranscripts] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkingTarget, setLinkingTarget] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isRefreshingTranscripts, setIsRefreshingTranscripts] = useState(false);

  const isTheory = (ledgerData?.courseType || (selectedCourseCode.endsWith('L') ? 'lab' : 'theory')) === 'theory';

  // Fetch Course List & Master Transcripts
  const fetchCourses = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/courses`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCourses(data);
      }
    } catch (e) {
      console.error("Failed to load courses:", e);
    }
  };

  const loadAvailableTestsForTarget = async (courseCode, target) => {
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/available-tests?currentCourseCode=${courseCode}&targetComponent=${target}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAvailableTestsByTarget(prev => ({ ...prev, [target]: data }));
      }
    } catch (e) {
      console.error(`Failed to load tests for ${target}:`, e);
    }
  };

  const loadAllRelevantAvailableTests = async (courseCode, courseType) => {
    const isTh = courseType === 'theory';
    if (isTh) {
      await Promise.all([
        loadAvailableTestsForTarget(courseCode, 'mstQuiz1'),
        loadAvailableTestsForTarget(courseCode, 'eseQuiz1')
      ]);
    } else {
      await Promise.all([
        loadAvailableTestsForTarget(courseCode, 'labQuiz1'),
        loadAvailableTestsForTarget(courseCode, 'mstOnline'),
        loadAvailableTestsForTarget(courseCode, 'eseOnline')
      ]);
    }
  };

  const fetchCourseLedger = async (courseCode) => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/ledger/${courseCode}`);
      const data = await res.json();
      if (data && data.studentMarks) {
        setLedgerData(data);
        const lIds = data.linkedOnlineTestIds || {};
        setSelectedTestIds({
          mstQuiz1: lIds.mstQuiz1 || '',
          eseQuiz1: lIds.eseQuiz1 || '',
          labQuiz1: lIds.labQuiz1 || '',
          mstOnline: lIds.mstOnline || data.linkedMstOnlineTestId || data.linkedOnlineTestId || '',
          eseOnline: lIds.eseOnline || data.linkedEseOnlineTestId || ''
        });
        if (Array.isArray(data.configuredKataContests) && data.configuredKataContests.length > 0) {
          setCustomKataContests(data.configuredKataContests);
        } else {
          setCustomKataContests(
            courseCode === 'R526CS02L' 
              ? ['SHIN02', 'SHIN03', 'SHIN04', 'SHIN05', 'SHIN06', 'SHIN07']
              : ['FORMA02', 'FORMA03', 'FORMA04', 'FORMA05', 'FORMA06', 'FORMA07']
          );
        }
        await loadAllRelevantAvailableTests(courseCode, data.courseType);
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to load course ledger data." });
      }
    } catch (e) {
      console.error("Failed to fetch course ledger:", e);
      setMessage({ type: 'danger', text: "Error connecting to server to load marks sheet." });
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterTranscripts = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/master-transcripts`);
      const data = await res.json();
      if (data && data.transcripts) {
        setMasterTranscripts(data);
      }
    } catch (e) {
      console.error("Failed to fetch master transcripts:", e);
    }
  };

  useEffect(() => {
    fetchCourses();
    fetchMasterTranscripts();
  }, []);

  useEffect(() => {
    if (selectedCourseCode) {
      setTaSubTab('summary');
      fetchCourseLedger(selectedCourseCode);
    }
  }, [selectedCourseCode]);

  const handleRefreshData = async () => {
    if (isRefreshingData) return;
    setIsRefreshingData(true);
    const start = Date.now();
    try {
      await Promise.all([
        fetchCourseLedger(selectedCourseCode),
        fetchMasterTranscripts()
      ]);
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      setIsRefreshingData(false);
    }
  };

  const handleRefreshTranscripts = async () => {
    if (isRefreshingTranscripts) return;
    setIsRefreshingTranscripts(true);
    const start = Date.now();
    try {
      await fetchMasterTranscripts();
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      setIsRefreshingTranscripts(false);
    }
  };

  // Live Granular Marks Update Handler
  const handleGranularMarksChange = (studentId, path, val) => {
    if (ledgerData?.isLocked) return;

    setLedgerData(prev => {
      if (!prev) return prev;
      const updatedMarks = prev.studentMarks.map(sm => {
        if (String(sm.studentId) === String(studentId)) {
          const numVal = Math.max(0, Number(val) || 0);
          const cloned = JSON.parse(JSON.stringify(sm));

          if (path.includes('.')) {
            const [parent, child] = path.split('.');
            if (!cloned[parent]) cloned[parent] = {};
            cloned[parent][child] = numVal;
          } else {
            cloned[path] = numVal;
          }

          return calculateLiveStudentEntry(cloned, prev.courseType);
        }
        return sm;
      });

      return { ...prev, studentMarks: updatedMarks };
    });
  };

  // Universal Online Test Linking Handler
  const handleLinkUniversalTest = async (targetComponent, syncScores = false, overrideTestId = null) => {
    setLinkingTarget(targetComponent);
    setMessage({ type: '', text: '' });

    const testId = overrideTestId !== null ? overrideTestId : selectedTestIds[targetComponent];

    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/link-test/${selectedCourseCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          targetComponent,
          syncOnlineScores: syncScores
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setSelectedTestIds(prev => ({ ...prev, [targetComponent]: testId || '' }));
        await fetchCourseLedger(selectedCourseCode);
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to link test." });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'danger', text: "Error communicating with server to link online test." });
    } finally {
      setLinkingTarget(null);
    }
  };

  // Save All Ledger Changes
  const saveLedger = async () => {
    if (!ledgerData) return;
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/save/${selectedCourseCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedOnlineTestIds: selectedTestIds,
          linkedMstOnlineTestId: selectedTestIds.mstOnline,
          linkedEseOnlineTestId: selectedTestIds.eseOnline,
          configuredKataContests: ledgerData.configuredKataContests || customKataContests,
          studentMarks: ledgerData.studentMarks
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Successfully saved marks ledger for ${selectedCourseCode}.` });
        fetchCourses();
        fetchMasterTranscripts();
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to save marks ledger." });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'danger', text: "Error saving marks ledger to server." });
    } finally {
      setSaving(false);
    }
  };

  // Sync Kata Scores Handler
  const handleSyncKataScores = async () => {
    if (syncingKata) return;
    setSyncingKata(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/sync-kata/${selectedCourseCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        await fetchCourseLedger(selectedCourseCode);
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to sync Kata scores." });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'danger', text: "Error syncing Kata scores with server." });
    } finally {
      setSyncingKata(false);
    }
  };

  // Save Configured Kata Contests (Option A)
  const handleSaveKataContestsConfig = async () => {
    if (customKataContests.length !== 6) {
      setMessage({ type: 'danger', text: "Exactly 6 contests must be selected for Option A ledger calculation." });
      return;
    }
    setSavingKataConfig(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/config-kata-contests/${selectedCourseCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contests: customKataContests })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setShowKataConfig(false);
        await handleSyncKataScores();
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to save contest configuration." });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'danger', text: "Error saving contest configuration." });
    } finally {
      setSavingKataConfig(false);
    }
  };

  // Toggle Lock State
  const toggleLock = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/toggle-lock/${selectedCourseCode}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setLedgerData(prev => prev ? ({ ...prev, isLocked: data.isLocked }) : prev);
        setMessage({ type: 'success', text: data.message });
        fetchCourses();
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to toggle lock status." });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'danger', text: "Error setting lock status." });
    }
  };

  const currentCourse = courses.find(c => c.code === selectedCourseCode) || { code: selectedCourseCode, name: selectedCourseCode, type: selectedCourseCode.endsWith('L') ? 'lab' : 'theory' };

  // Filter students by search term
  const filteredStudents = (ledgerData?.studentMarks || []).filter(sm => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      (sm.studentName || '').toLowerCase().includes(term) ||
      (sm.studentId || '').toLowerCase().includes(term) ||
      (sm.rollNo || '').toLowerCase().includes(term)
    );
  });

  // Render Universal Online Test Selector Card
  const renderOnlineTestLinker = (targetKey) => {
    const meta = ONLINE_TEST_METADATA[targetKey];
    if (!meta) return null;
    const currentLinked = selectedTestIds[targetKey] || '';
    const availableTests = availableTestsByTarget[targetKey] || [];
    const isLinking = linkingTarget === targetKey;

    return (
      <div key={targetKey} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Zap size={13} style={{ color: '#0284c7' }} />
            {meta.label} ({meta.maxMarks}m max)
          </label>
          {currentLinked && (
            <span style={{ fontSize: '7pt', fontWeight: 'bold', backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '3px' }}>
              LINKED
            </span>
          )}
        </div>

        <div style={{ fontSize: '7.5pt', color: '#64748b' }}>
          {meta.desc}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          <select
            value={currentLinked}
            onChange={(e) => setSelectedTestIds(prev => ({ ...prev, [targetKey]: e.target.value }))}
            disabled={ledgerData?.isLocked}
            style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8pt', backgroundColor: '#fff', color: '#0f172a' }}
          >
            <option value="">-- No Test Linked --</option>
            {availableTests.map(t => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.marks} Marks)
              </option>
            ))}
          </select>

          {currentLinked ? (
            <button
              type="button"
              onClick={() => handleLinkUniversalTest(targetKey, false, '')}
              disabled={isLinking || ledgerData?.isLocked}
              title="Unlink Online Test"
              style={{
                fontSize: '7.5pt',
                padding: '4px 8px',
                fontWeight: '500',
                borderRadius: '4px',
                backgroundColor: (isLinking || ledgerData?.isLocked) ? '#f8fafc' : '#fff1f2',
                color: (isLinking || ledgerData?.isLocked) ? '#64748b' : '#e11d48',
                border: `1px solid ${(isLinking || ledgerData?.isLocked) ? '#cbd5e1' : '#fecdd3'}`,
                cursor: (isLinking || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
              }}
            >
              Unlink
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleLinkUniversalTest(targetKey, true)}
              disabled={isLinking || !selectedTestIds[targetKey] || ledgerData?.isLocked}
              title="Link Test and Auto-Sync"
              style={{
                fontSize: '7.5pt',
                padding: '4px 8px',
                fontWeight: '500',
                borderRadius: '4px',
                backgroundColor: '#ffffff',
                color: (isLinking || !selectedTestIds[targetKey] || ledgerData?.isLocked) ? '#64748b' : '#334155',
                border: `1px solid ${(isLinking || !selectedTestIds[targetKey] || ledgerData?.isLocked) ? '#e2e8f0' : '#cbd5e1'}`,
                cursor: (isLinking || !selectedTestIds[targetKey] || ledgerData?.isLocked) ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <LinkIcon size={11} /> Link
            </button>
          )}

          <button
            type="button"
            onClick={() => handleLinkUniversalTest(targetKey, true)}
            disabled={isLinking || !currentLinked || ledgerData?.isLocked}
            title="Re-sync scores for this test"
            style={{
              fontSize: '7.5pt',
              padding: '4px 8px',
              fontWeight: '600',
              borderRadius: '4px',
              backgroundColor: (isLinking || !currentLinked || ledgerData?.isLocked) ? '#f8fafc' : '#f0f9ff',
              color: (isLinking || !currentLinked || ledgerData?.isLocked) ? '#64748b' : '#0284c7',
              border: `1px solid ${(isLinking || !currentLinked || ledgerData?.isLocked) ? '#cbd5e1' : '#7dd3fc'}`,
              cursor: (isLinking || !currentLinked || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
            }}
          >
            {isLinking ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header Card */}
      <div className="cf-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '15pt', color: '#0f172a', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={22} style={{ color: '#059669' }} /> Academic Course Marks Ledger &amp; Granular Evaluation System
            </h2>
            <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
              Deep distribution ledger with online test linking across all components, automated 6-contest Kata synchronization, and full CDC audit logging.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRefreshData}
              disabled={isRefreshingData}
              style={{
                fontSize: '8.5pt',
                padding: '6px 12px',
                fontWeight: '500',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                color: '#334155',
                border: '1px solid #cbd5e1',
                cursor: isRefreshingData ? 'default' : 'pointer'
              }}
            >
              <RefreshCw size={13} className={isRefreshingData ? 'spin-smooth' : ''} style={{ color: '#475569' }} />
              <span>{isRefreshingData ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={toggleLock}
              style={{
                fontSize: '8.5pt',
                padding: '6px 12px',
                fontWeight: '500',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: ledgerData?.isLocked ? '#fef2f2' : '#ffffff',
                color: ledgerData?.isLocked ? '#b91c1c' : '#334155',
                border: `1px solid ${ledgerData?.isLocked ? '#fca5a5' : '#cbd5e1'}`,
                cursor: 'pointer'
              }}
            >
              {ledgerData?.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
              {ledgerData?.isLocked ? 'Sheet Locked' : 'Lock Sheet'}
            </button>

            <button
              type="button"
              onClick={saveLedger}
              disabled={saving || ledgerData?.isLocked}
              style={{
                fontSize: '8.5pt',
                padding: '6px 16px',
                fontWeight: '600',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: (saving || ledgerData?.isLocked) ? '#f8fafc' : '#f0fdf4',
                color: (saving || ledgerData?.isLocked) ? '#64748b' : '#15803d',
                border: `1px solid ${(saving || ledgerData?.isLocked) ? '#cbd5e1' : '#86efac'}`,
                cursor: (saving || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
              }}
            >
              <Save size={13} style={{ color: (saving || ledgerData?.isLocked) ? '#64748b' : '#15803d' }} />
              <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
            </button>
          </div>
        </div>

        {message.text && (
          <div className={`cf-alert cf-alert-${message.type}`} style={{ marginTop: '12px', fontSize: '8.5pt' }}>
            {message.text}
          </div>
        )}

        {/* Course Toolbar & Universal Online Test Linking */}
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
          {/* Active Course Selector */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>
              Select Active Course:
            </label>
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              style={{ width: '100%', maxWidth: '600px', padding: '7px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', backgroundColor: '#fff' }}
            >
              {courses.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.type === 'theory' ? 'Theory 20-30-50' : 'Lab 40-20-40'}) {c.isLocked ? '[LOCKED]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Universal Online Test Linkers Grid */}
          <div>
            <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LinkIcon size={14} style={{ color: '#0284c7' }} />
              Universal Online Test Linking Hub ({isTheory ? 'Theory: MST Quiz 1 & ESE Quiz 1' : 'Lab: Quiz 1, MST Online & ESE Online'}):
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
              {isTheory ? (
                <>
                  {renderOnlineTestLinker('mstQuiz1')}
                  {renderOnlineTestLinker('eseQuiz1')}
                </>
              ) : (
                <>
                  {renderOnlineTestLinker('labQuiz1')}
                  {renderOnlineTestLinker('mstOnline')}
                  {renderOnlineTestLinker('eseOnline')}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Course Info Pill */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <strong style={{ color: '#0f172a', fontSize: '9pt' }}>
              {currentCourse.code} — {currentCourse.name}
            </strong>
            <span style={{ marginLeft: '8px', backgroundColor: isTheory ? '#f1f5f9' : '#f0fdf4', color: isTheory ? '#334155' : '#166534', border: `1px solid ${isTheory ? '#cbd5e1' : '#bbf7d0'}`, padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold' }}>
              {isTheory ? 'THEORY (20% TA | 30% MST | 50% ESE)' : 'LAB (40% TA | 20% MST | 40% ESE)'}
            </span>
          </div>

          <div style={{ fontSize: '8pt', color: '#475569' }}>
            Total Enrolled: <strong>{ledgerData?.studentMarks?.length || 0} candidates</strong>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { id: 'ta', label: `1. Teacher Assessment (TA - Max ${isTheory ? '20m' : '40m'})`, icon: Edit3 },
          { id: 'mst', label: `2. Mid Semester Exam (MST - Scaled ${isTheory ? '30m' : '20m'})`, icon: Layers },
          { id: 'ese', label: `3. End Semester Exam (ESE - Scaled ${isTheory ? '50m' : '40m'})`, icon: BookOpen },
          { id: 'consolidated', label: `4. Consolidated Course Sheet (100m)`, icon: Award },
          { id: 'master', label: `5. Master Transcripts (All Students * Courses)`, icon: UserCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 14px',
                fontSize: '8.5pt',
                fontWeight: isActive ? 'bold' : 'normal',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: isActive ? '#f0f9ff' : '#ffffff',
                color: isActive ? '#0369a1' : '#475569',
                border: `1px solid ${isActive ? '#7dd3fc' : '#cbd5e1'}`,
                boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                cursor: 'pointer'
              }}
            >
              <Icon size={13} style={{ color: isActive ? '#0369a1' : '#64748b' }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Teacher Assessment (TA) with Granular Sub-Tabs */}
      {activeTab === 'ta' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '11.5pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                {isTheory ? 'Theory Course TA Granular Distribution (20 Marks Max)' : 'Lab Course TA Granular Distribution (40 Marks Max)'}
              </h3>
              <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2px' }}>
                {isTheory 
                  ? 'Assignments (500m → 5m) + Class Tests (100m → 5m) + Quizzes (250m → 5m) + Project (250m → 5m) = 20m Total.'
                  : '10 Practicals (100m → 20m) + Kata Contests (6 Selected → 6m) + Lab Quizzes (120m → 4m) + Project (250m → 10m) = 40m Total.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={13} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '150px' }}
              />
            </div>
          </div>

          {/* Granular Sub-Tabs Navigation */}
          <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {isTheory ? (
              <>
                {[
                  { id: 'summary', label: '📊 TA Summary (20m)' },
                  { id: 'assignments', label: '📝 Assignments (A1–A5: 500m → 5m)' },
                  { id: 'classtests', label: '📋 Class Tests (CT1–CT5: 100m → 5m)' },
                  { id: 'quizzes', label: '⚡ Quizzes (6 Quizzes: 250m → 5m)' },
                  { id: 'project', label: '💡 Course Project (250m → 5m)' }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setTaSubTab(st.id)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '8pt',
                      fontWeight: taSubTab === st.id ? 'bold' : 'normal',
                      borderRadius: '4px',
                      backgroundColor: taSubTab === st.id ? '#0f172a' : '#f1f5f9',
                      color: taSubTab === st.id ? '#ffffff' : '#334155',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                {[
                  { id: 'summary', label: '📊 TA Summary (40m)' },
                  { id: 'practicals', label: '🔬 10 Practicals (P1–P10: 100m → 20m)' },
                  { id: 'kata', label: '⚔️ Kata Contests (6 Selected → 6m)' },
                  { id: 'quizzes', label: '⚡ Lab Quizzes (Q1–Q2: 120m → 4m)' },
                  { id: 'project', label: '💡 Lab Project (250m → 10m)' }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setTaSubTab(st.id)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '8pt',
                      fontWeight: taSubTab === st.id ? 'bold' : 'normal',
                      borderRadius: '4px',
                      backgroundColor: taSubTab === st.id ? '#0f172a' : '#f1f5f9',
                      color: taSubTab === st.id ? '#ffffff' : '#334155',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Sub-View: TA Summary */}
          {taSubTab === 'summary' && (
            <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    {isTheory ? (
                      <>
                        <th>Assignments (5m)</th>
                        <th>Class Tests (5m)</th>
                        <th>Quizzes (5m)</th>
                        <th>Project (5m)</th>
                      </>
                    ) : (
                      <>
                        <th>Practicals (20m)</th>
                        <th>Kata Contests (6m)</th>
                        <th>Lab Quizzes (4m)</th>
                        <th>Lab Project (10m)</th>
                      </>
                    )}
                    <th>Total TA ({isTheory ? '20m' : '40m'})</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((sm) => (
                    <tr key={sm.studentId}>
                      <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                      <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                      {isTheory ? (
                        <>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taAssignment} / 5m</td>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taClassTest} / 5m</td>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taQuiz} / 5m</td>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taIdeation} / 5m</td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taPracticalEval} / 20m</td>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taKata} / 6m</td>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taLabQuiz} / 4m</td>
                          <td style={{ fontWeight: '600', color: '#0284c7' }}>{sm.taProject} / 10m</td>
                        </>
                      )}
                      <td style={{ fontWeight: 'bold', color: '#059669', fontSize: '9.5pt' }}>
                        {sm.totalTa} / {isTheory ? '20' : '40'} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-View: Theory Assignments (5 * 100m = 500m -> 5m) */}
          {isTheory && taSubTab === 'assignments' && (
            <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    <th>A1 (100)</th>
                    <th>A2 (100)</th>
                    <th>A3 (100)</th>
                    <th>A4 (100)</th>
                    <th>A5 (100)</th>
                    <th>Raw Sum (500)</th>
                    <th>Scaled TA (5m)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((sm) => {
                    const a = sm.theoryAssignments || {};
                    const rawSum = Number(a.a1 || 0) + Number(a.a2 || 0) + Number(a.a3 || 0) + Number(a.a4 || 0) + Number(a.a5 || 0);
                    return (
                      <tr key={sm.studentId}>
                        <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                        <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                        {['a1', 'a2', 'a3', 'a4', 'a5'].map(k => (
                          <td key={k}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={a[k] ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, `theoryAssignments.${k}`, e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '55px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                        ))}
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>{rawSum} / 500</td>
                        <td style={{ fontWeight: 'bold', color: '#059669' }}>{sm.taAssignment} / 5m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-View: Theory Class Tests (5 * 20m = 100m -> 5m) */}
          {isTheory && taSubTab === 'classtests' && (
            <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    <th>CT1 (20)</th>
                    <th>CT2 (20)</th>
                    <th>CT3 (20)</th>
                    <th>CT4 (20)</th>
                    <th>CT5 (20)</th>
                    <th>Raw Sum (100)</th>
                    <th>Scaled TA (5m)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((sm) => {
                    const ct = sm.theoryClassTests || {};
                    const rawSum = Number(ct.ct1 || 0) + Number(ct.ct2 || 0) + Number(ct.ct3 || 0) + Number(ct.ct4 || 0) + Number(ct.ct5 || 0);
                    return (
                      <tr key={sm.studentId}>
                        <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                        <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                        {['ct1', 'ct2', 'ct3', 'ct4', 'ct5'].map(k => (
                          <td key={k}>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.5"
                              value={ct[k] ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, `theoryClassTests.${k}`, e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                        ))}
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>{rawSum} / 100</td>
                        <td style={{ fontWeight: 'bold', color: '#059669' }}>{sm.taClassTest} / 5m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-View: Theory Quizzes (MST Q1-3 + ESE Q1-3 = 250m -> 5m) */}
          {isTheory && taSubTab === 'quizzes' && (
            <div>
              <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px', fontSize: '8pt', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  ⚡ <strong>Online Test Sync:</strong> MST Quiz 1 (Online - 20m) and ESE Quiz 1 (Online - 30m) can be linked directly to online exams.
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleLinkUniversalTest('mstQuiz1', true)}
                    disabled={!selectedTestIds.mstQuiz1 || linkingTarget === 'mstQuiz1' || ledgerData?.isLocked}
                    style={{ fontSize: '7.5pt', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fff', border: '1px solid #7dd3fc', color: '#0284c7', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Sync MST Q1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLinkUniversalTest('eseQuiz1', true)}
                    disabled={!selectedTestIds.eseQuiz1 || linkingTarget === 'eseQuiz1' || ledgerData?.isLocked}
                    style={{ fontSize: '7.5pt', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fff', border: '1px solid #7dd3fc', color: '#0284c7', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Sync ESE Q1
                  </button>
                </div>
              </div>

              <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                <table className="cf-table">
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th>Student ID</th>
                      <th>Candidate Name</th>
                      <th>MST Q1 (20) ⚡</th>
                      <th>MST Q2 (40)</th>
                      <th>MST Q3 (40)</th>
                      <th>ESE Q1 (30) ⚡</th>
                      <th>ESE Q2 (60)</th>
                      <th>ESE Q3 (60)</th>
                      <th>Raw Sum (250)</th>
                      <th>Scaled TA (5m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((sm) => {
                      const q = sm.theoryQuizzes || {};
                      const rawSum = Number(q.mstQuiz1 || 0) + Number(q.mstQuiz2 || 0) + Number(q.mstQuiz3 || 0) + Number(q.eseQuiz1 || 0) + Number(q.eseQuiz2 || 0) + Number(q.eseQuiz3 || 0);
                      return (
                        <tr key={sm.studentId}>
                          <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                          <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.5"
                              value={q.mstQuiz1 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'theoryQuizzes.mstQuiz1', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', fontWeight: selectedTestIds.mstQuiz1 ? 'bold' : 'normal', color: selectedTestIds.mstQuiz1 ? '#0284c7' : '#0f172a' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="40"
                              step="0.5"
                              value={q.mstQuiz2 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'theoryQuizzes.mstQuiz2', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="40"
                              step="0.5"
                              value={q.mstQuiz3 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'theoryQuizzes.mstQuiz3', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="30"
                              step="0.5"
                              value={q.eseQuiz1 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'theoryQuizzes.eseQuiz1', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', fontWeight: selectedTestIds.eseQuiz1 ? 'bold' : 'normal', color: selectedTestIds.eseQuiz1 ? '#0284c7' : '#0f172a' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              step="0.5"
                              value={q.eseQuiz2 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'theoryQuizzes.eseQuiz2', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              step="0.5"
                              value={q.eseQuiz3 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'theoryQuizzes.eseQuiz3', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '50px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                          <td style={{ fontWeight: 'bold', color: '#334155' }}>{rawSum} / 250</td>
                          <td style={{ fontWeight: 'bold', color: '#059669' }}>{sm.taQuiz} / 5m</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-View: Course Project (250m -> 5m for Theory, 250m -> 10m for Lab) */}
          {taSubTab === 'project' && (
            <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    <th>Project Evaluation Raw (250m Max)</th>
                    <th>Scaled TA Project Weight ({isTheory ? '5m' : '10m'})</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((sm) => {
                    const rawScore = isTheory ? (sm.theoryProject ?? 0) : (sm.labProject ?? 0);
                    const scaledScore = isTheory ? sm.taIdeation : sm.taProject;
                    const fieldKey = isTheory ? 'theoryProject' : 'labProject';
                    return (
                      <tr key={sm.studentId}>
                        <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                        <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="250"
                            step="1"
                            value={rawScore}
                            onChange={(e) => handleGranularMarksChange(sm.studentId, fieldKey, e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '80px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: 'bold' }}
                          />
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#059669', fontSize: '9.5pt' }}>
                          {scaledScore} / {isTheory ? '5m' : '10m'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-View: Lab Practicals (10 * 10m = 100m -> 20m) */}
          {!isTheory && taSubTab === 'practicals' && (
            <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    <th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>P5</th>
                    <th>P6</th><th>P7</th><th>P8</th><th>P9</th><th>P10</th>
                    <th>Raw (100)</th>
                    <th>Scaled TA (20m)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((sm) => {
                    const pracs = sm.labPracticals || {};
                    let rawSum = 0;
                    for (let i = 1; i <= 10; i++) rawSum += Number(pracs[`p${i}`] || 0);
                    return (
                      <tr key={sm.studentId}>
                        <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                        <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                        {Array.from({ length: 10 }, (_, i) => `p${i + 1}`).map(k => (
                          <td key={k}>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={pracs[k] ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, `labPracticals.${k}`, e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '42px', padding: '3px 4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8pt' }}
                            />
                          </td>
                        ))}
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>{rawSum} / 100</td>
                        <td style={{ fontWeight: 'bold', color: '#059669' }}>{sm.taPracticalEval} / 20m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-View: Lab Kata Contests (Option A: 6 selected contests -> 6m) */}
          {!isTheory && taSubTab === 'kata' && (
            <div>
              {/* Kata Toolbar & Settings */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Award size={15} style={{ color: '#0284c7' }} />
                    Option A Selected Contests (6 Contests = 6.0 Marks Total)
                  </div>
                  <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2px' }}>
                    Active Contests: <strong>{(ledgerData?.configuredKataContests || customKataContests).join(', ')}</strong> (1 mark per contest max)
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowKataConfig(!showKataConfig)}
                    style={{
                      fontSize: '8pt',
                      padding: '5px 10px',
                      fontWeight: '500',
                      borderRadius: '5px',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    <Settings size={13} />
                    <span>⚙ Configure 6 Contests</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncKataScores}
                    disabled={syncingKata}
                    style={{
                      fontSize: '8pt',
                      padding: '5px 12px',
                      fontWeight: '600',
                      borderRadius: '5px',
                      backgroundColor: syncingKata ? '#f8fafc' : '#f0f9ff',
                      color: syncingKata ? '#64748b' : '#0284c7',
                      border: `1px solid ${syncingKata ? '#cbd5e1' : '#7dd3fc'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: syncingKata ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <RefreshCw size={13} className={syncingKata ? 'spin-smooth' : ''} />
                    <span>{syncingKata ? 'Syncing...' : '⚡ Sync Kata Scores'}</span>
                  </button>
                </div>
              </div>

              {/* Contest Config Panel */}
              {showKataConfig && (
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #7dd3fc', borderRadius: '6px', padding: '12px 14px', marginBottom: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#0369a1', marginBottom: '6px' }}>
                    Configure Which 6 Contests Are Counted (Option A):
                  </div>
                  <div style={{ fontSize: '7.5pt', color: '#64748b', marginBottom: '10px' }}>
                    Enter exactly 6 contest IDs or select a preset. Contests 02-07 (Option A) is recommended as Contest 01 was orientation.
                  </div>

                  {/* Presets */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setCustomKataContests(
                        selectedCourseCode === 'R526CS02L'
                          ? ['SHIN02', 'SHIN03', 'SHIN04', 'SHIN05', 'SHIN06', 'SHIN07']
                          : ['FORMA02', 'FORMA03', 'FORMA04', 'FORMA05', 'FORMA06', 'FORMA07']
                      )}
                      style={{ fontSize: '7.5pt', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    >
                      Preset: Contests 02 to 07 (Option A Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomKataContests(
                        selectedCourseCode === 'R526CS02L'
                          ? ['SHIN01', 'SHIN02', 'SHIN03', 'SHIN04', 'SHIN05', 'SHIN06']
                          : ['FORMA01', 'FORMA02', 'FORMA03', 'FORMA04', 'FORMA05', 'FORMA06']
                      )}
                      style={{ fontSize: '7.5pt', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    >
                      Preset: Contests 01 to 06
                    </button>
                  </div>

                  {/* 6 Inputs Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx}>
                        <label style={{ fontSize: '7pt', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '2px' }}>
                          Contest #{idx + 1}:
                        </label>
                        <input
                          type="text"
                          value={customKataContests[idx] || ''}
                          onChange={(e) => {
                            const updated = [...customKataContests];
                            updated[idx] = e.target.value.trim().toUpperCase();
                            setCustomKataContests(updated);
                          }}
                          placeholder={selectedCourseCode === 'R526CS02L' ? `SHIN0${idx + 2}` : `FORMA0${idx + 2}`}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8pt', fontFamily: 'monospace', fontWeight: 'bold' }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleSaveKataContestsConfig}
                      disabled={savingKataConfig || customKataContests.length !== 6}
                      style={{ fontSize: '8pt', padding: '5px 12px', fontWeight: 'bold', borderRadius: '4px', backgroundColor: '#0284c7', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      {savingKataConfig ? 'Saving & Syncing...' : 'Save Configuration & Re-Sync'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowKataConfig(false)}
                      style={{ fontSize: '8pt', padding: '5px 10px', borderRadius: '4px', backgroundColor: '#fff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Kata Scores Table */}
              <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                <table className="cf-table">
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th>Student ID</th>
                      <th>Candidate Name</th>
                      {(ledgerData?.configuredKataContests || customKataContests).map((cId, idx) => (
                        <th key={idx}>
                          <div>{cId}</div>
                          <div style={{ fontSize: '7pt', color: '#64748b', fontWeight: 'normal' }}>Contest #{idx + 1}</div>
                        </th>
                      ))}
                      <th>Total Kata (6m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((sm) => {
                      const kResults = sm.labKataContests || [];
                      const activeContests = ledgerData?.configuredKataContests || customKataContests;
                      return (
                        <tr key={sm.studentId}>
                          <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                          <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                          {activeContests.map((cId, idx) => {
                            const res = kResults.find(r => String(r.contestId).toUpperCase() === String(cId).toUpperCase());
                            const norm = res ? res.normalizedScore : 0;
                            const scaled = res ? res.scaledMark : 0;
                            return (
                              <td key={idx}>
                                <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{scaled} m</div>
                                <div style={{ fontSize: '7pt', color: '#64748b' }}>({norm}/5 pts)</div>
                              </td>
                            );
                          })}
                          <td style={{ fontWeight: 'bold', color: '#059669', fontSize: '9.5pt' }}>
                            {sm.taKata} / 6.0m
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-View: Lab Quizzes (120m -> 4m) */}
          {!isTheory && taSubTab === 'quizzes' && (
            <div>
              <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px', fontSize: '8pt', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  ⚡ <strong>Online Test Sync:</strong> Lab Quiz 1 (Online - 60m) is linked to online test evaluation.
                </div>
                <button
                  type="button"
                  onClick={() => handleLinkUniversalTest('labQuiz1', true)}
                  disabled={!selectedTestIds.labQuiz1 || linkingTarget === 'labQuiz1' || ledgerData?.isLocked}
                  style={{ fontSize: '7.5pt', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#fff', border: '1px solid #7dd3fc', color: '#0284c7', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Sync Lab Quiz 1 Scores
                </button>
              </div>

              <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                <table className="cf-table">
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th>Student ID</th>
                      <th>Candidate Name</th>
                      <th>Lab Quiz 1 (60m Online) ⚡</th>
                      <th>Lab Quiz 2 (60m)</th>
                      <th>Raw Sum (120m)</th>
                      <th>Scaled TA Weight (4m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((sm) => {
                      const lq = sm.labQuizzes || {};
                      const rawSum = Number(lq.quiz1 || 0) + Number(lq.quiz2 || 0);
                      return (
                        <tr key={sm.studentId}>
                          <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                          <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              step="0.5"
                              value={lq.quiz1 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'labQuizzes.quiz1', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '55px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', fontWeight: selectedTestIds.labQuiz1 ? 'bold' : 'normal', color: selectedTestIds.labQuiz1 ? '#0284c7' : '#0f172a' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              step="0.5"
                              value={lq.quiz2 ?? 0}
                              onChange={(e) => handleGranularMarksChange(sm.studentId, 'labQuizzes.quiz2', e.target.value)}
                              disabled={ledgerData?.isLocked}
                              style={{ width: '55px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                            />
                          </td>
                          <td style={{ fontWeight: 'bold', color: '#334155' }}>{rawSum} / 120</td>
                          <td style={{ fontWeight: 'bold', color: '#059669' }}>{sm.taLabQuiz} / 4m</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Mid Semester Exam (MST) */}
      {activeTab === 'mst' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '12pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                Mid Semester Exam (MST) Evaluation &amp; Online Linking
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                {isTheory 
                  ? 'Theory MST Breakdown: Written MST (Counterfoil out of 40m) graded down to 30 Marks weight.' 
                  : 'Lab MST Breakdown: Written (40m Counterfoil) + Online (40m Test Linking) + Viva (20m Viva) = 100 Raw Marks graded down to 20 Marks weight.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '150px' }}
              />
            </div>
          </div>

          <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <table className="cf-table">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th>Student ID</th>
                  <th>Candidate Name</th>
                  <th>Written MST (40m Counterfoil)</th>
                  <th>Counterfoil Status</th>
                  {!isTheory && (
                    <>
                      <th>Online MST (40m) ⚡</th>
                      <th>Viva MST (20m)</th>
                      <th>Total Raw (100m)</th>
                    </>
                  )}
                  <th>Scaled MST Weight ({isTheory ? '30m' : '20m'})</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((sm) => (
                  <tr key={sm.studentId}>
                    <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                    <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="40"
                        step="0.5"
                        value={sm.mstWritten}
                        onChange={(e) => handleGranularMarksChange(sm.studentId, 'mstWritten', e.target.value)}
                        disabled={ledgerData?.isLocked}
                        style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: 'bold' }}
                      />
                    </td>
                    <td>
                      {sm.mstWrittenStatus === 'approved' ? (
                        <span style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={11} /> Approved
                        </span>
                      ) : sm.mstWrittenStatus === 'pending_approval' ? (
                        <span style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={11} /> Pending
                        </span>
                      ) : (
                        <span style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Edit3 size={11} /> Manual
                        </span>
                      )}
                    </td>
                    {!isTheory && (
                      <>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="40"
                            step="0.5"
                            value={sm.mstOnline}
                            onChange={(e) => handleGranularMarksChange(sm.studentId, 'mstOnline', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: selectedTestIds.mstOnline ? 'bold' : 'normal', color: selectedTestIds.mstOnline ? '#0284c7' : '#0f172a' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            value={sm.mstViva}
                            onChange={(e) => handleGranularMarksChange(sm.studentId, 'mstViva', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>
                          {Number(sm.mstWritten || 0) + Number(sm.mstOnline || 0) + Number(sm.mstViva || 0)} / 100
                        </td>
                      </>
                    )}
                    <td style={{ fontWeight: 'bold', color: '#0284c7', fontSize: '9.5pt' }}>
                      {sm.scaledMst} / {isTheory ? '30' : '20'} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: End Semester Exam (ESE) */}
      {activeTab === 'ese' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '12pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                End Semester Exam (ESE) Evaluation &amp; Online Linking
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                {isTheory 
                  ? 'Theory ESE Breakdown: Written ESE (Counterfoil out of 100m) graded down to 50 Marks weight.' 
                  : 'Lab ESE Breakdown: Written (100m Counterfoil) + Online (100m Test Linking) + Viva (40m Viva) = 240 Raw Marks graded down to 40 Marks weight.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '150px' }}
              />
            </div>
          </div>

          <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <table className="cf-table">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th>Student ID</th>
                  <th>Candidate Name</th>
                  <th>Written ESE (100m Counterfoil)</th>
                  <th>Counterfoil Status</th>
                  {!isTheory && (
                    <>
                      <th>Online ESE (100m) ⚡</th>
                      <th>Viva ESE (40m)</th>
                      <th>Total Raw (240m)</th>
                    </>
                  )}
                  <th>Scaled ESE Weight ({isTheory ? '50m' : '40m'})</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((sm) => (
                  <tr key={sm.studentId}>
                    <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                    <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={sm.eseWritten}
                        onChange={(e) => handleGranularMarksChange(sm.studentId, 'eseWritten', e.target.value)}
                        disabled={ledgerData?.isLocked}
                        style={{ width: '75px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: 'bold' }}
                      />
                    </td>
                    <td>
                      {sm.eseWrittenStatus === 'approved' ? (
                        <span style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={11} /> Approved
                        </span>
                      ) : sm.eseWrittenStatus === 'pending_approval' ? (
                        <span style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={11} /> Pending
                        </span>
                      ) : (
                        <span style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '7.5pt', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Edit3 size={11} /> Manual
                        </span>
                      )}
                    </td>
                    {!isTheory && (
                      <>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={sm.eseOnline}
                            onChange={(e) => handleGranularMarksChange(sm.studentId, 'eseOnline', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '75px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: selectedTestIds.eseOnline ? 'bold' : 'normal', color: selectedTestIds.eseOnline ? '#0284c7' : '#0f172a' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="40"
                            step="0.5"
                            value={sm.eseViva}
                            onChange={(e) => handleGranularMarksChange(sm.studentId, 'eseViva', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>
                          {Number(sm.eseWritten || 0) + Number(sm.eseOnline || 0) + Number(sm.eseViva || 0)} / 240
                        </td>
                      </>
                    )}
                    <td style={{ fontWeight: 'bold', color: '#b45309', fontSize: '9.5pt' }}>
                      {sm.scaledEse} / {isTheory ? '50' : '40'} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Consolidated Course Sheet */}
      {activeTab === 'consolidated' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '12pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                Consolidated Course Evaluation &amp; Letter Grade Sheet (100 Marks)
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                Grade Scale: 91-100: <strong>AA</strong> (10) | 81-90: <strong>AB</strong> (9) | 71-80: <strong>BB</strong> (8) | 65-70: <strong>CC</strong> (7) | 60-64: <strong>DD</strong> (6) | &lt; 60: <strong>FF</strong> (0).
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '150px' }}
              />
            </div>
          </div>

          <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <table className="cf-table">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th>Student ID</th>
                  <th>Candidate Name</th>
                  <th>TA Score ({isTheory ? '20m' : '40m'})</th>
                  <th>MST Scaled ({isTheory ? '30m' : '20m'})</th>
                  <th>ESE Scaled ({isTheory ? '50m' : '40m'})</th>
                  <th>Final Score (100m)</th>
                  <th>Letter Grade</th>
                  <th>Grade Point</th>
                  <th>Result Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((sm) => (
                  <tr key={sm.studentId}>
                    <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                    <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                    <td style={{ fontWeight: 'bold', color: '#059669' }}>{sm.totalTa}</td>
                    <td style={{ fontWeight: 'bold', color: '#0284c7' }}>{sm.scaledMst}</td>
                    <td style={{ fontWeight: 'bold', color: '#b45309' }}>{sm.scaledEse}</td>
                    <td style={{ fontWeight: 'bold', fontSize: '10.5pt', color: '#0f172a' }}>{sm.finalScore} / 100</td>
                    <td>
                      <span style={{
                        fontSize: '8.5pt',
                        fontWeight: 'bold',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        backgroundColor: sm.grade === 'FF' ? '#fee2e2' : '#dcfce7',
                        color: sm.grade === 'FF' ? '#b91c1c' : '#15803d',
                        border: `1px solid ${sm.grade === 'FF' ? '#fca5a5' : '#86efac'}`
                      }}>
                        {sm.grade}
                      </span>
                    </td>
                    <td style={{ fontWeight: 'bold', color: sm.gradePoint >= 6 ? '#15803d' : '#b91c1c' }}>{sm.gradePoint}</td>
                    <td>
                      <span style={{
                        fontSize: '7.5pt',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: sm.status === 'PASS' ? '#dcfce7' : '#fee2e2',
                        color: sm.status === 'PASS' ? '#15803d' : '#b91c1c'
                      }}>
                        {sm.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Master Transcripts (All Students * Courses Grid) */}
      {activeTab === 'master' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '12pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                Master Transcripts &amp; Academic Grade Sheet (All Students × Courses)
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                Cross-course master grid displaying final marks out of 100 and letter grades (`AA` to `FF`) for all enrolled candidates.
              </div>
            </div>

            <button
              className="cf-btn-secondary"
              onClick={handleRefreshTranscripts}
              disabled={isRefreshingTranscripts}
              style={{ fontSize: '8.5pt', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: isRefreshingTranscripts ? 'default' : 'pointer' }}
            >
              <RefreshCw size={14} className={isRefreshingTranscripts ? 'spin-smooth' : ''} />
              <span>{isRefreshingTranscripts ? 'Refreshing...' : 'Refresh Master Transcripts'}</span>
            </button>
          </div>

          {!masterTranscripts || !masterTranscripts.transcripts ? (
            <div className="cf-alert cf-alert-info">
              Loading master transcripts data across courses...
            </div>
          ) : (
            <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <table className="cf-table" style={{ fontSize: '8.5pt' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    {masterTranscripts.courses.map(c => (
                      <th key={c.code} style={{ textTransform: 'none' }}>
                        <div>{c.code}</div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b', fontWeight: 'normal' }}>
                          {c.type === 'theory' ? 'Theory (20-30-50)' : 'Lab (40-20-40)'}
                        </div>
                      </th>
                    ))}
                    <th>Cumulative GPA</th>
                  </tr>
                </thead>
                <tbody>
                  {masterTranscripts.transcripts.map((tr) => (
                    <tr key={tr.studentId}>
                      <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{tr.studentId}</td>
                      <td style={{ fontWeight: '600' }}>{tr.studentName}</td>
                      {masterTranscripts.courses.map(c => {
                        const sc = tr.courseScores?.[c.code] || { finalScore: 0, grade: 'FF', gradePoint: 0 };
                        return (
                          <td key={c.code}>
                            <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{sc.finalScore} / 100</div>
                            <span style={{
                              fontSize: '7.5pt',
                              fontWeight: 'bold',
                              padding: '1px 6px',
                              borderRadius: '3px',
                              backgroundColor: sc.grade === 'FF' ? '#fee2e2' : '#dcfce7',
                              color: sc.grade === 'FF' ? '#b91c1c' : '#15803d',
                              display: 'inline-block',
                              marginTop: '2px'
                            }}>
                              {sc.grade} ({sc.gradePoint})
                            </span>
                          </td>
                        );
                      })}
                      <td style={{ fontWeight: 'bold', fontSize: '10pt', color: tr.cgpa >= 6 ? '#15803d' : '#b91c1c' }}>
                        {tr.cgpa} / 10.0
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}