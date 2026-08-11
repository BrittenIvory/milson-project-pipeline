import axios, { AxiosError } from 'axios';
import type {
  ActivityRecord,
  AppNotification,
  Customer,
  DashboardSummary,
  Project,
  ProjectDocument,
  ProjectFilters,
  ProjectNote,
  ProjectPage,
  ProjectStats,
  ProjectTask,
  ProjectTaskComment,
  Supplier,
  SupplierQuote,
  User,
} from '../types';

const TOKEN_KEY = 'milson.token';

/** Shared axios instance; the bearer token is injected per request. */
export const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Extracts a human readable message from an API error. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError?.response?.data?.error ?? fallback;
}

export const authApi = {
  login: (email: string, password: string) =>
    http.post<{ token: string; user: User }>('/auth/login', { email, password }).then((r) => r.data),
  me: () => http.get<{ user: User }>('/auth/me').then((r) => r.data.user),
};

export const usersApi = {
  list: (role?: string) =>
    http.get<User[]>('/users', { params: { role } }).then((r) => r.data),
};

export type SupplierPayload = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;

export const suppliersApi = {
  list: (includeInactive = false) =>
    http
      .get<Supplier[]>('/suppliers', { params: { includeInactive } })
      .then((r) => r.data),
  create: (payload: SupplierPayload) =>
    http.post<Supplier>('/suppliers', payload).then((r) => r.data),
  update: (id: number, payload: SupplierPayload) =>
    http.put<Supplier>(`/suppliers/${id}`, payload).then((r) => r.data),
};

export type CustomerPayload = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;

export const customersApi = {
  list: (params: { search?: string; status?: string } = {}) =>
    http.get<Customer[]>('/customers', { params }).then((r) => r.data),
  get: (id: number) => http.get<Customer>(`/customers/${id}`).then((r) => r.data),
  create: (payload: CustomerPayload) =>
    http.post<Customer>('/customers', payload).then((r) => r.data),
  update: (id: number, payload: CustomerPayload) =>
    http.put<Customer>(`/customers/${id}`, payload).then((r) => r.data),
  archive: (id: number) => http.post<Customer>(`/customers/${id}/archive`).then((r) => r.data),
  restore: (id: number) => http.post<Customer>(`/customers/${id}/restore`).then((r) => r.data),
};

export type ProjectPayload = Omit<
  Project,
  | 'id' | 'projectNumber' | 'customerName' | 'customerNumber' | 'assignedEngineerName'
  | 'assignedSalesName' | 'isArchived' | 'createdAt' | 'updatedAt'
>;

export const projectsApi = {
  list: (params: { search?: string; stage?: string; customerId?: number } = {}) =>
    http.get<Project[]>('/projects', { params }).then((r) => r.data),
  get: (id: number) => http.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (payload: ProjectPayload) =>
    http.post<Project>('/projects', payload).then((r) => r.data),
  update: (id: number, payload: ProjectPayload) =>
    http.put<Project>(`/projects/${id}`, payload).then((r) => r.data),
  nextNumber: () =>
    http.get<{ projectNumber: string }>('/projects/next-number').then((r) => r.data.projectNumber),
  stats: () => http.get<ProjectStats>('/projects/stats').then((r) => r.data),
  dashboard: () => http.get<DashboardSummary>('/projects/dashboard').then((r) => r.data),
  filterOptions: () =>
    http
      .get<{ materials: string[]; castingProcesses: string[] }>('/projects/filter-options')
      .then((r) => r.data),
  /** Paginated, sorted and filtered list used by the Projects table. */
  page: (params: ProjectFilters & {
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }) =>
    http
      .get<ProjectPage>('/projects', { params: { ...params, paginate: true } })
      .then((r) => r.data),
  activity: (id: number) =>
    http.get<ActivityRecord[]>(`/projects/${id}/activity`).then((r) => r.data),
};

export const documentsApi = {
  list: (projectId: number, search?: string) =>
    http
      .get<ProjectDocument[]>(`/projects/${projectId}/documents`, { params: { search } })
      .then((r) => r.data),
  rename: (projectId: number, documentId: number, fileName: string) =>
    http
      .patch<ProjectDocument>(`/projects/${projectId}/documents/${documentId}`, { fileName })
      .then((r) => r.data),
  /** Opens an inline preview in a new tab; the blob URL carries the auth-fetched bytes. */
  preview: async (projectId: number, doc: ProjectDocument) => {
    const response = await http.get(`/projects/${projectId}/documents/${doc.id}/preview`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  upload: (projectId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http
      .post<ProjectDocument>(`/projects/${projectId}/documents`, form)
      .then((r) => r.data);
  },
  remove: (projectId: number, documentId: number) =>
    http.delete(`/projects/${projectId}/documents/${documentId}`),
  /** Downloads through axios so the Authorization header is sent. */
  download: async (projectId: number, doc: ProjectDocument) => {
    const response = await http.get(`/projects/${projectId}/documents/${doc.id}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.fileName;
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const activityApi = {
  list: (limit = 25) =>
    http.get<ActivityRecord[]>('/activity', { params: { limit } }).then((r) => r.data),
};

export type TaskPayload = Pick<
  ProjectTask,
  'taskName' | 'description' | 'assignedUserId' | 'dueDate' | 'priority' | 'status'
>;

export const tasksApi = {
  list: (projectId: number) =>
    http.get<ProjectTask[]>(`/projects/${projectId}/tasks`).then((r) => r.data),
  create: (projectId: number, payload: TaskPayload) =>
    http.post<ProjectTask>(`/projects/${projectId}/tasks`, payload).then((r) => r.data),
  update: (projectId: number, taskId: number, payload: TaskPayload) =>
    http.put<ProjectTask>(`/projects/${projectId}/tasks/${taskId}`, payload).then((r) => r.data),
  remove: (projectId: number, taskId: number) =>
    http.delete(`/projects/${projectId}/tasks/${taskId}`),
};

export const taskCommentsApi = {
  list: (projectId: number, taskId: number) =>
    http
      .get<ProjectTaskComment[]>(`/projects/${projectId}/tasks/${taskId}/comments`)
      .then((r) => r.data),
  create: (projectId: number, taskId: number, body: string) =>
    http
      .post<ProjectTaskComment>(`/projects/${projectId}/tasks/${taskId}/comments`, { body })
      .then((r) => r.data),
  update: (projectId: number, taskId: number, commentId: number, body: string) =>
    http
      .put<ProjectTaskComment>(
        `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
        { body },
      )
      .then((r) => r.data),
  remove: (projectId: number, taskId: number, commentId: number) =>
    http.delete(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`),
};

export type SupplierQuotePayload = Pick<
  SupplierQuote,
  'selected' | 'quotedPrice' | 'currency' | 'quoteNotes'
>;

export const supplierQuotesApi = {
  list: (projectId: number) =>
    http
      .get<SupplierQuote[]>(`/projects/${projectId}/supplier-quotes`)
      .then((r) => r.data),
  upsert: (projectId: number, supplierId: number, payload: SupplierQuotePayload) =>
    http
      .put<SupplierQuote>(`/projects/${projectId}/supplier-quotes/${supplierId}`, payload)
      .then((r) => r.data),
  remove: (projectId: number, supplierId: number) =>
    http.delete(`/projects/${projectId}/supplier-quotes/${supplierId}`),
};

export const notesApi = {
  list: (projectId: number) =>
    http.get<ProjectNote[]>(`/projects/${projectId}/notes`).then((r) => r.data),
  create: (projectId: number, body: string) =>
    http.post<ProjectNote>(`/projects/${projectId}/notes`, { body }).then((r) => r.data),
  update: (projectId: number, noteId: number, body: string) =>
    http.put<ProjectNote>(`/projects/${projectId}/notes/${noteId}`, { body }).then((r) => r.data),
  remove: (projectId: number, noteId: number) =>
    http.delete(`/projects/${projectId}/notes/${noteId}`),
};

export const notificationsApi = {
  list: () =>
    http
      .get<{ items: AppNotification[]; unread: number }>('/notifications')
      .then((r) => r.data),
  markRead: (id: number) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post('/notifications/read-all'),
};

export const searchApi = {
  query: (q: string) =>
    http
      .get<{ projects: Project[]; customers: Customer[] }>('/search', { params: { q } })
      .then((r) => r.data),
};
