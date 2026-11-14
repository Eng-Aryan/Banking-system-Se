import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'x'.repeat(32);

const { app } = await import('../src/app.js');

test('health + auth guard', async () => {
  const server = app.listen(0);

  try {
    await new Promise(resolve => server.once('listening', resolve));

    const base = `http://localhost:${server.address().port}/api`;

    const health = await fetch(`${base}/health`);
    assert.equal((await health.json()).status, 'ok');

    const account = await fetch(`${base}/accounts/me`);
    assert.equal(account.status, 401);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

test('TOTP matches RFC 6238 vector', async () => {
  const { hotp } = await import('../src/services/totp.js');

  assert.equal(
    hotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1),
    '287082'
  );
});