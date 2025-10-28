import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/platform/server.ts';
import { type AddressInfo } from 'node:net';

test('responds with ok payload', async () => {
  const server = createServer().listen(0);
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://localhost:${port}`);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'AST');
  assert.ok(typeof body.ts === 'string');
  server.close();
});
