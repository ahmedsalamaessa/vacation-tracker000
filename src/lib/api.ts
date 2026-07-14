import { Employee } from './types';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const sessionId = localStorage.getItem('vsys_session_id');
  const headers = new Headers(options.headers);
  if (sessionId) {
    headers.set('X-Session-Id', sessionId);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('vsys_session_id');
    window.location.reload();
    throw new Error('unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API request failed');
  }

  return res.json();
}

export const api = {
  async login(username: string, password: string) {
    const res = await request<{ user: Employee; sessionId: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem('vsys_session_id', res.sessionId);
    return res;
  },

  async bootstrap() {
    return request('/bootstrap');
  },

  async getEmployees() {
    return request('/employees');
  },

  async addEmployee(employee: any) {
    return request('/employees', {
      method: 'POST',
      body: JSON.stringify(employee),
    });
  },

  async updateEmployee(id: number, updates: any) {
    return request(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteEmployee(id: number) {
    return request(`/employees/${id}`, {
      method: 'DELETE',
    });
  },

  async getLocations() {
    return request('/locations');
  },

  async addLocation(location: any) {
    return request('/locations', {
      method: 'POST',
      body: JSON.stringify(location),
    });
  },

  async updateLocation(id: number, updates: any) {
    return request(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteLocation(id: number) {
    return request(`/locations/${id}`, {
      method: 'DELETE',
    });
  },

  async getAttendance() {
    return request('/attendance');
  },

  async upsertAttendance(record: any) {
    return request('/attendance', {
      method: 'POST',
      body: JSON.stringify(record),
    });
  },

  async deleteAttendance(employeeId: number, date: string) {
    return request(`/attendance?employeeId=${employeeId}&date=${date}`, {
      method: 'DELETE',
    });
  },

  async getVacations() {
    return request('/vacations');
  },

  async addVacation(vacation: any) {
    return request('/vacations', {
      method: 'POST',
      body: JSON.stringify(vacation),
    });
  },

  async updateVacation(id: number, updates: any) {
    return request(`/vacations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteVacation(id: number) {
    return request(`/vacations/${id}`, {
      method: 'DELETE',
    });
  },

  async syncVacationAttendance(vacationId: number) {
    return request('/vacations/sync-attendance', {
      method: 'POST',
      body: JSON.stringify({ vacationId }),
    });
  },

  async clearVacationAttendance(vacationId: number) {
    return request('/vacations/clear-attendance', {
      method: 'POST',
      body: JSON.stringify({ vacationId }),
    });
  },

  async addAuditLog(log: any) {
    return request('/audit-logs', {
      method: 'POST',
      body: JSON.stringify(log),
    });
  },

  async addNotification(notification: any) {
    return request('/notifications', {
      method: 'POST',
      body: JSON.stringify(notification),
    });
  },

  async updateSettings(settings: any) {
    return request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async lockMonth(lock: any) {
    return request('/month-locks', {
      method: 'POST',
      body: JSON.stringify(lock),
    });
  },

  async unlockMonth(yearMonth: string) {
    return request(`/month-locks/${encodeURIComponent(yearMonth)}`, {
      method: 'DELETE',
    });
  },
};

export async function probeRemote(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export function remoteAvailable(): boolean {
  return true;
}
