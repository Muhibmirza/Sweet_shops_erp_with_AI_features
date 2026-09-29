# eastern_sweets_erp

A complete point-of-sale, inventory, production, accounting, supplier, customer, and workforce management system for sweets shops, bakeries, confectioneries, dessert businesses, and other production-based retail stores.

This repository is currently branded and deployed as **Eastern Sweets**, but the underlying system is not limited to one shop. Business details, products, categories, users, pricing, recipes, suppliers, and operational data can be configured for other businesses.

## What The System Does

The application connects day-to-day shop operations in one system. A sale reduces finished-product stock, production consumes raw materials and updates product cost, supplier activity affects inventory and payables, salary activity connects to employee records, and accounting entries provide a financial view of the business.

### Point Of Sale

- Fast POS billing with quantity, weight, rate, discount, delivery charges, cash received, and change calculation
- Walk-in and customer-linked sales
- Invoice receipts and optional token slips for busy counters
- Sales returns with stock restoration and accounting reversal
- Daily closing and cashier workflows
- Thermal receipt printing through the Windows desktop application

### Sales, Orders, And Customers

- Searchable sales ledger with invoice, token, product, customer, and date filters
- Advance and delivery orders with payment and status tracking
- Customer profiles with order history, POS sales, spending, and outstanding balances
- Product-wise sales reports for selected date ranges

### Inventory And Production

- Finished products and raw-material inventory
- Manual stock adjustments with movement history and backdated entries
- Categories, units, stock alerts, costing, batch details, and expiry information
- Recipe and bill-of-material management
- Production orders with ingredient consumption, overheads, wastage, and actual output
- Production completion adds finished stock and updates the product cost per unit

### Suppliers And Purchasing

- Supplier profiles, purchase history, payments, and chronological ledgers
- Raw-material purchases and stock receiving
- Short-term and long-term supplier advances with recovery tracking
- Purchase returns to suppliers with stock and accounting updates
- Supplier receipts for a selected date range

### Employees And Payroll

- Employee profiles, departments, salary types, and employment status
- Daily attendance, backdated attendance, half days, absences, and approved leave
- Monthly and daily-wage payroll calculation
- Short-term advances, long-term loans, fines, salary revisions, and recoveries
- Salary history, employee ledger, and printable payslips

### Accounting And Reports

- Double-entry journal entries and chart of accounts
- Cash book, general ledger, supplier ledger, and employee ledger
- Trial balance, profit and loss, balance sheet, payroll, stock valuation, and outstanding reports
- Revenue reporting connected to POS sales, delivered orders, and sales returns

### Desktop, Network, Backup, And Updates

- Native Windows desktop application built with Electron
- Local SQLite database stored outside the installed program files
- Access from other computers or mobile devices on the same LAN through the displayed network address
- In-app backup and restore plus a standalone backup utility
- Installer, portable `win-unpacked` build, and `latest.yml` auto-update manifest
- Role-based access for Admin, Production Manager, and Cashier users

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand |
| Backend | Node.js, Express, TypeScript, JWT authentication, Prisma ORM |
| Database | SQLite |
| Desktop | Electron, electron-builder, electron-updater |
| Reporting | Recharts, jsPDF, html2canvas, thermal print templates |

## Project Structure

```text
client/        React frontend
server/        Express API and business logic
prisma/        Database schema, migrations, and seed data
desktop/       Electron desktop application and updater configuration
backup-tool/   Standalone Windows backup utility
scripts/       Release and maintenance scripts
```

## Local Development

### Requirements

- Node.js 20 or newer
- npm
- Windows, macOS, or Linux for web development
- Windows 10/11 x64 for building the desktop installer

### Setup

```bash
npm install
npm run install:all
```

Create `server/.env` with local development values:

```dotenv
DATABASE_URL="file:../data/development.db"
JWT_SECRET="replace-with-a-long-random-access-secret"
JWT_REFRESH_SECRET="replace-with-a-long-random-refresh-secret"
PORT=5000
NODE_ENV=development
CLIENT_URL="http://localhost:3000"
```

Create `client/.env`:

```dotenv
VITE_API_URL=http://localhost:5000
```

Generate the Prisma client and seed a development database:

```bash
npm run db:generate --prefix server
npm run db:seed --prefix server
```

Start the API and frontend together:

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- API: `http://localhost:5000/api`

Environment files contain local credentials and configuration and are intentionally excluded from Git. Change seeded passwords before using the system in a real business.

## ERP AI Assistant

The application includes two authenticated ERP-only assistants:

- **Eastern ERP Help** appears at the bottom-right and answers workflow/help questions in Urdu, Roman Urdu, Hindi, or English.
- **ERP Agent** appears at the top-right. It can answer questions, query permission-filtered live summaries, and open authorized modules. It is read-only and never creates, edits, deletes, sells, or posts transactions.
- Live questions use permission-filtered, read-only database summaries for sales, stock, low-stock items, top products, raw materials, kitchen balances, orders, expenses, customer/supplier balances, production, and payroll. The assistant never receives password hashes, API keys, tokens, phone numbers, or unrestricted raw database access.

Groq is called only by the server, so its key is never exposed to the React client. Add these values to `server/.env` for development, or the desktop runtime environment for an installed build:

```dotenv
AI_PROVIDER="groq"
GROQ_API_KEY="your-private-api-key"
GROQ_CHAT_MODEL="openai/gpt-oss-20b"
```

Never commit the real key. Without a key, local ERP help and navigation remain available. AI conversations are recorded in the audit log; sensitive credentials are never included in assistant context.

## v3.0 Production, Kitchen, Packaging, POS and AI

- Production Orders, Recipes/BOM, Kitchen Stock, Transfers, Adjustments, and Kitchen Reports are available as sub-tabs under Production.
- Completing a Production Order records recipe consumption against Kitchen/WIP stock, warns on shortfalls with an explicit override, adds finished stock, and creates accounting/audit records.
- Packaging options are maintained inside each category's edit view in Settings.
- Clicking a POS product opens a right-panel detail view for quantity presets/custom quantity, packaging, live totals, Add to Cart, and single-item token generation.

## Production Build

Build the frontend and backend:

```bash
npm run build
```

Build the complete Windows release:

```bat
scripts\build-release.bat
```

The release process produces:

```text
desktop/release/Eastern Sweets Setup <version>.exe
desktop/release/win-unpacked/
desktop/release/latest.yml
```

See [README-DEPLOYMENT.md](README-DEPLOYMENT.md) for installation, LAN access, backup, data-location, and auto-update details.

## Security Notes

- Do not commit `.env` files, database files, backups, or production credentials.
- Replace development JWT secrets and seeded account passwords before deployment.
- Keep regular off-device backups of the application database.
- Restrict Admin access to trusted users.

## Current Deployment

The current packaged build uses the **Eastern Sweets** name, logo, receipt branding, and update endpoint. These are deployment-specific settings; the ERP workflow itself is suitable for other sweets and bakery businesses after configuration and branding changes.


## Security configuration (v1.6.6)

Change admin password on first login.

Copy `server/.env.example` to `server/.env` and supply independent random JWT secrets and unique initial user passwords. Generate each JWT secret with `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"`. Initial user passwords must have at least 16 characters and at most 72 UTF-8 bytes. The seed and initial desktop bootstrap hash them with bcryptjs (cost 12); existing users are not reset.

The packaged desktop generates installation-specific JWT secrets and initial passwords in `%APPDATA%/Eastern Sweets/runtime/server/.env` (under Electron's userData directory). The operator can read the initial admin password there on a new installation; it is never printed or bundled. Keep that file private. Updates retain it. Existing passwords remain unchanged; the switch away from shared JWT keys requires signing in again.

Local development reads `server/.env`. The optional legacy Docker setup uses `docker compose --env-file server/.env up -d`; its existing database password was moved without changing an existing volume's credentials. Normal desktop operation uses SQLite and requires no Docker installation.

Production CORS uses `http://localhost:5000` by default, matching the desktop server. A separately hosted web deployment must set CLIENT_URL to its exact trusted origin. Login and refresh share a limit of 10 requests per 15 minutes per IP; the API allows 200 requests per minute per IP. JWT lifetimes are 15 minutes and 30 days. Client environment variables must contain public configuration only.

Run `npm run build --prefix server` then `node scripts/security-smoke.cjs` for the isolated security regression suite. It creates temporary databases under `.tmp`, never the shop database.
