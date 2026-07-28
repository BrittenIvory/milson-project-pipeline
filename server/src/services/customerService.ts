import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';
import { CUSTOMER_STATUSES } from '../types';

export interface CustomerRow {
  id: number;
  company_name: string;
  customer_number: string;
  primary_contact: string | null;
  secondary_contact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  country: string | null;
  state: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const optionalText = z.string().trim().max(500).optional().nullable();

export const customerSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  customerNumber: z.string().trim().min(1, 'Customer number is required').max(50),
  primaryContact: optionalText,
  secondaryContact: optionalText,
  email: z.union([z.string().trim().email(), z.literal('')]).optional().nullable(),
  phone: optionalText,
  website: optionalText,
  billingAddress: z.string().trim().max(1000).optional().nullable(),
  shippingAddress: z.string().trim().max(1000).optional().nullable(),
  country: optionalText,
  state: optionalText,
  notes: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(CUSTOMER_STATUSES).default('active'),
});

export type CustomerInput = z.infer<typeof customerSchema>;

/** Maps a database row to the camelCase API shape. */
export function toCustomerDto(row: CustomerRow) {
  return {
    id: row.id,
    companyName: row.company_name,
    customerNumber: row.customer_number,
    primaryContact: row.primary_contact,
    secondaryContact: row.secondary_contact,
    email: row.email,
    phone: row.phone,
    website: row.website,
    billingAddress: row.billing_address,
    shippingAddress: row.shipping_address,
    country: row.country,
    state: row.state,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists customers with optional free-text search and status filter. */
export async function listCustomers(options: { search?: string; status?: string }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (options.search) {
    params.push(`%${options.search.toLowerCase()}%`);
    where.push(
      `(LOWER(company_name) LIKE $${params.length} OR LOWER(customer_number) LIKE $${params.length}
        OR LOWER(COALESCE(primary_contact,'')) LIKE $${params.length}
        OR LOWER(COALESCE(email,'')) LIKE $${params.length})`,
    );
  }
  if (options.status && options.status !== 'all') {
    params.push(options.status);
    where.push(`status = $${params.length}`);
  }
  const rows = await query<CustomerRow>(
    `SELECT * FROM customers ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY company_name ASC`,
    params,
  );
  return rows.map(toCustomerDto);
}

export async function getCustomer(id: number) {
  const row = await queryOne<CustomerRow>('SELECT * FROM customers WHERE id = $1', [id]);
  if (!row) throw new HttpError(404, 'Customer not found');
  return toCustomerDto(row);
}

async function assertNumberAvailable(customerNumber: string, excludeId?: number) {
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM customers WHERE LOWER(customer_number) = LOWER($1)',
    [customerNumber],
  );
  if (existing && existing.id !== excludeId) {
    throw new HttpError(409, `Customer number ${customerNumber} is already in use`);
  }
}

export async function createCustomer(input: CustomerInput) {
  await assertNumberAvailable(input.customerNumber);
  const row = await queryOne<CustomerRow>(
    `INSERT INTO customers (company_name, customer_number, primary_contact, secondary_contact,
       email, phone, website, billing_address, shipping_address, country, state, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      input.companyName, input.customerNumber, input.primaryContact ?? null,
      input.secondaryContact ?? null, input.email || null, input.phone ?? null,
      input.website ?? null, input.billingAddress ?? null, input.shippingAddress ?? null,
      input.country ?? null, input.state ?? null, input.notes ?? null, input.status,
    ],
  );
  return toCustomerDto(row as CustomerRow);
}

export async function updateCustomer(id: number, input: CustomerInput) {
  await getCustomer(id);
  await assertNumberAvailable(input.customerNumber, id);
  const row = await queryOne<CustomerRow>(
    `UPDATE customers SET company_name=$2, customer_number=$3, primary_contact=$4,
       secondary_contact=$5, email=$6, phone=$7, website=$8, billing_address=$9,
       shipping_address=$10, country=$11, state=$12, notes=$13, status=$14, updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [
      id, input.companyName, input.customerNumber, input.primaryContact ?? null,
      input.secondaryContact ?? null, input.email || null, input.phone ?? null,
      input.website ?? null, input.billingAddress ?? null, input.shippingAddress ?? null,
      input.country ?? null, input.state ?? null, input.notes ?? null, input.status,
    ],
  );
  return toCustomerDto(row as CustomerRow);
}

/** Archives a customer (soft delete) so historical projects stay intact. */
export async function archiveCustomer(id: number) {
  await getCustomer(id);
  const row = await queryOne<CustomerRow>(
    `UPDATE customers SET status='archived', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id],
  );
  return toCustomerDto(row as CustomerRow);
}

/** Restores an archived customer to active. */
export async function restoreCustomer(id: number) {
  await getCustomer(id);
  const row = await queryOne<CustomerRow>(
    `UPDATE customers SET status='active', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id],
  );
  return toCustomerDto(row as CustomerRow);
}
