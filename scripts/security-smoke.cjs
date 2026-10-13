const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(root, '.tmp', 'security-'));
fs.closeSync(fs.openSync(path.join(temp, 'test.db'), 'w'));
Object.assign(process.env, {
 DATABASE_URL: `file:${path.join(temp, 'test.db').replaceAll('\\','/')}`,
 JWT_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
 SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'), SEED_CASHIER_PASSWORD: randomBytes(24).toString('hex'), SEED_PRODUCTION_PASSWORD: randomBytes(24).toString('hex'),
 NODE_ENV: 'production', CLIENT_URL: 'http://localhost:5198', PORT: '5198', UPLOAD_DIR: path.join(temp,'uploads')
});
const schema = path.join(root, 'prisma/schema.prisma');
const push = spawnSync(process.execPath, [path.join(root,'server/node_modules/prisma/build/index.js'), 'db','push','--schema',schema,'--skip-generate'], {env:process.env,encoding:'utf8'});
assert.equal(push.status,0,`Disposable schema creation failed: ${push.stderr}`);
const {validateEnvironment} = require('../server/dist/config/environment');
for(const key of ['DATABASE_URL','JWT_SECRET','JWT_REFRESH_SECRET']) { const saved=process.env[key];process.env[key]='';assert.throws(validateEnvironment);process.env[key]=saved; }
const prisma = require('../server/dist/utils/prisma').default;
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');
let count=0;
async function request(url, options={}) {
 const response=await fetch(`http://localhost:5198/api${url}`,options);
 const body=await response.json();return {response,body};
}
function opts(token, method='GET', body) {return {method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})};}
function check(actual,expected,label){assert.equal(actual,expected,label);count++;}
(async()=>{
 await require('../server/dist/services/bootstrapService').ensureDefaultData();
 require('../server/dist/index');
 await new Promise(r=>setTimeout(r,500));
 const tokens={};const users={};
 for(const [role,email,key] of [['ADMIN','admin@easternsweets.com','SEED_ADMIN_PASSWORD'],['CASHIER','cashier@easternsweets.com','SEED_CASHIER_PASSWORD'],['PRODUCTION_MANAGER','production@easternsweets.com','SEED_PRODUCTION_PASSWORD']]) {
  const result=await request('/auth/login',opts(null,'POST',{email,password:process.env[key]}));check(result.response.status,200,`${role} login`);
  check('password' in result.body.data.user,false,'No password response');tokens[role]=result.body.data.accessToken;users[role]=result.body.data.user;
  const payload=jwt.verify(tokens[role],process.env.JWT_SECRET);check(payload.exp-payload.iat,900,'Access lifetime');
  const refresh=jwt.verify(result.body.data.refreshToken,process.env.JWT_REFRESH_SECRET);check(refresh.exp-refresh.iat,30*86400,'Refresh lifetime');
  const renewed=await request('/auth/refresh-token',opts(null,'POST',{refreshToken:result.body.data.refreshToken}));check(renewed.response.status,200,'Refresh succeeds');
  const stored=await prisma.user.findUnique({where:{id:users[role].id}});check(await bcrypt.compare(process.env[key],stored.password),true,'Password is bcrypt hash');
 }
 for(const endpoint of ['/products','/categories','/raw-materials','/suppliers','/purchases','/stock','/customers','/orders','/sales','/tokens','/expenses','/employees','/attendance','/salary','/loans','/fines','/reports/daily','/dashboard/stats','/settings','/accounting/chart-of-accounts','/recipes','/production','/leave','/advances','/audit-logs']) check((await request(endpoint)).response.status,401,`Unauthenticated ${endpoint}`);
 for(const role of ['CASHIER','PRODUCTION_MANAGER']) for(const endpoint of ['/employees','/employees/changed-id','/salary','/accounting/chart-of-accounts','/attendance','/loans','/fines','/leave','/advances','/reports/payroll','/audit-logs','/settings/users']) check((await request(endpoint,opts(tokens[role]))).response.status,403,`${role} blocked ${endpoint}`);
 check((await request('/sales',opts(tokens.PRODUCTION_MANAGER))).response.status,403,'Production sales blocked');
 check((await request('/employees/changed-id',opts(tokens.CASHIER,'DELETE'))).response.status,403,'Employee delete blocked');
 check((await request(`/settings/users/${users.CASHIER.id}`,opts(tokens.CASHIER,'PATCH',{role:'ADMIN'}))).response.status,403,'Self escalation blocked');
 check((await request('/settings/data/reset',opts(tokens.CASHIER,'POST',{}))).response.status,403,'Reset blocked');
 check((await request('/accounting/journal-entries',opts(tokens.PRODUCTION_MANAGER,'POST',{}))).response.status,403,'Accounting write blocked');
 check((await request('/auth/login',opts(null,'POST',{email:'invalid',password:randomBytes(8).toString('hex')}))).response.status,400,'Auth input validation');
 const forged=jwt.sign({id:users.ADMIN.id},randomBytes(48).toString('hex'));
 check((await request('/auth/me',opts(forged))).response.status,401,'Forged JWT blocked');
 for(const quantity of [-1,'NaN','Infinity','12bad',{},true]) check((await request('/products/missing/add-stock',opts(tokens.ADMIN,'POST',{quantity}))).response.status,400,'Numeric input blocked');
 const category=await request('/categories',opts(tokens.ADMIN,'POST',{name:'Security fixture',type:'FINISHED_GOOD'}));check(category.response.status,201,'Valid category write');
 const product=await request('/products',opts(tokens.ADMIN,'POST',{name:'Security fixture',categoryId:category.body.data.id,unit:'KG',sellingPrice:100,currentStock:10,currentCost:50}));check(product.response.status,201,'Valid product write');
 const giftBox=await prisma.packagingType.findFirst({where:{name:'Gift Box',categories:{some:{categoryId:category.body.data.id}}}});check(Boolean(giftBox),true,'Category packaging linked');
 const sale=await request('/sales',opts(tokens.CASHIER,'POST',{items:[{productId:product.body.data.id,quantity:1,unitPrice:100,packagingTypeId:giftBox.id}],paymentMethod:'CASH',cashReceived:200}));check(sale.response.status,201,'Valid cashier sale');
 check(sale.body.data.items[0].packagingCharge,100,'Packaging line charge');
 check(sale.body.data.netAmount,200,'Packaging included in sale total');
 const saleJournal=await prisma.journalEntry.findFirst({where:{referenceType:'SALE',referenceId:sale.body.data.id},include:{lines:{include:{account:true}}}});check(saleJournal.lines.find(line=>line.account.code==='3001').credit,200,'Packaging included in sales revenue journal');
 const after=await prisma.product.findUnique({where:{id:product.body.data.id}});check(after.currentStock,9,'Sale stock movement preserved');
 const staff=await request(`/settings/users/${users.CASHIER.id}`,opts(tokens.ADMIN,'PATCH',{role:'STAFF'}));check(staff.response.status,200,'Existing Staff option preserved');
 await prisma.user.update({where:{id:users.CASHIER.id},data:{role:'CASHIER'}});
 const form=new FormData();form.append('image',new Blob(['invalid'],{type:'text/html'}),'image.png');
 check((await request('/products',{method:'POST',headers:{Authorization:`Bearer ${tokens.ADMIN}`},body:form})).response.status,400,'Invalid image MIME blocked');
 const restore=new FormData();restore.append('backup',new Blob(['invalid'],{type:'text/html'}),'backup.dump');
 check((await request('/settings/backup/restore',{method:'POST',headers:{Authorization:`Bearer ${tokens.ADMIN}`},body:restore})).response.status,400,'Invalid backup MIME blocked');
 const bad=await request('/categories/missing',opts(tokens.ADMIN,'PUT',{name:'missing'}));check(bad.response.status,500,'Async error reaches handler');check(bad.body.message,'Something went wrong. Please try again.','DB error sanitized');
 const health=await request('/health',{headers:{Origin:'https://untrusted.invalid'}});check(health.response.headers.get('x-content-type-options'),'nosniff','Helmet nosniff');assert(health.response.headers.get('content-security-policy').includes("script-src 'self'"));count++;check(health.response.headers.get('access-control-allow-origin'),process.env.CLIENT_URL,'CORS restricted');
 const pm=await request('/dashboard/stats',opts(tokens.PRODUCTION_MANAGER));check(pm.response.status,200,'Production dashboard preserved');check('todayRevenue' in pm.body.data,false,'Revenue hidden from production role');
 // Exercise parameterized SQLite backup and merge on disposable data, including a quoted filename.
 const copy=path.join(temp,"backup'quoted.db");await prisma.$executeRaw`VACUUM INTO ${copy}`;check(fs.existsSync(copy),true,'Parameterized vacuum');
 const merged=await require('../server/dist/services/backupService').mergeFullDatabaseBackups([copy]);check(merged.mergedFiles,1,'Parameterized merge');
 for(let i=0;i<10;i++) {const r=await request('/auth/login',opts(null,'POST',{email:'admin@easternsweets.com',password:randomBytes(12).toString('hex')}));if(i===9)check(r.response.status,429,'Auth rate limit');}
 for(let i=0;i<205;i++){const r=await request('/health');if(i===204)check(r.response.status,429,'API rate limit');}
 console.log(`PASS: ${count} security assertions; disposable database only.`);
 await prisma.$disconnect();process.exit(0);
})().catch(async e=>{console.error(e.message);await prisma.$disconnect();process.exit(1);});
