import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FolderPlus, Plus } from 'lucide-react';
import {
  MetricCard,
  ProjectListWidget,
  StageCard,
} from '../components/DashboardWidgets';
import { Button, ErrorBanner, PageHeader, SkeletonRows } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, projectsApi } from '../lib/api';
import { PROJECT_STAGES } from '../lib/constants';
import type { DashboardSummary } from '../types';

/** Home page: stage counters, month-to-date metrics and project spotlights. */
export default function DashboardPage() {
  const { canEdit } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectsApi
      .dashboard()
      .then(setSummary)
      .catch((err) => setError(apiErrorMessage(err, 'Unable to load the dashboard')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Pipeline health across every stage."
        actions={
          canEdit && (
            <Link to="/projects/new">
              <Button>
                <Plus className="h-4 w-4" /> New project
              </Button>
            </Link>
          )
        }
      />

      <ErrorBanner message={error} />

      {loading || !summary ? (
        <div className="space-y-4">
          <SkeletonRows rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROJECT_STAGES.map((stage) => (
              <StageCard
                key={stage.value}
                stage={stage.value}
                label={stage.label}
                tone={stage.tone}
                count={summary.byStage[stage.value] ?? 0}
              />
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Created this month" value={summary.createdThisMonth} icon={FolderPlus} />
            <MetricCard
              label="Completed this month"
              value={summary.completedThisMonth}
              icon={CheckCircle2}
            />
            <MetricCard
              label="Waiting for action"
              value={summary.waiting.length}
              icon={AlertTriangle}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectListWidget
              title="Recent projects"
              projects={summary.recent}
              emptyMessage="No projects yet"
              action={
                <Link to="/projects" className="text-xs font-medium text-brand-600 hover:underline">
                  View all
                </Link>
              }
            />
            <ProjectListWidget
              title="Recently updated"
              projects={summary.recentlyUpdated}
              meta="updated"
              emptyMessage="Nothing updated yet"
            />
            <ProjectListWidget
              title="Upcoming due dates"
              projects={summary.upcoming}
              meta="target"
              emptyMessage="No upcoming quote dates"
            />
            <ProjectListWidget
              title="Waiting for action"
              projects={summary.waiting}
              meta="priority"
              emptyMessage="Nothing is overdue"
            />
          </div>
        </div>
      )}
    </div>
  );
}
