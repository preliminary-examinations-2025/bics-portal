import React from 'react';
import { 
  Settings, Users, FileText, BookOpen, Activity, Video, Ticket, 
  Layers, ClipboardList, Flag, Trash2, Bell, Upload, User, ShieldAlert,
  ChevronDown, ChevronRight, CheckCircle, Calendar, Mail, MessageSquare,
  GraduationCap, Key, LogOut, Wrench
} from 'lucide-react';

export default function Sidebar({
  user,
  view,
  setView,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  dropdowns,
  setDropdowns,
  studentProfile,
  systemConfig,
  adminObjectionsList = [],
  studentObjectionsList = [],
  recycleBinItems = [],
  fetchCandidates,
  fetchSystemLogs,
  fetchLiveSubmissions,
  fetchAdminTickets,
  fetchAdminSubmissions,
  fetchAdminObjections,
  fetchRecycleBinItems,
  fetchStudentSubmissions,
  fetchSubmittedTestsList,
  fetchStudentObjections,
  fetchStudentTickets,
  setConsentSuccess,
  setContactSuccess,
  setContactError,
  setContactSubView,
  setFeedbackType,
  setFeedbackSuccess,
  setExitSuccess,
  setPwdError,
  setPwdMessage,
  setChangePasswordCodeSent,
  setChangePasswordEmailCode,
  generateChangePasswordCaptcha,
  setShowLogoutModal
}) {
  if (!user || view === 'onlinetest' || view === 'onlinetest_setup' || view === 'login') {
    return null;
  }

  return (
    <aside className={`app-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
      <nav className="sidebar-menu">
        {user.role === 'admin' ? (
          <>
            <button className={`sidebar-item ${view === 'admin' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin'); setIsMobileSidebarOpen(false); }}>
              <Settings size={16} /> Portal Settings
            </button>
            <button className={`sidebar-item ${view === 'admin_candidates' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_candidates'); setIsMobileSidebarOpen(false); }}>
              <Users size={16} /> Candidates
            </button>
            <button className={`sidebar-item ${view === 'admin_attendance' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_attendance'); setIsMobileSidebarOpen(false); fetchCandidates && fetchCandidates(); }}>
              <FileText size={16} /> Examination Attendance
            </button>
            <button className={`sidebar-item ${view === 'admin_coursework' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_coursework'); setIsMobileSidebarOpen(false); }}>
              <BookOpen size={16} /> Coursework
            </button>
            <button className={`sidebar-item ${view === 'admin_logs' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_logs'); setIsMobileSidebarOpen(false); fetchSystemLogs && fetchSystemLogs(); }}>
              <Activity size={16} /> System Logs
            </button>
            <button className={`sidebar-item ${view === 'admin_proctoring' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_proctoring'); setIsMobileSidebarOpen(false); fetchLiveSubmissions && fetchLiveSubmissions(); }}>
              <Video size={16} /> Live Proctoring
            </button>
            <button className={`sidebar-item ${view === 'admin_tickets' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_tickets'); setIsMobileSidebarOpen(false); fetchAdminTickets && fetchAdminTickets(); }}>
              <Ticket size={16} /> Tickets
            </button>
            <button className={`sidebar-item ${view === 'admin_submissions' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_submissions'); setIsMobileSidebarOpen(false); fetchAdminSubmissions && fetchAdminSubmissions(); }}>
              <Layers size={16} /> Submissions Tracker
            </button>
            <button className={`sidebar-item ${view === 'admin_counterfoil' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_counterfoil'); setIsMobileSidebarOpen(false); }}>
              <CheckCircle size={16} style={{ color: '#0284c7' }} /> Counterfoil Approvals
            </button>
            <button className={`sidebar-item ${view === 'admin_marks_ledger' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_marks_ledger'); setIsMobileSidebarOpen(false); }}>
              <GraduationCap size={16} style={{ color: '#10b981' }} /> Academic Marks Ledger
            </button>
            <button className={`sidebar-item ${view === 'admin_tests' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_tests'); setIsMobileSidebarOpen(false); }}>
              <ClipboardList size={16} /> Tests Manager
            </button>
            <button className={`sidebar-item ${view === 'admin_objections' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_objections'); setIsMobileSidebarOpen(false); fetchAdminObjections && fetchAdminObjections(); }}>
              <Flag size={16} style={{ color: '#b45309' }} /> Examination Objections
              {adminObjectionsList.filter(o => o.status === 'pending').length > 0 && (
                <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: '#fff', fontSize: '7.5pt', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                  {adminObjectionsList.filter(o => o.status === 'pending').length}
                </span>
              )}
            </button>
            <button className={`sidebar-item ${view === 'admin_recyclebin' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('admin_recyclebin'); setIsMobileSidebarOpen(false); fetchRecycleBinItems && fetchRecycleBinItems(); }}>
              <Trash2 size={16} style={{ color: '#ef4444' }} /> Recycle Bin (24h)
              {recycleBinItems.length > 0 && (
                <span style={{ marginLeft: 'auto', backgroundColor: '#64748b', color: '#fff', fontSize: '7.5pt', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                  {recycleBinItems.length}
                </span>
              )}
            </button>
          </>
        ) : (
          <>
            {/* Candidate Side Navigation Menu items */}
            <button className={`sidebar-item ${view === 'announcements' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('announcements'); setIsMobileSidebarOpen(false); }}>
              <Bell size={16} /> Announcements
            </button>

            <div className="sidebar-category">Student Related</div>
            <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, student: !dropdowns.student})}>
              Menu Links {dropdowns.student ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {dropdowns.student && (
              <div className="dropdown-container">
                <button className={`dropdown-item ${view === 'register' ? 'active' : ''}`} onClick={() => { setView('register'); setIsMobileSidebarOpen(false); }}>
                  <Upload size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Course Registration
                </button>
                <button className={`dropdown-item ${view === 'info' ? 'active' : ''}`} onClick={() => { setView('info'); setIsMobileSidebarOpen(false); }}>
                  <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Student Information
                </button>
                <button className={`dropdown-item ${view === 'conduct' ? 'active' : ''}`} onClick={() => { setView('conduct'); setIsMobileSidebarOpen(false); }}>
                  <ShieldAlert size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Code of Conduct
                </button>
              </div>
            )}

            {/* Workspace Tools Section (Disabled Coming Soon) */}
            <div className="sidebar-category">Workspace Tools</div>
            <button 
              className="sidebar-item" 
              disabled 
              style={{ 
                opacity: 0.6, 
                cursor: 'not-allowed', 
                color: '#94a3b8', 
                justifyContent: 'flex-start', 
                gap: '8px', 
                backgroundColor: 'transparent',
                border: 'none',
                width: '100%'
              }}
            >
              <Wrench size={16} /> Coming Soon ...
            </button>

            <div className="sidebar-category">CourseWork</div>
            <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, coursework: !dropdowns.coursework})}>
              Menu Links {dropdowns.coursework ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {dropdowns.coursework && (
              <div className="dropdown-container">
                <button className={`dropdown-item ${view === 'lectures' ? 'active' : ''}`} onClick={() => { setView('lectures'); setIsMobileSidebarOpen(false); }}>
                  <Video size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Lectures
                </button>
                <button className={`dropdown-item ${view === 'materials' ? 'active' : ''}`} onClick={() => { setView('materials'); setIsMobileSidebarOpen(false); }}>
                  <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Materials
                </button>
                <button className={`dropdown-item ${view === 'tests' ? 'active' : ''}`} onClick={() => { setView('tests'); setIsMobileSidebarOpen(false); }}>
                  <ClipboardList size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Online Tests
                </button>
              </div>
            )}

            <div className="sidebar-category">Submissions</div>
            <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, submissions: !dropdowns.submissions})}>
              Menu Links {dropdowns.submissions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
             {dropdowns.submissions && (
              <div className="dropdown-container">
                <button className={`dropdown-item ${view === 'submissions' ? 'active' : ''}`} onClick={() => { setView('submissions'); setIsMobileSidebarOpen(false); fetchStudentSubmissions && fetchStudentSubmissions(); }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }}>
                    <rect x="2" y="3" width="20" height="18" rx="2" />
                    <rect x="4" y="5" width="16" height="14" rx="1" />
                    <circle cx="12" cy="10" r="2" />
                    <path d="M9.5 16.5a2.5 2.5 0 0 1 5 0" />
                    <circle cx="8" cy="11.5" r="1.5" />
                    <path d="M6 16.5a2 2 0 0 1 3-1.5" />
                    <circle cx="16" cy="11.5" r="1.5" />
                    <path d="M15 15a2 2 0 0 1 3 1.5" />
                    <rect x="14.5" y="16.5" width="3" height="1" rx="0.5" />
                  </svg> Classroom
                </button>
                <button className={`dropdown-item ${view === 'verification' ? 'active' : ''}`} onClick={() => { setView('verification'); setIsMobileSidebarOpen(false); if (user && fetchSubmittedTestsList) fetchSubmittedTestsList(user.id || user._id); }}>
                  <CheckCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Verification
                </button>
              </div>
            )}

            <div className="sidebar-category">Examination</div>
            <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, exam: !dropdowns.exam})}>
              Menu Links {dropdowns.exam ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {dropdowns.exam && (
              <div className="dropdown-container">
                <button className={`dropdown-item ${view === 'schedule' ? 'active' : ''}`} onClick={() => { setView('schedule'); setIsMobileSidebarOpen(false); }}>
                  <Calendar size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Schedule
                </button>
                <button className={`dropdown-item ${view === 'hallticket' ? 'active' : ''}`} onClick={() => { setView('hallticket'); setIsMobileSidebarOpen(false); setConsentSuccess && setConsentSuccess(''); }}>
                  <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Hall ticket
                </button>
                <button className={`dropdown-item ${view === 'objections' ? 'active' : ''}`} onClick={() => { setView('objections'); setIsMobileSidebarOpen(false); if (user && fetchStudentObjections) fetchStudentObjections(user.id || user._id); }}>
                  <Flag size={14} style={{ marginRight: '6px', verticalAlign: 'middle', color: '#b45309' }} /> Objections
                  {studentObjectionsList.filter(o => o.status === 'pending').length > 0 && (
                    <span style={{ marginLeft: 'auto', backgroundColor: '#f59e0b', color: '#fff', fontSize: '7.5pt', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                      {studentObjectionsList.filter(o => o.status === 'pending').length}
                    </span>
                  )}
                </button>
                <button className={`dropdown-item ${view === 'counterfoil' ? 'active' : ''}`} onClick={() => { setView('counterfoil'); setIsMobileSidebarOpen(false); }}>
                  <ClipboardList size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Counterfoil
                </button>
              </div>
            )}

            <div className="sidebar-category">Feedback</div>
            <button className="sidebar-item" onClick={() => setDropdowns({...dropdowns, feedback: !dropdowns.feedback})}>
              Menu Links {dropdowns.feedback ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {dropdowns.feedback && (
              <div className="dropdown-container">
                <button className={`dropdown-item ${view === 'contact' ? 'active' : ''}`} onClick={() => { setView('contact'); setContactSuccess && setContactSuccess(''); setContactError && setContactError(''); setContactSubView && setContactSubView('form'); setIsMobileSidebarOpen(false); if (user && fetchStudentTickets) fetchStudentTickets(user.id || user._id); }}>
                  <Mail size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                  <span>Support Helpdesk</span>
                </button>
                <button className={`dropdown-item ${view === 'midsem' ? 'active' : ''}`} onClick={() => { setView('midsem'); setFeedbackType && setFeedbackType('mid'); setFeedbackSuccess && setFeedbackSuccess(''); setIsMobileSidebarOpen(false); }}>
                  <MessageSquare size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                  <span>Mid Sem Feedback {systemConfig && !systemConfig.midSemFeedbackActive && <sub style={{ fontSize: '7.5pt', color: '#e11d48', verticalAlign: 'sub', marginLeft: '4px' }}>(Closed)</sub>}</span>
                </button>
                <button className={`dropdown-item ${view === 'endsem' ? 'active' : ''}`} onClick={() => { setView('endsem'); setFeedbackType && setFeedbackType('end'); setFeedbackSuccess && setFeedbackSuccess(''); setIsMobileSidebarOpen(false); }}>
                  <MessageSquare size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
                  <span>End Sem Feedback {systemConfig && !systemConfig.endSemFeedbackActive && <sub style={{ fontSize: '7.5pt', color: '#e11d48', verticalAlign: 'sub', marginLeft: '4px' }}>(Closed)</sub>}</span>
                </button>
              </div>
            )}

            <div className="sidebar-category">Exit Program</div>
            <button className={`sidebar-item ${view === 'exit' ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('exit'); setExitSuccess && setExitSuccess(''); setIsMobileSidebarOpen(false); }}>
              <GraduationCap size={16} /> Exit Form
            </button>
          </>
        )}

        <button className={`sidebar-item ${view === 'changepassword' ? 'active' : ''}`} style={{ marginTop: '20px', borderTop: '1px solid #cbd5e1', justifyContent: 'flex-start', gap: '8px' }} onClick={() => { setView('changepassword'); setIsMobileSidebarOpen(false); setPwdError && setPwdError(''); setPwdMessage && setPwdMessage(''); setChangePasswordCodeSent && setChangePasswordCodeSent(false); setChangePasswordEmailCode && setChangePasswordEmailCode(''); generateChangePasswordCaptcha && generateChangePasswordCaptcha(); }}>
          <Key size={16} /> Change Password
        </button>

        <button className="sidebar-item" style={{ color: '#e11d48', justifyContent: 'flex-start', gap: '8px' }} onClick={() => setShowLogoutModal && setShowLogoutModal(true)}>
          <LogOut size={16} /> Sign Out
        </button>

      </nav>
    </aside>
  );
}
