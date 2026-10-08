import React from 'react';
import { FileText, RefreshCw, Printer } from 'lucide-react';

export default function AdminAttendance({
  user,
  attendanceCourseCode,
  setAttendanceCourseCode,
  adminExamType,
  attendanceExamTypeOverride,
  setAttendanceExamTypeOverride,
  attendanceExamName,
  setAttendanceExamName,
  adminTimetable,
  COURSES_LIST,
  attendanceCustomDate,
  setAttendanceCustomDate,
  attendanceCustomTime,
  setAttendanceCustomTime,
  attendanceCustomMarks,
  setAttendanceCustomMarks,
  attendanceLabSheetType,
  setAttendanceLabSheetType,
  candidatesList,
  attendanceEligibilityFilter,
  setAttendanceEligibilityFilter,
  attendanceStudentsPerPage,
  setAttendanceStudentsPerPage,
  attendanceRoomNo,
  setAttendanceRoomNo,
  attendanceBenchPosition,
  setAttendanceBenchPosition,
  attendanceDegree,
  setAttendanceDegree,
  attendanceProgram,
  setAttendanceProgram,
  attendanceMainHeader,
  setAttendanceMainHeader,
  attendanceSubHeader,
  setAttendanceSubHeader,
  attendanceSemester,
  setAttendanceSemester
}) {
  const isLab = attendanceCourseCode.endsWith('L') || attendanceCourseCode.toLowerCase().includes('lab');
            
            // Exam type: 'MST' (Mid Semester Test) or 'ESE' (End Semester Examination)
            const defaultExamType = adminExamType === 'endsem' ? 'ESE' : 'MST';
            const effectiveExamType = attendanceExamTypeOverride || defaultExamType;

            // Find matched course in adminTimetable or COURSES_LIST
            const matchedSlot = adminTimetable.find(t => t.code === attendanceCourseCode || t.course.toLowerCase().includes(attendanceCourseCode.toLowerCase()));
            const selectedCourseCode = matchedSlot?.code || attendanceCourseCode;
            const selectedCourseTitle = matchedSlot?.course || (COURSES_LIST.find(c => c.startsWith(attendanceCourseCode)) || attendanceCourseCode).replace(/^[^-]+-\s*/, '');
            
            const defaultSlotDate = matchedSlot?.date ? (matchedSlot.date.includes('-') ? matchedSlot.date.split('-').reverse().join('/') : matchedSlot.date) : '11/09/2026';
            const defaultSlotTime = matchedSlot?.time || (isLab ? '02:00 PM to 05:00 PM' : '03:15 PM to 04:45 PM');
            const defaultSlotMarks = matchedSlot?.marks !== undefined ? String(matchedSlot.marks) : (isLab ? '50' : '100');

            const examDate = attendanceCustomDate || defaultSlotDate;
            const examDuration = attendanceCustomTime || defaultSlotTime;
            const examMarks = attendanceCustomMarks || defaultSlotMarks;

            let bannerSubtitle = `${effectiveExamType} of Theory Courses`;
            if (isLab) {
              if (attendanceLabSheetType === 'written') {
                bannerSubtitle = `${effectiveExamType} of Lab Courses - Written`;
              } else if (attendanceLabSheetType === 'online') {
                bannerSubtitle = `${effectiveExamType} of Lab Courses - Online/Terminal`;
              } else if (attendanceLabSheetType === 'viva') {
                bannerSubtitle = `${effectiveExamType} of Lab Courses - Viva-Voce`;
              }
            }

            // Function to re-fetch / synchronize metadata from timetable slot
            const syncFromTimetable = (courseCodeToSync) => {
              const targetCode = courseCodeToSync || attendanceCourseCode;
              const slot = adminTimetable.find(t => t.code === targetCode || t.course.toLowerCase().includes(targetCode.toLowerCase()));
              if (slot) {
                const sDate = slot.date ? (slot.date.includes('-') ? slot.date.split('-').reverse().join('/') : slot.date) : '';
                setAttendanceCustomDate(sDate);
                setAttendanceCustomTime(slot.time || '');
                setAttendanceCustomMarks(slot.marks !== undefined ? String(slot.marks) : '');
              }
            };

            // Filter students
            let studentList = (candidatesList || []).filter(cand => {
              if (attendanceEligibilityFilter === 'eligible_only') {
                return cand.courseRegistrationApproved !== false;
              }
              return true;
            }).sort((a, b) => {
              const idA = a.studentId || a.username || '';
              const idB = b.studentId || b.username || '';
              return idA.localeCompare(idB, undefined, { numeric: true });
            });

            // If candidates is empty (e.g. initial dev state), provide mock entries for preview
            if (studentList.length === 0) {
              studentList = Array.from({ length: 25 }, (_, i) => ({
                _id: `mock-${i+1}`,
                studentId: `2410700${String(i+1).padStart(2, '0')}`,
                username: `2410700${String(i+1).padStart(2, '0')}`,
                name: `SAMPLE CANDIDATE ${i+1}`
              }));
            }

            const perPage = Number(attendanceStudentsPerPage) || 18;
            const totalPages = Math.max(1, Math.ceil(studentList.length / perPage));

            // Chunk students into pages
            const pages = [];
            for (let i = 0; i < studentList.length; i += perPage) {
              pages.push(studentList.slice(i, i + perPage));
            }

            const handlePrint = () => {
              window.print();
            };

            return (
              <div style={{ padding: '0 0 40px 0' }}>
                {/* ADMIN CONTROLS BAR (Screen Only) */}
                <div className="print-hide cf-card" style={{ padding: '20px', marginBottom: '24px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', color: '#002147', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={20} color="#002147" />
                        Examination Attendance Sheet Generator
                      </h2>
                      <p style={{ margin: '4px 0 0 0', fontSize: '8.5pt', color: '#64748b' }}>
                        Generate and print standardized exam attendance registers matching the official examination format.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="cf-btn-secondary"
                        onClick={() => syncFromTimetable(attendanceCourseCode)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '9pt', fontWeight: '600' }}
                        title="Re-fetch date, duration, and marks from the timetable schedule"
                      >
                        <RefreshCw size={14} />
                        Fetch from Timetable
                      </button>

                      <button
                        type="button"
                        className="attendance-print-btn"
                        onClick={handlePrint}
                      >
                        <Printer size={16} />
                        Print Attendance Sheet (A4)
                      </button>
                    </div>
                  </div>

                  {/* Section 1: Course, Exam Type, Room, Bench */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Select Course: *
                      </label>
                      <select
                        value={attendanceCourseCode}
                        onChange={e => {
                          const newCode = e.target.value;
                          setAttendanceCourseCode(newCode);
                          syncFromTimetable(newCode);
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: '500' }}
                      >
                        {COURSES_LIST.map((c, idx) => {
                          const code = c.split(' - ')[0];
                          return (
                            <option key={idx} value={code}>
                              {c}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Examination Type (MST / ESE): *
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {[
                          { id: 'MST', label: 'MST (Mid-Sem)' },
                          { id: 'ESE', label: 'ESE (End-Sem)' }
                        ].map(opt => {
                          const isCurrent = effectiveExamType === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setAttendanceExamTypeOverride(opt.id)}
                              style={{
                                flex: '1',
                                padding: '8px 6px',
                                borderRadius: '4px',
                                border: isCurrent ? '2px solid #002147' : '1px solid #cbd5e1',
                                backgroundColor: isCurrent ? '#002147' : '#ffffff',
                                color: isCurrent ? '#ffffff' : '#334155',
                                fontWeight: 'bold',
                                fontSize: '8.5pt',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Room Number (Top-Right): *
                      </label>
                      <input
                        type="text"
                        value={attendanceRoomNo}
                        onChange={e => setAttendanceRoomNo(e.target.value)}
                        placeholder="e.g. AL 001"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt', fontWeight: 'bold' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Bench Position: *
                      </label>
                      <select
                        value={attendanceBenchPosition}
                        onChange={e => setAttendanceBenchPosition(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '9pt' }}
                      >
                        <option value="Left">Left</option>
                        <option value="Right">Right</option>
                        <option value="Center">Center</option>
                        <option value="Row 1">Row 1</option>
                        <option value="Row 2">Row 2</option>
                        <option value="All Benches">All Benches</option>
                      </select>
                    </div>
                  </div>

                  {/* Section 2: Timetable Metadata (Auto-Fetched & Fully Editable) */}
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px 16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Timetable Schedule Details (Auto-Fetched & Editable)
                      </span>
                      <span style={{ fontSize: '7.5pt', color: '#64748b' }}>
                        Matched: <strong>{selectedCourseCode}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '3px' }}>
                          Exam Date:
                        </label>
                        <input
                          type="text"
                          value={examDate}
                          onChange={e => setAttendanceCustomDate(e.target.value)}
                          placeholder="DD/MM/YYYY"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '3px' }}>
                          Duration / Timing:
                        </label>
                        <input
                          type="text"
                          value={examDuration}
                          onChange={e => setAttendanceCustomTime(e.target.value)}
                          placeholder="e.g. 03:15 PM to 04:45 PM"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '3px' }}>
                          Max Marks:
                        </label>
                        <input
                          type="text"
                          value={examMarks}
                          onChange={e => setAttendanceCustomMarks(e.target.value)}
                          placeholder="100"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '3px' }}>
                          Semester:
                        </label>
                        <input
                          type="text"
                          value={attendanceSemester}
                          onChange={e => setAttendanceSemester(e.target.value)}
                          placeholder="I"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '3px' }}>
                          Degree:
                        </label>
                        <input
                          type="text"
                          value={attendanceDegree}
                          onChange={e => setAttendanceDegree(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '3px' }}>
                          Program:
                        </label>
                        <input
                          type="text"
                          value={attendanceProgram}
                          onChange={e => setAttendanceProgram(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Header Titles & Print Settings */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Main Header (Large Title):
                      </label>
                      <input
                        type="text"
                        value={attendanceMainHeader}
                        onChange={e => setAttendanceMainHeader(e.target.value)}
                        placeholder="Preliminary Examinations 2026"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt', fontWeight: 'bold' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Sub Heading (Course Context):
                      </label>
                      <input
                        type="text"
                        value={attendanceSubHeader}
                        onChange={e => setAttendanceSubHeader(e.target.value)}
                        placeholder="Basic Introductory Computer Science (BICS) Course"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Candidates Filter:
                      </label>
                      <select
                        value={attendanceEligibilityFilter}
                        onChange={e => setAttendanceEligibilityFilter(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                      >
                        <option value="all">All Registered Students</option>
                        <option value="eligible_only">Approved Registrations Only</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '8.5pt', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                        Page Size / Rows Per Page:
                      </label>
                      <select
                        value={attendanceStudentsPerPage}
                        onChange={e => setAttendanceStudentsPerPage(Number(e.target.value))}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '8.5pt' }}
                      >
                        <option value="15">15 students / page</option>
                        <option value="18">18 students / page (Recommended)</option>
                        <option value="20">20 students / page</option>
                        <option value="25">25 students / page</option>
                        <option value="50">50 students / page</option>
                      </select>
                    </div>
                  </div>

                  {/* If Lab course, show the 3 attendance sheet types requested by user */}
                  {isLab && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '6px', padding: '12px 16px' }}>
                      <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#166534', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Lab Examination Sheet Type:
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {[
                          { id: 'written', label: '1. Written Exam Attendance Sheet', desc: 'Answer book barcode & graph' },
                          { id: 'online', label: '2. Online Exam Attendance Sheet', desc: 'Terminal / PC No. & IP tracking' },
                          { id: 'viva', label: '3. Viva-Voce Attendance Sheet', desc: 'Marks & Examiner remarks' }
                        ].map(type => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => setAttendanceLabSheetType(type.id)}
                            style={{
                              flex: '1',
                              minWidth: '200px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: attendanceLabSheetType === type.id ? '2px solid #16a34a' : '1px solid #bbf7d0',
                              backgroundColor: attendanceLabSheetType === type.id ? '#15803d' : '#ffffff',
                              color: attendanceLabSheetType === type.id ? '#ffffff' : '#14532d',
                              fontWeight: 'bold',
                              fontSize: '9pt',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div>{type.label}</div>
                            <div style={{ fontSize: '7.5pt', fontWeight: 'normal', opacity: attendanceLabSheetType === type.id ? 0.9 : 0.7, marginTop: '2px' }}>
                              {type.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* PRINTABLE DOCUMENT PREVIEW */}
                <div className="attendance-sheet-screen-wrapper">
                  {pages.map((pageRows, pageIdx) => {
                    const isLastPage = pageIdx === pages.length - 1;

                    return (
                      <div key={pageIdx} className="attendance-page">
                        <div className="attendance-page-content">
                          {/* TOP HEADER */}
                          <div>
                            {/* Room No. Box on Right */}
                            <div style={{ float: 'right', border: '1.5px solid #000', padding: '4px 16px', textAlign: 'center', minWidth: '95px' }}>
                              <div style={{ fontWeight: 'bold', fontSize: '9pt', color: '#000', lineHeight: '1.2' }}>Room No.</div>
                              <div style={{ fontWeight: 'bold', fontSize: '11pt', color: '#000', marginTop: '2px' }}>{attendanceRoomNo || 'AL 001'}</div>
                            </div>

                            {/* BICS Logo on Left */}
                            <div style={{ float: 'left', display: 'flex', alignItems: 'center' }}>
                              <img
                                src="/bics_logo.png"
                                alt="BICS Logo"
                                style={{ height: '56px', width: 'auto', objectFit: 'contain' }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>

                            {/* Center Title: Preliminary Examinations 2026 as main header and Basic Introductory Computer Science (BICS) Course as sub heading */}
                            <div style={{ textAlign: 'center', margin: '0 120px 0 70px' }}>
                              <div style={{ fontSize: '13.5pt', fontWeight: 'bold', color: '#000', textTransform: 'none', letterSpacing: '0.3px', fontFamily: 'Arial, sans-serif' }}>
                                {attendanceMainHeader || 'Preliminary Examinations 2026'}
                              </div>
                              <div style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#000', marginTop: '3px', fontFamily: 'Arial, sans-serif' }}>
                                {attendanceSubHeader || 'Basic Introductory Computer Science (BICS) Course'}
                              </div>
                            </div>

                            <div style={{ clear: 'both' }} />
                          </div>

                          {/* BLACK TITLE BANNER */}
                          <div style={{
                            backgroundColor: '#000000',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '9.5pt',
                            textAlign: 'center',
                            padding: '4px 6px',
                            margin: '10px 0 10px 0',
                            letterSpacing: '0.2px'
                          }}>
                            Attendance of Students ({bannerSubtitle})
                          </div>

                          {/* METADATA GRID (2 columns) */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.4fr 1fr',
                            rowGap: '3px',
                            columnGap: '16px',
                            fontSize: '8pt',
                            lineHeight: '1.35',
                            marginBottom: '10px',
                            color: '#000000'
                          }}>
                            <div><strong>Name of Examination :</strong> {attendanceExamName || effectiveExamType}</div>
                            <div><strong>Degree :</strong>{attendanceDegree}</div>
                            <div><strong>Course Name :</strong> ({selectedCourseCode}) {selectedCourseTitle}</div>
                            <div><strong>Program :</strong>{attendanceProgram}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '320px' }}>
                              <span><strong>Max Marks :</strong> {examMarks}</span>
                              <span><strong>Duration :</strong> {examDuration}</span>
                            </div>
                            <div><strong>Exam Date :</strong> {examDate}</div>
                            <div><strong>Bench Position :</strong> {attendanceBenchPosition}</div>
                            <div><strong>Semester :</strong>{attendanceSemester}</div>
                          </div>

                          {/* STUDENTS ATTENDANCE TABLE */}
                          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '8pt', color: '#000' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#ffffff' }}>
                                <th style={{ border: '1px solid #000', padding: '4px 3px', width: '5%', textAlign: 'center', fontWeight: 'bold' }}>
                                  Sr.<br />No.
                                </th>
                                <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                  Reg No.
                                </th>
                                <th style={{ border: '1px solid #000', padding: '4px 8px', width: '38%', textAlign: 'left', fontWeight: 'bold' }}>
                                  Name of Student
                                </th>
                                {isLab ? (
                                  attendanceLabSheetType === 'online' ? (
                                    <>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Terminal / PC No.
                                      </th>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Workstation / IP
                                      </th>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '12%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Signature<br />of Student
                                      </th>
                                    </>
                                  ) : attendanceLabSheetType === 'viva' ? (
                                    <>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Marks Obtained<br />(Max: {examMarks})
                                      </th>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Examiner Remarks
                                      </th>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '12%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Signature<br />of Student
                                      </th>
                                    </>
                                  ) : (
                                    <>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Serial No .of<br />Answer book
                                      </th>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                        No. of<br />Supplements/Graph
                                      </th>
                                      <th style={{ border: '1px solid #000', padding: '4px 6px', width: '12%', textAlign: 'center', fontWeight: 'bold' }}>
                                        Signature<br />of Student
                                      </th>
                                    </>
                                  )
                                ) : (
                                  <>
                                    <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                      Serial No .of<br />Answer book
                                    </th>
                                    <th style={{ border: '1px solid #000', padding: '4px 6px', width: '15%', textAlign: 'center', fontWeight: 'bold' }}>
                                      No. of<br />Supplements/Graph
                                    </th>
                                    <th style={{ border: '1px solid #000', padding: '4px 6px', width: '12%', textAlign: 'center', fontWeight: 'bold' }}>
                                      Signature<br />of Student
                                    </th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {pageRows.map((cand, rIdx) => {
                                const srNo = pageIdx * perPage + rIdx + 1;
                                const regNo = cand.studentId || cand.username || '-';
                                const fullName = (cand.name || cand.username || cand.studentId || '').toUpperCase();

                                return (
                                  <tr key={cand._id || rIdx} style={{ height: '26px' }}>
                                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>
                                      {srNo}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: '8.5pt' }}>
                                      {regNo}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '3px 8px', textAlign: 'left', fontWeight: '500' }}>
                                      {fullName}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center' }}></td>
                                    <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center' }}></td>
                                    <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center' }}></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* SUMMARY STATISTICS (Only on the Last Page - Reference Image 2) */}
                          {isLastPage && (
                            <table style={{
                              borderCollapse: 'collapse',
                              width: '250px',
                              margin: '18px auto 14px auto',
                              border: '1.5px solid #000',
                              fontSize: '8.5pt'
                            }}>
                              <tbody>
                                <tr>
                                  <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', textAlign: 'center', width: '60%' }}>
                                    Total Students
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', textAlign: 'center' }}>
                                    {studentList.length}
                                  </td>
                                </tr>
                                <tr>
                                  <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', textAlign: 'center' }}>
                                    Present Students
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}></td>
                                </tr>
                                <tr>
                                  <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', textAlign: 'center' }}>
                                    Absent Students
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}></td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* PAGE FOOTER & SIGNATURES BLOCK */}
                        <div className="attendance-page-footer-block">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '8.5pt', fontWeight: 'bold', padding: '0 2px' }}>
                            <div>Name and Dated Signature of Invigilator :</div>
                            <div>Name and Dated Signature of Dept.Exam Co-ordinator</div>
                          </div>
                          <hr style={{ border: 'none', borderTop: '1.5px solid #000', margin: '12px 0 5px 0' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#000', padding: '0 2px' }}>
                            <div>{examDate}</div>
                            <div>Page {pageIdx + 1} of {totalPages}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
  );
}