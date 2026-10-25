import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { apiErrorMessage, partsApi } from '../lib/api';
import type { PartSummary } from '../types';

/** List of every distinct part across projects. */
export default function PartsPage() {
  const [items, setItems] = useState<PartSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    partsApi
      .list()
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load parts')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
        <Package className="h-5 w-5 text-brand-600" />
        Parts
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Every distinct part number across your projects.
      </p>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          No parts yet — parts appear once a project has a part number.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((part) => (
            <li key={part.partNumber}>
              <Link
                to={`/parts/${encodeURIComponent(part.partNumber)}`}
                className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
              >
                {part.imageProjectId ? (
                  <img
                    src={`/api/projects/${part.imageProjectId}/part-image`}
                    alt={part.partNumber}
                    className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Package className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {part.partNumber}
                  </p>
                  {part.customerPartNumbers.length > 0 && (
                    <p className="truncate text-xs text-slate-500">
                      Customer: {part.customerPartNumbers.join(', ')}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {part.customers.join(', ')}
                  </p>
                  <p className="mt-1 text-xs font-medium text-brand-700">
                    {part.projectCount} {part.projectCount === 1 ? 'project' : 'projects'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
