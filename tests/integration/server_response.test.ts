import { createServer } from '../../src/platform/server';
import { AddressInfo } from 'net';
import * as http from 'http';

describe('Server Response', () => {
  let server: http.Server;

  afterEach((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  it('responds with ok payload', async () => {
    server = createServer().listen(0);
    const { port } = server.address() as AddressInfo;

    // In Node 20, fetch is globally available
    const res = await fetch(`http://localhost:${port}`);
    const body: any = await res.json();

    expect(body.ok).toBe(true);
    expect(body.service).toBe('AST');
    expect(typeof body.ts).toBe('string');
  });
});

