import type { Role } from '../types';

export type TabKey =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'production'
  | 'orders'
  | 'customers'
  | 'suppliers'
  | 'expenses'
  | 'hr'
  | 'payroll'
  | 'accounting'
  | 'reports'
  | 'settings'
  | 'sales'
  | 'closing'
  | 'sales-returns'
  | 'packaging';

export const PERMISSIONS: Record<Role, { tabs: TabKey[]; dashboardWidgets: string[] }> = {
  ADMIN: {
    tabs: ['dashboard', 'pos', 'sales', 'closing', 'inventory', 'production', 'orders', 'customers', 'suppliers', 'expenses', 'hr', 'payroll', 'accounting', 'reports', 'settings', 'packaging', 'sales-returns'],
    dashboardWidgets: ['all']
  },
  MANAGER: {
    tabs: ['pos', 'inventory', 'production', 'settings'],
    dashboardWidgets: []
  },
  PRODUCTION_MANAGER: {
    tabs: ['dashboard', 'inventory', 'production', 'orders', 'suppliers'],
    dashboardWidgets: ['production', 'inventory', 'stock_alerts', 'raw_materials']
  },
  CASHIER: {
    tabs: ['pos', 'orders', 'customers', 'sales-returns'],
    dashboardWidgets: []
  },
  STAFF: {
    tabs: [],
    dashboardWidgets: []
  }
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  PRODUCTION_MANAGER: 'Production Manager',
  CASHIER: 'Cashier',
  STAFF: 'Staff'
};

export const ROLE_HOME: Record<Role, string> = {
  ADMIN: '/dashboard',
  MANAGER: '/pos',
  PRODUCTION_MANAGER: '/production',
  CASHIER: '/pos',
  STAFF: '/unauthorized'
};

export const canAccessTab = (role: Role | undefined, tab: TabKey) => Boolean(role && PERMISSIONS[role]?.tabs.includes(tab));
