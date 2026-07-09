/**
 * Remote API client (Neon via Vercel /api)
 * Falls back to localStorage when API is unavailable.
 */

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

export function isRemoteMode(): boolean {
  // remote by default in production; can force with VITE_USE_REMOTE=true
  const forced = (import.meta as any).env?.VITE_USE_REMOTE;
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  return true; // prefer remote when API is deployed
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),
  login: (username: string, password: string) =>
    request<{ user: any }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  bootstrap: () => request<any>('/bootstrap'),

  getEmployees: () => request<any[]>('/employees'),
  addEmployee: (data: any) =>
    request<any>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: any) =>
    request<any>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id: number) =>
    request<any>(`/employees/${id}`, { method: 'DELETE' }),

  getLocations: () => request<any[]>('/locations'),
  addLocation: (data: any) =>
    request<any>('/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id: number, data: any) =>
    request<any>(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLocation: (id: number) =>
    request<any>(`/locations/${id}`, { method: 'DELETE' }),

  getAttendance: () => request<any[]>('/attendance'),
  upsertAttendance: (data: any) =>
    request<any>('/attendance', { method: 'POST', body: JSON.stringify(data) }),
  deleteAttendance: (employeeId: number, date: string) =>
    request<any>(`/attendance?employeeId=${employeeId}&date=${encodeURIComponent(date)}`, {
      method: 'DELETE',
    }),

  getVacations: () => request<any[]>('/vacations'),
  addVacation: (data: any) =>
    request<any>('/vacations', { method: 'POST', body: JSON.stringify(data) }),
  updateVacation: (id: number, data: any) =>
    request<any>(`/vacations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVacation: (id: number) =>
    request<any>(`/vacations/${id}`, { method: 'DELETE' }),
  syncVacationAttendance: (vacationId: number) =>
    request<any>('/vacations/sync-attendance', {
      method: 'POST',
      body: JSON.stringify({ vacationId }),
    }),
  clearVacationAttendance: (vacationId: number) =>
    request<any>('/vacations/clear-attendance', {
      method: 'POST',
      body: JSON.stringify({ vacationId }),
    }),

  getAttempts: () => request<any[]>('/check-in-attempts'),
  addAttempt: (data: any) =>
    request<any>('/check-in-attempts', { method: 'POST', body: JSON.stringify(data) }),

  getAuditLogs: () => request<any[]>('/audit-logs'),
  addAuditLog: (data: any) =>
    request<any>('/audit-logs', { method: 'POST', body: JSON.stringify(data) }),

  getNotifications: (userId?: number) =>
    request<any[]>(`/notifications${userId ? `?userId=${userId}` : ''}`),
  addNotification: (data: any) =>
    request<any>('/notifications', { method: 'POST', body: JSON.stringify(data) }),

  getSettings: () => request<Record<string, string>>('/settings'),
  updateSettings: (data: Record<string, string>) =>
    request<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  getMonthLocks: () => request<any[]>('/month-locks'),
  lockMonth: (data: any) =>
    request<any>('/month-locks', { method: 'POST', body: JSON.stringify(data) }),
  unlockMonth: (yearMonth: string) =>
    request<any>(`/month-locks/${encodeURIComponent(yearMonth)}`, { method: 'DELETE' }),
};

let _remoteAvailable: boolean | null = null;

export async function probeRemote(): Promise<boolean> {
  if (!isRemoteMode()) {
    _remoteAvailable = false;
    return false;
  }
  try {
    await api.health();
    _remoteAvailable = true;
  } catch {
    _remoteAvailable = false;
  }
  return _remoteAvailable;
}

export function remoteAvailable() {
  return _remoteAvailable === true;
}
