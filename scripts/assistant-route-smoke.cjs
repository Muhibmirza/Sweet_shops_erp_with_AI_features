const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.tmp', 'assistant-'));
const database = path.join(temp, 'test.db');
fs.closeSync(fs.openSync(database, 'w'));

async function main() {
  const groq = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      res.setHeader('Content-Type', 'application/json');
      if (request.response_format?.json_schema?.name === 'erp_data_plan') res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: 'SALES_SUMMARY', startDate: '2026-09-29', endDate: '2026-09-29', search: '', limit: 20 }) } }] }));
      else res.end(JSON.stringify({ choices: [{ message: { content: 'Live ERP summary ready hai.' } }] }));
    });
  });
  await new Promise((resolve) => groq.listen(0, '127.0.0.1', resolve));
  const password = `Smoke@${randomBytes(8).toString('hex')}`;
  Object.assign(process.env, { DATABASE_URL: `file:${database.replaceAll('\\', '/')}`, JWT_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'), SEED_ADMIN_PASSWORD: password, SEED_CASHIER_PASSWORD: password, SEED_PRODUCTION_PASSWORD: password, GROQ_API_KEY: 'route-smoke-key', GROQ_API_BASE_URL: `http://127.0.0.1:${groq.address().port}/openai/v1`, NODE_ENV: 'production', CLIENT_URL: 'http://localhost:5197', PORT: '5197', UPLOAD_DIR: path.join(temp, 'uploads') });
  const prismaCli = path.join(root, 'server/node_modules/prisma/build/index.js');
  const pushed = spawnSync(process.execPath, [prismaCli, 'db', 'push', '--schema', path.join(root, 'prisma/schema.prisma'), '--skip-generate'], { env: process.env, encoding: 'utf8' });
  assert.equal(pushed.status, 0, pushed.stderr);
  await require('../server/dist/services/bootstrapService').ensureDefaultData();
  const prisma = require('../server/dist/utils/prisma').default;
  const before = await prisma.employee.count();
  const { server: erpServer } = require('../server/dist/index');
  await new Promise((resolve) => setTimeout(resolve, 400));
  const call = async (url, options = {}) => { const response = await fetch(`http://127.0.0.1:5197/api${url}`, options); return { response, body: await response.json() }; };
  const json = (body, token) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const login = await call('/auth/login', json({ email: 'admin@easternsweets.com', password }));
  const token = login.body.data.accessToken;
  const writeRequest = await call('/assistant/command', json({ text: 'Fariz naam ka employee create karo' }, token));
  assert.equal(writeRequest.body.data.action, null);
  assert.match(writeRequest.body.data.reply, /read-only/i);
  assert.equal(await prisma.employee.count(), before);
  const navigation = await call('/assistant/command', json({ text: 'Production kholo' }, token));
  assert.equal(navigation.body.data.action.type, 'NAVIGATE');
  assert.equal(navigation.body.data.action.path, '/production');
  assert.ok(await prisma.auditLog.count({ where: { action: 'AI_CONVERSATION' } }) >= 2);
  console.log('Assistant route smoke passed: live help + navigation + write request remained read-only');
  await prisma.$disconnect();
  await new Promise((resolve) => erpServer.close(resolve));
  await new Promise((resolve) => groq.close(resolve));
}

main().catch((error) => { console.error(error); process.exit(1); });
