import crypto from 'node:crypto';

export function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function readBody(req, limit = 1024 * 1024) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (!req.body) return Promise.resolve({});
      try { return Promise.resolve(JSON.parse(req.body)); }
      catch { return Promise.reject(new Error('Некорректный JSON')); }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return Promise.resolve(JSON.parse(req.body.toString('utf8'))); }
      catch { return Promise.reject(new Error('Некорректный JSON')); }
    }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Слишком большой запрос'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Некорректный JSON')); }
    });
    req.on('error', reject);
  });
}

export function token() {
  return crypto.randomBytes(24).toString('hex');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}

export function now(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60000).toISOString();
}

export function uid(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(db, key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
}

export function plain(row) {
  return row ? { ...row } : null;
}

export function plainAll(rows) {
  return rows.map((row) => ({ ...row }));
}
