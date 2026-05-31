import { apiFetch } from './client';
import type { Group, GroupMember } from '../types';

export const groupsApi = {
  getAll: () => 
    apiFetch<Group[]>('/api/v1/groups/', {
      method: 'GET',
    }),

  getById: (groupId: string) => 
    apiFetch<Group>(`/api/v1/groups/${groupId}`, {
      method: 'GET',
    }),

  create: (name: string, description: string, privacy: 'public' | 'private' = 'public') => 
    apiFetch<Group>('/api/v1/groups/', {
      method: 'POST',
      body: JSON.stringify({ name, description, privacy }),
    }),

  join: (groupId: string) => 
    apiFetch<{ success: boolean; message: string }>(`/api/v1/groups/${groupId}/join`, {
      method: 'POST',
    }),

  getMembers: (groupId: string) => 
    apiFetch<GroupMember[]>(`/api/v1/groups/${groupId}/members`, {
      method: 'GET',
    })
};
