/* eslint-disable */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { sessionsApi } from '../api/sessions';
import { paymentsApi } from '../api/payments';
import { authApi } from '../api/auth';
import type { Session } from '../types';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import GeomapMockup from '../components/GeomapMockup';
import {
  Calendar, DollarSign, ArrowLeft, Star, MapPin, Users, Play,
  CheckCircle, Clock, AlertCircle, CreditCard, Zap,
  BarChart2, Wallet, TrendingUp
} from 'lucide-react';
import Swal from 'sweetalert2';

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'text-brand-indigo bg-brand-indigo/10 border-brand-indigo/20', icon: Clock },
  active:    { label: 'Live Now',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 animate-pulse', icon: Zap },
  completed: { label: 'Completed', color: 'text-slate-400 bg-slate-800/60 border-slate-700',          icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'text-red-400 bg-red-500/10 border-red-500/20',             icon: AlertCircle },
};

export const SessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchSessionDetails = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const data = await sessionsApi.getById(sessionId);

      // Resolve host display name
      try {
        const host = await authApi.getUserById(data.host_id);
        if (host) {
          const name = host.name || host.email.split('@')[0];
          data.host_name = name.charAt(0).toUpperCase() + name.slice(1);
        }
      } catch { /* silent */ }

      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchSessionDetails(); }, [fetchSessionDetails]);

  const isHost    = !!user && !!session && session.host_id === user.id;
  const isEnrolled = !!user && !!session && (session.participants ?? []).includes(user.id);
  const canRate   = !isHost && isEnrolled && session?.status === 'completed';
  const canJoin   = !isHost && !isEnrolled && session?.status === 'scheduled';

  /* ── Tutor: update session status ─────────────────────────────────────── */
  const handleStatusUpdate = async (newStatus: 'active' | 'completed') => {
    if (!session) return;
    const labels: Record<string, string> = { active: 'Start', completed: 'Mark as Completed' };
    const warnings: Record<string, string> = {
      active: 'This will notify all enrolled students that the session has started.',
      completed: 'Once marked completed, students will be able to leave reviews.',
    };
    const result = await Swal.fire({
      title: `${labels[newStatus]} Session?`,
      text: warnings[newStatus],
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: labels[newStatus],
      confirmButtonColor: newStatus === 'active' ? '#10b981' : '#8b5cf6',
      cancelButtonColor: '#27273a',
      background: '#12121e',
      color: '#f8fafc',
    });
    if (!result.isConfirmed) return;

    setUpdatingStatus(true);
    try {
      await sessionsApi.updateStatus(session.id, newStatus);
      setSession((prev) => (prev ? { ...prev, status: newStatus } : null));
      Swal.fire({
        title: newStatus === 'active' ? '🚀 Session Started!' : '✅ Session Completed!',
        text: newStatus === 'active'
          ? 'All enrolled students have been notified.'
          : 'Students can now leave their reviews.',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
    } catch (err: any) {
      Swal.fire('Error', err.detail || 'Could not update session status.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  /* ── Student: booking / joining flow ──────────────────────────────────── */
  const handleBookingWorkflow = async () => {
    if (!session) return;
    if (!user) {
      Swal.fire({
        title: 'Login Required',
        text: 'Please log in to book this session.',
        icon: 'warning',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
      return;
    }

    /* Free session */
    if (session.type === 'free') {
      try {
        await sessionsApi.join(session.id);
        await fetchSessionDetails();
        Swal.fire({ title: 'Joined!', text: 'You have joined this study session.', icon: 'success', background: '#12121e', color: '#f8fafc', confirmButtonColor: '#8b5cf6' });
      } catch (err: any) {
        Swal.fire('Failed', err.detail || 'Could not join session.', 'error');
      }
      return;
    }

    /* Paid session — multi-step checkout */
    const confirm1 = await Swal.fire({
      title: '💳 Confirm Booking',
      html: `
        <div class="text-sm text-slate-300 space-y-2 text-left">
          <p><strong class="text-white">${session.title}</strong></p>
          <div class="flex justify-between border-t border-slate-800 pt-2 mt-2">
            <span class="text-slate-400">Session price</span>
            <span class="font-bold text-white">$${session.price}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Platform fee (10%)</span>
            <span class="text-slate-400">$${(session.price * 0.1).toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-brand-emerald font-bold border-t border-slate-800 pt-2">
            <span>Total</span>
            <span>$${session.price}</span>
          </div>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Proceed to Payment',
      cancelButtonColor: '#27273a',
      confirmButtonColor: '#8b5cf6',
      background: '#12121e',
      color: '#f8fafc',
    });
    if (!confirm1.isConfirmed) return;

    /* Show loading while creating intent */
    Swal.fire({ title: 'Creating Invoice…', allowOutsideClick: false, didOpen: () => Swal.showLoading(), background: '#12121e', color: '#f8fafc' });

    let paymentIntent: any;
    try {
      paymentIntent = await paymentsApi.createIntent({
        user_id: user.id,
        tutor_id: session.host_id,
        session_id: session.id,
        amount: session.price,
        payment_method: 'card',
      });
    } catch (err: any) {
      Swal.fire('Invoice Failed', err.detail || 'Could not create payment intent.', 'error');
      return;
    }

    /* Capture card details */
    const cardResult = await Swal.fire({
      title: '🔒 Secure Checkout',
      html: `
        <div class="text-left space-y-3 text-xs font-sans">
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between text-slate-300">
            <span class="text-slate-500">Invoice ID:</span>
            <span class="font-bold">${String(paymentIntent.payment_id).substring(0, 12)}…</span>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between text-slate-300">
            <span class="text-slate-500">Amount due:</span>
            <span class="font-bold text-brand-emerald">$${paymentIntent.amount}</span>
          </div>
          <div class="space-y-1">
            <label class="text-slate-400 font-semibold block">Cardholder Name</label>
            <input type="text" id="card-name" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-violet-500 outline-none rounded-xl text-slate-200" placeholder="John Doe" />
          </div>
          <div class="space-y-1">
            <label class="text-slate-400 font-semibold block">Card Number</label>
            <input type="text" id="card-num" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-violet-500 outline-none rounded-xl text-slate-200" placeholder="•••• •••• •••• ••••" />
          </div>
          <p class="text-slate-600 text-[10px]">🔒 Payments are encrypted. This is a demo simulation.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: `Pay $${session.price}`,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#27273a',
      background: '#12121e',
      color: '#f8fafc',
      preConfirm: () => {
        const name = (document.getElementById('card-name') as HTMLInputElement)?.value;
        const num  = (document.getElementById('card-num') as HTMLInputElement)?.value;
        if (!name || !num) {
          Swal.showValidationMessage('Please fill in your card details');
          return false;
        }
        return { name, num };
      }
    });
    if (!cardResult.isConfirmed) return;

    /* Confirm payment */
    Swal.fire({ title: 'Processing Payment…', allowOutsideClick: false, didOpen: () => Swal.showLoading(), background: '#12121e', color: '#f8fafc' });
    try {
      await paymentsApi.confirm(paymentIntent.payment_id);
      // Session service auto-enrolls user via Kafka PAYMENT_SUCCESS event
      // Refresh session after short delay so participant list is updated
      setTimeout(() => fetchSessionDetails(), 1500);
      Swal.fire({
        title: '🎉 Payment Successful!',
        html: `
          <p class="text-slate-300">You're enrolled in <strong class="text-white">${session.title}</strong>!</p>
          <div class="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-400">
            You'll be notified when the tutor starts the session.
          </div>
        `,
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
    } catch (err: any) {
      Swal.fire('Payment Failed', err.detail || 'Could not confirm payment.', 'error');
    }
  };

  /* ── Rating submission ─────────────────────────────────────────────────── */
  const handleRateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setSubmittingRating(true);
    try {
      await sessionsApi.rate(sessionId, rating, comment);
      Swal.fire({ title: 'Review Submitted', text: 'Thank you for your feedback!', icon: 'success', background: '#12121e', color: '#f8fafc', confirmButtonColor: '#8b5cf6' });
      setComment('');
      fetchSessionDetails();
    } catch (err: any) {
      Swal.fire('Failed', err.detail || 'Could not submit review.', 'error');
    } finally {
      setSubmittingRating(false);
    }
  };

  /* ── Loading / Not Found ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-brand-indigo border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 max-w-xl mx-auto flex flex-col items-center justify-center p-8 text-center space-y-4">
        <p className="text-slate-400">Session not found or has been removed.</p>
        <Link to="/sessions" className="text-brand-indigo font-bold hover:underline">← Back to Explore</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.scheduled;
  const StatusIcon = statusCfg.icon;
  const participantCount = (session.participants ?? []).length;

  return (
    <div className="page-transition flex-1 max-w-5xl w-full mx-auto px-6 py-10 space-y-8">

      {/* Back nav */}
      <div className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" />
        <Link to="/sessions" className="text-xs font-bold font-sans">Back to list</Link>
      </div>

      <div className="grid md:grid-cols-3 gap-8">

        {/* ── Main Details Column ─────────────────────────────────────────── */}
        <div className="md:col-span-2 space-y-6">

          {/* Session info card */}
          <GlassCard className="space-y-6" hoverEffect={false}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Type badge */}
                <span className={`text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full border
                  ${session.type === 'paid'
                    ? 'bg-brand-rose/10 text-brand-rose border-brand-rose/20'
                    : 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20'}`}>
                  {session.type} Class
                </span>
                {/* Status badge */}
                <span className={`inline-flex items-center space-x-1.5 text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full border ${statusCfg.color}`}>
                  <StatusIcon className="h-3 w-3" />
                  <span>{statusCfg.label}</span>
                </span>
                {(session.avg_rating ?? 0) > 0 && (
                  <span className="flex items-center space-x-1 text-xs text-amber-400 font-bold">
                    <Star className="h-3.5 w-3.5 fill-amber-400" />
                    <span>{(session.avg_rating ?? 0).toFixed(1)}</span>
                    <span className="text-slate-500 font-normal">({session.total_ratings})</span>
                  </span>
                )}
                <span className="flex items-center space-x-1 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{new Date(session.schedule).toLocaleString()}</span>
                </span>
              </div>

              <h1 className="text-2xl md:text-3xl font-extrabold text-white">{session.title}</h1>
              <p className="text-sm text-slate-300 leading-relaxed font-light">{session.description}</p>

              {/* Tags */}
              {session.subject_tags && session.subject_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {session.subject_tags.map((tag, i) => (
                    <span key={i} className="text-[9px] bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Location */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Class Location</span>
              {session.address && (
                <div className="flex items-center space-x-3 bg-slate-950/60 border border-slate-900 px-4 py-3.5 rounded-xl text-xs text-slate-300">
                  <MapPin className="h-5 w-5 text-brand-indigo shrink-0" />
                  <div>
                    <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-widest">Venue / Classroom Address</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block">{session.address}</span>
                  </div>
                </div>
              )}
              <GeomapMockup
                centerCoordinates={session.location?.coordinates || [77.5946, 12.9716]}
                interactive={false}
                pins={[{ coords: session.location?.coordinates || [77.5946, 12.9716], title: session.title, type: session.type }]}
              />
            </div>
          </GlassCard>

          {/* ── TUTOR CONTROL PANEL (host only) ──────────────────────────── */}
          {isHost && (
            <GlassCard className="space-y-5" hoverEffect={false}>
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <BarChart2 className="h-4.5 w-4.5 text-brand-violet" />
                <span>Session Control Panel</span>
              </h3>

              {/* Enrollment stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                  <Users className="h-5 w-5 text-brand-indigo mx-auto" />
                  <p className="text-xl font-extrabold text-white">{participantCount}</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Enrolled</p>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                  <TrendingUp className="h-5 w-5 text-brand-emerald mx-auto" />
                  <p className="text-xl font-extrabold text-white">
                    ${session.type === 'paid' ? (participantCount * session.price * 0.9).toFixed(0) : '0'}
                  </p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Your Earnings (90%)</p>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center space-y-1">
                  <Star className="h-5 w-5 text-amber-400 mx-auto" />
                  <p className="text-xl font-extrabold text-white">
                    {(session.avg_rating ?? 0) > 0 ? (session.avg_rating ?? 0).toFixed(1) : '—'}
                  </p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Avg Rating</p>
                </div>
              </div>

              {/* Status action buttons */}
              <div className="space-y-2">
                {session.status === 'scheduled' && (
                  <button
                    onClick={() => handleStatusUpdate('active')}
                    disabled={updatingStatus}
                    className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    <Play className="h-4 w-4 fill-white" />
                    <span>{updatingStatus ? 'Starting…' : 'Start Session'}</span>
                  </button>
                )}
                {session.status === 'active' && (
                  <button
                    onClick={() => handleStatusUpdate('completed')}
                    disabled={updatingStatus}
                    className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>{updatingStatus ? 'Completing…' : 'Mark as Completed'}</span>
                  </button>
                )}
                {session.status === 'completed' && (
                  <div className="flex items-center justify-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-3 text-emerald-400 font-bold text-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span>Session Completed</span>
                  </div>
                )}
              </div>

              {/* Participant list */}
              {participantCount > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block">Enrolled Students</span>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {(session.participants ?? []).map((pid, i) => (
                      <div key={i} className="flex items-center space-x-2 px-3 py-2 bg-slate-950/40 rounded-lg text-xs text-slate-300">
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center text-white font-bold text-[9px]">
                          {i + 1}
                        </div>
                        <span className="font-mono text-slate-400 text-[10px] truncate">{pid.substring(0, 18)}…</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* ── Rating Form (enrolled students only, session completed) ─── */}
          {canRate && (
            <GlassCard className="space-y-4" hoverEffect={false}>
              <h3 className="text-md font-extrabold text-white flex items-center space-x-2">
                <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                <span>Leave a Review</span>
              </h3>
              <form onSubmit={handleRateSession} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="score">Rating</label>
                  <div className="flex items-center space-x-2">
                    {[5, 4, 3, 2, 1].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        className={`p-1.5 rounded-lg transition-all ${rating >= n ? 'text-amber-400' : 'text-slate-700'}`}
                      >
                        <Star className={`h-6 w-6 ${rating >= n ? 'fill-amber-400' : ''}`} />
                      </button>
                    ))}
                    <span className="text-xs text-slate-400 ml-2">{rating} star{rating !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="comment">Your Review</label>
                  <textarea
                    id="comment"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Share your learning experience…"
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none resize-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingRating}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {submittingRating ? 'Submitting…' : 'Submit Review'}
                </button>
              </form>
            </GlassCard>
          )}

          {/* Info message for enrolled users when session is not yet completed */}
          {!isHost && isEnrolled && session.status !== 'completed' && (
            <div className="bg-brand-indigo/10 border border-brand-indigo/20 rounded-2xl px-4 py-3 flex items-center space-x-3 text-sm text-brand-indigo">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                {session.status === 'scheduled'
                  ? 'You\'re enrolled! Reviews unlock after the tutor marks the session as completed.'
                  : 'Session is live! Reviews unlock after the tutor marks it completed.'}
              </span>
            </div>
          )}
        </div>

        {/* ── Sidebar Column ──────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Booking / Enrollment Card */}
          {!isHost && (
            <GlassCard className="space-y-5 text-center" hoverEffect={false} glowEffect={session.type === 'paid'}>
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Attendance</span>
                {session.type === 'paid' ? (
                  <div className="flex items-center justify-center space-x-1.5 text-brand-rose">
                    <DollarSign className="h-8 w-8" />
                    <span className="text-4xl font-extrabold tracking-tight">{session.price}</span>
                    <span className="text-xs text-slate-500 font-light mt-2">USD</span>
                  </div>
                ) : (
                  <span className="text-3xl font-extrabold text-brand-emerald tracking-tight block">FREE</span>
                )}
              </div>

              <div className="space-y-2 text-left text-xs text-slate-400 border-t border-b border-slate-800/60 py-3">
                <div className="flex justify-between">
                  <span>Tutor:</span>
                  <span className="font-bold text-slate-200">{session.host_name || 'Verified Tutor'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Slots:</span>
                  <span className="font-bold text-slate-200">
                    {session.max_participants - participantCount} / {session.max_participants} available
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={`font-bold capitalize ${statusCfg.color.split(' ')[0]}`}>{session.status}</span>
                </div>
                {session.type === 'paid' && (
                  <div className="flex justify-between text-brand-indigo/60">
                    <span>Platform fee:</span>
                    <span>${(session.price * 0.1).toFixed(2)} (10%)</span>
                  </div>
                )}
              </div>

              {isEnrolled ? (
                <div className="flex items-center justify-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-3 text-emerald-400 font-bold text-sm">
                  <CheckCircle className="h-4 w-4" />
                  <span>You're Enrolled</span>
                </div>
              ) : canJoin ? (
                <button
                  onClick={handleBookingWorkflow}
                  className={`w-full font-semibold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2
                    ${session.type === 'paid'
                      ? 'bg-gradient-to-r from-brand-indigo to-brand-violet text-white hover:opacity-95'
                      : 'bg-brand-emerald hover:opacity-90 text-slate-950 font-bold'}`}
                >
                  {session.type === 'paid'
                    ? <><CreditCard className="h-4 w-4" /><span>Proceed Checkout</span></>
                    : <><Zap className="h-4 w-4" /><span>Attend Session</span></>}
                </button>
              ) : (
                <div className="py-3 text-xs text-slate-500 text-center">
                  {session.status === 'completed' ? 'Session has ended.' : 'Session is not open for enrollment.'}
                </div>
              )}
            </GlassCard>
          )}

          {/* Tutor revenue preview (host only) */}
          {isHost && session.type === 'paid' && (
            <GlassCard className="space-y-3" hoverEffect={false}>
              <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest flex items-center space-x-2">
                <Wallet className="h-4 w-4 text-brand-emerald" />
                <span>Revenue Summary</span>
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Gross Revenue</span>
                  <span className="font-bold text-white">${(participantCount * session.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Platform Fee (10%)</span>
                  <span className="text-slate-500">-${(participantCount * session.price * 0.1).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800 pt-2">
                  <span>Your Net Payout</span>
                  <span>${(participantCount * session.price * 0.9).toFixed(2)}</span>
                </div>
              </div>
            </GlassCard>
          )}
        </div>

      </div>
    </div>
  );
};

export default SessionDetailPage;
