import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Archive, ArchiveRestore, Eye, Inbox, MailOpen, Reply } from 'lucide-react';
import NotificationPreviewPanel from '../components/NotificationPreviewPanel';
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

const STAGE_LABELS = new Map<string, string>(
  PROJECT_STAGES.map((stage) => [stage.value, stage.label]),
);

const PAGE_SIZE = 50;

const signalChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));

/** Full inbox of notifications with Activity and Archive tabs. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'activity' | 'archive'>('activity');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMention, setReplyMention] = useState('');
  const [replying, setReplying] = useState(false);
  const replyingRef = useRef(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AppNotification | null>(null);

  const load = useCallback(
    async (preserveCount = 0) => {
      try {
        // Keep any pages the user already loaded behind Load more.
        const limit = Math.max(preserveCount, PAGE_SIZE);
        const data = await notificationsApi.list(tab === 'archive', 0, limit);
        setItems(data.items);
        setHasMore(data.items.length === limit);
        setUnread(data.unread);
        setError(null);
      } catch (err) {
        setError(apiErrorMessage(err, 'Unable to load notifications'));
      }
    },
    [tab],
  );

  const itemsCountRef = useRef(0);
  itemsCountRef.current = items.length;

  useEffect(() => {
    void load();
  }, [load]);

  // A preview panel marks its notification read after a successful reply;
  // refresh the list so the badge/row state stays in sync — without
  // dropping pages the user already loaded.
  useEffect(() => {
    const reload = () => void load(itemsCountRef.current);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload);
  }, [load]);

  const loadMore = async () => {
    try {
      const data = await notificationsApi.list(tab === 'archive', items.length, PAGE_SIZE);
      setItems((current) => [...current, ...data.items]);
      setHasMore(data.items.length === PAGE_SIZE);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load more notifications'));
    }
  };

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await notificationsApi.markRead(notification.id).catch(() => undefined);
      signalChanged();
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
      signalChanged();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update notification'));
    }
  };

  const archiveAll = async () => {
    try {
      await notificationsApi.archiveAll();
      signalChanged();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to clear inbox'));
    }
  };

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => undefined);
    signalChanged();
    await load();
  };

  /** Same reply rules as the notification bell: comment/reply alerts only. */
  const canReply = (notification: AppNotification) =>
    notification.projectId !== null &&
    (notification.type === 'note_mention' ||
      notification.type === 'comment_mention' ||
      notification.type === 'note_reply');

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
      // Notify the bell and any open preview panel so they refresh.
      signalChanged();
      await load();
    } catch (err) {
      setReplyError(apiErrorMessage(err, 'Unable to post reply'));
    } finally {
      replyingRef.current = false;
      setReplying(false);
    }
  };

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
    <div className="mx-auto flex max-w-6xl gap-4 px-4 py-4">
      <div className="min-w-0 flex-1">
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
        <p className="py-8 text-center text-sm text-slate-500">
          {tab === 'archive' ? 'Nothing archived.' : 'You are all caught up.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={clsx('flex gap-3 py-2', !notification.readAt && 'bg-brand-50/40')}
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
                        {notification.internalPartNumber &&
                          ` · ${notification.internalPartNumber}`}
                        {notification.projectStage &&
                          ` · ${STAGE_LABELS.get(notification.projectStage) ?? notification.projectStage}`}
                      </p>
                    )}
                    {notification.repliedToPreview && (
                      <p className="mt-0.5 border-l-2 border-slate-200 pl-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">
                          {notification.repliedToAuthorName ?? 'Deleted comment'}
                        </span>
                        : {notification.repliedToPreview}
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
                  <div className="mt-1.5 flex items-center gap-3">
                    {canReply(notification) && replyingTo !== notification.id && (
                      <button
                        onClick={() => startReply(notification)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800"
                      >
                        <Reply className="h-3 w-3" />
                        Reply
                      </button>
                    )}
                    {notification.projectId && (
                      <button
                        onClick={() => setPreview(notification)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800"
                      >
                        <Eye className="h-3 w-3" />
                        Preview
                      </button>
                    )}
                  </div>
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
          {hasMore && (
            <div className="py-3 text-center">
              <button
                onClick={loadMore}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
      </div>
      {preview && (
        <div className="fixed inset-x-3 bottom-3 top-14 z-40 lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-6rem)] lg:w-96 lg:shrink-0">
          <NotificationPreviewPanel
            notification={preview}
            onClose={() => setPreview(null)}
          />
        </div>
      )}
    </div>
  );
}
