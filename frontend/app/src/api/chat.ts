import { apiFetch } from './client';
import type { Message } from '../types';

export interface MessagesResponse {
  messages: Message[];
  has_more: boolean;
}

export const chatApi = {
  getMessages: (groupId: string, limit = 50, beforeId?: string) => 
    apiFetch<MessagesResponse>(`/api/v1/groups/${groupId}/messages`, {
      method: 'GET',
      params: { limit, before_id: beforeId },
    }),

  sendMessage: (groupId: string, content: string) => 
    apiFetch<Message>(`/api/v1/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (messageId: string) => 
    apiFetch<void>(`/api/v1/messages/${messageId}`, {
      method: 'DELETE',
    }),

  editMessage: (messageId: string, content: string) => 
    apiFetch<Message>(`/api/v1/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  getOnlineCount: (groupId: string) => 
    apiFetch<{ group_id: string; online_count: number }>(`/api/v1/groups/${groupId}/online`, {
      method: 'GET',
    }),

  markRead: (groupId: string) => 
    apiFetch<void>(`/api/v1/groups/${groupId}/read`, {
      method: 'POST',
    }),

  getUnreadCount: (groupId: string) => 
    apiFetch<{ group_id: string; unread_count: number }>(`/api/v1/groups/${groupId}/unread-count`, {
      method: 'GET',
    })
};
