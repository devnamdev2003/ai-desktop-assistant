/**
 * Aivora Desktop OAuth & Authentication Bridge Server
 * Listens on port 8000 (matching GOOGLE_REDIRECT_URI in Google Cloud Console)
 *
 * Capabilities:
 * 1. Handles Google OAuth callback (http://localhost:8000/api/v1/auth/google/callback)
 * 2. Directly bridges authenticated sessions into the Aivora Desktop App via:
 *    - Custom Scheme Deep Linking (aivora://auth/callback?access_token=...&refresh_token=...)
 *    - Desktop Session Polling (/api/v1/auth/google/check-desktop-session)
 *    - Web URL hash fallback (http://localhost:3000/#access_token=...)
 * 3. Syncs user accounts directly into the Neon PostgreSQL database
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Read environment from backend/.env if available
function loadEnv() {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        env[key] = val;
      }
    }
  }
  return env;
}

const fileEnv = loadEnv();

const PORT = parseInt(process.env.FASTAPI_PORT || fileEnv.FASTAPI_PORT || '8000', 10);
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  fileEnv.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || fileEnv.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  fileEnv.GOOGLE_REDIRECT_URI;
const JWT_SECRET =
  process.env.JWT_SECRET_KEY ||
  fileEnv.JWT_SECRET_KEY;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  fileEnv.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || fileEnv.FRONTEND_URL;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  fileEnv.GEMINI_API_KEY;

// In-memory desktop sessions for fast polling
const desktopSessions = new Map();

// Helper: Sign simple HS256 JWT
function createJwt(payload, secret, expiresInSeconds = 900) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsignedToken = `${encode(header)}.${encode(fullPayload)}`;
  const signature = crypto.createHmac('sha256', secret).update(unsignedToken).digest('base64url');
  return `${unsignedToken}.${signature}`;
}

// Helper: Verify HS256 JWT
function verifyJwt(token, secret) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
    if (sigB64 !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Helper: Call Google Gemini API directly
function generateGeminiContent(prompt, history = []) {
  return new Promise((resolve, reject) => {
    const contents = [];
    if (Array.isArray(history)) {
      for (const msg of history) {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text || '' }],
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const payload = JSON.stringify({
      contents,
      systemInstruction: {
        parts: [
          {
            text: 'You are Aivora, a high-performance desktop AI assistant. Provide clear, concise, intelligent, and beautifully structured responses with Markdown formatting.',
          },
        ],
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const targetUrl = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
    );

    const options = {
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname + targetUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed.error?.message || `Gemini error (${res.statusCode})`));
            return;
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          resolve(text || 'No response text from Gemini.');
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Helper: HTTP POST request
function httpsPost(requestUrl, bodyParams) {
  return new Promise((resolve, reject) => {
    const postData = typeof bodyParams === 'string' ? bodyParams : new URLSearchParams(bodyParams).toString();
    const parsed = new URL(requestUrl);

    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper: HTTP GET request
function httpsGet(requestUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(requestUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Save or update user in PostgreSQL Neon DB
async function upsertUser(googleUser) {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const { sub: google_id, email, name: full_name, picture: avatar_url } = googleUser;

    const findRes = await client.query(
      'SELECT id, email, full_name, avatar_url, google_id, is_active, is_superuser, created_at, updated_at FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
      [google_id, email]
    );

    let user;
    if (findRes.rows.length > 0) {
      const existing = findRes.rows[0];
      const updateRes = await client.query(
        'UPDATE users SET google_id = $1, full_name = COALESCE($2, full_name), avatar_url = COALESCE($3, avatar_url), updated_at = NOW() WHERE id = $4 RETURNING *',
        [google_id, full_name, avatar_url, existing.id]
      );
      user = updateRes.rows[0];
    } else {
      const id = crypto.randomUUID();
      const insertRes = await client.query(
        'INSERT INTO users (id, email, full_name, avatar_url, google_id, is_active, is_superuser, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, false, NOW(), NOW()) RETURNING *',
        [id, email, full_name, avatar_url, google_id]
      );
      user = insertRes.rows[0];
    }

    await client.end();
    return user;
  } catch (err) {
    console.error('[DB Warning] PostgreSQL query error:', err.message);
    try { await client.end(); } catch {}
    // Fallback in-memory user object
    return {
      id: crypto.randomUUID(),
      email: googleUser.email,
      full_name: googleUser.name,
      avatar_url: googleUser.picture,
      google_id: googleUser.sub,
      is_active: true,
      is_superuser: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

// Start HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. Health check
  if (pathname === '/api/v1/health' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'aivora-auth-bridge', port: PORT, timestamp: new Date().toISOString() }));
    return;
  }

  // 2. Google OAuth URL generator
  if (pathname === '/api/v1/auth/google/url') {
    const sessionId = parsedUrl.query.state || `desk_${crypto.randomBytes(16).toString('hex')}`;
    desktopSessions.set(sessionId, { status: 'pending', created_at: Date.now() });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account consent',
      state: sessionId,
    });

    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: googleUrl, client_id: GOOGLE_CLIENT_ID, session_id: sessionId }));
    return;
  }

  // 3. Desktop polling check
  if (pathname === '/api/v1/auth/google/check-desktop-session') {
    const sessionId = parsedUrl.query.session_id;
    const session = desktopSessions.get(sessionId);
    if (!session) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'not_found' }));
      return;
    }

    if (session.status === 'authenticated') {
      desktopSessions.delete(sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'authenticated', tokens: session.tokens, user: session.user }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'pending' }));
    return;
  }

  // 4. Google OAuth 2.0 Callback (CRITICAL)
  if (pathname === '/api/v1/auth/google/callback') {
    const code = parsedUrl.query.code;
    const state = parsedUrl.query.state;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Google OAuth Error: No authorization code received</h1>');
      return;
    }

    try {
      // Exchange code for Google tokens
      const tokenResp = await httpsPost('https://oauth2.googleapis.com/token', {
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      });

      if (!tokenResp.data || !tokenResp.data.access_token) {
        throw new Error(tokenResp.data?.error_description || 'Failed to exchange authorization code with Google');
      }

      // Fetch Google profile
      const userResp = await httpsGet('https://www.googleapis.com/oauth2/v3/userinfo', {
        Authorization: `Bearer ${tokenResp.data.access_token}`,
      });

      if (!userResp.data || !userResp.data.email) {
        throw new Error('Could not retrieve Google profile');
      }

      const googleUser = userResp.data;
      const dbUser = await upsertUser(googleUser);

      // Generate Access & Refresh Tokens
      const accessToken = createJwt(
        { sub: dbUser.id, email: dbUser.email, is_superuser: dbUser.is_superuser },
        JWT_SECRET,
        900 // 15 mins
      );
      const refreshToken = crypto.randomBytes(32).toString('hex');

      const tokenBundle = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 900,
        user: dbUser,
      };

      // Notify desktop polling session if state present
      if (state && (desktopSessions.has(state) || state.startsWith('desk_'))) {
        desktopSessions.set(state, {
          status: 'authenticated',
          tokens: tokenBundle,
          user: dbUser,
          created_at: Date.now(),
        });
      }

      // Deep link URL for native desktop application (aivora://)
      const deepLinkUrl = `aivora://auth/callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&user_id=${encodeURIComponent(dbUser.id)}`;
      const webFallbackUrl = `${FRONTEND_URL}/#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&user_id=${encodeURIComponent(dbUser.id)}`;

      // Return polished response with immediate desktop auto-redirect and fallback button
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aivora Desktop Assistant - Signed in successfully</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: radial-gradient(120% 120% at 50% 0%, #1e1b4b 0%, #0f172a 60%, #090d16 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 28px;
      padding: 44px 36px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(124, 58, 237, 0.2);
    }
    .icon-box {
      width: 68px;
      height: 68px;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.25);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(139, 92, 246, 0.18);
      border: 1px solid rgba(168, 85, 247, 0.35);
      color: #d8b4fe;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 8px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    p {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 24px;
    }
    .btn-desktop {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 20px;
      border-radius: 16px;
      background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 10px 25px -5px rgba(124, 58, 237, 0.5);
      transition: all 0.2s ease;
      cursor: pointer;
      border: 0;
    }
    .btn-desktop:hover {
      background: linear-gradient(135deg, #6d28d9 0%, #4338ca 100%);
      transform: translateY(-1px);
    }
    .links {
      margin-top: 18px;
      display: flex;
      justify-content: center;
      gap: 16px;
      font-size: 12px;
    }
    .links a {
      color: #a78bfa;
      text-decoration: underline;
    }
    .status-text {
      margin-top: 14px;
      font-size: 12px;
      color: #34d399;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-box">
      <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
      </svg>
    </div>
    <div class="badge">
      ${dbUser.email}
    </div>
    <h1>Signed In Successfully!</h1>
    <p>Redirecting back to your <strong>Aivora Desktop Assistant</strong>...</p>

    <a id="open-desktop-btn" href="${deepLinkUrl}" class="btn-desktop">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
      Open Aivora Desktop App
    </a>

    <div class="status-text" id="status-desc">Launching desktop application...</div>

    <div class="links">
      <a href="${webFallbackUrl}">Open in Web Browser</a>
    </div>
  </div>

  <script>
    // 1. Immediately invoke custom scheme deep link to return to desktop app
    const deepLink = "${deepLinkUrl}";
    try {
      window.location.href = deepLink;
    } catch(e) {}

    // 2. Fallback timer if browser prompts or holds
    setTimeout(() => {
      const desc = document.getElementById('status-desc');
      if (desc) desc.textContent = 'If the app did not open automatically, click the button above.';
    }, 2000);
  </script>
</body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      console.error('[OAuth Callback Error]', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Authentication Failed</h1><p>${err.message}</p>`);
    }
    return;
  }

  // 5. Direct Code Exchange
  if (pathname === '/api/v1/auth/google/exchange' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { code, redirect_uri } = JSON.parse(body || '{}');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Authorization code required' }));
          return;
        }

        const tokenResp = await httpsPost('https://oauth2.googleapis.com/token', {
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirect_uri || GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        });

        if (!tokenResp.data?.access_token) {
          throw new Error('Google token exchange failed');
        }

        const userResp = await httpsGet('https://www.googleapis.com/oauth2/v3/userinfo', {
          Authorization: `Bearer ${tokenResp.data.access_token}`,
        });

        const googleUser = userResp.data;
        const dbUser = await upsertUser(googleUser);
        const accessToken = createJwt({ sub: dbUser.id, email: dbUser.email }, JWT_SECRET, 900);
        const refreshToken = crypto.randomBytes(32).toString('hex');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 900,
          user: dbUser,
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: e.message }));
      }
    });
    return;
  }

  // 6. Direct Gemini AI Chat Endpoint (/api/v1/chat)
  if (pathname === '/api/v1/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        let currentUserId = null;
        if (token) {
          const userPayload = verifyJwt(token, JWT_SECRET);
          if (userPayload) {
            currentUserId = userPayload.sub;
          }
        }

        const { question, conversation_id } = JSON.parse(body || '{}');
        if (!question || !question.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Question is required' }));
          return;
        }

        let convId = conversation_id || null;
        let history = [];

        // If authenticated and conversation_id provided, fetch previous messages
        if (currentUserId && convId) {
          try {
            const client = new Client({
              connectionString: DATABASE_URL,
              ssl: { rejectUnauthorized: false },
            });
            await client.connect();
            const historyRes = await client.query(
              'SELECT sender, text FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 8',
              [convId]
            );
            history = historyRes.rows;
            await client.end();
          } catch (e) {
            console.warn('[DB Context Warning]', e.message);
          }
        }

        // Generate answer directly from Google Gemini 2.5 Flash
        const answer = await generateGeminiContent(question, history);

        // Persist conversation and messages in PostgreSQL
        if (currentUserId) {
          try {
            const client = new Client({
              connectionString: DATABASE_URL,
              ssl: { rejectUnauthorized: false },
            });
            await client.connect();
            if (!convId) {
              const title = question.trim().substring(0, 40);
              const convRes = await client.query(
                'INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id',
                [currentUserId, title]
              );
              convId = convRes.rows[0]?.id;
            }
            if (convId) {
              await client.query(
                'INSERT INTO chat_messages (conversation_id, sender, text, created_at) VALUES ($1, $2, $3, NOW()), ($1, $4, $5, NOW())',
                [convId, 'user', question, 'assistant', answer]
              );
            }
            await client.end();
          } catch (dbErr) {
            console.warn('[DB Chat Persistence Warning]', dbErr.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            question,
            answer,
            conversation_id: convId,
          })
        );
      } catch (err) {
        console.error('[Chat Error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: err.message || 'Chat generation error' }));
      }
    });
    return;
  }

  // 404 Fallback
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found on auth bridge' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Aivora Auth Bridge] Listening on http://localhost:${PORT}`);
  console.log(`[Aivora Auth Bridge] OAuth Callback: ${GOOGLE_REDIRECT_URI}`);
  console.log(`[Aivora Auth Bridge] Desktop Protocol: aivora://auth/callback`);
});
