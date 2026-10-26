import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, MessageSquare, Reply, X } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, SkeletonRows, TextArea } from './ui';
import NoteReactions from './NoteReactions';
import {
  apiErrorMessage,
  notesApi,
  UNREAD_NOTE_PROJECTS_EVENT,
  unreadNoteProjectIds,
  usersApi,
} from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { ProjectNote, User } from '../types';

const OPEN_EVENT = 'milson-project-comments-open';

interface ProjectCommentsProps {
  projectId: number;
  projectNumber: string;
  partNumber?: string | null;
}

export default function ProjectComments({ projectId, projectNumber, partNumber }: ProjectCommentsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const notesListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ left: 8, top: 8 });
  const [popoverWidth, setPopoverWidth] = useState(320);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replyTo, setReplyTo] = useState<ProjectNote | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [earlierRepliesOpen, setEarlierRepliesOpen] = useState<Set<number>>(new Set());
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const notesLoadVersion = useRef(0);
  const usersLoadVersion = useRef(0);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      unreadNoteProjectIds().then((ids) => {
        if (!cancelled) setHasUnread(ids.has(projectId));
      });
    };
    refresh();
    window.addEventListener(UNREAD_NOTE_PROJECTS_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(UNREAD_NOTE_PROJECTS_EVENT, refresh);
    };
  }, [projectId]);

  useEffect(() => {
    const closeIfAnotherOpened = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== projectId) setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, closeIfAnotherOpened);
    return () => window.removeEventListener(OPEN_EVENT, closeIfAnotherOpened);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const updatePosition = useCallback(() => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const popupWidth = Math.min(320, Math.max(0, window.innerWidth - 16));
      const sidebarInset = window.matchMedia('(min-width: 1024px)').matches ? 264 : 8;
      setPopoverWidth(popupWidth);
      setPopoverPosition({
        left: Math.min(
          Math.max(sidebarInset, rect.left - popupWidth - 8),
          window.innerWidth - popupWidth - 8,
        ),
        top: Math.max(
          8,
          Math.min(rect.top, window.innerHeight - (popoverRef.current?.offsetHeight ?? 360) - 8),
        ),
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const notesVersion = ++notesLoadVersion.current;
    const usersVersion = ++usersLoadVersion.current;
    setLoading(true);
    setError(null);
    setMentionError(null);
    notesApi
      .list(projectId)
      .then((noteData) => {
        if (notesVersion !== notesLoadVersion.current) return;
        setNotes(noteData);
        requestAnimationFrame(() => {
          const el = notesListRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      })
      .catch((err) => {
        if (notesVersion === notesLoadVersion.current) {
          setError(apiErrorMessage(err, 'Unable to load comments'));
        }
      })
      .finally(() => {
        if (notesVersion === notesLoadVersion.current) {
          setLoading(false);
          requestAnimationFrame(updatePosition);
        }
      });
    usersApi
      .list()
      .then((userData) => {
        if (usersVersion !== usersLoadVersion.current) return;
        setUsers(userData);
      })
      .catch(() => {
        if (usersVersion === usersLoadVersion.current) {
          setMentionError('User suggestions are unavailable right now.');
        }
      });
    return () => {
      notesLoadVersion.current += 1;
      usersLoadVersion.current += 1;
    };
  }, [open, projectId]);

  const handleDraftChange = (value: string) => {
    setDraft(value);
    const match = /@([\w.-]*)$/.exec(value);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const applyMention = (name: string) => {
    setDraft((current) => current.replace(/@([\w.-]*)$/, `@${name} `));
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const savingRef = useRef(false);

  const handleReplyDraftChange = (value: string) => {
    setReplyDraft(value);
    const match = /@([\w.-]*)$/.exec(value);
    setReplyMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const applyReplyMention = (name: string) => {
    setReplyDraft((current) => current.replace(/@([\w.-]*)$/, `@${name} `));
    setReplyMentionQuery(null);
    replyTextareaRef.current?.focus();
  };

  const startReply = (target: ProjectNote) => {
    setReplyTo(target);
    setReplyDraft('');
    setReplyMentionQuery(null);
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
      // The new reply can land below the popover's scroll viewport — bring it
      // into view once the DOM has it.
      requestAnimationFrame(() => {
        document
          .getElementById(`pc-note-${created.id}`)
          ?.scrollIntoView({ block: 'nearest' });
      });
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add comment'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const replySuggestions =
    replyMentionQuery === null
      ? []
      : users
          .filter((option) => option.fullName.toLowerCase().includes(replyMentionQuery))
          .slice(0, 5);

  const addComment = async () => {
    if (!draft.trim() || savingRef.current) return;
    savingRef.current = true;
    notesLoadVersion.current += 1;
    setSaving(true);
    try {
      const note = await notesApi.create(projectId, draft.trim());
      setNotes((current) => [...current, note]);
      setDraft('');
      requestAnimationFrame(() => {
        const el = notesListRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      setMentionQuery(null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add comment'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const suggestions =
    mentionQuery === null
      ? []
      : users.filter((user) => user.fullName.toLowerCase().includes(mentionQuery)).slice(0, 5);

  // Same threading model as the Comments tab: replies group under their
  // top-level ancestor, the latest reply always shows, earlier replies
  // hide behind one toggle.
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
          setNotes((current) =>
            current.map((n) => (n.id === updated.id ? updated : n)),
          )
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
              if (!e.repeat) addReply();
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
                onClick={() => applyReplyMention(option.fullName)}
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
            onClick={addReply}
            className="px-3 py-1.5 text-xs"
          >
            Reply
          </Button>
        </div>
      </div>
    );
  };

  const toggleComments = () => {
    if (open) {
      setOpen(false);
      return;
    }
    window.dispatchEvent(new CustomEvent<number>(OPEN_EVENT, { detail: projectId }));
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="min-w-[13rem]">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleComments}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
      >
        <span className="relative inline-flex">
          <MessageSquare className="h-3.5 w-3.5" />
          {hasUnread && (
            <span
              aria-label="Unread comment notification"
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500"
            />
          )}
        </span>
        Comments
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open &&
        createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50 max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ left: popoverPosition.left, top: popoverPosition.top, width: popoverWidth }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700">Project comments</p>
              <p className="truncate text-[11px] text-slate-500">
                {projectNumber}
                {partNumber ? ` · ${partNumber}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close comments"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ErrorBanner message={error} />
          {mentionError && <p className="mb-2 text-xs text-amber-700">{mentionError}</p>}
          {loading ? (
            <SkeletonRows rows={2} />
          ) : (
            <>
              {notes.length === 0 ? (
                <EmptyState title="No comments yet" description="Add the first project comment." />
              ) : (
                <div ref={notesListRef} className="mb-3 max-h-72 space-y-2 overflow-y-auto">
                  {topLevel.map((note) => {
                    const replies = repliesByRoot.get(note.id) ?? [];
                    const earlierOpen = earlierRepliesOpen.has(note.id);
                    const visibleReplies = earlierOpen ? replies : replies.slice(-1);
                    return (
                      <div key={note.id} id={`pc-note-${note.id}`}>
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
                                <li key={reply.id} id={`pc-note-${reply.id}`}>
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
              <div className="relative">
                <TextArea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (!event.repeat) addComment();
                    }
                  }}
                  placeholder="Add a comment… use @ to mention"
                  className="min-h-[72px] text-xs"
                />
                {suggestions.length > 0 && (
                  <div className="absolute bottom-full z-20 mb-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {suggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => applyMention(user.fullName)}
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
                    onClick={addComment}
                    className="px-3 py-1.5 text-xs"
                  >
                    Add comment
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
