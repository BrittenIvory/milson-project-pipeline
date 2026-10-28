import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, GripVertical, MessageSquare, Pin, PinOff } from 'lucide-react';
import { Badge } from './ui';
import { projectsApi } from '../lib/api';
import { PROJECT_STAGES } from '../lib/constants';
import { formatDate, formatDateTime, orDash, priorityMeta, stageMeta } from '../lib/format';
import type { Project } from '../types';
import PartLink from './PartLink';
import ProjectComments from './ProjectComments';

function PartImageCell({ project }: { project: Project }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (project.partImageFileName) {
      projectsApi.getPartImage(project.id).then((nextUrl) => {
        if (active) {
          objectUrl = nextUrl;
          setUrl(nextUrl);
        } else URL.revokeObjectURL(nextUrl);
      }).catch(() => {
        if (active) setUrl(null);
      });
    } else {
      setUrl(null);
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project.id, project.partImageFileName, project.partImageSizeBytes, project.updatedAt]);

  return url ? (
    <img src={url} alt={`${project.projectNumber} part`} className="h-12 w-16 rounded-md object-contain" />
  ) : (
    <span className="text-slate-400">—</span>
  );
}

export interface ProjectColumn {
  id: string;
  label: string;
  /** Replaces the text label in the column header (the Columns menu still shows `label`). */
  header?: React.ReactNode;
  /** Default width in pixels; users can resize from the header handle. */
  width: number;
  sortable?: boolean;
  render: (project: Project) => React.ReactNode;
}

/** Every column the Projects table can show, in default order. */
export const PROJECT_COLUMNS: ProjectColumn[] = [
  {
    id: 'comments',
    label: 'Comments',
    header: <MessageSquare className="h-4 w-4" aria-label="Comments" />,
    width: 60,
    sortable: false,
    render: (p) => (
      <ProjectComments
        projectId={p.id}
        projectNumber={p.projectNumber}
        projectName={p.projectName}
        partNumber={p.internalPartNumber ?? p.customerPartNumber}
      />
    ),
  },
  {
    id: 'projectNumber',
    label: 'Project Number',
    width: 150,
    render: (p) => (
      <Link to={`/projects/${p.id}`} className="font-medium text-brand-700 hover:underline">
        {p.projectNumber}
      </Link>
    ),
  },
  {
    id: 'partImage',
    label: 'Part Image',
    width: 100,
    render: (p) => <PartImageCell project={p} />,
  },
  { id: 'customerName', label: 'Customer', width: 200, render: (p) => orDash(p.customerName) },
  {
    id: 'customerPartNumber',
    label: 'Customer Part Number',
    width: 190,
    render: (p) => (
      <PartLink
        partNumber={p.customerPartNumber ? (p.internalPartNumber || p.customerPartNumber) : null}
      >
        {p.customerPartNumber ?? '—'}
      </PartLink>
    ),
  },
  {
    id: 'internalPartNumber',
    label: 'Internal Part Number',
    width: 190,
    render: (p) => <PartLink partNumber={p.internalPartNumber} />,
  },
  {
    id: 'projectName',
    label: 'Project Name',
    width: 240,
    render: (p) => (
      <Link to={`/projects/${p.id}`} className="text-slate-800 hover:underline">
        {p.projectName}
      </Link>
    ),
  },
  {
    id: 'currentStage',
    label: 'Current Stage',
    width: 190,
    render: (p) => <Badge tone={stageMeta(p.currentStage).tone}>{stageMeta(p.currentStage).label}</Badge>,
  },
  {
    id: 'daysInStage',
    label: 'Days in Stage',
    width: 120,
    render: (p) => `${p.currentStageDays} ${p.currentStageDays === 1 ? 'day' : 'days'}`,
  },
  {
    id: 'assignedEngineerName',
    label: 'Assigned Engineer',
    width: 170,
    render: (p) => orDash(p.assignedEngineerName),
  },
  {
    id: 'assignedSalesName',
    label: 'Assigned Salesperson',
    width: 180,
    render: (p) => orDash(p.assignedSalesName),
  },
  {
    id: 'priority',
    label: 'Priority',
    width: 120,
    render: (p) => <Badge tone={priorityMeta(p.priority).tone}>{priorityMeta(p.priority).label}</Badge>,
  },
  {
    id: 'projectType',
    label: 'Project Type',
    width: 160,
    render: (p) =>
      p.projectTypeName ? (
        <Badge tone="bg-indigo-100 text-indigo-700">{p.projectTypeName}</Badge>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    id: 'targetQuoteDate',
    label: 'Target Quote Date',
    width: 160,
    render: (p) => formatDate(p.targetQuoteDate),
  },
  { id: 'updatedAt', label: 'Last Updated', width: 180, render: (p) => formatDateTime(p.updatedAt) },
  {
    id: 'status',
    label: 'Status',
    width: 120,
    render: (p) =>
      p.isArchived ? (
        <Badge tone="bg-slate-100 text-slate-600">Archived</Badge>
      ) : (
        <Badge tone="bg-emerald-100 text-emerald-700">Active</Badge>
      ),
  },
];

export const DEFAULT_VISIBLE_COLUMNS = PROJECT_COLUMNS.map((column) => column.id);

export interface TableLayout {
  visible: string[];
  widths: Record<string, number>;
  pinned: string[];
}

interface ProjectTableProps {
  projects: Project[];
  layout: TableLayout;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (columnId: string) => void;
  onWidthChange: (columnId: string, width: number) => void;
  onTogglePin: (columnId: string) => void;
  /** Called when a header is dropped onto another column to reorder. */
  onReorderColumn: (draggedId: string, targetId: string) => void;
}

/**
 * Projects table with sortable, resizable and pinnable columns. Pinned columns
 * are rendered first and stick to the left edge while scrolling horizontally.
 */
export default function ProjectTable({
  projects,
  layout,
  sortBy,
  sortDir,
  onSort,
  onWidthChange,
  onTogglePin,
  onReorderColumn,
}: ProjectTableProps) {
  const dragState = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const startResize = useCallback(
    (event: React.MouseEvent, column: ProjectColumn) => {
      event.preventDefault();
      event.stopPropagation();
      dragState.current = {
        id: column.id,
        startX: event.clientX,
        startWidth: layout.widths[column.id] ?? column.width,
      };
      const move = (moveEvent: MouseEvent) => {
        const state = dragState.current;
        if (!state) return;
        onWidthChange(state.id, Math.max(56, state.startWidth + moveEvent.clientX - state.startX));
      };
      const up = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [layout.widths, onWidthChange],
  );

  // Column order follows the saved `visible` order (drag-reorder writes it back);
  // pinned columns always render first.
  const columns = layout.visible
    .map((id) => PROJECT_COLUMNS.find((column) => column.id === id))
    .filter((column): column is ProjectColumn => column !== undefined)
    .sort((a, b) => Number(layout.pinned.includes(b.id)) - Number(layout.pinned.includes(a.id)));

  // Pinned columns stick left; each one is offset by the widths before it.
  const offsets: Record<string, number> = {};
  let runningOffset = 0;
  for (const column of columns) {
    if (!layout.pinned.includes(column.id)) break;
    offsets[column.id] = runningOffset;
    runningOffset += layout.widths[column.id] ?? column.width;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            {columns.map((column) => {
              const pinned = layout.pinned.includes(column.id);
              return (
                <th
                  key={column.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', column.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverId(column.id);
                  }}
                  onDragLeave={() => setDragOverId((current) => (current === column.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = event.dataTransfer.getData('text/plain');
                    setDragOverId(null);
                    if (draggedId && draggedId !== column.id) onReorderColumn(draggedId, column.id);
                  }}
                  onDragEnd={() => setDragOverId(null)}
                  style={{
                    width: layout.widths[column.id] ?? column.width,
                    left: pinned ? offsets[column.id] : undefined,
                  }}
                  className={clsx(
                    'group relative select-none py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-grab active:cursor-grabbing',
                    column.header ? 'px-1' : 'px-3',
                    pinned && 'sticky z-10 bg-slate-50',
                    dragOverId === column.id && 'bg-brand-50 ring-2 ring-inset ring-brand-300',
                  )}
                  title={`Drag to reorder ${column.label}`}
                >
                  <div className="flex items-center gap-1.5">
                    {!column.header && (
                      <GripVertical className="h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                    {column.sortable === false ? (
                      column.header ?? <span className="truncate">{column.label}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSort(column.id)}
                        className="flex items-center gap-1 truncate hover:text-slate-800"
                        title={`Sort by ${column.label}`}
                      >
                        {column.header ?? <span className="truncate">{column.label}</span>}
                        {sortBy === column.id &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onTogglePin(column.id)}
                      title={pinned ? 'Unpin column' : 'Pin column'}
                      aria-label={pinned ? `Unpin ${column.label}` : `Pin ${column.label}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                  </div>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.label} column`}
                    title="Drag to resize column"
                    onMouseDown={(event) => startResize(event, column)}
                    className="absolute -right-px top-0 h-full w-2 cursor-col-resize border-r-2 border-slate-200 transition-colors hover:border-brand-400"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PROJECT_STAGES.flatMap((stage) => {
            const stageProjects = projects.filter((project) => project.currentStage === stage.value);
            if (stageProjects.length === 0) return [];
            return [
              <tr key={`stage-${stage.value}`} className="border-b border-slate-200 bg-slate-50">
                <td colSpan={columns.length} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {stage.label} <span className="font-normal text-slate-400">({stageProjects.length})</span>
                </td>
              </tr>,
              ...stageProjects.map((project) => (
                <tr key={project.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {columns.map((column) => {
                    const pinned = layout.pinned.includes(column.id);
                    return (
                      <td
                        key={column.id}
                        style={{
                          width: layout.widths[column.id] ?? column.width,
                          left: pinned ? offsets[column.id] : undefined,
                        }}
                        className={clsx(
                          'truncate px-3 py-2 text-slate-700',
                          pinned && 'sticky z-10 bg-white',
                        )}
                      >
                        {column.render(project)}
                      </td>
                    );
                  })}
                </tr>
              )),
            ];
          })}
          {projects.some((project) => !PROJECT_STAGES.some((stage) => stage.value === project.currentStage)) && (
            <>
              <tr className="border-b border-slate-200 bg-slate-50">
                <td colSpan={columns.length} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Other
                </td>
              </tr>
              {projects
                .filter((project) => !PROJECT_STAGES.some((stage) => stage.value === project.currentStage))
                .map((project) => (
                  <tr key={project.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {columns.map((column) => {
                      const pinned = layout.pinned.includes(column.id);
                      return (
                        <td
                          key={column.id}
                          style={{
                            width: layout.widths[column.id] ?? column.width,
                            left: pinned ? offsets[column.id] : undefined,
                          }}
                          className={clsx(
                            'truncate px-3 py-2 text-slate-700',
                            pinned && 'sticky z-10 bg-white',
                          )}
                        >
                          {column.render(project)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
