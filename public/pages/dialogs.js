import { icon, esc, badge, avatar, avatarClass, timeAgo, api, toast, navigate } from '../lib.js';

let statusFilter = 'all';
let phoneFilter = 'all';
let sort = 'recent';
let localQuery = '';

export function dialogListHtml(dialogs, activeId, query = '') {
  return `<div class="dlist">
    <div class="dlist-head">
      <div class="search-box" style="width:100%;display:flex">${icon('search', 15)}<input id="dl-search" value="${esc(query)}" placeholder="Поиск по имени или телефону…" /></div>
      <div class="chip-row">
        ${[['all', 'Все'], ['new', 'Новые'], ['in_progress', 'В работе'], ['contact_received', 'Телефон получен'], ['refused', 'Отказы']].map(([id, label]) => `<button class="chip ${statusFilter === id ? 'active' : ''}" data-status="${id}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="dlist-body">
      ${dialogs.map((d) => {
        const last = d.phone ? `📞 ${d.phone}` : (d.status === 'refused' ? 'Клиент отказался оставить номер' : (d.status === 'handoff' ? 'Передано менеджеру' : 'Ожидает ответа'));
        return `<div class="ditem ${activeId === d.id ? 'active' : ''}" data-open="${d.id}">
          ${avatar(d.client_name, avatarClass(d.client_name))}
          <div class="ditem-body"><div class="ditem-top"><span class="ditem-name">${esc(d.client_name)}</span><span class="ditem-time">${timeAgo(d.last_message_at)}</span></div>
          <div class="ditem-text">${esc(last)}</div>
          <div class="ditem-bottom">${badge(d.status)}${d.unread ? '<span class="unread-dot"></span>' : ''}</div></div>
        </div>`;
      }).join('') || '<div class="empty"><div class="em-ic">💬</div><h4>Диалогов нет</h4><p>Попробуйте изменить фильтры</p></div>'}
    </div>
  </div>`;
}

export function filteredDialogs(state) {
  let list = [...(state.dialogs || [])];
  if (statusFilter !== 'all') list = list.filter((d) => d.status === statusFilter);
  if (phoneFilter !== 'all') list = list.filter((d) => phoneFilter === 'yes' ? Boolean(d.phone) : !d.phone);
  const q = localQuery || state.dialogQuery || '';
  if (q) list = list.filter((d) => (d.client_name + (d.phone || '')).toLowerCase().includes(q.toLowerCase()));
  if (sort === 'old') list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  else if (sort === 'name') list.sort((a, b) => a.client_name.localeCompare(b.client_name, 'ru'));
  else list.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  return list;
}

export function bindDialogList(root, { refresh, rerender }) {
  root.querySelectorAll('[data-status]').forEach((el) => el.onclick = () => { statusFilter = el.dataset.status; rerender(); });
  const search = root.querySelector('#dl-search');
  if (search) {
    search.oninput = (e) => { localQuery = e.target.value; const pos = search.selectionStart; rerender(); const s = document.getElementById('dl-search'); s?.focus(); s?.setSelectionRange(pos, pos); };
  }
  root.querySelectorAll('[data-open]').forEach((el) => el.onclick = () => navigate('chat', el.dataset.open));
}

export function render(ctx) {
  const { state, refresh, rerender } = ctx;
  const list = filteredDialogs(state);
  return `
  <div class="page-head">
    <div><h2>Диалоги</h2><p>${state.dialogs?.length || 0} обращений · ${state.dialogs?.filter((d) => d.phone).length || 0} с номером телефона</p></div>
    <div class="page-actions">
      <select class="select" id="phone-filter" style="width:180px"><option value="all">Все контакты</option><option value="yes" ${phoneFilter === 'yes' ? 'selected' : ''}>С телефоном</option><option value="no" ${phoneFilter === 'no' ? 'selected' : ''}>Без телефона</option></select>
      <select class="select" id="sort" style="width:180px"><option value="recent">Сначала новые</option><option value="old" ${sort === 'old' ? 'selected' : ''}>Сначала старые</option><option value="name" ${sort === 'name' ? 'selected' : ''}>По имени</option></select>
      <button class="btn" id="simulate-btn">${icon('play', 14)} Симулировать обращение</button>
    </div>
  </div>

  <div class="card">
    <div class="table-wrap"><table><thead><tr><th>Клиент</th><th>Статус</th><th>Телефон</th><th>Менеджер</th><th>Источник</th><th>Первое обращение</th><th>Последнее сообщение</th><th></th></tr></thead><tbody>
      ${list.map((d) => `<tr data-open="${d.id}" style="cursor:pointer">
        <td><div class="t-client">${avatar(d.client_name, avatarClass(d.client_name))}<div><div class="truncate" style="max-width:150px">${esc(d.client_name)}</div><a class="text-xs" href="${esc(d.profile_url)}" target="_blank" onclick="event.stopPropagation()">${esc(d.vk_id)} ${icon('external', 10)}</a></div></div></td>
        <td>${badge(d.status)}</td><td>${d.phone ? `<b class="text-sm">${esc(d.phone)}</b>` : '<span class="text-muted">—</span>'}</td>
        <td class="text-sm">${esc(d.manager || 'Не назначен')}</td><td class="text-sm text-muted">${esc(d.source)}</td>
        <td class="text-sm text-muted nowrap">${timeAgo(d.created_at)}</td><td class="text-sm text-muted nowrap">${timeAgo(d.last_message_at)}</td>
        <td><button class="btn ghost sm" data-open="${d.id}">${icon('arrow', 14)}</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><div class="em-ic">🔍</div><h4>Диалоги не найдены</h4><p>Измените фильтры или поиск</p></div></td></tr>'}
    </tbody></table></div>
  </div>`;
}

export function bind(root, ctx) {
  root.querySelector('#phone-filter').onchange = (e) => { phoneFilter = e.target.value; ctx.rerender(); };
  root.querySelector('#sort').onchange = (e) => { sort = e.target.value; ctx.rerender(); };
  root.querySelectorAll('[data-open]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); navigate('chat', el.dataset.open); });
  root.querySelector('#simulate-btn').onclick = async () => {
    const phrases = ['Здравствуйте! Сколько стоит стрижка?', 'Добрый день, есть время на завтра?', 'Мне нужно поговорить с менеджером', 'Не хочу оставлять номер'];
    const text = phrases[Math.floor(Math.random() * phrases.length)];
    const res = await api('/api/demo/incoming', { method: 'POST', body: { text, firstName: 'Тестовый', lastName: 'Клиент' } });
    toast(`Ответ агента: ${res.reply.slice(0, 60)}…`, 'ok');
    await ctx.refresh();
  };
}
