const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.CORS_ORIGIN || '';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin === allowed ? origin : allowed),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function b64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64(s) {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function digest(text) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: 310000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
function randomToken() { const b = crypto.getRandomValues(new Uint8Array(32)); return b64(b); }
function validPassword(p) { return typeof p === 'string' && p.length >= 10 && p.length <= 128; }
async function readBody(request) { try { return await request.json(); } catch { return {}; } }
async function getConfig(env) { return env.DB.prepare('SELECT password_salt, password_hash FROM auth_config WHERE id=1').first(); }
async function checkSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const tokenHash = await digest(token);
  const row = await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').bind(tokenHash, Math.floor(Date.now()/1000)).first();
  return !!row;
}
async function createSession(env) {
  const token = randomToken();
  const hash = await digest(token);
  const expires = Math.floor(Date.now()/1000) + SESSION_SECONDS;
  await env.DB.prepare('INSERT INTO sessions(token_hash, expires_at) VALUES(?,?)').bind(hash, expires).run();
  return token;
}
export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, headers);
    const url = new URL(request.url);
    const body = await readBody(request);
    try {
      if (url.pathname === '/api/setup') {
        if (!env.SETUP_SECRET || body.setupSecret !== env.SETUP_SECRET) return json({ error: 'Setup authorization failed' }, 403, headers);
        if (await getConfig(env)) return json({ error: 'Already initialized. Use password reset instead.' }, 409, headers);
        if (!validPassword(body.password)) return json({ error: 'Password must be 10–128 characters.' }, 400, headers);
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await derive(body.password, salt);
        await env.DB.prepare('INSERT INTO auth_config(id,password_salt,password_hash,updated_at) VALUES(1,?,?,?)').bind(salt, hash, new Date().toISOString()).run();
        return json({ ok: true, message: 'Initial password created.' }, 200, headers);
      }
      if (url.pathname === '/api/login') {
        const cfg = await getConfig(env);
        if (!cfg) return json({ error: 'Owner must initialize the password first.' }, 503, headers);
        if (typeof body.password !== 'string' || body.password.length > 128) return json({ error: 'Invalid password.' }, 400, headers);
        const candidate = await derive(body.password, cfg.password_salt);
        if (candidate !== cfg.password_hash) return json({ error: 'Password did not match.' }, 401, headers);
        const token = await createSession(env);
        return json({ ok: true, token, expiresIn: SESSION_SECONDS }, 200, headers);
      }
      if (url.pathname === '/api/change-password') {
        if (!await checkSession(request, env)) return json({ error: 'Login expired. Please log in again.' }, 401, headers);
        if (!env.RECOVERY_KEY || body.adminKey !== env.RECOVERY_KEY) return json({ error: 'Owner recovery key did not match.' }, 403, headers);
        if (!validPassword(body.newPassword)) return json({ error: 'New password must be 10–128 characters.' }, 400, headers);
        const cfg = await getConfig(env);
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await derive(body.newPassword, salt);
        await env.DB.prepare('UPDATE auth_config SET password_salt=?, password_hash=?, updated_at=? WHERE id=1').bind(salt, hash, new Date().toISOString()).run();
        await env.DB.prepare('DELETE FROM sessions').run();
        return json({ ok: true, message: 'Password changed for everyone. All sessions were signed out.' }, 200, headers);
      }
      if (url.pathname === '/api/reset-password') {
        if (!env.RECOVERY_KEY || body.recoveryKey !== env.RECOVERY_KEY) return json({ error: 'Recovery key did not match.' }, 403, headers);
        if (!validPassword(body.newPassword)) return json({ error: 'New password must be 10–128 characters.' }, 400, headers);
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await derive(body.newPassword, salt);
        const exists = await getConfig(env);
        if (!exists) return json({ error: 'System is not initialized yet.' }, 503, headers);
        await env.DB.prepare('UPDATE auth_config SET password_salt=?, password_hash=?, updated_at=? WHERE id=1').bind(salt, hash, new Date().toISOString()).run();
        await env.DB.prepare('DELETE FROM sessions').run();
        return json({ ok: true, message: 'Password reset for everyone. All sessions were signed out.' }, 200, headers);
      }
      if (url.pathname === '/api/logout') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
        return json({ ok: true }, 200, headers);
      }
      return json({ error: 'Not found' }, 404, headers);
    } catch (e) {
      return json({ error: 'Server error. Check Worker and D1 configuration.' }, 500, headers);
    }
  }
};
