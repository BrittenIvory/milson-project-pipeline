import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Archive, ArchiveRestore, Inbox, MailOpen } from 'lucide-react';
import { apiErrorMessage, notificationsApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { PROJECT_STAGES } from '../lib/constants';
import type { AppNotification } from '../types';

const STAGE_LABELS = new Map<string, string>(
  PROJECT_STAGES.map((stage) => [stage.value, stage.label]),
);

/** Full inbox of notifications with Activity and Archive tabs. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'activity' | 'archive'>('activity');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list(tab === 'archive');
      setItems(data.items);
      setUnread(data.unread);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load notifications'));
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await notificationsApi.markRead(notification.id).catch(() => undefined);
    }
    if (notification.projectId) navigate(`/projects/${notification.projectId}`);
    else await load();
  };

  const toggleArchive = async (notification: AppNotification) => {
    try {
      if (tab === 'archive') {
        await notificationsApi.unarchive(notification.id);
      } else {
        if (!notification.readAt) {
          await notificationsApi.markRead(notification.id).catch(() => undefined);
        }
        await notificationsApi.archive(notification.id);
      }
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update notification'));
    }
  };

  const archiveAll = async () => {
    try {
      await notificationsApi.archiveAll();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to clear inbox'));
    }
  };

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => undefined);
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <Inbox className="h-5 w-5 text-brand-600" />
          Inbox
        </h1>
        {tab === 'activity' && items.length > 0 && (
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800"
              >
                <MailOpen className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              onClick={archiveAll}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive all
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {(['activity', 'archive'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'rounded-t-md px-3 py-2 text-sm font-medium',
              tab === key
                ? 'border-b-2 border-brand-600 text-brand-700'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {key === 'activity' ? 'Activity' : 'Archive'}
            {key === 'activity' && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          {tab === 'archive' ? 'Nothing archived.' : 'You are all caught up.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((notification) => (
            <li
              key={notification.id}
              className={clsx('flex gap-3 py-3', !notification.readAt && 'bg-brand-50/40')}
            >
              {notification.hasPartImage && notification.projectId && (
                <img
                  src={`/api/projects/${notification.projectId}/part-image`}
                  alt="Part"
                  className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => openNotification(notification)}
                  className="block w-full text-left hover:opacity-80"
                >
                  <p className="text-sm font-medium text-slate-800">{notification.title}</p>
                  {(notification.projectNumber || notification.projectName) && (
                    <p className="truncate text-xs font-medium text-brand-700">
                      {[notification.projectNumber, notification.projectName]
                        .filter(Boolean)
                        .join(' — ')}
                      {notification.projectStage &&
                        ` · ${STAGE_LABELS.get(notification.projectStage) ?? notification.projectStage}`}
                    </p>
                  )}
                  {notification.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {notification.body}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </button>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                {!notification.readAt && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />
                )}
                <button
                  onClick={() => toggleArchive(notification)}
                  title={tab === 'archive' ? 'Restore to inbox' : 'Archive'}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  {tab === 'archive' ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
