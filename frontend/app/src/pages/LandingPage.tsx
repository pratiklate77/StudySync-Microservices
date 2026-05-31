import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Compass, Sparkles, Users } from 'lucide-react';
import GlassCard from '../components/GlassCard';

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="page-transition flex flex-col items-center w-full max-w-7xl mx-auto px-6 py-12 md:py-24 relative overflow-hidden">
      
      {/* Decorative background blobs */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-brand-indigo/10 rounded-full blur-3xl -z-10 animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-violet/10 rounded-full blur-3xl -z-10" />

      {/* Hero Section */}
      <div className="text-center max-w-3xl space-y-6">
        <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-full text-xs font-medium text-slate-300">
          <Sparkles className="h-4 w-4 text-brand-violet animate-pulse" />
          <span>Next-Gen Collaborative Learning Hub</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-glow-purple">
          Sync Your Study.<br />
          <span className="bg-gradient-to-r from-brand-indigo via-brand-violet to-brand-emerald bg-clip-text text-transparent">
            Elevate Your Grade.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed">
          Connect with elite verified tutors, coordinate nearby geosearch sessions, join public study circles, and chat live in real-time.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          {isAuthenticated ? (
            <Link 
              to="/dashboard" 
              className="group flex items-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold px-8 py-4 rounded-2xl shadow-xl hover:shadow-brand-indigo/20 transition-all hover:scale-103"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <>
              <Link 
                to="/register" 
                className="group flex items-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold px-8 py-4 rounded-2xl shadow-xl hover:shadow-brand-indigo/20 transition-all hover:scale-103"
              >
                <span>Get Started Free</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link 
                to="/login" 
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold px-8 py-4 rounded-2xl transition-all hover:scale-103"
              >
                Learn More
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Platform Statistics Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-5xl mt-20 md:mt-32">
        {[
          { label: 'Verified Tutors', val: '50+' },
          { label: 'Study Sessions', val: '120+' },
          { label: 'Study Groups', val: '40+' },
          { label: 'Active Users', val: '2.5k+' }
        ].map((stat, i) => (
          <GlassCard key={i} className="text-center py-8" hoverEffect={false}>
            <p className="text-4xl font-extrabold bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">{stat.val}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-1">{stat.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Core Platform Features Grid */}
      <div className="w-full max-w-5xl mt-24 md:mt-36 space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-3xl md:text-4xl font-bold text-glow-indigo">A Suite Built for Success</h2>
          <p className="text-slate-400 text-sm md:text-base">Everything you need to orchestrate an outstanding study flow.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <GlassCard className="space-y-4">
            <div className="bg-brand-indigo/10 p-3 rounded-2xl w-fit">
              <Compass className="h-6 w-6 text-brand-indigo" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">Interactive Geosearch</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Find free study halls and paid masterclass workshops coordinates nearby in real-time, plotting directly on pins maps.</p>
          </GlassCard>

          <GlassCard className="space-y-4">
            <div className="bg-brand-violet/10 p-3 rounded-2xl w-fit">
              <Users className="h-6 w-6 text-brand-violet" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">Collaborative Circles</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Join public study groups or spin up private projects networks. Share calendars, materials, and discuss homework tasks.</p>
          </GlassCard>

          <GlassCard className="space-y-4">
            <div className="bg-brand-emerald/10 p-3 rounded-2xl w-fit">
              <Sparkles className="h-6 w-6 text-brand-emerald" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">Expert Tutor Verification</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Book elite vetted tutors with secure multi-step document verification upload and automated credit processing checkouts.</p>
          </GlassCard>
        </div>
      </div>

    </div>
  );
};
export default LandingPage;
