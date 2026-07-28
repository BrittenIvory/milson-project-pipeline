import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Columns3,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
} from 'lucide-react';
import ProjectFilterBar from '../components/ProjectFilterBar';
import ProjectTable, {
  DEFAULT_VISIBLE_COLUMNS,
  PROJECT_COLUMNS,
} from '../components/ProjectTable';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SkeletonRows,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, customersApi, projectsApi, usersApi } from '../lib/api';
import { formatDate, formatDateTime, orDash, priorityMeta, stageMeta } from '../lib/format';
import { useDebounced, useLocalStorage } from '../lib/hooks';
import type { Customer, Project, ProjectFilters, User } from '../types';

const PAGE_SIZE = 25;

/** Drops empty values so they are never sent as query parameters. */
function compact(filters: ProjectFilters): ProjectFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  ) as ProjectFilters;
}

/** Card representation of a project, used by the optional card view. */
function ProjectCard({ project }: { project: Project }) {
  return (
    <Link to={`/projects/${project.id}`} className="card block p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{project.projectName}</p>
          <p className="truncate text-xs text-slate-500">
            {project.projectNumber} · {orDash(project.customerName)}
          </p>
        </div>
        <Badge tone={priorityMeta(project.priority).tone}>
          {priorityMeta(project.priority).label}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={stageMeta(project.currentStage).tone}>
          {stageMeta(project.currentStage).label}
        </Badge>
        <span className="text-xs text-slate-500">
          Target {formatDate(project.targetQuoteDate)}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-400">Updated {formatDateTime(project.updatedAt)}</p>
    </Link>
  );
}

/** Projects page: searchable, filterable, sortable table with a card view. */
export default function ProjectsPage() {
  const { canEdit } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounced(search);
  const [filters, setFilters] = useState<ProjectFilters>({
    stage: searchParams.get('stage') ?? '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [view, setView] = useLocalStorage<'table' | 'cards'>('milson.projects.view', 'table');
  const [layout, setLayout] = useLocalStorage('milson.projects.layout', {
    visible: DEFAULT_VISIBLE_COLUMNS,
    widths: {} as Record<string, number>,
    pinned: ['projectNumber'] as string[],
  });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [options, setOptions] = useState<{ materials: string[]; castingProcesses: string[] }>({
    materials: [],
    castingProcesses: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference data for the filter menus is fetched once.
  useEffect(() => {
    Promise.all([customersApi.list(), usersApi.list(), projectsApi.filterOptions()])
      .then(([customerList, userList, filterOptions]) => {
        setCustomers(customerList);
        setUsers(userList);
        setOptions(filterOptions);
      })
      .catch(() => undefined);
  }, []);

  // Keep the stage filter reflected in the URL so dashboard links are shareable.
  useEffect(() => {
    const stage = searchParams.get('stage') ?? '';
    setFilters((current) => (current.stage === stage ? current : { ...current, stage }));
  }, [searchParams]);

  const query = useMemo(
    () => compact({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDir]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    projectsApi
      .page({ ...query, sortBy, sortDir, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setProjects(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Unable to load projects'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, sortBy, sortDir, page]);

  const applyFilters = (next: ProjectFilters) => {
    setFilters(next);
    const params = new URLSearchParams(searchParams);
    if (next.stage) params.set('stage', next.stage);
    else params.delete('stage');
    setSearchParams(params, { replace: true });
  };

  const toggleSort = (columnId: string) => {
    if (sortBy === columnId) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(columnId);
    setSortDir('asc');
  };

  const toggleColumn = (columnId: string) =>
    setLayout((current) => ({
      ...current,
      visible: current.visible.includes(columnId)
        ? current.visible.filter((id) => id !== columnId)
        : DEFAULT_VISIBLE_COLUMNS.filter(
            (id) => current.visible.includes(id) || id === columnId,
          ),
    }));

  const togglePin = (columnId: string) =>
    setLayout((current) => ({
      ...current,
      pinned: current.pinned.includes(columnId)
        ? current.pinned.filter((id) => id !== columnId)
        : [...current.pinned, columnId],
    }));

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount = Object.keys(compact(filters)).length;

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title="Projects"
        description={`${total} ${total === 1 ? 'project' : 'projects'}`}
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="input pl-9"
          />
        </div>
        <Button variant="secondary" onClick={() => setShowFilters((open) => !open)}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-brand-100 px-2 text-xs text-brand-700">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <div className="relative">
          <Button variant="secondary" onClick={() => setShowColumns((open) => !open)}>
            <Columns3 className="h-4 w-4" /> Columns
          </Button>
          {showColumns && (
            <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {PROJECT_COLUMNS.map((column) => (
                <label
                  key={column.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={layout.visible.includes(column.id)}
                    onChange={() => toggleColumn(column.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                  />
                  {column.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex overflow-hidden rounded-xl border border-slate-300">
          <button
            onClick={() => setView('table')}
            aria-label="Table view"
            className={clsx('px-3 py-2', view === 'table' ? 'bg-brand-50 text-brand-700' : 'text-slate-500')}
          >
            <TableIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('cards')}
            aria-label="Card view"
            className={clsx('px-3 py-2', view === 'cards' ? 'bg-brand-50 text-brand-700' : 'text-slate-500')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 space-y-2">
          <ProjectFilterBar
            filters={filters}
            onChange={applyFilters}
            customers={customers}
            users={users}
            materials={options.materials}
            castingProcesses={options.castingProcesses}
          />
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => applyFilters({})}>
              Clear filters
            </Button>
          </div>
        </div>
      )}

      <ErrorBanner message={error} />

      {loading ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects match your filters"
          description="Adjust the search or filters, or create a new project."
        />
      ) : view === 'table' ? (
        <ProjectTable
          projects={projects}
          layout={layout}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={toggleSort}
          onWidthChange={(id, width) =>
            setLayout((current) => ({ ...current, widths: { ...current.widths, [id]: width } }))
          }
          onTogglePin={togglePin}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {lastPage}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
