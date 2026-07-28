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
}

export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
