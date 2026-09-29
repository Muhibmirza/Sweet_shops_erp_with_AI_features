import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { validateEnvironment } from './config/environment';
import rateLimit from 'express-rate-limit';
import { protectResponses, validateWriteNumbers } from './middleware/security.middleware';
import path from 'path';

try { validateEnvironment(); } catch (error: any) { console.error(error.message); process.exit(1); }

import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import categoryRoutes from './routes/category.routes';
import rawMaterialRoutes from './routes/rawMaterial.routes';
import supplierRoutes from './routes/supplier.routes';
import purchaseRoutes from './routes/purchase.routes';
import stockRoutes from './routes/stock.routes';
import customerRoutes from './routes/customer.routes';
import orderRoutes from './routes/order.routes';
import saleRoutes from './routes/sale.routes';
import tokenRoutes from './routes/token.routes';
import expenseRoutes from './routes/expense.routes';
import employeeRoutes from './routes/employee.routes';
import attendanceRoutes from './routes/attendance.routes';
import salaryRoutes from './routes/salary.routes';
import { fineRouter, loanRouter } from './routes/hr.routes';
import reportRoutes from './routes/report.routes';
import dashboardRoutes from './routes/dashboard.routes';
import settingsRoutes from './routes/settings.routes';
import accountingRoutes from './routes/accounting.routes';
import recipeRoutes from './routes/recipe.routes';
import productionRoutes from './routes/production.routes';
import leaveRoutes from './routes/leave.routes';
import advanceRoutes from './routes/advance.routes';
import auditRoutes from './routes/audit.routes';
import packagingTypeRoutes from './routes/packagingType.routes';
import kitchenRoutes from './routes/kitchen.routes';
import assistantRoutes from './routes/assistant.routes';
import { initBackupScheduler } from './services/backupScheduler';
import { ensureDefaultData } from './services/bootstrapService';

const app = express();
const PORT = Number(process.env.PORT || 5000);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection [REDACTED]');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception [REDACTED]');
});

app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], upgradeInsecureRequests: null } }
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
if (process.env.NODE_ENV === 'development') app.use(morgan(':method :status :response-time ms'));
app.use(protectResponses);
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 200, message: { success: false, message: 'Rate limit exceeded.' }, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts. Try again later.' }, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh-token', authLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/', validateWriteNumbers);
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/raw-materials', rawMaterialRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/loans', loanRouter);
app.use('/api/fines', fineRouter);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/advances', advanceRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/packaging-types', packagingTypeRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/assistant', assistantRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Eastern Sweets API is running' });
});

const frontendDist = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production' && require('fs').existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', { name: err?.name, code: err?.code });
  res.status(err.status || 500).json({
    success: false,
    message: 'Something went wrong. Please try again.'
  });
});

export const server = app.listen(PORT, '0.0.0.0', () => {
  ensureDefaultData()
    .then(() => initBackupScheduler())
    .catch((error) => console.error('Startup bootstrap failed [REDACTED]'));
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

export default app;
