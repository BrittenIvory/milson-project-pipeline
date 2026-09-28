import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Download, Pencil, Trash2, Upload } from 'lucide-react';
import ProjectForm, { projectToPayload } from '../components/ProjectForm';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Select,
  SkeletonRows,
  Spinner,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, documentsApi, projectsApi } from '../lib/api';
import type { ProjectPayload } from '../lib/api';
import { PRIORITIES, PROJECT_STAGES } from '../lib/constants';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  orDash,
  priorityMeta,
  stageMeta,
} from '../lib/format';
import type { ActivityRecord, Project } from '../types';

// Heavy panels are code-split so opening a workspace stays fast.
const DocumentsPanel = lazy(() => import('../components/DocumentsPanel'));
const TasksPanel = lazy(() => import('../components/TasksPanel'));
const NotesPanel = lazy(() => import('../components/NotesPanel'));

type Tab =
  | 'summary'
  | 'tasks'
  | 'documents'
  | 'activity'
  | 'notes'
  | 'engineering'
  | 'supplier-quotes'
  | 'production'
  | 'qa';

const tabs: { id: Tab; label: string; placeholder?: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' },
  {
    id: 'engineering',
    label: 'Engineering',
    placeholder: 'Engineering reviews and design records arrive in a later phase.',
  },
  {
    id: 'supplier-quotes',
    label: 'Supplier Quotes',
    placeholder: 'Supplier quoting arrives in a later phase.',
  },
  {
    id: 'production',
    label: 'Production',
    placeholder: 'Production planning arrives in a later phase.',
  },
  { id: 'qa', label: 'QA', placeholder: 'Quality approval arrives in a later phase.' },
];

/** Single row inside a summary card. */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}

/** Project workspace: summary, tasks, documents, activity, notes and placeholders. */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const tab = (searchParams.get('tab') as Tab) ?? 'summary';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProjectPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [partImageUrl, setPartImageUrl] = useState<string | null>(null);
  const [partImageBusy, setPartImageBusy] = useState(false);
  const partImageInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [projectData, activityData] = await Promise.all([
        projectsApi.get(projectId),
        projectsApi.activity(projectId),
      ]);
      setProject(projectData);
      setActivity(activityData);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load project'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (project?.partImageFileName) {
      projectsApi.getPartImage(projectId).then((url) => {
        if (active) {
          objectUrl = url;
          setPartImageUrl(url);
        } else URL.revokeObjectURL(url);
      }).catch(() => {
        if (active) setPartImageUrl(null);
      });
    } else {
      setPartImageUrl(null);
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project?.partImageFileName, project?.partImageSizeBytes, project?.updatedAt, projectId]);

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const startEditing = () => {
    if (!project) return;
    setForm(projectToPayload(project));
    setEditing(true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await projectsApi.update(projectId, form);
      setEditing(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to save project'));
    } finally {
      setSaving(false);
    }
  };

  /** Inline stage/priority change from the workspace header. */
  const patch = async (changes: Partial<ProjectPayload>) => {
    if (!project) return;
    setSaving(true);
    try {
      await projectsApi.update(projectId, { ...projectToPayload(project), ...changes });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to update project'));
    } finally {
      setSaving(false);
    }
  };

  const generateQuickQuote = async () => {
    setQuoteBusy(true);
    setError(null);
    try {
      const document = await projectsApi.generateQuickQuote(projectId);
      await documentsApi.download(projectId, document);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to generate estimate PDF'));
    } finally {
      setQuoteBusy(false);
    }
  };

  const uploadPartImage = async (file: File) => {
    setPartImageBusy(true);
    setError(null);
    try {
      await projectsApi.uploadPartImage(projectId, file);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to upload part image'));
    } finally {
      setPartImageBusy(false);
    }
  };

  const removePartImage = async () => {
    setPartImageBusy(true);
    try {
      await projectsApi.removePartImage(projectId);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to remove part image'));
    } finally {
      setPartImageBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorBanner message={error ?? 'Project not found'} />
      </div>
    );
  }

  if (editing && form) {
    return (
      <div className="mx-auto max-w-5xl">
        <button
          onClick={() => setEditing(false)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </button>
        <ProjectForm
          value={form}
          onChange={setForm}
          onSubmit={save}
          onCancel={() => setEditing(false)}
          saving={saving}
          error={error}
          submitLabel="Save changes"
          projectNumber={project.projectNumber}
        />
      </div>
    );
  }

  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];

  return (
    <div className="mx-auto max-w-6xl">
      <button
        onClick={() => navigate('/projects')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {project.projectName}
            </h1>
            <Badge tone={stageMeta(project.currentStage).tone}>
              {stageMeta(project.currentStage).label}
            </Badge>
            <Badge tone={priorityMeta(project.priority).tone}>
              {priorityMeta(project.priority).label}
            </Badge>
            <span className="text-xs font-medium text-slate-500">
              {project.currentStageDays} {project.currentStageDays === 1 ? 'day' : 'days'} in stage
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {project.projectNumber} ·{' '}
            <Link to="/customers" className="hover:underline">
              {project.customerName}
            </Link>
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" loading={quoteBusy} onClick={generateQuickQuote}>
              <Download className="h-4 w-4" /> Estimate PDF
            </Button>
            <Select
              aria-label="Current stage"
              value={project.currentStage}
              disabled={saving}
              onChange={(e) => patch({ currentStage: e.target.value })}
              className="w-48"
            >
              {PROJECT_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Priority"
              value={project.priority}
              disabled={saving}
              onChange={(e) => patch({ priority: e.target.value as Project['priority'] })}
              className="w-36"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={startEditing}>
              <Pencil className="h-4 w-4" /> Edit project
            </Button>
          </div>
        )}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === item.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} />

      {tab === 'summary' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">General information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Project Number" value={project.projectNumber} />
              <DetailItem label="Project Name" value={project.projectName} />
              <DetailItem label="Internal Part Number" value={orDash(project.internalPartNumber)} />
              <DetailItem label="Annual Usage" value={orDash(project.annualUsage)} />
              <DetailItem label="Estimate Part Price (USD)" value={formatCurrency(project.estimatePartPrice, 'USD')} />
              <DetailItem label="Project Value (USD)" value={formatCurrency(project.projectValue, 'USD')} />
              <DetailItem label="Material" value={orDash(project.material)} />
              <DetailItem label="Estimated Weight" value={orDash(project.estimatedWeight)} />
              <DetailItem label="Casting Process" value={orDash(project.castingProcess)} />
              <DetailItem
                label="Days in Current Stage"
                value={`${project.currentStageDays} ${project.currentStageDays === 1 ? 'day' : 'days'}`}
              />
              <DetailItem
                label="Machining Required"
                value={project.machiningRequired ? 'Yes' : 'No'}
              />
              <DetailItem label="Heat Treatment" value={project.heatTreatment ? 'Yes' : 'No'} />
              <DetailItem
                label="Painting Required"
                value={project.paintingRequired ? 'Yes' : 'No'}
              />
            </div>
            <div className="mt-5">
              <p className="label">Description</p>
              <p className="whitespace-pre-line text-sm text-slate-700">
                {orDash(project.projectDescription)}
              </p>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Part image</h2>
                <p className="mt-1 text-xs text-slate-500">Used as the project profile image and included in estimate PDFs.</p>
              </div>
              {canEdit && (
                <Button variant="secondary" loading={partImageBusy} onClick={() => partImageInput.current?.click()}>
                  <Upload className="h-4 w-4" /> {project.partImageFileName ? 'Replace image' : 'Upload image'}
                </Button>
              )}
            </div>
            <input
              ref={partImageInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPartImage(file);
                event.target.value = '';
              }}
            />
            <div className="mt-4 flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              {partImageUrl ? (
                <img src={partImageUrl} alt={`${project.projectName} part`} className="max-h-64 max-w-full object-contain" />
              ) : (
                <p className="text-sm text-slate-500">No part image uploaded yet.</p>
              )}
            </div>
            {project.partImageFileName && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="truncate">{project.partImageFileName}</span>
                {canEdit && (
                  <button type="button" onClick={removePartImage} className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Customer information</h2>
              <div className="space-y-4">
                <DetailItem label="Customer" value={orDash(project.customerName)} />
                <DetailItem label="Customer Number" value={orDash(project.customerNumber)} />
                <DetailItem label="Customer Contact" value={orDash(project.customerContact)} />
                <DetailItem
                  label="Customer Part Number"
                  value={orDash(project.customerPartNumber)}
                />
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Assignments</h2>
              <div className="space-y-4">
                <DetailItem label="Assigned Engineer" value={orDash(project.assignedEngineerName)} />
                <DetailItem
                  label="Assigned Salesperson"
                  value={orDash(project.assignedSalesName)}
                />
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Dates</h2>
              <div className="space-y-4">
                <DetailItem label="Target Quote Date" value={formatDate(project.targetQuoteDate)} />
                <DetailItem label="Created" value={formatDateTime(project.createdAt)} />
                <DetailItem label="Last Updated" value={formatDateTime(project.updatedAt)} />
              </div>
            </Card>
          </div>
        </div>
      )}

      <Suspense fallback={<Card><SkeletonRows rows={4} /></Card>}>
        {tab === 'tasks' && (
          <Card>
            <TasksPanel projectId={projectId} currentStage={project.currentStage} onChanged={load} />
          </Card>
        )}

        {tab === 'documents' && (
          <Card>
            <DocumentsPanel projectId={projectId} onChanged={load} />
          </Card>
        )}

        {tab === 'notes' && (
          <Card>
            <NotesPanel projectId={projectId} onChanged={load} />
          </Card>
        )}
      </Suspense>

      {tab === 'activity' && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Activity timeline</h2>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((record) => (
                <li key={record.id} className="flex items-start gap-3 py-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{record.action}</span>
                      {record.detail ? ` — ${record.detail}` : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      {record.userName ?? 'System'} · {formatDateTime(record.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {activeTab.placeholder && (
        <EmptyState title={activeTab.label} description={activeTab.placeholder} />
      )}
    </div>
  );
}
