import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { HttpError } from '../middleware/errors';

export interface SupplierQuoteRow {
  id: number;
  project_id: number;
  supplier_id: number;
  supplier_name: string;
  selected: boolean;
  quoted_price: string | null;
  currency: string;
  quote_notes: string | null;
  selected_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

const optionalMoney = z.preprocess(
  (value) => (value === '' || value === undefined || value === null ? null : value),
  z.coerce.number().finite().nonnegative().nullable(),
);

export const supplierQuoteSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  selected: z.boolean(),
  quotedPrice: optionalMoney,
  currency: z.string().trim().toUpperCase().length(3).default('AUD'),
  quoteNotes: z.string().trim().max(5000).optional().nullable(),
});

export type SupplierQuoteInput = z.infer<typeof supplierQuoteSchema>;

const SELECT_QUOTE = `
  SELECT q.*, s.name AS supplier_name
  FROM project_supplier_quotes q
  JOIN suppliers s ON s.id = q.supplier_id`;

export function toSupplierQuoteDto(row: SupplierQuoteRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    selected: row.selected,
    quotedPrice: row.quoted_price === null ? null : Number(row.quoted_price),
    currency: row.currency,
    quoteNotes: row.quote_notes,
    selectedAt: row.selected_at,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  };
}

export async function listSupplierQuotes(projectId: number) {
  const rows = await query<SupplierQuoteRow>(
    `${SELECT_QUOTE} WHERE q.project_id = $1 ORDER BY s.name ASC`,
    [projectId],
  );
  return rows.map(toSupplierQuoteDto);
}

export async function upsertSupplierQuote(projectId: number, input: SupplierQuoteInput) {
  const supplier = await queryOne<{ id: number }>(
    'SELECT id FROM suppliers WHERE id = $1 AND is_active = TRUE',
    [input.supplierId],
  );
  if (!supplier) throw new HttpError(404, 'Active supplier not found');
  const row = await queryOne<SupplierQuoteRow>(
    `INSERT INTO project_supplier_quotes
       (project_id, supplier_id, selected, quoted_price, currency, quote_notes, selected_at, reviewed_at)
     VALUES ($1,$2,$3,$4::numeric,$5,$6::text,CASE WHEN $3 THEN NOW() ELSE NULL END,
       CASE WHEN $4::numeric IS NOT NULL OR NULLIF($6::text, '') IS NOT NULL THEN NOW() ELSE NULL END)
     ON CONFLICT (project_id, supplier_id) DO UPDATE SET
       selected = EXCLUDED.selected,
       quoted_price = EXCLUDED.quoted_price,
       currency = EXCLUDED.currency,
       quote_notes = EXCLUDED.quote_notes,
       selected_at = CASE
         WHEN EXCLUDED.selected AND NOT project_supplier_quotes.selected THEN NOW()
         WHEN EXCLUDED.selected THEN project_supplier_quotes.selected_at
         ELSE NULL
       END,
       reviewed_at = CASE
         WHEN EXCLUDED.quoted_price IS NOT NULL OR NULLIF(EXCLUDED.quote_notes, '') IS NOT NULL
           THEN COALESCE(project_supplier_quotes.reviewed_at, NOW())
         ELSE NULL
       END,
       updated_at = NOW()
     RETURNING *`,
    [
      projectId,
      input.supplierId,
      input.selected,
      input.quotedPrice,
      input.currency,
      input.quoteNotes ?? null,
    ],
  );
  const result = await queryOne<SupplierQuoteRow>(
    `${SELECT_QUOTE} WHERE q.id = $1`,
    [(row as { id: number }).id],
  );
  return toSupplierQuoteDto(result as SupplierQuoteRow);
}

export async function removeSupplierQuote(projectId: number, supplierId: number) {
  await queryOne(
    `DELETE FROM project_supplier_quotes WHERE project_id = $1 AND supplier_id = $2 RETURNING id`,
    [projectId, supplierId],
  );
}
