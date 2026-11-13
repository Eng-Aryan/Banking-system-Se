import mongoose from 'mongoose';
const { Schema, model } = mongoose;
export const Payee = model('Payee', new Schema({ user: { type: Schema.Types.ObjectId, index: true }, name: String, number: String }, { timestamps: true }));
