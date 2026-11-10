// UR-3 [Balance Inquiry] · SR-3.3 · UC-04 Check Balance
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, call, cookieFor, fakeBank } from './_helpers.js';

test('returns balance, number, type and frozen flag for the signed-in customer', async () => {
  fakeBank({ balance: 123_45, type: 'savings' }); const { base, close } = startApp();
  const r = await call(base, 'GET', '/accounts/me', null, cookieFor('u1'));
  assert.equal(r.status, 200); assert.deepEqual(r.body, { number: '1000000001', balance: 12_345, frozen: false, type: 'savings' }); close();
});
test('requires an authenticated session', async () => {
  fakeBank({}); const { base, close } = startApp();
  assert.equal((await call(base, 'GET', '/accounts/me')).status, 401); close();
});
test('the account is always looked up by the session user, never by client input', async () => {
  const bank = fakeBank([{ balance: 1 }, { balance: 2 }]); const { base, close } = startApp();
  await call(base, 'GET', '/accounts/me?user=u2', null, cookieFor('u1')); await call(base, 'GET', '/accounts/me', null, cookieFor('u2'));
  assert.deepEqual(bank.queries.map((q) => q.user), ['u1', 'u2']); close();
});
test('balance inquiry answers in < 1.5 s (NFR speed)', async () => {
  fakeBank({ balance: 5 }); const { base, close } = startApp(); const t = performance.now();
  await call(base, 'GET', '/accounts/me', null, cookieFor('u1')); assert.ok(performance.now() - t < 1500); close();
});
