import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';
import { parseWebhook, verifySecret, extractIncoming, getVkConfig } from './vk.js';
import { ingestIncoming, ingestOutgoing } from './engine.js';
import { addLog, withOrg, DEFAULT_ORG_ID } from './db.js';
import { masterDb, findUserByToken } from './master.js';
import { json, readBody } from './util.js';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveStatic(res, pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative) relative = 'index.html';
  const filePath = path.resolve(PUBLIC, relative);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  let target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(PUBLIC, 'index.html');
  const ext = path.extname(target).toLowerCase();
  const content = fs.readFileSync(target);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(content);
}

async function handleWebhook(req, res, url) {
  if (req.method === 'GET') {
    const confirmation = process.env.VK_CONFIRMATION_TOKEN || getVkConfig().confirmationToken || 'lido-confirmation-token';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(confirmation);
  }
  let body;
  try { body = await readBody(req); } catch { body = {}; }
  const parsed = parseWebhook(body);
  if (parsed.type === 'confirmation') {
    const confirmation = process.env.VK_CONFIRMATION_TOKEN || getVkConfig().confirmationToken || 'lido-confirmation-token';
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(confirmation);
  }
  if (!verifySecret(body)) {
    addLog('warn', 'Webhook ВК отклонён: неверный секрет');
    res.writeHead(403); return res.end('forbidden');
  }
  if (parsed.type === 'message_new') {
    const incoming = extractIncoming(parsed.object);
    if (incoming.text) {
      try {
        await ingestIncoming(incoming, { sendToVk: true });
      } catch (err) {
        addLog('error', 'Ошибка обработки сообщения ВК: ' + err.message);
      }
    }
  }
  if (parsed.type === 'message_reply' || parsed.type === 'message_edit') {
    const outgoing = extractIncoming(parsed.object);
    if (outgoing.text) {
      try {
        await ingestOutgoing({ ...outgoing, author: 'Сообщество' });
      } catch (err) {
        addLog('error', 'Ошибка сохранения исходящего сообщения ВК: ' + err.message);
      }
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}

export async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  try {
    if (pathname === '/webhook/vk' || pathname === '/vk/webhook') {
      const slug = url.searchParams.get('org');
      const org = slug ? masterDb.prepare('SELECT id FROM organizations WHERE slug = ?').get(slug) : null;
      if (slug && !org) return json(res, 404, { error: 'Компания для webhook не найдена' });
      return await withOrg(org?.id || DEFAULT_ORG_ID, () => handleWebhook(req, res, url));
    }
    if (pathname.startsWith('/api/')) {
      const header = req.headers.authorization || '';
      const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
      const user = findUserByToken(bearer);
      return await withOrg(user?.org_id || DEFAULT_ORG_ID, () => handleApi(req, res, pathname, url));
    }
    if (pathname === '/health') {
      return json(res, 200, { ok: true, service: 'lido', time: new Date().toISOString() });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(res, pathname);
    }
    res.writeHead(405); res.end('Method not allowed');
  } catch (err) {
    console.error('[lido] error:', err);
    if (!res.headersSent) json(res, 500, { error: 'Внутренняя ошибка сервера', detail: err.message });
    else res.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    console.log(`\n  Лидо — ИИ-агент для ВКонтакте`);
    console.log(`  Приложение: http://localhost:${PORT}`);
    console.log(`  Webhook ВК:  http://localhost:${PORT}/webhook/vk`);
    console.log(`  Вход: demo@lido.ru / lido2026\n`);
  });
}
