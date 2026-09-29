import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { ProductionSlip } from '../../components/print/ProductionSlip';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Modal } from '../../components/ui/Modal';
import { queryClient } from '../../queryClient';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { printElement } from '../../utils/print';
import { canEditDelete } from '../../utils/permissions';
import { formatQuantity, pkr } from '../../utils/format';

type ProductionForm = {
  recipeId: string;
  plannedQuantity: number | string;
  productionDate: string;
  notes: string;
};

const emptyForm = (): ProductionForm => ({
  recipeId: '',
  plannedQuantity: '',
  productionDate: new Date().toISOString().slice(0, 10),
  notes: ''
});

const toDateInput = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

export default function ProductionOrders() {
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const [form, setForm] = useState<ProductionForm>(emptyForm());
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<ProductionForm>(emptyForm());
  const [deleting, setDeleting] = useState<any | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<{ id: string; shortfalls: any[] } | null>(null);

  const orders = useQuery({ queryKey: ['production-orders'], queryFn: () => unwrap<any[]>(api.get('/api/production')) });
  const recipes = useQuery({ queryKey: ['recipes-for-production'], queryFn: () => unwrap<any[]>(api.get('/api/recipes')) });
  const createCost = useQuery({
    queryKey: ['recipe-cost-estimate', form.recipeId, form.plannedQuantity],
    queryFn: () => unwrap<any>(api.get(`/api/recipes/${form.recipeId}/cost?qty=${Number(form.plannedQuantity)}`)),
    enabled: Boolean(form.recipeId && Number(form.plannedQuantity) > 0)
  });
  const editCost = useQuery({
    queryKey: ['recipe-cost-estimate-edit', editForm.recipeId, editForm.plannedQuantity],
    queryFn: () => unwrap<any>(api.get(`/api/recipes/${editForm.recipeId}/cost?qty=${Number(editForm.plannedQuantity)}`)),
    enabled: Boolean(editing && editForm.recipeId && Number(editForm.plannedQuantity) > 0)
  });

  const create = useMutation({
    mutationFn: () => unwrap(api.post('/api/production', { ...form, plannedQuantity: Number(form.plannedQuantity) })),
    onSuccess: () => {
      toast('Production order created');
      setForm(emptyForm());
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
    onError: (error: any) => toast(error?.response?.data?.message || 'Production order could not be created', 'error')
  });

  const update = useMutation({
    mutationFn: () => unwrap(api.put(`/api/production/${editing.id}`, { ...editForm, plannedQuantity: Number(editForm.plannedQuantity) })),
    onSuccess: () => {
      toast('Production order updated');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
    onError: (error: any) => toast(error?.response?.data?.message || 'Production order could not be updated', 'error')
  });

  const remove = useMutation({
    mutationFn: () => unwrap(api.delete(`/api/production/${deleting.id}`)),
    onSuccess: () => {
      toast('Production order deleted');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
    onError: (error: any) => toast(error?.response?.data?.message || 'Production order could not be deleted', 'error')
  });

  const complete = useMutation({
    mutationFn: async ({ id, confirmShortfall = false }: { id: string; confirmShortfall?: boolean }) => {
      const response = await api.patch(`/api/production/${id}/complete`, { confirmShortfall });
      return response.data;
    },
    onSuccess: (response: any, variables) => {
      if (response.requiresConfirmation) {
        setPendingCompletion({ id: variables.id, shortfalls: response.shortfalls || [] });
        return;
      }
      setPendingCompletion(null);
      toast('Production order completed');
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-stock'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-consumption-report'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => toast(error?.response?.data?.message || 'Production order could not be completed', 'error')
  });

  const openEdit = (order: any) => {
    setEditing(order);
    setEditForm({
      recipeId: order.recipeId,
      plannedQuantity: order.plannedQuantity,
      productionDate: toDateInput(order.productionDate),
      notes: order.notes || ''
    });
  };

  const renderCostPreview = (cost?: any, isLoading?: boolean) => {
    if (isLoading) return <div className="rounded-lg border border-[#ead8bb] bg-[#fffaf0] p-3 text-sm text-[#6b7d78]">Loading cost estimate...</div>;
    if (!cost) return null;
    return (
      <div className="rounded-lg border border-[#dac197] bg-[#fffaf0] p-4 text-sm text-[#31534d]">
        <div className="mb-2 font-semibold text-[#0f615d]">Cost Estimate for {formatQuantity(cost.productionQty || 0, cost.yieldUnit || '')}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead><tr className="text-left text-[#6b7d78]"><th>Material</th><th>Req. Qty</th><th>Rate</th><th>Cost</th></tr></thead>
            <tbody>
              {(cost.breakdown || []).map((item: any) => (
                <tr key={item.rawMaterialId} className="border-t border-[#ead8bb]">
                  <td className="py-2">{item.name || item.rawMaterial}</td>
                  <td>{formatQuantity(item.requiredQty || 0, item.unit)}</td>
                  <td>{pkr(item.rate || 0)}</td>
                  <td>{pkr(item.materialCost || item.cost || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-1 md:grid-cols-2">
          <span>Raw Material Total: <b>{pkr(cost.totalRawMaterialCost || cost.rawMaterialCost || 0)}</b></span>
          <span>Labour: <b>{pkr(cost.labourCost || cost.laborCost || 0)}</b></span>
          <span>Packaging: <b>{pkr(cost.packagingCost || cost.packingCost || 0)}</b></span>
          <span>Other: <b>{pkr(cost.otherOverheads || 0)}</b></span>
          <span>Wastage ({cost.wastagePercent || 0}%): <b>{pkr(cost.wastageCost || 0)}</b></span>
          <span>Estimated Total: <b>{pkr(cost.totalCost || cost.totalProductionCost || 0)}</b></span>
        </div>
        <div className="mt-2 font-semibold">Estimated Cost per {cost.yieldUnit}: {pkr(cost.costPerUnit || cost.totalCostPerUnit || 0)}</div>
      </div>
    );
  };

  const renderForm = (value: ProductionForm, setValue: (next: ProductionForm) => void, submitLabel: string, isLoading: boolean, onSubmit: () => void, onCancel?: () => void, cost?: any, costLoading?: boolean) => (
    <div className="grid gap-3">
      <label>
        <span className="mb-1 block text-sm font-semibold text-[#0f615d]">Recipe</span>
        <select className="erp-input" value={value.recipeId} onChange={(event) => setValue({ ...value, recipeId: event.target.value })}>
          <option value="">Select recipe</option>
          {(recipes.data || []).map((recipe) => (
            <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-sm font-semibold text-[#0f615d]">Planned Quantity</span>
        <input
          className="erp-input"
          type="number"
          step="0.001"
          min="0"
          placeholder="Planned quantity"
          value={value.plannedQuantity}
          onChange={(event) => setValue({ ...value, plannedQuantity: event.target.value })}
        />
      </label>
      <label>
        <span className="mb-1 block text-sm font-semibold text-[#0f615d]">Production Date</span>
        <input className="erp-input" type="date" value={value.productionDate} onChange={(event) => setValue({ ...value, productionDate: event.target.value })} />
      </label>
      <label>
        <span className="mb-1 block text-sm font-semibold text-[#0f615d]">Notes</span>
        <textarea className="erp-input min-h-24" placeholder="Notes" value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} />
      </label>
      {renderCostPreview(cost, costLoading)}
      <div className="flex justify-end gap-3">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary" onClick={onSubmit} disabled={isLoading || !value.recipeId || !Number(value.plannedQuantity)}>
          {isLoading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <section className="page-fade space-y-5">
      <div className="erp-page-header">
        <div>
          <p className="erp-eyebrow">Kitchen Workflow</p>
          <h2 className="erp-title">Production Orders</h2>
        </div>
      </div>

      <div className="erp-card p-5">
        {renderForm(form, setForm, 'Create', create.isPending, () => create.mutate(), undefined, createCost.data, createCost.isLoading)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(orders.data || []).map((order) => {
          const adminCanEdit = canEditDelete(user?.role) && order.status !== 'COMPLETED';
          return (
            <article className="erp-card p-5" key={order.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl font-semibold text-[#0f615d]">{order.product?.name}</h3>
                  <p className="text-sm text-[#6b7d78]">{order.recipe?.name}</p>
                </div>
                <span className="rounded-full bg-[#f1e3cb] px-3 py-1 text-xs font-semibold text-[#0f615d]">{order.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-[#6b7d78]">Planned</p><b>{order.plannedQuantity}</b></div>
                <div><p className="text-[#6b7d78]">Actual</p><b>{order.actualQuantity}</b></div>
                <div><p className="text-[#6b7d78]">Date</p><b>{new Date(order.productionDate).toLocaleDateString()}</b></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {order.status !== 'COMPLETED' && <button className="btn-primary" disabled={complete.isPending} onClick={() => complete.mutate({ id: order.id })}>Complete</button>}
                <button className="btn-secondary inline-flex items-center gap-2" onClick={() => printElement(`production-slip-${order.id}`)}><Printer size={16} /> Print</button>
                {adminCanEdit && (
                  <>
                    <button className="btn-secondary inline-flex items-center gap-2" onClick={() => openEdit(order)}><Pencil size={16} /> Edit</button>
                    <button className="btn-secondary inline-flex items-center gap-2 border-red-200 text-red-700" onClick={() => setDeleting(order)}><Trash2 size={16} /> Delete</button>
                  </>
                )}
              </div>
              <div id={`production-slip-${order.id}`} className="fixed -left-[9999px] top-0 bg-white p-4 text-black"><ProductionSlip order={order} /></div>
            </article>
          );
        })}
      </div>

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Production Order" size="md">
        {renderForm(editForm, setEditForm, 'Update', update.isPending, () => update.mutate(), () => setEditing(null), editCost.data, editCost.isLoading)}
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
        title={`Delete ${deleting?.product?.name || 'production order'}?`}
        message="This production order will be removed from the database. Completed production orders cannot be deleted."
        confirmLabel="Delete"
        isLoading={remove.isPending}
      />
      <Modal isOpen={Boolean(pendingCompletion)} onClose={() => setPendingCompletion(null)} title="Insufficient Kitchen Stock" size="md">
        <p className="mb-3 text-sm text-[#55716d]">Kitchen stock is short for the following ingredients. You can cancel or complete the order anyway.</p>
        <div className="space-y-2">
          {pendingCompletion?.shortfalls.map((row) => (
            <div key={row.rawMaterialId} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <b>{row.material}</b>: required {formatQuantity(row.required, row.unit)}, available {formatQuantity(row.available, row.unit)}, shortfall {formatQuantity(row.shortfall, row.unit)}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setPendingCompletion(null)}>Cancel</button>
          <button className="btn-primary" disabled={complete.isPending} onClick={() => pendingCompletion && complete.mutate({ id: pendingCompletion.id, confirmShortfall: true })}>
            {complete.isPending ? 'Completing...' : 'Proceed Anyway'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
