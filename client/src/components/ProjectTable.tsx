import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Pin, PinOff } from 'lucide-react';
import { Badge } from './ui';
import { formatDate, formatDateTime, orDash, priorityMeta, stageMeta } from '../lib/format';
import type { Project } from '../types';

export interface ProjectColumn {
  id: string;
  label: string;
  /** Default width in pixels; users can resize from the header handle. */
  width: number;
  render: (project: Project) => React.ReactNode;
}

/** Every column the Projects table can show, in default order. */
export const PROJECT_COLUMNS: ProjectColumn[] = [
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
  { id: 'customerName', label: 'Customer', width: 200, render: (p) => orDash(p.customerName) },
  {
    id: 'customerPartNumber',
    label: 'Customer Part Number',
    width: 190,
    render: (p) => orDash(p.customerPartNumber),
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
}: ProjectTableProps) {
  const dragState = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

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
        onWidthChange(state.id, Math.max(90, state.startWidth + moveEvent.clientX - state.startX));
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

  const columns = PROJECT_COLUMNS.filter((column) => layout.visible.includes(column.id)).sort(
    (a, b) => Number(layout.pinned.includes(b.id)) - Number(layout.pinned.includes(a.id)),
  );

  // Pinned columns stick left; each one is offset by the widths before it.
  const offsets: Record<string, number> = {};
  let runningOffset = 0;
  for (const column of columns) {
    if (!layout.pinned.includes(column.id)) break;
    offsets[column.id] = runningOffset;
    runningOffset += layout.widths[column.id] ?? column.width;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            {columns.map((column) => {
              const pinned = layout.pinned.includes(column.id);
              return (
                <th
                  key={column.id}
                  style={{
                    width: layout.widths[column.id] ?? column.width,
                    left: pinned ? offsets[column.id] : undefined,
                  }}
                  className={clsx(
                    'group relative select-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500',
                    pinned && 'sticky z-10 bg-slate-50',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSort(column.id)}
                      className="flex items-center gap-1 truncate hover:text-slate-800"
                      title={`Sort by ${column.label}`}
                    >
                      <span className="truncate">{column.label}</span>
                      {sortBy === column.id &&
                        (sortDir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </button>
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
                    onMouseDown={(event) => startResize(event, column)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand-300"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
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
                      'truncate px-4 py-3 text-slate-700',
                      pinned && 'sticky z-10 bg-white',
                    )}
                  >
                    {column.render(project)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
