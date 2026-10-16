import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE, getAuthToken, setAuthToken, clearAuthToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('bics_session') || sessionStorage.getItem('bics_session');
      if (stored) {
        const data = JSON.parse(stored);
        return data.user || null;
      }
    } catch (e) {
      console.warn("Failed to parse bics_session:", e);
    }
    return null;
  });

  const [studentProfile, setStudentProfile] = useState(() => {
    try {
      const stored = localStorage.getItem('bics_session') || sessionStorage.getItem('bics_session');
      if (stored) {
        const data = JSON.parse(stored);
        return data.studentProfile || null;
      }
    } catch (e) {
      console.warn("Failed to parse studentProfile from session:", e);
    }
    return null;
  });

  const [systemConfig, setSystemConfig] = useState(null);

  // Sync session changes and handle auth expired events
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setStudentProfile(null);
      clearAuthToken();
      localStorage.removeItem('bics_session');
      sessionStorage.removeItem('bics_session');
    };

    window.addEventListener('bics_auth_expired', handleAuthExpired);
    return () => window.removeEventListener('bics_auth_expired', handleAuthExpired);
  }, []);

  const login = (userData, token = null, profileData = null, rememberMe = true) => {
    setUser(userData);
    setStudentProfile(profileData);
    if (token) {
      setAuthToken(token, rememberMe);
    }
    const sessionObj = JSON.stringify({ user: userData, studentProfile: profileData });
    if (rememberMe) {
      localStorage.setItem('bics_session', sessionObj);
      sessionStorage.removeItem('bics_session');
    } else {
      sessionStorage.setItem('bics_session', sessionObj);
      localStorage.removeItem('bics_session');
    }
  };

  const logout = () => {
    setUser(null);
    setStudentProfile(null);
    clearAuthToken();
    localStorage.removeItem('bics_session');
    sessionStorage.removeItem('bics_session');
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      studentProfile,
      setStudentProfile,
      systemConfig,
      setSystemConfig,
      login,
      logout,
      isAuthenticated: !!user && !!getAuthToken(),
      isAdmin: user?.role === 'admin' && !!getAuthToken()
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
