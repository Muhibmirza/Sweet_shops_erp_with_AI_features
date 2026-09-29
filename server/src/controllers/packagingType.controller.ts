import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { publicError } from '../utils/publicError';

const includeCategories = { categories: { include: { category: true } } } as const;

export const listPackagingTypes = async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.isActive !== undefined) where.isActive = String(req.query.isActive) === 'true';
  if (req.query.categoryId) where.categories = { some: { categoryId: String(req.query.categoryId) } };
  const rows = await prisma.packagingType.findMany({ where, include: includeCategories, orderBy: { name: 'asc' } });
  res.json({ success: true, data: rows });
};

export const packagingForCategory = async (req: Request, res: Response) => {
  const rows = await prisma.packagingType.findMany({
    where: { isActive: true, categories: { some: { categoryId: req.params.id } } },
    include: includeCategories,
    orderBy: { name: 'asc' }
  });
  res.json({ success: true, data: [{ id: null, name: 'No Packaging', extraCharge: 0, chargeType: 'FIXED', isActive: true }, ...rows] });
};

const dataFromBody = (body: any) => {
  const name = String(body.name || '').trim();
  const extraCharge = Number(body.extraCharge || 0);
  const chargeType = String(body.chargeType || 'FIXED');
  const categoryIds: string[] = Array.isArray(body.categoryIds) ? Array.from(new Set<string>(body.categoryIds.map((id: unknown) => String(id)))) : [];
  if (!name) throw Object.assign(new Error('Name is required'), { status: 400 });
  if (!Number.isFinite(extraCharge) || extraCharge < 0) throw Object.assign(new Error('Extra charge must be zero or greater'), { status: 400 });
  if (!['FIXED', 'PER_KG', 'PERCENTAGE'].includes(chargeType)) throw Object.assign(new Error('Invalid charge type'), { status: 400 });
  return { name, extraCharge, chargeType, categoryIds, isActive: body.isActive !== false };
};

export const createPackagingType = async (req: Request, res: Response) => {
  try {
    const { categoryIds, ...data } = dataFromBody(req.body);
    const row = await prisma.packagingType.create({
      data: { ...data, categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } },
      include: includeCategories
    });
    res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, message: publicError(error, error.message || 'Could not create packaging type') });
  }
};

export const updatePackagingType = async (req: Request, res: Response) => {
  try {
    const { categoryIds, ...data } = dataFromBody(req.body);
    const row = await prisma.packagingType.update({
      where: { id: req.params.id },
      data: { ...data, categories: { deleteMany: {}, create: categoryIds.map((categoryId) => ({ categoryId })) } },
      include: includeCategories
    });
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, message: publicError(error, error.message || 'Could not update packaging type') });
  }
};

export const deactivatePackagingType = async (req: Request, res: Response) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : '';
  if (categoryId) {
    const row = await prisma.$transaction(async (tx) => {
      await tx.packagingTypeCategory.deleteMany({ where: { packagingTypeId: req.params.id, categoryId } });
      const remaining = await tx.packagingTypeCategory.count({ where: { packagingTypeId: req.params.id } });
      return tx.packagingType.update({ where: { id: req.params.id }, data: remaining ? {} : { isActive: false }, include: includeCategories });
    });
    return res.json({ success: true, data: row, message: 'Packaging option removed from category' });
  }
  const row = await prisma.packagingType.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: row, message: 'Packaging type deactivated' });
};
