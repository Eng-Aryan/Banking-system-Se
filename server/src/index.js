import mongoose from 'mongoose';
import { app } from './app.js';
if ((process.env.JWT_SECRET || '').length < 32) { console.error('JWT_SECRET must be at least 32 characters'); process.exit(1); }
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User, Account } from './models.js';
import { runMonthlyInterest } from './advanced.js';
import { isLastDayOfMonth } from './finance.js';
await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bank');
const { ADMIN_EMAIL: ae, ADMIN_PASSWORD: ap } = process.env;
if (ae && ap && !(await User.exists({ email: ae.toLowerCase() }))) {
  const u = await User.create({ name: 'Bank Admin', email: ae, password: await bcrypt.hash(ap, 12), role: 'admin' });
  await Account.create({ user: u._id, number: String(crypto.randomInt(1e9, 9e9)), balance: 0 });
  console.log('Admin account created');
}
const port = process.env.PORT || 5000;
// SR-2.2: on the last calendar day of each month credit savings interest (checked hourly, idempotent)
setInterval(() => { if (isLastDayOfMonth()) runMonthlyInterest().catch((e) => console.error('interest run failed', e.message)); }, 3_600_000);
app.listen(port, () => console.log(`Bank API on :${port}`));
