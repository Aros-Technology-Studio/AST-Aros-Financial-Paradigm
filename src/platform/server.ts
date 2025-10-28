import http from 'node:http';
export function createServer() {
  return http.createServer((_, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, service: 'AST', ts: new Date().toISOString() }));
  });
}
