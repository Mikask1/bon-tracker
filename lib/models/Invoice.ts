import mongoose, { Schema } from 'mongoose';
import { STATUS } from '@/types/invoice';

const itemSchema = new Schema(
  {
    itemName: { type: String, required: true },
    itemQty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const buyerSchema = new Schema(
  {
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
  },
  { _id: false }
);

const invoiceSchema = new Schema(
  {
    invoiceId: { type: String, required: true, unique: true },
    // client-generated stable key — dedupes offline-queued creates on sync
    localId: { type: String, required: true, unique: true },
    buyer: { type: buyerSchema, required: true },
    items: { type: [itemSchema], required: true },
    grandTotal: { type: Number, required: true },
    status: { type: String, enum: STATUS, required: true },
    unpaidAmount: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    // creation date comes from the client (may predate sync); YYMMDD of the id derives from it
    createdAt: { type: Date, required: true, index: true }, // sort + pagination
  },
  { timestamps: { createdAt: false } } // keep updatedAt, set createdAt ourselves
);

// Filter-by-status + sort/paginate-by-date — hits on every list load.
invoiceSchema.index({ status: 1, createdAt: -1 });
// ponytail: substring search (regex $or) is NOT index-accelerated; fine for a toko.
// For indexed partial search at scale, move to MongoDB Atlas Search.

export default mongoose.models.Invoice ||
  mongoose.model('Invoice', invoiceSchema);
