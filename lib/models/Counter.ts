import mongoose, { Schema } from 'mongoose';

// Single doc per counter name; hex invoice sequence lives under _id: 'invoice'.
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export default mongoose.models.Counter ||
  mongoose.model('Counter', counterSchema);
