import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  TextArea,
} from './ui';
import { useAuth } from '../context/AuthContext';
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

/** Threaded project notes with @mention autocomplete, newest first. */
export default function NotesPanel({
  projectId,
  onChanged,
}: {
  projectId: number;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNotes(await notesApi.list(projectId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load notes'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    usersApi.list().then(setUsers).catch(() => undefined);
  }, [load]);

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

  const addNote = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await notesApi.create(projectId, draft.trim());
      setDraft('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to add note'));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (note: ProjectNote) => {
    setSaving(true);
    try {
      await notesApi.update(projectId, note.id, editingBody.trim());
      setEditingId(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update note'));
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
      setError(apiErrorMessage(err, 'Unable to delete note'));
    } finally {
      setSaving(false);
    }
  };

  const suggestions =
    mentionQuery === null
      ? []
      : users.filter((option) => option.fullName.toLowerCase().includes(mentionQuery)).slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
        <p className="text-xs text-slate-500">Mention a teammate with @ to notify them.</p>
      </div>

      <ErrorBanner message={error} />

      <div className="relative">
        <TextArea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder="Add a note… use @ to mention someone"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
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
            Add note
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Capture decisions and customer feedback." />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{note.authorName ?? 'Unknown'}</span>{' '}
                  · {formatDateTime(note.createdAt)}
                </p>
                {(user?.id === note.authorId || user?.role === 'administrator') && (
                  <div className="flex gap-1">
                    <button
                      title="Edit note"
                      aria-label="Edit note"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingBody(note.body);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Delete note"
                      aria-label="Delete note"
                      onClick={() => setPendingDelete(note)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
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
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete note"
        message="Delete this note? This cannot be undone."
        loading={saving}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
