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
  customerContact?: string | null;
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

const ESTIMATE_PROCESSES = [
  { key: 'Sand Casting', label: 'Sand Casting' },
  { key: 'Shell Casting', label: 'Shell Casting' },
  { key: 'Investment Cast', label: 'Investment Casting' },
  { key: 'Die Cast', label: 'High Pressure Die Casting' },
] as const;

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function text(value: string, x: number, y: number, size = 10, color = '0.12 0.15 0.18') {
  return `${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`;
}

function rule(y: number, x1 = 50, x2 = 562, color = '0.72 0.74 0.76') {
  return `${color} RG 0.6 w ${x1} ${y} m ${x2} ${y} l S`;
}

function field(label: string, value: string, x: number, y: number, valueX: number) {
  return [
    text(label, x, y, 8),
    text(value, valueX, y, 8),
    rule(y - 8, x, valueX + 130),
  ].join('\n');
}

function processUnitPrice(quote: QuickQuote, process: string): number | null {
  const pricePerPound = PROCESS_PRICING[process][quote.material];
  if (pricePerPound === undefined || pricePerPound === 0) return null;
  const baseCost = roundCurrency(quote.weight * pricePerPound);
  const machiningCost = quote.hasMachining
    ? roundCurrency(baseCost * MACHINING_PERCENTAGE / 100)
    : 0;
  const paintingCost = quote.hasPainting
    ? roundCurrency(baseCost * PAINTING_PERCENTAGE / 100)
    : 0;
  return roundCurrency(baseCost + machiningCost + paintingCost);
}

function estimateDate() {
  const date = new Date();
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
}

export function createQuotePdf(project: QuoteProject, quote: QuickQuote): Buffer {
  const title = `${project.projectNumber} - Estimate Quote`;
  const lines = [
    '0.055 0.12 0.17 rg 0 682 612 110 re f',
    '0.96 0.45 0.04 rg 50 720 m 50 753 l 67 753 l 67 737 l 84 753 l 84 720 l 67 737 l 50 720 l f',
    text('Milson', 96, 729, 24, '1 1 1'),
    text('Estimate', 480, 732, 14, '0.96 0.45 0.04'),
    field('Customer', project.customerName ?? 'Not provided', 50, 655, 155),
    field('Date', estimateDate(), 330, 655, 478),
    field('Attention', project.customerContact ?? 'Not provided', 50, 625, 155),
    field('Estimate ID', project.projectNumber, 330, 625, 478),
    text('Part details', 50, 578, 12, '0.12 0.15 0.18'),
    text('Estimated unit pricing', 330, 578, 12, '0.12 0.15 0.18'),
    '0.72 0.74 0.76 RG 0.6 w 50 375 215 145 re S',
    text('Part drawing', 112, 447, 10, '0.48 0.50 0.52'),
    text('See project documents', 92, 430, 8, '0.48 0.50 0.52'),
    text('Part Number', 50, 350, 8),
    text(project.customerPartNumber ?? 'Not provided', 155, 350, 8),
    rule(342, 50, 300),
    text('EAU', 50, 325, 8),
    text(quote.annualUsage === null ? 'Not provided' : String(quote.annualUsage), 155, 325, 8),
    rule(317, 50, 300),
    text('Material', 50, 300, 8),
    text(quote.material, 155, 300, 8),
    rule(292, 50, 300),
    text('Part Weight (lbs)', 50, 275, 8),
    text(quote.weight.toFixed(2), 155, 275, 8),
    rule(267, 50, 300),
    text('Coating', 50, 250, 8),
    text(quote.hasPainting ? 'Powder Coat' : 'None specified', 155, 250, 8),
    rule(242, 50, 300),
    text('Machining Level', 50, 225, 8),
    text(quote.hasMachining ? 'Simple' : 'None specified', 155, 225, 8),
    rule(217, 50, 300),
  ];

  let pricingY = 540;
  for (const process of ESTIMATE_PROCESSES) {
    const price = processUnitPrice(quote, process.key);
    lines.push(
      text(process.label, 330, pricingY, 8),
      text(price === null ? 'NO QUOTE' : `$${price.toFixed(2)}`, price === null ? 500 : 515, pricingY, 8),
      rule(pricingY - 12, 330, 562),
    );
    pricingY -= 38;
  }

  lines.push(
    '0.96 0.45 0.04 RG 1 w 330 190 m 562 190 l S',
    text("We're here to help", 330, 169, 11, '0.96 0.45 0.04'),
    text('Contact Milson to talk through your part, estimate,', 330, 146, 8, '0.96 0.45 0.04'),
    text('casting options, and the best path forward.', 330, 134, 8, '0.96 0.45 0.04'),
    text('+1 773-345-6258 or sales@milsonfoundry.com', 330, 122, 8, '0.96 0.45 0.04'),
    '0.96 0.45 0.04 RG 1 w 330 102 m 562 102 l S',
    text('Estimate terms: This estimate is preliminary and provided for budgeting', 330, 76, 6.5),
    text('and feasibility purposes only. Final pricing is subject to a full design and', 330, 67, 6.5),
    text('technical review before a formal quote is issued. All prices are in US dollars.', 330, 58, 6.5),
    text('Estimated unit pricing is FOB Milson Foundry warehouse.', 330, 49, 6.5),
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
