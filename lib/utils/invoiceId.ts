import Counter from '@/lib/models/Counter';

function yymmdd(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

// "YYMMDD-<hex>": date from the invoice's createdAt, hex from a global atomic counter.
export async function generateInvoiceId(createdAt: Date): Promise<string> {
  const c = await Counter.findOneAndUpdate(
    { _id: 'invoice' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `${yymmdd(createdAt)}-${c.seq.toString(16)}`;
}
