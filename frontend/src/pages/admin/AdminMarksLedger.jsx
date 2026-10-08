import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, BookOpen, RefreshCw, Save, Lock, Unlock, CheckCircle, 
  AlertTriangle, Edit3, Link as LinkIcon, FileText, Layers, Award, UserCheck, Search, ChevronRight
} from 'lucide-react';
import { API_BASE } from '../../config';

export default function AdminMarksLedger({ apiSecret = '' }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState('R526CS01T');
  const [activeTab, setActiveTab] = useState('ta'); // 'ta', 'mst', 'ese', 'consolidated', 'master'
  const [ledgerData, setLedgerData] = useState(null);
  const [availableMstTests, setAvailableMstTests] = useState([]);
  const [availableEseTests, setAvailableEseTests] = useState([]);
  const [selectedMstTestId, setSelectedMstTestId] = useState('');
  const [selectedEseTestId, setSelectedEseTestId] = useState('');
  const [masterTranscripts, setMasterTranscripts] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

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

  const fetchAvailableTests = async (courseCode) => {
    try {
      const resMst = await fetch(`${API_BASE}/admin/marks-ledger/available-tests?currentCourseCode=${courseCode}&targetExam=mst`);
      const dataMst = await resMst.json();
      if (Array.isArray(dataMst)) setAvailableMstTests(dataMst);

      const resEse = await fetch(`${API_BASE}/admin/marks-ledger/available-tests?currentCourseCode=${courseCode}&targetExam=ese`);
      const dataEse = await resEse.json();
      if (Array.isArray(dataEse)) setAvailableEseTests(dataEse);
    } catch (e) {
      console.error("Failed to load available tests:", e);
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
        setSelectedMstTestId(data.linkedMstOnlineTestId || data.linkedOnlineTestId || '');
        setSelectedEseTestId(data.linkedEseOnlineTestId || '');
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
      fetchCourseLedger(selectedCourseCode);
      fetchAvailableTests(selectedCourseCode);
    }
  }, [selectedCourseCode]);

  // Recalculate Student Entry locally upon input change
  const handleMarksChange = (studentId, field, val) => {
    if (ledgerData?.isLocked) return;

    setLedgerData(prev => {
      if (!prev) return prev;
      const updatedMarks = prev.studentMarks.map(sm => {
        if (String(sm.studentId) === String(studentId)) {
          const numVal = Math.max(0, Number(val) || 0);
          const updatedEntry = { ...sm, [field]: numVal };

          // Perform live recalculation
          const isTheory = prev.courseType === 'theory';
          
          let totalTa = 0;
          if (isTheory) {
            totalTa = Number(updatedEntry.taAssignment || 0) + Number(updatedEntry.taClassTest || 0) + Number(updatedEntry.taQuiz || 0) + Number(updatedEntry.taIdeation || 0);
            totalTa = Math.min(20, totalTa);
          } else {
            totalTa = Number(updatedEntry.taPracticalEval || 0) + Number(updatedEntry.taLabQuiz || 0) + Number(updatedEntry.taProject || 0);
            totalTa = Math.min(40, totalTa);
          }

          let scaledMst = 0;
          const wMst = Math.min(40, Number(updatedEntry.mstWritten || 0));
          if (isTheory) {
            scaledMst = (wMst / 40) * 30;
          } else {
            const oMst = Math.min(40, Number(updatedEntry.mstOnline || 0));
            const vMst = Math.min(20, Number(updatedEntry.mstViva || 0));
            const rawMst = wMst + oMst + vMst;
            scaledMst = (rawMst / 100) * 20;
          }

          let scaledEse = 0;
          const wEse = Math.min(100, Number(updatedEntry.eseWritten || 0));
          if (isTheory) {
            scaledEse = (wEse / 100) * 50;
          } else {
            const oEse = Math.min(100, Number(updatedEntry.eseOnline || 0));
            const vEse = Math.min(40, Number(updatedEntry.eseViva || 0));
            const rawEse = wEse + oEse + vEse;
            scaledEse = (rawEse / 240) * 40;
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
            ...updatedEntry,
            totalTa: Math.round(totalTa * 100) / 100,
            scaledMst: Math.round(scaledMst * 100) / 100,
            scaledEse: Math.round(scaledEse * 100) / 100,
            finalScore,
            grade,
            gradePoint,
            status
          };
        }
        return sm;
      });

      return { ...prev, studentMarks: updatedMarks };
    });
  };

  // Save Ledger Changes
  const saveLedger = async () => {
    if (!ledgerData) return;
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/save/${selectedCourseCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedMstOnlineTestId: selectedMstTestId,
          linkedEseOnlineTestId: selectedEseTestId,
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

  // Link Online Test & Optionally Sync Online Scores for Lab MST (40m) or ESE (100m)
  const handleLinkTest = async (targetExam = 'mst', syncScores = false, overrideTestId = null) => {
    setLinking(true);
    setMessage({ type: '', text: '' });

    const testId = overrideTestId !== null ? overrideTestId : (targetExam === 'mst' ? selectedMstTestId : selectedEseTestId);

    try {
      const res = await fetch(`${API_BASE}/admin/marks-ledger/link-test/${selectedCourseCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          targetExam,
          syncOnlineScores: syncScores
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        if (targetExam === 'mst') setSelectedMstTestId(testId);
        else setSelectedEseTestId(testId);
        fetchCourseLedger(selectedCourseCode);
        fetchAvailableTests(selectedCourseCode);
      } else {
        setMessage({ type: 'danger', text: data.error || "Failed to link test." });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'danger', text: "Error communicating with server to link online test." });
    } finally {
      setLinking(false);
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

  const currentCourse = courses.find(c => c.code === selectedCourseCode) || { code: selectedCourseCode, name: selectedCourseCode, type: 'theory' };
  const isTheory = ledgerData?.courseType === 'theory';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Title Card */}
      <div className="cf-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '16pt', color: '#0f172a', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={22} style={{ color: '#059669' }} /> Academic Course Marks Ledger &amp; Evaluation System
            </h2>
            <div style={{ fontSize: '9pt', color: '#64748b' }}>
              Manage TA components, Mid-Sem (MST), and End-Sem (ESE) evaluations for Theory (20-30-50) and Lab (40-20-40) proportions.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                fetchCourseLedger(selectedCourseCode);
                fetchAvailableTests(selectedCourseCode);
                fetchMasterTranscripts();
              }}
              style={{
                fontSize: '8.5pt',
                padding: '6px 14px',
                fontWeight: '500',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                color: '#334155',
                border: '1px solid #cbd5e1',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} style={{ color: '#475569' }} /> Refresh Data
            </button>

            <button
              type="button"
              onClick={toggleLock}
              style={{
                fontSize: '8.5pt',
                padding: '6px 14px',
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
              {ledgerData?.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
              {ledgerData?.isLocked ? 'Sheet Locked' : 'Lock Marks Sheet'}
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
              <Save size={14} style={{ color: (saving || ledgerData?.isLocked) ? '#64748b' : '#15803d' }} />
              <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
            </button>
          </div>
        </div>

        {message.text && (
          <div className={`cf-alert cf-alert-${message.type}`} style={{ marginTop: '15px', fontSize: '9pt' }}>
            {message.text}
          </div>
        )}

        {/* Course Toolbar & Online Exam Assignment */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px', marginTop: '18px', paddingTop: '15px', borderTop: '1px solid #e2e8f0' }}>
          {/* Select Course */}
          <div>
            <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>
              Select Active Course:
            </label>
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '9.5pt', fontWeight: 'bold', color: '#0f172a', backgroundColor: '#fff' }}
            >
              {courses.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name} ({c.type === 'theory' ? 'Theory 20-30-50' : 'Lab 40-20-40'}) {c.isLocked ? '[LOCKED]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Online Exam Linking Section (Lab Courses Only) */}
          {isTheory ? (
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px', fontSize: '8.5pt', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ color: '#0284c7', flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#0f172a' }}>Theory Course Evaluation:</strong> Online test linking is not used for Theory courses. Evaluation is based on TA (20m), Written MST Counterfoil (30m), and Written ESE Counterfoil (50m).
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
              {/* Lab MST Online Exam (40m Max) */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Assign Lab MST Online Exam (40m Max):
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    value={selectedMstTestId}
                    onChange={(e) => setSelectedMstTestId(e.target.value)}
                    disabled={ledgerData?.isLocked}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', backgroundColor: '#fff' }}
                  >
                    <option value="">-- No MST Online Test Linked --</option>
                    {availableMstTests.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.marks} Marks)
                      </option>
                    ))}
                  </select>

                  {selectedMstTestId ? (
                    <button
                      type="button"
                      onClick={() => handleLinkTest('mst', false, '')}
                      disabled={linking || ledgerData?.isLocked}
                      style={{
                        fontSize: '7.5pt',
                        padding: '5px 10px',
                        fontWeight: '500',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        backgroundColor: (linking || ledgerData?.isLocked) ? '#f8fafc' : '#fff1f2',
                        color: (linking || ledgerData?.isLocked) ? '#64748b' : '#e11d48',
                        border: `1px solid ${(linking || ledgerData?.isLocked) ? '#cbd5e1' : '#fecdd3'}`,
                        cursor: (linking || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Unlink / Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLinkTest('mst', false)}
                      disabled={linking || ledgerData?.isLocked}
                      style={{
                        fontSize: '7.5pt',
                        padding: '5px 10px',
                        fontWeight: '500',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        backgroundColor: '#ffffff',
                        color: (linking || ledgerData?.isLocked) ? '#64748b' : '#334155',
                        border: `1px solid ${(linking || ledgerData?.isLocked) ? '#e2e8f0' : '#cbd5e1'}`,
                        cursor: (linking || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <LinkIcon size={12} /> Link
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleLinkTest('mst', true)}
                    disabled={linking || !selectedMstTestId || ledgerData?.isLocked}
                    style={{
                      fontSize: '7.5pt',
                      padding: '5px 10px',
                      fontWeight: '600',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      backgroundColor: (linking || !selectedMstTestId || ledgerData?.isLocked) ? '#f8fafc' : '#f0f9ff',
                      color: (linking || !selectedMstTestId || ledgerData?.isLocked) ? '#64748b' : '#0284c7',
                      border: `1px solid ${(linking || !selectedMstTestId || ledgerData?.isLocked) ? '#cbd5e1' : '#7dd3fc'}`,
                      cursor: (linking || !selectedMstTestId || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Sync Scores
                  </button>
                </div>
              </div>

              {/* Lab ESE Online Exam (100m Max) */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                <label style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Assign Lab ESE Online Exam (100m Max):
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    value={selectedEseTestId}
                    onChange={(e) => setSelectedEseTestId(e.target.value)}
                    disabled={ledgerData?.isLocked}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', backgroundColor: '#fff' }}
                  >
                    <option value="">-- No ESE Online Test Linked --</option>
                    {availableEseTests.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.marks} Marks)
                      </option>
                    ))}
                  </select>

                  {selectedEseTestId ? (
                    <button
                      type="button"
                      onClick={() => handleLinkTest('ese', false, '')}
                      disabled={linking || ledgerData?.isLocked}
                      style={{
                        fontSize: '7.5pt',
                        padding: '5px 10px',
                        fontWeight: '500',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        backgroundColor: (linking || ledgerData?.isLocked) ? '#f8fafc' : '#fff1f2',
                        color: (linking || ledgerData?.isLocked) ? '#64748b' : '#e11d48',
                        border: `1px solid ${(linking || ledgerData?.isLocked) ? '#cbd5e1' : '#fecdd3'}`,
                        cursor: (linking || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Unlink / Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLinkTest('ese', false)}
                      disabled={linking || ledgerData?.isLocked}
                      style={{
                        fontSize: '7.5pt',
                        padding: '5px 10px',
                        fontWeight: '500',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        backgroundColor: '#ffffff',
                        color: (linking || ledgerData?.isLocked) ? '#64748b' : '#334155',
                        border: `1px solid ${(linking || ledgerData?.isLocked) ? '#e2e8f0' : '#cbd5e1'}`,
                        cursor: (linking || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <LinkIcon size={12} /> Link
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleLinkTest('ese', true)}
                    disabled={linking || !selectedEseTestId || ledgerData?.isLocked}
                    style={{
                      fontSize: '7.5pt',
                      padding: '5px 10px',
                      fontWeight: '600',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      backgroundColor: (linking || !selectedEseTestId || ledgerData?.isLocked) ? '#f8fafc' : '#f0f9ff',
                      color: (linking || !selectedEseTestId || ledgerData?.isLocked) ? '#64748b' : '#0369a1',
                      border: `1px solid ${(linking || !selectedEseTestId || ledgerData?.isLocked) ? '#cbd5e1' : '#7dd3fc'}`,
                      cursor: (linking || !selectedEseTestId || ledgerData?.isLocked) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Sync Scores
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Course Info Pill */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px', marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong style={{ color: '#0f172a', fontSize: '9.5pt' }}>
              {currentCourse.code} — {currentCourse.name}
            </strong>
            <span style={{ marginLeft: '10px', backgroundColor: isTheory ? '#f1f5f9' : '#f0fdf4', color: isTheory ? '#334155' : '#166534', border: `1px solid ${isTheory ? '#cbd5e1' : '#bbf7d0'}`, padding: '2px 8px', borderRadius: '4px', fontSize: '8pt', fontWeight: 'bold' }}>
              {isTheory ? 'THEORY COURSE (20% TA | 30% MST | 50% ESE)' : 'LAB COURSE (40% TA | 20% MST | 40% ESE)'}
            </span>
          </div>

          <div style={{ fontSize: '8.5pt', color: '#475569' }}>
            Total Enrolled Candidates: <strong>{ledgerData?.studentMarks?.length || 0}</strong>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                padding: '8px 16px',
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
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={14} style={{ color: isActive ? '#0369a1' : '#64748b' }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Teacher Assessment (TA) */}
      {activeTab === 'ta' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '12pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                Teacher Assessment (TA) Components
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                {isTheory 
                  ? 'Theory TA Breakdown: Assignment (5m) + Class Test (5m) + Quiz (5m) + Ideation (5m) = 20 Marks Total.' 
                  : 'Lab TA Breakdown: Practical Continuous Eval (30m) + Quiz (04m) + Project/Ideation (06m) = 40 Marks Total.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '160px' }}
              />
            </div>
          </div>

          <div className="table-responsive" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
            <table className="cf-table">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th>Student ID</th>
                  <th>Candidate Name</th>
                  {isTheory ? (
                    <>
                      <th>Assignment (5m)</th>
                      <th>Class Test (5m)</th>
                      <th>Quiz (5m)</th>
                      <th>Ideation (5m)</th>
                    </>
                  ) : (
                    <>
                      <th>Practical Eval (30m)</th>
                      <th>Lab Quiz (4m)</th>
                      <th>Project / Ideation (6m)</th>
                    </>
                  )}
                  <th>TA Subtotal ({isTheory ? '20m' : '40m'})</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((sm) => (
                  <tr key={sm.studentId}>
                    <td style={{ fontWeight: 'bold', color: '#0f172a', fontFamily: 'monospace' }}>{sm.studentId}</td>
                    <td style={{ fontWeight: '600' }}>{sm.studentName}</td>
                    {isTheory ? (
                      <>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.5"
                            value={sm.taAssignment}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taAssignment', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.5"
                            value={sm.taClassTest}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taClassTest', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.5"
                            value={sm.taQuiz}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taQuiz', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.5"
                            value={sm.taIdeation}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taIdeation', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            step="0.5"
                            value={sm.taPracticalEval}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taPracticalEval', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="4"
                            step="0.5"
                            value={sm.taLabQuiz}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taLabQuiz', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="6"
                            step="0.5"
                            value={sm.taProject}
                            onChange={(e) => handleMarksChange(sm.studentId, 'taProject', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '65px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
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
        </div>
      )}

      {/* Tab 2: Mid Semester Exam (MST) */}
      {activeTab === 'mst' && (
        <div className="cf-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '12pt', color: '#0f172a', margin: 0, fontWeight: 'bold' }}>
                Mid Semester Exam (MST) Evaluation &amp; Counterfoil Sync
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                {isTheory 
                  ? 'Theory MST Breakdown: Written MST (Counterfoil out of 40m) graded down to 30 Marks weight.' 
                  : 'Lab MST Breakdown: Written (40m Counterfoil) + Online (40m Admin/OT) + Viva (20m Admin) = 100 Raw Marks graded down to 20 Marks weight.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '160px' }}
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
                      <th>Online MST (40m)</th>
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
                        onChange={(e) => handleMarksChange(sm.studentId, 'mstWritten', e.target.value)}
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
                            onChange={(e) => handleMarksChange(sm.studentId, 'mstOnline', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            value={sm.mstViva}
                            onChange={(e) => handleMarksChange(sm.studentId, 'mstViva', e.target.value)}
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
                End Semester Exam (ESE) Evaluation &amp; Counterfoil Sync
              </h3>
              <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                {isTheory 
                  ? 'Theory ESE Breakdown: Written ESE (Counterfoil out of 100m) graded down to 50 Marks weight.' 
                  : 'Lab ESE Breakdown: Written (100m Counterfoil) + Online (100m Admin/OT) + Viva (40m Admin) = 240 Raw Marks graded down to 40 Marks weight.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search candidate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '160px' }}
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
                      <th>Online ESE (100m)</th>
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
                        onChange={(e) => handleMarksChange(sm.studentId, 'eseWritten', e.target.value)}
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
                            onChange={(e) => handleMarksChange(sm.studentId, 'eseOnline', e.target.value)}
                            disabled={ledgerData?.isLocked}
                            style={{ width: '75px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="40"
                            step="0.5"
                            value={sm.eseViva}
                            onChange={(e) => handleMarksChange(sm.studentId, 'eseViva', e.target.value)}
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
                style={{ border: 'none', outline: 'none', fontSize: '8.5pt', width: '160px' }}
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
              onClick={fetchMasterTranscripts}
              style={{ fontSize: '8.5pt', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} /> Refresh Master Transcripts
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
