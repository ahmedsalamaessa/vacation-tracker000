import { Employee } from './types';
import { getEmployees } from './db';

export function getManagedEmployees(user: Employee): Employee[] {
  if (user.role === 'admin') {
    return getEmployees().filter(e => e.active);
  }
  if (user.role === 'manager') {
    const userLocs = user.locationIds || [];
    return getEmployees().filter(e => 
      e.active && 
      (e.id === user.id || (e.locationIds && e.locationIds.some(id => userLocs.includes(id))))
    );
  }
  return [user]; // Regular employees only see themselves
}
