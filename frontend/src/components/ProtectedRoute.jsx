import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user?.role || 'student';
    if (!allowedRoles.includes(userRole)) {
      if (userRole === 'admin') {
        return <Navigate to="/main/admin/dashboard" replace />;
      }
      return <Navigate to="/main/home" replace />;
    }
  }

  return children;
}
