/* eslint-disable */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sessionsApi } from '../api/sessions';
import { paymentsApi } from '../api/payments';
import type { Session } from '../types';
import {
  BookOpen, Calendar, Users, Star, TrendingUp, DollarSign,
  PlusCircle, Clock, CheckCircle, Edit3, ArrowUpRight,
  BadgeCheck, Zap, MessageCircle, Wallet, CreditCard,
  ChevronRight
} from 'lucide-react';
import GlassCard from '../components/GlassCard';

const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-brand-indigo',
  active: 'bg-emerald-400 animate-pulse',
  completed: 'bg-slate-500',
  cancelled: 'bg-red-400',
};

export const TutorDashboardPage: React.FC = () => {
  const { user, tutorProfile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      // Use /my endpoint to get only this tutor's sessions
      const raw = await sessionsApi.getMy();
      setSessions(raw || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWalletData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setTxLoading(true);
      const [balRes, txRes] = await Promise.all([
        paymentsApi.getWalletBalance(user.id),
        paymentsApi.getWalletTransactions(user.id, 1, 10),
      ]);
      setWalletBalance(balRes.balance);
      setTransactions(txRes.transactions || []);
    } catch {
      // wallet not set up yet — that's fine
    } finally {
      setTxLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSessions();
    fetchWalletData();
  }, [fetchSessions, fetchWalletData]);

  const activeSessions = sessions.filter(s => s.status === 'active');
  const totalStudents  = sessions.reduce((acc, s) => acc + (s.participants?.length ?? 0), 0);

  const STATS = [
    { label: 'My Sessions',     value: sessions.length,        icon: Calendar,   color: 'text-brand-violet' },
    { label: 'Active Now',      value: activeSessions.length,  icon: Zap,        color: 'text-emerald-400' },
    { label: 'Total Students',  value: totalStudents,          icon: Users,      color: 'text-brand-indigo' },
    { label: 'Wallet Balance',  value: walletBalance != null ? `$${parseFloat(walletBalance).toFixed(2)}` : '—', icon: Wallet, color: 'text-amber-400' },
  ];

  return (
    <div className="page-transition flex-1 max-w-7xl w-full mx-auto px-6 py-10 space-y-10">

      {/* ── Hero Banner ── */}
      <div className="relative bg-gradient-to-r from-brand-violet/20 via-brand-indigo/15 to-transparent rounded-3xl border border-brand-violet/20 p-8 overflow-hidden">
        <div className="absolute right-0 top-0 w-72 h-72 bg-brand-violet/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              {tutorProfile?.is_verified ? (
                <span className="inline-flex items-center space-x-1.5 text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <BadgeCheck className="h-3 w-3" />
                  <span>Verified Tutor</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-400/20">
                  <Clock className="h-3 w-3 animate-pulse" />
                  <span>Pending Verification</span>
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Welcome back, <span className="bg-gradient-to-r from-brand-violet to-brand-indigo bg-clip-text text-transparent">{user?.email?.split('@')[0]}</span>
            </h1>
            <p className="text-sm text-slate-400 font-light max-w-lg">
              {tutorProfile?.is_verified
                ? 'You can host paid and free sessions. Manage your classes below.'
                : 'Your tutor application is under review. You can still create free study sessions.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <Link
              to="/sessions"
              className="flex items-center space-x-2 bg-gradient-to-r from-brand-violet to-brand-indigo hover:opacity-95 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg transition-all"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Create Session</span>
            </Link>
            <Link
              to="/groups"
              className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all"
            >
              <Users className="h-4 w-4" />
              <span>Study Groups</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {STATS.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <GlassCard key={idx} className="space-y-3" hoverEffect={true}>
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${stat.color}`} />
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white">{stat.value}</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-0.5">{stat.label}</p>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid md:grid-cols-3 gap-8">

        {/* My Sessions Panel */}
        <div className="md:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <BookOpen className="h-5 w-5 text-brand-violet" />
              <span>My Sessions</span>
            </h2>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(n => <div key={n} className="h-20 bg-slate-900/60 rounded-2xl border border-slate-800" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-16 text-center border border-slate-800 bg-slate-900/30 rounded-2xl space-y-3">
              <Calendar className="h-10 w-10 text-slate-700 mx-auto" />
              <p className="text-slate-500 text-sm">No sessions yet.</p>
              <Link to="/sessions" className="inline-block text-xs font-bold text-brand-indigo hover:underline">
                Create your first session →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => {
                const enrolled = session.participants?.length ?? 0;
                return (
                  <div key={session.id} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-2xl transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${STATUS_DOT[session.status] || 'bg-slate-600'}`} />
                      <div className={`p-2 rounded-xl ${session.type === 'paid' ? 'bg-brand-rose/10 text-brand-rose' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {session.type === 'paid' ? <DollarSign className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{session.title}</p>
                        <div className="flex items-center space-x-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-slate-500 capitalize">{session.status}</span>
                          <span className="text-slate-700">·</span>
                          <span className="text-[10px] text-slate-500">{new Date(session.schedule).toLocaleDateString()}</span>
                          <span className="text-slate-700">·</span>
                          <span className="text-[10px] text-slate-400"><Users className="inline h-3 w-3" /> {enrolled}</span>
                          {session.type === 'paid' && (
                            <>
                              <span className="text-slate-700">·</span>
                              <span className="text-[10px] font-bold text-emerald-400">${(enrolled * session.price * 0.9).toFixed(0)} net</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/sessions/${session.id}`}
                      className="shrink-0 flex items-center space-x-1 text-[10px] font-bold text-brand-indigo hover:text-white bg-brand-indigo/10 hover:bg-brand-indigo px-3 py-1.5 rounded-xl transition-all border border-brand-indigo/20"
                    >
                      <span>Manage</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* Payment History */}
          <div className="space-y-3 mt-2">
            <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-brand-emerald" />
              <span>Payment History</span>
            </h2>

            {txLoading ? (
              <div className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800 animate-pulse" />
            ) : transactions.length === 0 ? (
              <div className="py-8 text-center border border-slate-800 bg-slate-900/30 rounded-2xl">
                <p className="text-slate-500 text-xs">No transactions yet. Earnings will appear here once students enroll.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl text-xs">
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg ${tx.type === 'credit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {tx.type === 'credit' ? <TrendingUp className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
                      </div>
                      <div>
                        <p className="text-slate-300 font-medium">{tx.description || tx.type}</p>
                        <p className="text-slate-600">{new Date(tx.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.type === 'credit' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">

          {/* Tutor Profile Card */}
          <GlassCard className="space-y-4" hoverEffect={false}>
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 bg-gradient-to-br from-brand-violet to-brand-indigo rounded-2xl flex items-center justify-center text-xl font-extrabold text-white">
                {user?.email?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-extrabold text-slate-200 text-sm">{user?.email?.split('@')[0]}</p>
                <p className="text-[10px] text-slate-500">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/60">
              {tutorProfile && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Hourly Rate</span>
                    <span className="font-extrabold text-emerald-400">${tutorProfile.hourly_rate}/hr</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Rating</span>
                    <span className="flex items-center space-x-1 font-extrabold text-amber-400">
                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                      <span>{tutorProfile.rating || '5.0'}</span>
                    </span>
                  </div>
                  {tutorProfile.expertise?.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1.5">Expertise</span>
                      <div className="flex flex-wrap gap-1.5">
                        {tutorProfile.expertise.map((e: string, i: number) => (
                          <span key={i} className="text-[9px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300 font-semibold">{e}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <Link
                to="/profile"
                className="flex items-center justify-center space-x-2 w-full mt-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </Link>
            </div>
          </GlassCard>

          {/* Quick Actions */}
          <GlassCard className="space-y-3" hoverEffect={false}>
            <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'Create New Session', icon: PlusCircle,   to: '/sessions',  color: 'text-brand-violet' },
                { label: 'Chat with Students', icon: MessageCircle, to: '/chat',     color: 'text-brand-indigo' },
                { label: 'Browse Groups',      icon: Users,         to: '/groups',   color: 'text-brand-emerald' },
              ].map((action, i) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={i}
                    to={action.to}
                    className="flex items-center space-x-3 p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 rounded-xl transition-all text-slate-300 hover:text-white"
                  >
                    <Icon className={`h-4 w-4 ${action.color}`} />
                    <span className="text-xs font-semibold">{action.label}</span>
                    <ArrowUpRight className="h-3 w-3 ml-auto text-slate-600" />
                  </Link>
                );
              })}
            </div>
          </GlassCard>

          {/* Verification status */}
          {!tutorProfile?.is_verified && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2">
              <div className="flex items-center space-x-2 text-amber-300">
                <Clock className="h-4 w-4 animate-pulse" />
                <p className="text-xs font-bold">Verification Pending</p>
              </div>
              <p className="text-[10px] text-amber-400/70 leading-relaxed">An admin is reviewing your submitted credentials. You'll be notified once approved.</p>
            </div>
          )}
          {tutorProfile?.is_verified && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                <p className="text-xs font-bold">Fully Verified</p>
              </div>
              <p className="text-[10px] text-emerald-400/60 leading-relaxed">You're a verified tutor! You can host paid sessions and earn from students.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default TutorDashboardPage;
