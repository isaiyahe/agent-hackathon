import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.js';

test('guest checkout returns the same 500 GUEST_USER_NULL on every run', async () => {
  for (let run = 0; run < 3; run++) {
    const res = await app.request('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ guest: true, items: [{ id: 'demo-item', quantity: 1 }] }),
    });

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      error: "Cannot read properties of null (reading 'id')",
      code: 'GUEST_USER_NULL',
    });
    assert.equal(res.headers.get('x-repro-demo'), 'guest-user-null');
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  }
});
