// UR-2 · SR-2.1 overdraft, SR-2.2 savings interest, SR-2.3 savings balance floor
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeBank } from './_helpers.js';
import { lowestAllowedBalance, checkDebit, monthlyInterest, isLastDayOfMonth, ERR } from '../../server/src/finance.js';
import { runMonthlyInterest } from '../../server/src/advanced.js';

test('SR-2.1 current accounts may go down to exactly -$500.00', () => {
  assert.equal(lowestAllowedBalance('current'), -50_000);
  assert.deepEqual(checkDebit('current', 10_000, 60_000), { ok: true, balance: -50_000 });
  assert.equal(checkDebit('current', 10_000, 60_001).code, ERR.INSUFFICIENT);
});
test('SR-2.3 savings accounts must keep $100.00', () => {
  assert.equal(lowestAllowedBalance('savings'), 10_000);
  assert.equal(checkDebit('savings', 50_000, 40_000).ok, true);
  assert.equal(checkDebit('savings', 50_000, 40_001).code, ERR.BELOW_MIN);
  assert.equal(checkDebit('savings', 50_000, 50_001).code, ERR.INSUFFICIENT);
});
test('SR-2.2 interest is I = B * (r/12) with r = 2.5 %', () => {
  assert.equal(monthlyInterest(100_000), 208);   // $1,000.00 -> $2.08
  assert.equal(monthlyInterest(1_200_000), 2_500); // $12,000 -> $25.00
  assert.equal(monthlyInterest(0), 0); assert.equal(monthlyInterest(-500), 0);
});
test('SR-2.2 interest is credited on the last calendar day of the month', () => {
  assert.ok(isLastDayOfMonth(new Date('2026-11-30T12:00:00Z'))); assert.ok(!isLastDayOfMonth(new Date('2026-11-29T12:00:00Z')));
  assert.ok(isLastDayOfMonth(new Date('2028-02-29T12:00:00Z'))); assert.ok(!isLastDayOfMonth(new Date('2028-02-28T12:00:00Z')));
});
test('SR-2.2 monthly run pays savings only, writes a ledger entry, and never pays twice in a month', async () => {
  const bank = fakeBank([{ type: 'savings', balance: 120_000, monthMin: 100_000 }, { type: 'current', balance: 500_000, monthMin: 500_000 }]);
  const now = new Date('2026-11-30T20:00:00Z');
  assert.equal(await runMonthlyInterest(now), 1);
  assert.equal(bank.accounts[0].balance, 120_208); assert.equal(bank.accounts[1].balance, 500_000);
  assert.equal(bank.ledger.length, 1); assert.equal(bank.ledger[0].type, 'interest'); assert.equal(bank.ledger[0].amount, 208);
  assert.equal(await runMonthlyInterest(now), 0); assert.equal(bank.accounts[0].balance, 120_208);
});
