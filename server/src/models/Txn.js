import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const s = new Schema({
  from: String, to: String, amount: Number, note: String,
  type: { type: String, enum: ['deposit', 'withdrawal', 'transfer', 'interest', 'card', 'goal'] },
  owners: [{ type: Schema.Types.ObjectId, index: true }],
  chainKey: { type: String, index: true }, seq: Number, prev: String, hash: String, balanceAfter: Number, // hash-chained ledger
}, { timestamps: true });
s.index({ chainKey: 1, seq: 1 }, { unique: true, sparse: true });
// SR-3.4: append-only ledger, any update or delete is refused
for (const h of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne']) s.pre(h, () => { throw new Error('Ledger is immutable'); });
export const Txn = model('Txn', s);
