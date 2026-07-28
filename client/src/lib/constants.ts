import type { Role } from '../types';

/** Ordered pipeline stages with display labels and badge colours. */
export const PROJECT_STAGES = [
  { value: 'intake', label: 'Intake', tone: 'bg-slate-100 text-slate-700' },
  { value: 'stage_1_engineering', label: 'Stage 1 Engineering', tone: 'bg-indigo-100 text-indigo-700' },
  { value: 'production_team_quoting', label: 'Production Team Quoting', tone: 'bg-amber-100 text-amber-700' },
  { value: 'sales', label: 'Sales', tone: 'bg-sky-100 text-sky-700' },
  { value: 'stage_2_production', label: 'Stage 2 Production', tone: 'bg-violet-100 text-violet-700' },
  { value: 'production', label: 'Production', tone: 'bg-orange-100 text-orange-700' },
  { value: 'qa', label: 'QA', tone: 'bg-teal-100 text-teal-700' },
  { value: 'completed', label: 'Completed', tone: 'bg-emerald-100 text-emerald-700' },
] as const;

export const PRIORITIES = [
  { value: 'low', label: 'Low', tone: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', tone: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', tone: 'bg-amber-100 text-amber-700' },
  { value: 'critical', label: 'Critical', tone: 'bg-rose-100 text-rose-700' },
] as const;

export const CUSTOMER_STATUSES = [
  { value: 'active', label: 'Active', tone: 'bg-emerald-100 text-emerald-700' },
  { value: 'inactive', label: 'Inactive', tone: 'bg-slate-100 text-slate-600' },
  { value: 'archived', label: 'Archived', tone: 'bg-rose-100 text-rose-700' },
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  administrator: 'Administrator',
  engineering: 'Engineering',
  sales: 'Sales',
  production: 'Production',
  quality: 'Quality',
};

/** File extensions the document module accepts. */
export const ACCEPTED_FILE_EXTENSIONS = [
  '.pdf', '.dwg', '.dxf', '.step', '.stp', '.sldprt', '.sldasm',
  '.x_t', '.x_b', '.iges', '.igs', '.zip', '.png', '.jpg', '.jpeg', '.docx', '.xlsx',
];

/** Roles permitted to create/edit projects and customers. */
export const EDITOR_ROLES: Role[] = ['administrator', 'engineering', 'sales', 'production'];
