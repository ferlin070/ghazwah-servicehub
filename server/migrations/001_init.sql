-- 001_init.sql — Ghazwah ServiceHub schema (9 tables + FK + indexes)
-- Run via: npm run migrate

PRAGMA foreign_keys = ON;

-- ──────────────── users ────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,            -- bcrypt hash (NEVER plaintext)
  role        TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'customer')),
  phone       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── customers (linked 1:1 to a user with role=customer) ────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── devices ────────────────
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  brand         TEXT NOT NULL,
  model         TEXT NOT NULL,
  serial_number TEXT,
  device_type   TEXT NOT NULL,          -- laptop / desktop / phone / tablet / other
  condition     TEXT,                   -- physical condition note
  accessories   TEXT,                   -- comma-separated or free text
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── work_orders ────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id              TEXT PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,          -- e.g. WO-2026-0001
  customer_id     TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  problem         TEXT NOT NULL,
  diagnosis       TEXT,
  technician_id   TEXT REFERENCES users(id) ON DELETE SET NULL,  -- staff assigned
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status          TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'diagnosing', 'waiting_approval', 'repairing', 'ready_for_pickup', 'completed')
  ),
  estimated_cost  REAL,
  final_cost       REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_date  TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── repair_timeline ────────────────
CREATE TABLE IF NOT EXISTS repair_timeline (
  id            TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,  -- device_received | diagnosis_started | diagnosis_completed | customer_approval | repair_started | repair_completed | ready_for_pickup | completed
  actor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── inventory ────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id            TEXT PRIMARY KEY,
  part_name     TEXT NOT NULL,
  sku           TEXT NOT NULL UNIQUE,
  category      TEXT,
  quantity      INTEGER NOT NULL DEFAULT 0,
  min_stock     INTEGER NOT NULL DEFAULT 0,
  cost          REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  supplier      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── invoices ────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,   -- e.g. INV-2026-0001
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  repair_description TEXT,
  labour        REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  tax           REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── invoice_items ────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  inventory_id TEXT REFERENCES inventory(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_price   REAL NOT NULL DEFAULT 0,
  line_total   REAL NOT NULL DEFAULT 0
);

-- ──────────────── payments ────────────────
CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       REAL NOT NULL,
  method       TEXT,              -- cash | card | transfer | other
  paid_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── indexes for search/perf ────────────────
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_workorders_customer ON work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_workorders_technician ON work_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_workorders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_timeline_wo ON repair_timeline(work_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoiceitems_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
