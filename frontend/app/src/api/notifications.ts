import { apiFetch } from './client';
import type { Notification } from '../types';

export const notificationsApi = {
  getAll: () => 
    apiFetch<Notification[]>('/api/v1/notifications/', {
      method: 'GET',
    }),

  getUnreadCount: () => 
    apiFetch<{ count: number }>('/api/v1/notifications/unread-count', {
      method: 'GET',
    }),

  markAsRead: (notificationId: string) => 
    apiFetch<{ success: boolean }>(`/api/v1/notifications/${notificationId}/read`, {
      method: 'POST',
    }),

  markAllAsRead: () => 
    apiFetch<{ success: boolean }>('/api/v1/notifications/read-all', {
      method: 'POST',
    })
};
