// Shared test helpers: boots the real Express app and replaces the Mongo models with in-memory fakes.
import { createRequire } from 'node:module';
process.env.JWT_SECRET ||= 'test-secret-'.padEnd(40, 'x');
const req = createRequire(new URL('../../server/package.json', import.meta.url));
export const jwt = req('jsonwebtoken');
export const bcrypt = req('bcryptjs');
export const SECRET = process.env.JWT_SECRET;
const { app } = await import('../../server/src/app.js');
export const { Account, Txn, Audit, User } = await import('../../server/src/models.js');
console.error = () => {}; // keep expected-error logs out of test output

export function startApp() {
  const s = app.listen(0);
  return { base: `http://127.0.0.1:${s.address().port}/api`, close: () => s.close() };
}
export const cookieFor = (id = 'u1', secret = SECRET, opts = {}) => 'sid=' + jwt.sign({ id }, secret, { expiresIn: '30m', ...opts });
export async function call(base, method, path, body, cookie) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
/** In-memory stand-in for the accounts/ledger collections, honouring the filter semantics the routes rely on. */
export function fakeBank(initList, { failTxn = false } = {}) {
  const accounts = (Array.isArray(initList) ? initList : [initList]).map((a, i) => ({ _id: 'a' + (i + 1), user: 'u' + (i + 1), number: '100000000' + (i + 1), frozen: false, type: 'current', balance: 0, monthMin: 0, ...a }));
  const ledger = []; const queries = [];
  const pick = (f) => accounts.find((a) => (f._id ? a._id === f._id : f.user ? a.user === f.user : true));
  Account.findOne = async (q) => { queries.push(q); const a = pick(q); return a ? { ...a } : null; };
  Account.findOneAndUpdate = async (f, u) => {
    const a = pick(f); if (!a) return null;
    if (f.frozen && '$ne' in f.frozen && a.frozen === f.frozen.$ne) return null;
    if (f.balance && a.balance < f.balance.$gte) return null;
    if (f.lastInterest && a.lastInterest === f.lastInterest.$ne) return null;
    if (u.$inc?.balance) a.balance += u.$inc.balance;
    if (u.$set) Object.assign(a, u.$set);
    return { ...a };
  };
  Account.updateOne = async (f, u) => { const a = pick(f); if (u.$inc?.balance) a.balance += u.$inc.balance; if (u.$min) a.monthMin = Math.min(a.monthMin, u.$min.monthMin); if (u.monthMin !== undefined) a.monthMin = u.monthMin; };
  Account.find = (q) => accounts.filter((a) => a.type === q.type && a.lastInterest !== q.lastInterest.$ne).map((a) => ({ ...a }));
  Txn.create = async (d) => { if (failTxn) throw new Error('simulated database failure'); ledger.push(d); return d; };
  Audit.create = async () => ({});
  return { accounts, ledger, queries };
}
