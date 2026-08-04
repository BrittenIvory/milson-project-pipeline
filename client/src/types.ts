export type Role = 'administrator' | 'engineering' | 'sales' | 'production' | 'quality';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}

export interface Customer {
  id: number;
  companyName: string;
  customerNumber: string;
  primaryContact: string | null;
  secondaryContact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  country: string | null;
  state: string | null;
  notes: string | null;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  projectNumber: string;
  customerId: number;
  customerName: string | null;
  customerNumber: string | null;
  customerContact: string | null;
  customerPartNumber: string | null;
  internalPartNumber: string | null;
  projectName: string;
  projectDescription: string | null;
  annualUsage: number | null;
  material: string | null;
  estimatedWeight: number | null;
  castingProcess: string | null;
  machiningRequired: boolean;
  heatTreatment: boolean;
  paintingRequired: boolean;
  assignedEngineerId: number | null;
  assignedEngineerName: string | null;
  assignedSalesId: number | null;
  assignedSalesName: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  targetQuoteDate: string | null;
  notes: string | null;
  currentStage: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocument {
  id: number;
  projectId: number;
  fileName: string;
  extension: string | null;
  mimeType: string | null;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
}

export interface ActivityRecord {
  id: number;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  detail: string | null;
  createdAt: string;
}

export interface ProjectStats {
  totals: { projects: number; customers: number; documents: number };
  byStage: Record<string, number>;
}

export type TaskStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'not_applicable';

export interface ProjectTask {
  id: number;
  projectId: number;
  stage: string | null;
  commentCount: number;
  taskName: string;
  description: string | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTaskComment {
  id: number;
  taskId: number;
  authorId: number | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectNote {
  id: number;
  projectId: number;
  authorId: number | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  projectId: number | null;
  entityType: string | null;
  entityId: number | null;
  readAt: string | null;
  createdAt: string;
}

/** Aggregated payload behind the dashboard. */
export interface DashboardSummary extends ProjectStats {
  createdThisMonth: number;
  completedThisMonth: number;
  recent: Project[];
  recentlyUpdated: Project[];
  upcoming: Project[];
  waiting: Project[];
}

/** Filters accepted by the project list endpoint. */
export interface ProjectFilters {
  search?: string;
  stage?: string;
  customerId?: number | '';
  engineerId?: number | '';
  salesId?: number | '';
  priority?: string;
  material?: string;
  castingProcess?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  targetFrom?: string;
  targetTo?: string;
}

export interface ProjectPage {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
}
