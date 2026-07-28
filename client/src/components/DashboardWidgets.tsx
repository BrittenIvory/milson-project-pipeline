import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Badge, EmptyState, WidgetCard } from './ui';
import { formatDate, formatDateTime, priorityMeta, stageMeta } from '../lib/format';
import type { Project } from '../types';

/**
 * Clickable stage counter. Navigates to the Projects page pre-filtered to the
 * stage it represents.
 */
export function StageCard({
  stage,
  label,
  tone,
  count,
}: {
  stage: string;
  label: string;
  tone: string;
  count: number;
}) {
  return (
    <Link
      to={`/projects?stage=${stage}`}
      className="card flex flex-col gap-2 p-4 transition-shadow hover:shadow-md"
    >
      <span className={clsx('inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium', tone)}>
        {label}
      </span>
      <span className="text-2xl font-semibold text-slate-900">{count}</span>
      <span className="text-xs text-slate-500">{count === 1 ? 'project' : 'projects'}</span>
    </Link>
  );
}

/** Headline metric tile (e.g. "Created this month"). */
export function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

/** Which secondary field a project list widget shows on the right. */
export type ProjectListMeta = 'stage' | 'priority' | 'updated' | 'target';

/**
 * Reusable "list of projects" widget shared by every dashboard spotlight
 * (recent, recently updated, upcoming due dates, waiting for action).
 */
export function ProjectListWidget({
  title,
  projects,
  meta = 'stage',
  emptyMessage,
  action,
}: {
  title: string;
  projects: Project[];
  meta?: ProjectListMeta;
  emptyMessage: string;
  action?: React.ReactNode;
}) {
  return (
    <WidgetCard title={title} action={action}>
      {projects.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="flex items-center gap-3 py-2.5 hover:opacity-80"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {project.projectName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {project.projectNumber} · {project.customerName}
                  </p>
                </div>
                {meta === 'stage' && (
                  <Badge tone={stageMeta(project.currentStage).tone}>
                    {stageMeta(project.currentStage).label}
                  </Badge>
                )}
                {meta === 'priority' && (
                  <Badge tone={priorityMeta(project.priority).tone}>
                    {priorityMeta(project.priority).label}
                  </Badge>
                )}
                {meta === 'updated' && (
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDateTime(project.updatedAt)}
                  </span>
                )}
                {meta === 'target' && (
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDate(project.targetQuoteDate)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
