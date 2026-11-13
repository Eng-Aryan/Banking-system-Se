import mongoose from 'mongoose';
import { encrypt, decrypt } from '../services/crypto.js';
const { Schema, model } = mongoose;
export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },            // BCrypt cost 12
  failed: { type: Number, default: 0 }, firstFailAt: Date, lockUntil: Date,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  totpSecret: { type: String, select: false, set: encrypt, get: decrypt }, // AES-256-GCM at rest
  totpEnabled: { type: Boolean, default: false },
  passkeys: [{ id: String, publicKey: String, counter: Number, transports: [String], _id: false }], // Face ID / WebAuthn
}, { timestamps: true }));
