import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import Invoice from '@/lib/models/Invoice';
import {
  invoiceInputSchema,
  computeGrandTotal,
  STATUS,
  DELIVERY_STATUS,
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
    deliveryStatus: doc.deliveryStatus ?? 'BELUM_DIKIRIM',
    imageUrl: doc.imageUrl ?? '',
    imageHash: doc.imageHash ?? undefined,
    invoiceCreatedAt: doc.invoiceCreatedAt ?? doc.createdAt,
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
  delivery: z.enum(['ALL', 'DIKIRIM', 'BELUM_DIKIRIM']).default('ALL'),
  dateFrom: z.string().optional(), // yyyy-mm-dd
  dateTo: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(15),
});

export const invoicesRouter = router({
  // Server-side search / filter / sort / pagination.
  list: protectedProcedure.input(listInput).query(async ({ input }) => {
    const filter: Record<string, unknown> = {};

    if (input.status !== 'ALL') filter.status = input.status;
    if (input.delivery !== 'ALL') filter.deliveryStatus = input.delivery;

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
        .sort({ invoiceCreatedAt: -1 })
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

  // Byte-level dedupe: has this exact photo already been saved as an invoice?
  findByImageHash: protectedProcedure
    .input(z.object({ hash: z.string().min(1) }))
    .query(async ({ input }) => {
      const doc = await Invoice.findOne({ imageHash: input.hash }).lean();
      return doc ? { localId: doc.localId, invoiceId: doc.invoiceId } : null;
    }),

  // Idempotent create: dedupe by localId so a double-flushed offline queue can't
  // produce two invoices. Server owns grandTotal + invoiceId.
  create: protectedProcedure
    .input(invoiceInputSchema)
    .mutation(async ({ input }) => {
      const existing = await Invoice.findOne({ localId: input.localId }).lean();
      if (existing) return serialize(existing);

      // Note: no byte-hash dedupe here — the client warns before upload but lets the
      // user create anyway, so a duplicate hash is an allowed choice, not a conflict.
      const grandTotal = computeGrandTotal(input.items);
      const invoiceId = await generateInvoiceId(input.createdAt);
      const doc = await Invoice.create({ ...input, grandTotal, invoiceId });
      return serialize(doc.toObject());
    }),

  update: adminProcedure
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
          deliveryStatus: input.deliveryStatus,
          imageUrl: input.imageUrl,
          invoiceCreatedAt: input.invoiceCreatedAt,
          grandTotal,
        },
        { new: true }
      ).lean();
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
      return serialize(doc);
    }),

  // Quick single-field toggle for the list's swipe gesture — avoids resubmitting
  // the whole invoice (items, buyer, …) just to flip lunas/belum lunas.
  setStatus: adminProcedure
    .input(z.object({ localId: z.string(), status: z.enum(STATUS) }))
    .mutation(async ({ input }) => {
      const doc = await Invoice.findOne({ localId: input.localId });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
      doc.status = input.status;
      doc.unpaidAmount = input.status === 'BELUM_LUNAS' ? doc.grandTotal : 0;
      await doc.save();
      return serialize(doc.toObject());
    }),

  // Quick single-field toggle for the list's swipe gesture.
  setDeliveryStatus: adminProcedure
    .input(
      z.object({ localId: z.string(), deliveryStatus: z.enum(DELIVERY_STATUS) })
    )
    .mutation(async ({ input }) => {
      const doc = await Invoice.findOneAndUpdate(
        { localId: input.localId },
        { deliveryStatus: input.deliveryStatus },
        { new: true }
      ).lean();
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
      return serialize(doc);
    }),

  delete: adminProcedure
    .input(z.object({ localId: z.string() }))
    .mutation(async ({ input }) => {
      await Invoice.deleteOne({ localId: input.localId });
      return { localId: input.localId };
    }),

  // Online-only vision extraction. The client sends the photo's original bytes
  // inline when it still has them, so the model reads full quality even though
  // only a heavily compressed copy is kept in ImageKit. They're never persisted
  // client-side (a scan job stores just the URL), so on a resumed scan after a
  // reload they're absent and the stored image is fetched server-side instead.
  scan: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string().url(),
        image: z
          .object({ base64: z.string(), mimeType: z.string() })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.image) {
        return extractInvoice(input.image.base64, input.image.mimeType);
      }
      const r = await fetch(input.imageUrl);
      if (!r.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Gagal mengambil gambar' });
      }
      const base64 = Buffer.from(await r.arrayBuffer()).toString('base64');
      const mimeType = r.headers.get('content-type') || 'image/jpeg';
      return extractInvoice(base64, mimeType);
    }),
});
