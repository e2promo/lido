import { getSetting } from './util.js';
import { db, addLog } from './db.js';

const EMOJI = {
  phone: '📞',
  handoff: '🙋',
  refusal: '⚠️',
  error: '🚨',
  digest: '📊',
};

export async function notify(event, payload = {}) {
  const config = getSetting(db, 'notifications', {});
  const telegram = config.telegram || {};
  const token = process.env.TELEGRAM_BOT_TOKEN || telegram.botToken;
  const chatId = process.env.TELEGRAM_CHAT_ID || telegram.chatId;
  const enabled = telegram.enabled || Boolean(process.env.TELEGRAM_BOT_TOKEN);
  addLog('info', `Событие уведомления: ${event}`, payload);
  if (!enabled || !token || !chatId) return { sent: false, reason: 'Telegram не настроен' };

  const lines = {
    phone: `Новый контакт: ${payload.name || 'Клиент'}\nТелефон: ${payload.phone || '—'}\nДиалог: ${payload.dialogId || '—'}`,
    handoff: `Диалог передан менеджеру: ${payload.name || 'Клиент'}\nПричина: ${payload.reason || 'Запрос клиента'}`,
    refusal: `Клиент не оставил номер: ${payload.name || 'Клиент'}\nПричина: ${payload.reason || '—'}`,
    error: `Ошибка в работе агента: ${payload.message || '—'}`,
    digest: `Сводка за день: новых диалогов — ${payload.dialogs ?? 0}, телефонов — ${payload.phones ?? 0}.`,
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${EMOJI[event] || '🔔'} Лидо\n${lines[event] || JSON.stringify(payload)}`,
        parse_mode: 'HTML',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { sent: true };
  } catch (err) {
    addLog('error', 'Не удалось отправить уведомление в Telegram: ' + err.message);
    return { sent: false, error: err.message };
  }
}
