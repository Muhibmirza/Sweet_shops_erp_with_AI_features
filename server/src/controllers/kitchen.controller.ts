import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { createKitchenConsumptionEntry, createKitchenTransferEntry } from '../services/journalService';
import { publicError } from '../utils/publicError';
import { convertUnit } from '../utils/unitConversion';

const groupSums = async () => {
  const [transfers, consumptions, adjustments] = await Promise.all([
    prisma.kitchenTransfer.groupBy({ by: ['rawMaterialId'], _sum: { quantity: true } }),
    prisma.kitchenConsumption.groupBy({ by: ['rawMaterialId'], _sum: { quantityDeducted: true } }),
    prisma.kitchenAdjustment.groupBy({ by: ['rawMaterialId'], _sum: { quantity: true } })
  ]);
  return {
    transfers: new Map(transfers.map((x) => [x.rawMaterialId, Number(x._sum.quantity || 0)])),
    consumptions: new Map(consumptions.map((x) => [x.rawMaterialId, Number(x._sum.quantityDeducted || 0)])),
    adjustments: new Map(adjustments.map((x) => [x.rawMaterialId, Number(x._sum.quantity || 0)]))
  };
};

const getBalance = async (rawMaterialId: string) => {
  const [a, b, c] = await Promise.all([
    prisma.kitchenTransfer.aggregate({ where: { rawMaterialId }, _sum: { quantity: true } }),
    prisma.kitchenConsumption.aggregate({ where: { rawMaterialId }, _sum: { quantityDeducted: true } }),
    prisma.kitchenAdjustment.aggregate({ where: { rawMaterialId }, _sum: { quantity: true } })
  ]);
  return Number(a._sum.quantity || 0) - Number(b._sum.quantityDeducted || 0) + Number(c._sum.quantity || 0);
};

const dateWhere = (query: any, field: string) => query.startDate || query.endDate ? {
  [field]: {
    ...(query.startDate ? { gte: new Date(String(query.startDate)) } : {}),
    ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999`) } : {})
  }
} : {};

export const getKitchenStock = async (_req: Request, res: Response) => {
  const [materials, sums] = await Promise.all([prisma.rawMaterial.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }), groupSums()]);
  const data = materials.map((material) => {
    const transferredIn = sums.transfers.get(material.id) || 0;
    const consumed = sums.consumptions.get(material.id) || 0;
    const adjusted = sums.adjustments.get(material.id) || 0;
    return { ...material, transferredIn, consumed, adjusted, currentBalance: transferredIn - consumed + adjusted };
  });
  res.json({ success: true, data });
};

export const getTransfers = async (req: Request, res: Response) => {
  const where: any = { ...dateWhere(req.query, 'transferDate') };
  if (req.query.materialId) where.rawMaterialId = String(req.query.materialId);
  const data = await prisma.kitchenTransfer.findMany({ where, include: { rawMaterial: true, transferredByUser: { select: { name: true } } }, orderBy: { transferDate: 'desc' } });
  res.json({ success: true, data });
};

export const createTransfer = async (req: any, res: Response) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be greater than zero' });
    const material = await prisma.rawMaterial.findUnique({ where: { id: String(req.body.rawMaterialId) } });
    if (!material) return res.status(404).json({ success: false, message: 'Raw material not found' });
    if (quantity > material.currentStock) return res.status(400).json({ success: false, message: 'Insufficient inventory stock' });
    const data = await prisma.$transaction(async (tx) => {
      await tx.rawMaterial.update({ where: { id: material.id }, data: { currentStock: { decrement: quantity } } });
      const transfer = await tx.kitchenTransfer.create({ data: { rawMaterialId: material.id, quantity, unit: material.unit, transferredBy: req.user.id, receivedBy: req.body.receivedBy || null, notes: req.body.notes || null, transferDate: req.body.transferDate ? new Date(req.body.transferDate) : new Date() } });
      await tx.stockMovement.create({ data: { rawMaterialId: material.id, type: 'OUT', quantity, reason: 'Transferred to Kitchen', userId: req.user.id, createdAt: req.body.transferDate ? new Date(req.body.transferDate) : new Date() } });
      await tx.auditLog.create({ data: { userId: req.user.id, action: 'CREATE', tableName: 'KitchenTransfer', recordId: transfer.id, newData: JSON.stringify(transfer) } });
      await createKitchenTransferEntry(transfer.id, quantity * Number(material.avgCost || material.costPerUnit || 0), req.user.id, tx);
      return transfer;
    });
    res.status(201).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not transfer stock') });
  }
};

export const getProductionRuns = async (req: Request, res: Response) => {
  const data = await prisma.kitchenProductionRun.findMany({ where: dateWhere(req.query, 'productionDate'), include: { product: true, producedByUser: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } }, orderBy: { productionDate: 'desc' } });
  res.json({ success: true, data });
};

export const getProductionRun = async (req: Request, res: Response) => {
  const data = await prisma.kitchenProductionRun.findUnique({ where: { id: req.params.id }, include: { product: true, producedByUser: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } } });
  if (!data) return res.status(404).json({ success: false, message: 'Production run not found' });
  res.json({ success: true, data });
};

export const createProductionRun = async (req: any, res: Response) => {
  try {
    const quantityProduced = Number(req.body.quantityProduced);
    if (!Number.isFinite(quantityProduced) || quantityProduced <= 0) return res.status(400).json({ success: false, message: 'Quantity produced must be greater than zero' });
    const recipe = await prisma.recipe.findFirst({ where: { productId: String(req.body.productId), isActive: true }, include: { product: true, ingredients: { include: { rawMaterial: true } } } });
    if (!recipe) return res.status(400).json({ success: false, message: 'No recipe found for this product. Set up a recipe first.' });
    const scale = quantityProduced / recipe.yieldQuantity;
    const consumptions = recipe.ingredients.map((ing) => ({ rawMaterialId: ing.rawMaterialId, quantityDeducted: convertUnit(ing.quantity * scale, ing.unit, ing.rawMaterial.unit), unit: ing.rawMaterial.unit, rawMaterial: ing.rawMaterial }));
    const shortfalls = (await Promise.all(consumptions.map(async (c) => {
      const available = await getBalance(c.rawMaterialId);
      return available < c.quantityDeducted ? { material: c.rawMaterial.name, rawMaterialId: c.rawMaterialId, required: c.quantityDeducted, available, shortfall: c.quantityDeducted - available, unit: c.unit } : null;
    }))).filter(Boolean);
    if (shortfalls.length && !req.body.confirmShortfall) return res.json({ success: false, requiresConfirmation: true, message: 'Insufficient kitchen stock for some materials.', shortfalls });
    const data = await prisma.$transaction(async (tx) => {
      const run = await tx.kitchenProductionRun.create({ data: { productId: recipe.productId, quantityProduced, unit: recipe.yieldUnit || recipe.product.unit, producedBy: req.user.id, productionDate: req.body.productionDate ? new Date(req.body.productionDate) : new Date(), notes: req.body.notes || null, consumptions: { create: consumptions.map(({ rawMaterial, ...c }) => c) } }, include: { product: true, consumptions: { include: { rawMaterial: true } } } });
      const materialCost = consumptions.reduce((sum, c) => sum + c.quantityDeducted * Number(c.rawMaterial.avgCost || c.rawMaterial.costPerUnit || 0), 0);
      await tx.product.update({ where: { id: recipe.productId }, data: { currentStock: { increment: quantityProduced }, ...(quantityProduced > 0 && materialCost > 0 ? { currentCost: materialCost / quantityProduced, costPrice: materialCost / quantityProduced } : {}) } });
      await tx.stockMovement.create({ data: { productId: recipe.productId, type: 'IN', quantity: quantityProduced, reason: `Kitchen production run ${run.id}`, userId: req.user.id, createdAt: run.productionDate } });
      await createKitchenConsumptionEntry(run.id, materialCost, req.user.id, tx);
      await tx.auditLog.create({ data: { userId: req.user.id, action: 'CREATE', tableName: 'KitchenProductionRun', recordId: run.id, newData: JSON.stringify({ productId: run.productId, quantityProduced }) } });
      return run;
    });
    res.status(201).json({ success: true, data, warnings: shortfalls });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not log production run') });
  }
};

export const getAdjustments = async (req: Request, res: Response) => {
  const data = await prisma.kitchenAdjustment.findMany({ where: dateWhere(req.query, 'adjustedAt'), include: { rawMaterial: true, adjustedByUser: { select: { name: true } } }, orderBy: { adjustedAt: 'desc' } });
  res.json({ success: true, data });
};

export const createAdjustment = async (req: any, res: Response) => {
  const submittedQuantity = Number(req.body.kitchenAdjustmentQuantity ?? req.body.quantity);
  const rawQuantity = Math.abs(submittedQuantity);
  const adjustType = String(req.body.adjustType || 'MANUAL_CORRECTION');
  if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be greater than zero' });
  if (!['WASTAGE', 'RETURN_TO_INVENTORY', 'MANUAL_CORRECTION'].includes(adjustType)) return res.status(400).json({ success: false, message: 'Invalid adjustment type' });
  const material = await prisma.rawMaterial.findUnique({ where: { id: String(req.body.rawMaterialId) } });
  if (!material) return res.status(404).json({ success: false, message: 'Raw material not found' });
  const quantity = adjustType === 'MANUAL_CORRECTION' ? submittedQuantity : -rawQuantity;
  const balance = await getBalance(material.id);
  if (quantity < 0 && Math.abs(quantity) > balance) return res.status(400).json({ success: false, message: 'Adjustment exceeds kitchen stock' });
  const data = await prisma.$transaction(async (tx) => {
    const adjustment = await tx.kitchenAdjustment.create({ data: { rawMaterialId: material.id, quantity, adjustType, reason: String(req.body.reason || adjustType), adjustedBy: req.user.id, adjustedAt: req.body.adjustedAt ? new Date(req.body.adjustedAt) : new Date() } });
    if (adjustType === 'RETURN_TO_INVENTORY') await tx.rawMaterial.update({ where: { id: material.id }, data: { currentStock: { increment: rawQuantity } } });
    await tx.auditLog.create({ data: { userId: req.user.id, action: 'CREATE', tableName: 'KitchenAdjustment', recordId: adjustment.id, newData: JSON.stringify(adjustment) } });
    return adjustment;
  });
  res.status(201).json({ success: true, data });
};

export const consumptionReport = async (req: Request, res: Response) => {
  const rows = await prisma.kitchenConsumption.findMany({ where: { productionRun: dateWhere(req.query, 'productionDate') }, include: { rawMaterial: true, productionRun: { include: { product: true } } }, orderBy: { productionRun: { productionDate: 'desc' } } });
  res.json({ success: true, data: rows.map((row) => ({ date: row.productionRun.productionDate, product: row.productionRun.product.name, material: row.rawMaterial.name, unit: row.unit, expected: row.quantityDeducted, actual: row.quantityDeducted, variance: 0 })) });
};

export const transferReport = getTransfers;
