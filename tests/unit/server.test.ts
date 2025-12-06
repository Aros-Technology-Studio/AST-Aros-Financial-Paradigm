import * as http from 'http';
import { createServer } from '../../src/platform/server';

describe('Server', () => {
  it('createServer returns an http.Server', () => {
    const server = createServer();
    expect(server).toBeInstanceOf(http.Server);
    server.close();
  });
});

