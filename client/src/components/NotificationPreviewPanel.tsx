import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Reply, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, ErrorBanner, SkeletonRows, TextArea } from './ui';
import NoteReactions from './NoteReactions';
import {
  apiErrorMessage,
  NOTIFICATIONS_CHANGED_EVENT,
  notesApi,
  notificationsApi,
  projectsApi,
  taskCommentsApi,
  tasksApi,
  usersApi,
} from '../lib/api';
import { formatDateTime, orDash } from '../lib/format';
import { PROJECT_STAGES } from '../lib/constants';
import type {
  AppNotification,
  Project,
  ProjectNote,
  ProjectTaskComment,
  User,
} from '../types';

const STAGE_LABELS = new Map<string, string>(
  PROJECT_STAGES.map((stage) => [stage.value, stage.label]),
);

interface NotificationPreviewPanelProps {
  notification: AppNotification;
  onClose: () => void;
}

function PreviewDetail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}

/**
 * Side panel behind an inbox notification's Preview button: part image, part
 * details, the full comment thread, and a comment box — all without leaving
 * the inbox.
 */
export default function NotificationPreviewPanel({
  notification,
  onClose,
}: NotificationPreviewPanelProps) {
  const projectId = notification.projectId!;
  const taskId = notification.entityType === 'task' ? notification.entityId : notification.entityType === 'task_comment' ? notification.taskCommentTaskId : null;
  const [project, setProject] = useState<Project | null>(null);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [taskComments, setTaskComments] = useState<ProjectTaskComment[]>([]);
  const [taskName, setTaskName] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [replyTo, setReplyTo] = useState<ProjectNote | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [earlierRepliesOpen, setEarlierRepliesOpen] = useState<Set<number>>(new Set());
  const notesListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProject(null);
    setNotes([]);
    setTaskComments([]);
    setTaskName(null);
    setReplyTo(null);
    setDraft('');
    projectsApi
      .get(projectId)
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Unable to load project'));
      });
    const loadComments = () => {
      const scrollToEnd = () =>
        requestAnimationFrame(() => {
          const el = notesListRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      if (taskId) {
        // Task alerts discuss the task's own comment list, not project notes.
        taskCommentsApi
          .list(projectId, taskId)
          .then((data) => {
            if (cancelled) return;
            setTaskComments(data);
            scrollToEnd();
          })
          .catch((err) => {
            if (!cancelled) setError(apiErrorMessage(err, 'Unable to load comments'));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
        tasksApi
          .list(projectId)
          .then((data) => {
            if (cancelled) return;
            setTaskName(data.find((task) => task.id === taskId)?.taskName ?? null);
          })
          .catch(() => undefined);
      } else {
        notesApi
          .list(projectId)
          .then((noteData) => {
            if (cancelled) return;
            setNotes(noteData);
            scrollToEnd();
          })
          .catch((err) => {
            if (!cancelled) setError(apiErrorMessage(err, 'Unable to load comments'));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      }
    };
    loadComments();
    // Refresh when another composer (e.g. the inbox reply box) posts.
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, loadComments);
    usersApi
      .list()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, loadComments);
    };
  }, [projectId, taskId]);

  const handleDraftChange = (value: string) => {
    setDraft(value);
    const match = /@([\w.-]*)$/.exec(value);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const handleReplyDraftChange = (value: string) => {
    setReplyDraft(value);
    const match = /@([\w.-]*)$/.exec(value);
    setReplyMentionQuery(match ? match[1].toLowerCase() : null);
  };

  /** A reply posted through the preview resolves the alert it came from. */
  const markNotificationHandled = async () => {
    if (!notification.readAt) {
      await notificationsApi.markRead(notification.id).catch(() => undefined);
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  };

  const addComment = async () => {
    if (!draft.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (taskId) {
        const comment = await taskCommentsApi.create(
          projectId,
          taskId,
          draft.trim(),
          notification.entityType === 'task_comment' ? notification.entityId ?? undefined : undefined,
        );
        setTaskComments((current) => [...current, comment]);
      } else {
        const note = await notesApi.create(projectId, draft.trim());
        setNotes((current) => [...current, note]);
      }
      setDraft('');
      setMentionQuery(null);
      setError(null);
      requestAnimationFrame(() => {
        const el = notesListRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      await markNotificationHandled();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add comment'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const addReply = async () => {
    if (!replyTo || !replyDraft.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const created = await notesApi.create(projectId, replyDraft.trim(), replyTo.id);
      setNotes((current) => [...current, created]);
      setReplyTo(null);
      setReplyDraft('');
      setReplyMentionQuery(null);
      setError(null);
      requestAnimationFrame(() => {
        document
          .getElementById(`np-note-${created.id}`)
          ?.scrollIntoView({ block: 'nearest' });
      });
      await markNotificationHandled();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add reply'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const suggestions =
    mentionQuery === null
      ? []
      : users.filter((u) => u.fullName.toLowerCase().includes(mentionQuery)).slice(0, 5);
  const replySuggestions =
    replyMentionQuery === null
      ? []
      : users
          .filter((u) => u.fullName.toLowerCase().includes(replyMentionQuery))
          .slice(0, 5);

  // Threading model shared with the Comments tab / project-list popover.
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const rootIdOf = (note: ProjectNote): number => {
    let root = note;
    const seen = new Set<number>();
    while (root.replyToId !== null && !seen.has(root.id)) {
      seen.add(root.id);
      const parent = noteById.get(root.replyToId);
      if (!parent) break;
      root = parent;
    }
    return root.id;
  };
  const repliesByRoot = new Map<number, ProjectNote[]>();
  const topLevel: ProjectNote[] = [];
  for (const note of notes) {
    if (note.replyToId === null || rootIdOf(note) === note.id) {
      topLevel.push(note);
    } else {
      const list = repliesByRoot.get(rootIdOf(note)) ?? [];
      list.push(note);
      repliesByRoot.set(rootIdOf(note), list);
    }
  }

  const toggleEarlierReplies = (noteId: number) =>
    setEarlierRepliesOpen((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });

  const startReply = (target: ProjectNote) => {
    setReplyTo(target);
    setReplyDraft('');
    setReplyMentionQuery(null);
  };

  const renderNoteCard = (note: ProjectNote, isReply: boolean) => (
    <div className={`rounded-lg p-2 ${isReply ? 'border border-slate-200 bg-slate-50' : 'bg-slate-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          <span className="font-medium text-slate-700">{note.authorName ?? 'Unknown'}</span>
          {' · '}
          {formatDateTime(note.createdAt)}
        </p>
        <button
          type="button"
          title="Reply — notifies the commenter without @tagging them"
          aria-label="Reply to comment"
          onClick={() => startReply(note)}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Reply className="h-3 w-3" />
        </button>
      </div>
      {note.replyToId && (
        <p className="mt-1 border-l-2 border-slate-200 pl-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">
            {note.replyToAuthorName ?? 'Deleted comment'}
          </span>
          {note.replyToPreview ? `: ${note.replyToPreview}` : ''}
        </p>
      )}
      <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{note.body}</p>
      <NoteReactions
        projectId={projectId}
        note={note}
        onUpdated={(updated) =>
          setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)))
        }
      />
    </div>
  );

  const renderReplyBox = (target: ProjectNote) => {
    if (replyTo?.id !== target.id) return null;
    return (
      <div className="relative mt-2 rounded-lg border border-brand-200 bg-brand-50/60 p-2">
        <div className="mb-1 flex items-center justify-between text-[11px] text-brand-800">
          <span>Replying to {target.authorName ?? 'Unknown'} — they'll be notified</span>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={() => {
              setReplyTo(null);
              setReplyDraft('');
            }}
            className="rounded p-0.5 text-brand-600 hover:bg-brand-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <TextArea
          ref={replyTextareaRef}
          value={replyDraft}
          onChange={(e) => handleReplyDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!e.repeat) void addReply();
            }
          }}
          placeholder="Write a reply… use @ to mention someone"
          className="min-h-[56px] text-xs"
          autoFocus
        />
        {replySuggestions.length > 0 && (
          <div className="absolute bottom-full z-20 mb-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {replySuggestions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setReplyDraft((current) => current.replace(/@([\w.-]*)$/, `@${option.fullName} `));
                  setReplyMentionQuery(null);
                  replyTextareaRef.current?.focus();
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {option.fullName}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              setReplyDraft('');
            }}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <Button
            loading={saving}
            disabled={!replyDraft.trim()}
            onClick={() => void addReply()}
            className="px-3 py-1.5 text-xs"
          >
            Reply
          </Button>
        </div>
      </div>
    );
  };

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">Notification preview</p>
          <p className="truncate text-xs text-slate-500">{notification.title}</p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to={`/projects/${projectId}`}
            title="Open project"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading && !project ? (
        <SkeletonRows rows={3} />
      ) : project ? (
        <>
          <div className="mb-3 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
            {project.partImageFileName ? (
              <img
                src={`/api/projects/${projectId}/part-image`}
                alt={`${project.projectName} part`}
                className="max-h-48 max-w-full object-contain"
              />
            ) : (
              <p className="text-xs text-slate-500">No part image uploaded yet.</p>
            )}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2">
            <PreviewDetail label="Project" value={`${project.projectNumber} — ${project.projectName}`} />
            <PreviewDetail label="Customer" value={orDash(project.customerName)} />
            <PreviewDetail
              label="Internal Part Number"
              value={orDash(project.internalPartNumber)}
            />
            <PreviewDetail
              label="Customer Part Number"
              value={orDash(project.customerPartNumber)}
            />
            <PreviewDetail
              label="Stage"
              value={STAGE_LABELS.get(project.currentStage) ?? project.currentStage}
            />
            <PreviewDetail label="Material" value={orDash(project.material)} />
          </div>

          <p className="mb-2 border-t border-slate-100 pt-2 text-xs font-semibold text-slate-700">
            {taskId ? `Task comments${taskName ? ` — ${taskName}` : ''}` : 'Comments'}
          </p>
          {loading ? (
            <SkeletonRows rows={2} />
          ) : taskId ? (
            taskComments.length === 0 ? (
              <EmptyState title="No comments yet" description="Add the first task comment." />
            ) : (
              <div ref={notesListRef} className="mb-3 max-h-80 space-y-2 overflow-y-auto">
                {taskComments.map((comment) => (
                  <div key={comment.id} className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">
                        {comment.authorName ?? 'Unknown'}
                      </span>
                      {' · '}
                      {formatDateTime(comment.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-xs text-slate-700">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : notes.length === 0 ? (
            <EmptyState title="No comments yet" description="Add the first project comment." />
          ) : (
            <div ref={notesListRef} className="mb-3 max-h-80 space-y-2 overflow-y-auto">
              {topLevel.map((note) => {
                const replies = repliesByRoot.get(note.id) ?? [];
                const earlierOpen = earlierRepliesOpen.has(note.id);
                const visibleReplies = earlierOpen ? replies : replies.slice(-1);
                return (
                  <div key={note.id} id={`np-note-${note.id}`}>
                    {renderNoteCard(note, false)}
                    {renderReplyBox(note)}
                    {replies.length > 0 && (
                      <div className="ml-4 mt-1.5 border-l-2 border-slate-200 pl-2">
                        {replies.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggleEarlierReplies(note.id)}
                            className="text-[11px] font-medium text-brand-700 hover:text-brand-900"
                          >
                            {earlierOpen ? 'Hide' : 'Show'} {replies.length - 1} earlier{' '}
                            {replies.length - 1 === 1 ? 'reply' : 'replies'}
                          </button>
                        )}
                        <ul className="mt-1 space-y-1.5">
                          {visibleReplies.map((reply) => (
                            <li key={reply.id} id={`np-note-${reply.id}`}>
                              {renderNoteCard(reply, true)}
                              {renderReplyBox(reply)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative mt-auto">
            <TextArea
              ref={textareaRef}
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!event.repeat) void addComment();
                }
              }}
              placeholder="Add a comment… use @ to mention"
              className="min-h-[64px] text-xs"
            />
            {suggestions.length > 0 && (
              <div className="absolute bottom-full z-20 mb-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {suggestions.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setDraft((current) => current.replace(/@([\w.-]*)$/, `@${user.fullName} `));
                      setMentionQuery(null);
                      textareaRef.current?.focus();
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {user.fullName}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <Button
                loading={saving}
                disabled={!draft.trim()}
                onClick={() => void addComment()}
                className="px-3 py-1.5 text-xs"
              >
                Add comment
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}
