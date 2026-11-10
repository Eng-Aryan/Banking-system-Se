import mongoose from 'mongoose';
const { Schema, model } = mongoose;
export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  failed: { type: Number, default: 0 },
  firstFailAt: Date,
  lockUntil: Date,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  totpSecret: { type: String, select: false },
  totpEnabled: { type: Boolean, default: false },
}, { timestamps: true }));
export const Account = model('Account', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
  number: { type: String, unique: true },
  type: { type: String, enum: ['current', 'savings'], default: 'current' },
  balance: { type: Number, default: 0 }, // integer cents; current accounts may go down to -$500
  monthMin: { type: Number, default: 0 }, lastInterest: String,
  frozen: { type: Boolean, default: false }, lockedByAdmin: { type: Boolean, default: false },
}, { timestamps: true }));
export const Txn = model('Txn', new Schema({
  from: String, to: String, amount: Number, note: String,
  type: { type: String, enum: ['deposit', 'withdrawal', 'transfer', 'interest'] },
  owners: [{ type: Schema.Types.ObjectId, index: true }],
}, { timestamps: true }));
export const Audit = model('Audit', new Schema({
  user: { type: Schema.Types.ObjectId, index: true }, event: String, ip: String,
}, { timestamps: true }));
export const Payee = model('Payee', new Schema({
  user: { type: Schema.Types.ObjectId, index: true }, name: String, number: String,
}, { timestamps: true }));
