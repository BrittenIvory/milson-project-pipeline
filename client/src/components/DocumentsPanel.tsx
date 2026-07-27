import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { Button, EmptyState, ErrorBanner, Spinner } from './ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, documentsApi } from '../lib/api';
import { ACCEPTED_FILE_EXTENSIONS } from '../lib/constants';
import { formatBytes, formatDateTime } from '../lib/format';
import type { ProjectDocument } from '../types';

/** Upload / download / delete project documents. */
export default function DocumentsPanel({
  projectId,
  /** Called after a document changes so the parent can refresh its activity feed. */
  onChanged,
}: {
  projectId: number;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await documentsApi.list(projectId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load documents'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await documentsApi.upload(projectId, file);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to upload file'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (doc: ProjectDocument) => {
    if (!window.confirm(`Delete ${doc.fileName}?`)) return;
    setBusy(true);
    try {
      await documentsApi.remove(projectId, doc.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to delete file'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
          <p className="text-xs text-slate-500">
            Drawings, models and quotes. Accepted: {ACCEPTED_FILE_EXTENSIONS.join(', ')}
          </p>
        </div>
        {user && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_FILE_EXTENSIONS.join(',')}
              onChange={handleUpload}
            />
            <Button loading={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload file
            </Button>
          </>
        )}
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload drawings, models or supplier quotes to keep them with the project."
        />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{doc.fileName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(doc.sizeBytes)} · {doc.uploadedByName ?? 'Unknown'} ·{' '}
                  {formatDateTime(doc.createdAt)}
                </p>
              </div>
              <button
                title="Download"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => documentsApi.download(projectId, doc)}
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                title="Delete"
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => handleDelete(doc)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
