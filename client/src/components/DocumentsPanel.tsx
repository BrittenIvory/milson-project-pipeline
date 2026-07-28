import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Download, Eye, FileText, Pencil, Search, Trash2, Upload } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SkeletonRows,
  TextInput,
} from './ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, documentsApi } from '../lib/api';
import { ACCEPTED_FILE_EXTENSIONS } from '../lib/constants';
import { formatBytes, formatDateTime } from '../lib/format';
import { useDebounced } from '../lib/hooks';
import type { ProjectDocument } from '../types';

/** Extensions the browser can render inline in a preview tab. */
const PREVIEWABLE = ['pdf', 'png', 'jpg', 'jpeg'];

/** Upload, preview, rename, download and delete project documents. */
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
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<ProjectDocument | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocuments(await documentsApi.list(projectId, debouncedSearch || undefined));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load documents'));
    } finally {
      setLoading(false);
    }
  }, [projectId, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  /** Uploads files sequentially so per-file errors stay attributable. */
  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of list) {
        await documentsApi.upload(projectId, file);
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to upload file'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await documentsApi.remove(projectId, pendingDelete.id);
      setPendingDelete(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to delete file'));
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (!renaming) return;
    setBusy(true);
    try {
      await documentsApi.rename(projectId, renaming.id, renameValue.trim());
      setRenaming(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to rename file'));
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
              multiple
              className="hidden"
              accept={ACCEPTED_FILE_EXTENSIONS.join(',')}
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
            <Button loading={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload file
            </Button>
          </>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents…"
          className="input pl-9"
        />
      </div>

      <ErrorBanner message={error} />

      {user && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            uploadFiles(e.dataTransfer.files);
          }}
          className={clsx(
            'rounded-2xl border-2 border-dashed px-6 py-6 text-center text-sm transition-colors',
            dragging ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-500',
          )}
        >
          Drag and drop files here to upload
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : documents.length === 0 ? (
        <EmptyState
          title={search ? 'No documents match your search' : 'No documents yet'}
          description="Upload drawings, models or supplier quotes to keep them with the project."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Uploaded By</th>
                <th className="px-4 py-3">Upload Date</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="font-medium text-slate-800">{doc.fileName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 uppercase text-slate-500">{doc.extension ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{doc.uploadedByName ?? 'Unknown'}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(doc.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatBytes(doc.sizeBytes)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {PREVIEWABLE.includes(doc.extension ?? '') && (
                        <button
                          title="Preview"
                          aria-label={`Preview ${doc.fileName}`}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => documentsApi.preview(projectId, doc)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        title="Download"
                        aria-label={`Download ${doc.fileName}`}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => documentsApi.download(projectId, doc)}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        title="Rename"
                        aria-label={`Rename ${doc.fileName}`}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => {
                          setRenaming(doc);
                          setRenameValue(doc.fileName);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        title="Delete"
                        aria-label={`Delete ${doc.fileName}`}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => setPendingDelete(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={renaming !== null}
        title="Rename document"
        onClose={() => setRenaming(null)}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submitRename}>
              Save
            </Button>
          </>
        }
      >
        <Field label="File Name" hint="The file extension cannot be changed.">
          <TextInput value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document"
        message={`Delete “${pendingDelete?.fileName}”? This cannot be undone.`}
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
