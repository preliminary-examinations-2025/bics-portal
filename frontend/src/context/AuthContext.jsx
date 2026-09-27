import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('bics_session');
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
      const stored = localStorage.getItem('bics_session');
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

  // Sync session to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('bics_session', JSON.stringify({ user, studentProfile }));
    } else {
      localStorage.removeItem('bics_session');
    }
  }, [user, studentProfile]);

  const login = (userData, profileData = null) => {
    setUser(userData);
    setStudentProfile(profileData);
    localStorage.setItem('bics_session', JSON.stringify({ user: userData, studentProfile: profileData }));
  };

  const logout = () => {
    setUser(null);
    setStudentProfile(null);
    localStorage.removeItem('bics_session');
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
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin'
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
