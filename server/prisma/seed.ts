import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
function bootstrapPassword(key: string) { const value = process.env[key]; if (!value || value.length < 8) throw new Error('Missing bootstrap password (minimum 8 characters): ' + key); return value; }
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ADMIN_ROLE = 'ADMIN' as any;
const PRODUCTION_MANAGER_ROLE = 'PRODUCTION_MANAGER' as any;
const CASHIER_ROLE = 'CASHIER' as any;

async function main() {

  const admin = await prisma.user.upsert({
    where: { email: 'admin@easternsweets.com' },
    update: { role: ADMIN_ROLE, isActive: true },
    create: {
      name: 'Admin',
      email: 'admin@easternsweets.com',
      password: await bcrypt.hash(bootstrapPassword('SEED_ADMIN_PASSWORD'), 12),
      role: ADMIN_ROLE
    }
  });

  await prisma.user.upsert({
    where: { email: 'cashier@easternsweets.com' },
    update: { role: CASHIER_ROLE, isActive: true },
    create: {
      name: 'Cashier',
      email: 'cashier@easternsweets.com',
      password: await bcrypt.hash(bootstrapPassword('SEED_CASHIER_PASSWORD'), 12),
      role: CASHIER_ROLE
    }
  });

  await prisma.user.upsert({
    where: { email: 'production@easternsweets.com' },
    update: { role: PRODUCTION_MANAGER_ROLE, isActive: true },
    create: {
      name: 'Production Manager',
      email: 'production@easternsweets.com',
      password: await bcrypt.hash(bootstrapPassword('SEED_PRODUCTION_PASSWORD'), 12),
      role: PRODUCTION_MANAGER_ROLE
    }
  });

  await prisma.shopSettings.upsert({
    where: { id: 'settings-1' },
    update: {
      shopName: 'Eastern Sweets',
      address: 'Eastern Sweets, Bakers & Nimco',
      city: 'Pakistan',
      currency: 'PKR',
      taxRate: 0
    },
    create: {
      id: 'settings-1',
      shopName: 'Eastern Sweets',
      address: 'Eastern Sweets, Bakers & Nimco',
      city: 'Pakistan',
      currency: 'PKR',
      taxRate: 0
    }
  });

  await prisma.kitchenConsumption.deleteMany({});
  await prisma.kitchenProductionRun.deleteMany({});
  await prisma.kitchenAdjustment.deleteMany({});
  await prisma.kitchenTransfer.deleteMany({});
  await prisma.packagingTypeCategory.deleteMany({});
  await prisma.packagingType.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.journalLine.deleteMany({});
  await prisma.journalEntry.deleteMany({});
  await prisma.productionConsumption.deleteMany({});
  await prisma.productionOrder.deleteMany({});
  await prisma.recipeIngredient.deleteMany({});
  await prisma.recipe.deleteMany({});
  await prisma.employeeAdvance.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.purchaseItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.salary.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.rawMaterial.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.chartOfAccounts.deleteMany({});

  const accounts = [
    { code: '1001', name: 'Cash in Hand', type: 'ASSET', subType: 'CASH' },
    { code: '1002', name: 'Bank Account', type: 'ASSET', subType: 'BANK' },
    { code: '1100', name: 'Inventory - Raw Materials', type: 'ASSET', subType: 'INVENTORY' },
    { code: '1101', name: 'Inventory - Finished Goods', type: 'ASSET', subType: 'INVENTORY' },
    { code: '1102', name: 'Kitchen / WIP Inventory', type: 'ASSET', subType: 'INVENTORY' },
    { code: '1200', name: 'Employee Advances', type: 'ASSET', subType: 'RECEIVABLE' },
    { code: '1201', name: 'Supplier Advances', type: 'ASSET', subType: 'RECEIVABLE' },
    { code: '1300', name: 'Accounts Receivable', type: 'ASSET', subType: 'RECEIVABLE' },
    { code: '2001', name: 'Accounts Payable (Supplier)', type: 'LIABILITY', subType: 'PAYABLE' },
    { code: '2002', name: 'Salary Payable', type: 'LIABILITY', subType: 'PAYABLE' },
    { code: '2003', name: 'Tax Payable', type: 'LIABILITY', subType: 'TAX' },
    { code: '3001', name: 'Sales Revenue', type: 'INCOME', subType: 'REVENUE' },
    { code: '3002', name: 'Other Income', type: 'INCOME', subType: 'REVENUE' },
    { code: '4001', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', subType: 'COST_OF_GOODS' },
    { code: '4002', name: 'Salary Expense', type: 'EXPENSE', subType: 'SALARY' },
    { code: '4003', name: 'Rent Expense', type: 'EXPENSE', subType: 'RENT' },
    { code: '4004', name: 'Electricity Expense', type: 'EXPENSE', subType: 'ELECTRICITY' },
    { code: '4005', name: 'Gas Expense', type: 'EXPENSE', subType: 'GAS' },
    { code: '4006', name: 'Fuel Expense', type: 'EXPENSE', subType: 'FUEL' },
    { code: '4007', name: 'Repair & Maintenance', type: 'EXPENSE', subType: 'REPAIRS' },
    { code: '4008', name: 'Miscellaneous Expense', type: 'EXPENSE', subType: 'MISC' },
    { code: '5001', name: 'Owner Equity', type: 'EQUITY', subType: 'EQUITY' },
    { code: '5002', name: 'Retained Earnings', type: 'EQUITY', subType: 'EQUITY' }
  ] satisfies Prisma.ChartOfAccountsCreateManyInput[];

  await prisma.chartOfAccounts.createMany({
    data: accounts
  });

  const desiSweets = await prisma.category.create({
    data: { name: 'Desi Sweets', type: 'SWEET', description: 'Traditional Pakistani mithai' }
  });
  const modernSweets = await prisma.category.create({
    data: { name: 'Modern Sweets', type: 'SWEET', description: 'Modern and fusion sweets' }
  });
  const bakery = await prisma.category.create({
    data: { name: 'Bakery Items', type: 'BAKERY', description: 'Fresh baked goods' }
  });
  const coldDrinks = await prisma.category.create({
    data: { name: 'Cold Drinks', type: 'BAKERY', description: 'Beverages and drinks' }
  });
  await prisma.category.create({
    data: { name: 'Raw Materials', type: 'RAW_MATERIAL', description: 'Kitchen and bakery ingredients' }
  });

  const saleCategoryIds = [desiSweets.id, modernSweets.id, bakery.id, coldDrinks.id];
  for (const option of [
    { name: 'Gift Box', chargeType: 'FIXED', extraCharge: 100 },
    { name: 'Tokra', chargeType: 'PER_KG', extraCharge: 50 },
    { name: 'Plain Box', chargeType: 'FIXED', extraCharge: 30 },
    { name: 'Tin', chargeType: 'FIXED', extraCharge: 150 }
  ]) {
    await prisma.packagingType.create({
      data: {
        ...option,
        categories: { create: saleCategoryIds.map((categoryId) => ({ categoryId })) }
      }
    });
  }

  const products = [
    { name: 'Gulab Jamun', categoryId: desiSweets.id, unit: 'PIECE', sellingPrice: 25, costPrice: 12, currentStock: 100, minStockLevel: 20, skuCode: 'ES-SWT-GJ-001', barcode: '896400100001' },
    { name: 'Barfi (Plain)', categoryId: desiSweets.id, unit: 'KG', sellingPrice: 800, costPrice: 450, currentStock: 10, minStockLevel: 3, skuCode: 'ES-SWT-BF-001', barcode: '896400100002' },
    { name: 'Barfi (Pista)', categoryId: desiSweets.id, unit: 'KG', sellingPrice: 1200, costPrice: 700, currentStock: 8, minStockLevel: 2 },
    { name: 'Jalebi', categoryId: desiSweets.id, unit: 'KG', sellingPrice: 400, costPrice: 200, currentStock: 5, minStockLevel: 2 },
    { name: 'Ladoo (Motichoor)', categoryId: desiSweets.id, unit: 'KG', sellingPrice: 700, costPrice: 380, currentStock: 8, minStockLevel: 3 },
    { name: 'Rasgulla', categoryId: desiSweets.id, unit: 'PIECE', sellingPrice: 30, costPrice: 15, currentStock: 80, minStockLevel: 20 },
    { name: 'Halwa (Sooji)', categoryId: desiSweets.id, unit: 'KG', sellingPrice: 500, costPrice: 250, currentStock: 6, minStockLevel: 2 },
    { name: 'Kheer', categoryId: desiSweets.id, unit: 'KG', sellingPrice: 600, costPrice: 300, currentStock: 4, minStockLevel: 2 },
    { name: 'Kalakand', categoryId: modernSweets.id, unit: 'KG', sellingPrice: 900, costPrice: 500, currentStock: 5, minStockLevel: 2 },
    { name: 'Ras Malai', categoryId: modernSweets.id, unit: 'PIECE', sellingPrice: 50, costPrice: 25, currentStock: 40, minStockLevel: 10 },
    { name: 'Samosa (Veg)', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 30, costPrice: 15, currentStock: 60, minStockLevel: 20, skuCode: 'ES-BKY-SM-001', barcode: '896400100003' },
    { name: 'Samosa (Aloo)', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 35, costPrice: 18, currentStock: 60, minStockLevel: 20 },
    { name: 'Patties', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 50, costPrice: 25, currentStock: 40, minStockLevel: 15 },
    { name: 'Bread Loaf', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 120, costPrice: 70, currentStock: 20, minStockLevel: 10 },
    { name: 'Croissant', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 80, costPrice: 40, currentStock: 25, minStockLevel: 10 },
    { name: 'Cake (Chocolate)', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 1500, costPrice: 800, currentStock: 5, minStockLevel: 2 },
    { name: 'Cake (Fruit)', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 1800, costPrice: 1000, currentStock: 4, minStockLevel: 2 },
    { name: 'Naan Khatai', categoryId: bakery.id, unit: 'PIECE', sellingPrice: 20, costPrice: 10, currentStock: 100, minStockLevel: 30 },
    { name: 'Biscuit Box', categoryId: bakery.id, unit: 'BOX', sellingPrice: 250, costPrice: 150, currentStock: 30, minStockLevel: 10 }
  ] satisfies Prisma.ProductCreateManyInput[];

  for (const product of products) {
    if (product.unit === 'KG') Object.assign(product, { saleMode: 'WEIGHT', quantityPresets: JSON.stringify([250, 500, 750, 1000, 1500, 2000]) });
  }

  await prisma.product.createMany({ data: products });

  const rawMaterials = [
    { name: 'Sugar (Cheeni)', unit: 'KG', currentStock: 100, minStockLevel: 20, costPerUnit: 120 },
    { name: 'Flour (Maida)', unit: 'KG', currentStock: 80, minStockLevel: 15, costPerUnit: 90 },
    { name: 'Ghee (Desi)', unit: 'KG', currentStock: 30, minStockLevel: 5, costPerUnit: 1800 },
    { name: 'Khoya / Mawa', unit: 'KG', currentStock: 20, minStockLevel: 5, costPerUnit: 800 },
    { name: 'Suji (Semolina)', unit: 'KG', currentStock: 25, minStockLevel: 5, costPerUnit: 100 },
    { name: 'Cooking Oil', unit: 'LITRE', currentStock: 40, minStockLevel: 10, costPerUnit: 450 },
    { name: 'Milk', unit: 'LITRE', currentStock: 50, minStockLevel: 10, costPerUnit: 160 },
    { name: 'Dry Fruits Mix', unit: 'KG', currentStock: 10, minStockLevel: 2, costPerUnit: 2500 },
    { name: 'Cardamom (Elaichi)', unit: 'KG', currentStock: 2, minStockLevel: 0.5, costPerUnit: 3000 },
    { name: 'Food Color', unit: 'KG', currentStock: 1, minStockLevel: 0.2, costPerUnit: 500 }
  ] satisfies Prisma.RawMaterialCreateManyInput[];

  await prisma.rawMaterial.createMany({ data: rawMaterials });

  await prisma.supplier.createMany({
    data: [
      { name: 'Ali Brothers Traders', phone: '0300-9876543', address: 'Sukkur Wholesale Market', city: 'Sukkur' },
      { name: 'Sindh Flour Mills', phone: '0333-1122334', address: 'Industrial Area, Sukkur', city: 'Sukkur' }
    ]
  });

  await prisma.customer.createMany({
    data: [
      { name: 'Ahmed Khan', phone: '0300-1111111', address: 'Block A, Sukkur' },
      { name: 'Fatima Bibi', phone: '0301-2222222', address: 'New Sukkur' },
      { name: 'Muhammad Ali', phone: '0333-3333333', address: 'Rohri Road, Sukkur' },
      { name: 'Kiran Salim', phone: '0311-4444444', address: 'Civil Lines, Sukkur' }
    ]
  });

  await prisma.employee.createMany({
    data: [
      { name: 'Ustad Ghulam', phone: '0300-5555555', role: 'Head Chef', basicSalary: 35000, joiningDate: new Date('2022-01-01') },
      { name: 'Rafiq Ahmed', phone: '0301-6666666', role: 'Cashier', basicSalary: 22000, joiningDate: new Date('2023-03-15') },
      { name: 'Saleem Khan', phone: '0311-7777777', role: 'Helper', basicSalary: 18000, joiningDate: new Date('2023-06-01') },
      { name: 'Nadia Bibi', phone: '0333-8888888', role: 'Packing Staff', basicSalary: 16000, joiningDate: new Date('2024-01-10') }
    ]
  });

  const productMap = new Map((await prisma.product.findMany()).map((item) => [item.name, item]));
  const materialMap = new Map((await prisma.rawMaterial.findMany()).map((item) => [item.name, item]));
  const productByName = (name: string) => {
    const product = productMap.get(name);
    if (!product) throw new Error(`Seed product missing: ${name}`);
    return product;
  };
  const materialByName = (name: string) => {
    const material = materialMap.get(name);
    if (!material) throw new Error(`Seed raw material missing: ${name}`);
    return material;
  };

  const gulabRecipe = await prisma.recipe.create({
    data: {
      productId: productByName('Gulab Jamun').id,
      name: 'Gulab Jamun - 1kg batch',
      yieldQuantity: 40,
      yieldUnit: 'PIECE',
      notes: 'Standard Eastern mithai kitchen batch',
      ingredients: {
        create: [
          { rawMaterialId: materialByName('Sugar (Cheeni)').id, quantity: 1.2, unit: 'KG' },
          { rawMaterialId: materialByName('Khoya / Mawa').id, quantity: 0.8, unit: 'KG' },
          { rawMaterialId: materialByName('Ghee (Desi)').id, quantity: 0.25, unit: 'KG' },
          { rawMaterialId: materialByName('Cardamom (Elaichi)').id, quantity: 0.02, unit: 'KG' }
        ]
      }
    }
  });

  const barfiRecipe = await prisma.recipe.create({
    data: {
      productId: productByName('Barfi (Plain)').id,
      name: 'Barfi - 1kg batch',
      yieldQuantity: 1,
      yieldUnit: 'KG',
      ingredients: {
        create: [
          { rawMaterialId: materialByName('Sugar (Cheeni)').id, quantity: 0.5, unit: 'KG' },
          { rawMaterialId: materialByName('Khoya / Mawa').id, quantity: 0.9, unit: 'KG' },
          { rawMaterialId: materialByName('Dry Fruits Mix').id, quantity: 0.05, unit: 'KG' }
        ]
      }
    }
  });

  await prisma.recipe.create({
    data: {
      productId: productByName('Samosa (Veg)').id,
      name: 'Samosa - per piece',
      yieldQuantity: 1,
      yieldUnit: 'PIECE',
      ingredients: {
        create: [
          { rawMaterialId: materialByName('Flour (Maida)').id, quantity: 0.05, unit: 'KG' },
          { rawMaterialId: materialByName('Cooking Oil').id, quantity: 0.02, unit: 'LITRE' },
          { rawMaterialId: materialByName('Suji (Semolina)').id, quantity: 0.01, unit: 'KG' }
        ]
      }
    }
  });

  const completedProduction = await prisma.productionOrder.create({
    data: {
      recipeId: gulabRecipe.id,
      productId: productByName('Gulab Jamun').id,
      plannedQuantity: 40,
      actualQuantity: 40,
      status: 'COMPLETED',
      productionDate: new Date(),
      notes: 'Morning production batch',
      createdBy: admin.id,
      consumptions: {
        create: [
          { rawMaterialId: materialByName('Sugar (Cheeni)').id, plannedQty: 1.2, actualQty: 1.2, unit: 'KG' },
          { rawMaterialId: materialByName('Khoya / Mawa').id, plannedQty: 0.8, actualQty: 0.8, unit: 'KG' }
        ]
      }
    }
  });

  await prisma.productionOrder.create({
    data: {
      recipeId: barfiRecipe.id,
      productId: productByName('Barfi (Plain)').id,
      plannedQuantity: 2,
      actualQuantity: 2,
      status: 'COMPLETED',
      productionDate: new Date(),
      notes: 'Counter refill',
      createdBy: admin.id,
      consumptions: {
        create: [
          { rawMaterialId: materialByName('Sugar (Cheeni)').id, plannedQty: 1, actualQty: 1, unit: 'KG' },
          { rawMaterialId: materialByName('Khoya / Mawa').id, plannedQty: 1.8, actualQty: 1.8, unit: 'KG' }
        ]
      }
    }
  });

  const finishedGoods = await prisma.chartOfAccounts.findUniqueOrThrow({ where: { code: '1101' } });
  const rawInventory = await prisma.chartOfAccounts.findUniqueOrThrow({ where: { code: '1100' } });
  await prisma.journalEntry.create({
    data: {
      entryNo: `JE-SEED-${Date.now()}`,
      description: 'Seed production journal entry',
      referenceType: 'PRODUCTION',
      referenceId: completedProduction.id,
      createdBy: admin.id,
      lines: {
        create: [
          { accountId: finishedGoods.id, debit: 900, credit: 0, description: 'Finished goods from seed production' },
          { accountId: rawInventory.id, debit: 0, credit: 900, description: 'Raw material consumed by seed production' }
        ]
      }
    }
  });
  await prisma.chartOfAccounts.update({ where: { id: finishedGoods.id }, data: { balance: { increment: 900 } } });
  await prisma.chartOfAccounts.update({ where: { id: rawInventory.id }, data: { balance: { decrement: 900 } } });

  const employees = await prisma.employee.findMany({ take: 2, orderBy: { name: 'asc' } });
  if (employees[0]) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: employees[0].id,
        leaveType: 'CASUAL',
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 1,
        reason: 'Family work',
        status: 'PENDING'
      }
    });
  }
  if (employees[1]) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: employees[1].id,
        leaveType: 'SICK',
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 1,
        reason: 'Medical rest',
        status: 'APPROVED',
        approvedBy: admin.id
      }
    });
  }

}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
