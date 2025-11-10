import { prisma } from '../prisma/client.js';

// Very small PDF generator for a single-page text invoice.
// Produces a minimal valid PDF with the fields rendered as text lines.
function buildSimplePdf({ title, lines }) {
  const objects = [];
  const addObj = (s) => { objects.push(Buffer.from(s, 'utf8')); };

  // Header
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary');

  // Build a simple content stream with text
  const contentText = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    `(${escapePdfText(title)}) Tj`,
    'T*',
    ...lines.map((l) => `(${escapePdfText(l)}) Tj`),
    'ET'
  ].join('\n');
  const contentStream = `<< /Length ${Buffer.byteLength(contentText, 'utf8')} >>\nstream\n${contentText}\nendstream\n`;

  // Object 1: Catalog
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  // Object 2: Pages
  addObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  // Object 3: Page
  addObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n');
  // Object 4: Contents
  addObj(`4 0 obj\n${contentStream}endobj\n`);
  // Object 5: Font
  addObj('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // XRef
  let offset = header.length;
  const xrefOffsets = [0]; // 0th object required but unused
  const body = Buffer.concat(objects.map((o, idx) => {
    xrefOffsets.push(offset);
    offset += o.length;
    return o;
  }));

  const xrefStart = offset;
  const xrefLines = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f '
  ].concat(xrefOffsets.slice(1).map((off) => `${off.toString().padStart(10, '0')} 00000 n `)).join('\n') + '\n';
  const trailer = [
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    `${xrefStart}`,
    '%%EOF'
  ].join('\n');

  return Buffer.concat([header, body, Buffer.from(xrefLines, 'utf8'), Buffer.from(trailer, 'utf8')]);
}

function escapePdfText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export async function createInvoiceForTokenPurchase({ userId, tokenPurchase, planName, amountInr, tokens }, client = prisma) {
  const title = `Invoice: ${planName} Token Purchase`;
  const lines = [
    '',
    `User: ${userId}`,
    `Plan: ${planName}`,
    `Tokens: ${tokens}`,
    `Amount: INR ${amountInr}`,
    `Transaction: ${tokenPurchase.transactionId}`,
    `Date: ${new Date().toISOString()}`
  ];
  const pdf = buildSimplePdf({ title, lines });

  const invoice = await client.invoice.create({
    data: {
      userId,
      tokenPurchaseId: tokenPurchase.id,
      pdf,
      amount: Number(amountInr),
      currency: 'INR',
      tokens: Number(tokens),
      planName
    }
  });
  return invoice;
}
