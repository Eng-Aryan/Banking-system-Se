import test from 'node:test';
import assert from 'node:assert';
process.env.JWT_SECRET = 'x'.repeat(32);
const { app } = await import('../src/app.js');
test('health + auth guard', async () => {
  const s = app.listen(0); const base = `http://localhost:${s.address().port}/api`;
  assert.equal((await (await fetch(base + '/health')).json()).status, 'ok');
  assert.equal((await fetch(base + '/accounts/me')).status, 401);
  s.close();
});
test('TOTP matches RFC 6238 vector', async () => {
  const { hotp } = await import('../src/advanced.js');
  assert.equal(hotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});
