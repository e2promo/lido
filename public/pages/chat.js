import { icon, esc, badge, avatar, avatarClass, fmtTime, fmtDate, api, toast, navigate } from '../lib.js';
import { dialogListHtml, bindDialogList, filteredDialogs } from './dialogs.js';

let loadedId = null;
let loaded = null;

async function load(id) {
  const data = await api(`/api/dialogs/${encodeURIComponent(id)}`);
  loadedId = id;
  loaded = data;
  if (data.dialog.unread) await api(`/api/dialogs/${id}`, { method: 'PATCH', body: { unread: 0 } });
  return data;
}

function messagesHtml(messages) {
  return messages.map((m) => {
    if (m.direction === 'system') return `<div class="msg system"><div class="bubble">${esc(m.text)}</div></div>`;
    let meta = {};
    try { meta = JSON.parse(m.meta || '{}'); } catch { /* ignore */ }
    const cls = m.author === 'Вы' || meta.action === 'manager' ? 'manager' : '';
    let delivery = '';
    if (m.direction === 'out' && m.delivered === 0) {
      delivery = `<div class="m-time" style="color:var(--danger)">Не доставлено в ВК${m.delivery_error ? ' · ' + esc(String(m.delivery_error).slice(0, 70)) : ''}</div>`;
    } else if (m.direction === 'out' && m.vk_message_id) {
      delivery = '<div class="m-time" style="color:var(--accent)">✓ Отправлено в ВК</div>';
    }
    return `<div class="msg ${m.direction} ${cls}"><div class="msg-author">${esc(m.author)}</div><div class="bubble">${esc(m.text)}</div><div class="m-time">${fmtTime(m.created_at)}</div>${delivery}</div>`;
  }).join('');
}

function leadPanel(dialog) {
  if (!dialog) return '';
  const consent = dialog.consent ? 'Согласие получено' : 'Нет согласия';
  return `<div class="lp-avatar">${avatar(dialog.client_name, avatarClass(dialog.client_name))}
    <b style="font-size:14px">${esc(dialog.client_name)}</b>
    <a class="text-xs" href="${esc(dialog.profile_url)}" target="_blank">${esc(dialog.vk_id)} ${icon('external', 10)}</a>
    ${badge(dialog.status)}</div>
  <div class="lp-block"><h5>Контакт</h5>
    ${dialog.phone ? `<div class="lp-phone">📞 ${esc(dialog.phone)}</div>` : '<div class="lp-empty">Телефон пока не получен</div>'}
    <div class="lp-row"><span>Согласие на обработку</span><span style="color:${dialog.consent ? 'var(--accent)' : 'var(--danger)'}">${consent}</span></div>
  </div>
  <div class="lp-block"><h5>Информация</h5>
    <div class="lp-row"><span>Источник</span><span>${esc(dialog.source)}</span></div>
    <div class="lp-row"><span>Обращение</span><span>${fmtDate(dialog.created_at)}</span></div>
    <div class="lp-row"><span>Менеджер</span><span>${esc(dialog.manager || 'Не назначен')}</span></div>
    <div class="lp-row"><span>Этап агента</span><span>${esc(dialog.stage)}</span></div>
    ${dialog.refusal_reason ? `<div class="lp-row"><span>Причина отказа</span><span style="color:var(--danger)">${esc(dialog.refusal_reason)}</span></div>` : ''}
  </div>
  <div class="lp-block"><h5>Заметки</h5><textarea class="lp-notes" id="lp-notes">${esc(dialog.notes || '')}</textarea>
    <button class="btn sm mt" id="save-notes" style="width:100%;justify-content:center">${icon('check', 13)} Сохранить заметку</button></div>
  <button class="btn primary" id="open-lead" style="width:100%;justify-content:center">${icon('user', 14)} Открыть карточку лида</button>`;
}

export function render(ctx) {
  const { state } = ctx;
  const id = state.selectedDialogId;
  const dialog = state.dialogs?.find((d) => d.id === id);
  const current = loadedId === id ? loaded : (dialog ? { dialog, messages: [] } : null);
  return `
  <div class="page-head">
    <div><h2>Переписка с клиентом</h2><p>История сообщений и карточка клиента</p></div>
    <div class="page-actions"><button class="btn" data-back>${icon('back', 14)} К списку диалогов</button></div>
  </div>
  <div class="dialogs-layout ${current ? 'show-lead' : ''}" id="chat-layout">
    ${dialogListHtml(filteredDialogs(state), id, state.dialogQuery)}
    <div class="chat">
      <div class="chat-head">
        ${avatar(dialog?.client_name || 'Клиент', avatarClass(dialog?.client_name || ''))}
        <div><div class="ch-name">${esc(dialog?.client_name || 'Выберите диалог')}</div>
          <div class="ch-sub">${dialog ? `${esc(dialog.vk_id)} · ${esc(dialog.source)} · ${fmtDate(dialog.created_at)}` : 'Выберите клиента слева'}</div></div>
        ${dialog ? `<div class="page-actions">${badge(dialog.status)}<button class="btn sm" id="sync-history" title="Подтянуть сообщения из сообщества">${icon('refresh', 13)} История ВК</button><a class="btn sm" href="${esc(dialog.profile_url)}" target="_blank">${icon('external', 13)} Профиль ВК</a></div>` : ''}
      </div>
      <div class="messages" id="chat-messages">${current?.messages?.length ? messagesHtml(current.messages) : '<div class="empty"><div class="em-ic">💬</div><h4>Загружаем переписку…</h4></div>'}</div>
      <div class="composer"><div class="composer-box">
        <textarea id="chat-input" placeholder="Напишите ответ от имени сообщества…"></textarea>
        <button class="send" id="chat-send" title="Отправить">${icon('send', 17)}</button>
      </div><div class="hint mt">Ответ отправляется от имени сообщества. Клиент увидит его в ВКонтакте.</div></div>
    </div>
    <div class="lead-panel" id="lead-panel">${dialog ? leadPanel(current?.dialog || dialog) : ''}</div>
  </div>`;
}

export function bind(root, ctx) {
  const { state, refresh, rerender } = ctx;
  const id = state.selectedDialogId;
  root.querySelector('[data-back]').onclick = () => navigate('dialogs');
  bindDialogList(root, ctx);

  if (!id) return;
  load(id).then((data) => {
    const msgs = document.getElementById('chat-messages');
    const panel = document.getElementById('lead-panel');
    if (msgs) { msgs.innerHTML = messagesHtml(data.messages); msgs.scrollTop = msgs.scrollHeight; }
    if (panel) panel.innerHTML = leadPanel(data.dialog);
    bindLeadActions(ctx);
  }).catch((e) => toast(e.message, 'err'));

  const send = async () => {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    const sent = await api(`/api/dialogs/${id}/messages`, { method: 'POST', body: { text, author: 'Вы' } });
    input.value = '';
    toast(sent.sentToVk ? 'Сообщение отправлено в ВК и сохранено' : 'Сохранено локально: доставить в ВК не удалось', sent.sentToVk ? 'ok' : 'err');
    const data = await load(id);
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = messagesHtml(data.messages);
    msgs.scrollTop = msgs.scrollHeight;
    await refresh();
  };
  const syncBtn = document.getElementById('sync-history');
  if (syncBtn) syncBtn.onclick = async () => {
    syncBtn.disabled = true;
    try {
      const res = await api(`/api/vk/import-history/${id}`, { method: 'POST', body: {} });
      toast(res.ok ? `Импортировано сообщений: ${res.imported}` : (res.error || 'Ошибка импорта'), res.ok ? 'ok' : 'err');
      if (res.ok) { const data = await load(id); const msgs = document.getElementById('chat-messages'); msgs.innerHTML = messagesHtml(data.messages); msgs.scrollTop = msgs.scrollHeight; }
    } catch (e) { toast(e.message, 'err'); }
    syncBtn.disabled = false;
  };
  document.getElementById('chat-send').onclick = send;
  document.getElementById('chat-input').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };
  bindLeadActions(ctx);
}

function bindLeadActions(ctx) {
  const notes = document.getElementById('save-notes');
  if (notes) notes.onclick = async () => {
    await api(`/api/dialogs/${ctx.state.selectedDialogId}`, { method: 'PATCH', body: { notes: document.getElementById('lp-notes').value } });
    toast('Заметка сохранена', 'ok');
    await ctx.refresh();
  };
  const open = document.getElementById('open-lead');
  if (open) open.onclick = () => navigate('lead', ctx.state.selectedDialogId);
}
