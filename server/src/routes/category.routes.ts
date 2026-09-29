// category.routes.ts
import { Router } from 'express';
import prisma from '../utils/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { ensureDefaultPackagingForCategory } from '../services/bootstrapService';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { type } = req.query;
  const where: any = { isActive: true };
  if (type) where.type = type;
  const categories = await prisma.category.findMany({ where, include: { _count: { select: { products: true } } } });
  res.json({ success: true, data: categories });
});

router.post('/', authorize('ADMIN'), async (req, res) => {
  const { name, type, description } = req.body;
  const cat = await prisma.category.create({ data: { name, type, description } });
  await ensureDefaultPackagingForCategory(cat.id);
  res.status(201).json({ success: true, data: cat });
});

router.put('/:id', authorize('ADMIN', 'MANAGER'), async (req, res) => {
  const cat = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: cat });
});

router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  await prisma.category.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, message: 'Deleted' });
});

export default router;
