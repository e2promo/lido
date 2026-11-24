import { icon, esc, api, toast, money, timeAgo, copyText } from '../lib.js';

export function render({ state }) {
  const ai = state.settings.ai || {};
  const note = state.settings.notifications || {};
  const comp = state.settings.compliance || {};
  const billing = state.settings.billing || {};
  const providers = [
    ['demo', '🟣', 'Демо-движок', 'Работает без ключей, подходит для старта'],
    ['yandex', '🟡', 'YandexGPT', 'Российская модель, API Яндекс.Облака'],
    ['gigachat', '🔵', 'GigaChat', 'Модель Сбербанка, требует сертификат'],
    ['openai', '⚪', 'Другая модель', 'Любой OpenAI-совместимый API'],
  ];
  const events = ['КОНТАКТ ПОЛУЧЕН', 'Передан менеджеру', 'Отказ от номера', 'Ошибка подключения'];

  return `
  <div class="page-head">
    <div><h2>Настройки</h2><p>ИИ-провайдер, уведомления, тариф и соответствие законодательству</p></div>
    <div class="page-actions"><button class="btn" id="go-models">${icon('sparkles', 15)} Модели ИИ</button><button class="btn" id="go-economics">${icon('wallet', 15)} Экономика ИИ</button><button class="btn primary" id="save-settings">${icon('check', 15)} Сохранить все изменения</button></div>
  </div>

  <div class="card mb">
    <div class="card-head"><div class="card-title">${icon('rocket', 15)} Компания и отрасль</div><span class="badge purple">${esc(state.templates?.find((t) => t.id === state.currentOrg?.industry)?.label || 'Универсальный')}</span></div>
    <div class="card-pad">
      <div class="grid g2">
        <div class="field"><label>Название компании</label><input class="input" id="org-name" value="${esc(state.currentOrg?.orgName || '')}" /></div>
        <div class="field"><label>Сфера деятельности (шаблон агента)</label><select class="select" id="org-industry">
          ${(state.templates || []).map((t) => `<option value="${t.id}" ${state.currentOrg?.industry === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
        </select></div>
      </div>
      <div class="hint mt">Смена шаблона обновит приветствие, логику и базу знаний компании. Текущие диалоги и лиды сохранятся.</div>
      <button class="btn mt" id="save-org">${icon('check', 14)} Сохранить компанию</button>
      ${(state.organizations || []).length > 1 ? `<div class="hint mt">Ваши компании: ${state.organizations.map((o) => esc(o.name)).join(' · ')}</div>` : ''}
    </div>
  </div>

  <div class="grid g2">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('sparkles', 15)} Модель ИИ</div><span class="badge ${ai.provider === 'demo' ? 'purple' : 'green'}">${esc(ai.model || '')}</span></div>
      <div class="card-pad">
        <div class="option-grid" style="grid-template-columns:repeat(2,1fr)">
          ${providers.map(([id, ic, name, desc]) => `<div class="option-card ${ai.provider === id ? 'active' : ''}" data-provider="${id}" style="text-align:left"><span class="o-ic">${ic}</span><span class="o-name">${name}</span><span class="o-desc">${desc}</span></div>`).join('')}
        </div>
        <div id="provider-fields" class="mt">${providerFields(ai)}</div>
        <div class="field mt"><label>Температурность ответов</label><input class="input" id="ai-temp" type="number" min="0" max="1" step="0.1" value="${ai.temperature ?? 0.7}" /><span class="hint">Чем ниже, тем предсказуемее ответы. Для продаж рекомендуем 0.7.</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">${icon('bell', 15)} Уведомления</div><span class="badge ${note.telegram?.enabled ? 'green' : 'gray'}">Telegram ${note.telegram?.enabled ? 'включён' : 'выключен'}</span></div>
      <div class="card-pad">
        <div class="toggle-row"><div><div class="t-title">Уведомления в Telegram</div><div class="t-desc">Сразу сообщать о новом телефоне и передачи диалога</div></div><button class="toggle ${note.telegram?.enabled ? 'on' : ''}" id="tg-enabled"></button></div>
        <div class="grid g2 mt"><div class="field"><label>Токен бота</label><input class="input mono" id="tg-token" value="${esc(note.telegram?.botToken || '')}" placeholder="123456:ABC-DEF…" /></div>
          <div class="field"><label>Chat ID</label><input class="input mono" id="tg-chat" value="${esc(note.telegram?.chatId || '')}" placeholder="-1001234567890" /></div></div>
        <div class="field mt"><label>События</label><div class="grid g2">${events.map((e) => `<label class="check-row"><input type="checkbox" class="tg-event" value="${esc(e)}" ${(note.events || []).includes(e) ? 'checked' : ''}/><span>${esc(e)}</span></label>`).join('')}</div></div>
        <div class="field mt"><label class="check-row"><input type="checkbox" id="tg-digest" ${note.digest ? 'checked' : ''}/><span>Ежедневная сводка в 9:00</span></label></div>
        <div class="hint mt">Создайте бота у @BotFather, добавьте его в чат и укажите chat ID. Проверка соединения доступна после сохранения.</div>
      </div>
    </div>
  </div>

  <div class="card mt">
    <div class="card-head"><div class="card-title">${icon('wallet', 15)} Тариф и биллинг</div><span class="badge purple">${esc(billing.tariffName || '')}</span></div>
    <div class="card-pad">
      <div class="grid g4">${(state.tariffs || []).map((t) => `<div class="option-card ${billing.tariff === t.id ? 'active' : ''}" style="text-align:left;padding:16px">
        <div class="o-name" style="font-size:13px">${esc(t.name)}</div><div style="font-size:21px;font-weight:800;margin:6px 0">${t.price ? money(t.price) : 'Бесплатно'}<span class="text-xs text-muted" style="font-weight:500"> / ${esc(t.period)}</span></div>
        <div class="o-desc" style="min-height:70px">${t.features.map((f) => `• ${esc(f)}`).join('<br>')}</div>
        ${billing.tariff === t.id ? '<span class="badge green mt">Текущий тариф</span>' : `<button class="btn sm mt" data-tariff="${t.id}" style="width:100%;justify-content:center">Выбрать</button>`}
      </div>`).join('')}</div>
      <div class="flex between mt"><span class="text-sm text-muted">Использовано сообщений в этом месяце</span><b>${billing.messagesUsed || 0} из ${billing.messagesLimit || 0}</b></div>
      <div class="progress mt"><span style="width:${((billing.messagesUsed || 0) / (billing.messagesLimit || 1)) * 100}%"></span></div>
      <div class="text-xs text-muted mt">Примерная себестоимость одного диалога с учётом токенов ИИ: ${money(billing.costPerDialog || 0)}. Оплата в рублях, без валютных рисков.</div>
    </div>
  </div>

  <div class="grid g2 mt">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('shield', 15)} Персональные данные (152-ФЗ)</div><span class="badge green">Соответствует</span></div>
      <div class="card-pad">
        <div class="toggle-row"><div><div class="t-title">Требовать согласие на обработку</div><div class="t-desc">Фиксируется в карточке лида</div></div><button class="toggle ${comp.consentRequired !== false ? 'on' : ''}" id="comp-consent"></button></div>
        <div class="field mt"><label>Текст согласия</label><textarea class="textarea" id="comp-text">${esc(comp.consentText || '')}</textarea></div>
        <div class="grid g2 mt"><div class="field"><label>Версия политики</label><input class="input" id="comp-version" value="${esc(comp.policyVersion || '1.0')}" /></div>
          <div class="field"><label>Срок хранения данных, дней</label><input class="input" id="comp-days" type="number" value="${comp.retentionDays || 90}" /></div></div>
        <div class="login-note mt">${icon('info', 14)} Данные хранятся на российском сервере. Номер телефона сохраняется только после того, как клиент его написал. Агент не запрашивает паспортные данные и не обсуждает запрещённые темы.</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('clock', 15)} Лог событий</div><button class="btn ghost sm" id="copy-webhook-url">${icon('copy', 13)} Адрес webhook</button></div>
      <div class="card-pad" id="logs-list" style="max-height:330px;overflow:auto">
        ${(state.logs || []).slice(0, 12).map((l) => `<div class="log-line"><span class="log-time">${timeAgo(l.created_at)}</span><span class="log-level ${l.level}">${esc(l.level)}</span><span>${esc(l.message)}</span></div>`).join('') || '<div class="empty">Загрузка логов…</div>'}
      </div>
    </div>
  </div>`;
}

function providerFields(ai) {
  if (ai.provider === 'yandex') return `<div class="grid g2"><div class="field"><label>Folder ID</label><input class="input" id="ai-y-folder" value="${esc(ai.yandex?.folderId || '')}" placeholder="b1g…" /></div><div class="field"><label>API-ключ</label><input class="input mono" id="ai-y-key" type="password" value="${esc(ai.yandex?.apiKey || '')}" /></div></div><div class="field mt"><label>Модель</label><input class="input" id="ai-y-model" value="${esc(ai.yandex?.model || 'yandexgpt/latest')}" /></div>`;
  if (ai.provider === 'gigachat') return `<div class="grid g2"><div class="field"><label>Client ID</label><input class="input mono" id="ai-g-id" value="${esc(ai.gigachat?.clientId || '')}" /></div><div class="field"><label>Client Secret</label><input class="input mono" id="ai-g-secret" type="password" value="${esc(ai.gigachat?.clientSecret || '')}" /></div></div><div class="field mt"><label>Модель</label><input class="input" id="ai-g-model" value="${esc(ai.gigachat?.model || 'GigaChat')}" /></div><div class="hint mt">Для GigaChat может потребоваться установить корневой сертификат НУЦ России на сервере.</div>`;
  if (ai.provider === 'openai') return `<div class="field"><label>Base URL</label><input class="input" id="ai-o-url" value="${esc(ai.openai?.baseUrl || '')}" placeholder="https://api.example.com/v1" /></div><div class="grid g2 mt"><div class="field"><label>API-ключ</label><input class="input mono" id="ai-o-key" type="password" value="${esc(ai.openai?.apiKey || '')}" /></div><div class="field"><label>Модель</label><input class="input" id="ai-o-model" value="${esc(ai.openai?.model || 'gpt-4o-mini')}" /></div></div>`;
  return '<div class="login-note">Демо-движок встроен в приложение: он отвечает по базе знаний, ведёт диалог по сценарию и распознаёт телефоны. Для реального ИИ выберите YandexGPT, GigaChat или другую модель — ключи можно добавить позже.</div>';
}

export function bind(root, { state, refresh, rerender }) {
  const ai = state.settings.ai || {};
  let provider = ai.provider || 'demo';
  let tgEnabled = Boolean(state.settings.notifications?.telegram?.enabled);
  let consentRequired = state.settings.compliance?.consentRequired !== false;

  root.querySelectorAll('[data-provider]').forEach((el) => el.onclick = () => {
    provider = el.dataset.provider;
    root.querySelectorAll('[data-provider]').forEach((x) => x.classList.toggle('active', x.dataset.provider === provider));
    document.getElementById('provider-fields').innerHTML = providerFields({ ...ai, provider });
  });
  document.getElementById('tg-enabled').onclick = (e) => { tgEnabled = !tgEnabled; e.currentTarget.classList.toggle('on', tgEnabled); };
  document.getElementById('comp-consent').onclick = (e) => { consentRequired = !consentRequired; e.currentTarget.classList.toggle('on', consentRequired); };
  document.getElementById('copy-webhook-url').onclick = () => copyText(`${location.origin}/webhook/vk`);
  document.getElementById('go-economics').onclick = () => { location.hash = '#/economics'; };
  document.getElementById('go-models').onclick = () => { location.hash = '#/models'; };
  document.getElementById('save-org').onclick = async () => {
    await api(`/api/organizations/${state.currentOrg.orgId}`, { method: 'PUT', body: {
      name: document.getElementById('org-name').value,
      industry: document.getElementById('org-industry').value,
    } });
    toast('Компания обновлена', 'ok');
    await refresh();
  };
  root.querySelectorAll('[data-tariff]').forEach((el) => el.onclick = async () => {
    const names = { free: 'Пробный', base: 'Базовый', pro: 'Профессиональный', enterprise: 'Для агентств' };
    await api('/api/settings/billing', { method: 'PUT', body: { tariff: el.dataset.tariff, tariffName: names[el.dataset.tariff] } });
    toast('Тариф изменён. Для оплаты свяжитесь с менеджером.', 'ok');
    await refresh();
  });

  document.getElementById('save-settings').onclick = async () => {
    const num = (id, fallback) => Number(document.getElementById(id)?.value ?? fallback);
    const val = (id, fallback = '') => document.getElementById(id)?.value ?? fallback;
    const newAi = {
      provider,
      temperature: num('ai-temp', ai.temperature ?? 0.7),
      model: provider === 'demo' ? 'Демо-движок (встроенный)'
        : provider === 'yandex' ? val('ai-y-model', 'yandexgpt/latest')
        : provider === 'gigachat' ? val('ai-g-model', 'GigaChat')
        : val('ai-o-model', 'gpt-4o-mini'),
      yandex: { ...ai.yandex, folderId: val('ai-y-folder', ai.yandex?.folderId || ''), apiKey: val('ai-y-key', ai.yandex?.apiKey || ''), model: val('ai-y-model', ai.yandex?.model || '') },
      gigachat: { ...ai.gigachat, clientId: val('ai-g-id', ai.gigachat?.clientId || ''), clientSecret: val('ai-g-secret', ai.gigachat?.clientSecret || ''), model: val('ai-g-model', ai.gigachat?.model || '') },
      openai: { ...ai.openai, baseUrl: val('ai-o-url', ai.openai?.baseUrl || ''), apiKey: val('ai-o-key', ai.openai?.apiKey || ''), model: val('ai-o-model', ai.openai?.model || '') },
    };
    await api('/api/settings/ai', { method: 'PUT', body: newAi });
    await api('/api/settings/notifications', { method: 'PUT', body: {
      telegram: { enabled: tgEnabled, botToken: val('tg-token', ''), chatId: val('tg-chat', '') },
      events: [...document.querySelectorAll('.tg-event:checked')].map((e) => e.value),
      digest: document.getElementById('tg-digest').checked,
    } });
    await api('/api/settings/compliance', { method: 'PUT', body: {
      consentRequired,
      consentText: val('comp-text', ''),
      policyVersion: val('comp-version', '1.0'),
      retentionDays: num('comp-days', 90),
    } });
    toast('Все настройки сохранены', 'ok');
    await refresh();
  };

  api('/api/logs?limit=12').then((logs) => {
    const el = document.getElementById('logs-list');
    if (el) el.innerHTML = logs.map((l) => `<div class="log-line"><span class="log-time">${timeAgo(l.created_at)}</span><span class="log-level ${l.level}">${esc(l.level)}</span><span>${esc(l.message)}</span></div>`).join('');
  }).catch(() => {});
}
