/* eslint-disable */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionsApi } from '../api/sessions';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import type { Session } from '../types';
import GlassCard from '../components/GlassCard';
import GeomapMockup from '../components/GeomapMockup';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { Calendar, Search, Sparkles, PlusCircle, MapPin, Navigation } from 'lucide-react';
import Swal from 'sweetalert2';

export const SessionListPage: React.FC = () => {
  const { isTutor, tutorProfile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Creation Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'free' | 'paid'>('free');
  const [newPrice, setNewPrice] = useState(15);
  const [newSchedule, setNewSchedule] = useState('2026-06-15T15:00');
  const [selectedCoords, setSelectedCoords] = useState<[number, number]>([77.5946, 12.9716]);
  const [selectedLocationName, setSelectedLocationName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [locationError, setLocationError] = useState('');
  const [hostNameCache, setHostNameCache] = useState<Record<string, string>>({});
  
  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await sessionsApi.getAll();
      
      // Resolve tutor/host profiles dynamically from the backend using the cached user details
      const resolved = await Promise.all(
        data.map(async (session) => {
          if (hostNameCache[session.host_id]) {
            return { ...session, host_name: hostNameCache[session.host_id] };
          }
          try {
            const user = await authApi.getUserById(session.host_id);
            if (user) {
              const name = user.name || user.email.split('@')[0];
              const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
              setHostNameCache((prev) => ({ ...prev, [session.host_id]: capitalized }));
              return { ...session, host_name: capitalized };
            }
          } catch {
            // Ignore
          }
          return { ...session, host_name: 'Verified Tutor' };
        })
      );
      setSessions(resolved);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || newTitle.trim().length < 3 || !newDesc) return;

    // Validate schedule is in the future
    const scheduledAt = newSchedule ? new Date(newSchedule) : null;
    if (!scheduledAt || scheduledAt <= new Date()) {
      Swal.fire({
        title: 'Invalid Schedule',
        text: 'Session must be scheduled for a future date and time.',
        icon: 'error',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
      return;
    }
    
    // Validate location is selected
    if (!selectedLocationName || selectedCoords[0] === 77.5946 && selectedCoords[1] === 12.9716) {
      setLocationError('Location required');
      return;
    }
    
    try {
      const addressToUse = newAddress || selectedLocationName;
      await sessionsApi.create({
        title: newTitle,
        description: newDesc,
        type: newType,
        price: newType === 'paid' ? newPrice : 0,
        schedule: newSchedule ? new Date(newSchedule).toISOString() : new Date().toISOString(),
        location: {
          type: 'Point',
          coordinates: selectedCoords,
        },
        address: addressToUse,
      });
      
      Swal.fire({
        title: 'Session Scheduled',
        text: 'Your collaborative study session is now live!',
        icon: 'success',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#8b5cf6',
      });
      
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewAddress('');
      setSelectedCoords([77.5946, 12.9716]);
      setSelectedLocationName('');
      setLocationError('');
      fetchSessions();
    } catch (err: any) {
      Swal.fire('Creation Failed', err.detail || 'Could not schedule session.', 'error');
    }
  };

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.subject_tags && s.subject_tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))) ||
    (s.host_name && s.host_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="page-transition flex-1 max-w-7xl w-full mx-auto px-6 py-10 space-y-8">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Calendar className="h-7 w-7 text-brand-indigo" />
            <span>Interactive Sessions</span>
          </h1>
          <p className="text-sm text-slate-400 font-light font-sans">Locate, join, or schedule study sessions nearby.</p>
        </div>
        
        {isTutor && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Host a Session</span>
          </button>
        )}
      </div>

      {/* Geolocations mock map displaying pins of all scheduled sessions */}
      <GeomapMockup 
        interactive={false}
        pins={filteredSessions.map(s => ({
          coords: s.location?.coordinates || [77.5946, 12.9716],
          title: s.title,
          type: s.type
        }))}
      />

      {/* Filter and Search actions bar */}
      <div className="flex items-center space-x-4 bg-slate-900/60 border border-slate-850 p-3 rounded-2xl">
        <Search className="h-5 w-5 text-slate-500 ml-2" />
        <input 
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search workshops title, subjects, descriptions, or tutor names..."
          className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder-slate-500"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map(n => (
            <div key={n} className="h-52 bg-slate-900/50 border border-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredSessions.length === 0 ? (
            <div className="sm:col-span-2 md:col-span-3 py-16 text-center text-slate-500 bg-slate-900/10 border border-slate-850 rounded-3xl">
              No sessions match your search coordinates filters.
            </div>
          ) : (
            filteredSessions.map((session) => (
              <GlassCard key={session.id} className="space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full ${session.type === 'paid' ? 'bg-brand-rose/10 text-brand-rose border border-brand-rose/20' : 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20'}`}>
                      {session.type}
                    </span>
                    {session.type === 'paid' && <span className="text-sm font-bold text-slate-200">${session.price}</span>}
                  </div>
                  <h3 className="text-md font-bold text-slate-200 line-clamp-1">{session.title}</h3>
                  <p className="text-[10px] text-brand-indigo font-bold">By {session.host_name || 'Verified Tutor'}</p>
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{session.description}</p>
                  {session.address && (
                    <div className="flex items-center space-x-1 text-[10px] text-slate-500 mt-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                      <span className="truncate">{session.address}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-850 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-[10px] text-slate-500">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(session.schedule).toLocaleDateString()}</span>
                  </div>
                  
                  <Link 
                    to={`/sessions/${session.id}`}
                    className="text-xs font-bold text-brand-indigo hover:text-white transition-colors"
                  >
                    View Details →
                  </Link>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}

      {/* Host Session Creation Modal popup */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 animate-fadeIn">
          <div className="w-full max-w-lg">
            <GlassCard className="space-y-6" hoverEffect={false} glowEffect={true}>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brand-violet animate-pulse" />
                  <span>Host New Session</span>
                </h3>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-500 hover:text-white font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSession} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="title">Session Title</label>
                  <input 
                    type="text" 
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Advanced Algorithm Review"
                    minLength={3}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="desc">Description</label>
                  <textarea 
                    id="desc"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Provide details on subjects, schedule outline..."
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400" htmlFor="type">Billing Type</label>
                    <select 
                      id="type"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as 'free' | 'paid')}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                    >
                      <option value="free">Free Session</option>
                      {tutorProfile?.is_verified && <option value="paid">Paid Masterclass</option>}
                    </select>
                  </div>

                  {newType === 'paid' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-400" htmlFor="price">Price ($)</label>
                      <input 
                        type="number" 
                        id="price"
                        value={newPrice}
                        onChange={(e) => setNewPrice(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                        min={5}
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 flex items-center space-x-1.5">
                    <Navigation className="h-3.5 w-3.5 text-brand-indigo" />
                    <span>Session Location</span>
                  </label>
                  <p className="text-[10px] text-slate-500 mb-1">Type a city, area, or venue name to set the session location:</p>
                  <LocationAutocomplete
                    placeholder="e.g. Mumbai, Pune, IIT Bombay..."
                    onSelect={(location) => {
                      setSelectedCoords([location.longitude, location.latitude]);
                      setSelectedLocationName(location.name);
                      setLocationError('');
                    }}
                    error={locationError}
                  />
                </div>

                {selectedLocationName && (
                  <div className="flex items-center space-x-2 px-4 py-2 bg-brand-indigo/10 border border-brand-indigo/20 rounded-xl">
                    <MapPin className="h-4 w-4 text-brand-indigo shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 font-semibold truncate">{selectedLocationName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {selectedCoords[1].toFixed(4)}°N, {selectedCoords[0].toFixed(4)}°E
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="address">Venue Details (Optional)</label>
                  <input 
                    type="text" 
                    id="address"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="e.g. Science Library, Room 302"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400" htmlFor="schedule">Schedule Time</label>
                  <input 
                    type="datetime-local" 
                    id="schedule"
                    value={newSchedule}
                    onChange={(e) => setNewSchedule(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-brand-indigo rounded-xl text-xs text-slate-200 outline-none transition-all"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:opacity-95 text-white font-semibold py-3.5 rounded-xl shadow-lg transition-all mt-2"
                >
                  Schedule Session
                </button>
              </form>
            </GlassCard>
          </div>
        </div>
      )}

    </div>
  );
};
export default SessionListPage;
