import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, DownloadCloud, Edit, Package, Trash2, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../api/client';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { ROLE_LABELS } from '../config/permissions';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import type { Category, Role, User } from '../types';
import { canEditDelete } from '../utils/permissions';
import PackagingTypes from './settings/PackagingTypes';

const roleBadgeClasses: Record<Role, string> = {
  ADMIN: 'bg-red-50 text-red-700 border-red-200',
  MANAGER: 'bg-amber-50 text-amber-700 border-amber-200',
  PRODUCTION_MANAGER: 'bg-blue-50 text-blue-700 border-blue-200',
  CASHIER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  STAFF: 'bg-slate-50 text-slate-700 border-slate-200'
};

const categoryTypeOptions = [
  { value: 'SWEET', label: 'Sweet' },
  { value: 'BAKERY', label: 'Bakery Items' },
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'DAIRY', label: 'Dairy' },
  { value: 'CHOCOLATES', label: 'Chocolates' },
  { value: 'HALWA', label: 'Halwa' },
  { value: 'DESSERTS', label: 'Desserts' },
  { value: 'RAMADAN_ITEM', label: 'Ramadan Items' }
];

const categoryTypeLabel = (type: string) => categoryTypeOptions.find((option) => option.value === type)?.label || type;

export default function Settings() {
  const queryClient = useQueryClient();
  const toast = useUiStore((s) => s.toast);
  const user = useAuthStore((state) => state.user);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  const [appVersion, setAppVersion] = useState('Browser');
  const [networkInfo, setNetworkInfo] = useState<{ localUrl: string; desktopUrl: string; remoteAccessNote: string } | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => unwrap<any>(api.get('/api/settings')) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => unwrap<Category[]>(api.get('/api/categories')) });
  const users = useQuery({ queryKey: ['settings-users'], queryFn: () => unwrap<User[]>(api.get('/api/settings/users')), enabled: user?.role === 'ADMIN' });
  const shopForm = useForm({ values: settings.data || { shopName: 'Eastern Sweets', address: 'Eastern Sweets, Bakers & Nimco', phone: '', city: 'Pakistan', taxRate: 0 } });
  const categoryForm = useForm({ defaultValues: { name: '', type: 'SWEET', description: '' } });
  const editCategoryForm = useForm({ values: categoryToEdit || { name: '', type: 'SWEET', description: '' } });

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.getAppVersion) {
      electronAPI.getAppVersion().then((version: string) => setAppVersion(version)).catch(() => setAppVersion('Unknown'));
    }
    if (electronAPI?.getNetworkInfo) {
      electronAPI.getNetworkInfo().then((info: any) => setNetworkInfo(info)).catch(() => setNetworkInfo(null));
    }
  }, []);

  const copyNetworkAddress = async () => {
    if (!networkInfo?.localUrl) return;
    try {
      await navigator.clipboard.writeText(networkInfo.localUrl);
      toast('Network address copied');
    } catch {
      toast(networkInfo.localUrl);
    }
  };

  const checkForUpdates = async () => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.checkForUpdates) {
      toast('Updates can be checked from the desktop app only', 'error');
      return;
    }
    setCheckingUpdates(true);
    try {
      const result = await electronAPI.checkForUpdates();
      toast(result?.message || 'Checking for updates...');
    } catch {
      toast('Could not check for updates right now', 'error');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const saveSettings = useMutation({
    mutationFn: (data: any) => unwrap<any>(api.put('/api/settings', data)),
    onSuccess: () => {
      toast('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  });
  const createCategory = useMutation({
    mutationFn: (data: any) => unwrap<Category>(api.post('/api/categories', data)),
    onSuccess: () => {
      toast('Category saved');
      categoryForm.reset();
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
  });
  const deleteCategory = useMutation({
    mutationFn: (id: string) => unwrap(api.delete(`/api/categories/${id}`)),
    onSuccess: () => {
      toast('Category deleted');
      setCategoryToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-for-recipes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: any) => {
      toast(error.response?.data?.message || 'Could not delete category', 'error');
    }
  });
  const updateCategory = useMutation({
    mutationFn: (data: any) => unwrap<Category>(api.put(`/api/categories/${categoryToEdit!.id}`, data)),
    onSuccess: () => {
      toast('Category updated');
      setCategoryToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not update category', 'error')
  });
  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> & { password?: string } }) => unwrap<User>(api.patch(`/api/settings/users/${id}`, data)),
    onSuccess: () => {
      toast('User updated');
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not update user', 'error')
  });
  const resetPassword = (user: User) => {
    const password = window.prompt(`New password for ${user.name}`);
    if (!password) return;
    updateUser.mutate({ id: user.id, data: { password } });
  };
  return (
    <div className="space-y-5">
      {user?.role === 'ADMIN' && <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">App Updates</h2>
            <p className="mt-1 text-sm text-slate-500">App Version: <span className="font-semibold text-[#0f615d]">{appVersion}</span></p>
            <p className="mt-1 text-xs text-slate-500">Updates replace app files only. Shop data remains in the local app-data database.</p>
          </div>
          <button type="button" className="touch inline-flex items-center justify-center gap-2 rounded-md border px-4 font-semibold text-[#0f615d]" onClick={checkForUpdates} disabled={checkingUpdates}>
            <DownloadCloud size={18} />
            {checkingUpdates ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>
      </section>}
      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-[#0f615d]"><Wifi size={18} /> Network Access</h2>
            <p className="mt-1 text-sm text-slate-500">Same WiFi par mobile, tablet ya doosra laptop yeh address browser mein open kare:</p>
            <div className="mt-2 rounded-md border border-[#ead8bb] bg-[#fffaf0] px-3 py-2 font-mono text-sm font-bold text-[#0f615d]">
              {networkInfo?.localUrl || 'Desktop app mein network address show hoga'}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Mobile data ya shop ke bahar internet se access ke liye router port forwarding, static IP/DDNS, ya secure tunnel setup chahiye hota hai. Sirf local IP mobile-data par direct open nahi hota.
            </p>
          </div>
          <button type="button" className="touch inline-flex items-center justify-center gap-2 rounded-md border px-4 font-semibold text-[#0f615d]" onClick={copyNetworkAddress} disabled={!networkInfo?.localUrl}>
            <Copy size={18} />
            Copy Address
          </button>
        </div>
      </section>
      <section className="rounded-lg border border-[#ead8bb] bg-[#fffaf0] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-[#0f615d]">Backup, Restore & Reset</h2>
            <p className="mt-1 text-sm text-[#55716d]">Manual backup, auto backup schedule, restore backup file, aur testing data reset yahan se manage karein.</p>
          </div>
          <Link to="/settings/backup" className="touch inline-flex items-center justify-center rounded-md bg-[#0f615d] px-4 font-semibold text-white">
            Open Backup Tools
          </Link>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={shopForm.handleSubmit((data) => saveSettings.mutate(data))} className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Shop Info</h2>
        <div className="grid gap-3">
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" placeholder="Shop name" {...shopForm.register('shopName')} />
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" placeholder="Phone" {...shopForm.register('phone')} />
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" placeholder="City" {...shopForm.register('city')} />
          <textarea className="rounded-md border bg-transparent p-3 dark:border-slate-700" placeholder="Address" {...shopForm.register('address')} />
          <button className="touch rounded-md bg-orange-600 font-semibold text-white">Save Settings</button>
        </div>
      </form>
      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold">Category &amp; Packaging Management</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">Har sale category ke Packaging button se Gift Box, Tokra, Plain Box, Tin aur custom options manage karein.</p>
        <form onSubmit={categoryForm.handleSubmit((data) => createCategory.mutate(data))} className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <input className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" placeholder="Category name" {...categoryForm.register('name', { required: true })} />
          <select className="touch rounded-md border bg-transparent px-3 dark:border-slate-700" {...categoryForm.register('type')}>
            {categoryTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button className="touch rounded-md bg-orange-600 px-4 font-semibold text-white">Add</button>
        </form>
        <div className="grid gap-2">
          {categories.data?.map((cat) => (
            <div key={cat.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm dark:border-slate-800">
              <div>
                <div className="font-semibold">{cat.name}</div>
                {cat.description && <div className="text-xs text-slate-500">{cat.description}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#f1e3cb] px-2.5 py-1 text-xs font-semibold text-[#0f615d]">{categoryTypeLabel(cat.type)}</span>
                {cat.type !== 'RAW_MATERIAL' && canEditDelete(user?.role) && <button
                  type="button"
                  className="touch inline-flex items-center gap-1.5 rounded-md border border-[#dac197] px-2.5 text-xs font-semibold text-[#0f615d] hover:bg-[#fffaf0]"
                  onClick={() => setCategoryToEdit(cat)}
                  aria-label={`Manage packaging for ${cat.name}`}
                >
                  <Package size={15} /> Packaging
                </button>}
                {canEditDelete(user?.role) && <button
                  type="button"
                  className="touch grid place-items-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => setCategoryToEdit(cat)}
                  aria-label={`Edit ${cat.name}`}
                >
                  <Edit size={17} />
                </button>}
                {canEditDelete(user?.role) && <button
                  type="button"
                  className="touch grid place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => setCategoryToDelete(cat)}
                  aria-label={`Delete ${cat.name}`}
                >
                  <Trash2 size={17} />
                </button>}
              </div>
            </div>
          ))}
          {!categories.data?.length && <div className="rounded-md border border-dashed p-5 text-center text-sm text-slate-500">No categories added yet.</div>}
        </div>
      </section>
      </div>

      <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">User Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-3">User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.data || []).map((user) => (
                <tr key={user.id} className="border-t border-[#ead8bb] odd:bg-[#fffaf0]/60">
                  <td className="py-3 font-semibold">{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${roleBadgeClasses[user.role]}`}>{ROLE_LABELS[user.role]}</span>
                      <select
                        className="touch rounded-md border bg-transparent px-2"
                        value={user.role}
                        onChange={(event) => updateUser.mutate({ id: user.id, data: { role: event.target.value as Role } })}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MANAGER">Manager</option>
                        <option value="PRODUCTION_MANAGER">Production Manager</option>
                        <option value="CASHIER">Cashier</option>
                        <option value="STAFF">Staff</option>
                      </select>
                    </div>
                  </td>
                  <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="touch rounded-md border px-3" onClick={() => updateUser.mutate({ id: user.id, data: { isActive: !user.isActive } })}>
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="touch rounded-md border px-3" onClick={() => resetPassword(user)}>
                        Reset Password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.data?.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal isOpen={Boolean(categoryToEdit)} onClose={() => setCategoryToEdit(null)} title={`Edit ${categoryToEdit?.name || 'Category'}`} size="xl">
        <form className="grid gap-3" onSubmit={editCategoryForm.handleSubmit((data) => updateCategory.mutate(data))}>
          <input className="erp-input" placeholder="Category name" {...editCategoryForm.register('name', { required: true })} />
          <select className="erp-input" {...editCategoryForm.register('type')}>
            {categoryTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <textarea className="erp-input" placeholder="Description" {...editCategoryForm.register('description')} />
          <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setCategoryToEdit(null)}>Cancel</button><button className="btn-primary" disabled={updateCategory.isPending}>{updateCategory.isPending ? 'Saving...' : 'Save'}</button></div>
        </form>
        {categoryToEdit && categoryToEdit.type !== 'RAW_MATERIAL' && <PackagingTypes category={categoryToEdit} />}
      </Modal>
      <ConfirmModal
        isOpen={Boolean(categoryToDelete)}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={() => categoryToDelete && deleteCategory.mutate(categoryToDelete.id)}
        title={`Delete ${categoryToDelete?.name || 'Category'}?`}
        message="This action cannot be undone."
        isLoading={deleteCategory.isPending}
      />
    </div>
  );
}
