import { icon, esc, badge, avatar, avatarClass, fmtDate, timeAgo, api, toast, copyText, navigate } from '../lib.js';

export function render({ state }) {
  const id = state.selectedDialogId;
  const d = state.dialogs?.find((x) => x.id === id);
  if (!d) return `<div class="card card-pad"><div class="empty"><h4>Лид не найден</h4><button class="btn mt" data-back>Вернуться к диалогам</button></div></div>`;

  const timeline = [
    { t: d.created_at, title: 'Клиент написал в сообщество', desc: 'Источник: ' + d.source, done: true },
    { t: d.first_reply_at, title: 'ИИ-агент ответил первым', desc: 'Приветствие и выявление потребности', done: Boolean(d.first_reply_at) },
    d.phone_at ? { t: d.phone_at, title: 'Номер телефона получен', desc: d.phone, done: true } : null,
    d.status === 'handoff' ? { t: d.last_message_at, title: 'Диалог передан менеджеру', desc: d.manager || 'Не назначен', done: true } : null,
  ].filter(Boolean);

  return `
  <div class="page-head">
    <div><button class="btn ghost sm" data-back>${icon('back', 14)} К диалогам</button><h2 class="mt">Карточка лида</h2><p>Вся информация о клиенте и история взаимодействия</p></div>
    <div class="page-actions">
      ${d.phone ? `<a class="btn accent" href="tel:${esc(d.phone.replace(/\D/g, ''))}">${icon('phone', 14)} Позвонить</a><button class="btn" id="copy-phone">${icon('copy', 14)} Скопировать номер</button>` : ''}
      <button class="btn" id="export-lead">${icon('download', 14)} Экспорт</button>
    </div>
  </div>

  <div class="card mb">
    <div class="card-pad" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div class="avatar ${avatarClass(d.client_name)}" style="width:60px;height:60px;font-size:19px">${esc((d.client_name || '?').slice(0, 2).toUpperCase())}</div>
      <div style="flex:1;min-width:200px"><div style="font-size:19px;font-weight:800">${esc(d.client_name)}</div>
        <div class="flex mt" style="gap:10px"><a href="${esc(d.profile_url)}" target="_blank" class="text-sm">${esc(d.vk_id)} ${icon('external', 12)}</a>${badge(d.status)}<span class="text-sm text-muted">Обращение ${timeAgo(d.created_at)}</span></div></div>
      <div style="text-align:right">${d.phone ? `<div style="font-size:20px;font-weight:800;color:var(--accent)">${esc(d.phone)}</div><div class="text-xs text-muted">Телефон клиента</div>` : '<div class="lp-empty">Телефон не получен</div>'}</div>
    </div>
  </div>

  <div class="grid g-2-1">
    <div>
      <div class="card">
        <div class="card-head"><div class="card-title">${icon('edit', 15)} Данные лида</div><button class="btn primary sm" id="save-lead">${icon('check', 14)} Сохранить изменения</button></div>
        <div class="card-pad">
          <div class="grid g2">
            <div class="field"><label>Имя клиента</label><input class="input" id="l-name" value="${esc(d.client_name)}" /></div>
            <div class="field"><label>Номер телефона</label><input class="input" id="l-phone" value="${esc(d.phone || '')}" placeholder="+7 (999) 000-00-00" /></div>
            <div class="field"><label>Статус лида</label><select class="select" id="l-status">
              ${[['new', 'Новый'], ['in_progress', 'В работе'], ['contact_received', 'Телефон получен'], ['refused', 'Отказ'], ['handoff', 'У менеджера'], ['closed', 'Закрыт']].map(([v, l]) => `<option value="${v}" ${d.status === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
            <div class="field"><label>Ответственный менеджер</label><select class="select" id="l-manager">
              ${['Не назначен', 'Мария Соколова', 'Алексей Иванов', 'Анастасия Волкова'].map((m) => `<option ${d.manager === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select></div>
          </div>
          <div class="field mt"><label>Заметка о клиенте</label><textarea class="textarea" id="l-notes">${esc(d.notes || '')}</textarea></div>
          ${d.refusal_reason ? `<div class="banner warn mt"><div class="b-ic">⚠️</div><div><b>Причина отказа от телефона</b><span>${esc(d.refusal_reason)}</span></div></div>` : ''}
        </div>
      </div>

      <div class="card mt">
        <div class="card-head"><div class="card-title">${icon('clock', 15)} История взаимодействий</div></div>
        <div class="card-pad"><div class="step-list">
          ${timeline.map((t) => `<div class="step ${t.done ? 'done' : ''}"><div class="step-n">${t.done ? icon('check', 13) : '·'}</div><div><b>${esc(t.title)}</b><p>${esc(t.desc)} · ${fmtDate(t.t)}</p></div></div>`).join('')}
        </div></div>
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-head"><div class="card-title">${icon('shield', 15)} Согласие и безопасность</div></div>
        <div class="card-pad">
          <div class="toggle-row"><div><div class="t-title">Согласие на обработку</div><div class="t-desc">152-ФЗ «О персональных данных»</div></div><span class="badge ${d.consent ? 'green' : 'red'}">${d.consent ? 'Получено' : 'Нет'}</span></div>
          <div class="toggle-row"><div><div class="t-title">Источник контакта</div><div class="t-desc">Клиент оставил номер добровольно</div></div><span class="text-sm strong">${esc(d.source)}</span></div>
          <div class="toggle-row"><div><div class="t-title">Срок хранения</div><div class="t-desc">Согласно политике конфиденциальности</div></div><span class="text-sm strong">90 дней</span></div>
          <div class="hint mt">Номер телефона используется только для связи по вашему обращению и не передаётся третьим лицам.</div>
        </div>
      </div>
      <div class="card mt">
        <div class="card-head"><div class="card-title">${icon('message', 15)} Быстрые действия</div></div>
        <div class="card-pad" style="display:grid;gap:8px">
          <button class="btn" id="go-chat" style="justify-content:center">${icon('chat', 14)} Открыть переписку</button>
          <button class="btn" id="resend" style="justify-content:center">${icon('refresh', 14)} Вернуть агента в диалог</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function bind(root, { state, refresh }) {
  const d = state.dialogs.find((x) => x.id === state.selectedDialogId);
  if (!d) { root.querySelector('[data-back]').onclick = () => navigate('dialogs'); return; }
  root.querySelector('[data-back]').onclick = () => navigate('dialogs');
  root.querySelector('#go-chat').onclick = () => navigate('chat', d.id);
  root.querySelector('#copy-phone')?.addEventListener('click', () => copyText(d.phone));
  root.querySelector('#export-lead').onclick = () => {
    const data = [['Имя', 'Телефон', 'Статус', 'Менеджер', 'Источник', 'Дата'],
      [d.client_name, d.phone || '', d.status, d.manager || '', d.source, d.created_at]];
    const csv = '\uFEFF' + data.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `lid_${d.vk_id}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Лид экспортирован в CSV', 'ok');
  };
  root.querySelector('#save-lead').onclick = async () => {
    await api(`/api/dialogs/${d.id}`, { method: 'PATCH', body: {
      client_name: document.getElementById('l-name').value,
      phone: document.getElementById('l-phone').value || null,
      status: document.getElementById('l-status').value,
      manager: document.getElementById('l-manager').value === 'Не назначен' ? null : document.getElementById('l-manager').value,
      notes: document.getElementById('l-notes').value,
    } }).catch((e) => toast(e.message, 'err'));
    toast('Карточка лида обновлена', 'ok');
    await refresh();
  };
  root.querySelector('#resend').onclick = async () => {
    await api(`/api/dialogs/${d.id}`, { method: 'PATCH', body: { status: 'in_progress', stage: 'need' } });
    toast('Агент снова подключён к диалогу', 'ok');
    await refresh();
  };
}
