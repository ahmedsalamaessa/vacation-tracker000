// @ts-nocheck
import type { Employee } from './types';
import { getEmployees } from './db';

export function getManagedEmployees(user: Employee): Employee[] {
  const all = getEmployees().filter(e => e.active);
  if (user.role === 'admin') return all;
  if (user.role === 'manager') {
    if (!user.locationIds || user.locationIds.length === 0) return all.filter(e => e.role !== 'admin');
    return all.filter(emp => {
      if (emp.role === 'admin') return false;
      if (emp.id === user.id) return true;
      if (emp.managerId === user.id) return true;
      if (!emp.locationIds || emp.locationIds.length === 0) return false;
      return emp.locationIds.some(locId => user.locationIds.includes(locId));
    });
  }
  return all.filter(e => e.id === user.id);
}

export function canViewEmployee(user: Employee, target: Employee): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'manager') {
    if (target.role === 'admin') return false;
    if (target.id === user.id) return true;
    if (target.managerId === user.id) return true;
    if (!user.locationIds || user.locationIds.length === 0) return target.role !== 'admin';
    if (!target.locationIds || target.locationIds.length === 0) return false;
    return target.locationIds.some(id => user.locationIds.includes(id));
  }
  return user.id === target.id;
}

export function filterByUser<T extends { employeeId: number }>(items: T[], user: Employee): T[] {
  if (user.role === 'admin') return items;
  if (user.role === 'manager') {
    const managedIds = new Set(getManagedEmployees(user).map(e => e.id));
    return items.filter(i => managedIds.has(i.employeeId));
  }
  return items.filter(i => i.employeeId === user.id);
}
