const http = require('http');
const assert = require('assert');

async function main() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      requests.push({ headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      const input = JSON.parse(body.toString('utf8'));
      if (input.response_format?.json_schema?.name === 'erp_data_plan') {
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: 'SALES_SUMMARY', startDate: '2026-09-29', endDate: '2026-09-29', search: '', limit: 20 }) } }] }));
        return;
      }
      res.end(JSON.stringify({ choices: [{ message: { content: 'Aaj ki sale Rs. 10,000 hai.' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.GROQ_API_KEY = 'smoke-test-key';
  process.env.GROQ_API_BASE_URL = `http://127.0.0.1:${server.address().port}/openai/v1`;
  const ai = require('../server/dist/services/aiAssistant.js');
  try {
    assert.equal(ai.aiStatus().provider, 'groq');
    const plan = await ai.interpretErpDataQuestion('aaj kitni sale hui?', { role: 'ADMIN' });
    assert.equal(plan.intent, 'SALES_SUMMARY');
    const answer = await ai.askErpAssistant([{ role: 'user', text: 'aaj kitni sale hui?' }], { role: 'ADMIN', liveData: { total: 10000 } });
    assert.match(answer, /10,000/);
    assert.ok(requests.every((request) => request.headers.authorization === 'Bearer smoke-test-key'));
    console.log(`AI provider read-only smoke passed (${requests.length} requests)`);
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
