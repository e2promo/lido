import { icon, esc, pct, money, api, toast } from '../lib.js';

let days = 14;
let data = null;
let periodLoading = false;
let loading = false;

function bars(daily) {
  const max = Math.max(1, ...daily.map((d) => d.dialogs));
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:170px;padding-top:10px">
    ${daily.map((d) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0">
      <div style="width:100%;height:${Math.max(3, (d.dialogs / max) * 130)}px;background:linear-gradient(180deg,#6d6de8,#5151c8);border-radius:6px 6px 2px 2px;position:relative" title="${d.dialogs} диалогов">
        <div style="position:absolute;bottom:0;width:100%;height:${d.dialogs ? (d.phones / d.dialogs) * 100 : 0}%;background:#00b894;border-radius:2px"></div></div>
      <span class="text-xs text-muted">${new Date(d.date).getDate()}</span></div>`).join('')}
  </div>`;
}

function donut(statuses) {
  const colors = { new: '#5b8def', in_progress: '#8b6de8', contact_received: '#00b894', refused: '#e25656', handoff: '#f5a623', closed: '#b8bdd0' };
  const total = statuses.reduce((s, x) => s + x.count, 0) || 1;
  let acc = 0;
  const stops = statuses.map((s) => {
    const from = (acc / total) * 360; acc += s.count;
    const to = (acc / total) * 360;
    return `${colors[s.status] || '#ccc'} ${from}deg ${to}deg`;
  }).join(', ');
  return `<div class="flex" style="gap:26px;align-items:center;flex-wrap:wrap">
    <div class="donut" style="background:conic-gradient(${stops})"><div class="donut-in"><b>${total}</b><span>диалогов</span></div></div>
    <div style="flex:1;min-width:160px">${statuses.map((s) => `<div class="legend-item"><i style="background:${colors[s.status] || '#ccc'}"></i><span>${({ new: 'Новые', in_progress: 'В работе', contact_received: 'Телефон получен', refused: 'Отказы', handoff: 'У менеджера', closed: 'Закрытые' })[s.status] || s.status}</span><span class="lv">${s.count}</span></div>`).join('')}</div>
  </div>`;
}

export function render() {
  const d = data;
  const t = d?.totals || {};
  return `
  <div class="page-head">
    <div><h2>Аналитика</h2><p>Насколько эффективно агент собирает контакты клиентов</p></div>
    <div class="page-actions">
      <select class="select" id="period" style="width:150px">${[[7, '7 дней'], [14, '14 дней'], [30, '30 дней']].map(([v, l]) => `<option value="${v}" ${days === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn" id="go-economics">${icon('wallet', 14)} Экономика ИИ</button><button class="btn" id="refresh-analytics">${icon('refresh', 14)} Обновить</button>
    </div>
  </div>
  ${periodLoading ? '<div class="card card-pad">Загрузка данных…</div>' : `
  <div class="grid g4 mb">
    <div class="kpi-card"><div class="kpi-top"><div class="kpi-ic">${icon('chat', 16)}</div><span class="kpi-trend">${days} дн.</span></div><div class="kpi-val">${t.dialogs || 0}</div><div class="kpi-name">Всего диалогов</div></div>
    <div class="kpi-card green"><div class="kpi-top"><div class="kpi-ic">${icon('phone', 16)}</div><span class="kpi-trend">+24%</span></div><div class="kpi-val">${t.phones || 0}</div><div class="kpi-name">Получено телефонов</div></div>
    <div class="kpi-card purple"><div class="kpi-top"><div class="kpi-ic">${icon('target', 16)}</div></div><div class="kpi-val">${pct(t.conversion || 0)}</div><div class="kpi-name">Конверсия в контакт</div></div>
    <div class="kpi-card orange"><div class="kpi-top"><div class="kpi-ic">${icon('clock', 16)}</div></div><div class="kpi-val">${t.avgMinutes || 0} мин</div><div class="kpi-name">Среднее время до номера</div></div>
  </div>

  <div class="grid g-2-1">
    <div class="card">
      <div class="card-head"><div><div class="card-title">${icon('chart', 15)} Динамика по дням</div><div class="card-sub">Синий — диалоги, зелёный — полученные номера</div></div></div>
      <div class="card-pad">${bars(d?.daily || [])}</div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('target', 15)} Статусы диалогов</div></div>
      <div class="card-pad">${donut(d?.statuses || [])}</div>
    </div>
  </div>

  <div class="grid g-2-1 mt">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('alert', 15)} Причины отказа от номера</div><span class="badge red">${t.refusals || 0} отказов</span></div>
      <div class="card-pad">
        ${(d?.refusals || []).map((r, i, arr) => `<div class="bar-row"><span class="bl" title="${esc(r.reason)}">${esc(r.reason)}</span><span class="track"><span style="width:${(r.count / Math.max(1, ...arr.map((x) => x.count))) * 100}%;background:linear-gradient(90deg,#ff8c8c,#e25656)"></span></span><span class="bv">${r.count}</span></div>`).join('') || '<div class="empty">Отказов нет — отличный результат!</div>'}
        <div class="hint mt">Отказы помогают улучшить сценарий: попробуйте чаще объяснять пользу звонка и не повторять просьбу более двух раз.</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('bot', 15)} Работа ИИ-агента</div></div>
      <div class="card-pad">
        <div class="toggle-row"><div><div class="t-title">Ответов отправлено</div><div class="t-desc">За выбранный период</div></div><b>${d?.ai?.replies || 0}</b></div>
        <div class="toggle-row"><div><div class="t-title">Доля автоматических ответов</div><div class="t-desc">Без участия менеджера</div></div><b>${pct(d?.ai?.autoRate || 0)}</b></div>
        <div class="toggle-row"><div><div class="t-title">Модель</div><div class="t-desc">Текущий провайдер ИИ</div></div><b class="text-sm">${esc(d?.ai?.model || 'Демо')}</b></div>
        <div class="toggle-row"><div><div class="t-title">Передано менеджерам</div><div class="t-desc">По просьбе клиента</div></div><b>${t.handoffs || 0}</b></div>
      </div>
    </div>
  </div>`}
  `;
}

export function bind(root, { refresh, rerender }) {
  const load = async () => {
    if (loading) return;
    loading = true;
    periodLoading = true;
    rerender();
    try { data = await api(`/api/analytics?days=${days}`); }
    finally { periodLoading = false; loading = false; }
    rerender();
  };
  root.querySelector('#go-economics').onclick = () => { location.hash = '#/economics'; };
  root.querySelector('#period').onchange = (e) => { days = Number(e.target.value); load(); };
  root.querySelector('#refresh-analytics').onclick = async () => { await load(); toast('Данные обновлены', 'ok'); };
  if (!data) load();
}
