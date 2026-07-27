import axios, { AxiosError } from 'axios';
import type {
  ActivityRecord,
  Customer,
  Project,
  ProjectDocument,
  ProjectStats,
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
  activity: (id: number) =>
    http.get<ActivityRecord[]>(`/projects/${id}/activity`).then((r) => r.data),
};

export const documentsApi = {
  list: (projectId: number) =>
    http.get<ProjectDocument[]>(`/projects/${projectId}/documents`).then((r) => r.data),
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

export const searchApi = {
  query: (q: string) =>
    http
      .get<{ projects: Project[]; customers: Customer[] }>('/search', { params: { q } })
      .then((r) => r.data),
};
