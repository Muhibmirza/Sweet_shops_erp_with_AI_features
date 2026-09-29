import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Kitchen, { type KitchenSection } from '../inventory/Kitchen';
import ProductionOrders from './ProductionOrders';
import RecipeManagement from './RecipeManagement';

type ProductionTab = 'orders' | 'recipes' | KitchenSection;

const tabs: Array<{ id: ProductionTab; label: string }> = [
  { id: 'orders', label: 'Production Orders' },
  { id: 'recipes', label: 'Recipes / BOM' },
  { id: 'stock', label: 'Kitchen Stock' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'adjustments', label: 'Adjustments' },
  { id: 'reports', label: 'Kitchen Reports' }
];

export default function ProductionHub() {
  const [params, setParams] = useSearchParams();
  const active = useMemo<ProductionTab>(() => {
    const requested = params.get('tab') as ProductionTab | null;
    return tabs.some((tab) => tab.id === requested) ? requested! : 'orders';
  }, [params]);

  return <div className="space-y-5"><div className="erp-page-header"><div><p className="erp-eyebrow">Production + Kitchen</p><h1 className="erp-title">Production Management</h1></div></div><div className="flex gap-2 overflow-x-auto rounded-xl border border-[#ead8bb] bg-white p-2">{tabs.map((tab) => <button key={tab.id} className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold transition ${active === tab.id ? 'bg-[#0f615d] text-white' : 'text-[#496864] hover:bg-[#f1e3cb]'}`} onClick={() => setParams({ tab: tab.id })}>{tab.label}</button>)}</div>{active === 'orders' && <ProductionOrders />}{active === 'recipes' && <RecipeManagement />}{active !== 'orders' && active !== 'recipes' && <Kitchen section={active} />}</div>;
}
