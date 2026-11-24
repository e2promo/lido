import { icon, esc, money, api, toast, navigate, fmtDate } from '../lib.js';

let calc = null;
let lastParams = null;

function resultHtml(r) {
  if (!r) return '<div class="empty">Расчёт выполняется…</div>';
  return `
  <div class="big-stat mb">
    <div class="kpi-card"><div class="kpi-top"><div class="kpi-ic">${icon('wallet', 16)}</div></div><div class="kpi-val" style="font-size:23px">${money(r.totalCost)}</div><div class="kpi-name">Затраты на ИИ в месяц</div></div>
    <div class="kpi-card green"><div class="kpi-top"><div class="kpi-ic">${icon('chat', 16)}</div></div><div class="kpi-val" style="font-size:23px">${money(r.costPerDialog)}</div><div class="kpi-name">Стоимость одного диалога</div></div>
  </div>
  <div class="toggle-row"><div><div class="t-title">Стоимость сообщения</div><div class="t-desc">Включает входные и выходные токены</div></div><b>${r.costPerMessage} ₽</b></div>
  <div class="toggle-row"><div><div class="t-title">Токенов в месяц</div><div class="t-desc">${r.inputTokens.toLocaleString('ru-RU')} вход + ${r.outputTokens.toLocaleString('ru-RU')} выход</div></div><b>${r.totalTokens.toLocaleString('ru-RU')}</b></div>
  <div class="toggle-row"><div><div class="t-title">Выручка по тарифу</div><div class="t-desc">При ${r.dialogsPerMonth} диалогах</div></div><b>${money(r.tariffPrice)}</b></div>
  <div class="toggle-row"><div><div class="t-title">Валовая маржа</div><div class="t-desc">Выручка минус затраты на модель</div></div><b style="color:${r.margin >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(r.margin)} · ${r.marginPct}%</b></div>
  <div class="toggle-row"><div><div class="t-title">Точка безубыточности</div><div class="t-desc">Диалогов для окупации тарифа</div></div><b>${r.breakEvenDialogs ? r.breakEvenDialogs.toLocaleString('ru-RU') : '—'}</b></div>
  <div class="progress ${r.marginPct > 70 ? 'green' : r.marginPct > 40 ? '' : 'orange'} mt"><span style="width:${Math.max(2, Math.min(100, r.marginPct))}%"></span></div>
  <div class="hint mt">Маржа рассчитана без учёта хостинга, поддержки и налогов — это только экономика модели.</div>`;
}

function usageBars(daily) {
  const max = Math.max(0.01, ...daily.map((d) => d.cost));
  return `<div style="display:flex;align-items:flex-end;gap:5px;height:120px;margin-top:8px">
    ${daily.map((d) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${fmtDate(d.date)}: ${Number(d.cost).toFixed(2)} ₽">
      <div style="width:100%;height:${Math.max(2, (d.cost / max) * 90)}px;background:linear-gradient(180deg,#00c9a5,#00a884);border-radius:5px 5px 2px 2px"></div>
      <span class="text-xs text-muted">${new Date(d.date).getDate()}</span></div>`).join('')}
  </div>`;
}

export function render({ state }) {
  const e = state.economics || {};
  const p = e.pricing || {};
  const params = calc?.params || e.params || {};
  const actual = e.usage || {};
  const credentials = e.ai?.credentials || {};
  LAST_PARAMS = params;
  if (!lastParams) lastParams = { ...params };

  return `
  <div class="page-head">
    <div><h2>Экономика ИИ</h2><p>Подключение модели, цены токенов и расчёт стоимости одного лида</p></div>
    <div class="page-actions"><button class="btn" data-go="settings">${icon('plug', 15)} Подключение моделей</button><button class="btn primary" id="save-pricing">${icon('check', 15)} Сохранить цены</button></div>
  </div>

  <div class="card mb">
    <div class="card-pad" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div class="kpi-ic" style="width:46px;height:46px;border-radius:13px">${icon('sparkles', 21)}</div>
      <div style="flex:1;min-width:220px"><div style="font-size:16px;font-weight:800">${esc(e.ai?.model || 'Демо-движок')}</div>
        <div class="flex mt" style="gap:8px"><span class="badge ${credentials[e.ai?.provider] ? 'green' : 'orange'}"><i class="dot"></i>${credentials[e.ai?.provider] ? 'Подключено' : 'Демо / нет ключа'}</span><span class="text-sm text-muted">Провайдер: ${esc(e.ai?.provider || 'demo')}</span></div></div>
      <div class="flex" style="gap:26px;flex-wrap:wrap">
        <div><div style="font-size:19px;font-weight:800">${money(actual.cost || 0)}</div><div class="text-xs text-muted">расход за 30 дней</div></div>
        <div><div style="font-size:19px;font-weight:800">${(actual.inputTokens || 0).toLocaleString('ru-RU')}</div><div class="text-xs text-muted">входных токенов</div></div>
        <div><div style="font-size:19px;font-weight:800">${money(actual.actualCostPerDialog || 0)}</div><div class="text-xs text-muted">факт за диалог</div></div>
      </div>
    </div>
  </div>

  <div class="grid g-1-1" style="grid-template-columns:1.1fr .9fr">
    <div class="card">
      <div class="card-head"><div><div class="card-title">${icon('target', 15)} Калькулятор стоимости</div><div class="card-sub">Измените параметры — результат пересчитается сразу</div></div></div>
      <div class="card-pad">
        <div class="grid g2">
          <div class="field"><label>Провайдер</label><select class="select" id="ec-provider">
            ${Object.entries(p.prices || {}).map(([id, v]) => `<option value="${id}" ${params.provider === id ? 'selected' : ''}>${esc(v.label || id)}</option>`).join('')}
          </select></div>
          <div class="field"><label>Цена тарифа, ₽</label><input class="input" id="ec-tariff" type="number" value="${params.tariffPrice ?? 2490}" /></div>
          <div class="field"><label>Диалогов в месяц</label><input class="input" id="ec-dialogs" type="number" value="${params.dialogsPerMonth ?? 1000}" /></div>
          <div class="field"><label>Сообщений в диалоге</label><input class="input" id="ec-messages" type="number" value="${params.messagesPerDialog ?? 12}" /></div>
          <div class="field"><label>Входных токенов на сообщение</label><input class="input" id="ec-in" type="number" value="${params.inputTokensPerMessage ?? 700}" /></div>
          <div class="field"><label>Выходных токенов на сообщение</label><input class="input" id="ec-out" type="number" value="${params.outputTokensPerMessage ?? 160}" /></div>
        </div>
        <div class="field mt"><label>Цены провайдера за 1 млн токенов, ₽</label>
          <div class="grid g2"><input class="input" id="ec-price-in" type="number" step="0.5" value="${(p.prices || {})[params.provider]?.input ?? 0}" placeholder="Входные" />
            <input class="input" id="ec-price-out" type="number" step="0.5" value="${(p.prices || {})[params.provider]?.output ?? 0}" placeholder="Выходные" /></div>
          <span class="hint">${esc(p.note || 'Уточняйте актуальные цены у провайдера.')}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">${icon('chart', 15)} Результат расчёта</div><span class="badge purple" id="ec-badge">${esc(params.provider || 'demo')}</span></div>
      <div class="card-pad" id="econ-result">${resultHtml(calc)}</div>
    </div>
  </div>

  <div class="card mt">
    <div class="card-head"><div class="card-title">${icon('wallet', 15)} Сравнение провайдеров</div><span class="card-sub">При одинаковом объёме диалогов</span></div>
    <div class="table-wrap"><table><thead><tr><th>Модель</th><th>Вход / 1М</th><th>Выход / 1М</th><th>За диалог</th><th>В месяц</th><th>Маржа</th></tr></thead><tbody>
      ${(e.comparison || []).map((r) => `<tr style="${r.provider === e.ai?.provider ? 'background:var(--primary-softer)' : ''}">
        <td><b>${esc(r.label)}</b>${r.provider === e.ai?.provider ? ' <span class="badge purple">текущая</span>' : ''}</td>
        <td>${(p.prices?.[r.provider]?.input ?? 0)} ₽</td><td>${(p.prices?.[r.provider]?.output ?? 0)} ₽</td>
        <td>${r.costPerDialog} ₽</td><td><b>${money(r.totalCost)}</b></td>
        <td><span class="badge ${r.marginPct > 70 ? 'green' : r.marginPct > 40 ? 'blue' : 'orange'}">${r.marginPct}%</span></td></tr>`).join('')}
    </tbody></table></div>
  </div>

  <div class="grid g-2-1 mt">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('clock', 15)} Фактический расход по дням</div><span class="badge green">30 дней</span></div>
      <div class="card-pad">${usageBars(actual.daily || [])}
        <div class="flex between mt text-sm"><span class="text-muted">Всего вызовов модели</span><b>${actual.calls || 0}</b></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('zap', 15)} По провайдерам</div></div>
      <div class="card-pad">${(actual.byProvider || []).map((x) => `<div class="toggle-row"><div><div class="t-title">${esc(x.model || x.provider)}</div><div class="t-desc">${x.calls} вызовов · ${(x.inputTokens + x.outputTokens).toLocaleString('ru-RU')} токенов</div></div><b class="text-sm">${Number(x.cost).toFixed(2)} ₽</b></div>`).join('') || '<div class="empty">Пока нет учтённых вызовов — отправьте сообщение в тесте агента</div>'}
      </div>
    </div>
  </div>`;
}

let LAST_PARAMS = {};

export function bind(root, { state, refresh, rerender }) {
  const e = state.economics || {};
  const params = { ...(e.params || {}), ...lastParams };
  LAST_PARAMS = params;

  const collect = () => {
    const provider = document.getElementById('ec-provider').value;
    return {
      provider,
      tariffPrice: Number(document.getElementById('ec-tariff').value),
      dialogsPerMonth: Number(document.getElementById('ec-dialogs').value),
      messagesPerDialog: Number(document.getElementById('ec-messages').value),
      inputTokensPerMessage: Number(document.getElementById('ec-in').value),
      outputTokensPerMessage: Number(document.getElementById('ec-out').value),
      priceInput: Number(document.getElementById('ec-price-in').value),
      priceOutput: Number(document.getElementById('ec-price-out').value),
    };
  };

  const recalc = async () => {
    const body = collect();
    lastParams = { ...body };
    try {
      const r = await api('/api/economics/calculate', { method: 'POST', body });
      calc = r;
      const el = document.getElementById('econ-result');
      if (el) el.innerHTML = resultHtml(r);
      const badge = document.getElementById('ec-badge');
      if (badge) badge.textContent = body.provider;
    } catch (err) { toast(err.message, 'err'); }
  };

  root.querySelectorAll('#ec-provider, #ec-tariff, #ec-dialogs, #ec-messages, #ec-in, #ec-out, #ec-price-in, #ec-price-out')
    .forEach((el) => el.addEventListener('input', recalc));

  document.getElementById('ec-provider').onchange = () => {
    const prices = e.pricing?.prices || {};
    const id = document.getElementById('ec-provider').value;
    document.getElementById('ec-price-in').value = prices[id]?.input ?? 0;
    document.getElementById('ec-price-out').value = prices[id]?.output ?? 0;
    recalc();
  };

  document.getElementById('save-pricing').onclick = async () => {
    const body = collect();
    const prices = JSON.parse(JSON.stringify(e.pricing?.prices || {}));
    prices[body.provider] = { ...(prices[body.provider] || {}), input: body.priceInput, output: body.priceOutput };
    await api('/api/settings/aiPricing', { method: 'PUT', body: {
      prices,
      defaults: {
        dialogsPerMonth: body.dialogsPerMonth,
        messagesPerDialog: body.messagesPerDialog,
        inputTokensPerMessage: body.inputTokensPerMessage,
        outputTokensPerMessage: body.outputTokensPerMessage,
      },
    } });
    toast('Цены и параметры сохранены', 'ok');
    calc = null;
    lastParams = { ...body };
    await refresh();
  };

  root.querySelector('[data-go="settings"]').onclick = () => navigate('settings');
  if (!calc) recalc();
}
