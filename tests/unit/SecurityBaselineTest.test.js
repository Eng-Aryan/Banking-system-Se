// NFR (Product/Security) · health endpoint, HTTP security headers, NoSQL-injection and payload-size defences
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, call } from './_helpers.js';

test('health endpoint reports ok (used by Jenkins and Docker health checks)', async () => {
  const { base, close } = startApp(); const r = await call(base, 'GET', '/health'); assert.equal(r.body.status, 'ok'); close();
});
test('responses carry hardened security headers and hide the framework', async () => {
  const { base, close } = startApp(); const r = await call(base, 'GET', '/health');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.ok(r.headers.get('content-security-policy')); assert.equal(r.headers.get('x-powered-by'), null); close();
});
test('NoSQL operator injection in the login body is rejected', async () => {
  const { base, close } = startApp();
  assert.equal((await call(base, 'POST', '/auth/login', { email: { $ne: null }, password: { $ne: null } })).status, 400); close();
});
test('oversized JSON bodies are refused and unknown routes return a JSON 404', async () => {
  const { base, close } = startApp();
  assert.equal((await call(base, 'POST', '/auth/login', { email: 'a@b.co', password: 'x'.repeat(20_000) })).status, 413);
  assert.equal((await call(base, 'GET', '/nope')).status, 404); close();
});
