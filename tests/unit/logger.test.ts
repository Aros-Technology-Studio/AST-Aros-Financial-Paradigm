import { test } from 'node:test';
import assert from 'node:assert/strict';

test('uses info level by default', async () => {
  delete process.env.LOG_LEVEL;
  const { logger } = await import('../../src/platform/logger.ts?' + Date.now());
  assert.equal(logger.level, 'info');
});

test('respects LOG_LEVEL env variable', async () => {
  process.env.LOG_LEVEL = 'debug';
  const { logger } = await import('../../src/platform/logger.ts?' + Date.now());
  assert.equal(logger.level, 'debug');
  delete process.env.LOG_LEVEL;
});

