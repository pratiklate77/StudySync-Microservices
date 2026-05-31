import type { User } from '../types';
import { authApi } from '../api/auth';

export function formatDisplayName(
  user: Pick<User, 'name' | 'email'> | null | undefined,
  fallback = 'User',
): string {
  if (!user) return fallback;
  const name = user.name?.trim();
  if (name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  const local = user.email?.split('@')[0];
  if (local) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return fallback;
}

export async function resolveUserDisplayName(
  userId: string,
  emailHint?: string,
): Promise<string> {
  const profile = await authApi.getUserById(userId);
  if (profile) {
    return formatDisplayName(profile);
  }
  if (emailHint) {
    const local = emailHint.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return `User ${userId.slice(0, 8)}`;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatAuditAction(action: string, targetType?: string | null): string {
  const label = action.replace(/_/g, ' ').toLowerCase();
  if (targetType) {
    return `${label} (${targetType})`;
  }
  return label;
}
