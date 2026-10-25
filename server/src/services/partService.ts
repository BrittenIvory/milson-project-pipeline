import { HttpError } from '../middleware/errors';
import { query } from '../db/pool';
import { listProjects, PART_NUMBER_KEY } from './projectService';

/**
 * Parts are not their own table: a part is identified by the internal part
 * number stored on each project (falling back to the customer part number
 * when no internal number is set).
 */
const HAS_PART = `(NULLIF(p.internal_part_number, '') IS NOT NULL OR NULLIF(p.customer_part_number, '') IS NOT NULL)`;

interface PartSummaryRow {
  part_number: string;
  internal_part_number: string | null;
  customer_part_numbers: string[] | null;
  customers: string[] | null;
  project_count: string;
  image_project_id: number | null;
}

const PART_SUMMARY_SELECT = `
  SELECT
    ${PART_NUMBER_KEY} AS part_number,
    MAX(p.internal_part_number) AS internal_part_number,
    ARRAY_AGG(DISTINCT p.customer_part_number) FILTER (
      WHERE p.customer_part_number IS NOT NULL AND p.customer_part_number <> ''
    ) AS customer_part_numbers,
    ARRAY_AGG(DISTINCT c.company_name) AS customers,
    COUNT(*)::text AS project_count,
    MAX(CASE WHEN p.part_image_storage_key IS NOT NULL THEN p.id END) AS image_project_id
  FROM projects p
  JOIN customers c ON c.id = p.customer_id`;

function toPartDto(row: PartSummaryRow) {
  return {
    partNumber: row.part_number,
    internalPartNumber: row.internal_part_number,
    customerPartNumbers: row.customer_part_numbers ?? [],
    customers: row.customers ?? [],
    projectCount: Number(row.project_count),
    imageProjectId: row.image_project_id,
  };
}

/** Every distinct part across non-archived projects. */
export async function listParts() {
  const rows = await query<PartSummaryRow>(
    `${PART_SUMMARY_SELECT}
     WHERE p.is_archived = FALSE AND ${HAS_PART}
     GROUP BY ${PART_NUMBER_KEY}
     ORDER BY ${PART_NUMBER_KEY}`,
  );
  return rows.map(toPartDto);
}

/** One part's details plus every non-archived project that carries it. */
export async function getPart(partNumber: string) {
  const rows = await query<PartSummaryRow>(
    `${PART_SUMMARY_SELECT}
     WHERE p.is_archived = FALSE AND ${PART_NUMBER_KEY} = $1
     GROUP BY ${PART_NUMBER_KEY}`,
    [partNumber],
  );
  const part = rows[0];
  if (!part) throw new HttpError(404, 'Part not found');
  return {
    ...toPartDto(part),
    projects: await listProjects({ partNumber }),
  };
}
