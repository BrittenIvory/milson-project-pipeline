import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, SkeletonRows, TextArea } from './ui';
import { apiErrorMessage, notesApi, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { ProjectNote, User } from '../types';

export default function ProjectComments({ projectId }: { projectId: number }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ left: 8, top: 8 });
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const notesLoadVersion = useRef(0);
  const usersLoadVersion = useRef(0);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const popupWidth = 320;
      const sidebarInset = window.matchMedia('(min-width: 1024px)').matches ? 264 : 8;
      setPopoverPosition({
        left: Math.min(
          Math.max(sidebarInset, rect.left - popupWidth - 8),
          window.innerWidth - popupWidth - 8,
        ),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 360)),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

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
      })
      .catch((err) => {
        if (notesVersion === notesLoadVersion.current) {
          setError(apiErrorMessage(err, 'Unable to load comments'));
        }
      })
      .finally(() => {
        if (notesVersion === notesLoadVersion.current) setLoading(false);
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

  const addComment = async () => {
    if (!draft.trim()) return;
    notesLoadVersion.current += 1;
    setSaving(true);
    try {
      const note = await notesApi.create(projectId, draft.trim());
      setNotes((current) => [note, ...current]);
      setDraft('');
      setMentionQuery(null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add comment'));
    } finally {
      setSaving(false);
    }
  };

  const suggestions =
    mentionQuery === null
      ? []
      : users.filter((user) => user.fullName.toLowerCase().includes(mentionQuery)).slice(0, 5);

  return (
    <div className="min-w-[13rem]">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Comments
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div
          className="fixed z-50 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ left: popoverPosition.left, top: popoverPosition.top }}
        >
          <ErrorBanner message={error} />
          {mentionError && <p className="mb-2 text-xs text-amber-700">{mentionError}</p>}
          {loading ? (
            <SkeletonRows rows={2} />
          ) : (
            <>
              {notes.length === 0 ? (
                <EmptyState title="No comments yet" description="Add the first project comment." />
              ) : (
                <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[11px] text-slate-500">
                        <span className="font-medium text-slate-700">{note.authorName ?? 'Unknown'}</span>
                        {' · '}
                        {formatDateTime(note.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{note.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <TextArea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
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
        </div>
      )}
    </div>
  );
}
