import mongoose from 'mongoose';
const { Schema, model } = mongoose;
export const Goal = model('Goal', new Schema({ user: { type: Schema.Types.ObjectId, index: true }, name: String, target: Number, saved: { type: Number, default: 0 } }, { timestamps: true }));
