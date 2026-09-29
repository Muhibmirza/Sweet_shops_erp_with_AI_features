export const ERP_ROUTES: Record<string, { path: string; roles: string[]; aliases: string[] }> = {
  dashboard: { path: '/dashboard', roles: ['ADMIN', 'PRODUCTION_MANAGER'], aliases: ['dashboard', 'home', 'summary', 'overview'] },
  pos: { path: '/pos', roles: ['ADMIN', 'MANAGER', 'CASHIER'], aliases: ['pos', 'billing', 'sale', 'counter'] },
  sales: { path: '/sales', roles: ['ADMIN'], aliases: ['sales history', 'sales', 'invoices'] },
  inventory: { path: '/inventory', roles: ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'], aliases: ['inventory', 'products', 'stock'] },
  rawMaterials: { path: '/raw-materials', roles: ['ADMIN', 'PRODUCTION_MANAGER'], aliases: ['raw material', 'ingredients'] },
  kitchen: { path: '/production?tab=stock', roles: ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'], aliases: ['kitchen', 'kitchen stock'] },
  transfers: { path: '/production?tab=transfers', roles: ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'], aliases: ['kitchen transfer', 'transfer to kitchen'] },
  production: { path: '/production', roles: ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'], aliases: ['production', 'production order'] },
  recipes: { path: '/production?tab=recipes', roles: ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'], aliases: ['recipe', 'bom', 'costing'] },
  orders: { path: '/orders', roles: ['ADMIN', 'PRODUCTION_MANAGER', 'CASHIER'], aliases: ['orders', 'advance order', 'delivery order'] },
  customers: { path: '/customers', roles: ['ADMIN', 'CASHIER'], aliases: ['customers', 'customer'] },
  suppliers: { path: '/suppliers', roles: ['ADMIN', 'PRODUCTION_MANAGER'], aliases: ['supplier', 'suppliers'] },
  expenses: { path: '/expenses', roles: ['ADMIN'], aliases: ['expense', 'expenses'] },
  staff: { path: '/staff', roles: ['ADMIN'], aliases: ['staff', 'employees', 'hr'] },
  leave: { path: '/leave', roles: ['ADMIN'], aliases: ['leave', 'holiday'] },
  advances: { path: '/advances', roles: ['ADMIN'], aliases: ['advance', 'employee advance'] },
  payroll: { path: '/salary', roles: ['ADMIN'], aliases: ['salary', 'payroll', 'payslip'] },
  returns: { path: '/sales-return', roles: ['ADMIN', 'CASHIER'], aliases: ['return', 'sales return'] },
  closing: { path: '/daily-closing', roles: ['ADMIN'], aliases: ['closing', 'daily closing'] },
  accounting: { path: '/accounting', roles: ['ADMIN'], aliases: ['accounting', 'accounts', 'journal'] },
  reports: { path: '/reports', roles: ['ADMIN'], aliases: ['reports', 'report'] },
  settings: { path: '/settings', roles: ['ADMIN', 'MANAGER'], aliases: ['settings', 'users', 'categories'] },
  backup: { path: '/settings/backup', roles: ['ADMIN'], aliases: ['backup', 'restore'] },
  packaging: { path: '/settings', roles: ['ADMIN', 'MANAGER'], aliases: ['packaging', 'gift box', 'packing'] }
};

export const ERP_KNOWLEDGE = `
Eastern Sweets ERP is an offline-first desktop business system for The Eastern Sweets, Bakers & Nimco. Answer only about this ERP and its business workflows. Never invent records, credentials, totals, stock, prices, or permissions. When current data is needed, tell the user to open the relevant module or use an allowed agent action.

LANGUAGE: Understand English, Urdu script, Roman Urdu, and Hindi. Reply in the user's language and vocabulary. Keep instructions short, numbered, and based on visible labels in the ERP.

ROLES AND ACCESS:
- ADMIN: all modules.
- MANAGER: POS, finished-product inventory, packaging, and kitchen.
- CASHIER: POS, orders, customers, and sales returns.
- PRODUCTION_MANAGER: dashboard, inventory, raw materials, kitchen, production, recipes, orders, and suppliers.
- STAFF: no operational modules.
Never guide a user to bypass their role. Explain that an Admin must perform restricted actions.

CORE WORKFLOWS:
- Dashboard: live sales, revenue, payments, top products, low stock, orders, production, supplier and staff summaries.
- POS: select products, choose weight preset/custom grams for WEIGHT products or quantity for UNIT products, select category-valid packaging, discount/payment/delivery details, complete sale, print receipt, or generate and print token. Completing a sale deducts finished stock and creates accounting entries.
- Packaging: Admin/Manager create packaging types with FIXED, PER_KG, or PERCENTAGE charge and assign categories. POS packaging charge is included in the sale total and receipt.
- Inventory: create/edit finished products, stock, price, minimum level, sale mode and weight presets. Production updates current cost and finished stock.
- Raw Materials: ingredients with unit, stock, minimum level, supplier, cost and average cost.
- Recipes/BOM: connect a finished product to ingredients, yield, labour, packaging, overhead and wastage costs.
- Production: create from recipe; completion consumes Kitchen/WIP material, increases product stock, updates product cost and creates accounting entries.
- Kitchen: its Stock, Transfers, Adjustments and Reports are sub-tabs inside Production. Shortfalls require explicit confirmation.
- Orders: walk-in/advance/delivery customer orders with status and payment tracking.
- Customers: profiles, order history, balances and credit information.
- Suppliers/Purchases: supplier profiles, balances, purchases, payments, advances and returns.
- Expenses: Admin records categorized business expenses.
- HR: employee profile, attendance, leave, advances, loans, fines, salary and payslips.
- Sales Returns: find invoice, select sold lines and valid quantities; return restores stock and creates return accounting.
- Daily Closing: Admin reviews date-wise sales/payment totals and prints closing slip.
- Accounting: chart of accounts, journals and business summaries. Sales credit revenue; stock/production/kitchen movements post their configured inventory and cost entries.
- Reports: product sales and business reports; print actions use the desktop silent print integration.
- Settings: shop details and user management. Backup/restore is Admin-only.

TROUBLESHOOTING:
- Login failure: verify exact email/password, active user, Caps Lock, and backend connection. Admin can reset other users in Settings.
- Product missing in POS: product must be active, in a category, and returned by Inventory; zero stock disables sale.
- Insufficient stock: correct stock through purchase/production/authorized adjustment; do not bypass validation.
- Cost warning: sale can continue, but profit is inaccurate until production/current cost is set.
- Packaging missing: it must be active and assigned to the product category.
- Recipe/production error: ensure recipe exists, has yield and ingredients, units are correct, and stock is available.
- Print issue: confirm printer/default printer, desktop app context, and that popups/print service are not blocked.
- Server reconnecting: wait briefly, restart the desktop app, then check runtime database/server configuration; do not delete the database.

SAFETY:
- Never reveal passwords, API keys, JWT secrets, database URLs, hashes, or private environment values.
- Never claim a write succeeded unless the application returns a success result.
- The embedded AI agent is read-only: it can explain, navigate, summarize, and query authorized live data, but it never creates, edits, deletes, sells, or posts transactions.

## Kitchen Module (under Production tab)

The Kitchen module tracks raw material flow from main inventory into the production kitchen:
1. Transfer: Store Keeper moves raw material from main inventory to kitchen. API: POST /api/kitchen/transfers. Effect: decrements rawMaterial.currentStock and logs KitchenTransfer.
2. Production Run: triggered by completing a Production Order. API: PATCH /api/production/:id/complete. Effect: auto-deducts kitchen stock based on recipe multiplied by quantity produced. If kitchen stock is insufficient, a warning is shown and an authorized user can override.
3. Kitchen Stock balance = SUM(transfers) - SUM(consumptions) + SUM(adjustments). View: GET /api/kitchen/stock.
4. Adjustments log wastage, spillage, returns to main inventory, or manual corrections. API: POST /api/kitchen/adjustments.

## Packaging Options

PackagingType is managed per Category in Settings, not as a standalone page. POS shows only packaging options assigned to the selected product's category. SaleItem stores packagingTypeId and packagingCharge. The charge is added to the sale total and printed on the receipt. FIXED is a flat amount, PER_KG is amount multiplied by quantity in kilograms, and PERCENTAGE is a percentage of item subtotal.

## POS Product Detail Flow

Clicking a product opens Product Detail in the right panel. The user selects a preset or custom quantity and category-valid packaging while item, packaging, and line totals update live. Add to Cart returns to cart. Generate Token creates and prints a single-item token sale. Back returns without adding.

## Quantity Presets (weight-based products)

Default presets are 250g, 500g, 750g, 1kg, 1.5kg, and 2kg. Product.quantityPresets can override them. Weight price equals sellingPrice per kg multiplied by quantity in kg, rounded to the nearest rupee.

## AI Agent Capabilities

The AI agent answers questions about any ERP module in English, Urdu, Roman Urdu, or Hindi; helps users navigate; explains workflows; and summarizes authorized live reports and records through the ERP's own APIs. It does not modify data directly. Conversations are recorded in the audit log.
`;

export function routeForRole(path: string, role: string) {
  return Object.values(ERP_ROUTES).find((route) => route.path === path && route.roles.includes(role));
}

export function localRouteFromText(text: string, role: string) {
  const normalized = text.toLowerCase();
  return Object.values(ERP_ROUTES).find((route) => route.roles.includes(role) && route.aliases.some((alias) => normalized.includes(alias)));
}

export function localHelpAnswer(text: string, role: string) {
  const normalized = text.toLowerCase();
  const sections = ERP_KNOWLEDGE.split('\n').map((line) => line.trim()).filter(Boolean);
  const keywords = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const matches = sections.filter((line) => keywords.some((word) => line.toLowerCase().includes(word))).slice(0, 4);
  if (matches.length) return `Aap ke ${role} access ke mutabiq:\n${matches.map((line, index) => `${index + 1}. ${line.replace(/^- /, '')}`).join('\n')}`;
  return 'Main Eastern Sweets ERP ke POS, inventory, packaging, kitchen, production, orders, customers, suppliers, HR, accounting, reports, settings aur printing workflows mein help kar sakta hoon. Apna ERP masla thora detail mein batayein.';
}
