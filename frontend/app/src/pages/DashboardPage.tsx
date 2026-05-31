/* eslint-disable */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { recommendationsApi } from '../api/recommendations';
import { sessionsApi } from '../api/sessions';
import { groupsApi } from '../api/groups';
import type { TutorProfile, Session, Group } from '../types';
import { getBrowserCoordinates } from '../utils/geolocation';
import GlassCard from '../components/GlassCard';
import GeomapMockup from '../components/GeomapMockup';
import TutorDashboardPage from './TutorDashboardPage';
import {
  BookOpen, Calendar, MapPin, Star, Users, UserCheck, PlusCircle,
  Navigation, Loader2, AlertCircle, Clock, DollarSign, Zap, ChevronRight,
} from 'lucide-react';
import Swal from 'sweetalert2';

const NEARBY_RADIUS_KM = 10;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const DashboardPage: React.FC = () => {
  const { user, isAdmin, isTutor } = useAuth();

  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [nearbySessions, setNearbySessions] = useState<Session[]>([]);
  const [recommendedSessions, setRecommendedSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // Location state
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied' | 'unsupported'>('pending');

  // Fetch location once on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // Top tutors — fall back to empty silently
      let resolvedTutors: TutorProfile[] = [];
      try {
        const topTutorsRaw = await recommendationsApi.getTop(3);
        const tutorProfiles = await Promise.all(
          (topTutorsRaw || []).map(async (rec) => {
            try { return await authApi.getTutorProfile(rec.tutor_id); } catch { return null; }
          }),
        );
        resolvedTutors = tutorProfiles.filter((t): t is TutorProfile => t !== null);
      } catch { /* no rated sessions yet — keep empty */ }
      setTutors(resolvedTutors);

      // All scheduled sessions for sidebar recommendations
      const allScheduled = await sessionsApi.getAll();
      const upcomingSidebar = (allScheduled || [])
        .filter((s) => s.status === 'scheduled')
        .sort((a, b) => new Date(a.schedule).getTime() - new Date(b.schedule).getTime())
        .slice(0, 4);
      setRecommendedSessions(upcomingSidebar);

      // Nearby sessions — use 10 km if location available, else fall back to all
      let rawSessions: Session[] = [];
      if (userCoords) {
        rawSessions = await sessionsApi.getNearby(
          userCoords.latitude,
          userCoords.longitude,
          NEARBY_RADIUS_KM,
        );
      } else {
        rawSessions = await sessionsApi.getAll();
      }

      // Keep only upcoming (scheduled) sessions, sort by schedule asc
      const upcoming = (rawSessions || [])
        .filter((s) => s.status === 'scheduled')
        .sort((a, b) => new Date(a.schedule).getTime() - new Date(b.schedule).getTime());

      setNearbySessions(upcoming.slice(0, 6));

      // Study groups
      const allGroupsRaw = await groupsApi.getAll();
      setGroups(
        (allGroupsRaw || [])
          .map((g: any) => ({ ...g, privacy: g.is_private ? 'private' : 'public' }))
          .slice(0, 3),
      );
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userCoords]);

  // Re-fetch when location resolves
  useEffect(() => {
    if (locationStatus !== 'pending') {
      fetchDashboardData();
    }
  }, [locationStatus, fetchDashboardData]);

  const handleJoinFreeSession = async (sessionId: string) => {
    try {
      await sessionsApi.join(sessionId);
      Swal.fire({
        title: 'Joined!',
        text: 'You have joined this study session.',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
      fetchDashboardData();
    } catch (err: unknown) {
      const error = err as { detail?: string };
      Swal.fire({
        title: 'Error',
        text: error.detail || 'Failed to join session.',
        icon: 'error',
        background: '#12121e',
        color: '#f8fafc',
      });
    }
  };

  if (isAdmin) return null;
  if (isTutor) return <TutorDashboardPage />;

  const locationBadge = () => {
    if (locationStatus === 'pending')
      return (
        <span className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-semibold">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Detecting location…</span>
        </span>
      );
    if (locationStatus === 'granted' && userCoords)
      return (
        <span className="flex items-center space-x-1.5 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
          <Navigation className="h-3 w-3" />
          <span>Within {NEARBY_RADIUS_KM} km · {userCoords.latitude.toFixed(3)}°N {userCoords.longitude.toFixed(3)}°E</span>
        </span>
      );
    if (locationStatus === 'denied')
      return (
        <span className="flex items-center space-x-1.5 text-[10px] text-amber-400 font-semibold bg-amber-500/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
          <AlertCircle className="h-3 w-3" />
          <span>Location denied — showing all sessions</span>
        </span>
      );
    return (
      <span className="flex items-center space-x-1.5 text-[10px] text-slate-500 font-semibold">
        <AlertCircle className="h-3 w-3" />
        <span>Geolocation unavailable</span>
      </span>
    );
  };

  return (
    <div className="page-transition flex-1 max-w-7xl w-full mx-auto px-6 py-10 space-y-10">

      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-brand-indigo/20 via-brand-violet/20 to-transparent p-8 rounded-3xl border border-brand-indigo/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-brand-violet/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Welcome back,{' '}
            <span className="bg-gradient-to-r from-brand-indigo to-brand-violet bg-clip-text text-transparent">
              {user?.email?.split('@')[0]}
            </span>
          </h1>
          <p className="text-sm text-slate-400 font-light">
            Discover upcoming study sessions near you and connect with verified tutors.
          </p>
        </div>
        <Link
          to="/sessions"
          className="flex items-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg transition-all shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Schedule Session</span>
        </Link>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-40 bg-slate-900/60 rounded-2xl border border-slate-800" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">

          {/* ── Main Column ── */}
          <div className="md:col-span-2 space-y-6">

            {/* Section header with location badge */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-brand-rose" />
                <span>
                  {locationStatus === 'granted'
                    ? `Upcoming Sessions Near You`
                    : 'Upcoming Sessions'}
                </span>
              </h2>
              <div className="flex items-center space-x-3">
                {locationBadge()}
                <Link to="/sessions" className="text-xs text-brand-indigo hover:underline font-bold">
                  View All →
                </Link>
              </div>
            </div>

            {/* Map */}
            <GeomapMockup
              interactive={false}
              centerCoordinates={
                userCoords
                  ? [userCoords.longitude, userCoords.latitude]
                  : [77.5946, 12.9716]
              }
              pins={nearbySessions.map((s) => ({
                coords: s.location?.coordinates || [77.5946, 12.9716],
                title: s.title,
                type: s.type,
              }))}
            />

            {/* Session cards */}
            {nearbySessions.length === 0 ? (
              <div className="py-12 text-center border border-slate-800 bg-slate-900/30 rounded-2xl space-y-2">
                <MapPin className="h-8 w-8 text-slate-700 mx-auto" />
                <p className="text-slate-500 text-sm">
                  {locationStatus === 'granted'
                    ? `No upcoming sessions within ${NEARBY_RADIUS_KM} km of your location.`
                    : 'No upcoming sessions found.'}
                </p>
                <Link to="/sessions" className="inline-block text-xs font-bold text-brand-indigo hover:underline">
                  Browse all sessions →
                </Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {nearbySessions.map((session) => {
                  const distKm =
                    userCoords && session.location?.coordinates
                      ? haversineKm(
                          userCoords.latitude,
                          userCoords.longitude,
                          session.location.coordinates[1],
                          session.location.coordinates[0],
                        )
                      : null;

                  const scheduleDate = new Date(session.schedule);
                  const isToday =
                    scheduleDate.toDateString() === new Date().toDateString();
                  const isTomorrow =
                    scheduleDate.toDateString() ===
                    new Date(Date.now() + 86400000).toDateString();
                  const dateLabel = isToday
                    ? 'Today'
                    : isTomorrow
                    ? 'Tomorrow'
                    : scheduleDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                  return (
                    <GlassCard key={session.id} className="space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        {/* Type + distance badges */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full border ${
                              session.type === 'paid'
                                ? 'bg-brand-rose/10 text-brand-rose border-brand-rose/20'
                                : 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20'
                            }`}
                          >
                            {session.type === 'paid' ? (
                              <span className="flex items-center space-x-1">
                                <DollarSign className="h-2.5 w-2.5" />
                                <span>Paid · ${session.price}</span>
                              </span>
                            ) : (
                              <span className="flex items-center space-x-1">
                                <Zap className="h-2.5 w-2.5" />
                                <span>Free</span>
                              </span>
                            )}
                          </span>
                          {distKm !== null && (
                            <span className="flex items-center space-x-1 text-[9px] font-bold text-brand-indigo bg-brand-indigo/10 border border-brand-indigo/20 px-2 py-0.5 rounded-full">
                              <Navigation className="h-2.5 w-2.5" />
                              <span>{distKm < 1 ? `${(distKm * 1000).toFixed(0)}m` : `${distKm.toFixed(1)} km`}</span>
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm font-bold text-slate-200 line-clamp-1">{session.title}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{session.description}</p>

                        {/* Subject tags */}
                        {session.subject_tags && session.subject_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {session.subject_tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="text-[8px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="flex items-center space-x-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span className={isToday ? 'text-emerald-400 font-bold' : ''}>
                            {dateLabel} · {scheduleDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                        {session.type === 'free' ? (
                          <button
                            onClick={() => handleJoinFreeSession(session.id)}
                            className="flex items-center space-x-1 text-brand-emerald hover:text-white font-bold transition-colors"
                          >
                            <span>Join</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <Link
                            to={`/sessions/${session.id}`}
                            className="flex items-center space-x-1 text-brand-rose hover:text-white font-bold transition-colors"
                          >
                            <span>Book</span>
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-6">

            {/* Recommended Tutors or Upcoming Sessions */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Star className="h-5 w-5 text-brand-violet" />
                <span>{tutors.length > 0 ? 'Top Tutors' : 'Recommended Sessions'}</span>
              </h2>
              <Link to={tutors.length > 0 ? '/profile' : '/sessions'} className="text-xs text-brand-indigo hover:underline font-bold">
                {tutors.length > 0 ? 'Apply →' : 'View All →'}
              </Link>
            </div>

            <div className="space-y-3">
              {tutors.length > 0 ? (
                tutors.map((tutor) => (
                  <GlassCard key={tutor?.id} className="p-4 flex items-start space-x-3">
                    <div className="bg-brand-violet/10 p-2 rounded-xl text-brand-violet shrink-0">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-200 truncate">
                          {tutor?.user?.email?.split('@')[0] || 'Verified Tutor'}
                        </h4>
                        <span className="text-[10px] font-bold text-brand-emerald shrink-0 ml-1">
                          ${tutor?.hourly_rate}/hr
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                        {tutor?.bio || 'Expert tutor ready to guide your learning journey.'}
                      </p>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="flex items-center space-x-1 text-[10px]">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-slate-400">{tutor?.rating || '5.0'}</span>
                        </span>
                        {tutor?.expertise?.[0] && (
                          <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-semibold truncate max-w-24">
                            {tutor.expertise[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                ))
              ) : recommendedSessions.length === 0 ? (
                <div className="p-6 text-center text-slate-500 bg-slate-900/30 border border-slate-800 rounded-2xl text-xs">
                  No upcoming sessions yet.
                </div>
              ) : (
                recommendedSessions.map((session) => (
                  <Link key={session.id} to={`/sessions/${session.id}`}>
                    <GlassCard className="p-3.5 space-y-1.5 hover:border-brand-indigo/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          session.type === 'paid'
                            ? 'bg-brand-rose/10 text-brand-rose border-brand-rose/20'
                            : 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20'
                        }`}>
                          {session.type === 'paid' ? `$${session.price}` : 'Free'}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {new Date(session.schedule).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{session.title}</h4>
                      <div className="flex items-center space-x-1 text-[10px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(session.schedule).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        {session.address && (
                          <><MapPin className="h-3 w-3 ml-1" /><span className="truncate max-w-24">{session.address}</span></>
                        )}
                      </div>
                    </GlassCard>
                  </Link>
                ))
              )}
            </div>

            {/* Study Groups */}
            <div className="space-y-3 pt-2">
              <h3 className="text-md font-extrabold text-white flex items-center space-x-2">
                <Users className="h-4 w-4 text-brand-indigo" />
                <span>Study Circles</span>
              </h3>
              {groups.length === 0 ? (
                <div className="p-6 text-center text-slate-500 bg-slate-900/30 border border-slate-800 rounded-2xl text-xs">
                  No groups yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <Link
                      key={group.id}
                      to={`/groups/${group.id}`}
                      className="flex items-center justify-between p-3.5 bg-slate-900/40 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all"
                    >
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{group.name}</h4>
                        <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{group.description}</p>
                      </div>
                      <BookOpen className="h-3.5 w-3.5 text-slate-600 shrink-0 ml-2" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
