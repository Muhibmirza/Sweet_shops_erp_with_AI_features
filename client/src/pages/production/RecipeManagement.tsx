import { useMutation, useQuery } from '@tanstack/react-query';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { RecipePrint } from '../../components/print/RecipePrint';
import { queryClient } from '../../queryClient';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { formatCurrency } from '../../utils/format';
import { canEditDelete } from '../../utils/permissions';
import { printElement } from '../../utils/print';
import { ALL_UNITS } from '../../constants/units';
import { convertUnit } from '../../utils/unitConversion';

export default function RecipeManagement() {
  const toast = useUiStore((s) => s.toast);
  const user = useAuthStore((state) => state.user);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const blankRecipeForm = {
    productId: '',
    name: '',
    yieldQuantity: '',
    yieldUnit: 'KG',
    labourCost: '',
    packagingCost: '',
    otherOverheads: '',
    wastagePercent: '',
    ingredients: [{ rawMaterialId: '', quantity: '', unit: 'KG' }]
  };
  const [form, setForm] = useState<any>(blankRecipeForm);
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => unwrap<any[]>(api.get('/api/recipes')) });
  const products = useQuery({ queryKey: ['products-for-recipes'], queryFn: () => unwrap<any[]>(api.get('/api/products?limit=200')) });
  const materials = useQuery({ queryKey: ['raw-materials-for-recipes'], queryFn: () => unwrap<any[]>(api.get('/api/raw-materials')) });
  const normalizedIngredientQuantity = (quantity: number, ingredientUnit?: string, materialUnit?: string) =>
    convertUnit(quantity, ingredientUnit || '', materialUnit || ingredientUnit || '');
  const create = useMutation({
    mutationFn: () => unwrap(editingId ? api.put(`/api/recipes/${editingId}`, form) : api.post('/api/recipes', form)),
    onSuccess: (recipe) => {
      setEditingId(null);
      setForm(blankRecipeForm);
      queryClient.setQueryData(['recipes'], (current: any) => {
        if (!Array.isArray(current)) return [recipe];
        return editingId ? current.map((item: any) => item.id === editingId ? recipe : item) : [recipe, ...current];
      });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast(editingId ? 'Recipe updated' : 'Recipe saved');
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not save recipe', 'error')
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.delete(`/api/recipes/${id}`)),
    onSuccess: () => {
      toast('Recipe deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Could not delete recipe', 'error')
  });
  const editRecipe = (recipe: any) => {
    setEditingId(recipe.id);
    setForm({
      productId: recipe.productId,
      name: recipe.name,
      yieldQuantity: recipe.yieldQuantity,
      yieldUnit: recipe.yieldUnit,
      labourCost: recipe.labourCost || recipe.laborCost || '',
      packagingCost: recipe.packagingCost || recipe.packingCost || '',
      otherOverheads: recipe.otherOverheads || '',
      wastagePercent: recipe.wastagePercent || '',
      ingredients: (recipe.ingredients || []).map((item: any) => ({
        rawMaterialId: item.rawMaterialId,
        quantity: item.quantity,
        unit: item.unit
      }))
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const rawMaterialCost = (form.ingredients || []).reduce((sum: number, item: any) => {
    const material = (materials.data || []).find((row: any) => row.id === item.rawMaterialId);
    const costingQty = normalizedIngredientQuantity(Number(item.quantity || 0), item.unit, material?.unit);
    return sum + costingQty * Number(material?.avgCost || material?.costPerUnit || 0);
  }, 0);
  const wastageCost = rawMaterialCost * (Number(form.wastagePercent || 0) / 100);
  const totalProductionCost = rawMaterialCost
    + Number(form.labourCost || 0)
    + Number(form.packagingCost || 0)
    + Number(form.otherOverheads || 0)
    + wastageCost;
  const actualOutput = Number(form.yieldQuantity || 0) * (1 - Number(form.wastagePercent || 0) / 100);
  const totalCostPerUnit = Number(form.yieldQuantity || 0) > 0
    ? totalProductionCost / (actualOutput > 0 ? actualOutput : Number(form.yieldQuantity))
    : 0;
  const setIngredient = (index: number, key: string, value: string) => setForm((prev: any) => ({ ...prev, ingredients: prev.ingredients.map((item: any, i: number) => i === index ? { ...item, [key]: value } : item) }));
  const saveRecipe = () => {
    if (!products.data?.length) {
      toast('Add at least one product before creating a recipe', 'error');
      return;
    }
    if (!materials.data?.length) {
      toast('Add at least one raw material before creating a recipe', 'error');
      return;
    }
    if (!form.productId || !form.name.trim() || Number(form.yieldQuantity) <= 0) {
      toast('Select product, enter recipe name, and valid yield', 'error');
      return;
    }
    if (!form.ingredients.some((item: any) => item.rawMaterialId && Number(item.quantity) > 0)) {
      toast('Add at least one valid ingredient', 'error');
      return;
    }
    create.mutate();
  };

  return (
    <section className="page-fade space-y-5">
      <div className="erp-page-header"><div><p className="erp-eyebrow">Production</p><h2 className="erp-title">Recipe Management</h2></div></div>
      {(!products.data?.length || !materials.data?.length) && (
        <div className="erp-card border-[#c88421]/40 bg-[#fff7e6] p-4 text-sm text-[#7a4a08]">
          Recipes need live backend data first. Add products from Inventory and raw materials from Raw Materials, then save the recipe.
        </div>
      )}
      <div className="erp-card p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <select className="erp-input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Product</option>{(products.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className="erp-input" placeholder="Recipe name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="erp-input" type="number" step="0.001" min="0" placeholder="Yield" value={form.yieldQuantity} onChange={(e) => setForm({ ...form, yieldQuantity: e.target.value })} />
          <select className="erp-input" value={form.yieldUnit} onChange={(e) => setForm({ ...form, yieldUnit: e.target.value })}>{ALL_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.value}</option>)}</select>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <input className="erp-input" type="number" step="0.001" min="0" placeholder="Labour cost" value={form.labourCost} onChange={(e) => setForm({ ...form, labourCost: e.target.value })} />
          <input className="erp-input" type="number" step="0.001" min="0" placeholder="Packaging cost" value={form.packagingCost} onChange={(e) => setForm({ ...form, packagingCost: e.target.value })} />
          <input className="erp-input" type="number" step="0.001" min="0" placeholder="Other overheads" value={form.otherOverheads} onChange={(e) => setForm({ ...form, otherOverheads: e.target.value })} />
          <input className="erp-input" type="number" step="0.001" min="0" placeholder="Wastage %" value={form.wastagePercent} onChange={(e) => setForm({ ...form, wastagePercent: e.target.value })} />
        </div>
        <div className="mt-4 rounded-lg border border-[#dac197] bg-[#fffaf0] p-4 text-sm text-[#31534d]">
          <div className="mb-2 font-semibold text-[#0f615d]">Cost Preview for {form.yieldQuantity || 0} {form.yieldUnit}</div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <span>Raw Material: <b>{formatCurrency(rawMaterialCost)}</b></span>
            <span>Labour: <b>{formatCurrency(Number(form.labourCost || 0))}</b></span>
            <span>Packaging: <b>{formatCurrency(Number(form.packagingCost || 0))}</b></span>
            <span>Other: <b>{formatCurrency(Number(form.otherOverheads || 0))}</b></span>
            <span>Wastage ({Number(form.wastagePercent || 0)}%): <b>{formatCurrency(wastageCost)}</b></span>
            <span>Total: <b>{formatCurrency(totalProductionCost)}</b></span>
          </div>
          <div className="mt-2 font-semibold">Cost per {form.yieldUnit}: {formatCurrency(totalCostPerUnit)} <span className="font-normal text-[#6b7d78]">(selling price set separately on Product)</span></div>
          <div className="mt-1 text-sm text-[#6b7d78]">Actual Output after wastage: {actualOutput > 0 ? actualOutput.toFixed(3).replace(/\.?0+$/, '') : 0} {form.yieldUnit}</div>
        </div>
        <div className="mt-4 space-y-3">
          {form.ingredients.map((item: any, index: number) => (
            <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_44px]" key={index}>
              <select className="erp-input" value={item.rawMaterialId} onChange={(e) => setIngredient(index, 'rawMaterialId', e.target.value)}><option value="">Raw material</option>{(materials.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <div><input className="erp-input" type="number" step="0.001" min="0" placeholder="Qty" value={item.quantity} onChange={(e) => setIngredient(index, 'quantity', e.target.value)} />{item.quantity && (item.unit === 'GRAM' || item.unit === 'ML') && <p className="mt-1 text-xs text-slate-500">{item.quantity} {item.unit === 'GRAM' ? 'g' : 'ml'} = {convertUnit(Number(item.quantity), item.unit, item.unit === 'GRAM' ? 'KG' : 'LITRE')} {item.unit === 'GRAM' ? 'kg' : 'litre'}</p>}{item.rawMaterialId && (() => { const material = materials.data?.find((row: any) => row.id === item.rawMaterialId); return material ? <p className="mt-1 text-xs text-slate-500">Rate: {formatCurrency(Number(material.avgCost || material.costPerUnit || 0))} per {material.unit.toLowerCase()}</p> : null; })()}</div>
              <select className="erp-input" value={item.unit} onChange={(e) => setIngredient(index, 'unit', e.target.value)}>{ALL_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.value}</option>)}</select>
              <button className="btn-secondary" onClick={() => setForm((prev: any) => ({ ...prev, ingredients: prev.ingredients.filter((_: any, i: number) => i !== index) }))}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setForm((prev: any) => ({ ...prev, ingredients: [...prev.ingredients, { rawMaterialId: '', quantity: '', unit: 'KG' }] }))}><Plus size={18} /> Ingredient</button>
          {editingId && <button className="btn-secondary" onClick={() => { setEditingId(null); setForm(blankRecipeForm); }}>Cancel Edit</button>}
          <button className="btn-primary" onClick={saveRecipe} disabled={create.isPending}>{create.isPending ? 'Saving...' : editingId ? 'Update Recipe' : 'Save Recipe'}</button>
        </div>
      </div>
      <div className="erp-card overflow-x-auto p-5">
        <table className="w-full min-w-[860px] text-sm"><thead><tr className="text-left text-[#6b7d78]"><th className="py-3">Recipe</th><th>Product</th><th>Yield</th><th>Wastage</th><th>Ingredients</th><th>Cost</th><th className="text-right">Actions</th></tr></thead><tbody>
          {(recipes.data || []).map((recipe) => {
            const cost = {
              rawMaterialCost: (recipe.ingredients || []).reduce((s: number, i: any) => s + normalizedIngredientQuantity(i.quantity, i.unit, i.rawMaterial?.unit) * (i.rawMaterial?.avgCost || i.rawMaterial?.costPerUnit || 0), 0),
              totalCostPerUnit: recipe.yieldQuantity ? ((recipe.ingredients || []).reduce((s: number, i: any) => s + normalizedIngredientQuantity(i.quantity, i.unit, i.rawMaterial?.unit) * (i.rawMaterial?.avgCost || i.rawMaterial?.costPerUnit || 0), 0) + (recipe.labourCost || recipe.laborCost || 0) + (recipe.packagingCost || recipe.packingCost || 0) + (recipe.otherOverheads || 0)) / recipe.yieldQuantity : 0
            };
            return <tr key={recipe.id} className="border-t border-[#ead8bb] odd:bg-[#fffaf0]/60 hover:bg-[#f7ead5]"><td className="py-3 font-semibold">{recipe.name}<div id={`recipe-print-${recipe.id}`} className="fixed -left-[9999px] top-0 bg-white p-4 text-black"><RecipePrint recipe={recipe} cost={cost} /></div></td><td>{recipe.product?.name}</td><td>{recipe.yieldQuantity} {recipe.yieldUnit}</td><td>{Number(recipe.wastagePercent || 0)}%</td><td>{recipe.ingredients?.length || 0}</td><td>{formatCurrency(cost.rawMaterialCost)}</td><td><div className="flex justify-end gap-2"><button className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-700" title="Print" onClick={() => printElement(`recipe-print-${recipe.id}`)}>P</button>{canEditDelete(user?.role) && <><button className="grid h-8 w-8 place-items-center rounded-md border border-blue-200 text-blue-700" title="Edit" onClick={() => editRecipe(recipe)}><Edit size={15} /></button><button className="grid h-8 w-8 place-items-center rounded-md border border-red-200 text-red-700" title="Delete" onClick={() => setDeleteTarget(recipe)}><Trash2 size={15} /></button></>}</div></td></tr>;
          })}
          {!recipes.data?.length && <tr><td className="py-8 text-center text-[#6b7d78]" colSpan={7}>No recipes saved yet.</td></tr>}
        </tbody></table>
      </div>
      <ConfirmModal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)} title={`Delete ${deleteTarget?.name || 'Recipe'}?`} isLoading={remove.isPending} />
    </section>
  );
}
