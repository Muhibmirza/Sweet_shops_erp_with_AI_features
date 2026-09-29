import { publicError } from '../utils/publicError';
import { Response } from 'express';
import dayjs from 'dayjs';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { createProductionEntry } from '../services/journalService';

const convertUnit = (quantity: number, from: string, to: string) => {
  const source = String(from || '').toUpperCase();
  const target = String(to || '').toUpperCase();
  if (source === target) return quantity;
  if (source === 'GRAM' && target === 'KG') return quantity / 1000;
  if (source === 'KG' && target === 'GRAM') return quantity * 1000;
  if (source === 'ML' && target === 'LITRE') return quantity / 1000;
  if (source === 'LITRE' && target === 'ML') return quantity * 1000;
  return quantity;
};

const getKitchenBalance = async (rawMaterialId: string) => {
  const [transfers, consumptions, adjustments] = await Promise.all([
    prisma.kitchenTransfer.aggregate({ where: { rawMaterialId }, _sum: { quantity: true } }),
    prisma.kitchenConsumption.aggregate({ where: { rawMaterialId }, _sum: { quantityDeducted: true } }),
    prisma.kitchenAdjustment.aggregate({ where: { rawMaterialId }, _sum: { quantity: true } })
  ]);
  return Number(transfers._sum.quantity || 0) - Number(consumptions._sum.quantityDeducted || 0) + Number(adjustments._sum.quantity || 0);
};

export const getProductionOrders = async (_req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.productionOrder.findMany({
      include: { recipe: true, product: true, creator: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } },
      orderBy: { productionDate: 'desc' }
    });
    res.json({ success: true, data: orders });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load production orders') });
  }
};

export const getProductionOrder = async (req: AuthRequest, res: Response) => {
  const order = await prisma.productionOrder.findUnique({
    where: { id: req.params.id },
    include: { recipe: true, product: true, creator: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } }
  });
  if (!order) return res.status(404).json({ success: false, message: 'Production order not found' });
  res.json({ success: true, data: order });
};

export const createProductionOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { recipeId, plannedQuantity, productionDate, notes } = req.body;
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, include: { ingredients: true } });
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });
    if (!Number(plannedQuantity) || Number(plannedQuantity) <= 0) return res.status(400).json({ success: false, message: 'Planned quantity must be greater than zero' });
    const multiplier = Number(plannedQuantity) / recipe.yieldQuantity;
    const order = await prisma.productionOrder.create({
      data: {
        recipeId,
        productId: recipe.productId,
        plannedQuantity: Number(plannedQuantity),
        productionDate: productionDate ? new Date(productionDate) : new Date(),
        notes,
        createdBy: req.user!.id,
        consumptions: {
          create: recipe.ingredients.map((item) => ({
            rawMaterialId: item.rawMaterialId,
            plannedQty: item.quantity * multiplier,
            unit: item.unit
          }))
        }
      },
      include: { recipe: true, product: true, consumptions: { include: { rawMaterial: true } } }
    });
    res.status(201).json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not create production order') });
  }
};

export const updateProductionOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { recipeId, plannedQuantity, productionDate, notes } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.productionOrder.findUnique({
      where: { id: req.params.id },
      include: { recipe: { include: { ingredients: true } } }
    });
    if (!existing) throw new Error('Production order not found');
    if (existing.status === 'COMPLETED') throw new Error('Completed production orders cannot be edited');

    const nextRecipeId = recipeId || existing.recipeId;
    const recipe = await tx.recipe.findUnique({ where: { id: nextRecipeId }, include: { ingredients: true } });
    if (!recipe) throw new Error('Recipe not found');

    const nextPlannedQuantity = plannedQuantity === undefined ? existing.plannedQuantity : Number(plannedQuantity);
    if (!Number.isFinite(nextPlannedQuantity) || nextPlannedQuantity <= 0) throw new Error('Planned quantity must be greater than zero');

    const multiplier = nextPlannedQuantity / recipe.yieldQuantity;
    const shouldRebuildConsumptions = nextRecipeId !== existing.recipeId || nextPlannedQuantity !== existing.plannedQuantity;

    if (shouldRebuildConsumptions) {
      await tx.productionConsumption.deleteMany({ where: { productionOrderId: existing.id } });
    }

    return tx.productionOrder.update({
      where: { id: existing.id },
      data: {
        recipeId: nextRecipeId,
        productId: recipe.productId,
        plannedQuantity: nextPlannedQuantity,
        productionDate: productionDate ? new Date(productionDate) : existing.productionDate,
        notes,
        ...(shouldRebuildConsumptions
          ? {
              consumptions: {
                create: recipe.ingredients.map((item) => ({
                  rawMaterialId: item.rawMaterialId,
                  plannedQty: item.quantity * multiplier,
                  unit: item.unit
                }))
              }
            }
          : {})
      },
      include: { recipe: true, product: true, creator: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } }
    });
  });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, message: publicError(error, 'Could not update production order') });
  }
};

export const deleteProductionOrder = async (req: AuthRequest, res: Response) => {
  const existing = await prisma.productionOrder.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Production order not found' });
  if (existing.status === 'COMPLETED') {
    return res.status(400).json({ success: false, message: 'Completed production orders cannot be deleted' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.salary.updateMany({ where: { linkedProductionOrderId: existing.id }, data: { linkedProductionOrderId: null } });
    await tx.productionOrder.delete({ where: { id: existing.id } });
  });
  res.json({ success: true, data: { id: existing.id } });
};

export const startProductionOrder = async (req: AuthRequest, res: Response) => {
  const order = await prisma.productionOrder.update({ where: { id: req.params.id }, data: { status: 'IN_PROGRESS' } });
  res.json({ success: true, data: order });
};

export const completeProductionOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { actualQuantity, consumptions = [], labourCost, laborCost, packagingCost, packingCost, otherOverheads, wastagePercent } = req.body;
    const pendingOrder = await prisma.productionOrder.findUnique({
      where: { id: req.params.id },
      include: { product: true, recipe: true, consumptions: { include: { rawMaterial: true } } }
    });
    if (!pendingOrder) return res.status(404).json({ success: false, message: 'Production order not found' });
    if (pendingOrder.status === 'COMPLETED') return res.status(400).json({ success: false, message: 'Production order is already completed' });

    const requestedFinishedQty = Number(actualQuantity || pendingOrder.plannedQuantity);
    if (!Number.isFinite(requestedFinishedQty) || requestedFinishedQty <= 0) return res.status(400).json({ success: false, message: 'Actual quantity must be greater than zero' });
    const outputScale = pendingOrder.plannedQuantity > 0 ? requestedFinishedQty / pendingOrder.plannedQuantity : 1;
    const kitchenConsumptions = pendingOrder.consumptions.map((consumption) => {
      const override = consumptions.find((item: any) => item.rawMaterialId === consumption.rawMaterialId);
      const actualQty = Number(override?.actualQty ?? consumption.plannedQty * outputScale);
      return {
        productionConsumptionId: consumption.id,
        rawMaterialId: consumption.rawMaterialId,
        material: consumption.rawMaterial.name,
        quantityDeducted: convertUnit(actualQty, consumption.unit, consumption.rawMaterial.unit),
        actualQty,
        unit: consumption.rawMaterial.unit,
        rawMaterial: consumption.rawMaterial
      };
    });
    const shortfalls = (await Promise.all(kitchenConsumptions.map(async (item) => {
      const available = await getKitchenBalance(item.rawMaterialId);
      return available + 0.000001 < item.quantityDeducted
        ? { material: item.material, rawMaterialId: item.rawMaterialId, required: item.quantityDeducted, available, shortfall: item.quantityDeducted - available, unit: item.unit }
        : null;
    }))).filter(Boolean);

    if (shortfalls.length && !req.body.confirmShortfall) {
      return res.json({ success: false, requiresConfirmation: true, message: 'Insufficient kitchen stock for some materials.', shortfalls });
    }

    const completed = await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: req.params.id },
      include: { product: true, recipe: true, consumptions: { include: { rawMaterial: true } } }
    });
      if (!order) throw new Error('Production order not found');
      if (order.status === 'COMPLETED') throw new Error('Production order is already completed');

    let rawMaterialCost = 0;
    for (const consumption of kitchenConsumptions) {
      rawMaterialCost += consumption.quantityDeducted * Number(consumption.rawMaterial.avgCost || consumption.rawMaterial.costPerUnit || 0);
      await tx.productionConsumption.update({ where: { id: consumption.productionConsumptionId }, data: { actualQty: consumption.actualQty } });
    }

    const finishedQty = Number(actualQuantity || order.plannedQuantity);
    const scale = order.recipe.yieldQuantity > 0 ? finishedQty / order.recipe.yieldQuantity : 1;
    const finalLabourCost = labourCost !== undefined || laborCost !== undefined ? Number(labourCost ?? laborCost) : (order.recipe.labourCost || order.recipe.laborCost || 0) * scale;
    const finalGasCost = 0;
    const finalElectricityCost = 0;
    const finalPackagingCost = packagingCost !== undefined || packingCost !== undefined ? Number(packagingCost ?? packingCost) : (order.recipe.packagingCost || order.recipe.packingCost || 0) * scale;
    const finalOtherOverheads = otherOverheads !== undefined ? Number(otherOverheads) : (order.recipe.otherOverheads || 0) * scale;
    const finalWastagePercent = wastagePercent !== undefined ? Number(wastagePercent) : Number(order.recipe.wastagePercent || 0);
    const wastageCost = (finalWastagePercent / 100) * rawMaterialCost;
    const actualOutput = finishedQty * (1 - finalWastagePercent / 100);
    const totalBatchCost = rawMaterialCost + finalLabourCost + finalPackagingCost + finalOtherOverheads + wastageCost;
    const costPerUnit = (actualOutput > 0 ? totalBatchCost / actualOutput : (finishedQty > 0 ? totalBatchCost / finishedQty : 0));
    await tx.product.update({
      where: { id: order.productId },
      data: { currentStock: { increment: finishedQty }, currentCost: costPerUnit, costPrice: costPerUnit }
    });
    await tx.stockMovement.create({
      data: { productId: order.productId, type: 'IN', quantity: finishedQty, reason: `Production ${order.id}`, userId: req.user!.id }
    });
    const kitchenRun = await tx.kitchenProductionRun.create({
      data: {
        productId: order.productId,
        quantityProduced: finishedQty,
        unit: order.recipe.yieldUnit || order.product.unit,
        producedBy: req.user!.id,
        productionDate: order.productionDate,
        notes: `Automatically created from production order ${order.id}`,
        consumptions: {
          create: kitchenConsumptions.map((item) => ({
            rawMaterialId: item.rawMaterialId,
            quantityDeducted: item.quantityDeducted,
            unit: item.unit
          }))
        }
      }
    });
    const updated = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        actualQuantity: finishedQty,
        rawMaterialCost,
        labourCost: finalLabourCost,
        gasCost: finalGasCost,
        electricityCost: finalElectricityCost,
        packagingCost: finalPackagingCost,
        otherOverheads: finalOtherOverheads,
        wastageCost,
        totalCost: totalBatchCost,
        costPerUnit
      },
      include: { product: true, recipe: true, consumptions: { include: { rawMaterial: true } } }
    });
    await createProductionEntry(order.id, rawMaterialCost, totalBatchCost, tx);
    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'COMPLETE',
        tableName: 'ProductionOrder',
        recordId: order.id,
        newData: JSON.stringify({ finishedQty, kitchenProductionRunId: kitchenRun.id, shortfalls })
      }
    });
      return { ...updated, totalCost: totalBatchCost, qtyProduced: finishedQty, costPerUnit };
    });
    res.json({ success: true, data: completed });
  } catch (error: any) {
    res.status(400).json({ success: false, message: publicError(error, 'Could not complete production order') });
  }
};

export const cancelProductionOrder = async (req: AuthRequest, res: Response) => {
  const order = await prisma.productionOrder.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
  res.json({ success: true, data: order });
};

export const getTodayProduction = async (_req: AuthRequest, res: Response) => {
  const start = new Date(dayjs().format('YYYY-MM-DD'));
  const end = new Date(dayjs().format('YYYY-MM-DD') + 'T23:59:59');
  const orders = await prisma.productionOrder.findMany({
    where: { productionDate: { gte: start, lte: end } },
    include: { product: true, recipe: true },
    orderBy: { productionDate: 'asc' }
  });
  res.json({ success: true, data: orders });
};
