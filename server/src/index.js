import mongoose from 'mongoose';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from './app.js';
import { env, assertConfig } from './config/env.js';
import { connectDb } from './config/db.js';
import { User, Account } from './models/index.js';
import { runMonthlyInterest } from './services/interest.js';
import { isLastDayOfMonth } from './services/finance.js';

try { assertConfig(); } catch (e) { console.error(e.message); process.exit(1); }
await connectDb();
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));   // build indexes (unique account numbers, ledger chain)
if (env.adminEmail && env.adminPassword && !(await User.exists({ email: env.adminEmail.toLowerCase() }))) {
  const u = await User.create({ name: 'Bank Admin', email: env.adminEmail, password: await bcrypt.hash(env.adminPassword, 12), role: 'admin' });
  await Account.create({ user: u._id, number: String(crypto.randomInt(1e9, 9e9)), balance: 0 }); console.log('Admin account created');
}
// SR-2.2: on the last calendar day of each month credit savings interest (checked hourly, idempotent)
setInterval(() => { if (isLastDayOfMonth()) runMonthlyInterest().catch((e) => console.error('interest run failed', e.message)); }, 3_600_000);
const server = app.listen(env.port, () => console.log(`Bank API on :${env.port}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => mongoose.disconnect().then(() => process.exit(0))));
