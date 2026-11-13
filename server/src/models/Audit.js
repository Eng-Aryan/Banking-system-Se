import mongoose from 'mongoose';
const { Schema, model } = mongoose;
export const Audit = model('Audit', new Schema({ user: { type: Schema.Types.ObjectId, index: true }, event: String, ip: String }, { timestamps: true }));
