import prisma from '../utils/prisma';

type TxClient = any;

const SYSTEM_EMAIL = 'admin@easternsweets.com';

const expenseAccountByCategory: Record<string, string> = {
  rent: '4003',
  electricity: '4004',
  gas: '4005',
  fuel: '4006',
  repair: '4007',
  repairs: '4007',
  maintenance: '4007',
  miscellaneous: '4008',
  misc: '4008'
};

const defaultAccountsByCode: Record<string, { name: string; type: string; subType: string }> = {
  '1001': { name: 'Cash in Hand', type: 'ASSET', subType: 'CASH' },
  '1002': { name: 'Bank Account', type: 'ASSET', subType: 'BANK' },
  '1100': { name: 'Inventory - Raw Materials', type: 'ASSET', subType: 'INVENTORY' },
  '1101': { name: 'Inventory - Finished Goods', type: 'ASSET', subType: 'INVENTORY' },
  '1102': { name: 'Kitchen / WIP Inventory', type: 'ASSET', subType: 'INVENTORY' },
  '1200': { name: 'Employee Advances', type: 'ASSET', subType: 'RECEIVABLE' },
  '1201': { name: 'Supplier Advances', type: 'ASSET', subType: 'RECEIVABLE' },
  '1300': { name: 'Accounts Receivable', type: 'ASSET', subType: 'RECEIVABLE' },
  '2001': { name: 'Accounts Payable (Supplier)', type: 'LIABILITY', subType: 'PAYABLE' },
  '2002': { name: 'Salary Payable', type: 'LIABILITY', subType: 'PAYABLE' },
  '2003': { name: 'Tax Payable', type: 'LIABILITY', subType: 'TAX' },
  '3001': { name: 'Sales Revenue', type: 'INCOME', subType: 'REVENUE' },
  '3002': { name: 'Other Income', type: 'INCOME', subType: 'REVENUE' },
  '4001': { name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', subType: 'COST_OF_GOODS' },
  '4002': { name: 'Salary Expense', type: 'EXPENSE', subType: 'SALARY' },
  '4003': { name: 'Rent Expense', type: 'EXPENSE', subType: 'RENT' },
  '4004': { name: 'Electricity Expense', type: 'EXPENSE', subType: 'ELECTRICITY' },
  '4005': { name: 'Gas Expense', type: 'EXPENSE', subType: 'GAS' },
  '4006': { name: 'Fuel Expense', type: 'EXPENSE', subType: 'FUEL' },
  '4007': { name: 'Repair & Maintenance', type: 'EXPENSE', subType: 'REPAIRS' },
  '4008': { name: 'Miscellaneous Expense', type: 'EXPENSE', subType: 'MISC' },
  '5001': { name: 'Owner Equity', type: 'EQUITY', subType: 'EQUITY' },
  '5002': { name: 'Retained Earnings', type: 'EQUITY', subType: 'EQUITY' }
};

const nextEntryNo = () => `JE-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

const getSystemUserId = async (tx: TxClient) => {
  const admin = await tx.user.findFirst({
    where: { email: SYSTEM_EMAIL },
    select: { id: true }
  });
  if (admin) return admin.id;

  const user = await tx.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No user exists for journal entry creation');
  return user.id;
};

const getSignedBalanceDelta = (account: any, debit: number, credit: number) => {
  if (account.type === 'ASSET' || account.type === 'EXPENSE') return debit - credit;
  return credit - debit;
};

export const recalculateAccountBalances = async (tx: TxClient = prisma) => {
  const accounts = await tx.chartOfAccounts.findMany({
    include: { lines: true }
  });

  for (const account of accounts) {
    const balance = account.lines.reduce((sum: number, line: any) => {
      return sum + getSignedBalanceDelta(account, Number(line.debit || 0), Number(line.credit || 0));
    }, 0);
    await tx.chartOfAccounts.update({
      where: { id: account.id },
      data: { balance }
    });
  }
};

export const getAccountByCode = async (code: string, tx: TxClient = prisma) => {
  let account = await tx.chartOfAccounts.findUnique({ where: { code } });
  if (!account && defaultAccountsByCode[code]) {
    account = await tx.chartOfAccounts.create({
      data: { code, ...defaultAccountsByCode[code] }
    });
  }
  if (!account) throw new Error(`Chart of account ${code} is missing`);
  return account;
};

const createEntry = async (
  tx: TxClient,
  referenceType: string,
  referenceId: string | null,
  description: string,
  lines: Array<{ code: string; debit?: number; credit?: number; description?: string }>,
  createdBy?: string
) => {
  const userId = createdBy || await getSystemUserId(tx);
  const accounts = await Promise.all(lines.map((line) => getAccountByCode(line.code, tx)));
  const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

  if (Math.abs(debitTotal - creditTotal) > 0.001) {
    throw new Error('Journal entry is not balanced');
  }

  const entry = await tx.journalEntry.create({
    data: {
      entryNo: nextEntryNo(),
      description,
      referenceType,
      referenceId,
      createdBy: userId,
      lines: {
        create: lines.map((line, index) => ({
          accountId: accounts[index].id,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          description: line.description
        }))
      }
    },
    include: { lines: { include: { account: true } } }
  });

  await Promise.all(lines.map((line, index) => {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const delta = getSignedBalanceDelta(accounts[index], debit, credit);
    return tx.chartOfAccounts.update({
      where: { id: accounts[index].id },
      data: { balance: { increment: delta } }
    });
  }));

  return entry;
};

export const createSaleEntry = (saleId: string, amount: number, tx: TxClient, cogs = 0) => {
  const lines: Array<{ code: string; debit?: number; credit?: number; description?: string }> = [
    { code: '1001', debit: amount, description: 'Cash received' },
    { code: '3001', credit: amount, description: 'Sales revenue' }
  ];
  if (cogs > 0) {
    lines.push(
      { code: '4001', debit: cogs, description: 'Cost of goods sold' },
      { code: '1101', credit: cogs, description: 'Finished goods inventory issued' }
    );
  }
  return createEntry(tx, 'SALE', saleId, `Cash sale ${saleId}`, lines);
};

export const createOrderRevenueEntry = (orderId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'ORDER', orderId, `Order delivery revenue ${orderId}`, [
    { code: '1001', debit: amount, description: 'Order amount received/receivable' },
    { code: '3001', credit: amount, description: 'Sales revenue from delivered order' }
  ]);

export const createPurchaseEntry = (purchaseId: string, _supplierId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'PURCHASE', purchaseId, `Purchase order ${purchaseId}`, [
    { code: '1100', debit: amount, description: 'Raw material inventory' },
    { code: '2001', credit: amount, description: 'Supplier payable' }
  ]);

export const createSupplierPaymentEntry = (supplierId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'PAYMENT', supplierId, `Supplier payment ${supplierId}`, [
    { code: '2001', debit: amount, description: 'Accounts payable settled' },
    { code: '1001', credit: amount, description: 'Cash paid' }
  ]);

export const createSupplierPaymentWithAdvanceEntry = (
  supplierId: string,
  paymentId: string,
  payableSettled: number,
  advanceDeduction: number,
  cashPaid: number,
  tx: TxClient
) => {
  const lines: Array<{ code: string; debit?: number; credit?: number; description?: string }> = [
    { code: '2001', debit: payableSettled, description: 'Accounts payable settled' }
  ];
  if (advanceDeduction > 0) {
    lines.push({ code: '1201', credit: advanceDeduction, description: 'Supplier advance recovered' });
  }
  if (cashPaid > 0) {
    lines.push({ code: '1001', credit: cashPaid, description: 'Cash paid after advance deduction' });
  }
  return createEntry(tx, 'PAYMENT', paymentId, `Supplier payment ${supplierId}`, lines);
};

export const createSupplierAdvanceEntry = (supplierId: string, advanceId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'PAYMENT', advanceId, `Supplier advance for ${supplierId}`, [
    { code: '1201', debit: amount, description: 'Supplier advance' },
    { code: '1001', credit: amount, description: 'Cash paid as advance' }
  ]);

export const createPurchaseReturnEntry = (returnId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'PURCHASE_RETURN', returnId, `Purchase return outward ${returnId}`, [
    { code: '2001', debit: amount, description: 'Supplier payable reduced' },
    { code: '1100', credit: amount, description: 'Raw material inventory returned' }
  ]);

export const createExpenseEntry = (expenseId: string, category: string, amount: number, tx: TxClient) => {
  const code = expenseAccountByCategory[String(category || '').toLowerCase()] || '4008';
  return createEntry(tx, 'EXPENSE', expenseId, `Expense: ${category}`, [
    { code, debit: amount, description: category },
    { code: '1001', credit: amount, description: 'Cash paid' }
  ]);
};

export const createSalaryExpenseEntry = (employeeId: string, salaryId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'SALARY', salaryId, `Salary generated for employee ${employeeId}`, [
    { code: '4002', debit: amount, description: 'Salary expense' },
    { code: '2002', credit: amount, description: 'Salary payable' }
  ]);

export const createSalaryPaymentEntry = (employeeId: string, salaryId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'PAYMENT', salaryId, `Salary paid to employee ${employeeId}`, [
    { code: '2002', debit: amount, description: 'Salary payable settled' },
    { code: '1001', credit: amount, description: 'Cash paid' }
  ]);

export const createAdvanceEntry = (employeeId: string, advanceId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'PAYMENT', advanceId, `Employee advance for ${employeeId}`, [
    { code: '1200', debit: amount, description: 'Employee advance' },
    { code: '1001', credit: amount, description: 'Cash paid' }
  ]);

export const createProductionEntry = (productionId: string, rawMaterialCost: number, finishedGoodsCost: number, tx: TxClient) => {
  const overheadCost = Math.max(0, Number(finishedGoodsCost || 0) - Number(rawMaterialCost || 0));
  const lines: Array<{ code: string; debit?: number; credit?: number; description?: string }> = [
    { code: '1101', debit: finishedGoodsCost, description: 'Finished goods inventory' },
    { code: '1102', credit: rawMaterialCost, description: 'Kitchen / WIP materials consumed' }
  ];
  if (overheadCost > 0) {
    lines.push({ code: '5002', credit: overheadCost, description: 'Production overhead capitalized' });
  }
  return createEntry(tx, 'PRODUCTION', productionId, `Production completed ${productionId}`, lines);
};

export const createKitchenTransferEntry = (transferId: string, amount: number, createdBy: string, tx: TxClient) => {
  if (amount <= 0) return Promise.resolve(null);
  return createEntry(tx, 'KITCHEN_TRANSFER', transferId, `Inventory transferred to kitchen ${transferId}`, [
    { code: '1102', debit: amount, description: 'Kitchen / WIP inventory received' },
    { code: '1100', credit: amount, description: 'Raw material inventory transferred' }
  ], createdBy);
};

export const createKitchenConsumptionEntry = (runId: string, amount: number, createdBy: string, tx: TxClient) => {
  if (amount <= 0) return Promise.resolve(null);
  return createEntry(tx, 'KITCHEN_PRODUCTION', runId, `Kitchen production run ${runId}`, [
    { code: '1101', debit: amount, description: 'Finished goods production cost' },
    { code: '1102', credit: amount, description: 'Kitchen materials consumed' }
  ], createdBy);
};

export const createSalesReturnEntry = (saleId: string, amount: number, tx: TxClient) =>
  createEntry(tx, 'SALE', saleId, `Sales return ${saleId}`, [
    { code: '3001', debit: amount, description: 'Sales return reversal' },
    { code: '1001', credit: amount, description: 'Cash refunded' }
  ]);

export const createManualEntry = (
  lines: Array<{ code: string; debit?: number; credit?: number; description?: string }>,
  description: string,
  createdBy: string,
  tx: TxClient = prisma
) => createEntry(tx, 'MANUAL', null, description, lines, createdBy);
