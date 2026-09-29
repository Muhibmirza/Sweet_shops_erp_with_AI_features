import prisma from '../utils/prisma';

export type ErpDataIntent =
  | 'NONE'
  | 'BUSINESS_OVERVIEW'
  | 'SALES_SUMMARY'
  | 'PRODUCT_STOCK'
  | 'LOW_STOCK'
  | 'TOP_PRODUCTS'
  | 'RAW_MATERIAL_STOCK'
  | 'KITCHEN_STOCK'
  | 'ORDERS_SUMMARY'
  | 'EXPENSE_SUMMARY'
  | 'CUSTOMER_BALANCE'
  | 'SUPPLIER_BALANCE'
  | 'PRODUCTION_SUMMARY'
  | 'PAYROLL_SUMMARY';

export interface ErpDataPlan {
  intent: ErpDataIntent;
  startDate: string;
  endDate: string;
  search: string;
  limit: number;
}

const ROLE_ACCESS: Record<Exclude<ErpDataIntent, 'NONE'>, string[]> = {
  BUSINESS_OVERVIEW: ['ADMIN', 'MANAGER', 'CASHIER', 'PRODUCTION_MANAGER'],
  SALES_SUMMARY: ['ADMIN', 'MANAGER', 'CASHIER'],
  PRODUCT_STOCK: ['ADMIN', 'MANAGER', 'CASHIER', 'PRODUCTION_MANAGER'],
  LOW_STOCK: ['ADMIN', 'MANAGER', 'CASHIER', 'PRODUCTION_MANAGER'],
  TOP_PRODUCTS: ['ADMIN', 'MANAGER', 'CASHIER'],
  RAW_MATERIAL_STOCK: ['ADMIN', 'PRODUCTION_MANAGER'],
  KITCHEN_STOCK: ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'],
  ORDERS_SUMMARY: ['ADMIN', 'CASHIER', 'PRODUCTION_MANAGER'],
  EXPENSE_SUMMARY: ['ADMIN'],
  CUSTOMER_BALANCE: ['ADMIN', 'CASHIER'],
  SUPPLIER_BALANCE: ['ADMIN', 'PRODUCTION_MANAGER'],
  PRODUCTION_SUMMARY: ['ADMIN', 'PRODUCTION_MANAGER'],
  PAYROLL_SUMMARY: ['ADMIN']
};

const pakistanDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00+05:00`).getTime());

function dateRange(plan: ErpDataPlan) {
  const today = pakistanDate();
  const start = validDate(plan.startDate) ? plan.startDate : today;
  const end = validDate(plan.endDate) ? plan.endDate : start;
  return {
    label: start === end ? start : `${start} to ${end}`,
    where: { gte: new Date(`${start}T00:00:00+05:00`), lte: new Date(`${end}T23:59:59.999+05:00`) }
  };
}

const cleanSearch = (value: string) => String(value || '').replace(/[\r\n|]+/g, ' ').trim().slice(0, 100);
const boundedLimit = (value: number) => Math.min(Math.max(Number(value) || 10, 1), 50);
const round = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

async function salesSummary(plan: ErpDataPlan, user: { id: string; role: string }) {
  const range = dateRange(plan);
  const where: any = { createdAt: range.where };
  if (user.role === 'CASHIER') where.cashierId = user.id;
  const [totals, paymentMethods, itemTotals, returns] = await Promise.all([
    prisma.sale.aggregate({ where, _count: true, _sum: { totalAmount: true, netAmount: true, discount: true, deliveryCharges: true } }),
    prisma.sale.groupBy({ by: ['paymentMethod'], where, _count: true, _sum: { netAmount: true } }),
    prisma.saleItem.aggregate({ where: { sale: where }, _sum: { quantity: true, subtotal: true, packagingCharge: true, profit: true } }),
    prisma.saleReturn.aggregate({ where: { createdAt: range.where }, _count: true, _sum: { totalAmount: true } })
  ]);
  return {
    period: range.label,
    scope: user.role === 'CASHIER' ? 'signed-in cashier only' : 'all cashiers',
    invoices: totals._count,
    grossSales: round(totals._sum.totalAmount),
    netSales: round(totals._sum.netAmount),
    discounts: round(totals._sum.discount),
    deliveryCharges: round(totals._sum.deliveryCharges),
    returnedAmount: round(returns._sum.totalAmount),
    returnCount: returns._count,
    quantitySold: round(itemTotals._sum.quantity),
    packagingRevenue: round(itemTotals._sum.packagingCharge),
    recordedProfit: user.role === 'ADMIN' ? round(itemTotals._sum.profit) : undefined,
    payments: paymentMethods.map((row) => ({ method: row.paymentMethod, invoices: row._count, amount: round(row._sum.netAmount) }))
  };
}

async function productStock(plan: ErpDataPlan, role: string, lowOnly = false) {
  const search = cleanSearch(plan.search).toLowerCase();
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { name: true, skuCode: true, unit: true, saleMode: true, currentStock: true, minStockLevel: true, sellingPrice: true, currentCost: true, costPrice: true, category: { select: { name: true } } },
    orderBy: { name: 'asc' }
  });
  const filtered = products.filter((product) => {
    const matchesSearch = !search || product.name.toLowerCase().includes(search) || String(product.skuCode || '').toLowerCase().includes(search);
    return matchesSearch && (!lowOnly || product.currentStock <= product.minStockLevel);
  });
  const limit = boundedLimit(plan.limit);
  return {
    search: search || 'all active products',
    matchingProducts: filtered.length,
    inventoryValueAtCurrentCost: role === 'ADMIN' ? round(filtered.reduce((sum, row) => sum + row.currentStock * Number(row.currentCost || row.costPrice || 0), 0)) : undefined,
    products: filtered.slice(0, limit).map((row) => ({
      name: row.name,
      category: row.category.name,
      stock: round(row.currentStock),
      unit: row.unit,
      saleMode: row.saleMode,
      minimumStock: round(row.minStockLevel),
      sellingPrice: round(row.sellingPrice),
      lowStock: row.currentStock <= row.minStockLevel
    })),
    resultLimit: limit
  };
}

async function topProducts(plan: ErpDataPlan, user: { id: string; role: string }) {
  const range = dateRange(plan);
  const saleWhere: any = { createdAt: range.where };
  if (user.role === 'CASHIER') saleWhere.cashierId = user.id;
  const rows = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: { sale: saleWhere },
    _sum: { quantity: true, subtotal: true, packagingCharge: true },
    orderBy: { _sum: { subtotal: 'desc' } },
    take: boundedLimit(plan.limit)
  });
  const products = await prisma.product.findMany({ where: { id: { in: rows.map((row) => row.productId) } }, select: { id: true, name: true, unit: true } });
  const names = new Map(products.map((product) => [product.id, product]));
  return {
    period: range.label,
    products: rows.map((row) => ({ name: names.get(row.productId)?.name || 'Unknown product', quantity: round(row._sum.quantity), unit: names.get(row.productId)?.unit || '', salesAmount: round(row._sum.subtotal), packagingRevenue: round(row._sum.packagingCharge) }))
  };
}

async function rawMaterialStock(plan: ErpDataPlan) {
  const search = cleanSearch(plan.search).toLowerCase();
  const rows = await prisma.rawMaterial.findMany({ where: { isActive: true }, select: { name: true, unit: true, currentStock: true, minStockLevel: true, avgCost: true, costPerUnit: true }, orderBy: { name: 'asc' } });
  const filtered = rows.filter((row) => !search || row.name.toLowerCase().includes(search));
  return {
    matchingMaterials: filtered.length,
    inventoryValue: round(filtered.reduce((sum, row) => sum + row.currentStock * Number(row.avgCost || row.costPerUnit || 0), 0)),
    materials: filtered.slice(0, boundedLimit(plan.limit)).map((row) => ({ name: row.name, stock: round(row.currentStock), unit: row.unit, minimumStock: round(row.minStockLevel), lowStock: row.currentStock <= row.minStockLevel, averageCost: round(row.avgCost || row.costPerUnit) }))
  };
}

async function kitchenStock(plan: ErpDataPlan) {
  const search = cleanSearch(plan.search).toLowerCase();
  const [materials, transfers, consumptions, adjustments] = await Promise.all([
    prisma.rawMaterial.findMany({ where: { isActive: true }, select: { id: true, name: true, unit: true, minStockLevel: true }, orderBy: { name: 'asc' } }),
    prisma.kitchenTransfer.groupBy({ by: ['rawMaterialId'], _sum: { quantity: true } }),
    prisma.kitchenConsumption.groupBy({ by: ['rawMaterialId'], _sum: { quantityDeducted: true } }),
    prisma.kitchenAdjustment.groupBy({ by: ['rawMaterialId'], _sum: { quantity: true } })
  ]);
  const transferMap = new Map(transfers.map((row) => [row.rawMaterialId, Number(row._sum.quantity || 0)]));
  const consumptionMap = new Map(consumptions.map((row) => [row.rawMaterialId, Number(row._sum.quantityDeducted || 0)]));
  const adjustmentMap = new Map(adjustments.map((row) => [row.rawMaterialId, Number(row._sum.quantity || 0)]));
  const rows = materials.filter((row) => !search || row.name.toLowerCase().includes(search)).map((row) => {
    const transferred = transferMap.get(row.id) || 0;
    const consumed = consumptionMap.get(row.id) || 0;
    const adjusted = adjustmentMap.get(row.id) || 0;
    const balance = transferred - consumed + adjusted;
    return { name: row.name, unit: row.unit, transferred: round(transferred), consumed: round(consumed), adjusted: round(adjusted), balance: round(balance), minimumStock: round(row.minStockLevel), lowStock: balance < row.minStockLevel };
  });
  return { matchingMaterials: rows.length, materials: rows.slice(0, boundedLimit(plan.limit)) };
}

async function ordersSummary(plan: ErpDataPlan) {
  const range = dateRange(plan);
  const rows = await prisma.order.groupBy({ by: ['status'], where: { createdAt: range.where }, _count: true, _sum: { totalAmount: true, advancePaid: true, dueAmount: true } });
  return { period: range.label, totalOrders: rows.reduce((sum, row) => sum + row._count, 0), statuses: rows.map((row) => ({ status: row.status, orders: row._count, total: round(row._sum.totalAmount), advancePaid: round(row._sum.advancePaid), due: round(row._sum.dueAmount) })) };
}

async function expenseSummary(plan: ErpDataPlan) {
  const range = dateRange(plan);
  const rows = await prisma.expense.groupBy({ by: ['category'], where: { date: range.where }, _count: true, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } });
  return { period: range.label, totalExpenses: round(rows.reduce((sum, row) => sum + Number(row._sum.amount || 0), 0)), categories: rows.map((row) => ({ category: row.category, entries: row._count, amount: round(row._sum.amount) })) };
}

async function namedBalances(plan: ErpDataPlan, type: 'customer' | 'supplier') {
  const search = cleanSearch(plan.search).toLowerCase();
  const limit = boundedLimit(plan.limit);
  if (type === 'customer') {
    const rows = await prisma.customer.findMany({ where: { isActive: true }, select: { name: true, outstandingBalance: true, creditLimit: true, totalOrders: true }, orderBy: { outstandingBalance: 'desc' } });
    const filtered = rows.filter((row) => !search || row.name.toLowerCase().includes(search));
    return { matchingCustomers: filtered.length, totalOutstanding: round(filtered.reduce((sum, row) => sum + row.outstandingBalance, 0)), customers: filtered.slice(0, limit) };
  }
  const rows = await prisma.supplier.findMany({ where: { isActive: true }, select: { name: true, balance: true }, orderBy: { balance: 'desc' } });
  const filtered = rows.filter((row) => !search || row.name.toLowerCase().includes(search));
  return { matchingSuppliers: filtered.length, totalBalance: round(filtered.reduce((sum, row) => sum + row.balance, 0)), suppliers: filtered.slice(0, limit) };
}

async function productionSummary(plan: ErpDataPlan) {
  const range = dateRange(plan);
  const statuses = await prisma.productionOrder.groupBy({ by: ['status'], where: { productionDate: range.where }, _count: true, _sum: { plannedQuantity: true, actualQuantity: true, totalCost: true } });
  const recent = await prisma.productionOrder.findMany({ where: { productionDate: range.where }, select: { status: true, plannedQuantity: true, actualQuantity: true, totalCost: true, product: { select: { name: true, unit: true } } }, orderBy: { productionDate: 'desc' }, take: boundedLimit(plan.limit) });
  return { period: range.label, statuses: statuses.map((row) => ({ status: row.status, runs: row._count, planned: round(row._sum.plannedQuantity), actual: round(row._sum.actualQuantity), cost: round(row._sum.totalCost) })), recent: recent.map((row) => ({ product: row.product.name, unit: row.product.unit, status: row.status, planned: round(row.plannedQuantity), actual: round(row.actualQuantity), cost: round(row.totalCost) })) };
}

async function payrollSummary(plan: ErpDataPlan) {
  const selectedDate = validDate(plan.startDate) ? plan.startDate : pakistanDate();
  const [year, month] = selectedDate.split('-').map(Number);
  const rows = await prisma.salary.aggregate({ where: { year, month }, _count: true, _sum: { grossWage: true, netSalary: true, deductions: true, bonuses: true } });
  return { month: `${year}-${String(month).padStart(2, '0')}`, salaryRecords: rows._count, grossWages: round(rows._sum.grossWage), netSalary: round(rows._sum.netSalary), deductions: round(rows._sum.deductions), bonuses: round(rows._sum.bonuses) };
}

export function canReadErpData(intent: ErpDataIntent, role: string) {
  return intent === 'NONE' || ROLE_ACCESS[intent].includes(role);
}

export async function queryErpData(plan: ErpDataPlan, user: { id: string; role: string }) {
  if (plan.intent === 'NONE') return null;
  if (!canReadErpData(plan.intent, user.role)) throw Object.assign(new Error('Aap ke role ko is data ki permission nahi hai.'), { status: 403 });

  let data: unknown;
  switch (plan.intent) {
    case 'SALES_SUMMARY': data = await salesSummary(plan, user); break;
    case 'PRODUCT_STOCK': data = await productStock(plan, user.role); break;
    case 'LOW_STOCK': data = await productStock(plan, user.role, true); break;
    case 'TOP_PRODUCTS': data = await topProducts(plan, user); break;
    case 'RAW_MATERIAL_STOCK': data = await rawMaterialStock(plan); break;
    case 'KITCHEN_STOCK': data = await kitchenStock(plan); break;
    case 'ORDERS_SUMMARY': data = await ordersSummary(plan); break;
    case 'EXPENSE_SUMMARY': data = await expenseSummary(plan); break;
    case 'CUSTOMER_BALANCE': data = await namedBalances(plan, 'customer'); break;
    case 'SUPPLIER_BALANCE': data = await namedBalances(plan, 'supplier'); break;
    case 'PRODUCTION_SUMMARY': data = await productionSummary(plan); break;
    case 'PAYROLL_SUMMARY': data = await payrollSummary(plan); break;
    case 'BUSINESS_OVERVIEW': {
      const tasks: Array<Promise<unknown>> = [];
      const labels: string[] = [];
      if (canReadErpData('SALES_SUMMARY', user.role)) { labels.push('sales'); tasks.push(salesSummary(plan, user)); }
      if (canReadErpData('LOW_STOCK', user.role)) { labels.push('lowStock'); tasks.push(productStock({ ...plan, limit: 15 }, user.role, true)); }
      if (canReadErpData('ORDERS_SUMMARY', user.role)) { labels.push('orders'); tasks.push(ordersSummary(plan)); }
      if (canReadErpData('PRODUCTION_SUMMARY', user.role)) { labels.push('production'); tasks.push(productionSummary({ ...plan, limit: 10 })); }
      if (canReadErpData('EXPENSE_SUMMARY', user.role)) { labels.push('expenses'); tasks.push(expenseSummary(plan)); }
      const values = await Promise.all(tasks);
      data = Object.fromEntries(labels.map((label, index) => [label, values[index]]));
      break;
    }
  }
  return { intent: plan.intent, generatedAt: new Date().toISOString(), readOnly: true, data };
}
