import { createServer } from '../../src/platform/server';
import { type AddressInfo } from 'node:net';

describe('Smoke Test', () => {
  it('serves healthcheck', async () => {
    const server = createServer().listen(0);
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}`);
    expect(res.status).toBe(200);
    server.close();
  });
});

