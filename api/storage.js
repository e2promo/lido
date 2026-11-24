const NEON_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export function storageMode() {
  if (SUPABASE_URL && SUPABASE_KEY) return 'supabase';
  if (NEON_URL) return 'neon';
  if (UPSTASH_URL && UPSTASH_TOKEN) return 'upstash';
  return null;
}

/* ---------- Supabase через REST (PostgREST) ---------- */

async function supabaseRequest(endpoint, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const supabase = {
  async get(key) {
    const rows = await supabaseRequest(`/rest/v1/lido_snapshots?key=eq.${encodeURIComponent(key)}&select=value`);
    return rows?.length ? rows[0].value : null;
  },
  async set(key, value) {
    await supabaseRequest('/rest/v1/lido_snapshots', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, value }),
    });
  },
  async keys(prefix) {
    const rows = await supabaseRequest(`/rest/v1/lido_snapshots?key=like.${encodeURIComponent(prefix + '%')}&select=key`);
    return (rows || []).map((r) => r.key);
  },
  async lock(key, value, ttlSeconds) {
    const rows = await supabaseRequest(`/rest/v1/lido_locks?key=eq.${encodeURIComponent(key)}&select=value,expires_at`);
    if (rows?.length && Number(rows[0].expires_at) > Date.now()) return false;
    await supabaseRequest('/rest/v1/lido_locks', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, value, expires_at: Date.now() + ttlSeconds * 1000 }),
    });
    return true;
  },
  async unlock(key, value) {
    await supabaseRequest(`/rest/v1/lido_locks?key=eq.${encodeURIComponent(key)}&value=eq.${encodeURIComponent(value)}`, { method: 'DELETE' });
  },
};

/* ---------- Neon Postgres через HTTP SQL ---------- */

function neonSettings() {
  const parsed = new URL(NEON_URL);
  const host = parsed.hostname.replace('-pooler', '');
  return {
    endpoint: `https://${host}/sql`,
    authorization: 'Basic ' + Buffer.from(
      `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`,
    ).toString('base64'),
  };
}

async function neonSql(query, params = []) {
  const settings = neonSettings();
  const res = await fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: settings.authorization },
    body: JSON.stringify({ query, params }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Neon SQL: HTTP ${res.status} ${text.slice(0, 200)}`); }
  if (data.error) throw new Error(data.error.message || String(data.error));
  return data.rows || [];
}

let neonInitialized = false;
async function ensureNeon() {
  if (neonInitialized) return;
  await neonSql('CREATE TABLE IF NOT EXISTS lido_snapshots (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await neonSql('CREATE TABLE IF NOT EXISTS lido_locks (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at BIGINT NOT NULL)');
  neonInitialized = true;
}

const neon = {
  async get(key) {
    await ensureNeon();
    const rows = await neonSql('SELECT value FROM lido_snapshots WHERE key = $1', [key]);
    return rows.length ? rows[0].value : null;
  },
  async set(key, value) {
    await ensureNeon();
    await neonSql(`INSERT INTO lido_snapshots (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, value]);
  },
  async keys(prefix) {
    await ensureNeon();
    const rows = await neonSql('SELECT key FROM lido_snapshots WHERE key LIKE $1', [prefix + '%']);
    return rows.map((r) => r.key);
  },
  async lock(key, value, ttlSeconds) {
    await ensureNeon();
    const now = Date.now();
    const rows = await neonSql('SELECT value, expires_at FROM lido_locks WHERE key = $1', [key]);
    if (rows.length && Number(rows[0].expires_at) > now) return false;
    await neonSql(`INSERT INTO lido_locks (key, value, expires_at) VALUES ($1, $2, $3)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      [key, value, now + ttlSeconds * 1000]);
    return true;
  },
  async unlock(key, value) {
    await ensureNeon();
    await neonSql('DELETE FROM lido_locks WHERE key = $1 AND value = $2', [key, value]);
  },
};

/* ---------- Upstash / Vercel KV через REST ---------- */

async function upstash(...command) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

const upstashStore = {
  async get(key) { const value = await upstash('GET', key); return value ?? null; },
  async set(key, value) { await upstash('SET', key, value); },
  async keys(prefix) { return (await upstash('KEYS', prefix + '*')) || []; },
  async lock(key, value, ttlSeconds) { return (await upstash('SET', key, value, 'NX', 'EX', ttlSeconds)) === 'OK'; },
  async unlock(key, value) {
    await upstash('EVAL',
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1, key, value);
  },
};

export function storage() {
  const mode = storageMode();
  if (mode === 'supabase') return supabase;
  if (mode === 'neon') return neon;
  if (mode === 'upstash') return upstashStore;
  throw new Error('Хранилище не настроено: задайте SUPABASE_URL и SUPABASE_SERVICE_KEY, либо NEON_DATABASE_URL, либо UPSTASH_REDIS_REST_URL/TOKEN');
}
