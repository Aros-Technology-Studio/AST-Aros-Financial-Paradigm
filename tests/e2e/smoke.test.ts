import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/platform/server.ts';
import { type AddressInfo } from 'node:net';

test('serves healthcheck', async () => {
  const server = createServer().listen(0);
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://localhost:${port}`);
  assert.equal(res.status, 200);
  server.close();
});
