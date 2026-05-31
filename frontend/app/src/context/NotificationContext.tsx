/* eslint-disable */
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Notification } from '../types';
import { notificationsApi } from '../api/notifications';
import { useAuth } from './AuthContext';
import Swal from 'sweetalert2';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();

  const refreshNotifications = async () => {
    if (!isAuthenticated || isAdmin) return;
    try {
      const data = await notificationsApi.getAll();
      setNotifications(data);
      
      const countRes = await notificationsApi.getUnreadCount();
      
      // Trigger dynamic sweetalert toasts if there are new unread notifications
      if (countRes.count > unreadCount) {
        const diff = countRes.count - unreadCount;
        Swal.fire({
          toast: true,
          position: 'bottom-end',
          icon: 'info',
          title: `You have ${diff} new notification${diff > 1 ? 's' : ''}`,
          showConfirmButton: false,
          timer: 3000,
          background: '#12121e',
          color: '#f8fafc',
        });
      }
      setUnreadCount(countRes.count);
    } catch {
      // Quietly ignore network failures in notifications polling
    }
  };

  useEffect(() => {
    if (isAuthenticated && !isAdmin && !authLoading) {
      setNotifLoading(true);
      refreshNotifications().finally(() => setNotifLoading(false));

      // Poll every 10 seconds for real-time reactive updates
      const interval = setInterval(refreshNotifications, 10000);
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, isAdmin, authLoading]);

  const markAsRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      // Ignore
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'All notifications marked as read',
        showConfirmButton: false,
        timer: 1500,
        background: '#12121e',
        color: '#f8fafc',
      });
    } catch (err: any) {
      // Ignore
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading: notifLoading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
