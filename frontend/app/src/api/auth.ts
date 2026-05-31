import { apiFetch } from './client';
import type { User, TutorProfile } from '../types';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export const authApi = {
  login: (email: string, password: string) => 
    apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) => 
    apiFetch<User>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getProfile: () => 
    apiFetch<User>('/api/v1/auth/profile', {
      method: 'GET',
    }),

  becomeTutor: (bio: string, expertise: string[], hourly_rate: number) =>
    apiFetch<TutorProfile>('/api/v1/tutors/become', {
      method: 'POST',
      body: JSON.stringify({ bio, expertise, hourly_rate }),
    }),

  applyTutor: (formData: FormData) => 
    apiFetch<{ success: boolean; message: string; verification_status: string }>('/api/v1/tutors/apply', {
      method: 'POST',
      body: formData, // Multi-part file uploads containing identity_proof and highest_degree
    }),
    
  getTutorProfile: (userId: string) =>
    apiFetch<TutorProfile>(`/api/v1/tutors/by-user/${userId}`, {
      method: 'GET',
    }),

  getUserById: (userId: string) =>
    apiFetch<User>(`/api/v1/auth/users/${userId}`, {
      method: 'GET',
    }).catch(() => null as unknown as User),
};
