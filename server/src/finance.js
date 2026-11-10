// Pure business rules for the Secure Banking Application.
// Every constant maps to a System Requirement (SR) in docs/SRS_Secure_Banking_Application.docx.
export const BCRYPT_COST = 12;                 // SR-1.1
export const MAX_FAILED_LOGINS = 3;            // SR-1.2
export const LOGIN_WINDOW_MS = 5 * 60_000;     // SR-1.2
export const LOCK_MS = 15 * 60_000;            // SR-1.2
export const OVERDRAFT_LIMIT = 50_000;         // SR-2.1  L_max = $500.00 (cents)
export const SAVINGS_RATE = 0.025;             // SR-2.2  r = 2.5 % per year
export const SAVINGS_MIN_BALANCE = 10_000;     // SR-2.3  B_min = $100.00 (cents)
export const ACCOUNT_TYPES = ['current', 'savings'];
export const ERR = {
  INSUFFICIENT: 'ERR_INSUFFICIENT_FUNDS', BELOW_MIN: 'ERR_BELOW_MIN_BALANCE',
  FROZEN: 'ERR_ACCOUNT_FROZEN', AMOUNT: 'ERR_INVALID_AMOUNT',
};
export const MSG = {
  [ERR.INSUFFICIENT]: 'Insufficient funds', [ERR.BELOW_MIN]: 'Savings accounts must keep at least $100.00',
  [ERR.FROZEN]: 'Your account is frozen', [ERR.AMOUNT]: 'Invalid amount',
};

/** Lowest balance (in cents) an account may reach after a debit. */
export const lowestAllowedBalance = (type) => (type === 'savings' ? SAVINGS_MIN_BALANCE : -OVERDRAFT_LIMIT);

/** SR-3.1 decision: may `cents` be debited from an account of `type` holding `balance`? */
export function checkDebit(type, balance, cents) {
  if (!Number.isSafeInteger(cents) || cents <= 0) return { ok: false, code: ERR.AMOUNT };
  const after = balance - cents;
  if (after >= lowestAllowedBalance(type)) return { ok: true, balance: after };
  if (type === 'savings' && after >= 0) return { ok: false, code: ERR.BELOW_MIN };
  return { ok: false, code: ERR.INSUFFICIENT };
}

/** Mongo filter that re-checks the floor inside the database so concurrent debits can never overdraw. */
export const debitFilter = (type, cents) => ({ balance: { $gte: cents + lowestAllowedBalance(type) } });

/** SR-2.2: I = B * (r / 12), rounded to whole cents; B is the minimum balance of the month. */
export const monthlyInterest = (minBalanceCents, rate = SAVINGS_RATE) => (minBalanceCents > 0 ? Math.round((minBalanceCents * rate) / 12) : 0);

export const isLastDayOfMonth = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).getUTCDate() === 1;

export const isLocked = (s, now = Date.now()) => !!s.lockUntil && s.lockUntil > now;

/** SR-1.2: 3 consecutive failures within 5 minutes lock the account for 15 minutes. */
export function afterFailedLogin(s, now = Date.now()) {
  const inWindow = !!s.firstFailAt && now - s.firstFailAt <= LOGIN_WINDOW_MS;
  const failed = inWindow ? s.failed + 1 : 1;
  if (failed >= MAX_FAILED_LOGINS) return { failed: 0, firstFailAt: null, lockUntil: now + LOCK_MS, locked: true };
  return { failed, firstFailAt: inWindow ? s.firstFailAt : now, lockUntil: s.lockUntil, locked: false };
}
