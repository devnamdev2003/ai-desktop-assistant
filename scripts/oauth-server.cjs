/**
 * Aivora OAuth & API Proxy
 * Forwards all incoming API and OAuth requests directly to the FastAPI Python Backend.
 *
 * NOTE: This proxy DOES NOT access PostgreSQL directly.
 * All database operations (users, credentials, sessions, chat history) are
 * managed exclusively by the FastAPI backend (SQLAlchemy / PostgreSQL).
 */

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.PROXY_PORT || '8000', 10);
const FASTAPI_HOST = process.env.FASTAPI_HOST || '127.0.0.1';
const FASTAPI_PORT = parseInt(process.env.FASTAPI_PORT || '8000', 10);

const server = http.createServer((clientReq, clientRes) => {
  // CORS Headers
  clientRes.setHeader('Access-Control-Allow-Origin', '*');
  clientRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  clientRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (clientReq.method === 'OPTIONS') {
    clientRes.writeHead(204);
    clientRes.end();
    return;
  }

  const parsedUrl = url.parse(clientReq.url);

  const proxyOptions = {
    hostname: FASTAPI_HOST,
    port: FASTAPI_PORT,
    path: parsedUrl.path,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: `${FASTAPI_HOST}:${FASTAPI_PORT}`,
    },
  };

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.warn(`[Proxy Notice] Could not reach FastAPI at ${FASTAPI_HOST}:${FASTAPI_PORT}:`, err.message);
    clientRes.writeHead(502, { 'Content-Type': 'application/json' });
    clientRes.end(
      JSON.stringify({
        detail: `FastAPI backend is offline. Ensure FastAPI is running on port ${FASTAPI_PORT}.`,
      })
    );
  });

  clientReq.pipe(proxyReq, { end: true });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Aivora Proxy] Forwarding requests to FastAPI at http://${FASTAPI_HOST}:${FASTAPI_PORT}`);
  });
}

module.exports = server;
