const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.tmp', 'production-kitchen-'));
const database = path.join(temp, 'test.db');
fs.closeSync(fs.openSync(database, 'w'));

async function main() {
  const password = `Smoke@${randomBytes(8).toString('hex')}`;
  Object.assign(process.env, { DATABASE_URL: `file:${database.replaceAll('\\', '/')}`, JWT_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'), SEED_ADMIN_PASSWORD: password, SEED_CASHIER_PASSWORD: password, SEED_PRODUCTION_PASSWORD: password, GROQ_API_KEY: '', NODE_ENV: 'production', CLIENT_URL: 'http://localhost:5198', PORT: '5198', UPLOAD_DIR: path.join(temp, 'uploads') });
  const prismaCli = path.join(root, 'server/node_modules/prisma/build/index.js');
  const pushed = spawnSync(process.execPath, [prismaCli, 'db', 'push', '--schema', path.join(root, 'prisma/schema.prisma'), '--skip-generate'], { env: process.env, encoding: 'utf8' });
  assert.equal(pushed.status, 0, pushed.stderr);
  await require('../server/dist/services/bootstrapService').ensureDefaultData();
  const prisma = require('../server/dist/utils/prisma').default;
  const admin = await prisma.user.findFirst({ where: { email: 'admin@easternsweets.com' } });
  const category = await prisma.category.create({ data: { name: 'Smoke Sweets', type: 'SWEET' } });
  const product = await prisma.product.create({ data: { name: 'Smoke Barfi', categoryId: category.id, unit: 'KG', sellingPrice: 1200, costPrice: 0, currentCost: 0, currentStock: 0, saleMode: 'WEIGHT' } });
  const material = await prisma.rawMaterial.create({ data: { name: 'Smoke Khoya', unit: 'KG', currentStock: 10, minStockLevel: 1, costPerUnit: 500, avgCost: 500 } });
  const recipe = await prisma.recipe.create({ data: { productId: product.id, name: 'Smoke Recipe', yieldQuantity: 1, yieldUnit: 'KG', ingredients: { create: [{ rawMaterialId: material.id, quantity: 2, unit: 'KG' }] } } });
  const order = await prisma.productionOrder.create({ data: { recipeId: recipe.id, productId: product.id, plannedQuantity: 1, productionDate: new Date(), createdBy: admin.id, consumptions: { create: [{ rawMaterialId: material.id, plannedQty: 2, unit: 'KG' }] } } });
  const { server } = require('../server/dist/index');
  await new Promise((resolve) => setTimeout(resolve, 400));
  const call = async (url, options = {}) => { const response = await fetch(`http://127.0.0.1:5198/api${url}`, options); return { response, body: await response.json() }; };
  const json = (method, body, token) => ({ method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const login = await call('/auth/login', json('POST', { email: 'admin@easternsweets.com', password }));
  const token = login.body.data.accessToken;
  const transfer = await call('/kitchen/transfers', json('POST', { rawMaterialId: material.id, quantity: 1, receivedBy: 'Smoke Kitchen' }, token));
  assert.equal(transfer.response.status, 201);
  const warning = await call(`/production/${order.id}/complete`, json('PATCH', {}, token));
  assert.equal(warning.response.status, 200);
  assert.equal(warning.body.requiresConfirmation, true);
  assert.equal(warning.body.shortfalls[0].shortfall, 1);
  assert.equal((await prisma.productionOrder.findUnique({ where: { id: order.id } })).status, 'PLANNED');
  const completed = await call(`/production/${order.id}/complete`, json('PATCH', { confirmShortfall: true }, token));
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.data.status, 'COMPLETED');
  assert.equal((await prisma.rawMaterial.findUnique({ where: { id: material.id } })).currentStock, 9);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).currentStock, 1);
  assert.equal(await prisma.kitchenProductionRun.count({ where: { productId: product.id } }), 1);
  const kitchen = await call('/kitchen/stock', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(kitchen.body.data.find((row) => row.id === material.id).currentBalance, -1);
  assert.ok(await prisma.journalEntry.count({ where: { referenceType: 'PRODUCTION', referenceId: order.id } }) === 1);
  console.log('Production/Kitchen smoke passed: shortfall warning + override + WIP consumption + finished stock + journal');
  await prisma.$disconnect();
  await new Promise((resolve) => server.close(resolve));
}

main().catch((error) => { console.error(error); process.exit(1); });
