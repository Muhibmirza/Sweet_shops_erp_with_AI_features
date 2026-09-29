import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, PackagePlus, Power } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { useUiStore } from '../../store/ui';
import type { Category, PackagingType } from '../../types';
import { pkr } from '../../utils/format';

const emptyForm = { name: '', chargeType: 'FIXED' as PackagingType['chargeType'], extraCharge: '', isActive: true };

export default function PackagingTypes({ category }: { category: Category }) {
  const queryClient = useQueryClient();
  const toast = useUiStore((state) => state.toast);
  const [editing, setEditing] = useState<PackagingType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const packaging = useQuery({ queryKey: ['packaging-types', category.id], queryFn: () => unwrap<PackagingType[]>(api.get(`/api/packaging-types?categoryId=${category.id}`)) });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['packaging-types'] });
    queryClient.invalidateQueries({ queryKey: ['packaging-types', category.id] });
    queryClient.invalidateQueries({ queryKey: ['packaging-for-category', category.id] });
  };
  const save = useMutation({
    mutationFn: () => {
      const categoryIds = editing ? Array.from(new Set([...(editing.categories?.map((item) => item.categoryId) || []), category.id])) : [category.id];
      const payload = { ...form, extraCharge: Number(form.extraCharge), categoryIds };
      return editing ? unwrap(api.put(`/api/packaging-types/${editing.id}`, payload)) : unwrap(api.post('/api/packaging-types', payload));
    },
    onSuccess: () => { toast(editing ? 'Packaging option updated' : 'Packaging option added'); setOpen(false); setEditing(null); setForm(emptyForm); refresh(); },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not save packaging option', 'error')
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => unwrap(api.delete(`/api/packaging-types/${id}?categoryId=${category.id}`)),
    onSuccess: () => { toast('Packaging option removed'); refresh(); },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not remove packaging option', 'error')
  });

  const beginEdit = (row: PackagingType) => {
    setEditing(row);
    setForm({ name: row.name, chargeType: row.chargeType, extraCharge: String(row.extraCharge), isActive: row.isActive });
    setOpen(true);
  };

  return <section className="mt-5 border-t border-[#ead8bb] pt-4">
    <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[#0f615d]">Packaging Options for {category.name}</h3><p className="text-xs text-slate-500">These choices appear for products in this category at POS.</p></div><button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}><PackagePlus size={16} /> Add Packaging Option</button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Name</th><th>Charge Type</th><th>Amount</th><th>Active</th><th className="text-right">Actions</th></tr></thead><tbody>
      {(packaging.data || []).map((row) => <tr key={row.id} className="border-t"><td className="py-3 font-semibold">{row.name}</td><td>{row.chargeType.replace('_', ' ')}</td><td>{row.chargeType === 'PERCENTAGE' ? `${row.extraCharge}%` : pkr(row.extraCharge)}</td><td>{row.isActive ? '✓' : '—'}</td><td><div className="flex justify-end gap-2"><button type="button" className="grid h-9 w-9 place-items-center rounded border text-blue-700" title="Edit" onClick={() => beginEdit(row)}><Edit size={16} /></button>{row.isActive && <button type="button" className="grid h-9 w-9 place-items-center rounded border text-red-700" title="Remove" onClick={() => deactivate.mutate(row.id)}><Power size={16} /></button>}</div></td></tr>)}
      {!packaging.data?.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No packaging options for this category.</td></tr>}
    </tbody></table></div>
    <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Edit Packaging Option' : 'Add Packaging Option'} size="md">
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1 text-sm"><span className="font-semibold">Name *</span><input className="erp-input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Gift Box" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span className="font-semibold">Charge Type *</span><select className="erp-input" value={form.chargeType} onChange={(event) => setForm({ ...form, chargeType: event.target.value as PackagingType['chargeType'] })}><option value="FIXED">Fixed</option><option value="PER_KG">Per KG</option><option value="PERCENTAGE">Percentage</option></select></label><label className="grid gap-1 text-sm"><span className="font-semibold">Amount *</span><input className="erp-input" type="number" min="0" step="0.01" required value={form.extraCharge} onChange={(event) => setForm({ ...form, extraCharge: event.target.value })} /></label></div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active</label>
        <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  </section>;
}
