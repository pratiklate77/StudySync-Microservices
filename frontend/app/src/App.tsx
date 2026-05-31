import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import Navbar from "./components/Navbar";

// Pages
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import SessionListPage from "./pages/SessionListPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import GroupListPage from "./pages/GroupListPage";
import GroupDetailPage from "./pages/GroupDetailPage";
import ChatPage from "./pages/ChatPage";
import AdminPage from "./pages/AdminPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import NearbySessionsPage from "./pages/NearbySessionsPage";

// Guard wrapper for admin-only routes
const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// Guard wrapper for private/authenticated routes
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 min-h-screen text-slate-400">
        <div className="h-10 w-10 border-4 border-brand-indigo border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono ml-3">Authorizing access...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Root Router structure
const AppRoutes: React.FC = () => {
  const { isAdmin } = useAuth();

  // Admin gets a completely standalone layout with its own sidebar
  if (isAdmin) {
    return (
      <div className="min-h-screen flex bg-slate-950 text-slate-100 selection:bg-brand-violet/30 select-none">
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/queue"
            element={
              <AdminGuard>
                <AdminDashboardPage />
              </AdminGuard>
            }
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-brand-violet/30 select-none">
      <Navbar />
      <main className="flex-1 flex flex-col w-full">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated guarded routes */}
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardPage />
              </AuthGuard>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGuard>
                <ProfilePage />
              </AuthGuard>
            }
          />
          <Route
            path="/sessions"
            element={
              <AuthGuard>
                <SessionListPage />
              </AuthGuard>
            }
          />
          <Route
            path="/sessions/:sessionId"
            element={
              <AuthGuard>
                <SessionDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/sessions/nearby"
            element={
              <AuthGuard>
                <NearbySessionsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/groups"
            element={
              <AuthGuard>
                <GroupListPage />
              </AuthGuard>
            }
          />
          <Route
            path="/groups/:groupId"
            element={
              <AuthGuard>
                <GroupDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/chat"
            element={
              <AuthGuard>
                <ChatPage />
              </AuthGuard>
            }
          />
          <Route
            path="/chat/:groupId"
            element={
              <AuthGuard>
                <ChatPage />
              </AuthGuard>
            }
          />

          {/* Fallback redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Visual footer border highlights */}
      <footer className="py-6 border-t border-slate-900 bg-slate-950 text-center text-slate-600 text-xs">
        <p>© 2026 StudySync. Created for Advanced Collaborative Learning.</p>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Router>
          <AppRoutes />
        </Router>
      </NotificationProvider>
    </AuthProvider>
  );
};
export default App;
