import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';

export interface SupplierRow {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const optionalText = z.string().trim().max(500).optional().nullable();

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(200),
  contactName: optionalText,
  email: z.union([z.string().trim().email(), z.literal('')]).optional().nullable(),
  phone: optionalText,
  notes: z.string().trim().max(5000).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

export function toSupplierDto(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSuppliers(includeInactive = false) {
  const rows = await query<SupplierRow>(
    `SELECT * FROM suppliers ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY name ASC`,
  );
  return rows.map(toSupplierDto);
}

export async function getSupplier(id: number) {
  const row = await queryOne<SupplierRow>('SELECT * FROM suppliers WHERE id = $1', [id]);
  if (!row) throw new HttpError(404, 'Supplier not found');
  return toSupplierDto(row);
}

export async function createSupplier(input: SupplierInput) {
  try {
    const row = await queryOne<SupplierRow>(
      `INSERT INTO suppliers (name, contact_name, email, phone, notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        input.name,
        input.contactName ?? null,
        input.email || null,
        input.phone ?? null,
        input.notes ?? null,
        input.isActive,
      ],
    );
    return toSupplierDto(row as SupplierRow);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new HttpError(409, `Supplier ${input.name} already exists`);
    }
    throw error;
  }
}

export async function updateSupplier(id: number, input: SupplierInput) {
  await getSupplier(id);
  try {
    const row = await queryOne<SupplierRow>(
      `UPDATE suppliers SET name=$2, contact_name=$3, email=$4, phone=$5, notes=$6,
       is_active=$7, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [
        id,
        input.name,
        input.contactName ?? null,
        input.email || null,
        input.phone ?? null,
        input.notes ?? null,
        input.isActive,
      ],
    );
    return toSupplierDto(row as SupplierRow);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new HttpError(409, `Supplier ${input.name} already exists`);
    }
    throw error;
  }
}
