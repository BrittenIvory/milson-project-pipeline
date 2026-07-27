import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Select, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, projectsApi } from '../lib/api';
import { PROJECT_STAGES } from '../lib/constants';
import { formatDate, orDash, priorityMeta, stageMeta } from '../lib/format';
import type { Project } from '../types';

/** Project list with search by number, name, customer or part number. */
export default function ProjectsPage() {
  const { canEdit } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await projectsApi.list({ search: search || undefined, stage }));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load projects'));
    } finally {
      setLoading(false);
    }
  }, [search, stage]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projects"
        description="Every job from intake through quality approval."
        actions={
          canEdit && (
            <Link to="/projects/new">
              <Button>
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </Link>
          )
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search project number, name, customer or part number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="sm:w-56"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="Filter by stage"
          >
            <option value="all">All stages</option>
            {PROJECT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="mb-4">
        <ErrorBanner message={error} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects found"
          description="Create a project to start tracking it through the pipeline."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Project</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Part Number</th>
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3 font-semibold">Priority</th>
                  <th className="px-5 py-3 font-semibold">Target Quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr key={project.id} className="cursor-pointer hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <Link to={`/projects/${project.id}`} className="block">
                        <p className="font-medium text-slate-800">{project.projectName}</p>
                        <p className="text-xs text-slate-500">{project.projectNumber}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <Link to={`/projects/${project.id}`}>{orDash(project.customerName)}</Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <Link to={`/projects/${project.id}`}>
                        {orDash(project.customerPartNumber)}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={stageMeta(project.currentStage).tone}>
                        {stageMeta(project.currentStage).label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={priorityMeta(project.priority).tone}>
                        {priorityMeta(project.priority).label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDate(project.targetQuoteDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
