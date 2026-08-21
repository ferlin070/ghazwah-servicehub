# Ghazwah ServiceHub

SaaS web app untuk pengurusan syarikat servis komputer/laptop. Full-stack: Hono API + PostgreSQL + React frontend.

## Architecture

```
┌─────────────────────────────────────────────┐
│               Frontend                       │
│  React 18 + Vite + Tailwind CSS              │
│  Port 5173 (dev) → proxies /api to :3000     │
├─────────────────────────────────────────────┤
│                 API                          │
│  Hono (TypeScript) + zod validation          │
│  Port 3000                                   │
│  JWT auth (15min access + 7d refresh)        │
│  Role middleware (admin/staff/customer)       │
│  SSE real-time updates                       │
│  File upload (local storage)                 │
│  Audit logging                               │
├─────────────────────────────────────────────┤
│               Database                       │
│  PostgreSQL 16                               │
│  13 tables with foreign keys + indexes       │
│  Refresh tokens, audit logs, file uploads    │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Hono 4 + @hono/node-server |
| Database | PostgreSQL 16 (via node-postgres) |
| Auth | bcryptjs (password hash) + jose (JWT HS256) |
| Tokens | Access token (15min) + Refresh token (7d rotation) |
| Validation | zod + @hono/zod-validator |
| Frontend | React 18 + react-router-dom 6 |
| Build | Vite 5 + TypeScript 5.6 (strict) |
| Styling | Tailwind CSS 3 |
| Real-time | Server-Sent Events (SSE) |
| Upload | Local file storage (S3-ready) |
| Docker | Multi-stage build + docker-compose |

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or use Docker)
- npm

## Quick Start (Docker)

```bash
git clone <repo-url> ghazwah-servicehub
cd ghazwah-servicehub
docker compose up
# App runs at http://localhost:3000
# PostgreSQL at localhost:5432
```

## Manual Setup

### 1. Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 2. Configure environment

Create `.env` in project root:

```env
DATABASE_URL=postgresql://localhost:5432/ghazwah
JWT_SECRET=your-production-secret-here
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

**`JWT_SECRET` is required.** The server will not start without it.

### 3. Create PostgreSQL database

```bash
createdb ghazwah
```

### 4. Run migrations

```bash
npm run migrate
```

Creates 13 tables:
- `users`, `customers`, `devices`, `work_orders`, `repair_timeline`
- `inventory`, `invoices`, `invoice_items`, `payments`
- `refresh_tokens`, `audit_logs`, `file_uploads`, `email_verification_tokens`

### 5. Seed demo data

```bash
npm run seed
```

Inserts: 1 admin, 2 staff, 5 customers, 8 devices, 10 work orders, 15 inventory items, 2 invoices.

### 6. Start development servers

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
cd client && npm run dev
```

Open `http://localhost:5173`.

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ghazwah.test | Password123 |
| Staff | staff1@ghazwah.test | Password123 |
| Customer | cust1@ghazwah.test | Password123 |

## Security Features

- **JWT authentication** — Access tokens (15min) + Refresh tokens (7d with rotation)
- **Password hashing** — bcryptjs (10 rounds), never stored in plaintext
- **Role authorization** — `requireRole()` middleware on every protected route
- **Public registration** — Only `customer` role allowed; admin/staff created by admin only
- **JWT_SECRET mandatory** — Server refuses to start without it
- **Rate limiting** — Login: 5 attempts per 60s per IP → 429
- **Password complexity** — 8+ chars, uppercase, lowercase, number
- **Refresh token revocation** — Logout invalidates refresh token
- **Customer isolation** — Customers can only access their own data
- **Staff isolation** — Staff can only modify assigned work orders
- **Input validation** — zod schema on every POST/PUT
- **No password in API responses** — Verified by tests
- **FK error handling** — Friendly 409 messages on constraint violations
- **Audit logging** — All mutations logged to `audit_logs` table

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register (customer only) |
| POST | `/api/auth/admin-register` | admin | Create admin/staff accounts |
| POST | `/api/auth/login` | — | Login, returns access + refresh tokens |
| POST | `/api/auth/refresh` | — | Refresh access token |
| POST | `/api/auth/logout` | — | Revoke refresh token |
| GET | `/api/auth/me` | ✓ | Current user profile |

### Real-time (SSE)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/events` | ✓ | SSE stream for real-time updates |

### File Upload
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/uploads` | admin/staff | Upload file (image/PDF, max 10MB) |
| GET | `/api/uploads/:type` | ✓ | List files by entity type |
| GET | `/api/uploads/:type/:filename` | ✓ | Serve uploaded file |

### Customers (admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers?q=&page=&limit=` | List + search + pagination |
| GET | `/api/customers/:id` | Get one |
| POST | `/api/customers` | Create |
| PUT | `/api/customers/:id` | Update |
| DELETE | `/api/customers/:id` | Delete |

### Devices (admin/staff write, customer read own)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices?customerId=&q=&page=&limit=` | List (role-scoped) |
| GET | `/api/devices/:id` | Get one |
| POST | `/api/devices` | Create (admin/staff) |
| PUT | `/api/devices/:id` | Update (admin/staff) |
| DELETE | `/api/devices/:id` | Delete (admin only) |

### Work Orders (admin/staff write, customer read own)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/work-orders?status=&customerId=&page=&limit=` | List (role-scoped) |
| GET | `/api/work-orders/:id` | Get one |
| POST | `/api/work-orders` | Create (auto order number) |
| PUT | `/api/work-orders/:id` | Update (status flow enforced, SSE broadcast) |
| DELETE | `/api/work-orders/:id` | Delete (admin only) |

### Repair Timeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/work-orders/:woId/timeline` | List events |
| POST | `/api/work-orders/:woId/timeline` | Add event (admin/staff) |

### Inventory (admin full, staff qty only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory?lowStock=true&page=&limit=` | List + low-stock filter |
| GET | `/api/inventory/:id` | Get one |
| POST | `/api/inventory` | Create (admin) |
| PUT | `/api/inventory/:id` | Update (admin full, staff qty) |
| DELETE | `/api/inventory/:id` | Delete (admin) |

### Invoices (admin/staff write, customer read own)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices?customerId=&status=&page=&limit=` | List (role-scoped) |
| GET | `/api/invoices/:id` | Detail (items + payments) |
| POST | `/api/invoices` | Generate (auto invoice number) |
| PUT | `/api/invoices/:id` | Update |
| POST | `/api/invoices/:id/payments` | Record payment (auto-update status) |

### Search & Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=` | Global search (role-scoped) |
| GET | `/api/dashboard` | Role-based dashboard stats |

## Testing

Requires a running PostgreSQL instance. Tests use a separate `ghazwah_test` database.

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
| `auth.test.ts` | 12 | Register, login, /me, refresh tokens, token revocation, role authorization |
| `customers.test.ts` | 9 | CRUD, search, role auth, validation |
| `workOrders.test.ts` | 9 | Create, list, status update, timeline, device-customer mismatch |
| `invoices.test.ts` | 7 | Generate, list, detail, payment flow, validation |

Total: **37 backend tests + 5 client tests = 42 tests.**

## Folder Structure

```
ghazwah-servicehub/
├── package.json
├── tsconfig.json
├── Dockerfile                 # Multi-stage build
├── docker-compose.yml         # PostgreSQL + app
├── .env                       # (gitignored)
├── server/
│   ├── vitest.config.ts
│   ├── migrations/
│   │   └── 001_init.sql       # 13 tables + FK + indexes
│   ├── src/
│   │   ├── index.ts           # Hono app entry
│   │   ├── db/
│   │   │   ├── db.ts          # PostgreSQL connection pool
│   │   │   ├── migrate.ts     # Migration runner
│   │   │   └── seed.ts        # Demo data seeder
│   │   ├── routes/
│   │   │   ├── auth.ts        # register/login/refresh/logout/me
│   │   │   ├── customers.ts   # CRUD + search + pagination
│   │   │   ├── devices.ts     # CRUD + pagination
│   │   │   ├── workOrders.ts  # CRUD + status flow + SSE
│   │   │   ├── timeline.ts    # repair timeline events
│   │   │   ├── inventory.ts   # CRUD + low-stock + pagination
│   │   │   ├── invoices.ts    # generate + payments + pagination
│   │   │   ├── search.ts      # global search
│   │   │   ├── dashboard.ts   # role-based stats
│   │   │   └── uploads.ts     # file upload (local storage)
│   │   ├── middleware/
│   │   │   ├── auth.ts        # authenticate + requireRole
│   │   │   ├── audit.ts       # audit logging middleware
│   │   │   ├── errorHandler.ts # PG error codes → friendly messages
│   │   │   └── rateLimit.ts   # IP-based rate limiting
│   │   └── lib/
│   │       ├── crypto.ts      # bcrypt + JWT (access + refresh)
│   │       ├── id.ts          # randomUUID
│   │       ├── query.ts       # PostgreSQL query helpers (? → $N)
│   │       ├── pagination.ts  # parsePagination + makeMeta
│   │       └── sse.ts         # Server-Sent Events manager
│   └── tests/
│       ├── helpers.ts
│       ├── auth.test.ts
│       ├── customers.test.ts
│       ├── workOrders.test.ts
│       └── invoices.test.ts
├── client/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts         # fetch + refresh token flow
│   │   │   ├── auth.tsx       # AuthContext (access + refresh tokens)
│   │   │   └── types.ts
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   └── ui.tsx         # Modal, Pagination, StatusBadge, etc.
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Dashboard.tsx
│   │       ├── Customers.tsx  # Pagination UI
│   │       ├── Devices.tsx
│   │       ├── WorkOrders.tsx
│   │       ├── Inventory.tsx
│   │       ├── Invoices.tsx
│   │       └── Search.tsx
│   └── dist/                  # (build output)
└── data/                      # (gitignored, local uploads)
```

## What's Production-Ready

| Item | Status |
|------|--------|
| PostgreSQL database | ✅ |
| JWT with refresh tokens | ✅ |
| JWT_SECRET mandatory | ✅ |
| Role-based access control | ✅ |
| Public registration (customer only) | ✅ |
| Rate limiting (login) | ✅ |
| Password complexity | ✅ |
| FK error handling (friendly 409) | ✅ |
| Pagination (all list endpoints) | ✅ |
| Docker support | ✅ |
| Real-time updates (SSE) | ✅ |
| File upload | ✅ |
| Audit logging | ✅ |
| Client tests | ✅ |

## Remaining for Enterprise

1. Email verification flow
2. S3/MinIO for file storage (currently local)
3. HTTPS (nginx/Cloudflare)
4. Refresh token blacklisting via Redis (currently DB-based)
5. Webhook integrations
6. Multi-tenancy
7. Automated backups
