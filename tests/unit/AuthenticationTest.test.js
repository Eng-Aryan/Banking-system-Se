// UR-1 [Security] · SR-1.1, SR-1.2, SR-1.3 · UC-01 Log In, UC-06 Verify MFA Code
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, call, cookieFor, bcrypt, User, Audit } from './_helpers.js';
import { afterFailedLogin, isLocked, BCRYPT_COST, LOCK_MS } from '../../server/src/finance.js';
import { hotp, verifyTotp } from '../../server/src/advanced.js';
const GOOD = 'Str0ngPassw0rd'; const T0 = 1_700_000_000_000;
Audit.create = async () => ({});
const fakeUser = async (extra = {}) => { const u = { _id: 'u1', id: 'u1', name: 'Test', email: 'a@b.co', password: await bcrypt.hash(GOOD, 4), failed: 0, save: async () => {}, ...extra }; User.findOne = () => ({ select: async () => u }); return u; };

test('SR-1.1 passwords are hashed with BCrypt cost factor 12', async () => {
  assert.equal(BCRYPT_COST, 12);
  const h = await bcrypt.hash(GOOD, BCRYPT_COST);
  assert.match(h, /^\$2[aby]\$12\$/); assert.ok(await bcrypt.compare(GOOD, h)); assert.ok(!(await bcrypt.compare('wrong', h)));
});
test('SR-1.2 three failures inside 5 minutes lock the account for 15 minutes', () => {
  let s = { failed: 0 };
  s = afterFailedLogin(s, T0); assert.equal(s.locked, false);
  s = afterFailedLogin(s, T0 + 60_000); assert.equal(s.locked, false);
  s = afterFailedLogin(s, T0 + 120_000);
  assert.equal(s.locked, true); assert.equal(s.lockUntil, T0 + 120_000 + LOCK_MS);
  assert.ok(isLocked(s, T0 + 120_000 + LOCK_MS - 1)); assert.ok(!isLocked(s, T0 + 120_000 + LOCK_MS + 1));
});
test('SR-1.2 failures more than 5 minutes apart do not accumulate', () => {
  let s = afterFailedLogin({ failed: 0 }, T0); s = afterFailedLogin(s, T0 + 6 * 60_000); s = afterFailedLogin(s, T0 + 12 * 60_000);
  assert.equal(s.locked, false); assert.equal(s.failed, 1);
});
test('SR-1.2 route: 3 wrong passwords, then even the right password gets 423 Locked', async () => {
  await fakeUser(); const { base, close } = startApp();
  for (let i = 0; i < 3; i++) assert.equal((await call(base, 'POST', '/auth/login', { email: 'a@b.co', password: 'Wrong-pass1' })).status, 401);
  const r = await call(base, 'POST', '/auth/login', { email: 'a@b.co', password: GOOD });
  assert.equal(r.status, 423); close();
});
test('UR-1 successful sign-in sets an HttpOnly, SameSite=Strict session cookie', async () => {
  await fakeUser(); const { base, close } = startApp();
  const r = await call(base, 'POST', '/auth/login', { email: 'a@b.co', password: GOOD });
  const c = r.headers.get('set-cookie'); assert.equal(r.status, 200);
  assert.match(c, /sid=/); assert.match(c, /HttpOnly/i); assert.match(c, /SameSite=Strict/i); close();
});
test('SR-1.3 TOTP: RFC 6238 vector, accepts current code, rejects wrong/empty', () => {
  assert.equal(hotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; const now = hotp(secret, Math.floor(Date.now() / 30000));
  assert.ok(verifyTotp(secret, now)); assert.ok(!verifyTotp(secret, '000000') || now === '000000'); assert.ok(!verifyTotp(secret, '')); assert.ok(!verifyTotp(undefined, now));
});
test('SR-1.3 route: with MFA on, the password alone is not enough', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; await fakeUser({ totpEnabled: true, totpSecret: secret }); const { base, close } = startApp();
  const a = await call(base, 'POST', '/auth/login', { email: 'a@b.co', password: GOOD });
  assert.equal(a.status, 401); assert.equal(a.body.need2fa, true);
  const b = await call(base, 'POST', '/auth/login', { email: 'a@b.co', password: GOOD, code: hotp(secret, Math.floor(Date.now() / 30000)) });
  assert.equal(b.status, 200); close();
});
test('UR-1 protected routes reject missing, forged and expired sessions', async () => {
  const { base, close } = startApp();
  assert.equal((await call(base, 'GET', '/accounts/me')).status, 401);
  assert.equal((await call(base, 'GET', '/accounts/me', null, cookieFor('u1', 'attacker-secret'.padEnd(40, 'x')))).status, 401);
  assert.equal((await call(base, 'GET', '/accounts/me', null, cookieFor('u1', undefined, { expiresIn: -10 }))).status, 401);
  close();
});
