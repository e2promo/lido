import { getSetting } from './util.js';
import { addLog, db } from './db.js';

const API_BASE = 'https://api.vk.com/method';
const API_VERSION = '5.199';

export function getVkConfig() {
  const stored = getSetting(db, 'vk', {});
  return {
    ...stored,
    token: process.env.VK_GROUP_TOKEN || stored.token || '',
    groupId: process.env.VK_GROUP_ID || '',
    secret: process.env.VK_SECRET || stored.secret || '',
    confirmationToken: process.env.VK_CONFIRMATION_TOKEN || stored.confirmationToken || '',
  };
}

export async function vkRequest(method, params = {}, token) {
  const accessToken = token || process.env.VK_GROUP_TOKEN || '';
  if (!accessToken) throw new Error('Токен сообщества ВКонтакте не настроен');
  const url = new URL(`${API_BASE}/${method}`);
  url.searchParams.set('v', API_VERSION);
  url.searchParams.set('access_token', accessToken);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(`VK API ${data.error.error_code}: ${data.error.error_msg}`);
  return data.response;
}

export async function sendMessage(peerId, text) {
  const config = getVkConfig();
  if (!config.token) {
    addLog('info', 'Демо-режим: сообщение отправлено в интерфейс (без VK API)', { peerId });
    return { ok: true, simulated: true };
  }
  try {
    const result = await vkRequest('messages.send', {
      peer_id: peerId,
      message: text,
      random_id: Math.floor(Math.random() * 2 ** 31),
      group_id: config.groupId ? Number(config.groupId) : undefined,
    });
    addLog('success', 'Сообщение отправлено через VK API', { peerId, messageId: result });
    return { ok: true, messageId: result };
  } catch (err) {
    addLog('error', 'Ошибка отправки в VK: ' + err.message, { peerId });
    return { ok: false, error: err.message };
  }
}

export async function getHistory(peerId, count = 20) {
  const config = getVkConfig();
  if (!config.token) throw new Error('Токен сообщества ВКонтакте не настроен');
  const response = await vkRequest('messages.getHistory', {
    peer_id: Number(peerId),
    count: Math.min(100, Math.max(1, count)),
    extended: 0,
  });
  return (response.items || []).map((item) => ({
    vkMessageId: String(item.id),
    peerId: item.peer_id,
    fromId: item.from_id,
    text: item.text || '',
    date: item.date ? new Date(item.date * 1000).toISOString() : nowIso(),
    out: Boolean(item.out),
  }));
}

function nowIso() { return new Date().toISOString(); }

export function parseWebhook(body = {}) {
  const type = body.type || '';
  return { type, secret: body.secret, object: body.object || {} };
}

export function verifySecret(body) {
  const config = getVkConfig();
  if (!config.secret) return true;
  return body.secret === config.secret;
}

export function extractIncoming(object) {
  const message = object.message || {};
  const from = message.from_id || message.from || 0;
  return {
    peerId: message.peer_id || from,
    userId: from,
    vkMessageId: message.id != null ? String(message.id) : null,
    out: Boolean(message.out),
    text: message.text || '',
    date: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
    firstName: object.client_info?.first_name || '',
    lastName: object.client_info?.last_name || '',
  };
}

export async function getCommunityInfo() {
  const config = getVkConfig();
  if (!config.token || !config.groupId) {
    return {
      ok: true,
      simulated: true,
      name: config.communityName || 'Локон — студия красоты',
      id: config.communityId || '128452301',
      members: 4820,
      status: 'ok',
    };
  }
  try {
    const groups = await vkRequest('groups.getById', { group_ids: config.groupId });
    const group = groups[0];
    return { ok: true, name: group.name, id: String(group.id), members: 0, status: 'ok' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
