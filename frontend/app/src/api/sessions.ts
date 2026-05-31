import { apiFetch } from './client';
import type { Session } from '../types';

/** Normalize fields from backend (snake_case) to frontend types */
function normalizeSession(s: any): Session {
  return {
    ...s,
    type: s.session_type || s.type || 'free',
    schedule: s.scheduled_time || s.schedule || new Date().toISOString(),
    status: s.status || 'scheduled',
    max_participants: s.max_participants ?? 50,
    avg_rating: s.avg_rating ?? 0,
    total_ratings: s.total_ratings ?? 0,
    participants: s.participants ?? [],
  };
}

export interface LocationSuggestion {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius_km: number;
}

export const sessionsApi = {
  /** Search locations via OpenStreetMap Nominatim proxy */
  searchLocations: async (query: string): Promise<LocationSuggestion[]> => {
    const raw = await apiFetch<LocationSuggestion[]>('/api/v1/sessions/locations/search', {
      method: 'GET',
      params: { query },
    });
    return raw || [];
  },

  getNearby: async (lat: number, lon: number, radius = 100) => {
    const raw = await apiFetch<any[]>('/api/v1/sessions/nearby', {
      method: 'GET',
      params: { latitude: lat, longitude: lon, radius_km: radius },
    });
    return (raw || []).map(normalizeSession) as Session[];
  },

  getAll: async () => {
    const raw = await apiFetch<any[]>('/api/v1/sessions/', { method: 'GET' });
    return (raw || []).map(normalizeSession) as Session[];
  },

  getMy: async () => {
    const raw = await apiFetch<any[]>('/api/v1/sessions/my', { method: 'GET' });
    return (raw || []).map(normalizeSession) as Session[];
  },

  getById: async (sessionId: string) => {
    const raw = await apiFetch<any>(`/api/v1/sessions/${sessionId}`, { method: 'GET' });
    return normalizeSession(raw) as Session;
  },

  create: (sessionData: any) => {
    const backendData = {
      title: sessionData.title,
      description: sessionData.description || '',
      session_type: sessionData.type || 'free',
      price: Number(sessionData.price || 0),
      max_participants: Number(sessionData.max_participants || 50),
      scheduled_time: sessionData.schedule || new Date().toISOString(),
      location: {
        longitude: sessionData.location?.coordinates?.[0] ?? 77.5946,
        latitude: sessionData.location?.coordinates?.[1] ?? 12.9716,
      },
      address: sessionData.address || '',
      subject_tags: sessionData.subject_tags || [],
    };
    return apiFetch<Session>('/api/v1/sessions/', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
  },

  /** Update session status (scheduled→active→completed). Only host can call. */
  updateStatus: (sessionId: string, status: 'active' | 'completed') =>
    apiFetch<Session>(`/api/v1/sessions/${sessionId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  /** Join a free session */
  join: (sessionId: string) =>
    apiFetch<{ success: boolean; message: string }>(`/api/v1/sessions/${sessionId}/join`, {
      method: 'POST',
    }),

  /** Leave a session */
  leave: (sessionId: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/sessions/${sessionId}/leave`, {
      method: 'POST',
    }),

  /** Get participant list (host only) */
  getParticipants: (sessionId: string) =>
    apiFetch<string[]>(`/api/v1/sessions/${sessionId}/participants`, {
      method: 'GET',
    }),

  rate: (sessionId: string, rating: number, review = '') =>
    apiFetch<{ success: boolean }>(`/api/v1/sessions/${sessionId}/ratings`, {
      method: 'POST',
      body: JSON.stringify({ score: rating, comment: review }),
    }),
};