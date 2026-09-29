import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { queryClient } from '../../queryClient';
import { useUiStore } from '../../store/ui';
import type { RawMaterial } from '../../types';
import { formatQuantity } from '../../utils/format';
import { printElement } from '../../utils/print';

export type KitchenSection = 'stock' | 'transfers' | 'adjustments' | 'reports';

const localDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

export default function Kitchen({ section = 'stock' }: { section?: KitchenSection }) {
  const toast = useUiStore((state) => state.toast);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [transfer, setTransfer] = useState({ rawMaterialId: '', quantity: '', transferDate: localDateTime(), receivedBy: '', notes: '' });
  const [adjustment, setAdjustment] = useState({ rawMaterialId: '', quantity: '', adjustType: 'WASTAGE', reason: '', adjustedAt: localDateTime() });

  const stock = useQuery({ queryKey: ['kitchen-stock'], queryFn: () => unwrap<any[]>(api.get('/api/kitchen/stock')) });
  const transfers = useQuery({ queryKey: ['kitchen-transfers'], queryFn: () => unwrap<any[]>(api.get('/api/kitchen/transfers')) });
  const adjustments = useQuery({ queryKey: ['kitchen-adjustments'], queryFn: () => unwrap<any[]>(api.get('/api/kitchen/adjustments')) });
  const consumptionReport = useQuery({ queryKey: ['kitchen-consumption-report'], queryFn: () => unwrap<any[]>(api.get('/api/kitchen/reports/consumption')) });
  const transferReport = useQuery({ queryKey: ['kitchen-transfer-report'], queryFn: () => unwrap<any[]>(api.get('/api/kitchen/reports/transfers')) });
  const materials = useQuery({ queryKey: ['raw-materials-kitchen'], queryFn: () => unwrap<RawMaterial[]>(api.get('/api/raw-materials')) });
  const selectedTransferMaterial = materials.data?.find((row) => row.id === transfer.rawMaterialId);

  const transferMutation = useMutation({
    mutationFn: () => unwrap(api.post('/api/kitchen/transfers', { ...transfer, quantity: Number(transfer.quantity), unit: selectedTransferMaterial?.unit })),
    onSuccess: () => {
      toast('Stock transferred to kitchen');
      setTransferOpen(false);
      setTransfer({ rawMaterialId: '', quantity: '', transferDate: localDateTime(), receivedBy: '', notes: '' });
      ['kitchen-stock', 'kitchen-transfers', 'kitchen-transfer-report', 'raw-materials'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Transfer failed', 'error')
  });

  const adjustmentMutation = useMutation({
    mutationFn: () => unwrap(api.post('/api/kitchen/adjustments', { ...adjustment, quantity: Number(adjustment.quantity) })),
    onSuccess: () => {
      toast('Kitchen adjustment saved');
      setAdjustmentOpen(false);
      setAdjustment({ rawMaterialId: '', quantity: '', adjustType: 'WASTAGE', reason: '', adjustedAt: localDateTime() });
      queryClient.invalidateQueries({ queryKey: ['kitchen-stock'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-adjustments'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Adjustment failed', 'error')
  });

  return (
    <div className="space-y-4">
      {section === 'stock' && <Panel title="Kitchen Stock"><Table headings={['Raw Material', 'Unit', 'Transferred In', 'Consumed', 'Adjusted', 'Current Balance']} rows={(stock.data || []).map((row) => [row.name, row.unit, formatQuantity(row.transferredIn, row.unit), formatQuantity(row.consumed, row.unit), formatQuantity(row.adjusted, row.unit), <b className={row.currentBalance < row.minStockLevel ? 'text-red-600' : 'text-emerald-700'}>{formatQuantity(row.currentBalance, row.unit)}</b>])} /></Panel>}
      {section === 'transfers' && <Panel title="Kitchen Transfers" action={<button className="btn-primary inline-flex items-center gap-2" onClick={() => setTransferOpen(true)}><Plus size={16} /> New Transfer</button>}><Table headings={['Date', 'Material', 'Qty', 'Transferred By', 'Received By', 'Notes']} rows={(transfers.data || []).map((row) => [new Date(row.transferDate).toLocaleString(), row.rawMaterial?.name, formatQuantity(row.quantity, row.unit), row.transferredByUser?.name, row.receivedBy || '—', row.notes || '—'])} /></Panel>}
      {section === 'adjustments' && <Panel title="Kitchen Adjustments" action={<button className="btn-primary inline-flex items-center gap-2" onClick={() => setAdjustmentOpen(true)}><Plus size={16} /> New Adjustment</button>}><Table headings={['Date', 'Material', 'Qty', 'Type', 'Reason', 'By']} rows={(adjustments.data || []).map((row) => [new Date(row.adjustedAt).toLocaleString(), row.rawMaterial?.name, <span className={row.quantity < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatQuantity(row.quantity, row.rawMaterial?.unit)}</span>, row.adjustType.replaceAll('_', ' '), row.reason, row.adjustedByUser?.name])} /></Panel>}
      {section === 'reports' && <div id="kitchen-reports-print" className="space-y-4 bg-white"><div className="flex justify-end print:hidden"><button className="btn-secondary inline-flex items-center gap-2" onClick={() => printElement('kitchen-reports-print')}><Printer size={16} /> Print Reports</button></div><Panel title="Consumption Report"><Table headings={['Date', 'Product', 'Material', 'Expected', 'Actual', 'Variance']} rows={(consumptionReport.data || []).map((row) => [new Date(row.date).toLocaleDateString(), row.product, row.material, formatQuantity(row.expected, row.unit), formatQuantity(row.actual, row.unit), formatQuantity(row.variance, row.unit)])} /></Panel><Panel title="Transfer Log"><Table headings={['Date', 'Material', 'Quantity', 'Transferred By', 'Received By']} rows={(transferReport.data || []).map((row) => [new Date(row.transferDate).toLocaleString(), row.rawMaterial?.name, formatQuantity(row.quantity, row.unit), row.transferredByUser?.name, row.receivedBy || '—'])} /></Panel></div>}

      <Modal isOpen={transferOpen} onClose={() => setTransferOpen(false)} title="New Transfer to Kitchen" size="md">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); transferMutation.mutate(); }}>
          <label className="grid gap-1 text-sm"><span>Raw Material *</span><select className="erp-input" required value={transfer.rawMaterialId} onChange={(event) => setTransfer({ ...transfer, rawMaterialId: event.target.value })}><option value="">Search / select material</option>{materials.data?.map((row) => <option key={row.id} value={row.id}>{row.name} — {formatQuantity(row.currentStock, row.unit)} available</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm"><span>Quantity *</span><input className="erp-input no-spinner" type="number" min="0.001" step="0.001" required value={transfer.quantity} onChange={(event) => setTransfer({ ...transfer, quantity: event.target.value })} /></label><label className="grid gap-1 text-sm"><span>Unit</span><input className="erp-input" disabled value={selectedTransferMaterial?.unit || ''} /></label></div>
          <label className="grid gap-1 text-sm"><span>Date & Time</span><input className="erp-input" type="datetime-local" value={transfer.transferDate} onChange={(event) => setTransfer({ ...transfer, transferDate: event.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Received By</span><input className="erp-input" value={transfer.receivedBy} onChange={(event) => setTransfer({ ...transfer, receivedBy: event.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Notes</span><textarea className="erp-input" value={transfer.notes} onChange={(event) => setTransfer({ ...transfer, notes: event.target.value })} /></label>
          <ModalButtons cancel={() => setTransferOpen(false)} pending={transferMutation.isPending} label="Transfer to Kitchen" />
        </form>
      </Modal>

      <Modal isOpen={adjustmentOpen} onClose={() => setAdjustmentOpen(false)} title="New Kitchen Adjustment" size="md">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); adjustmentMutation.mutate(); }}>
          <label className="grid gap-1 text-sm"><span>Raw Material *</span><select className="erp-input" required value={adjustment.rawMaterialId} onChange={(event) => setAdjustment({ ...adjustment, rawMaterialId: event.target.value })}><option value="">Select material</option>{materials.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span>Type *</span><select className="erp-input" value={adjustment.adjustType} onChange={(event) => setAdjustment({ ...adjustment, adjustType: event.target.value })}><option value="WASTAGE">Wastage</option><option value="RETURN_TO_INVENTORY">Return to Inventory</option><option value="MANUAL_CORRECTION">Manual Correction</option></select></label>
          <label className="grid gap-1 text-sm"><span>Quantity * {adjustment.adjustType === 'MANUAL_CORRECTION' && '(positive adds, negative removes)'}</span><input className="erp-input no-spinner" required type="number" step="0.001" value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Reason *</span><input className="erp-input" required value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} /></label>
          <label className="grid gap-1 text-sm"><span>Date & Time</span><input className="erp-input" type="datetime-local" value={adjustment.adjustedAt} onChange={(event) => setAdjustment({ ...adjustment, adjustedAt: event.target.value })} /></label>
          <ModalButtons cancel={() => setAdjustmentOpen(false)} pending={adjustmentMutation.isPending} label="Save Adjustment" />
        </form>
      </Modal>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-lg border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2>{action}</div>{children}</section>;
}

function Table({ headings, rows }: { headings: string[]; rows: React.ReactNode[][] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-slate-500"><tr>{headings.map((heading) => <th key={heading} className="py-2">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t dark:border-slate-800">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-3 pr-3">{cell}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headings.length} className="py-8 text-center text-slate-500">No records found.</td></tr>}</tbody></table></div>;
}

function ModalButtons({ cancel, pending, label }: { cancel: () => void; pending: boolean; label: string }) {
  return <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={cancel}>Cancel</button><button className="btn-primary" disabled={pending}>{pending ? 'Saving...' : label}</button></div>;
}
