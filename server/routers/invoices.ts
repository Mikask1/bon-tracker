import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import Invoice from '@/lib/models/Invoice';
import {
  invoiceInputSchema,
  computeGrandTotal,
  type Invoice as InvoiceType,
} from '@/types/invoice';
import { generateInvoiceId } from '@/lib/utils/invoiceId';
import { extractInvoice } from '@/lib/gemini';

/* eslint-disable @typescript-eslint/no-explicit-any */
function serialize(doc: any): InvoiceType {
  return {
    invoiceId: doc.invoiceId,
    localId: doc.localId,
    buyer: {
      name: doc.buyer?.name ?? '',
      address: doc.buyer?.address ?? '',
      phoneNumber: doc.buyer?.phoneNumber ?? '',
    },
    items: (doc.items ?? []).map((i: any) => ({
      itemName: i.itemName,
      itemQty: i.itemQty,
      unitPrice: i.unitPrice,
    })),
    grandTotal: doc.grandTotal,
    status: doc.status,
    unpaidAmount: doc.unpaidAmount ?? 0,
    imageUrl: doc.imageUrl ?? '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const listInput = z.object({
  q: z.string().default(''),
  status: z.enum(['ALL', 'LUNAS', 'BELUM_LUNAS']).default('ALL'),
  dateFrom: z.string().optional(), // yyyy-mm-dd
  dateTo: z.string().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(15),
});

export const invoicesRouter = router({
  // Server-side search / filter / sort / pagination.
  list: protectedProcedure.input(listInput).query(async ({ input }) => {
    const filter: Record<string, unknown> = {};

    if (input.status !== 'ALL') filter.status = input.status;

    if (input.dateFrom || input.dateTo) {
      const range: Record<string, Date> = {};
      if (input.dateFrom) range.$gte = new Date(`${input.dateFrom}T00:00:00`);
      if (input.dateTo) range.$lte = new Date(`${input.dateTo}T23:59:59.999`);
      filter.createdAt = range;
    }

    const q = input.q.trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { invoiceId: rx },
        { 'buyer.name': rx },
        { 'buyer.address': rx },
        { 'buyer.phoneNumber': rx },
        { 'items.itemName': rx },
      ];
    }

    const [total, docs] = await Promise.all([
      Invoice.countDocuments(filter),
      Invoice.find(filter)
        .sort({ createdAt: input.sort === 'desc' ? -1 : 1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .lean(),
    ]);

    return { rows: docs.map(serialize), total, page: input.page, limit: input.limit };
  }),

  getByLocalId: protectedProcedure
    .input(z.object({ localId: z.string() }))
    .query(async ({ input }) => {
      const doc = await Invoice.findOne({ localId: input.localId }).lean();
      return doc ? serialize(doc) : null;
    }),

  // Idempotent create: dedupe by localId so a double-flushed offline queue can't
  // produce two invoices. Server owns grandTotal + invoiceId.
  create: protectedProcedure
    .input(invoiceInputSchema)
    .mutation(async ({ input }) => {
      const existing = await Invoice.findOne({ localId: input.localId }).lean();
      if (existing) return serialize(existing);

      const grandTotal = computeGrandTotal(input.items);
      const invoiceId = await generateInvoiceId(input.createdAt);
      const doc = await Invoice.create({ ...input, grandTotal, invoiceId });
      return serialize(doc.toObject());
    }),

  update: protectedProcedure
    .input(invoiceInputSchema)
    .mutation(async ({ input }) => {
      const grandTotal = computeGrandTotal(input.items);
      const doc = await Invoice.findOneAndUpdate(
        { localId: input.localId },
        {
          buyer: input.buyer,
          items: input.items,
          status: input.status,
          unpaidAmount: input.unpaidAmount,
          imageUrl: input.imageUrl,
          grandTotal,
        },
        { new: true }
      ).lean();
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
      return serialize(doc);
    }),

  // Online-only vision extraction from a base64 photo.
  scan: protectedProcedure
    .input(z.object({ base64: z.string(), mimeType: z.string() }))
    .mutation(async ({ input }) => {
      return extractInvoice(input.base64, input.mimeType);
    }),
});
