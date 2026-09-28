import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, SkeletonRows, TextArea } from './ui';
import { apiErrorMessage, notesApi, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { ProjectNote, User } from '../types';

export default function ProjectComments({ projectId }: { projectId: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([notesApi.list(projectId), usersApi.list()])
      .then(([noteData, userData]) => {
        setNotes(noteData);
        setUsers(userData);
        setError(null);
      })
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load comments')))
      .finally(() => setLoading(false));
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
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Comments
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <ErrorBanner message={error} />
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
