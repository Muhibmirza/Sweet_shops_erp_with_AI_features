import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { ToastHost } from './components/ToastHost';
import { useAuthStore } from './store/auth';
import { api, unwrap } from './api/client';
import type { User } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import Purchases from './pages/Purchases';
import Expenses from './pages/Expenses';
import Staff from './pages/Staff';
import Reports from './pages/Reports';
import ProductSalesReport from './pages/ProductSalesReport';
import Settings from './pages/Settings';
import Backup from './pages/settings/Backup';
import AccountingDashboard from './pages/accounting/AccountingDashboard';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import JournalEntries from './pages/accounting/JournalEntries';
import ProductionHub from './pages/production/ProductionHub';
import LeaveManagement from './pages/hr/LeaveManagement';
import EmployeeAdvances from './pages/hr/EmployeeAdvances';
import EmployeeDetail from './pages/hr/EmployeeDetail';
import SalaryPage from './pages/hr/Salary';
import CustomerProfile from './pages/customers/CustomerProfile';
import SalesReturn from './pages/SalesReturn';
import SalesHistory from './pages/sales/SalesHistory';
import DailyClosing from './pages/DailyClosing';
import Unauthorized from './pages/Unauthorized';
import { ROLE_HOME } from './config/permissions';
import RawMaterials from './pages/inventory/RawMaterials';
import './index.css';
import { queryClient } from './queryClient';

function RoleHome() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />;
}

function Protected() {
  const token = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);
  const authCheck = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => unwrap<User>(api.get('/api/auth/me')),
    enabled: Boolean(token),
    retry: 3,
    refetchInterval: (query) => query.state.status === 'error' ? 3000 : false
  });

  React.useEffect(() => {
    if (authCheck.data) setUser(authCheck.data);
  }, [authCheck.data, setUser]);

  React.useEffect(() => {
    const status = (authCheck.error as any)?.response?.status;
    if (status === 401 || status === 403) logout();
  }, [authCheck.isError, logout]);

  if (!token) return <Navigate to="/login" replace />;
  if (authCheck.isError) {
    const status = (authCheck.error as any)?.response?.status;
    if (status === 401 || status === 403) return <Navigate to="/login" replace />;
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="rounded-lg border border-white/15 bg-white/10 px-5 py-4 text-sm shadow-xl backdrop-blur">
          Reconnecting to Eastern Sweets server...
        </div>
      </main>
    );
  }
  if (authCheck.isLoading || authCheck.isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="rounded-lg border border-white/15 bg-white/10 px-5 py-4 text-sm shadow-xl backdrop-blur">
          Verifying login...
        </div>
      </main>
    );
  }
  return <Layout />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected />}>
              <Route path="/" element={<RoleHome />} />
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER']}><Dashboard /></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'CASHIER']}><POS /></ProtectedRoute>} />
              <Route path="/sales" element={<ProtectedRoute allowedRoles={['ADMIN']}><SalesHistory /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER']}><Inventory /></ProtectedRoute>} />
              <Route path="/raw-materials" element={<ProtectedRoute allowedRoles={['ADMIN', 'PRODUCTION_MANAGER']}><RawMaterials /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute allowedRoles={['ADMIN', 'PRODUCTION_MANAGER', 'CASHIER']}><Orders /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}><Customers /></ProtectedRoute>} />
              <Route path="/customers/:id" element={<ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}><CustomerProfile /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute allowedRoles={['ADMIN', 'PRODUCTION_MANAGER']}><Suppliers /></ProtectedRoute>} />
              <Route path="/suppliers/:id" element={<ProtectedRoute allowedRoles={['ADMIN', 'PRODUCTION_MANAGER']}><SupplierDetail /></ProtectedRoute>} />
              <Route path="/purchases" element={<ProtectedRoute allowedRoles={['ADMIN']}><Purchases /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute allowedRoles={['ADMIN']}><Expenses /></ProtectedRoute>} />
              <Route path="/staff" element={<ProtectedRoute allowedRoles={['ADMIN']}><Staff /></ProtectedRoute>} />
              <Route path="/hr/employees/:id" element={<ProtectedRoute allowedRoles={['ADMIN']}><EmployeeDetail /></ProtectedRoute>} />
              <Route path="/production" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER']}><ProductionHub /></ProtectedRoute>} />
              <Route path="/accounting" element={<ProtectedRoute allowedRoles={['ADMIN']}><AccountingDashboard /></ProtectedRoute>} />
              <Route path="/accounting/chart-of-accounts" element={<ProtectedRoute allowedRoles={['ADMIN']}><ChartOfAccounts /></ProtectedRoute>} />
              <Route path="/accounting/journal-entries" element={<ProtectedRoute allowedRoles={['ADMIN']}><JournalEntries /></ProtectedRoute>} />
              <Route path="/leave" element={<ProtectedRoute allowedRoles={['ADMIN']}><LeaveManagement /></ProtectedRoute>} />
              <Route path="/advances" element={<ProtectedRoute allowedRoles={['ADMIN']}><EmployeeAdvances /></ProtectedRoute>} />
              <Route path="/salary" element={<ProtectedRoute allowedRoles={['ADMIN']}><SalaryPage /></ProtectedRoute>} />
              <Route path="/sales-return" element={<ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}><SalesReturn /></ProtectedRoute>} />
              <Route path="/daily-closing" element={<ProtectedRoute allowedRoles={['ADMIN']}><DailyClosing /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute allowedRoles={['ADMIN']}><Reports /></ProtectedRoute>} />
              <Route path="/reports/product-sales" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProductSalesReport /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Settings /></ProtectedRoute>} />
              <Route path="/settings/backup" element={<ProtectedRoute allowedRoles={['ADMIN']}><Backup /></ProtectedRoute>} />
              <Route path="/unauthorized" element={<Unauthorized />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <ToastHost />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
