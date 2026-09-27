import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, X, User, Lock, LogOut, ChevronDown, ChevronRight, 
  Upload, FileText, Calendar, ShieldAlert,
  Key, Video, BookOpen, ClipboardList, Settings, Users,
  GraduationCap, MessageSquare, Clock, Activity,
  Trash2, Ticket, Flag, Bell, Layers, LifeBuoy, Check, Code, Home, Printer, HelpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function NavigationLayout() {
  const { user, studentProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [dropdowns, setDropdowns] = useState({
    student: true,
    coursework: true,
    submissions: true,
    exam: true,
    feedback: true
  });

  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileSidebarOpen]);

  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div>
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {user && (
            <button className="sidebar-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
              {isMobileSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
          <img src="/bics_logo.png" alt="BICS Logo" style={{ height: '42px', width: '42px', objectFit: 'contain' }} />
          <span className="pixel-logo">BICS Portal</span>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user && (
            <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#3b5998', fontFamily: 'verdana, arial, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <User size={14} style={{ color: '#3b5998' }} />
              <span>{user.role === 'admin' ? 'Administrator' : (studentProfile?.name || user.name || 'Student')}</span>
            </span>
          )}
          <button 
            type="button" 
            onClick={handleLogout}
            title="Sign Out"
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '8.5pt', fontWeight: 'bold' }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
          <img src="/logo.png" alt="Preliminary Examinations Logo" className="pe-logo" />
        </div>
      </header>

      {/* DASHBOARD CONTAINER */}
      <div className="app-container">
        {/* SIDEBAR */}
        {user && (
          <aside className={`app-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
            <nav className="sidebar-menu">
              {user.role === 'admin' ? (
                <>
                  <NavLink to="/main/admin/dashboard" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Settings size={16} /> Portal Settings
                  </NavLink>
                  <NavLink to="/main/admin/candidates" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Users size={16} /> Candidates
                  </NavLink>
                  <NavLink to="/main/admin/attendance" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <FileText size={16} /> Examination Attendance
                  </NavLink>
                  <NavLink to="/main/admin/coursework" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <BookOpen size={16} /> Coursework
                  </NavLink>
                  <NavLink to="/main/admin/logs" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Activity size={16} /> System Logs
                  </NavLink>
                  <NavLink to="/main/admin/proctoring" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Video size={16} /> Live Proctoring
                  </NavLink>
                  <NavLink to="/main/admin/tickets" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Ticket size={16} /> Tickets
                  </NavLink>
                  <NavLink to="/main/admin/submissions" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Layers size={16} /> Submissions Tracker
                  </NavLink>
                  <NavLink to="/main/admin/tests" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <ClipboardList size={16} /> Tests Manager
                  </NavLink>
                  <NavLink to="/main/admin/objections" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Flag size={16} style={{ color: '#b45309' }} /> Examination Objections
                  </NavLink>
                  <NavLink to="/main/admin/recyclebin" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Trash2 size={16} style={{ color: '#ef4444' }} /> Recycle Bin (24h)
                  </NavLink>
                </>
              ) : (
                <>
                  {/* Candidate Side Navigation Menu items */}
                  <NavLink to="/main/home" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Bell size={16} /> Announcements
                  </NavLink>

                  <div className="sidebar-category">Student Related</div>
                  <button type="button" className="sidebar-item" onClick={() => setDropdowns({...dropdowns, student: !dropdowns.student})}>
                    Menu Links {dropdowns.student ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.student && (
                    <div className="dropdown-container">
                      <NavLink to="/main/student/course-registration" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <Upload size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Course Registration
                      </NavLink>
                      <NavLink to="/main/student/information" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Student Information
                      </NavLink>
                      <NavLink to="/main/student/coc" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <Check size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Code of Conduct
                      </NavLink>
                    </div>
                  )}

                  <div className="sidebar-category">CourseWork</div>
                  <button type="button" className="sidebar-item" onClick={() => setDropdowns({...dropdowns, coursework: !dropdowns.coursework})}>
                    Menu Links {dropdowns.coursework ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.coursework && (
                    <div className="dropdown-container">
                      <NavLink to="/main/coursework/lectures" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <Video size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Video Lectures
                      </NavLink>
                      <NavLink to="/main/coursework/materials" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <BookOpen size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Course Materials
                      </NavLink>
                      <NavLink to="/main/coursework/online-tests" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <ClipboardList size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Online Tests
                      </NavLink>
                    </div>
                  )}

                  <div className="sidebar-category">Submissions</div>
                  <button type="button" className="sidebar-item" onClick={() => setDropdowns({...dropdowns, submissions: !dropdowns.submissions})}>
                    Menu Links {dropdowns.submissions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.submissions && (
                    <div className="dropdown-container">
                      <NavLink to="/main/submissions/classroom" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <Layers size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Classroom Submissions
                      </NavLink>
                      <NavLink to="/main/submissions/verification" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <FileText size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Answer Sheet Verification
                      </NavLink>
                    </div>
                  )}

                  <div className="sidebar-category">Examination</div>
                  <button type="button" className="sidebar-item" onClick={() => setDropdowns({...dropdowns, exam: !dropdowns.exam})}>
                    Menu Links {dropdowns.exam ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.exam && (
                    <div className="dropdown-container">
                      <NavLink to="/main/examination/schedule" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <Calendar size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Exam Schedule
                      </NavLink>
                      <NavLink to="/main/examination/hall-ticket" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <Printer size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Hall Ticket Generation
                      </NavLink>
                    </div>
                  )}

                  <div className="sidebar-category">Support and Feedback</div>
                  <button type="button" className="sidebar-item" onClick={() => setDropdowns({...dropdowns, feedback: !dropdowns.feedback})}>
                    Menu Links {dropdowns.feedback ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {dropdowns.feedback && (
                    <div className="dropdown-container">
                      <NavLink to="/main/support/ticket" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <LifeBuoy size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Open Technical Ticket
                      </NavLink>
                      <NavLink to="/main/support/feedback/general" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <MessageSquare size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> General Feedback
                      </NavLink>
                      <NavLink to="/main/support/feedback" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`} onClick={closeMobileSidebar}>
                        <MessageSquare size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Midsem / Endsem Feedback
                      </NavLink>
                    </div>
                  )}

                  <div className="sidebar-category">Exit Program</div>
                  <NavLink to="/main/exit/form" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <GraduationCap size={16} /> Exit Clearance Form
                  </NavLink>

                  <div className="sidebar-category">Account Settings</div>
                  <NavLink to="/main/student/information/change-password" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} style={{ justifyContent: 'flex-start', gap: '8px' }} onClick={closeMobileSidebar}>
                    <Key size={16} /> Change Password
                  </NavLink>
                </>
              )}
            </nav>
          </aside>
        )}

        {/* MAIN CONTENT WORKSPACE */}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
