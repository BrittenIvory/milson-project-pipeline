export type Role = 'administrator' | 'engineering' | 'sales' | 'production' | 'quality';

export const ROLES: Role[] = ['administrator', 'engineering', 'sales', 'production', 'quality'];

export const PROJECT_STAGES = [
  'intake',
  'stage_1_engineering',
  'production_team_quoting',
  'sales',
  'stage_2_production',
  'production',
  'qa',
  'completed',
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const STAGE_LABELS: Record<ProjectStage, string> = {
  intake: 'Project Intake',
  stage_1_engineering: 'Stage 1 Engineering',
  production_team_quoting: 'Production Team Quoting',
  sales: 'Sales',
  stage_2_production: 'Stage 2 Engineering',
  production: 'Tooling & Sampling',
  qa: 'Shipping & QA',
  completed: 'Completed',
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as ProjectStage] ?? stage;
}

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CUSTOMER_STATUSES = ['active', 'inactive', 'archived'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** Authenticated principal attached to every request by the auth middleware. */
export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  /** True when the user must set a new password before using the app. */
  mustChangePassword?: boolean;
  /** Resolved permission map (role defaults + per-user overrides). */
  permissions?: Record<string, boolean>;
}

export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'on_hold',
  'completed',
  'not_applicable',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
