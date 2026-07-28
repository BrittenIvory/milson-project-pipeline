import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Pencil } from 'lucide-react';
import DocumentsPanel from '../components/DocumentsPanel';
import ProjectForm, { projectToPayload } from '../components/ProjectForm';
import { Badge, Button, Card, ErrorBanner, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, projectsApi } from '../lib/api';
import type { ProjectPayload } from '../lib/api';
import { formatDate, formatDateTime, orDash, priorityMeta, stageMeta } from '../lib/format';
import type { ActivityRecord, Project } from '../types';

type Tab = 'summary' | 'documents' | 'activity' | 'notes';

const tabs: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' },
];

/** Single row inside the summary detail grid. */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}

/** Project workspace with Summary / Documents / Activity / Notes tabs. */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { canEdit } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [tab, setTab] = useState<Tab>('summary');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProjectPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {project.projectNumber} ·{' '}
            <Link to="/customers" className="hover:underline">
              {project.customerName}
            </Link>
          </p>
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={startEditing}>
            <Pencil className="h-4 w-4" /> Edit project
          </Button>
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
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Project details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Project Number" value={project.projectNumber} />
              <DetailItem label="Customer" value={orDash(project.customerName)} />
              <DetailItem label="Customer Contact" value={orDash(project.customerContact)} />
              <DetailItem label="Customer Part Number" value={orDash(project.customerPartNumber)} />
              <DetailItem label="Internal Part Number" value={orDash(project.internalPartNumber)} />
              <DetailItem label="Annual Usage" value={orDash(project.annualUsage)} />
              <DetailItem label="Material" value={orDash(project.material)} />
              <DetailItem label="Estimated Weight" value={orDash(project.estimatedWeight)} />
              <DetailItem label="Casting Process" value={orDash(project.castingProcess)} />
              <DetailItem label="Machining Required" value={project.machiningRequired ? 'Yes' : 'No'} />
              <DetailItem label="Heat Treatment" value={project.heatTreatment ? 'Yes' : 'No'} />
              <DetailItem label="Painting Required" value={project.paintingRequired ? 'Yes' : 'No'} />
            </div>
            <div className="mt-5">
              <p className="label">Description</p>
              <p className="whitespace-pre-line text-sm text-slate-700">
                {orDash(project.projectDescription)}
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Ownership</h2>
            <div className="space-y-4">
              <DetailItem label="Assigned Engineer" value={orDash(project.assignedEngineerName)} />
              <DetailItem label="Assigned Salesperson" value={orDash(project.assignedSalesName)} />
              <DetailItem label="Target Quote Date" value={formatDate(project.targetQuoteDate)} />
              <DetailItem label="Created" value={formatDateTime(project.createdAt)} />
              <DetailItem label="Last Updated" value={formatDateTime(project.updatedAt)} />
            </div>
          </Card>
        </div>
      )}

      {tab === 'documents' && (
        <Card>
          <DocumentsPanel projectId={projectId} onChanged={load} />
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Activity</h2>
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

      {tab === 'notes' && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Notes</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{orDash(project.notes)}</p>
          {canEdit && (
            <Button variant="secondary" className="mt-4" onClick={startEditing}>
              <Pencil className="h-4 w-4" /> Edit notes
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
