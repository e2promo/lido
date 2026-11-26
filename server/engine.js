import { db, getDialog, createDialog, addMessage, updateDialog, addLog, recordUsage, hasVkMessage } from './db.js';
import { getSetting, now, uid } from './util.js';
import { extractPhone, normalizePhone, formatPhone, isRefusal, refusalReason, isHandoff } from './phone.js';
import { generateReply, estimateTokens } from './ai.js';
import { getEconomicsConfig, calculateCost } from './economics.js';
import { sendMessage, getHistory } from './vk.js';
import { notify } from './notify.js';

export function buildContext(dialog, history) {
  const storedAi = getSetting(db, 'ai', {});
  return {
    agent: getSetting(db, 'agent', {}),
    ai: { ...storedAi, provider: storedAi.provider || process.env.AI_PROVIDER || 'demo' },
    knowledge: db.prepare('SELECT * FROM knowledge').all().map((r) => ({ ...r })),
    dialog: dialog || { stage: 'greeting', meta: '{}' },
    history: history || [],
    onError: (message) => addLog('error', 'Ошибка ИИ-провайдера: ' + message),
  };
}

function metaOf(dialog) {
  try { return JSON.parse(dialog?.meta || '{}'); } catch { return {}; }
}

export async function processIncoming({ dialog, text, history }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const classification = {
    phone: extractPhone(trimmed),
    refusal: isRefusal(trimmed),
    handoff: isHandoff(trimmed),
  };
  const ctx = buildContext(dialog, history);
  const meta = metaOf(dialog);
  let reply;
  let action = 'reply';
  let updates = {};
  let generated = null;

  if (classification.phone) {
    const phone = normalizePhone(classification.phone);
    reply = `Спасибо! Записала ${formatPhone(phone)}. ${ctx.agent.name || 'Менеджер'} перезвонит в течение 15 минут, чтобы подтвердить детали ✨`;
    action = 'phone';
    updates = {
      phone, status: 'contact_received', stage: 'done', phone_at: now(),
      refusal_reason: null, consent: 1, unread: 0,
      meta: JSON.stringify({ ...meta, consentAt: now(), source: 'vk' }),
    };
    addLog('success', `Получен номер телефона: ${dialog?.client_name || 'Клиент'} (${phone})`);
    notify('phone', { name: dialog?.client_name, phone, dialogId: dialog?.id }).catch(() => {});
  } else if (classification.handoff) {
    reply = `Конечно, передаю вас живому менеджеру. Он свяжется с вами в течение нескольких минут.`;
    action = 'handoff';
    updates = { status: 'handoff', stage: 'handoff', unread: 0 };
    addLog('info', `Диалог передан менеджеру: ${dialog?.client_name || 'Клиент'}`);
    notify('handoff', { name: dialog?.client_name, reason: trimmed }).catch(() => {});
  } else if (classification.refusal) {
    const result = await generateReply({ ...ctx, incoming: trimmed });
    generated = result;
    reply = `Понимаю вас, не буду настаивать 🙂 ${result.reply}`;
    if (/Оставьте номер|оставьте, пожалуйста|перезвоним и уточним/i.test(reply)) {
      reply = `Понимаю вас, не буду настаивать. Если появятся вопросы — просто напишите сюда, с радостью помогу 💜`;
    }
    action = 'refusal';
    const reason = refusalReason(trimmed);
    updates = { status: 'refused', stage: 'refused', refusal_reason: reason, unread: 0 };
    addLog('warn', `Отказ от номера: ${dialog?.client_name || 'Клиент'} — ${reason}`);
    notify('refusal', { name: dialog?.client_name, reason }).catch(() => {});
  } else {
    const result = await generateReply({ ...ctx, incoming: trimmed });
    generated = result;
    reply = result.reply;
    action = result.handoff ? 'handoff' : 'reply';
    const askCount = result.stage === 'ask_phone' ? (meta.askCount || 0) + 1 : (meta.askCount || 0);
    updates = {
      stage: result.stage,
      status: result.handoff ? 'handoff' : (dialog?.status === 'new' ? 'in_progress' : dialog?.status),
      meta: JSON.stringify({ ...meta, askCount, need: result.need, lastProvider: result.source }),
      unread: 0,
    };
    if (result.handoff) {
      notify('handoff', { name: dialog?.client_name, reason: 'ИИ передал диалог' }).catch(() => {});
    }
    if (!dialog?.first_reply_at) updates.first_reply_at = now();
  }

  const economics = getEconomicsConfig();
  const provider = economics.ai.provider || 'demo';
  const inputTokens = generated?.usage?.input ?? estimateTokens(JSON.stringify(history || []) + trimmed + JSON.stringify(ctx.agent || {}));
  const outputTokens = generated?.usage?.output ?? estimateTokens(reply);
  const cost = calculateCost(provider, inputTokens, outputTokens, economics.aiPricing);
  recordUsage({
    dialogId: dialog?.id || null,
    provider,
    model: economics.ai.model || 'Демо-движок',
    inputTokens,
    outputTokens,
    cost,
  });

  return { reply, action, phone: classification.phone ? normalizePhone(classification.phone) : null, updates, classification, usage: { provider, inputTokens, outputTokens, cost } };
}

export async function ingestIncoming(payload, { sendToVk = false } = {}) {
  const agent = getSetting(db, 'agent', {});
  const peerId = String(payload.peerId || payload.userId || 'unknown');
  if (payload.vkMessageId && hasVkMessage(payload.vkMessageId)) {
    return { dialog: db.prepare('SELECT * FROM dialogs WHERE peer_id = ?').get(peerId), duplicate: true };
  }

  let dialog = db.prepare('SELECT * FROM dialogs WHERE peer_id = ?').get(peerId);
  const isNew = !dialog;
  if (!dialog) {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') ||
      `Клиент ${String(peerId).slice(-4)}`;
    dialog = createDialog({
      id: uid('d_'),
      peer_id: peerId,
      vk_id: payload.userId ? `id${payload.userId}` : peerId,
      client_name: name,
      profile_url: payload.userId ? `https://vk.com/id${payload.userId}` : '#',
      status: 'new',
      created_at: payload.date || now(),
      last_message_at: payload.date || now(),
    });
  }

  if (isNew) {
    await importHistoryForDialog(dialog);
    updateDialog(dialog.id, { unread: 0 });
  }

  addMessage(dialog.id, 'in', dialog.client_name, payload.text, payload.date || now(),
    { action: 'incoming' }, { vkMessageId: payload.vkMessageId || null, delivered: true });
  dialog = getDialog(dialog.id);
  const history = db.prepare('SELECT direction, text FROM messages WHERE dialog_id = ? ORDER BY id').all(dialog.id)
    .map((row) => ({ ...row }));

  if (!agent.enabled || agent.mode === 'manual') {
    addLog('info', 'Агент выключен или ручной режим — ответ не отправлен', { dialogId: dialog.id });
    return { dialog, reply: null, action: 'manual' };
  }

  const result = await processIncoming({ dialog, text: payload.text, history });
  if (!result) return { dialog, reply: null, action: 'empty' };

  let sent = null;
  if (sendToVk) sent = await sendMessage(dialog.peer_id, result.reply);
  updateDialog(dialog.id, result.updates);
  addMessage(dialog.id, 'out', agent.name || 'Ассистент', result.reply, now(),
    { action: result.action }, {
      vkMessageId: sent?.messageId || null,
      delivered: sendToVk ? (sent?.ok ? 1 : 0) : 1,
      deliveryError: sent?.error || null,
    });
  return {
    dialog: getDialog(dialog.id), reply: result.reply, action: result.action,
    usage: result.usage, sentToVk: Boolean(sendToVk && sent?.ok),
  };
}

export async function importHistoryForDialog(dialog, count = 20) {
  try {
    const items = await getHistory(dialog.peer_id, count);
    const agent = getSetting(db, 'agent', {});
    let added = 0;
    for (const item of items) {
      if (hasVkMessage(item.vkMessageId)) continue;
      addMessage(dialog.id, item.out ? 'out' : 'in',
        item.out ? (agent.name || 'Сообщество') : dialog.client_name,
        item.text, item.date, { action: 'import' },
        { vkMessageId: item.vkMessageId, delivered: true });
      added++;
    }
    if (added) addLog('info', `Импортировано сообщений из ВК: ${added}`, { dialogId: dialog.id });
    return { ok: true, imported: added, total: items.length };
  } catch (err) {
    addLog('warn', 'Не удалось импортировать историю ВК: ' + err.message, { dialogId: dialog.id });
    return { ok: false, error: err.message };
  }
}

export async function ingestOutgoing(payload) {
  if (payload.vkMessageId && hasVkMessage(payload.vkMessageId)) {
    return { duplicate: true, dialog: db.prepare('SELECT * FROM dialogs WHERE peer_id = ?').get(String(payload.peerId)) };
  }
  const peerId = String(payload.peerId || payload.userId || 'unknown');
  let dialog = db.prepare('SELECT * FROM dialogs WHERE peer_id = ?').get(peerId);
  if (!dialog) {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || `Клиент ${String(peerId).slice(-4)}`;
    dialog = createDialog({
      id: uid('d_'), peer_id: peerId,
      vk_id: payload.userId ? `id${payload.userId}` : peerId,
      client_name: name,
      profile_url: payload.userId ? `https://vk.com/id${payload.userId}` : '#',
      status: 'in_progress',
      created_at: payload.date || now(), last_message_at: payload.date || now(),
    });
  }
  addMessage(dialog.id, 'out', payload.author || 'Сообщество', payload.text, payload.date || now(),
    { action: 'vk_out' }, { vkMessageId: payload.vkMessageId || null, delivered: true });
  updateDialog(dialog.id, { unread: 0, status: dialog.status === 'new' ? 'in_progress' : dialog.status });
  addLog('info', 'Сообщение от имени сообщества сохранено в переписке', { dialogId: dialog.id });
  return { dialog: getDialog(dialog.id) };
}

export async function simulateReply({ history, incoming }) {
  const classification = {
    phone: extractPhone(incoming),
    refusal: isRefusal(incoming),
    handoff: isHandoff(incoming),
  };
  if (classification.phone) {
    return {
      reply: `Спасибо! Записала ${formatPhone(normalizePhone(classification.phone))}. Менеджер перезвонит в течение 15 минут ✨`,
      action: 'phone', stage: 'done', phone: normalizePhone(classification.phone),
    };
  }
  const result = await generateReply({ ...buildContext(null, history || []), incoming });
  if (classification.handoff) {
    return { reply: 'Конечно, передаю вас живому менеджеру. Он свяжется в течение нескольких минут.', action: 'handoff', stage: 'handoff' };
  }
  if (classification.refusal) {
    return {
      reply: `Понимаю вас, не буду настаивать 🙂 Если появятся вопросы — напишите сюда, с радостью помогу 💜`,
      action: 'refusal', stage: 'refused', refusalReason: refusalReason(incoming),
    };
  }
  return { reply: result.reply, action: 'reply', stage: result.stage };
}
