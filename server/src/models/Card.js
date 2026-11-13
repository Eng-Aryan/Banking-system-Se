import mongoose from 'mongoose';
import { encrypt } from '../services/crypto.js';
const { Schema, model } = mongoose;
export const Card = model('Card', new Schema({
  user: { type: Schema.Types.ObjectId, index: true }, label: String,
  pan: { type: String, set: encrypt, select: false }, last4: String, expiry: String, // full number encrypted, never returned by default
  frozen: { type: Boolean, default: false }, dailyLimit: { type: Number, default: 50_000 }, // cents
  spentDay: { type: String }, spentToday: { type: Number, default: 0 }, status: { type: String, enum: ['active', 'closed'], default: 'active' },
}, { timestamps: true }));
