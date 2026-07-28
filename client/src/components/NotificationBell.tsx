import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell } from 'lucide-react';
import { notificationsApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { AppNotification } from '../types';

/** How often the unread badge refreshes. */
const POLL_MS = 60_000;

/** Bell icon with an unread badge and a dropdown of in-app notifications. */
export default function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // Notifications are non-critical; stay silent on failure.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openNotification = async (notification: AppNotification) => {
    setOpen(false);
    if (!notification.readAt) {
      await notificationsApi.markRead(notification.id);
      await load();
    }
    if (notification.projectId) navigate(`/projects/${notification.projectId}`);
  };

  const markAll = async () => {
    await notificationsApi.markAllRead();
    await load();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">You are all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    onClick={() => openNotification(notification)}
                    className={clsx(
                      'block w-full px-4 py-3 text-left hover:bg-slate-50',
                      !notification.readAt && 'bg-brand-50/40',
                    )}
                  >
                    <p className="text-sm font-medium text-slate-800">{notification.title}</p>
                    {notification.body && (
                      <p className="truncate text-xs text-slate-500">{notification.body}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDateTime(notification.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
