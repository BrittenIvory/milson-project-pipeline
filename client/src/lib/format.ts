import {
  CLOSED_TASK_STATUSES,
  CUSTOMER_STATUSES,
  PRIORITIES,
  PROJECT_STAGES,
  TASK_STATUSES,
} from './constants';

/** Formats an ISO timestamp as a short local date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/** Formats an ISO timestamp as `MMM dd, yyyy, HH:mm`. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human readable file size. */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/** Renders `—` for empty values so tables stay aligned. */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export const stageMeta = (value: string) =>
  PROJECT_STAGES.find((s) => s.value === value) ?? {
    value,
    label: value,
    tone: 'bg-slate-100 text-slate-700',
  };

export const priorityMeta = (value: string) =>
  PRIORITIES.find((p) => p.value === value) ?? {
    value,
    label: value,
    tone: 'bg-slate-100 text-slate-600',
  };

export const customerStatusMeta = (value: string) =>
  CUSTOMER_STATUSES.find((s) => s.value === value) ?? {
    value,
    label: value,
    tone: 'bg-slate-100 text-slate-600',
  };

export const taskStatusMeta = (value: string) =>
  TASK_STATUSES.find((s) => s.value === value) ?? {
    value,
    label: value,
    tone: 'bg-slate-100 text-slate-600',
  };

/** True when an open task's due date is in the past. */
export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || CLOSED_TASK_STATUSES.includes(status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}
