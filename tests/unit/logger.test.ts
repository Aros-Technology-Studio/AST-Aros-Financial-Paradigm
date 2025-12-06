describe('Logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses info level by default', async () => {
    delete process.env.LOG_LEVEL;
    const { logger } = await import('../../src/platform/logger');
    expect(logger.level).toBe('info');
  });

  it('respects LOG_LEVEL env variable', async () => {
    process.env.LOG_LEVEL = 'debug';
    const { logger } = await import('../../src/platform/logger');
    expect(logger.level).toBe('debug');
  });
});

