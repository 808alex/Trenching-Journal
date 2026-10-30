const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer } = require('./support/server');

let server;
let port;
before(async () => {
  server = await startServer();
  port = new URL(server.baseUrl).port;
});
after(async () => { await server.stop(); });

// node:http (not fetch) so the Host header can be set freely.
function raw({ method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const walletCount = async () => (await server.get('/api/wallets')).data.length;

test('a cross-site form POST cannot reset the database', async () => {
  await server.post('/api/wallets', { name: 'Main', address: 'abc' });
  const before = await walletCount();
  assert.ok(before > 0);

  const status = await raw({
    method: 'POST',
    path: '/api/backup/reset',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  assert.equal(status, 403);
  assert.equal(await walletCount(), before);
});

test('a write without a JSON content type is refused even with no Origin header', async () => {
  const before = await walletCount();
  const status = await raw({
    method: 'POST',
    path: '/api/backup/reset',
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
  assert.equal(status, 415);
  assert.equal(await walletCount(), before);
});

test('requests addressed to a foreign host name are refused (DNS rebinding)', async () => {
  assert.equal(await raw({ path: '/api/trades', headers: { Host: `evil.example:${port}` } }), 403);
});

test('the app itself still works: same-origin page, reads, and JSON writes', async () => {
  assert.equal(await raw({ path: '/', headers: { Host: `localhost:${port}` } }), 200);
  assert.equal(await raw({ path: '/api/trades', headers: { Host: `127.0.0.1:${port}` } }), 200);
  assert.equal(
    await raw({
      method: 'POST',
      path: '/api/wallets',
      headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second', address: 'def' }),
    }),
    201
  );
  // A body-less write from the app (e.g. Reset Everything) sends the JSON header too.
  assert.equal(
    await raw({
      method: 'POST',
      path: '/api/backup/reset',
      headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}`, 'Content-Type': 'application/json' },
    }),
    200
  );
  assert.equal(await walletCount(), 0);
});
