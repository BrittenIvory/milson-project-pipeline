export type Role = 'administrator' | 'engineering' | 'sales' | 'production' | 'quality';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  /** True when a temporary password is set and the user must choose a new one. */
  mustChangePassword?: boolean;
  /** Resolved permission map (role defaults + admin overrides). */
  permissions?: Record<string, boolean>;
}

/** Administrator view of an account, including status fields. */
export interface ManagedUser extends User {
  isActive: boolean;
  mustChangePassword: boolean;
  /** Explicit permission overrides; absent keys fall back to the role default. */
  permissions: Record<string, boolean>;
  createdAt: string;
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
  customerMachinedPartNumber: string | null;
  customerPaintedPartNumber: string | null;
  customerUnpaintedPartNumber: string | null;
  projectName: string;
  projectDescription: string | null;
  annualUsage: number | null;
  customerQuotePrice: number | null;
  material: string | null;
  clientPartDescription: string | null;
  materialGrade: string | null;
  alternateMaterialAcceptable: boolean;
  estimatedWeight: number | null;
  estimatePartPrice: number | null;
  projectValue: number | null;
  projectValueCurrency: 'USD' | null;
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
  partImageFileName: string | null;
  partImageMimeType: string | null;
  partImageSizeBytes: number | null;
  currentStage: string;
  stageStartedAt: string;
  currentStageDays: number;
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
  startDate: string | null;
  completedDate: string | null;
  requestedDate: string | null;
  actualDate: string | null;
  customerQuotePrice: number | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: TaskStatus;
  addedByUser: boolean;
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
  replyToId: number | null;
  createdAt: string;
  updatedAt: string;
  reactions: NoteReaction[];
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierQuote {
  id: number;
  projectId: number;
  supplierId: number;
  supplierName: string;
  selected: boolean;
  quotedPrice: number | null;
  currency: string;
  quoteNotes: string | null;
  selectedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface NoteReaction {
  emoji: string;
  userIds: number[];
}

export interface ProjectNote {
  id: number;
  projectId: number;
  authorId: number | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  replyToId: number | null;
  replyToAuthorName: string | null;
  replyToPreview: string | null;
  reactions: NoteReaction[];
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
  archivedAt: string | null;
  createdAt: string;
  projectNumber: string | null;
  projectName: string | null;
  projectStage: string | null;
  internalPartNumber: string | null;
  hasPartImage: boolean;
  commentAuthorName: string | null;
  repliedToAuthorName: string | null;
  repliedToPreview: string | null;
  taskCommentTaskId: number | null;
}

export interface PartSummary {
  partNumber: string;
  internalPartNumber: string | null;
  customerPartNumbers: string[];
  customers: string[];
  projectCount: number;
  imageProjectId: number | null;
}

export interface PartDetail extends PartSummary {
  projects: Project[];
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
  clientPartDescription?: string;
  materialGrade?: string;
  alternateMaterialAcceptable?: boolean;
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
