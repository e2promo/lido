import { icon, esc, badge, avatar, avatarClass, timeAgo, fmtDate, money, pct, navigate, toast } from '../lib.js';

function lineChart(daily) {
  const data = daily.slice(-7);
  const max = Math.max(1, ...data.map((d) => d.dialogs));
  const w = 640, h = 190, pad = 26;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
  const y = (v) => h - 26 - (v / max) * (h - 52);
  const p1 = data.map((d, i) => `${x(i)},${y(d.dialogs)}`).join(' ');
  const p2 = data.map((d, i) => `${x(i)},${y(d.phones)}`).join(' ');
  const area = `${pad},${h - 26} ${p1} ${x(data.length - 1)},${h - 26}`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5b5bd6" stop-opacity=".22"/><stop offset="100%" stop-color="#5b5bd6" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75, 1].map((r) => `<line x1="${pad}" y1="${y(max * r)}" x2="${w - pad}" y2="${y(max * r)}" stroke="#eef0f6" stroke-dasharray="4 5"/>`).join('')}
    <polygon points="${area}" fill="url(#gradArea)"/>
    <polyline points="${p1}" fill="none" stroke="#5b5bd6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${p2}" fill="none" stroke="#00b894" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.dialogs)}" r="4" fill="#fff" stroke="#5b5bd6" stroke-width="2.5"/><text x="${x(i)}" y="${h - 7}" text-anchor="middle" font-size="10" fill="#9299ac">${new Date(d.date).getDate()}</text>`).join('')}
  </svg>`;
}

export function render({ state }) {
  const a = state.dashboard?.analytics || { totals: {}, daily: [], statuses: [] };
  const t = a.totals || {};
  const agent = state.settings.agent || {};
  const vk = state.settings.vk || {};
  const online = agent.enabled !== false;
  const recent = state.dashboard?.recent || [];

  return `
  <div class="page-head">
    <div><h2>Добрый день, ${esc((state.user?.name || '').split(' ')[0])} 👋</h2><p>Вот что происходит в вашем сообществе сегодня · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p></div>
    <div class="page-actions">
      <button class="btn" data-go="testing">${icon('flask', 15)} Проверить агента</button>
      <button class="btn primary" data-go="agent">${icon('settings', 15)} Настроить агента</button>
    </div>
  </div>

  <div class="banner ${vk.connected && online ? 'ok' : 'warn'} mb">
    <div class="b-ic">${vk.connected && online ? '✅' : '⚠️'}</div>
    <div><b>${vk.connected ? 'Сообщество подключено' : 'Подключите сообщество ВКонтакте'}</b>
      <span>${vk.connected && online ? `${esc(vk.communityName || '')} · агент «${esc(agent.name || '')}» отвечает клиентам автоматически` : 'Агент сейчас не отвечает клиентам — проверьте подключение или включите его'}</span></div>
    <button class="btn sm" data-go="${vk.connected ? 'agent' : 'vk'}">${vk.connected ? 'Открыть настройки' : 'Подключить'}</button>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-top"><div class="kpi-ic">${icon('chat', 17)}</div><span class="kpi-trend">+18%</span></div><div class="kpi-val">${t.dialogs || 0}</div><div class="kpi-name">Входящих диалогов за 7 дней</div></div>
    <div class="kpi-card green"><div class="kpi-top"><div class="kpi-ic">${icon('phone', 17)}</div><span class="kpi-trend">+24%</span></div><div class="kpi-val">${t.phones || 0}</div><div class="kpi-name">Получено номеров телефонов</div></div>
    <div class="kpi-card purple"><div class="kpi-top"><div class="kpi-ic">${icon('target', 17)}</div><span class="kpi-trend">${t.conversion >= 40 ? 'хорошо' : 'растёт'}</span></div><div class="kpi-val">${pct(t.conversion || 0)}</div><div class="kpi-name">Конверсия из диалога в контакт</div></div>
    <div class="kpi-card orange"><div class="kpi-top"><div class="kpi-ic">${icon('clock', 17)}</div><span class="kpi-trend down">−2 мин</span></div><div class="kpi-val">${t.avgMinutes || 0} мин</div><div class="kpi-name">Среднее время до телефона</div></div>
  </div>

  <div class="grid g-2-1 mt">
    <div class="card">
      <div class="card-head"><div><div class="card-title">${icon('chart', 15)} Динамика обращений</div><div class="card-sub">Диалоги и полученные контакты за последние 7 дней</div></div>
        <div class="chart-legend"><span><i style="background:#5b5bd6"></i>Диалоги</span><span><i style="background:#00b894"></i>Телефоны</span></div></div>
      <div class="card-pad">${lineChart(a.daily || [])}</div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('zap', 15)} Как работает агент</div><span class="badge purple">${esc(agent.name || 'Ассистент')}</span></div>
      <div class="card-pad">
        <div class="step-list">
          <div class="step done"><div class="step-n">1</div><div><b>Приветствует клиента</b><p>Сразу отвечает на обращение</p></div></div>
          <div class="step done"><div class="step-n">2</div><div><b>Выявляет потребность</b><p>Уточняет, что интересует</p></div></div>
          <div class="step done"><div class="step-n">3</div><div><b>Отвечает по базе знаний</b><p>Цены, услуги, часы работы</p></div></div>
          <div class="step"><div class="step-n">4</div><div><b>Просит номер аккуратно</b><p>Объясняет пользу звонка</p></div></div>
          <div class="step"><div class="step-n">5</div><div><b>Сохраняет лид</b><p>Уведомляет вас в Telegram</p></div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="grid g-2-1 mt">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('message', 15)} Последние диалоги</div><button class="btn ghost sm" data-go="dialogs">Все диалоги ${icon('arrow', 13)}</button></div>
      <div class="table-wrap"><table><thead><tr><th>Клиент</th><th>Статус</th><th>Сообщение</th><th>Время</th></tr></thead><tbody>
      ${recent.map((d) => `<tr data-dialog="${d.id}" style="cursor:pointer">
        <td><div class="t-client">${avatar(d.client_name, avatarClass(d.client_name))}<span class="truncate" style="max-width:130px">${esc(d.client_name)}</span></div></td>
        <td>${badge(d.status)}</td>
        <td class="text-muted truncate" style="max-width:220px">${d.phone ? esc(d.phone) : (d.unread ? 'Новое сообщение' : '—')}</td>
        <td class="text-muted nowrap">${timeAgo(d.last_message_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Диалогов пока нет</td></tr>'}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('wallet', 15)} Ваш тариф</div><span class="badge purple">${esc(state.settings.billing?.tariffName || 'Профессиональный')}</span></div>
      <div class="card-pad">
        <div class="flex between mb"><span class="text-muted text-sm">Использовано сообщений</span><b class="text-sm">${state.settings.billing?.messagesUsed || 0} / ${state.settings.billing?.messagesLimit || 0}</b></div>
        <div class="progress mb"><span style="width:${Math.min(100, ((state.settings.billing?.messagesUsed || 0) / (state.settings.billing?.messagesLimit || 1)) * 100)}%"></span></div>
        <div class="flex between text-sm"><span class="text-muted">Следующее списание</span><b>${esc(state.settings.billing?.nextPayment || '—')}</b></div>
        <div class="flex between text-sm mt"><span class="text-muted">Стоимость диалога</span><b>≈ ${money(state.settings.billing?.costPerDialog || 0)}</b></div>
        <button class="btn mt" style="width:100%;justify-content:center" data-go="settings">Управление тарифом</button>
      </div>
    </div>
  </div>`;
}

export function bind(root, { state }) {
  root.querySelectorAll('[data-go]').forEach((el) => el.onclick = () => navigate(el.dataset.go));
  root.querySelectorAll('[data-dialog]').forEach((el) => el.onclick = () => navigate('chat', el.dataset.dialog));
}
