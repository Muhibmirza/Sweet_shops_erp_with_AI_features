import { publicError } from '../utils/publicError';
import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { convertUnit, displayQty } from '../utils/unitConversion';

const normalizedIngredientQuantity = (quantity: number, ingredientUnit?: string | null, materialUnit?: string | null) =>
  convertUnit(quantity, ingredientUnit || materialUnit || '', materialUnit || ingredientUnit || '');

const ingredientCost = (quantity: number, ingredientUnit: string | null | undefined, rawMaterial: { unit?: string | null; avgCost?: number | null; costPerUnit?: number | null }) => {
  const rate = rawMaterial.avgCost || rawMaterial.costPerUnit || 0;
  return normalizedIngredientQuantity(quantity, ingredientUnit, rawMaterial.unit) * rate;
};

export const getRecipes = async (_req: AuthRequest, res: Response) => {
  const recipes = await prisma.recipe.findMany({
    where: { isActive: true },
    include: { product: true, ingredients: { include: { rawMaterial: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: recipes });
};

export const getRecipe = async (req: AuthRequest, res: Response) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { product: true, ingredients: { include: { rawMaterial: true } } }
  });
  if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });
  res.json({ success: true, data: recipe });
};

const recipeCostFields = (body: any) => {
  const labourCost = Number(body.labourCost ?? body.laborCost ?? 0);
  const packagingCost = Number(body.packagingCost ?? body.packingCost ?? 0);
  return {
    gasCost: 0,
    laborCost: labourCost,
    labourCost,
    packingCost: packagingCost,
    packagingCost,
    electricityCost: 0,
    otherOverheads: Number(body.otherOverheads || 0),
    wastagePercent: Number(body.wastagePercent || 0)
  };
};

export const createRecipe = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, name, yieldQuantity, yieldUnit, notes, ingredients = [] } = req.body;
    if (!productId || !name || !yieldQuantity || Number(yieldQuantity) <= 0) {
      return res.status(400).json({ success: false, message: 'Product, recipe name, and valid yield quantity are required' });
    }
    const validIngredients = ingredients.filter((item: any) => item.rawMaterialId && Number(item.quantity) > 0);
    if (!validIngredients.length) {
      return res.status(400).json({ success: false, message: 'At least one raw material ingredient is required' });
    }

    const recipe = await prisma.recipe.create({
      data: {
        productId,
        name,
        yieldQuantity: Number(yieldQuantity),
        yieldUnit,
        ...recipeCostFields(req.body),
        notes,
        ingredients: {
          create: validIngredients.map((item: any) => ({
            rawMaterialId: item.rawMaterialId,
            quantity: Number(item.quantity),
            unit: item.unit,
            notes: item.notes
          }))
        }
      },
      include: { product: true, ingredients: { include: { rawMaterial: true } } }
    });
    res.status(201).json({ success: true, data: recipe });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not create recipe') });
  }
};

export const updateRecipe = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, name, yieldQuantity, yieldUnit, notes, ingredients = [] } = req.body;
    const validIngredients = ingredients.filter((item: any) => item.rawMaterialId && Number(item.quantity) > 0);
    if (!productId || !name || !yieldQuantity || Number(yieldQuantity) <= 0 || !validIngredients.length) {
      return res.status(400).json({ success: false, message: 'Product, recipe name, yield, and ingredients are required' });
    }
    const recipe = await prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: req.params.id } });
      return tx.recipe.update({
        where: { id: req.params.id },
        data: {
          productId,
          name,
          yieldQuantity: Number(yieldQuantity),
          yieldUnit,
          ...recipeCostFields(req.body),
          notes,
          ingredients: {
            create: validIngredients.map((item: any) => ({
              rawMaterialId: item.rawMaterialId,
              quantity: Number(item.quantity),
              unit: item.unit,
              notes: item.notes
            }))
          }
        },
        include: { product: true, ingredients: { include: { rawMaterial: true } } }
      });
    });
    res.json({ success: true, data: recipe });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not update recipe') });
  }
};

export const deleteRecipe = async (req: AuthRequest, res: Response) => {
  await prisma.recipe.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, message: 'Recipe deleted' });
};

export const getRecipeCost = async (req: AuthRequest, res: Response) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.id },
    include: { ingredients: { include: { rawMaterial: true } }, product: true }
  });
  if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });
  const productionQty = Number(req.query.qty || recipe.yieldQuantity);
  const breakdown = recipe.ingredients.map((item) => {
    const rate = item.rawMaterial.avgCost || item.rawMaterial.costPerUnit || 0;
    const requiredQty = recipe.yieldQuantity > 0 ? (item.quantity / recipe.yieldQuantity) * productionQty : item.quantity;
    const costingQty = normalizedIngredientQuantity(requiredQty, item.unit, item.rawMaterial.unit);
    const materialCost = costingQty * rate;
    return {
      name: item.rawMaterial.name,
      rawMaterial: item.rawMaterial.name,
      rawMaterialId: item.rawMaterialId,
      recipeQty: item.quantity,
      qty: item.quantity,
      unit: item.unit,
      requiredQty,
      displayQty: displayQty(requiredQty, item.unit),
      costingQty,
      costingUnit: item.rawMaterial.unit,
      rate,
      rateUnit: `per ${item.rawMaterial.unit.toLowerCase()}`,
      cost: materialCost,
      materialCost
    };
  });
  const totalRawMaterialCost = breakdown.reduce((sum, item) => sum + item.materialCost, 0);
  const scale = recipe.yieldQuantity > 0 ? productionQty / recipe.yieldQuantity : 1;
  const labourCost = Number((recipe.labourCost || recipe.laborCost || 0) * scale);
  const packagingCost = Number((recipe.packagingCost || recipe.packingCost || 0) * scale);
  const otherOverheads = Number((recipe.otherOverheads || 0) * scale);
  const wastageCost = (Number(recipe.wastagePercent || 0) / 100) * totalRawMaterialCost;
  const totalCost = totalRawMaterialCost + labourCost + packagingCost + otherOverheads + wastageCost;
  const actualOutput = productionQty * (1 - Number(recipe.wastagePercent || 0) / 100);
  const costPerUnit = (actualOutput > 0 ? totalCost / actualOutput : totalCost / productionQty) || 0;
  res.json({
    success: true,
    data: {
      recipeId: recipe.id,
      product: recipe.product.name,
      productionQty,
      rawMaterialCost: totalRawMaterialCost,
      totalRawMaterialCost,
      gasCost: 0,
      laborCost: labourCost,
      labourCost,
      electricityCost: 0,
      packingCost: packagingCost,
      packagingCost,
      otherOverheads,
      wastageCost,
      wastagePercent: recipe.wastagePercent,
      totalProductionCost: totalCost,
      totalCost,
      actualOutput,
      yieldQuantity: recipe.yieldQuantity,
      yieldUnit: recipe.yieldUnit,
      costPerUnit,
      totalCostPerUnit: costPerUnit,
      breakdown,
      ingredients: recipe.ingredients
    }
  });
};
