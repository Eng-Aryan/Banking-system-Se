// UR-5 [Withdrawal] · SR-3.1 · UC-03 Withdraw Funds (+ UC-07 Overdraft, UC-08 Insufficient Funds)
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, call, cookieFor, fakeBank } from './_helpers.js';
const wd = (base, amount) => call(base, 'POST', '/accounts/withdraw', { amount }, cookieFor('u1'));

test('SR-3.1 deducts A, appends a ledger entry and returns the new balance', async () => {
  const bank = fakeBank({ balance: 100_000 }); const { base, close } = startApp();
  const r = await wd(base, 200); assert.equal(r.status, 201); assert.equal(r.body.balance, 80_000);
  assert.deepEqual([bank.ledger[0].type, bank.ledger[0].amount], ['withdrawal', 20_000]); close();
});
test('SR-2.1 current account: overdraft allowed to -$500.00, one cent more is ERR_INSUFFICIENT_FUNDS', async () => {
  const bank = fakeBank({ balance: 10_000 }); const { base, close } = startApp();
  const bad = await wd(base, 600.01); assert.equal(bad.status, 400); assert.equal(bad.body.code, 'ERR_INSUFFICIENT_FUNDS'); assert.equal(bank.accounts[0].balance, 10_000);
  assert.equal((await wd(base, 600)).status, 201); assert.equal(bank.accounts[0].balance, -50_000); close();
});
test('SR-2.3 savings account: cannot fall below $100.00', async () => {
  const bank = fakeBank({ type: 'savings', balance: 50_000 }); const { base, close } = startApp();
  assert.equal((await wd(base, 400.01)).body.code, 'ERR_BELOW_MIN_BALANCE');
  assert.equal((await wd(base, 600)).body.code, 'ERR_INSUFFICIENT_FUNDS');
  assert.equal((await wd(base, 400)).status, 201); assert.equal(bank.accounts[0].balance, 10_000); close();
});
test('invalid amounts are rejected and change nothing', async () => {
  const bank = fakeBank({ balance: 100_000 }); const { base, close } = startApp();
  for (const a of [0, -1, 'abc', 5000.01, null]) assert.equal((await wd(base, a)).status, 400, String(a));
  assert.equal(bank.accounts[0].balance, 100_000); assert.equal(bank.ledger.length, 0); close();
});
test('a frozen account (status != ACTIVE) cannot withdraw', async () => {
  const bank = fakeBank({ balance: 100_000, frozen: true }); const { base, close } = startApp();
  const r = await wd(base, 10); assert.equal(r.status, 403); assert.equal(r.body.code, 'ERR_ACCOUNT_FROZEN'); assert.equal(bank.accounts[0].balance, 100_000); close();
});
test('atomicity: concurrent withdrawals can never push the balance below the floor', async () => {
  const bank = fakeBank({ balance: 60_000 }); const { base, close } = startApp();   // available = 60,000 + 50,000 overdraft = 110,000
  const rs = await Promise.all(Array.from({ length: 5 }, () => wd(base, 300)));        // 5 x $300 requested at once
  const okCount = rs.filter((r) => r.status === 201).length;
  assert.equal(okCount, 3); assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.body.code === 'ERR_INSUFFICIENT_FUNDS'));
  assert.equal(bank.accounts[0].balance, 60_000 - 3 * 30_000); assert.ok(bank.accounts[0].balance >= -50_000); assert.equal(bank.ledger.length, okCount); close();
});
test('rollback: if the ledger write fails the debit is undone and the customer is not charged', async () => {
  const bank = fakeBank({ balance: 100_000 }, { failTxn: true }); const { base, close } = startApp();
  assert.equal((await wd(base, 100)).status, 500); assert.equal(bank.accounts[0].balance, 100_000); assert.equal(bank.ledger.length, 0); close();
});
test('requires an authenticated session', async () => {
  fakeBank({}); const { base, close } = startApp(); assert.equal((await call(base, 'POST', '/accounts/withdraw', { amount: 5 })).status, 401); close();
});
