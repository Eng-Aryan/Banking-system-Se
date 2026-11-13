import mongoose from 'mongoose';
const { Schema, model } = mongoose;
export const Account = model('Account', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
  number: { type: String, unique: true },
  type: { type: String, enum: ['current', 'savings'], default: 'current' },
  balance: { type: Number, default: 0 },                // integer cents; current accounts may go to -$500
  monthMin: { type: Number, default: 0 }, lastInterest: String,
  frozen: { type: Boolean, default: false }, lockedByAdmin: { type: Boolean, default: false },
}, { timestamps: true }));
