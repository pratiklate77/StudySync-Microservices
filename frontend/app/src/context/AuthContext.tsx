/* eslint-disable */
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, TutorProfile } from '../types';
import { authApi } from '../api/auth';
import Swal from 'sweetalert2';
import {
  loginAdminService,
  getAdminProfile,
  getAdminServiceToken,
  clearAdminServiceToken,
} from '../api/admin';

const ADMIN_EMAIL = 'admin@studysync.com';

interface AuthContextType {
  token: string | null;
  user: User | null;
  tutorProfile: TutorProfile | null;
  isAuthenticated: boolean;
  isTutor: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  applyAsTutor: (formData: FormData) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );
  const [tutorProfile, setTutorProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Derived states
  const isAuthenticated = !!token;
  const isTutor = user?.role === 'tutor' || !!tutorProfile || !!user?.tutor_profile;
  const isAdmin = user?.role === 'admin' || user?.email?.toLowerCase() === ADMIN_EMAIL;

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const stored = localStorage.getItem('user');
      const storedUser = stored ? (JSON.parse(stored) as User) : null;
      const isAdminSession =
        storedUser?.role === 'admin' ||
        storedUser?.email?.toLowerCase() === ADMIN_EMAIL ||
        getAdminServiceToken() === token;

      if (isAdminSession) {
        const profile = await getAdminProfile();
        const adminUser: User = {
          id: profile.id,
          email: profile.email,
          role: 'admin',
          name: profile.full_name,
        };
        setUser(adminUser);
        localStorage.setItem('user', JSON.stringify(adminUser));
        setTutorProfile(null);
        return;
      }

      const profile = await authApi.getProfile();
      setUser(profile);
      localStorage.setItem('user', JSON.stringify(profile));

      if (profile.tutor_profile) {
        setTutorProfile({
          id: profile.tutor_profile.id,
          user_id: profile.id,
          bio: profile.tutor_profile.bio || '',
          expertise: profile.tutor_profile.expertise,
          hourly_rate: profile.tutor_profile.hourly_rate,
          rating: profile.tutor_profile.total_reviews > 0
            ? profile.tutor_profile.rating_sum / profile.tutor_profile.total_reviews
            : 0,
          ratings_count: profile.tutor_profile.total_reviews,
          is_verified: profile.tutor_profile.is_verified,
        });
      } else {
        setTutorProfile(null);
      }
    } catch {
      // Failed to load profile, user session might be invalid
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        await refreshProfile();
      }
      setLoading(false);
    };

    initAuth();

    // Listen to client.ts unauthorized 401 events to log out cleanly
    const handleLogoutEvent = () => {
      setToken(null);
      setUser(null);
      setTutorProfile(null);
      Swal.fire({
        title: 'Session Expired',
        text: 'Your login session has expired. Please log in again.',
        icon: 'warning',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
    };

    window.addEventListener('auth-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Platform admin is created by Admin Service on startup — not in Identity DB.
      if (normalizedEmail === ADMIN_EMAIL) {
        const adminData = await loginAdminService(normalizedEmail, password);
        localStorage.setItem('token', adminData.access_token);
        setToken(adminData.access_token);
        const adminUser: User = {
          id: adminData.admin_id,
          email: adminData.email,
          role: 'admin',
          name: adminData.full_name,
        };
        setUser(adminUser);
        localStorage.setItem('user', JSON.stringify(adminUser));
        setTutorProfile(null);
      } else {
        const data = await authApi.login(normalizedEmail, password);
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);
        // Fetch and set user profile immediately so user.id is available right away
        try {
          const profile = await authApi.getProfile();
          setUser(profile);
          localStorage.setItem('user', JSON.stringify(profile));
          if (profile.tutor_profile) {
            setTutorProfile({
              id: profile.tutor_profile.id,
              user_id: profile.id,
              bio: profile.tutor_profile.bio || '',
              expertise: profile.tutor_profile.expertise,
              hourly_rate: profile.tutor_profile.hourly_rate,
              rating: profile.tutor_profile.total_reviews > 0
                ? profile.tutor_profile.rating_sum / profile.tutor_profile.total_reviews
                : 0,
              ratings_count: profile.tutor_profile.total_reviews,
              is_verified: profile.tutor_profile.is_verified,
            });
          }
        } catch { /* refreshProfile via useEffect will retry */ }
      }

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Logged in successfully',
        showConfirmButton: false,
        timer: 2000,
        background: '#12121e',
        color: '#f8fafc',
      });
    } catch (err: unknown) {
      setLoading(false);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    try {
      await authApi.register(email, password);
      setLoading(false);
      Swal.fire({
        title: 'Registration Successful',
        text: 'Your account has been created! Please log in with your credentials.',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
    } catch (err: unknown) {
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearAdminServiceToken();
    setToken(null);
    setUser(null);
    setTutorProfile(null);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: 'Logged out successfully',
      showConfirmButton: false,
      timer: 2000,
      background: '#12121e',
      color: '#f8fafc',
    });
  };

  const applyAsTutor = async (formData: FormData) => {
    try {
      const response = await authApi.applyTutor(formData);
      await refreshProfile();
      Swal.fire({
        title: 'Application Submitted',
        text: response.message || 'Your tutor application is now PENDING administrator review.',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
    } catch (err: unknown) {
      const error = err as { detail?: string };
      Swal.fire({
        title: 'Submission Failed',
        text: error.detail || 'An error occurred while uploading application files.',
        icon: 'error',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        tutorProfile,
        isAuthenticated,
        isTutor,
        isAdmin,
        loading,
        login,
        register,
        logout,
        applyAsTutor,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
