import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/platform/server';

test('createServer returns an http.Server', () => {
  const server = createServer();
  assert.ok(server instanceof http.Server);
  server.close();
});
