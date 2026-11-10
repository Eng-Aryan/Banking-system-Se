// UR-4 [Deposit] · SR-3.2 · UC-05 Deposit Funds
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, call, cookieFor, fakeBank } from './_helpers.js';

test('credits the account and records an immutable ledger entry', async () => {
  const bank = fakeBank({ balance: 10_000 }); const { base, close } = startApp();
  const r = await call(base, 'POST', '/accounts/deposit', { amount: 250.5 }, cookieFor('u1'));
  assert.equal(r.status, 200); assert.equal(r.body.balance, 35_050); assert.equal(bank.ledger.length, 1);
  assert.equal(bank.ledger[0].type, 'deposit'); assert.equal(bank.ledger[0].amount, 25_050); close();
});
test('rejects zero, negative, non-numeric and out-of-range amounts', async () => {
  const bank = fakeBank({ balance: 10_000 }); const { base, close } = startApp();
  for (const amount of [0, -5, 'abc', 10_000.01, null]) assert.equal((await call(base, 'POST', '/accounts/deposit', { amount }, cookieFor('u1'))).status, 400, String(amount));
  assert.equal(bank.accounts[0].balance, 10_000); assert.equal(bank.ledger.length, 0); close();
});
test('a frozen account cannot receive deposits', async () => {
  const bank = fakeBank({ balance: 10_000, frozen: true }); const { base, close } = startApp();
  assert.equal((await call(base, 'POST', '/accounts/deposit', { amount: 5 }, cookieFor('u1'))).status, 403); assert.equal(bank.accounts[0].balance, 10_000); close();
});
test('rollback: if the ledger write fails the deposit is undone', async () => {
  const bank = fakeBank({ balance: 10_000 }, { failTxn: true }); const { base, close } = startApp();
  assert.equal((await call(base, 'POST', '/accounts/deposit', { amount: 50 }, cookieFor('u1'))).status, 500);
  assert.equal(bank.accounts[0].balance, 10_000); close();
});
test('requires an authenticated session', async () => {
  fakeBank({}); const { base, close } = startApp(); assert.equal((await call(base, 'POST', '/accounts/deposit', { amount: 5 })).status, 401); close();
});
