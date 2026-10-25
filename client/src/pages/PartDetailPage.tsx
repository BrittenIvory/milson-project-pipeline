import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { apiErrorMessage, partsApi } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { PROJECT_STAGES } from '../lib/constants';
import type { PartDetail } from '../types';

const STAGE_LABELS = new Map<string, string>(
  PROJECT_STAGES.map((stage) => [stage.value, stage.label]),
);

/** One part's details plus every project that uses it. */
export default function PartDetailPage() {
  const { partNumber = '' } = useParams();
  const [part, setPart] = useState<PartDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    partsApi
      .detail(partNumber)
      .then((data) => {
        setPart(data);
        setError(null);
      })
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load part')))
      .finally(() => setLoading(false));
  }, [partNumber]);

  if (loading) {
    return <p className="px-4 py-12 text-center text-sm text-slate-500">Loading…</p>;
  }
  if (error || !part) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-rose-600">{error ?? 'Part not found'}</p>
        <Link to="/parts" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          Back to parts
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <Link
        to="/parts"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        All parts
      </Link>

      <div className="mt-4 flex items-start gap-5">
        {part.imageProjectId ? (
          <img
            src={`/api/projects/${part.imageProjectId}/part-image`}
            alt={part.partNumber}
            className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100">
            <Package className="h-8 w-8 text-slate-400" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{part.partNumber}</h1>
          <dl className="mt-2 space-y-1 text-sm text-slate-600">
            {part.internalPartNumber && part.internalPartNumber !== part.partNumber && (
              <div className="flex gap-2">
                <dt className="w-40 text-slate-500">Internal part number</dt>
                <dd>{part.internalPartNumber}</dd>
              </div>
            )}
            {part.customerPartNumbers.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-40 text-slate-500">Customer part number</dt>
                <dd>{part.customerPartNumbers.join(', ')}</dd>
              </div>
            )}
            {part.customers.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-40 text-slate-500">Customers</dt>
                <dd>{part.customers.join(', ')}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-40 text-slate-500">Projects</dt>
              <dd>{part.projectCount}</dd>
            </div>
          </dl>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Projects for this part
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Project</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5">Engineer</th>
              <th className="px-4 py-2.5 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {part.projects.map((project) => (
              <tr key={project.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link
                    to={`/projects/${project.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {project.projectNumber}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-700">{project.projectName}</td>
                <td className="px-4 py-2.5 text-slate-700">{project.customerName ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  {STAGE_LABELS.get(project.currentStage) ?? project.currentStage}
                </td>
                <td className="px-4 py-2.5 text-slate-700">
                  {project.assignedEngineerName ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700">
                  {project.projectValue !== null
                    ? formatCurrency(project.projectValue, project.projectValueCurrency ?? 'USD')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
