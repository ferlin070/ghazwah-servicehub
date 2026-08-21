# Ghazwah ServiceHub

SaaS web app untuk pengurusan syarikat servis komputer/laptop. Full-stack: Hono API + SQLite (sql.js WASM) + React frontend.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend                     │
│  React 18 + Vite + Tailwind CSS              │
│  Port 5173 (dev) → proxies /api to :3000     │
├─────────────────────────────────────────────┤
│                   API                         │
│  Hono (TypeScript) + zod validation          │
│  Port 3000                                    │
│  JWT auth (jose) + bcrypt password hash       │
│  Role middleware (admin/staff/customer)       │
├─────────────────────────────────────────────┤
│                 Database                       │
│  SQLite via sql.js (WASM, no native build)    │
│  9 tables with foreign keys                   │
│  File persistence: server/data/app.db         │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Hono 4 + @hono/node-server |
| Database | sql.js (SQLite compiled to WASM) |
| Auth | bcryptjs (password hash) + jose (JWT) |
| Validation | zod + @hono/zod-validator |
| Frontend | React 18 + react-router-dom 6 |
| Build | Vite 5 + TypeScript 5.6 (strict) |
| Styling | Tailwind CSS 3 |

## Installation

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
# Clone
git clone <repo-url> ghazwah-servicehub
cd ghazwah-servicehub

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

## Environment Variables

Create `.env` in the project root (optional — defaults work for development):

```env
PORT=3000                        # API port
CORS_ORIGIN=http://localhost:5173 # Frontend URL
JWT_SECRET=your-secret-here      # JWT signing secret (CHANGE IN PRODUCTION)
DB_PATH=server/data/app.db       # SQLite file path (optional)
```

**Never commit `.env` to git.** The `.gitignore` already excludes it.

## Database Setup

### Migration

Run the SQL migration to create all 9 tables + indexes:

```bash
npm run migrate
```

This creates `server/data/app.db` with:
- `users` — admin/staff/customer accounts (password hashed)
- `customers` — customer profiles (linked to users)
- `devices` — customer devices (brand, model, serial, type)
- `work_orders` — repair jobs (status flow: received → completed)
- `repair_timeline` — per-work-order event log
- `inventory` — spare parts (with min-stock warning)
- `invoices` — billing (labour, discount, tax, total)
- `invoice_items` — line items per invoice
- `payments` — payment records (auto-updates invoice status)

All tables have proper foreign keys. Migration is idempotent (`CREATE TABLE IF NOT EXISTS`).

### Seed

Insert demo data (1 admin, 2 staff, 5 customers, 8 devices, 10 work orders, 15 inventory items, 5 invoices):

```bash
npm run seed
```

**Warning:** Seed wipes all existing data first (dev only).

## Running the Development Server

```bash
# Terminal 1: Backend API (port 3000)
npm run dev

# Terminal 2: Frontend (port 5173)
cd client
npm run dev
```

Open `http://localhost:5173` in your browser. The Vite dev server proxies `/api` requests to the backend automatically.

## Production Build

```bash
# Build frontend
cd client
npm run build
# Output: client/dist/ (static files)

# Build backend
cd ..
npm run build
# Output: server/dist/ (compiled JS)

# Start production server
npm start
# Serves API on port 3000
```

For production, serve `client/dist/` with nginx or a static host, pointing `/api` to the backend.

## Testing

```bash
# Run all backend tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck
```

### Test Coverage

| Test File | Tests | What |
|-----------|-------|------|
| `auth.test.ts` | 10 | Register, login, /me, duplicate email, wrong password, no-hash-leak, role authorization (admin 200, customer 403, unauth 401) |
| `customers.test.ts` | 9 | CRUD, search, role auth (staff 403, customer 403), invalid email validation |
| `workOrders.test.ts` | 9 | Create, list (role-scoped), status update, status revert prevention, timeline, device-customer mismatch, non-existent customer |
| `invoices.test.ts` | 7 | Generate (with items + total calc), list, detail (items + payments), partial payment → paid, invalid customer |

Total: **35 tests, all passing.**

## Demo Credentials

After running `npm run seed`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ghazwah.test | Password123 |
| Staff | staff1@ghazwah.test | Password123 |
| Staff | staff2@ghazwah.test | Password123 |
| Customer | cust1@ghazwah.test | Password123 |
| Customer | cust2@ghazwah.test | Password123 |
| Customer | cust3@ghazwah.test | Password123 |
| Customer | cust4@ghazwah.test | Password123 |
| Customer | cust5@ghazwah.test | Password123 |

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register (admin/staff/customer) |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | ✓ | Current user profile |

### Customers (admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers?q=` | List + search |
| GET | `/api/customers/:id` | Get one |
| POST | `/api/customers` | Create |
| PUT | `/api/customers/:id` | Update |
| DELETE | `/api/customers/:id` | Delete |

### Devices (admin/staff write, customer read own)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices?customerId=&q=` | List (customer: own only) |
| GET | `/api/devices/:id` | Get one |
| POST | `/api/devices` | Create (admin/staff) |
| PUT | `/api/devices/:id` | Update (admin/staff) |
| DELETE | `/api/devices/:id` | Delete (admin only) |

### Work Orders (admin/staff write, customer read own)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/work-orders?status=&customerId=` | List (role-scoped) |
| GET | `/api/work-orders/:id` | Get one |
| POST | `/api/work-orders` | Create (auto order number + first timeline event) |
| PUT | `/api/work-orders/:id` | Update (status flow enforced, auto timeline) |
| DELETE | `/api/work-orders/:id` | Delete (admin only) |

### Repair Timeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/work-orders/:woId/timeline` | List events |
| POST | `/api/work-orders/:woId/timeline` | Add event (admin/staff) |

### Inventory (admin full, staff qty only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory?lowStock=true` | List + low-stock filter |
| GET | `/api/inventory/:id` | Get one |
| POST | `/api/inventory` | Create (admin) |
| PUT | `/api/inventory/:id` | Update (admin full, staff qty) |
| DELETE | `/api/inventory/:id` | Delete (admin) |

### Invoices (admin/staff write, customer read own)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices?customerId=&status=` | List (role-scoped) |
| GET | `/api/invoices/:id` | Detail (items + payments) |
| POST | `/api/invoices` | Generate (auto invoice number, total calc) |
| PUT | `/api/invoices/:id` | Update |
| POST | `/api/invoices/:id/payments` | Record payment (auto-update status) |

### Search & Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=` | Global search (role-scoped) |
| GET | `/api/dashboard` | Role-based dashboard stats |

## Security

- **Password hashing:** bcryptjs (10 rounds) — passwords never stored in plaintext
- **JWT auth:** HS256, 7-day expiry, Bearer token
- **Role authorization:** `requireRole()` middleware on every protected route
- **Customer isolation:** customers can only access their own data (work orders, invoices, devices)
- **Staff isolation:** staff can only modify work orders assigned to them
- **Input validation:** zod schema on every POST/PUT
- **No password/hash in API responses:** verified by test
- **Foreign keys enforced:** `PRAGMA foreign_keys = ON`
- **CORS:** configurable origin (default localhost:5173)

## Final Folder Structure

```
ghazwah-servicehub/
├── package.json                 # Backend deps + scripts
├── tsconfig.json                # Backend TS config (strict)
├── .gitignore
├── .env                         # (gitignored, create your own)
│
├── server/
│   ├── vitest.config.ts
│   ├── migrations/
│   │   └── 001_init.sql         # 9 tables + FK + indexes
│   ├── src/
│   │   ├── index.ts             # Hono app entry (mounts all routes)
│   │   ├── db/
│   │   │   ├── db.ts            # sql.js connection + file persistence
│   │   │   ├── migrate.ts       # Migration runner
│   │   │   └── seed.ts          # Demo data seeder
│   │   ├── routes/
│   │   │   ├── auth.ts          # register/login/me/admin-only
│   │   │   ├── customers.ts     # CRUD + search (admin)
│   │   │   ├── devices.ts       # CRUD (admin/staff, customer read own)
│   │   │   ├── workOrders.ts    # CRUD + status flow (admin/staff)
│   │   │   ├── timeline.ts      # repair timeline events
│   │   │   ├── inventory.ts     # CRUD + low-stock (admin full, staff qty)
│   │   │   ├── invoices.ts      # generate + payments (admin/staff)
│   │   │   ├── search.ts        # global search (role-scoped)
│   │   │   └── dashboard.ts     # role-based dashboard stats
│   │   ├── middleware/
│   │   │   └── auth.ts          # authenticate + requireRole
│   │   └── lib/
│   │       ├── crypto.ts        # bcrypt hash + JWT sign/verify
│   │       ├── id.ts            # randomUUID
│   │       └── query.ts         # sql.js wrapper (get/all/run/exec/transaction)
│   └── tests/
│       ├── helpers.ts           # shared test app builder
│       ├── auth.test.ts         # 10 tests
│       ├── customers.test.ts    # 9 tests
│       ├── workOrders.test.ts   # 9 tests
│       └── invoices.test.ts     # 7 tests
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts           # Vite + proxy /api → :3000
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── dist/                    # (build output, gitignored)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx              # Router + AuthProvider + ToastProvider
│       ├── index.css            # Tailwind + component classes
│       ├── lib/
│       │   ├── api.ts           # fetch wrapper + JWT + error handling
│       │   ├── types.ts         # all API types
│       │   ├── auth.tsx         # AuthContext (login/register/logout)
│       │   └── toast.tsx        # ToastContext (success/error)
│       ├── components/
│       │   ├── Layout.tsx       # Sidebar + Topbar (role-based nav)
│       │   └── ui.tsx           # Modal, ConfirmDialog, Loading, EmptyState, StatusBadge
│       └── pages/
│           ├── Login.tsx        # Login + Register tabs
│           ├── Dashboard.tsx    # 3-role dashboard views
│           ├── Customers.tsx    # Table + CRUD modal + search
│           ├── Devices.tsx      # Table + CRUD modal
│           ├── WorkOrders.tsx   # Table + detail + status + timeline
│           ├── Inventory.tsx    # Table + low-stock + CRUD
│           ├── Invoices.tsx     # List + detail + payment
│           └── Search.tsx       # Global search
│
└── data/                        # (gitignored)
    └── app.db                   # SQLite database file
```

## What Is NOT Production-Ready (Honest Assessment)

1. **JWT secret** — defaults to `dev-secret-change-me-in-production`. Must set `JWT_SECRET` env var.
2. **CORS** — defaults to `localhost:5173`. Must set `CORS_ORIGIN` for production domain.
3. **sql.js performance** — WASM SQLite is fine for dev/small apps. For production scale, use Postgres or native SQLite (better-sqlite3 on Linux).
4. ~~Rate limiting~~ — **DONE.** Login endpoint limited to 5 attempts per 60s per IP (returns 429 with `Retry-After` header). Skipped in test env.
5. ~~Refresh tokens~~ — Still only access tokens (7-day expiry). No refresh token or revocation mechanism.
6. ~~Email verification~~ — Still no email verification step.
7. ~~Client-side tests~~ — **DONE.** 5 React Testing Library tests (Login form render, demo credentials, register toggle, API call on submit, error toast on failed login).
8. ~~Pagination~~ — **DONE.** Customers list supports `?page=2&limit=20` with pagination metadata (total, totalPages). Other list endpoints follow the same pattern.
9. **No file upload** — invoice PDFs, device photos not supported.
10. **No WebSocket** — repair timeline updates require page refresh (brief says "real-time"; this is near-real-time via polling, not true WebSocket push).
11. **No HTTPS** — dev server is HTTP only. Production must use HTTPS (nginx/Cloudflare).
12. ~~Password complexity~~ — **DONE.** Password must be 8+ chars with uppercase, lowercase, and number (zod regex validation on register).
13. **No audit log** — timeline events exist for work orders, but no general audit log for admin actions (user create/delete, etc).
14. ~~Delete error friendly~~ — **DONE.** Global error handler catches FK violations (SQLite error 19) and returns 409 with friendly message "Cannot delete: this record is referenced by other records."
15. ~~No Docker~~ — **DONE.** Multi-stage Dockerfile + docker-compose.yml. `docker compose up` builds, runs migration, and serves on :3000 with persistent volume.
