import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Reply, Trash2, X } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  TextArea,
} from './ui';
import { useAuth } from '../context/AuthContext';
import NoteReactions from './NoteReactions';
import { apiErrorMessage, notesApi, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { ProjectNote, User } from '../types';

/** Highlights `@mentions` inside a note body. */
function NoteBody({ body }: { body: string }) {
  const parts = body.split(/(@[\w.-]+(?: [A-Za-z-]+)?)/g);
  return (
    <p className="whitespace-pre-line text-sm text-slate-700">
      {parts.map((part, index) =>
        part.startsWith('@') ? (
          <span key={index} className="font-medium text-brand-700">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

/** Threaded project comments with @mention autocomplete, oldest first, composer at bottom. */
export default function NotesPanel({
  projectId,
  onChanged,
}: {
  projectId: number;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  // Scroll to the latest comment only on first load and right after posting —
  // not on every list change, or edits/deletes would yank the reader to the bottom.
  const scrollToEndRef = useRef(true);
  // Replies re-sort their thread by latest activity, which can move it —
  // scroll the thread back into view after posting so it isn't lost.
  const pendingScrollIdRef = useRef<number | null>(null);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectNote | null>(null);
  const [replyTo, setReplyTo] = useState<ProjectNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [openThreads, setOpenThreads] = useState<Set<number>>(new Set());
  const [earlierRepliesOpen, setEarlierRepliesOpen] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNotes(await notesApi.list(projectId));
      setError(null);
    } catch (err) {
        setError(apiErrorMessage(err, 'Unable to load comments'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    usersApi.list().then(setUsers).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (pendingScrollIdRef.current !== null) {
      const el = document.getElementById(`note-${pendingScrollIdRef.current}`);
      pendingScrollIdRef.current = null;
      if (el) {
        // The sticky tab bar wraps to a variable height on narrow screens,
        // so measure it rather than rely on a fixed scroll-mt.
        const tabs = document.getElementById('project-tabs');
        if (tabs) el.style.scrollMarginTop = `${tabs.getBoundingClientRect().height + 12}px`;
        el.scrollIntoView({ block: 'start' });
      }
      return;
    }
    if (!scrollToEndRef.current) return;
    scrollToEndRef.current = false;
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [loading, notes.length]);

  /** Tracks the partial `@name` immediately before the caret. */
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
    // Revealing the thread keeps the freshly posted reply visible in place.
    const rootId = rootIdOf(target);
    setOpenThreads((current) => new Set(current).add(rootId));
  };

  const savingRef = useRef(false);

  const addNote = async () => {
    if (!draft.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await notesApi.create(projectId, draft.trim());
      setDraft('');
      scrollToEndRef.current = true;
      await load();
      onChanged?.();
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
      const rootId = rootIdOf(replyTo);
      const created = await notesApi.create(projectId, replyDraft.trim(), replyTo.id);
      setReplyTo(null);
      setReplyDraft('');
      setReplyMentionQuery(null);
      setOpenThreads((current) => new Set(current).add(rootId));
      // Scroll to the new reply itself: in a long thread the root's header
      // is far above it and would leave it off-screen.
      pendingScrollIdRef.current = created.id;
      await load();
      onChanged?.();
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

  const renderReplyBox = (target: ProjectNote) => {
    if (replyTo?.id !== target.id) return null;
    return (
      <div className="relative mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-brand-800">
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
            <X className="h-3.5 w-3.5" />
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
          autoFocus
        />
        {replySuggestions.length > 0 && (
          <div className="absolute bottom-full z-20 mb-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {replySuggestions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => applyReplyMention(option.fullName)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {option.fullName}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setReplyTo(null);
              setReplyDraft('');
            }}
          >
            Cancel
          </Button>
          <Button loading={saving} disabled={!replyDraft.trim()} onClick={addReply}>
            Reply
          </Button>
        </div>
      </div>
    );
  };

  const saveEdit = async (note: ProjectNote) => {
    setSaving(true);
    try {
      await notesApi.update(projectId, note.id, editingBody.trim());
      setEditingId(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update comment'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await notesApi.remove(projectId, pendingDelete.id);
      setPendingDelete(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to delete comment'));
    } finally {
      setSaving(false);
    }
  };

  const RECENT_COUNT = 5;

  // Group replies under their top-level ancestor. A reply whose parent is
  // missing from the list (e.g. deleted) falls back to top-level.
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

  // Threads stay in root-comment date order: replying must not move the
  // main comment to the bottom.
  const visibleNotes = expanded ? topLevel : topLevel.slice(-RECENT_COUNT);
  const hiddenCount = topLevel.length - visibleNotes.length;

  const toggleThread = (noteId: number) =>
    setOpenThreads((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });

  const toggleEarlierReplies = (noteId: number) =>
    setEarlierRepliesOpen((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });

  const suggestions =
    mentionQuery === null
      ? []
      : users.filter((option) => option.fullName.toLowerCase().includes(mentionQuery)).slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Comments</h2>
        <p className="text-xs text-slate-500">Mention a teammate with @ to notify them.</p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <SkeletonRows rows={3} />
      ) : notes.length === 0 ? (
        <EmptyState title="No comments yet" description="Capture decisions and customer feedback." />
      ) : (
        <>
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Show {hiddenCount} earlier comment{hiddenCount === 1 ? '' : 's'}
          </button>
        )}
        {expanded && notes.length > RECENT_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Show recent comments only
          </button>
        )}
        <ul className="space-y-3">
          {visibleNotes.map((note) => {
            const replies = repliesByRoot.get(note.id) ?? [];
            const threadOpen = openThreads.has(note.id);
            const earlierOpen = earlierRepliesOpen.has(note.id);
            // Open threads show only the latest reply; earlier replies hide
            // behind their own toggle.
            const visibleReplies = earlierOpen ? replies : replies.slice(-1);
            return (
            <li key={note.id} id={`note-${note.id}`} className="scroll-mt-24">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{note.authorName ?? 'Unknown'}</span>{' '}
                  · {formatDateTime(note.createdAt)}
                </p>
                <div className="flex gap-1">
                  <button
                    title="Reply — notifies the commenter without @tagging them"
                    aria-label="Reply to comment"
                    onClick={() => startReply(note)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                {(user?.id === note.authorId || user?.role === 'administrator') && (
                  <>
                    <button
                      title="Edit comment"
                      aria-label="Edit comment"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingBody(note.body);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Delete comment"
                      aria-label="Delete comment"
                      onClick={() => setPendingDelete(note)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                </div>
              </div>
              {note.replyToId && (
                <p className="mb-2 border-l-2 border-slate-200 pl-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-600">
                    {note.replyToAuthorName ?? 'Deleted comment'}
                  </span>
                  {note.replyToPreview ? `: ${note.replyToPreview}` : ''}
                </p>
              )}
              {editingId === note.id ? (
                <div className="space-y-2">
                  <TextArea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button loading={saving} onClick={() => saveEdit(note)}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <NoteBody body={note.body} />
              )}
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
            {renderReplyBox(note)}
            {replies.length > 0 && (
              <div className="ml-6 mt-2 border-l-2 border-slate-200 pl-3">
                <button
                  type="button"
                  onClick={() => toggleThread(note.id)}
                  className="text-xs font-medium text-brand-700 hover:text-brand-900"
                >
                  {threadOpen ? 'Hide' : 'Show'} {replies.length}{' '}
                  {replies.length === 1 ? 'reply' : 'replies'}
                </button>
                {threadOpen && replies.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggleEarlierReplies(note.id)}
                    className="mt-1 block text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    {earlierOpen ? 'Hide' : 'Show'} {replies.length - 1} earlier{' '}
                    {replies.length - 1 === 1 ? 'reply' : 'replies'}
                  </button>
                )}
                {threadOpen && (
                  <ul className="mt-2 space-y-2">
                    {visibleReplies.map((reply) => (
                      <li
                        key={reply.id}
                        id={`note-${reply.id}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-500">
                            <span className="font-medium text-slate-700">
                              {reply.authorName ?? 'Unknown'}
                            </span>{' '}
                            · {formatDateTime(reply.createdAt)}
                          </p>
                          <div className="flex gap-1">
                            <button
                              title="Reply — notifies the commenter without @tagging them"
                              aria-label="Reply to comment"
                              onClick={() => startReply(reply)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                            {(user?.id === reply.authorId || user?.role === 'administrator') && (
                              <>
                                <button
                                  title="Edit comment"
                                  aria-label="Edit comment"
                                  onClick={() => {
                                    setEditingId(reply.id);
                                    setEditingBody(reply.body);
                                  }}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  title="Delete comment"
                                  aria-label="Delete comment"
                                  onClick={() => setPendingDelete(reply)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {reply.replyToId && (
                          <p className="mb-2 border-l-2 border-slate-200 pl-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-600">
                              {reply.replyToAuthorName ?? 'Deleted comment'}
                            </span>
                            {reply.replyToPreview ? `: ${reply.replyToPreview}` : ''}
                          </p>
                        )}
                        {editingId === reply.id ? (
                          <div className="space-y-2">
                            <TextArea
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="secondary" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                              <Button loading={saving} onClick={() => saveEdit(reply)}>
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <NoteBody body={reply.body} />
                        )}
                        <NoteReactions
                          projectId={projectId}
                          note={reply}
                          onUpdated={(updated) =>
                            setNotes((current) =>
                              current.map((n) => (n.id === updated.id ? updated : n)),
                            )
                          }
                        />
                        {renderReplyBox(reply)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            </li>
            );
          })}
        </ul>
        </>
      )}

      <div className="relative">
        <TextArea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              // Repeat keydowns keep Enter a send-only key: swallow the newline
              // instead of inserting blank lines after the first send.
              e.preventDefault();
              if (!e.repeat) addNote();
            }
          }}
          placeholder="Add a comment… use @ to mention someone"
        />
        {suggestions.length > 0 && (
          <div className="absolute bottom-full z-20 mb-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {suggestions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => applyMention(option.fullName)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {option.fullName}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <Button loading={saving} disabled={!draft.trim()} onClick={addNote}>
            Add comment
          </Button>
        </div>
      </div>
      <div ref={listEndRef} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete comment"
        message="Delete this comment? This cannot be undone."
        loading={saving}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
