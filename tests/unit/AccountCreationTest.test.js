// UR-2 [Account Creation] · SR-2.4 · UC-02 Create Account (UC-09 Current, UC-10 Savings)
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, call, Account, User, Audit } from './_helpers.js';
Audit.create = async () => ({});
const ok = { name: 'Sara Ali', email: 'sara@example.com', password: 'Str0ngPassw0rd' };

test('registration validates name, email, password strength and account type', async () => {
  const { base, close } = startApp();
  for (const bad of [{ ...ok, email: 'nope' }, { ...ok, name: 'S' }, { ...ok, password: 'short1A' }, { ...ok, password: 'alllowercase123' }, { ...ok, accountType: 'premium' }, { ...ok, email: { $ne: null } }])
    assert.equal((await call(base, 'POST', '/auth/register', bad)).status, 400, JSON.stringify(bad));
  close();
});
test('duplicate e-mail is rejected with 409', async () => {
  User.exists = async () => ({ _id: 'x' }); const { base, close } = startApp();
  assert.equal((await call(base, 'POST', '/auth/register', ok)).status, 409); close();
});
for (const [type, expected] of [[undefined, 'current'], ['current', 'current'], ['savings', 'savings']])
  test(`opens a ${expected} account with a 10-digit number and simulated welcome funds (${type ?? 'default'})`, async () => {
    let made; User.exists = async () => null; User.create = async () => ({ _id: 'u9', id: 'u9' }); Account.create = async (a) => (made = a);
    const { base, close } = startApp();
    const r = await call(base, 'POST', '/auth/register', { ...ok, ...(type ? { accountType: type } : {}) });
    assert.equal(r.status, 201); assert.equal(made.type, expected); assert.match(made.number, /^\d{10}$/); assert.equal(made.balance, 100_000);
    assert.match(r.headers.get('set-cookie'), /HttpOnly/i); close();
  });
