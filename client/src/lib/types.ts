// types.ts — shared API types.

export type Role = 'admin' | 'staff' | 'customer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  created_at?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Customer {
  id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  registered_at?: string;
  created_at?: string;
  user_email?: string | null;
}

export interface Device {
  id: string;
  customer_id: string;
  brand: string;
  model: string;
  serial_number: string | null;
  device_type: string;
  condition: string | null;
  accessories: string | null;
  notes: string | null;
  created_at?: string;
}

export type WorkOrderStatus =
  | 'received' | 'diagnosing' | 'waiting_approval' | 'repairing' | 'ready_for_pickup' | 'completed';

export interface WorkOrder {
  id: string;
  order_number: string;
  customer_id: string;
  device_id: string;
  problem: string;
  diagnosis: string | null;
  technician_id: string | null;
  priority: string;
  status: WorkOrderStatus;
  estimated_cost: number | null;
  final_cost: number | null;
  created_at: string;
  completed_date: string | null;
  customer_name?: string;
  brand?: string;
  model?: string;
  serial_number?: string;
}

export interface TimelineEvent {
  id: string;
  work_order_id: string;
  event: string;
  actor_id: string | null;
  description: string | null;
  created_at: string;
  actor_name?: string;
}

export interface InventoryItem {
  id: string;
  part_name: string;
  sku: string;
  category: string | null;
  quantity: number;
  min_stock: number;
  cost: number;
  selling_price: number;
  supplier: string | null;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  work_order_id: string;
  repair_description: string | null;
  labour: number;
  discount: number;
  tax: number;
  total: number;
  payment_status: PaymentStatus;
  created_at: string;
  customer_name?: string;
  order_number?: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  inventory_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  part_name?: string;
  sku?: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  method: string | null;
  paid_at: string;
}
