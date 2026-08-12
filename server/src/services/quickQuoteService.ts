import { queryOne } from '../db/pool';
import { storage } from './storage';

const MACHINING_PERCENTAGE = 18.46;
const PAINTING_PERCENTAGE = 9.23;

const PROCESS_PRICING: Record<string, Record<string, number>> = {
  'Sand Casting': {
    Steel: 5.4,
    'Grey Iron': 2.16,
    'Ductile Iron': 2.6,
    'Hi-Chrome': 3.9,
    ADI: 3.03,
    Aluminum: 0,
  },
  'Shell Casting': {
    'Grey Iron': 2.33,
    'Ductile Iron': 2.82,
    'Hi-Chrome': 4.25,
    ADI: 3.3,
  },
  'Investment Cast': {
    'Hi-Chrome': 5.29,
    Steel: 7.39,
  },
  'Die Cast': {
    Aluminum: 0,
  },
};

export interface QuoteProject {
  id: number;
  projectNumber: string;
  projectName: string;
  customerName: string | null;
  customerPartNumber: string | null;
  annualUsage: number | null;
  material: string | null;
  estimatedWeight: number | null;
  castingProcess: string | null;
  machiningRequired: boolean;
  paintingRequired: boolean;
}

export interface QuickQuote {
  material: string;
  castingProcess: string;
  weight: number;
  annualUsage: number | null;
  hasMachining: boolean;
  hasPainting: boolean;
  pricePerPound: number;
  baseCost: number;
  machiningCost: number;
  paintingCost: number;
  unitPrice: number;
  totalAnnual: number | null;
  contactRequired: boolean;
}

interface DocumentRow {
  id: number;
  project_id: number;
  file_name: string;
  storage_key: string;
  storage_driver: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: string;
  document_kind: string;
  uploaded_by: number | null;
  created_at: string;
  uploaded_by_name?: string | null;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

function canonicalMaterial(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/[-_]/g, ' ');
  const aliases: Record<string, string> = {
    steel: 'Steel',
    'grey iron': 'Grey Iron',
    'gray iron': 'Grey Iron',
    ductile: 'Ductile Iron',
    'ductile iron': 'Ductile Iron',
    'hi chrome': 'Hi-Chrome',
    'hi-chrome': 'Hi-Chrome',
    'high chrome': 'Hi-Chrome',
    adi: 'ADI',
    aluminum: 'Aluminum',
    aluminium: 'Aluminum',
  };
  return aliases[normalized] ?? null;
}

function canonicalProcess(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('sand')) return 'Sand Casting';
  if (normalized.includes('shell')) return 'Shell Casting';
  if (normalized.includes('investment')) return 'Investment Cast';
  if (normalized.includes('die')) return 'Die Cast';
  return null;
}

export function calculateQuickQuote(project: QuoteProject): QuickQuote | null {
  if (!project.material || project.estimatedWeight === null || project.estimatedWeight <= 0) {
    return null;
  }
  if (!project.castingProcess) return null;

  const material = canonicalMaterial(project.material);
  const castingProcess = canonicalProcess(project.castingProcess);
  if (!material || !castingProcess) return null;

  const pricePerPound = PROCESS_PRICING[castingProcess][material];
  if (pricePerPound === undefined || pricePerPound === 0) {
    return {
      material,
      castingProcess,
      weight: project.estimatedWeight,
      annualUsage: project.annualUsage,
      hasMachining: project.machiningRequired,
      hasPainting: project.paintingRequired,
      pricePerPound: 0,
      baseCost: 0,
      machiningCost: 0,
      paintingCost: 0,
      unitPrice: 0,
      totalAnnual: null,
      contactRequired: true,
    };
  }

  const baseCost = roundCurrency(project.estimatedWeight * pricePerPound);
  const machiningCost = project.machiningRequired
    ? roundCurrency(baseCost * MACHINING_PERCENTAGE / 100)
    : 0;
  const paintingCost = project.paintingRequired
    ? roundCurrency(baseCost * PAINTING_PERCENTAGE / 100)
    : 0;
  const unitPrice = roundCurrency(baseCost + machiningCost + paintingCost);

  return {
    material,
    castingProcess,
    weight: project.estimatedWeight,
    annualUsage: project.annualUsage,
    hasMachining: project.machiningRequired,
    hasPainting: project.paintingRequired,
    pricePerPound,
    baseCost,
    machiningCost,
    paintingCost,
    unitPrice,
    totalAnnual: project.annualUsage === null ? null : roundCurrency(unitPrice * project.annualUsage),
    contactRequired: false,
  };
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function line(label: string, value: string, y: number): string {
  return `BT /F1 10 Tf 50 ${y} Td (${escapePdfText(label)}) Tj 250 0 Td (${escapePdfText(value)}) Tj ET`;
}

export function createQuotePdf(project: QuoteProject, quote: QuickQuote): Buffer {
  const title = `${project.projectNumber} - Estimate Quote`;
  const lines = [
    'BT /F1 20 Tf 50 760 Td (Milson Foundry) Tj ET',
    'BT /F1 12 Tf 50 735 Td (Estimate Quote) Tj ET',
    line('Project', `${project.projectNumber} - ${project.projectName}`, 695),
    line('Customer', project.customerName ?? 'Not provided', 675),
    line('Customer Part', project.customerPartNumber ?? 'Not provided', 655),
    line('Material', quote.material, 615),
    line('Casting Process', quote.castingProcess, 595),
    line('Part Weight', `${quote.weight.toFixed(2)} lb`, 575),
    line('Annual Usage', quote.annualUsage === null ? 'Not provided' : `${quote.annualUsage} units`, 555),
    line('Machining', quote.hasMachining ? 'Yes' : 'No', 535),
    line('Painting', quote.hasPainting ? 'Yes' : 'No', 515),
  ];

  if (quote.contactRequired) {
    lines.push(
      'BT /F1 12 Tf 50 465 Td (Custom Quote Required) Tj ET',
      'BT /F1 10 Tf 50 440 Td (This material/process combination requires review by the sales team.) Tj ET',
    );
  } else {
    lines.push(
      'BT /F1 12 Tf 50 465 Td (Price Breakdown) Tj ET',
      line('Base Casting Cost', `$${quote.baseCost.toFixed(2)}`, 440),
      line('Machining', `$${quote.machiningCost.toFixed(2)}`, 420),
      line('Painting', `$${quote.paintingCost.toFixed(2)}`, 400),
      line('Estimated Unit Price', `$${quote.unitPrice.toFixed(2)}`, 365),
      line(
        'Estimated Annual Total',
        quote.totalAnnual === null ? 'Not provided' : `$${quote.totalAnnual.toFixed(2)}`,
        345,
      ),
    );
  }

  lines.push(
    'BT /F1 9 Tf 50 285 Td (Estimate only - final pricing is subject to sales and engineering review.) Tj ET',
    'BT /F1 9 Tf 50 270 Td (Pricing follows the Milson Foundry quick quote calculation rules.) Tj ET',
  );

  const content = `${lines.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Title (${escapePdfText(title)}) >> >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

export function toDocumentDto(row: DocumentRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedById: row.uploaded_by,
    uploadedByName: row.uploaded_by_name ?? null,
    createdAt: row.created_at,
  };
}

export async function generateQuickQuoteDocument(project: QuoteProject, uploadedBy: number) {
  const quote = calculateQuickQuote(project);
  if (!quote) return null;

  const fileName = `${project.projectNumber}-estimate-quote.pdf`;
  const data = createQuotePdf(project, quote);
  const key = await storage.save(project.id, fileName, data);
  const existing = await queryOne<DocumentRow>(
    `SELECT * FROM documents
     WHERE project_id = $1 AND document_kind = 'generated_estimate'`,
    [project.id],
  );

  if (existing) {
    const updated = await queryOne<DocumentRow>(
      `UPDATE documents SET storage_key=$3, storage_driver=$4, mime_type=$5,
         extension=$6, size_bytes=$7, document_kind='generated_estimate',
         uploaded_by=$8, created_at=NOW()
       WHERE id=$1 AND project_id=$2 RETURNING *`,
      [existing.id, project.id, key, storage.driver, 'application/pdf', 'pdf', data.length, uploadedBy],
    );
    if (!updated) {
      await storage.remove(key).catch(() => undefined);
      throw new Error('Unable to update generated estimate document');
    }
    await storage.remove(existing.storage_key).catch(() => undefined);
    return toDocumentDto(updated);
  }

  let inserted: DocumentRow | null;
  try {
    inserted = await queryOne<DocumentRow>(
      `INSERT INTO documents (project_id, file_name, storage_key, storage_driver, mime_type,
         extension, size_bytes, document_kind, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'generated_estimate',$8) RETURNING *`,
      [project.id, fileName, key, storage.driver, 'application/pdf', 'pdf', data.length, uploadedBy],
    );
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
  if (!inserted) {
    await storage.remove(key).catch(() => undefined);
    throw new Error('Unable to create generated estimate document');
  }
  return toDocumentDto(inserted);
}
