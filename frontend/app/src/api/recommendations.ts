import { apiFetch } from './client';
import type { TutorProfile } from '../types';

export interface TutorRecommendation {
  tutor_id: string;
  score?: number;
  subjects?: string[];
  trend_score?: number;
  rating?: number;
}

export const recommendationsApi = {
  getTop: (limit = 10) =>
    apiFetch<TutorRecommendation[]>('/api/v1/recommendations/top', {
      method: 'GET',
      params: { limit },
    }),

  getTrending: () => 
    apiFetch<TutorProfile[]>('/api/v1/recommendations/trending', {
      method: 'GET',
    }),

  getBySubject: (subject: string) => 
    apiFetch<TutorProfile[]>(`/api/v1/recommendations/subject/${encodeURIComponent(subject)}`, {
      method: 'GET',
    }),

  search: (subjects?: string[], minRating?: number, isVerified?: boolean, page = 1, perPage = 20) => 
    apiFetch<TutorProfile[]>('/api/v1/recommendations/search', {
      method: 'GET',
      params: {
        subjects: subjects?.join(','),
        min_rating: minRating,
        is_verified: isVerified,
        page,
        per_page: perPage,
      },
    }),

  getPersonalized: (userId: string) => 
    apiFetch<TutorProfile[]>(`/api/v1/recommendations/user/${userId}`, {
      method: 'GET',
    }),

  getSimilar: (tutorId: string, limit = 5) => 
    apiFetch<TutorProfile[]>(`/api/v1/recommendations/tutor/${tutorId}/similar`, {
      method: 'GET',
      params: { limit },
    })
};
