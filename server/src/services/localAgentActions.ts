import prisma from '../utils/prisma';
import { canReadErpData, queryErpData, type ErpDataPlan, type ErpDataIntent } from './erpDataAssistant';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function localAgentAnswer(text: string, user: { id: string; role: string }): Promise<string> {
  const input = text.toLowerCase();
  const plan: ErpDataPlan = { intent: 'NONE', startDate: today(), endDate: today(), search: '', limit: 10 };
  const requireAccess = (intent: ErpDataIntent) => {
    if (!canReadErpData(intent, user.role)) throw Object.assign(new Error('Aap ke role ko is data ki permission nahi hai.'), { status: 403 });
  };
  if (/\b(stock|inventory|bach[aei]?|remaining|kitn[aei]?)\b/.test(input) && !/\b(add|increase|update|adjust|daalo|dalo|barhao)\b/.test(input)) {
    requireAccess('PRODUCT_STOCK');
    const products = await prisma.product.findMany({ where: { isActive: true }, select: { name: true }, take: 500 });
    const found = products.filter((product) => input.includes(product.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    if (!found) return 'Kis product ka stock check karna hai? Product ka naam likhein, jaise "Gulab Jamun ka stock check karo".';
    plan.intent = 'PRODUCT_STOCK';
    plan.search = found.name;
    const result: any = await queryErpData(plan, user);
    const item = result?.data?.products?.find((product: any) => product.name === found.name);
    return item ? `${item.name} ka stock ${item.stock} ${item.unit} hai.` : `${found.name} ka stock record nahi mila.`;
  }
  if (/\b(sale|sales|revenue|aaj ki bikri|aj ki bikri)\b/.test(input) && !/\b(create|banao|bnao|karo|krdo|complete)\b/.test(input)) {
    requireAccess('SALES_SUMMARY');
    plan.intent = 'SALES_SUMMARY';
    const result: any = await queryErpData(plan, user);
    const data = result?.data;
    return `${data.period} ki sales: ${data.invoices} invoices, net Rs. ${data.netSales}. Scope: ${data.scope}.`;
  }
  if (/\b(customer|profile|balance|due)\b/.test(input) && !/\b(create|banao|bnao|add|update|delete)\b/.test(input)) {
    requireAccess('CUSTOMER_BALANCE');
    const customers = await prisma.customer.findMany({ where: { isActive: true }, select: { name: true }, take: 500 });
    const found = customers.filter((customer) => input.includes(customer.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
    if (!found) return 'Kis customer ki profile dekhni hai? Poora naam likhein.';
    plan.intent = 'CUSTOMER_BALANCE';
    plan.search = found.name;
    const result: any = await queryErpData(plan, user);
    const customer = result?.data?.customers?.find((row: any) => row.name === found.name);
    return customer ? `${customer.name}: ${customer.totalOrders} orders, outstanding balance Rs. ${customer.outstandingBalance}, credit limit Rs. ${customer.creditLimit}.` : `${found.name} ki profile nahi mili.`;
  }
  if (/\b(order|booking)\b/.test(input) && /\b(banao|bnao|create|make|kar do|krdo)\b/.test(input)) {
    return 'Order banane ke liye customer ka naam, product aur quantity batayein. AI key connected hone par main exact details confirm karke order create kar sakta hoon.';
  }
  if (/\b(stock)\b/.test(input) && /\b(add|increase|update|adjust|daalo|dalo|barhao)\b/.test(input)) {
    return 'Stock add karne ke liye product ka naam, quantity aur reason batayein. AI key connected hone par action confirm karke ERP API se stock add hoga.';
  }
  return 'Abhi AI key connect nahi hai. Main yeh kaam kar sakta hoon:\n- Stock: "Gulab Jamun ka stock check karo"\n- Sales: "Aaj ki sales dikhao"\n- Customer: "Ahmed Khan ki profile dikhao"\nERP ke tareeqe ke liye neeche chatbot se poochhein.';
}
