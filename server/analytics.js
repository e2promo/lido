import { db } from './db.js';
import { plainAll, getSetting } from './util.js';

function p(key) {
  return db.prepare(key);
}

export function getAnalytics(days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const row = db.prepare(`SELECT
    COUNT(*) AS dialogs,
    SUM(CASE WHEN status != 'new' THEN 1 ELSE 0 END) AS processed,
    SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) AS phones,
    SUM(CASE WHEN status = 'refused' THEN 1 ELSE 0 END) AS refusals,
    SUM(CASE WHEN status = 'handoff' THEN 1 ELSE 0 END) AS handoffs,
    AVG(CASE WHEN phone_at IS NOT NULL THEN (julianday(phone_at) - julianday(created_at)) * 1440 END) AS avgMinutes
    FROM dialogs WHERE created_at >= ?`).get(since);

  const totals = {
    dialogs: row.dialogs || 0,
    processed: row.processed || 0,
    phones: row.phones || 0,
    refusals: row.refusals || 0,
    handoffs: row.handoffs || 0,
    conversion: row.dialogs ? Math.round(((row.phones || 0) / row.dialogs) * 1000) / 10 : 0,
    avgMinutes: row.avgMinutes ? Math.round(row.avgMinutes) : 0,
  };

  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const r = db.prepare(`SELECT COUNT(*) AS dialogs,
      SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) AS phones
      FROM dialogs WHERE substr(created_at, 1, 10) = ?`).get(d);
    daily.push({ date: d, dialogs: r.dialogs || 0, phones: r.phones || 0 });
  }

  const statuses = plainAll(db.prepare(`SELECT status, COUNT(*) AS count FROM dialogs GROUP BY status ORDER BY count DESC`).all());
  const refusals = plainAll(db.prepare(`SELECT refusal_reason AS reason, COUNT(*) AS count
    FROM dialogs WHERE refusal_reason IS NOT NULL GROUP BY refusal_reason ORDER BY count DESC`).all());
  const funnel = plainAll(db.prepare(`SELECT stage, COUNT(*) AS count FROM dialogs GROUP BY stage`).all());

  const aiReplies = db.prepare(`SELECT COUNT(*) AS count FROM messages
    WHERE direction = 'out' AND author NOT IN ('Система') AND json_extract(meta, '$.action') IS NOT NULL`).get().count;
  const allOut = db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE direction = 'out'`).get().count;
  const providers = plainAll(db.prepare(`SELECT json_extract(meta, '$.lastProvider') AS provider, COUNT(*) AS count
    FROM dialogs GROUP BY provider`).all());

  const billing = getSetting(db, 'billing', {});

  return {
    totals,
    daily,
    statuses,
    refusals,
    funnel,
    ai: {
      replies: aiReplies,
      totalOut: allOut,
      autoRate: allOut ? Math.round((aiReplies / allOut) * 100) : 0,
      providers,
      model: getSetting(db, 'ai', {}).model || 'Демо-движок',
    },
    billing: {
      messagesUsed: billing.messagesUsed || 0,
      messagesLimit: billing.messagesLimit || 0,
      costPerDialog: billing.costPerDialog || 0,
    },
  };
}

export function getDashboard() {
  const analytics = getAnalytics(7);
  const recent = plainAll(db.prepare(`SELECT id, client_name, status, phone, last_message_at, unread
    FROM dialogs ORDER BY last_message_at DESC LIMIT 6`).all());
  const newCount = db.prepare(`SELECT COUNT(*) AS c FROM dialogs WHERE unread > 0`).get().c;
  const agent = getSetting(db, 'agent', {});
  const vk = getSetting(db, 'vk', {});
  return {
    analytics,
    recent,
    newCount,
    agent: { name: agent.name, enabled: agent.enabled, mode: agent.mode, style: agent.style },
    vk: {
      connected: vk.connected,
      communityName: vk.communityName,
      status: vk.status,
      tokenConfigured: Boolean(process.env.VK_GROUP_TOKEN || vk.token),
    },
  };
}
