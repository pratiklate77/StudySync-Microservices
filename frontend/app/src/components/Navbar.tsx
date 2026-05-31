import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Bell, LogOut, BookOpen, User as UserIcon, LayoutDashboard, Shield, Map, Menu, X } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout, isAdmin } = useAuth();
  const { unreadCount, notifications, markAsRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 w-full glass-panel border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Logo and Brand Title */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="bg-gradient-to-tr from-brand-indigo to-brand-violet p-2.5 rounded-xl shadow-lg group-hover:rotate-6 transition-transform">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-indigo bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
            Study<span className="text-brand-violet">Sync</span>
          </span>
        </Link>

        {/* Desktop Menu Link Options */}
        <div className="hidden md:flex items-center space-x-8">
          <Link to="/" className="text-slate-300 hover:text-white font-medium transition-colors">Home</Link>
          {isAuthenticated && (
            <>
              <Link to="/dashboard" className="text-slate-300 hover:text-white font-medium flex items-center space-x-2 transition-colors">
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
              {!isAdmin && <Link to="/sessions" className="text-slate-300 hover:text-white font-medium transition-colors">Sessions</Link>}
              {!isAdmin && <Link to="/sessions/nearby" className="text-slate-300 hover:text-white font-medium transition-colors">Nearby</Link>}
              {!isAdmin && <Link to="/groups" className="text-slate-300 hover:text-white font-medium transition-colors">Study Groups</Link>}
              {!isAdmin && <Link to="/chat" className="text-slate-300 hover:text-white font-medium transition-colors">Chat</Link>}
              <Link to="/profile" className="text-slate-300 hover:text-white font-medium flex items-center space-x-2 transition-colors">
                <UserIcon className="h-4 w-4" />
                <span>Profile</span>
              </Link>
              {isAdmin && (
                <Link to="/admin" className="text-brand-emerald hover:text-emerald-400 font-semibold flex items-center space-x-2 transition-colors">
                  <Shield className="h-4 w-4" />
                  <span>Admin Queue</span>
                </Link>
              )}
            </>
          )}
        </div>

        {/* Desktop Notification & Profile Controls */}
        <div className="hidden md:flex items-center space-x-4 relative">
          {isAuthenticated ? (
            <>
              {/* Notification bell icon dropdown */}
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-full transition-all"
              >
                <Bell className="h-5.5 w-5.5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-rose text-[9px] font-bold text-white ring-2 ring-slate-950 animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown box */}
              {showNotifications && (
                <div className="absolute right-12 top-12 w-80 glass-panel bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 max-h-96 overflow-y-auto animate-fadeIn">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800 mb-2">
                    <span className="font-semibold text-slate-100">Notifications</span>
                    <Link to="/notifications" onClick={() => setShowNotifications(false)} className="text-xs text-brand-indigo hover:underline">View All</Link>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">No notifications yet</p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.slice(0, 5).map((n) => (
                        <div 
                          key={n.id} 
                          onClick={() => {
                            markAsRead(n.id);
                            setShowNotifications(false);
                            if (n.action_url) navigate(n.action_url);
                          }}
                          className={`p-2.5 rounded-xl cursor-pointer transition-colors ${n.is_read ? 'bg-transparent hover:bg-slate-850' : 'bg-brand-indigo/10 hover:bg-brand-indigo/15 border-l-2 border-brand-indigo'}`}
                        >
                          <h4 className="text-xs font-bold text-slate-200">{n.title}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.content}</p>
                          <span className="text-[9px] text-slate-500 mt-1 block">{new Date(n.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Logged in avatar info */}
              <div className="flex items-center space-x-3 border-l border-slate-800 pl-4">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-medium text-slate-200 max-w-28 truncate">{user?.email}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">{user?.role}</span>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-brand-rose hover:bg-slate-900 rounded-full transition-all"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center space-x-4">
              <Link to="/login" className="text-slate-300 hover:text-white font-medium px-4 py-2 rounded-xl transition-all">Sign In</Link>
              <Link to="/register" className="bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg transition-all">Get Started</Link>
            </div>
          )}
        </div>

        {/* Mobile menu hamburger toggle button */}
        <div className="md:hidden flex items-center">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-400 hover:text-white p-2"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-t border-slate-800 bg-slate-950 px-6 py-4 space-y-4 animate-fadeIn">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 font-medium py-2">Home</Link>
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 font-medium py-2">Dashboard</Link>
              {!isAdmin && <Link to="/sessions" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 font-medium py-2">Sessions</Link>}
              {!isAdmin && <Link to="/sessions/nearby" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 font-medium py-2">Nearby</Link>}
              {!isAdmin && <Link to="/groups" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 font-medium py-2">Study Groups</Link>}
              <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 font-medium py-2">Profile</Link>
              {isAdmin && (
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block text-brand-emerald font-semibold py-2">Admin Queue</Link>
              )}
              <div className="border-t border-slate-800 pt-4 mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">{user?.email}</span>
                <button 
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center space-x-2 text-brand-rose font-medium text-sm py-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col space-y-2 pt-2 border-t border-slate-800">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="text-center text-slate-300 font-medium py-2">Sign In</Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="bg-gradient-to-r from-brand-indigo to-brand-violet text-center text-white font-medium py-3.5 rounded-xl shadow-lg">Get Started</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};
export default Navbar;
