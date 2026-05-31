/* eslint-disable */
import React, { useState, useCallback } from 'react';
import { MapPin, Navigation, Map, Loader2, Crosshair, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sessionsApi, type LocationSuggestion } from '../api/sessions';
import type { Session } from '../types';
import { getBrowserCoordinates } from '../utils/geolocation';
import GlassCard from '../components/GlassCard';
import GeomapMockup from '../components/GeomapMockup';
import LocationAutocomplete from '../components/LocationAutocomplete';
import DistanceSelector, { DISTANCE_OPTIONS } from '../components/DistanceSelector';
import Swal from 'sweetalert2';

type LocationMode = 'current' | 'custom';

export const NearbySessionsPage: React.FC = () => {
  const { user } = useAuth();

  // Location mode
  const [locationMode, setLocationMode] = useState<LocationMode>('current');

  // Current location
  const [browserCoords, setBrowserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(false);

  // Custom location
  const [customLocation, setCustomLocation] = useState<LocationSuggestion | null>(null);
  const [locationInputError, setLocationInputError] = useState('');

  // Distance
  const [radiusKm, setRadiusKm] = useState(10);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Detect browser location on mount
  const detectLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(false);
    try {
      const coords = await getBrowserCoordinates();
      if (coords) {
        setBrowserCoords(coords);
        setLocationMode('current');
      } else {
        setLocationError(true);
        Swal.fire({
          title: 'Location Unavailable',
          text: 'Unable to detect your current location. Please use the custom location option.',
          icon: 'warning',
          background: '#12121e',
          color: '#f8fafc',
          confirmButtonColor: '#8b5cf6',
        });
      }
    } catch {
      setLocationError(true);
    } finally {
      setLocationLoading(false);
    }
  }, []);

  // Trigger on mount
  React.useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  const handleSearch = useCallback(async () => {
    let lat: number;
    let lon: number;

    if (locationMode === 'current') {
      if (!browserCoords) {
        Swal.fire({
          title: 'Location Required',
          text: 'Please enable location access or switch to custom location.',
          icon: 'warning',
          background: '#12121e',
          color: '#f8fafc',
          confirmButtonColor: '#8b5cf6',
        });
        return;
      }
      lat = browserCoords.latitude;
      lon = browserCoords.longitude;
    } else {
      if (!customLocation) {
        setLocationInputError('Please select a location from the suggestions.');
        return;
      }
      lat = customLocation.latitude;
      lon = customLocation.longitude;
    }

    setSearchLoading(true);
    setSearchError('');
    setSearched(false);

    try {
      const results = await sessionsApi.getNearby(lat, lon, radiusKm);
      setSessions(results);
      setSearched(true);
    } catch (err: any) {
      setSearchError(err.detail || 'Failed to fetch nearby sessions.');
      setSessions([]);
    } finally {
      setSearchLoading(false);
    }
  }, [locationMode, browserCoords, customLocation, radiusKm]);

  const switchToCustom = useCallback(() => {
    setLocationMode('custom');
    setLocationInputError('');
  }, []);

  const switchToCurrent = useCallback(async () => {
    setLocationLoading(true);
    try {
      const coords = await getBrowserCoordinates();
      if (coords) {
        setBrowserCoords(coords);
        setLocationMode('current');
      } else {
        Swal.fire({
          title: 'Location Unavailable',
          text: 'Could not get your current location.',
          icon: 'error',
          background: '#12121e',
          color: '#f8fafc',
          confirmButtonColor: '#ef4444',
        });
      }
    } catch {
      Swal.fire({
        title: 'Error',
        text: 'Failed to detect location.',
        icon: 'error',
        background: '#12121e',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const handleCustomLocationSelect = useCallback(
    (location: LocationSuggestion) => {
      setCustomLocation(location);
      setLocationInputError('');
      setLocationMode('custom');
    },
    [],
  );

  const getSearchCoords = (): [number, number] | null => {
    if (locationMode === 'current' && browserCoords) {
      return [browserCoords.longitude, browserCoords.latitude];
    }
    if (locationMode === 'custom' && customLocation) {
      return [customLocation.longitude, customLocation.latitude];
    }
    return null;
  };

  const searchCoords = getSearchCoords();

  return (
    <div className="page-transition flex-1 max-w-7xl w-full mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Map className="h-7 w-7 text-brand-rose" />
          <span>Find Nearby Sessions</span>
        </h1>
        <p className="text-sm text-slate-400 font-light">
          Discover study sessions happening near you. Choose a location and distance to search.
        </p>
      </div>

      {/* Search Panel */}
      <GlassCard className="space-y-5" hoverEffect={false}>
        {/* Mode toggle */}
        <div className="flex items-center space-x-2 bg-slate-900/60 rounded-xl p-1 w-fit">
          <button
            onClick={switchToCurrent}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              locationMode === 'current'
                ? 'bg-brand-indigo text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span>Use Current Location</span>
          </button>
          <button
            onClick={switchToCustom}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              locationMode === 'custom'
                ? 'bg-brand-indigo text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Use Custom Location</span>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Location */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 flex items-center space-x-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span>Location</span>
            </label>

            {locationMode === 'current' ? (
              <div className="space-y-2">
                {locationLoading ? (
                  <div className="flex items-center space-x-2 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                    <span className="text-xs text-slate-400">Detecting your location...</span>
                  </div>
                ) : browserCoords ? (
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border border-brand-emerald/30 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <Crosshair className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs text-emerald-400 font-semibold">
                        {browserCoords.latitude.toFixed(4)}°N, {browserCoords.longitude.toFixed(4)}°E
                      </span>
                    </div>
                    <button
                      onClick={switchToCurrent}
                      className="text-[9px] text-slate-500 hover:text-white font-semibold"
                    >
                      Refresh
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-3 bg-slate-950 border border-red-500/30 rounded-xl">
                    <p className="text-xs text-red-400">Location unavailable. Switch to custom location.</p>
                  </div>
                )}
              </div>
            ) : (
              <LocationAutocomplete
                placeholder="Search for a city, area, or landmark..."
                onSelect={handleCustomLocationSelect}
                error={locationInputError}
              />
            )}
          </div>

          {/* Distance selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 flex items-center space-x-1.5">
              <Navigation className="h-3.5 w-3.5" />
              <span>Search Radius</span>
            </label>
            <DistanceSelector value={radiusKm} onChange={setRadiusKm} />
          </div>
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={searchLoading}
          className="w-full bg-gradient-to-r from-brand-rose to-brand-violet hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
        >
          {searchLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Searching...</span>
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" />
              <span>Find Nearby Sessions</span>
            </>
          )}
        </button>
      </GlassCard>

      {/* Map visual */}
      {searchCoords && sessions.length > 0 && (
        <GeomapMockup
          interactive={false}
          centerCoordinates={searchCoords}
          pins={sessions.map((s) => ({
            coords: s.location?.coordinates || searchCoords,
            title: s.title,
            type: s.type,
          }))}
        />
      )}

      {/* Results */}
      {searchLoading ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-40 bg-slate-900/60 border border-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : searched ? (
        sessions.length === 0 ? (
          <div className="py-16 text-center border border-slate-800 bg-slate-900/30 rounded-2xl space-y-3">
            <MapPin className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="text-slate-400 font-semibold">No nearby sessions found</p>
            <p className="text-xs text-slate-500">
              Try increasing the search radius or using a different location.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-brand-rose" />
                <span>
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''} found
                </span>
              </h2>
              <span className="text-[10px] text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                Within {radiusKm} km
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {sessions.map((session) => {
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
                  : scheduleDate.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    });

                return (
                  <GlassCard key={session.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full border ${
                          session.type === 'paid'
                            ? 'bg-brand-rose/10 text-brand-rose border-brand-rose/20'
                            : 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20'
                        }`}
                      >
                        {session.type === 'paid'
                          ? `Paid · $${session.price}`
                          : 'Free'}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {dateLabel}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-200 line-clamp-1">
                      {session.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {session.description}
                    </p>

                    {session.address && (
                      <div className="flex items-center space-x-1 text-[10px] text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{session.address}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">
                        {scheduleDate.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <a
                        href={`/sessions/${session.id}`}
                        className="font-bold text-brand-indigo hover:text-white transition-colors"
                      >
                        View Details →
                      </a>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        )
      ) : null}

      {/* Error state */}
      {searchError && (
        <div className="py-8 text-center border border-red-500/20 bg-red-500/5 rounded-2xl">
          <p className="text-sm text-red-400">{searchError}</p>
        </div>
      )}
    </div>
  );
};

export default NearbySessionsPage;