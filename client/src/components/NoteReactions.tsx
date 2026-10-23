import { useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import clsx from 'clsx';
import { notesApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ProjectNote } from '../types';

const REACTION_EMOJIS = ['👍', '❤️', '🎉', '✅', '👀'] as const;

interface NoteReactionsProps {
  projectId: number;
  note: ProjectNote;
  onUpdated: (note: ProjectNote) => void;
}

/** Emoji reaction chips + picker under a comment. */
export default function NoteReactions({ projectId, note, onUpdated }: NoteReactionsProps) {
  const { user } = useAuth();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picking) return;
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPicking(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [picking]);

  const react = async (emoji: string) => {
    if (busy) return;
    setBusy(true);
    setPicking(false);
    try {
      onUpdated(await notesApi.react(projectId, note.id, emoji));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1">
      {note.reactions.map((reaction) => {
        const mine = user !== null && reaction.userIds.includes(user.id);
        return (
          <button
            key={reaction.emoji}
            type="button"
            disabled={busy}
            onClick={() => react(reaction.emoji)}
            className={clsx(
              'rounded-full border px-1.5 py-0.5 text-[11px] leading-none',
              mine
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {reaction.emoji} {reaction.userIds.length}
          </button>
        );
      })}
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPicking((current) => !current)}
          aria-label="Add reaction"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {picking && (
          <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                className="rounded-md px-1.5 py-1 text-sm hover:bg-slate-100"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
