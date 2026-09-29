import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  FileClock,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  PiggyBank,
  BadgeDollarSign,
  RotateCcw,
  Receipt,
  Settings,
  ShoppingCart,
  ScrollText,
  Users
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { PERMISSIONS, ROLE_LABELS, type TabKey } from '../config/permissions';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { ErpAiAssistant } from './assistant/ErpAiAssistant';

const nav = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pos', to: '/pos', label: 'POS', icon: ShoppingCart },
  { key: 'sales', to: '/sales', label: 'Sales', icon: Receipt },
  { key: 'inventory', to: '/inventory', label: 'Inventory', icon: Boxes },
  { key: 'inventory', to: '/raw-materials', label: 'Raw Materials', icon: Boxes },
  { key: 'production', to: '/production', label: 'Production', icon: PackagePlus },
  { key: 'orders', to: '/orders', label: 'Orders', icon: ClipboardList },
  { key: 'customers', to: '/customers', label: 'Customers', icon: Users },
  { key: 'suppliers', to: '/suppliers', label: 'Suppliers', icon: Building2 },
  { key: 'expenses', to: '/expenses', label: 'Expenses', icon: CreditCard },
  { key: 'hr', to: '/staff', label: 'HR', icon: Users },
  { key: 'hr', to: '/leave', label: 'Leave', icon: FileClock },
  { key: 'hr', to: '/advances', label: 'Advances', icon: PiggyBank },
  { key: 'payroll', to: '/salary', label: 'Payroll', icon: BadgeDollarSign },
  { key: 'sales-returns', to: '/sales-return', label: 'Returns', icon: RotateCcw },
  { key: 'closing', to: '/daily-closing', label: 'Closing', icon: Receipt },
  { key: 'accounting', to: '/accounting', label: 'Accounting', icon: ScrollText },
  { key: 'reports', to: '/reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', to: '/settings', label: 'Settings', icon: Settings },
  { key: 'settings', to: '/settings/backup', label: 'Backup', icon: DatabaseBackup }
] satisfies Array<{ key: TabKey; to: string; label: string; icon: typeof LayoutDashboard }>;

export function Layout() {
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };
  const allowedTabs = user ? PERMISSIONS[user.role]?.tabs || [] : [];
  const visibleNav = nav.filter((item) => allowedTabs.includes(item.key));
  const mobileNav = visibleNav.slice(0, 4);

  return (
    <div className="erp-shell min-h-screen bg-[#f6f0e7] text-[#123b39]">
      <aside
        className={`erp-sidebar fixed inset-y-0 left-0 z-30 hidden border-r border-[#e4d2b6] bg-[#fffaf0] transition-all duration-300 lg:block ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className={`flex h-24 px-4 ${sidebarOpen ? 'items-center' : 'items-center justify-center'}`}>
          <div className={`flex min-w-0 items-center ${sidebarOpen ? 'w-full gap-3' : 'justify-center'}`}>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[#ead8bb]">
              <img src="/eastern-sweets-logo.png" alt="Eastern Sweets" className="h-9 w-9 object-contain" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <div className="whitespace-nowrap font-serif text-lg font-semibold tracking-wide text-[#0f615d]">Eastern Sweets</div>
                <div className="mt-1 inline-flex rounded-full bg-[#f1e3cb] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#c88421]">
                  {user ? ROLE_LABELS[user.role] : 'System'}
                </div>
              </div>
            )}
          </div>
        </div>
        <nav className="sidebar-scroll h-[calc(100vh-6rem)] space-y-1.5 overflow-y-auto px-3 pb-5">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `erp-nav-link flex min-h-12 items-center rounded-xl text-sm font-medium transition duration-200 ${
                  sidebarOpen ? 'gap-3 px-3' : 'mx-auto h-11 w-11 justify-center p-0'
                } ${
                  isActive ? 'bg-[#0f615d] text-white shadow-md shadow-[#0f615d]/18' : 'text-[#496864] hover:bg-[#f1e3cb] hover:text-[#0f615d]'
                }`
              }
            >
              <item.icon size={20} className="shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <button
        className={`fixed top-1/2 z-40 hidden h-12 w-7 -translate-y-1/2 place-items-center rounded-r-xl border border-l-0 border-[#e4d2b6] bg-white text-[#0f615d] shadow-lg transition-[left,background-color] duration-300 hover:bg-[#fff4df] lg:grid ${
          sidebarOpen ? 'left-64' : 'left-20'
        }`}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <ChevronLeft size={18} className={!sidebarOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      <div className={sidebarOpen ? 'lg:pl-64' : 'lg:pl-20'}>
        <header className="erp-header sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e4d2b6]/80 bg-[#fffaf0]/88 px-4 backdrop-blur-xl lg:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c88421]">Bakers &amp; Nimco · Since 1969</p>
            <h1 className="font-serif text-lg font-semibold tracking-wide text-[#0f615d]">Eastern Sweets</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl border border-[#ead8bb] bg-white/70 px-3 py-2 text-right text-sm shadow-sm sm:block">
              <div className="font-semibold text-[#123b39]">{user?.name}</div>
              <div className="text-xs font-medium text-[#c88421]">{user?.role}</div>
            </div>
            <button className="touch rounded-xl border border-[#ead8bb] bg-white/70 text-[#55716d] shadow-sm transition hover:border-[#c88421] hover:text-[#0f615d]" onClick={() => setLogoutOpen(true)} aria-label="Logout">
              <LogOut />
            </button>
          </div>
        </header>
        <main className="erp-content px-4 pb-24 pt-5 lg:px-6">
          <ModuleGuide pathname={location.pathname} />
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#e4d2b6] bg-[#fffaf0]/95 shadow-[0_-12px_30px_rgba(31,23,10,0.08)] backdrop-blur-xl lg:hidden">
        {mobileNav.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `grid min-h-16 place-items-center text-xs font-medium transition ${isActive ? 'text-[#0f615d]' : 'text-[#7b8f8b]'}`}>
            <item.icon size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => `grid min-h-16 place-items-center text-xs font-medium transition ${isActive ? 'text-[#0f615d]' : 'text-[#7b8f8b]'}`}>
          <Receipt size={22} />
          <span>More</span>
        </NavLink>
      </nav>

      {logoutOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#031716]/85 p-4 backdrop-blur-md">
          <section className="w-full max-w-sm rounded-2xl border border-[#ead8bb] bg-[#fffaf0] p-5 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#f1e3cb] text-[#0f615d]">
              <LogOut size={22} />
            </div>
            <h2 className="font-serif text-xl font-semibold text-[#0f615d]">Logout Confirmation</h2>
            <p className="mt-2 text-sm text-[#55716d]">Are you sure you want to logout?</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button className="touch rounded-xl border border-[#dac197] bg-white/75 font-semibold text-[#0f615d]" onClick={() => setLogoutOpen(false)}>
                No
              </button>
              <button className="touch rounded-xl bg-[#0f615d] font-semibold text-white shadow-lg shadow-[#0f615d]/20" onClick={signOut}>
                Yes, Logout
              </button>
            </div>
          </section>
        </div>
      )}
      <ErpAiAssistant />
    </div>
  );
}

type Guide = { title: string; summary: string; points: string[] };

const guides: Array<{ match: (path: string) => boolean; guide: Guide }> = [
  {
    match: (path) => path === '/dashboard',
    guide: {
      title: 'Dashboard Workflow',
      summary: 'This page shows live shop summaries from backend sales, inventory, production, orders, expenses, payroll, and accounting data.',
      points: [
        'POS sales update today sales, revenue, payment breakdown, top products, and profit widgets.',
        'Production completion updates finished stock and product cost, then dashboard stock values refresh.',
        'Low stock, pending orders, supplier dues, and attendance values come from their own modules.'
      ]
    }
  },
  {
    match: (path) => path === '/pos',
    guide: {
      title: 'POS / Billing Workflow',
      summary: 'Use POS for customer billing. Product stock comes from Inventory and Production; every completed sale deducts stock and creates accounting entries.',
      points: [
        'Add products to cart, choose KG or GRAM where available, apply discount, select payment method, then complete sale.',
        'Cash sales can record cash received and change. Delivery orders can add delivery charges to the final bill.',
        'If product cost is not set yet, sale still works, but profit uses zero or fallback cost until production sets current cost.'
      ]
    }
  },
  {
    match: (path) => path === '/inventory',
    guide: {
      title: 'Inventory / Product Workflow',
      summary: 'Products are finished goods sold in POS and used in Orders. Selling price is entered here; production sets the product cost.',
      points: [
        'Create product with name, category, unit, selling price, opening stock, and minimum stock level.',
        'Product cost/currentCost is not manually entered here. It is updated when a Production Order is completed from a Recipe.',
        'POS uses product selling price for billing and product stock for quantity validation.'
      ]
    }
  },
  {
    match: (path) => path === '/raw-materials',
    guide: {
      title: 'Raw Material Workflow',
      summary: 'Raw materials are ingredients used in Recipes and consumed during Production. Supplier purchases and stock in/out keep stock live.',
      points: [
        'Add raw materials with unit, stock, minimum level, cost, and supplier.',
        'Recipe/BOM pulls raw materials from this list and calculates product cost from avgCost/costPerUnit.',
        'Production completion deducts raw material stock and adds finished product stock.'
      ]
    }
  },
  {
    match: (path) => path === '/production',
    guide: {
      title: 'Production Workflow',
      summary: 'Production Orders, Recipes/BOM, Kitchen Stock, Transfers, Adjustments, and Kitchen Reports are managed together here.',
      points: [
        'Create production order from a recipe and planned quantity; material requirements are generated automatically.',
        'When completed, recipe quantities are deducted from Kitchen Stock and finished product stock is increased.',
        'Product currentCost is updated from production cost, so POS profit reports become more accurate.'
      ]
    }
  },
  {
    match: (path) => path === '/orders',
    guide: {
      title: 'Advance Order Workflow',
      summary: 'Orders are for advance, delivery, or walk-in commitments. They stay in order history even when cancelled.',
      points: [
        'Create order with customer, delivery date, items, advance paid, due amount, and notes.',
        'Status changes keep order history visible, including CANCELLED orders.',
        'Customer Profile shows all order history and outstanding balances.'
      ]
    }
  },
  {
    match: (path) => path === '/customers' || path.startsWith('/customers/'),
    guide: {
      title: 'Customer Workflow',
      summary: 'Customers are used in Orders and optional POS sale history. Profile combines contact details, orders, sales, and outstanding balance.',
      points: [
        'Add customers with name, phone, city, and address before creating advance or delivery orders.',
        'Orders and POS sales linked to the customer appear in profile history.',
        'Outstanding balance is tracked from order due amounts and customer credit activity.'
      ]
    }
  },
  {
    match: (path) => path === '/suppliers' || path.startsWith('/suppliers/'),
    guide: {
      title: 'Supplier Workflow',
      summary: 'Suppliers connect raw material purchases, supplier balances, payments, and ledgers.',
      points: [
        'Add supplier first, then link raw materials and purchase orders to that supplier.',
        'Purchase orders increase supplier outstanding balance; supplier payments reduce it.',
        'Supplier Profile shows purchase history, payments, and debit/credit ledger.'
      ]
    }
  },
  {
    match: (path) => path === '/purchases',
    guide: {
      title: 'Purchase Workflow',
      summary: 'Purchases receive raw materials from suppliers and update raw material stock and cost.',
      points: [
        'Select supplier and raw material, enter quantity and unit cost, then save purchase.',
        'Purchase increases raw material stock and supplier payable balance.',
        'Material cost feeds Recipe and Production costing.'
      ]
    }
  },
  {
    match: (path) => path === '/expenses',
    guide: {
      title: 'Expense Workflow',
      summary: 'Expenses record daily business costs like rent, electricity, gas, fuel, repairs, and miscellaneous costs.',
      points: [
        'Each expense is stored from backend and appears in reports/accounting.',
        'Gas and electricity are recorded here, not in Recipe overhead, to avoid double accounting.',
        'Reports use expenses to calculate operating expenses and net profit.'
      ]
    }
  },
  {
    match: (path) => path === '/staff' || path.startsWith('/hr/employees'),
    guide: {
      title: 'HR / Employee Workflow',
      summary: 'HR stores employee profiles, attendance, salaries, advances, loans, fines, and ledger history.',
      points: [
        'Create employees with salary type: daily wage or monthly salary.',
        'Attendance feeds working days for payroll; approved leave counts as paid leave.',
        'Employee detail shows profile, salary, advances, loans, fines, revisions, and ledger.'
      ]
    }
  },
  {
    match: (path) => path === '/salary',
    guide: {
      title: 'Payroll Workflow',
      summary: 'Payroll calculates salary using attendance, wage/salary type, arrears, bonus, advances, loans, fines, and deductions.',
      points: [
        'Select employee and month/year; working days and outstanding advance auto-fill from backend data.',
        'Generate salary to save payroll record; marking paid creates salary payment accounting entry.',
        'Payslip prints the final earning and deduction breakdown.'
      ]
    }
  },
  {
    match: (path) => path === '/leave',
    guide: {
      title: 'Leave Workflow',
      summary: 'Leave requests control paid leave. Attendance marked as LEAVE requires an approved leave request.',
      points: [
        'Create leave request with type, dates, days, and reason.',
        'Approved leave counts as paid attendance; ABSENT remains unpaid.',
        'Payroll uses attendance and leave records to calculate payable days.'
      ]
    }
  },
  {
    match: (path) => path === '/advances',
    guide: {
      title: 'Employee Advance Workflow',
      summary: 'Employee advances track money given before salary and remaining balance to recover.',
      points: [
        'Give advance with amount, date, and reason.',
        'Payroll can auto-fill outstanding advance deduction for the selected employee.',
        'Paid salary reduces advance balance oldest-first.'
      ]
    }
  },
  {
    match: (path) => path === '/sales',
    guide: {
      title: 'Sales Ledger Workflow',
      summary: 'This page shows every sold product as one row, pulled from backend SaleItem records with invoice, customer, product, quantity, rate, and total.',
      points: [
        'Use filters to review sales by date, product, customer, invoice number, or walk-in/delivery type.',
        'Click an invoice number to inspect the full sale detail without leaving the page.',
        'Revenue here comes from completed POS sales; reports also include delivered advance orders and subtract sales returns.'
      ]
    }
  },
  {
    match: (path) => path === '/sales-return',
    guide: {
      title: 'Sales Return Workflow',
      summary: 'Sales returns reverse sold items against an existing sale and return stock back into inventory.',
      points: [
        'Search/select previous sale, choose return items and quantities.',
        'Returned quantity increases product stock and creates return/accounting records.',
        'Use this only for actual customer returns, not order cancellation.'
      ]
    }
  },
  {
    match: (path) => path === '/daily-closing',
    guide: {
      title: 'Daily Closing Workflow',
      summary: 'Daily closing summarizes cash counter activity for the selected day.',
      points: [
        'It pulls total sales, payment breakdown, discounts, expenses, and net cash values.',
        'Cashier can print the closing slip at end of day.',
        'Reports and accounting use the same backend sales/expense data.'
      ]
    }
  },
  {
    match: (path) => path.startsWith('/accounting'),
    guide: {
      title: 'Accounting Workflow',
      summary: 'Accounting reads auto-created journal entries from sales, purchases, expenses, salaries, advances, and production.',
      points: [
        'Chart of Accounts defines cash, bank, inventory, payable, receivable, income, expense, and equity accounts.',
        'Journal entries are generated automatically by transaction modules; admin can also add manual entries.',
        'Trial balance, cash book, profit/loss, and balance sheet come from journal lines.'
      ]
    }
  },
  {
    match: (path) => path === '/reports',
    guide: {
      title: 'Reports Workflow',
      summary: 'Reports combine backend data from POS, products, orders, purchases, expenses, payroll, and accounting.',
      points: [
        'Sales reports use POS Sale and SaleItem records.',
        'Profit reports use revenue, COGS from product cost snapshots, and operating expenses.',
        'Stock and supplier reports use live inventory and purchase/order balances.'
      ]
    }
  },
  {
    match: (path) => path === '/settings',
    guide: {
      title: 'Settings Workflow',
      summary: 'Settings control shop details, users, roles, categories, system version, and maintenance links.',
      points: [
        'Shop phone/address appears on receipts and slips.',
        'User roles control which sidebar tabs and actions are visible.',
        'Categories organize products and raw materials across Inventory and POS.'
      ]
    }
  },
  {
    match: (path) => path === '/settings/backup',
    guide: {
      title: 'Backup / Restore Workflow',
      summary: 'Backup protects shop data. Restore brings saved database data back after reset or system failure.',
      points: [
        'Manual backup saves selected data groups or full database to a chosen folder.',
        'Auto backup runs on the saved schedule when the backend/backup tool is active.',
        'Data reset clears business test entries but keeps users, settings, accounts, and backup history.'
      ]
    }
  }
];

function ModuleGuide({ pathname }: { pathname: string }) {
  const match = guides.find((item) => item.match(pathname));
  if (!match) return null;
  const { guide } = match;

  return (
    <section className="mb-5 rounded-2xl border border-[#dac197] bg-[#fffaf0] p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0f615d] text-white">
          <BookOpen size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold text-[#0f615d]">{guide.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#55716d]">{guide.summary}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {guide.points.map((point) => (
              <div key={point} className="rounded-xl border border-[#ead8bb] bg-white/65 px-3 py-2 text-sm leading-5 text-[#31534d]">
                {point}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
