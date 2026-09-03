import { Employee } from './types';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const sessionId = localStorage.getItem('vsys_session_id');
  const headers = new Headers(options.headers);
  if (sessionId) {
    headers.set('X-Session-Id', sessionId);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // ⏱️ مهلة أمان: لو الخدمة واقفة أو قاعدة البيانات بتبرد (Neon cold start)
  // مبيستناش للزمн الميت ونطلّع رسالة واضحة بدل «بيانات غير صحيحة» بالغلط.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      throw new Error('NETWORK_TIMEOUT');
    }
    throw e;
  }
  clearTimeout(timer);
  if (res.status === 401) {
    localStorage.removeItem('vsys_session_id');
    throw new Error('unauthorized');
  }
  if (res.status === 429) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'too_many_attempts');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = String(err.message || '');
    if (err.error === 'server_error' || res.status === 402 || res.status >= 500 || msg.includes('quota')) {
      throw new Error('SERVICE_DOWN');
    }
    const e: any = new Error(err.error || 'API request failed');
    e.serverMessage = err.message || null;
    throw e;
  }
  return res.json();
}

export const api = {
  async login(username: string, password: string) {
    // مهلة أطول للوجين عشان أول برودة لقاعدة البيانات (Neon cold start) تعمل
    const res = await request<{ user: Employee; sessionId: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, 45000);
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
  // 🆕 إصلاح رقم 1: إضافة الدالة الناقصة
  async addAttempt(attempt: any) {
    return request('/check-in-attempts', {
      method: 'POST',
      body: JSON.stringify(attempt),
    });
  },
  // 🧹 حذف بصمات أقدم من X يوم (failedOnly = المرفوضة بس)
  async deleteAttemptsOlderThan(days: number, failedOnly = false) {
    const qs = `?days=${days}${failedOnly ? '&failedOnly=1' : ''}`;
    return request<{ ok: boolean; deleted: number }>(`/check-in-attempts${qs}`, { method: 'DELETE' });
  },
  // 🧰 استلام وتسليم العدة
  async getEquipment() {
    return request('/equipment');
  },
  async addEquipment(equipment: any) {
    return request('/equipment', { method: 'POST', body: JSON.stringify(equipment) });
  },
  async updateEquipment(id: number, updates: any) {
    return request(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },
  async deleteEquipment(id: number) {
    return request(`/equipment/${id}`, { method: 'DELETE' });
  },
  async getEquipmentCheckouts() {
    return request('/equipment-checkouts');
  },
  async checkoutEquipment(payload: any) {
    return request('/equipment-checkouts', { method: 'POST', body: JSON.stringify(payload) });
  },
  async returnEquipmentCheckout(payload: { id: number; conditionReturn: string; notes?: string }) {
    return request('/equipment-checkouts/return', { method: 'POST', body: JSON.stringify(payload) });
  },
  async decideEquipmentReturn(payload: { id: number; approve: boolean; condition?: string }) {
    return request('/equipment-checkouts/return-decide', { method: 'POST', body: JSON.stringify(payload) });
  },
  // 🛡️ النسخ الاحتياطية
  async createBackup(): Promise<{ ok: boolean; skipped?: boolean; bytes?: number }> {
    return request('/backup', { method: 'POST' });
  },
  async listBackups() {
    return request<{ id: number; day: string; bytes: number; created_at: string }[]>('/backup');
  },
  // 🔋 بصمة نسخة الداتا (خفيفة جدًا)
  async getVersion(): Promise<string | null> {
    try {
      const r = await request<{ v?: string }>('/version');
      return (r as any)?.v ?? null;
    } catch {
      return null;
    }
  },
  // 🚜 المعدات الثقيلة
  async getMachinery() {
    return request('/machinery');
  },
  async addMachinery(payload: any) {
    return request('/machinery', { method: 'POST', body: JSON.stringify(payload) });
  },
  async updateMachinery(id: number, payload: any) {
    return request(`/machinery/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  async deleteMachinery(id: number) {
    return request(`/machinery/${id}`, { method: 'DELETE' });
  },
  async deleteAllMachinery() {
    return request('/machinery-all', { method: 'DELETE' });
  },
  async getMachineryHours() {
    return request('/machinery-hours');
  },
  async saveMachineryHours(payload: { date: string; entries: { machineryId: number; hours: number }[] }) {
    return request('/machinery-hours/bulk', { method: 'POST', body: JSON.stringify(payload) });
  },
  // 🌙 طلبات السهر
  async getOvertimeRequests() {
    return request('/overtime-requests');
  },
  async submitOvertimeRequest(payload: { employeeId?: number; date: string; notes?: string | null }) {
    return request('/overtime-requests', { method: 'POST', body: JSON.stringify(payload) });
  },
  async decideOvertimeRequest(id: number, approve: boolean) {
    return request(`/overtime-requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ approve }) });
  },
  // 🔧 سجل الصيانة
  async getEquipmentMaintenance() {
    return request('/equipment-maintenance');
  },
  async addEquipmentMaintenance(payload: any) {
    return request('/equipment-maintenance', { method: 'POST', body: JSON.stringify(payload) });
  },
  async deleteEquipmentMaintenance(id: number) {
    return request(`/equipment-maintenance/${id}`, { method: 'DELETE' });
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
