/* eslint-disable */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Mail, Sparkles, Eye, EyeOff } from 'lucide-react';
import GlassCard from '../components/GlassCard';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      console.log("hello")
      await login(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { detail?: string };
      setError(error.detail || 'Failed to login. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-transition flex-1 flex items-center justify-center px-6 py-12 relative">
      {/* Background neon blur decorative dots */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-brand-indigo/10 rounded-full blur-3xl -z-10 animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-brand-violet/10 rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-md">
        <GlassCard className="space-y-6" glowEffect={true} hoverEffect={false}>
          
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-brand-violet" />
              <span>Welcome Back</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Sync into your workspace</p>
          </div>

          {error && (
            <div className="p-3.5 bg-brand-rose/10 border border-brand-rose/20 text-brand-rose rounded-xl text-xs font-semibold text-center animate-pulse">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400" htmlFor="email">Email address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input 
                  type="email" 
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-sm text-slate-200 outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400" htmlFor="password">Password</label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-sm text-slate-200 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold py-3.5 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center pt-2 text-xs text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-indigo hover:underline font-bold">Sign Up</Link>
          </div>

        </GlassCard>
      </div>
    </div>
  );
};
export default LoginPage;
