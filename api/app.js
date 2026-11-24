import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { storage, storageMode } from './storage.js';

const DATA_DIR = '/tmp/lido-data';
const PREFIX = 'lido:db:';
const LOCK_KEY = 'lido:lock';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquireLock(value) {
  for (let i = 0; i < 25; i++) {
    if (await storage().lock(LOCK_KEY, value, 30)) return true;
    await sleep(150);
  }
  return false;
}

async function releaseLock(value) {
  try { await storage().unlock(LOCK_KEY, value); }
  catch { /* блокировка снимется по TTL */ }
}

async function loadDatabases() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const keys = await storage().keys(PREFIX) || [];
  for (const key of keys) {
    const name = path.basename(key.slice(PREFIX.length));
    if (!/\.db(-wal|-shm)?$/.test(name)) continue;
    const stored = await storage().get(key);
    if (stored !== null && stored !== undefined) {
      fs.writeFileSync(path.join(DATA_DIR, name), Buffer.from(stored || '', 'base64'));
    }
  }
}

async function saveDatabases() {
  if (!fs.existsSync(DATA_DIR)) return;
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!/\.db(-wal|-shm)?$/.test(name)) continue;
    const encoded = fs.readFileSync(path.join(DATA_DIR, name)).toString('base64');
    await storage().set(PREFIX + path.basename(name), encoded);
  }
}

function makeResponseSink() {
  const sink = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    finished: false,
    writeHead(status, headers) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
      this.headersSent = true;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      this.headersSent = true;
      return this;
    },
    end(chunk) {
      if (chunk) sink.body = Buffer.concat([sink.body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
      this.finished = true;
      return this;
    },
    status(code) { this.statusCode = code; return this; },
    json(data) {
      this.headers['Content-Type'] = 'application/json; charset=utf-8';
      this.body = Buffer.from(JSON.stringify(data));
      this.finished = true;
      return this;
    },
    send(data) {
      this.body = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      this.finished = true;
      return this;
    },
    body: Buffer.alloc(0),
  };
  return sink;
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

export default async function handler(req, res) {
  if (!storageMode()) {
    return res.status(503).json({
      error: 'Хранилище не подключено',
      detail: 'Добавьте NEON_DATABASE_URL (Neon Postgres) или UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN в Environment Variables.',
    });
  }

  const lockValue = crypto.randomUUID();
  let locked = false;
  try {
    locked = await acquireLock(lockValue);
    if (!locked) return res.status(503).json({ error: 'Сервис временно занят', detail: 'Повторите запрос через секунду.' });

    process.env.DATA_DIR = DATA_DIR;
    await loadDatabases();
    const { handleRequest } = await import('../server/index.js');

    const sink = makeResponseSink();
    await handleRequest(req, sink);
    if (!sink.finished) sink.end('');
    await saveDatabases();

    res.status(sink.statusCode);
    for (const [key, value] of Object.entries(sink.headers)) {
      if (!['content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    return res.send(sink.body);
  } catch (err) {
    console.error('[lido-vercel]', err);
    return res.status(500).json({ error: 'Ошибка сервера', detail: err?.message || 'Неизвестная ошибка' });
  } finally {
    if (locked) await releaseLock(lockValue);
  }
}
