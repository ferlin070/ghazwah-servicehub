// seed.ts â€” inserts demo data: 1 admin, 2 staff, 5 customers, 8 devices,
// 10 work orders, 15 inventory items, 5 invoices.
// Idempotent: wipes all tables first (dev only â€” do NOT run in production).
import { getDb, saveDb, closeDb } from './db.ts';
import { query } from '../lib/query.ts';
import { hashPassword } from '../lib/crypto.ts';
import { randomId } from '../lib/id.ts';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function main() {
  const schema = readFileSync(join(MIGRATIONS_DIR, '001_init.sql'), 'utf8');
  const db = await getDb();
  db.exec(schema);

  // Wipe all (dev only, in dependency order)
  const tables = ['payments', 'invoice_items', 'invoices', 'inventory', 'repair_timeline', 'work_orders', 'devices', 'customers', 'users'];
  for (const t of tables) {
    await query.exec(`DELETE FROM ${t};`);
  }

  const password = await hashPassword('Password123');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Users + Customers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const users = [
    { email: 'admin@ghazwah.test', name: 'Admin Utama', role: 'admin', phone: '0123456789', address: 'HQ' },
    { email: 'staff1@ghazwah.test', name: 'Staff Satu', role: 'staff', phone: '0111111111', address: 'Branch A' },
    { email: 'staff2@ghazwah.test', name: 'Staff Dua', role: 'staff', phone: '0122222222', address: 'Branch B' },
    { email: 'cust1@ghazwah.test', name: 'Ahmad Bin Ali', role: 'customer', phone: '0131111111', address: 'Kg. Bharu, KL' },
    { email: 'cust2@ghazwah.test', name: 'Siti Aminah', role: 'customer', phone: '0132222222', address: 'PJ, Selangor' },
    { email: 'cust3@ghazwah.test', name: 'Raj Kumar', role: 'customer', phone: '0133333333', address: 'Ipoh, Perak' },
    { email: 'cust4@ghazwah.test', name: 'Lim Wei', role: 'customer', phone: '0134444444', address: 'JB, Johor' },
    { email: 'cust5@ghazwah.test', name: 'Fatimah Zahra', role: 'customer', phone: '0135555555', address: 'Kuantan, Pahang' },
  ];

  const userIds: Record<string, string> = {};
  const customerIds: Record<string, string> = {};

  for (const u of users) {
    const uid = randomId();
    userIds[u.email] = uid;
    await query.run(
      `INSERT INTO users (id, email, name, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`,
      uid, u.email, u.name, password, u.role, u.phone,
    );
    if (u.role === 'customer') {
      const cid = randomId();
      customerIds[u.email] = cid;
      await query.run(
        `INSERT INTO customers (id, user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
        cid, uid, u.name, u.phone, u.email, u.address,
      );
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Devices (8) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const deviceData = [
    { cust: 'cust1@ghazwah.test', brand: 'Dell', model: 'Latitude 7420', serial: 'DL7420-001', type: 'laptop', condition: 'Good', accessories: 'Charger', notes: 'Screen flickering' },
    { cust: 'cust1@ghazwah.test', brand: 'HP', model: 'Pavilion 15', serial: 'HP15-002', type: 'laptop', condition: 'Fair', accessories: 'Bag', notes: 'Slow boot' },
    { cust: 'cust2@ghazwah.test', brand: 'Lenovo', model: 'ThinkPad T14', serial: 'TP14-003', type: 'laptop', condition: 'Good', accessories: 'Charger, Dock', notes: 'Keyboard issue' },
    { cust: 'cust2@ghazwah.test', brand: 'Apple', model: 'MacBook Pro 14', serial: 'MBP14-004', type: 'laptop', condition: 'Excellent', accessories: 'Charger', notes: 'Battery drain' },
    { cust: 'cust3@ghazwah.test', brand: 'Asus', model: 'ROG Strix', serial: 'ASROG-005', type: 'laptop', condition: 'Fair', accessories: 'Charger', notes: 'Overheating' },
    { cust: 'cust3@ghazwah.test', brand: 'Acer', model: 'Swift 3', serial: 'ACSW3-006', type: 'laptop', condition: 'Good', accessories: 'Charger', notes: 'No display' },
    { cust: 'cust4@ghazwah.test', brand: 'MSI', model: 'Modern 14', serial: 'MSI14-007', type: 'laptop', condition: 'Poor', accessories: 'None', notes: 'Water damage' },
    { cust: 'cust5@ghazwah.test', brand: 'Microsoft', model: 'Surface Laptop 5', serial: 'MSL5-008', type: 'laptop', condition: 'Good', accessories: 'Charger', notes: 'USB port loose' },
  ];

  const deviceIds: Record<string, string> = {};
  for (const d of deviceData) {
    const did = randomId();
    const cid = customerIds[d.cust];
    deviceIds[d.serial] = did;
    await query.run(
      `INSERT INTO devices (id, customer_id, brand, model, serial_number, device_type, condition, accessories, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      did, cid, d.brand, d.model, d.serial, d.type, d.condition, d.accessories, d.notes,
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Work Orders (10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const woData = [
    { serial: 'DL7420-001', problem: 'Screen flickering when opening lid', diagnosis: 'Loose display cable', technician: 'staff1@ghazwah.test', priority: 'high', status: 'repairing', est: 250, final: 280 },
    { serial: 'HP15-002', problem: 'Slow boot, takes 5 minutes', diagnosis: 'Failing HDD', technician: 'staff2@ghazwah.test', priority: 'normal', status: 'waiting_approval', est: 200, final: null },
    { serial: 'TP14-003', problem: 'Some keys not working', diagnosis: 'Keyboard replacement needed', technician: 'staff1@ghazwah.test', priority: 'normal', status: 'repairing', est: 180, final: null },
    { serial: 'MBP14-004', problem: 'Battery drains fast', diagnosis: 'Battery health 60%', technician: 'staff2@ghazwah.test', priority: 'low', status: 'diagnosing', est: 400, final: null },
    { serial: 'ASROG-005', problem: 'Overheating and shutting down', diagnosis: null, technician: 'staff1@ghazwah.test', priority: 'urgent', status: 'received', est: null, final: null },
    { serial: 'ACSW3-006', problem: 'No display on screen', diagnosis: 'Screen panel failure', technician: 'staff2@ghazwah.test', priority: 'high', status: 'repairing', est: 300, final: null },
    { serial: 'MSI14-007', problem: 'Water spill on keyboard', diagnosis: 'Corrosion on motherboard', technician: 'staff1@ghazwah.test', priority: 'urgent', status: 'ready_for_pickup', est: 500, final: 550 },
    { serial: 'MSL5-008', problem: 'USB-C port loose connection', diagnosis: 'Port replacement', technician: 'staff2@ghazwah.test', priority: 'normal', status: 'completed', est: 150, final: 170 },
    { serial: 'DL7420-001', problem: 'Follow-up: screen cable replacement', diagnosis: 'Cable replaced successfully', technician: 'staff1@ghazwah.test', priority: 'normal', status: 'completed', est: 100, final: 100 },
    { serial: 'TP14-003', problem: 'Battery replacement request', diagnosis: null, technician: 'staff1@ghazwah.test', priority: 'low', status: 'received', est: 220, final: null },
  ];

  const woIds: string[] = [];
  for (let i = 0; i < woData.length; i++) {
    const w = woData[i]!;
    const wid = randomId();
    woIds.push(wid);
    const did = deviceIds[w.serial];
    const dev = await query.get('SELECT customer_id FROM devices WHERE id = ?', did);
    const cid = dev?.customer_id as string;
    const techId = userIds[w.technician];
    const orderNum = `WO-2026-${String(i + 1).padStart(4, '0')}`;

    await query.run(
      `INSERT INTO work_orders (id, order_number, customer_id, device_id, problem, diagnosis, technician_id, priority, status, estimated_cost, final_cost${w.status === 'completed' ? ', completed_date' : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${w.status === 'completed' ? ", datetime('now')" : ''})`,
      wid, orderNum, cid, did, w.problem, w.diagnosis, techId, w.priority, w.status, w.est, w.final,
    );

    // Add timeline events for each work order
    const events = getEventsForStatus(w.status);
    for (const ev of events) {
      const tlId = randomId();
      await query.run(
        `INSERT INTO repair_timeline (id, work_order_id, event, actor_id, description) VALUES (?, ?, ?, ?, ?)`,
        tlId, wid, ev.event, techId, ev.desc,
      );
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Inventory (15) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const parts = [
    { name: 'SSD 512GB Samsung', sku: 'SSD-512-001', cat: 'Storage', qty: 12, min: 5, cost: 45, price: 80, supplier: 'TechSupplier' },
    { name: 'SSD 1TB WD Blue', sku: 'SSD-1TB-002', cat: 'Storage', qty: 3, min: 5, cost: 70, price: 120, supplier: 'TechSupplier' },
    { name: 'RAM 8GB DDR4', sku: 'RAM-8G-001', cat: 'Memory', qty: 15, min: 8, cost: 25, price: 50, supplier: 'RAMWorld' },
    { name: 'RAM 16GB DDR4', sku: 'RAM-16G-002', cat: 'Memory', qty: 4, min: 6, cost: 45, price: 90, supplier: 'RAMWorld' },
    { name: 'Laptop Screen 14" FHD', sku: 'SCR-14-001', cat: 'Display', qty: 2, min: 3, cost: 60, price: 120, supplier: 'ScreenHub' },
    { name: 'Laptop Screen 15.6" FHD', sku: 'SCR-15-002', cat: 'Display', qty: 5, min: 3, cost: 65, price: 130, supplier: 'ScreenHub' },
    { name: 'Keyboard Dell Latitude', sku: 'KB-DL-001', cat: 'Input', qty: 3, min: 2, cost: 20, price: 45, supplier: 'PartsCo' },
    { name: 'Keyboard Lenovo T14', sku: 'KB-TP-002', cat: 'Input', qty: 1, min: 2, cost: 22, price: 50, supplier: 'PartsCo' },
    { name: 'Battery MacBook Pro 14', sku: 'BAT-MBP-001', cat: 'Battery', qty: 2, min: 3, cost: 80, price: 150, supplier: 'AppleParts' },
    { name: 'Battery Dell Latitude', sku: 'BAT-DL-002', cat: 'Battery', qty: 6, min: 4, cost: 35, price: 70, supplier: 'BatteryWorld' },
    { name: 'USB-C Port Module', sku: 'USB-C-001', cat: 'Ports', qty: 4, min: 5, cost: 15, price: 40, supplier: 'PartsCo' },
    { name: 'HDD 1TB Seagate', sku: 'HDD-1TB-001', cat: 'Storage', qty: 8, min: 4, cost: 30, price: 55, supplier: 'TechSupplier' },
    { name: 'Thermal Paste Arctic MX-4', sku: 'TP-MX4-001', cat: 'Cooling', qty: 20, min: 10, cost: 5, price: 15, supplier: 'CoolingCo' },
    { name: 'Cooling Fan 14" Universal', sku: 'FAN-14-001', cat: 'Cooling', qty: 3, min: 4, cost: 12, price: 30, supplier: 'CoolingCo' },
    { name: 'Power Adapter 65W USB-C', sku: 'PWR-65W-001', cat: 'Power', qty: 10, min: 5, cost: 18, price: 40, supplier: 'PowerCo' },
  ];

  const partIds: Record<string, string> = {};
  for (const p of parts) {
    const pid = randomId();
    partIds[p.sku] = pid;
    await query.run(
      `INSERT INTO inventory (id, part_name, sku, category, quantity, min_stock, cost, selling_price, supplier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pid, p.name, p.sku, p.cat, p.qty, p.min, p.cost, p.price, p.supplier,
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Invoices (5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const completedWOs = woData
    .map((w, i) => ({ ...w, id: woIds[i] }))
    .filter((w) => w.status === 'completed');

  for (let i = 0; i < Math.min(5, completedWOs.length); i++) {
    const w = completedWOs[i]!;
    const invId = randomId();
    const invNum = `INV-2026-${String(i + 1).padStart(4, '0')}`;
    const dev = await query.get('SELECT customer_id FROM devices WHERE id = ?', deviceIds[w.serial]);
    const cid = dev?.customer_id as string;
    const labour = 50 + i * 20;
    const partsTotal = 30 + i * 15;
    const discount = i === 0 ? 10 : 0;
    const tax = Math.round((partsTotal + labour - discount) * 0.06 * 100) / 100;
    const total = partsTotal + labour - discount + tax;

    // Pick a random part for invoice item
    const skuKeys = Object.keys(partIds);
    const partSku = skuKeys[i % skuKeys.length]!;
    const partId = partIds[partSku];
    const partInfo = parts.find((p) => p.sku === partSku)!;

    await query.transaction(async () => {
      await query.run(
        `INSERT INTO invoices (id, invoice_number, customer_id, work_order_id, repair_description, labour, discount, tax, total, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        invId, invNum, cid, w.id, `Repair: ${w.problem}`, labour, discount, tax, total, i < 2 ? 'paid' : i < 4 ? 'partial' : 'unpaid',
      );

      const itemId = randomId();
      await query.run(
        `INSERT INTO invoice_items (id, invoice_id, inventory_id, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        itemId, invId, partId, partInfo.name, 1, partInfo.price, partInfo.price,
      );

      // Add a payment if paid or partial
      if (i < 4) {
        const payId = randomId();
        const payAmount = i < 2 ? total : Math.round(total * 0.5 * 100) / 100;
        await query.run(
          `INSERT INTO payments (id, invoice_id, amount, method) VALUES (?, ?, ?, ?)`,
          payId, invId, payAmount, i % 2 === 0 ? 'cash' : 'transfer',
        );
      }
    });
  }

  saveDb();
  console.log('  [seed] âœ… inserted:');
  console.log('         1 admin, 2 staff, 5 customers (8 users)');
  console.log('         8 devices, 10 work orders (+timeline events)');
  console.log('         15 inventory items (some below min stock)');
  console.log('         5 invoices (with items + payments)');
  console.log('         demo password for all: Password123');
  closeDb();
}

function getEventsForStatus(status: string): { event: string; desc: string }[] {
  const all: { event: string; desc: string }[] = [
    { event: 'device_received', desc: 'Device received at service center' },
    { event: 'diagnosis_started', desc: 'Diagnosis started by technician' },
    { event: 'diagnosis_completed', desc: 'Diagnosis completed, awaiting customer approval' },
    { event: 'customer_approval', desc: 'Customer approved the repair' },
    { event: 'repair_started', desc: 'Repair work started' },
    { event: 'repair_completed', desc: 'Repair completed successfully' },
    { event: 'ready_for_pickup', desc: 'Device ready for pickup' },
    { event: 'completed', desc: 'Device picked up, work order completed' },
  ];
  const order = ['received', 'diagnosing', 'waiting_approval', 'repairing', 'ready_for_pickup', 'completed'];
  const idx = order.indexOf(status);
  if (idx < 0) return [all[0]!];
  return all.slice(0, idx + 1);
}

main();

