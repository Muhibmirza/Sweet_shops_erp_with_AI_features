import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Minus, Plus, Printer, Search, Ticket, Trash2 } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { api, unwrap } from '../api/client';
import { POSReceipt } from '../components/print/POSReceipt';
import { TokenSlip } from '../components/print/TokenSlip';
import { useUiStore } from '../store/ui';
import type { Category, PackagingType, PaymentMethod, Product, Sale, Unit } from '../types';
import { formatQuantity, pkr } from '../utils/format';
import { silentPrint } from '../utils/print';

interface CartLine {
  product: Product;
  quantity: number;
  displayQuantity: number;
  displayUnit: Unit;
  unitPrice: number;
  lineTotal: number;
  packagingOptions: PackagingType[];
  packagingTypeId: string | null;
  packagingCharge: number;
}

const toStockQuantity = (displayQuantity: number, displayUnit: Unit, productUnit: Unit) => {
  if (productUnit === 'KG' && displayUnit === 'GRAM') return displayQuantity / 1000;
  return displayQuantity;
};

const toDisplayQuantity = (stockQuantity: number, displayUnit: Unit, productUnit: Unit) => {
  if (productUnit === 'KG' && displayUnit === 'GRAM') return stockQuantity * 1000;
  return stockQuantity;
};

const stepForUnit = (unit: Unit) => unit === 'GRAM' ? 50 : unit === 'KG' || unit === 'LITRE' ? 0.25 : 1;

export default function POS() {
  const queryClient = useQueryClient();
  const toast = useUiStore((s) => s.toast);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryCharges, setDeliveryCharges] = useState('');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenNumber, setTokenNumber] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailInputMode, setDetailInputMode] = useState<'g' | 'kg'>('g');
  const [detailCustomQuantity, setDetailCustomQuantity] = useState('');
  const [detailPackagingId, setDetailPackagingId] = useState<string | null>(null);

  const products = useQuery({ queryKey: ['products'], queryFn: () => unwrap<Product[]>(api.get('/api/products?limit=200&isActive=true')) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => unwrap<Category[]>(api.get('/api/categories')) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => unwrap<any>(api.get('/api/settings')) });
  const nextToken = useQuery({ queryKey: ['next-token'], queryFn: () => unwrap<{ nextNumber: number }>(api.get('/api/tokens/counter/next')) });
  const detailPackaging = useQuery({
    queryKey: ['packaging-for-category', selectedProduct?.categoryId],
    queryFn: () => unwrap<PackagingType[]>(api.get(`/api/packaging-types/for-category/${selectedProduct!.categoryId}`)),
    enabled: Boolean(selectedProduct)
  });

  const filtered = useMemo(() => {
    return (products.data || []).filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'all' || product.categoryId === category;
      return matchesSearch && matchesCategory;
    });
  }, [products.data, search, category]);

  const subtotal = cart.reduce((sum, line) => sum + line.lineTotal + line.packagingCharge, 0);
  const deliveryTotal = isDelivery ? Number(deliveryCharges || 0) : 0;
  const total = Math.max(subtotal - discount + deliveryTotal, 0);
  const cashChange = cashReceived === '' ? null : Number(cashReceived || 0) - total;
  const payableLines = cart.filter((line) => line.quantity > 0 && line.lineTotal > 0);

  const packagingChargeFor = (type: PackagingType | undefined, quantity: number, itemSubtotal: number) => {
    if (!type) return 0;
    if (type.chargeType === 'PER_KG') return Math.round(type.extraCharge * quantity);
    if (type.chargeType === 'PERCENTAGE') return Math.round((type.extraCharge / 100) * itemSubtotal);
    return Math.round(type.extraCharge);
  };

  const openProductDetail = (product: Product) => {
    if (!product.currentCost || product.currentCost <= 0) toast('Cost not set yet; sale will continue with zero cost', 'error');
    if (product.currentStock <= 0) {
      toast(`${product.name} is out of stock`, 'error');
      return;
    }
    const initial = product.saleMode === 'WEIGHT' ? Number((product.quantityPresets?.[0] || 250) / 1000) : 1;
    setSelectedProduct(product);
    setDetailQuantity(initial);
    setDetailInputMode('g');
    setDetailCustomQuantity('');
    setDetailPackagingId(null);
    setTokenNumber('');
  };

  const detailOptions = (detailPackaging.data || []).filter((option) => option.id);
  const selectedDetailPackaging = detailOptions.find((option) => option.id === detailPackagingId);
  const detailItemTotal = selectedProduct ? Math.round(selectedProduct.sellingPrice * detailQuantity) : 0;
  const detailPackagingCharge = packagingChargeFor(selectedDetailPackaging, detailQuantity, detailItemTotal);
  const detailLine: CartLine | null = selectedProduct ? {
    product: selectedProduct,
    quantity: detailQuantity,
    displayQuantity: selectedProduct.saleMode === 'WEIGHT' && detailQuantity < 1 ? detailQuantity * 1000 : detailQuantity,
    displayUnit: selectedProduct.saleMode === 'WEIGHT' && detailQuantity < 1 ? 'GRAM' : selectedProduct.unit,
    unitPrice: selectedProduct.sellingPrice,
    lineTotal: detailItemTotal,
    packagingOptions: detailOptions,
    packagingTypeId: detailPackagingId,
    packagingCharge: detailPackagingCharge
  } : null;

  const setDetailCustom = (value: string) => {
    setDetailCustomQuantity(value);
    const raw = Number(value);
    setDetailQuantity(raw > 0 ? (detailInputMode === 'g' ? raw / 1000 : raw) : 0);
  };

  const validateDetail = () => {
    if (!selectedProduct || !detailLine || detailQuantity <= 0) {
      toast('Quantity must be greater than zero', 'error');
      return false;
    }
    if (detailQuantity > selectedProduct.currentStock) {
      toast(`Only ${formatQuantity(selectedProduct.currentStock, selectedProduct.unit)} available`, 'error');
      return false;
    }
    return true;
  };

  const addDetailToCart = () => {
    if (!validateDetail() || !detailLine) return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === detailLine.product.id && line.packagingTypeId === detailLine.packagingTypeId);
      if (!existing) return [...current, detailLine];
      const quantity = existing.quantity + detailLine.quantity;
      if (quantity > detailLine.product.currentStock) {
        toast(`Only ${formatQuantity(detailLine.product.currentStock, detailLine.product.unit)} available`, 'error');
        return current;
      }
      const lineTotal = Math.round(existing.unitPrice * quantity);
      return current.map((line) => line === existing ? { ...line, quantity, displayQuantity: toDisplayQuantity(quantity, line.displayUnit, line.product.unit), lineTotal, packagingCharge: packagingChargeFor(line.packagingOptions.find((option) => option.id === line.packagingTypeId), quantity, lineTotal) } : line);
    });
    toast(`${detailLine.product.name} added to cart`);
  };

  const updatePackaging = (productId: string, packagingTypeId: string) => setCart((current) => current.map((line) => {
    if (line.product.id !== productId) return line;
    const selected = line.packagingOptions.find((option) => option.id === packagingTypeId);
    return { ...line, packagingTypeId: packagingTypeId || null, packagingCharge: packagingChargeFor(selected, line.quantity, line.lineTotal) };
  }));

  const updateQty = (productId: string, direction: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.product.id !== productId) return line;
          const nextDisplayQuantity = Math.max(line.displayQuantity + (direction * stepForUnit(line.displayUnit)), 0);
          const nextQuantity = toStockQuantity(nextDisplayQuantity, line.displayUnit, line.product.unit);
          if (nextQuantity > line.product.currentStock) {
            toast(`Only ${formatQuantity(line.product.currentStock, line.product.unit)} available`, 'error');
            return line;
          }
          const lineTotal = Math.round(line.unitPrice * nextQuantity);
          return { ...line, quantity: nextQuantity, displayQuantity: nextDisplayQuantity, lineTotal, packagingCharge: packagingChargeFor(line.packagingOptions.find((x) => x.id === line.packagingTypeId), nextQuantity, lineTotal) };
        })
        .filter((line) => line.displayQuantity >= 0)
    );
  };

  const setDisplayQty = (productId: string, value: number) => {
    setCart((current) => current.map((line) => {
      if (line.product.id !== productId) return line;
      const safeValue = Math.max(0, Number(value) || 0);
      const stockQuantity = toStockQuantity(safeValue, line.displayUnit, line.product.unit);
      if (stockQuantity > line.product.currentStock) {
        toast(`Only ${formatQuantity(line.product.currentStock, line.product.unit)} available`, 'error');
        return {
          ...line,
          quantity: line.product.currentStock,
          displayQuantity: toDisplayQuantity(line.product.currentStock, line.displayUnit, line.product.unit),
          lineTotal: line.unitPrice * line.product.currentStock
        };
      }
      const lineTotal = Math.round(line.unitPrice * stockQuantity);
      return { ...line, quantity: stockQuantity, displayQuantity: safeValue, lineTotal, packagingCharge: packagingChargeFor(line.packagingOptions.find((x) => x.id === line.packagingTypeId), stockQuantity, lineTotal) };
    }));
  };

  const setLineTotal = (productId: string, value: number) => {
    setCart((current) => current.map((line) => {
      if (line.product.id !== productId) return line;
      const lineTotal = Math.max(0, Number(value) || 0);
      const stockQuantity = line.unitPrice > 0 ? lineTotal / line.unitPrice : 0;
      if (stockQuantity > line.product.currentStock) {
        toast(`Only ${formatQuantity(line.product.currentStock, line.product.unit)} available`, 'error');
        return {
          ...line,
          quantity: line.product.currentStock,
          displayQuantity: toDisplayQuantity(line.product.currentStock, line.displayUnit, line.product.unit),
          lineTotal: line.unitPrice * line.product.currentStock
        };
      }
      return { ...line, quantity: stockQuantity, displayQuantity: toDisplayQuantity(stockQuantity, line.displayUnit, line.product.unit), lineTotal, packagingCharge: packagingChargeFor(line.packagingOptions.find((x) => x.id === line.packagingTypeId), stockQuantity, lineTotal) };
    }));
  };

  const setDisplayUnit = (productId: string, displayUnit: Unit) => {
    setCart((current) => current.map((line) => {
      if (line.product.id !== productId) return line;
      return { ...line, displayUnit, displayQuantity: toDisplayQuantity(line.quantity, displayUnit, line.product.unit) };
    }));
  };

  const removeLine = (productId: string) => setCart((current) => current.filter((line) => line.product.id !== productId));

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCashReceived('');
    setIsDelivery(false);
    setDeliveryCharges('');
    setShowTokenInput(false);
    setTokenNumber('');
  };

  const buildSalePayload = (override?: { tokenNumber?: number; lines?: CartLine[] }) => ({
    items: (override?.lines || payableLines).map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
      displayQuantity: line.displayQuantity,
      displayUnit: line.displayUnit,
      unitPrice: line.quantity > 0 ? line.lineTotal / line.quantity : line.unitPrice,
      packagingTypeId: line.packagingTypeId
    })),
    discount: override?.lines ? 0 : discount,
    taxAmount: 0,
    paymentMethod,
    cashReceived: paymentMethod === 'CASH' ? cashReceived : undefined,
    isDelivery: override?.lines ? false : isDelivery,
    deliveryCharges: override?.lines ? 0 : deliveryTotal,
    tokenNumber: override?.tokenNumber
  });

  const buildTokenSlipData = (finalTokenNumber: number, lines: CartLine[] = payableLines) => ({
    tokenNumber: finalTokenNumber,
    items: lines.map((line) => ({
      productId: line.product.id,
      product: line.product,
      name: line.product.name,
      quantity: line.quantity,
      displayQuantity: line.displayQuantity,
      displayUnit: line.displayUnit,
      unitPrice: line.quantity > 0 ? line.lineTotal / line.quantity : line.unitPrice,
      subtotal: line.lineTotal,
      packagingTypeId: line.packagingTypeId,
      packagingCharge: line.packagingCharge,
      packagingType: line.packagingOptions.find((option) => option.id === line.packagingTypeId) || null
    })),
    totalAmount: lines.reduce((sum, line) => sum + line.lineTotal + line.packagingCharge, 0),
    createdAt: new Date()
  });

  const saleMutation = useMutation({
    mutationFn: (payload?: { tokenNumber?: number; tokenSlip?: any; lines?: CartLine[] }) =>
      unwrap<Sale>(
        api.post('/api/sales', buildSalePayload({ tokenNumber: payload?.tokenNumber, lines: payload?.lines }))
      ),
    onSuccess: (sale, payload) => {
      setLastSale(sale);
      if (payload?.tokenSlip) {
        silentPrint(renderToStaticMarkup(<TokenSlip token={{ ...payload.tokenSlip, tokenNumber: sale.tokenNumber || payload.tokenNumber }} />));
        toast(`Token ${sale.tokenNumber || payload.tokenNumber} printed. Sale recorded.`);
      } else {
        toast(`Sale completed! Invoice: ${sale.invoiceNo}`);
      }
      clearCart();
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['revenue'] });
      queryClient.invalidateQueries({ queryKey: ['top-products'] });
      queryClient.invalidateQueries({ queryKey: ['sales-items'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-suggestions'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Sale failed', 'error')
  });

  const submitTokenSale = () => {
    const finalTokenNumber = Number(tokenNumber || nextToken.data?.nextNumber || 1);
    if (!payableLines.length || !finalTokenNumber || finalTokenNumber <= 0) return;
    saleMutation.mutate({ tokenNumber: finalTokenNumber, tokenSlip: buildTokenSlipData(finalTokenNumber) });
  };

  return (
    <div className={selectedProduct ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]' : 'space-y-4'}>
      {selectedProduct && detailLine ? (
        <section className="animate-in slide-in-from-right-4 rounded-2xl border border-[#ead8bb] bg-white p-5 shadow-sm duration-200 lg:p-8">
          <button type="button" className="mb-6 inline-flex min-h-11 items-center gap-2 font-semibold text-[#0f615d]" onClick={() => setSelectedProduct(null)}><ArrowLeft size={18} /> Back to Products</button>
          <div className="mb-8 border-b border-[#ead8bb] pb-6"><p className="erp-eyebrow">Product Detail</p><h2 className="font-serif text-4xl font-bold uppercase tracking-wide text-[#0f615d] lg:text-5xl">{selectedProduct.name}</h2><p className="mt-3 text-2xl font-semibold text-orange-600">{pkr(selectedProduct.sellingPrice)} / {selectedProduct.saleMode === 'WEIGHT' ? 'kg' : selectedProduct.unit.toLowerCase()}</p><p className={`mt-2 text-base ${selectedProduct.currentStock <= selectedProduct.minStockLevel ? 'font-semibold text-red-600' : 'text-slate-500'}`}>Stock: {formatQuantity(selectedProduct.currentStock, selectedProduct.unit)} available</p></div>

          <div className="grid gap-8 lg:grid-cols-2">
            <section><h3 className="mb-4 text-xl font-semibold text-[#0f615d]">Select Quantity</h3>
              {selectedProduct.saleMode === 'WEIGHT' ? <>
                <div className="grid grid-cols-3 gap-3">{(selectedProduct.quantityPresets?.length ? selectedProduct.quantityPresets : [250, 500, 750, 1000, 1500, 2000]).map((grams) => <button type="button" key={grams} disabled={grams / 1000 > selectedProduct.currentStock} className={`min-h-14 rounded-xl border text-base font-semibold transition ${Math.abs(detailQuantity - grams / 1000) < 0.000001 ? 'border-[#0f615d] bg-[#0f615d] text-white shadow-md' : 'border-[#dac197] bg-[#fffaf0] text-[#0f615d] hover:border-[#0f615d]'}`} onClick={() => { setDetailQuantity(grams / 1000); setDetailCustomQuantity(''); }}>{grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`}</button>)}</div>
                <div className="mt-4 flex items-center gap-2"><span className="text-sm font-semibold">Custom:</span><input className="erp-input no-spinner min-w-0 flex-1" type="number" min="0" step={detailInputMode === 'g' ? 1 : 0.001} value={detailCustomQuantity} onChange={(event) => setDetailCustom(event.target.value)} placeholder={detailInputMode === 'g' ? 'grams' : 'kilograms'} /><div className="flex overflow-hidden rounded-md border"><button type="button" className={`h-11 px-4 text-sm font-semibold ${detailInputMode === 'g' ? 'bg-[#0f615d] text-white' : ''}`} onClick={() => { setDetailInputMode('g'); setDetailCustomQuantity(''); }}>g</button><button type="button" className={`h-11 px-4 text-sm font-semibold ${detailInputMode === 'kg' ? 'bg-[#0f615d] text-white' : ''}`} onClick={() => { setDetailInputMode('kg'); setDetailCustomQuantity(''); }}>kg</button></div></div>
              </> : <div className="flex items-center gap-4 rounded-xl border border-[#ead8bb] bg-[#fffaf0] p-4"><button type="button" className="touch rounded-md border bg-white" onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}><Minus size={20} /></button><span className="min-w-14 text-center text-2xl font-bold">{detailQuantity}</span><button type="button" className="touch rounded-md border bg-white disabled:opacity-40" disabled={detailQuantity >= selectedProduct.currentStock} onClick={() => setDetailQuantity(detailQuantity + 1)}><Plus size={20} /></button><span className="text-sm text-slate-500">sold by piece/unit</span></div>}
            </section>

            <section><h3 className="mb-4 text-xl font-semibold text-[#0f615d]">Packaging</h3><div className="space-y-2"><label className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-[#ead8bb] px-4"><span className="flex items-center gap-2"><input type="radio" name="detail-packaging" checked={!detailPackagingId} onChange={() => setDetailPackagingId(null)} /> No Packaging</span><span>{pkr(0)}</span></label>{detailOptions.map((option) => <label key={option.id} className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-[#ead8bb] px-4"><span className="flex items-center gap-2"><input type="radio" name="detail-packaging" checked={detailPackagingId === option.id} onChange={() => setDetailPackagingId(option.id)} /> {option.name}</span><span>+{option.chargeType === 'PERCENTAGE' ? `${option.extraCharge}%` : `${pkr(option.extraCharge)}${option.chargeType === 'PER_KG' ? '/kg' : ''}`}</span></label>)}</div></section>
          </div>

          <section className="mt-8 grid gap-3 rounded-2xl border border-[#dac197] bg-[#fffaf0] p-5 text-base sm:grid-cols-2"><div className="flex justify-between"><span>Qty</span><b>{formatQuantity(detailLine.displayQuantity, detailLine.displayUnit)}</b></div><div className="flex justify-between"><span>Rate</span><b>{pkr(detailLine.unitPrice)} / {selectedProduct.saleMode === 'WEIGHT' ? 'kg' : selectedProduct.unit.toLowerCase()}</b></div><div className="flex justify-between"><span>Item Total</span><b>{pkr(detailItemTotal)}</b></div><div className="flex justify-between"><span>Packaging</span><b>{pkr(detailPackagingCharge)}</b></div><div className="flex justify-between border-t border-[#dac197] pt-3 text-xl font-bold text-[#0f615d] sm:col-span-2"><span>LINE TOTAL</span><span>{pkr(detailItemTotal + detailPackagingCharge)}</span></div>{detailQuantity > selectedProduct.currentStock && <p className="font-semibold text-red-600 sm:col-span-2 sm:text-right">Only {formatQuantity(selectedProduct.currentStock, selectedProduct.unit)} available</p>}</section>
          <button type="button" className="btn-primary mt-5 min-h-14 w-full text-lg" disabled={detailQuantity <= 0 || detailQuantity > selectedProduct.currentStock} onClick={addDetailToCart}>Add to Cart</button>
        </section>
      ) : (
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex min-h-11 flex-1 items-center gap-2 rounded-md border bg-white px-3 dark:border-slate-800 dark:bg-slate-900">
            <Search size={18} />
            <input className="w-full bg-transparent outline-none" placeholder="Search sweets, bakery, drinks" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="touch rounded-md border bg-white px-3 dark:border-slate-800 dark:bg-slate-900" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.data?.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((product) => (
            <button
              type="button"
              key={product.id}
              disabled={product.currentStock <= 0}
              onClick={() => openProductDetail(product)}
              className="min-h-36 rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex h-full flex-col justify-between">
                <div>
                  <div className="font-semibold">{product.name}</div>
                  <div className="text-xs text-slate-500">{product.category?.name}</div>
                  {!product.currentCost && <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Cost Not Set</span>}
                </div>
                <div>
                  <div className="text-lg font-bold text-orange-600">{pkr(product.sellingPrice)}</div>
                  <div className={`text-xs ${product.currentStock <= product.minStockLevel ? 'text-red-600' : 'text-slate-500'}`}>
                    {formatQuantity(product.currentStock, product.unit)} available
                  </div>
                  <div className="mt-2 rounded bg-[#0f615d] px-2 py-1 text-center text-xs font-semibold text-white">Select</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      )}

      {selectedProduct && (
      <aside className="sticky top-20 self-start rounded-lg border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Cart &amp; Checkout</h2>
          <span className="rounded-full bg-[#e8f3f1] px-3 py-1 text-xs font-bold text-[#0f615d]">{cart.length} item{cart.length === 1 ? '' : 's'}</span>
        </div>
        <div className="max-h-[42vh] space-y-2 overflow-auto pr-1">
          {cart.map((line) => (
            <div key={line.product.id} className="rounded-md border p-3 dark:border-slate-800">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-medium">{line.product.name}</div>
                  <div className="text-xs text-slate-500">{pkr(line.product.sellingPrice)} / {line.product.unit}</div>
                </div>
                <button className="touch text-red-600" onClick={() => removeLine(line.product.id)} aria-label="Remove">
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center rounded-md border dark:border-slate-700">
                  <button className="touch" onClick={() => updateQty(line.product.id, -1)} aria-label="Decrease"><Minus size={16} /></button>
                  <input className="w-20 bg-transparent text-center outline-none" type="number" min="0" step={line.displayUnit === 'GRAM' ? 1 : 0.001} value={line.displayQuantity || ''} placeholder="0" onChange={(event) => setDisplayQty(line.product.id, Number(event.target.value))} />
                  <button className="touch disabled:opacity-40" disabled={line.quantity >= line.product.currentStock} onClick={() => updateQty(line.product.id, 1)} aria-label="Increase"><Plus size={16} /></button>
                </div>
                {line.product.unit === 'KG' ? (
                  <select className="h-11 rounded-md border bg-transparent px-2 text-sm" value={line.displayUnit} onChange={(event) => setDisplayUnit(line.product.id, event.target.value as Unit)}>
                    <option value="GRAM">GRAM</option>
                    <option value="KG">KG</option>
                  </select>
                ) : <span className="text-sm font-semibold">{line.displayUnit}</span>}
                <input className="h-11 w-28 rounded-md border bg-transparent px-2 text-right font-semibold" type="number" min="0" step="0.001" value={line.lineTotal || ''} placeholder="Price" onChange={(event) => setLineTotal(line.product.id, Number(event.target.value))} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Billing: {formatQuantity(line.displayQuantity, line.displayUnit)} | Stock deduct: {formatQuantity(line.quantity, line.product.unit)}</div>
              <select className="mt-2 w-full rounded-md border bg-transparent px-2 py-1 text-[11px] dark:border-slate-700" value={line.packagingTypeId || ''} onChange={(event) => updatePackaging(line.product.id, event.target.value)}><option value="">No Packaging</option>{line.packagingOptions.map((option) => <option key={option.id} value={option.id}>{option.name} (+Rs. {option.extraCharge}{option.chargeType === 'PER_KG' ? '/kg' : option.chargeType === 'PERCENTAGE' ? '%' : ''})</option>)}</select>
              {line.packagingCharge > 0 && <div className="mt-1 flex justify-between text-xs font-semibold text-[#0f615d]"><span>Packaging</span><span>{pkr(line.packagingCharge)}</span></div>}
              {line.quantity >= line.product.currentStock && <div className="mt-1 text-xs text-red-600">Only {formatQuantity(line.product.currentStock, line.product.unit)} available</div>}
            </div>
          ))}
          {cart.length === 0 && <div className="rounded-md bg-slate-100 p-6 text-center text-sm text-slate-500 dark:bg-slate-800">Add this product to begin the bill, or go back to select another product.</div>}
        </div>
        <div className="mt-4 space-y-3 border-t pt-4 dark:border-slate-800">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{pkr(subtotal)}</span></div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>Discount</span>
            <input className="w-32 rounded-md border bg-transparent px-3 py-2 text-right dark:border-slate-700" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={isDelivery} onChange={(e) => setIsDelivery(e.target.checked)} />
            <span>Delivery Order</span>
          </label>
          {isDelivery && (
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>Delivery Charges</span>
              <input className="w-32 rounded-md border bg-transparent px-3 py-2 text-right dark:border-slate-700" type="number" min="0" value={deliveryCharges} onChange={(e) => setDeliveryCharges(e.target.value)} />
            </label>
          )}
          <div className="flex justify-between text-xl font-bold"><span>Total</span><span>{pkr(total)}</span></div>
          <div className="grid grid-cols-2 gap-2">
            {(['CASH', 'CARD', 'JAZZCASH', 'EASYPAISA'] as PaymentMethod[]).map((method) => (
              <button key={method} className={`touch rounded-md border text-sm ${paymentMethod === method ? 'border-orange-600 bg-orange-50 text-orange-700 dark:bg-orange-950' : 'dark:border-slate-700'}`} onClick={() => setPaymentMethod(method)}>
                {method}
              </button>
            ))}
          </div>
          {paymentMethod === 'CASH' && (
            <div className="space-y-2 rounded-md border p-3 text-sm dark:border-slate-800">
              <label className="flex items-center justify-between gap-3">
                <span>Cash Received</span>
                <input className="w-32 rounded-md border bg-transparent px-3 py-2 text-right dark:border-slate-700" type="number" min="0" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
              </label>
              <div className={`flex justify-between font-semibold ${cashChange !== null && cashChange < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                <span>Change</span><span>{cashChange === null ? pkr(0) : pkr(Math.max(cashChange, 0))}</span>
              </div>
              {cashChange !== null && cashChange < 0 && <div className="text-xs text-red-600">Amount entered is less than total</div>}
            </div>
          )}
          <button className="touch w-full rounded-md bg-green-600 font-bold text-white transition hover:bg-green-700 disabled:opacity-50" disabled={!payableLines.length || saleMutation.isPending || (paymentMethod === 'CASH' && cashChange !== null && cashChange < 0)} onClick={() => saleMutation.mutate({})}>
            Complete Sale
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="touch flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700" disabled={!lastSale} onClick={() => lastSale && silentPrint(renderToStaticMarkup(<POSReceipt sale={lastSale} settings={settings.data} />))}>
              <Printer size={16} /> Print Receipt
            </button>
            <button className="touch flex items-center justify-center gap-2 rounded-md border border-blue-300 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-40" disabled={!payableLines.length || saleMutation.isPending} onClick={() => {
              setTokenNumber(String(nextToken.data?.nextNumber || ''));
              setShowTokenInput(true);
            }}>
              <Ticket size={16} /> Generate Token
            </button>
          </div>
          {showTokenInput && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
              <span className="text-sm font-semibold text-blue-700">Token No:</span>
              <input
                type="number"
                autoFocus
                value={tokenNumber}
                onChange={(event) => setTokenNumber(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitTokenSale();
                }}
                className="h-10 w-20 rounded border border-blue-300 bg-white px-2 text-center text-lg font-bold outline-none"
                placeholder="1"
              />
              <button className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" type="button" disabled={!Number(tokenNumber || nextToken.data?.nextNumber || 0) || saleMutation.isPending} onClick={submitTokenSale}>
                Print
              </button>
              <button className="px-2 text-sm font-semibold text-slate-500" type="button" onClick={() => setShowTokenInput(false)}>Cancel</button>
            </div>
          )}
        </div>
      </aside>
      )}
    </div>
  );
}
