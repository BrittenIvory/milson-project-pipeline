import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, Reply } from 'lucide-react';
import {
  apiErrorMessage,
  NOTIFICATIONS_CHANGED_EVENT,
  notesApi,
  notificationsApi,
  taskCommentsApi,
} from '../lib/api';
import { formatDateTime } from '../lib/format';
import { PROJECT_STAGES } from '../lib/constants';
import type { AppNotification } from '../types';

/** How often the unread badge refreshes. */
const POLL_MS = 60_000;

const STAGE_LABELS = new Map<string, string>(
  PROJECT_STAGES.map((stage) => [stage.value, stage.label]),
);

/** Bell icon with an unread badge and a dropdown of in-app notifications. */
export default function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replying, setReplying] = useState(false);
  const replyingRef = useRef(false);
  const [replyError, setReplyError] = useState<string | null>(null);

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
    // Other surfaces (the inbox page) signal mutations via this event.
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
    };
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

  const [replyMention, setReplyMention] = useState('');

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const startReply = (notification: AppNotification) => {
    setReplyingTo(notification.id);
    const mention = notification.commentAuthorName
      ? `@${notification.commentAuthorName} `
      : '';
    setReplyMention(mention);
    setReplyDraft(mention);
    setReplyError(null);
  };

  const sendReply = async (notification: AppNotification) => {
    if (!replyDraft.trim() || !notification.projectId || replyingRef.current) return;
    replyingRef.current = true;
    setReplying(true);
    setReplyError(null);
    try {
      if (notification.entityType === 'task' && notification.entityId) {
        await taskCommentsApi.create(
          notification.projectId,
          notification.entityId,
          replyDraft.trim(),
        );
      } else {
        await notesApi.create(
          notification.projectId,
          replyDraft.trim(),
          notification.entityType === 'note' ? (notification.entityId ?? undefined) : undefined,
        );
      }
      // The comment is persisted — close the composer before any secondary
      // work so a failed mark-read can't be mistaken for a failed post.
      setReplyingTo(null);
      setReplyDraft('');
      if (!notification.readAt) {
        await notificationsApi.markRead(notification.id).catch(() => undefined);
      }
      await load();
    } catch (err) {
      setReplyError(apiErrorMessage(err, 'Unable to post reply'));
    } finally {
      replyingRef.current = false;
      setReplying(false);
    }
  };

  const markAll = async () => {
    await notificationsApi.markAllRead();
    await load();
  };

  /** Only comment mentions get a Reply — task alerts have no comment to reply to. */
  const canReply = (notification: AppNotification) =>
    notification.projectId !== null &&
    (notification.type === 'note_mention' ||
      notification.type === 'comment_mention' ||
      notification.type === 'note_reply');

  /** Send requires text beyond the prefilled @mention, however its trailing
      whitespace is edited. */
  const replyMentionPattern = replyMention.trimEnd()
    ? new RegExp(`^${escapeRegExp(replyMention.trimEnd())}\\s*`)
    : null;
  const replyHasText = (
    replyMentionPattern
      ? replyDraft.replace(replyMentionPattern, '')
      : replyDraft
  )
    .trim().length > 0;

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
        <div className="absolute right-0 z-40 mt-2 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-brand-600 hover:underline">
                  Mark all read
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/notifications');
                }}
                className="text-xs text-brand-600 hover:underline"
              >
                View all
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">You are all caught up.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
              {items.map((notification) => (
                <li
                  key={notification.id}
                  className={clsx('px-4 py-3', !notification.readAt && 'bg-brand-50/40')}
                >
                  <div className="flex gap-3">
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
                      {canReply(notification) && replyingTo !== notification.id && (
                        <button
                          onClick={() => startReply(notification)}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800"
                        >
                          <Reply className="h-3 w-3" />
                          Reply
                        </button>
                      )}
                      {replyingTo === notification.id && (
                        <div className="mt-2">
                          <textarea
                            autoFocus
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (
                                e.key === 'Enter' &&
                                !e.shiftKey &&
                                !e.nativeEvent.isComposing
                              ) {
                                e.preventDefault();
                                if (!e.repeat && replyHasText) sendReply(notification);
                              }
                            }}
                            placeholder="Reply to this comment…"
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-brand-400 focus:outline-none"
                          />
                          {replyError && (
                            <p className="mt-1 text-xs text-rose-600">{replyError}</p>
                          )}
                          <div className="mt-1.5 flex justify-end gap-2">
                            <button
                              onClick={() => setReplyingTo(null)}
                              className="text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => sendReply(notification)}
                              disabled={replying || !replyHasText}
                              className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              {replying ? 'Sending…' : 'Send reply'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
