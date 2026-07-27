import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, FolderKanban, Plus } from 'lucide-react';
import { Badge, Button, Card, PageHeader, Spinner } from '../components/ui';
import { activityApi, projectsApi } from '../lib/api';
import { PROJECT_STAGES } from '../lib/constants';
import { formatDateTime, stageMeta } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { ActivityRecord, Project, ProjectStats } from '../types';

/** Landing page: headline counters, stage breakdown, recent projects and activity. */
export default function DashboardPage() {
  const { canEdit } = useAuth();
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([projectsApi.stats(), projectsApi.list(), activityApi.list(8)])
      .then(([statsData, projectList, activityList]) => {
        setStats(statsData);
        setProjects(projectList.slice(0, 5));
        setActivity(activityList);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const cards = [
    { label: 'Active projects', value: stats?.totals.projects ?? 0, icon: FolderKanban },
    { label: 'Customers', value: stats?.totals.customers ?? 0, icon: Building2 },
    { label: 'Documents', value: stats?.totals.documents ?? 0, icon: FileText },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="A snapshot of everything moving through the Milson pipeline."
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-semibold text-slate-900">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Projects by stage</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROJECT_STAGES.map((stage) => (
            <div key={stage.value} className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs font-medium text-slate-500">{stage.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {stats?.byStage[stage.value] ?? 0}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent projects</h2>
            <Link to="/projects" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No projects yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    to={`/projects/${project.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {project.projectNumber} · {project.projectName}
                      </p>
                      <p className="truncate text-xs text-slate-500">{project.customerName}</p>
                    </div>
                    <Badge tone={stageMeta(project.currentStage).tone}>
                      {stageMeta(project.currentStage).label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((record) => (
                <li key={record.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{record.userName ?? 'System'}</span>{' '}
                      {record.action.toLowerCase()}
                      {record.detail ? ` — ${record.detail}` : ''}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(record.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
