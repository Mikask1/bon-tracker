import { z } from 'zod';

export const STATUS = ['LUNAS', 'BELUM_LUNAS'] as const;
export type Status = (typeof STATUS)[number];

export function computeGrandTotal(
  items: { itemQty: number; unitPrice: number }[]
): number {
  return Math.round(items.reduce((s, i) => s + i.itemQty * i.unitPrice, 0));
}

export const itemSchema = z.object({
  itemName: z.string().min(1, 'Nama barang wajib diisi'),
  itemQty: z.number().positive('Qty harus lebih dari 0'), // decimals allowed (e.g. 1.5 kg)
  unitPrice: z.number().int('Harga harus bilangan bulat (Rp)').min(0),
});
export type Item = z.infer<typeof itemSchema>;

export const buyerSchema = z.object({
  name: z.string().default(''),
  address: z.string().min(1, 'Alamat wajib diisi'), // the one required buyer field
  phoneNumber: z.string().default(''),
});
export type Buyer = z.infer<typeof buyerSchema>;

// Client → server payload. grandTotal + invoiceId are assigned server-side.
export const invoiceInputSchema = z
  .object({
    localId: z.string().min(1),
    createdAt: z.coerce.date(),
    buyer: buyerSchema,
    items: z.array(itemSchema).min(1, 'Minimal 1 barang'),
    status: z.enum(STATUS),
    unpaidAmount: z.number().int().min(0),
    imageUrl: z.string().default(''),
  })
  .refine(
    (v) => {
      const total = computeGrandTotal(v.items);
      return v.status === 'BELUM_LUNAS'
        ? v.unpaidAmount > 0 && v.unpaidAmount <= total
        : v.unpaidAmount === 0;
    },
    { message: 'Jumlah belum dibayar tidak valid', path: ['unpaidAmount'] }
  );
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

// Full invoice as returned by the server.
export interface Invoice {
  invoiceId: string;
  localId: string;
  buyer: Buyer;
  items: Item[];
  grandTotal: number;
  status: Status;
  unpaidAmount: number;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

// Extracted shape from the vision model (buyer + items, no totals/status).
export interface ExtractedInvoice {
  buyer: Buyer;
  items: Item[];
}
