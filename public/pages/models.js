import { icon, esc, api, toast, money } from '../lib.js';

let selected = null;
let testResult = null;

function fieldsFor(provider, ai) {
  if (provider === 'yandex') return `
    <div class="grid g2"><div class="field"><label>Folder ID</label><input class="input" id="md-y-folder" value="${esc(ai.yandex?.folderId || '')}" placeholder="b1g…" /></div>
      <div class="field"><label>API-ключ</label><input class="input mono" id="md-y-key" type="password" value="${esc(ai.yandex?.apiKey || '')}" placeholder="AQVN…" /></div></div>
    <div class="field mt"><label>Модель</label><input class="input" id="md-model" value="${esc(ai.yandex?.model || 'yandexgpt/latest')}" /></div>`;
  if (provider === 'gigachat') return `
    <div class="grid g2"><div class="field"><label>Client ID</label><input class="input mono" id="md-g-id" value="${esc(ai.gigachat?.clientId || '')}" placeholder="UUID" /></div>
      <div class="field"><label>Client Secret</label><input class="input mono" id="md-g-secret" type="password" value="${esc(ai.gigachat?.clientSecret || '')}" placeholder="Секрет Сбера" /></div></div>
    <div class="field mt"><label>Модель</label><input class="input" id="md-model" value="${esc(ai.gigachat?.model || 'GigaChat')}" /></div>
    <div class="hint mt">Если возникает ошибка сертификата, включите GIGACHAT_TLS_INSECURE=1 в настройках сервера.</div>`;
  if (provider === 'openai') return `
    <div class="field"><label>Base URL</label><input class="input" id="md-o-url" value="${esc(ai.openai?.baseUrl || '')}" placeholder="https://api.example.com/v1" /></div>
    <div class="grid g2 mt"><div class="field"><label>API-ключ</label><input class="input mono" id="md-o-key" type="password" value="${esc(ai.openai?.apiKey || '')}" /></div>
      <div class="field"><label>Модель</label><input class="input" id="md-model" value="${esc(ai.openai?.model || 'gpt-4o-mini')}" /></div></div>`;
  return '<div class="login-note">Демо-движок встроен в Лидо: он отвечает по вашей базе знаний и ведёт сценарий без внешних API. Ключи и интернет не нужны.</div>';
}

export function render({ state }) {
  const ai = state.settings.ai || {};
  const models = state.aiModels || [];
  const current = ai.provider || 'demo';
  if (!selected) selected = current;
  const chosen = models.find((m) => m.id === selected) || { id: selected, label: selected, icon: '🤖', description: '' };

  return `
  <div class="page-head">
    <div><h2>Модели ИИ</h2><p>Выберите, какая модель будет общаться с клиентами вашей компании</p></div>
    <div class="page-actions"><button class="btn" id="md-test-top">${icon('zap', 15)} Проверить текущую</button></div>
  </div>

  <div class="banner ${selected === current ? 'ok' : 'warn'} mb">
    <div class="b-ic">${chosen.icon || '🤖'}</div>
    <div><b>Выбрана модель: ${esc(chosen.label)}</b><span>${selected === current ? 'Агент работает на этой модели прямо сейчас' : 'Нажмите «Сохранить и включить», чтобы применить выбор'}</span></div>
    <span class="badge ${selected === current ? 'green' : 'orange'}">${selected === current ? 'Активна' : 'Не применена'}</span>
  </div>

  <div class="grid g4 mb">
    ${models.map((m) => `<div class="option-card ${selected === m.id ? 'active' : ''}" data-model="${m.id}" style="padding:18px;text-align:left;min-height:150px">
      <span class="o-ic" style="font-size:24px">${m.icon}</span>
      <span class="o-name" style="font-size:13px">${esc(m.label)} ${m.active ? '<span class="badge green">работает</span>' : ''}</span>
      <span class="o-desc" style="margin-top:8px;min-height:52px">${esc(m.description)}</span>
      <span class="flex" style="gap:5px;margin-top:10px">
        <span class="badge ${m.configured ? 'green' : 'gray'}">${m.configured ? 'Ключи есть' : 'Ключей нет'}</span>
        <span class="badge purple">${m.inputPrice}/${m.outputPrice} ₽ за 1М</span>
      </span>
    </div>`).join('')}
  </div>

  <div class="grid g-2-1">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('settings', 15)} Настройка модели «${esc(chosen.label)}»</div></div>
      <div class="card-pad">
        ${fieldsFor(selected, ai)}
        <div class="field mt"><label>Температурность (0 — предсказуемо, 1 — свободнее)</label>
          <input class="input" id="md-temp" type="number" min="0" max="1" step="0.1" value="${ai.temperature ?? 0.7}" /></div>
        <div class="flex mt" style="gap:9px">
          <button class="btn" id="md-test">${icon('plug', 14)} Проверить подключение</button>
          <button class="btn primary" id="md-save">${icon('check', 14)} Сохранить и включить</button>
        </div>
        <div id="md-result" class="hint mt">${testResult ? esc(testResult.ok ? `✓ ${testResult.message || 'Подключение работает'}` : `✗ ${testResult.error || 'Ошибка'}`) : 'Ключи сохраняются только в вашей компании и не видны другим клиентам.'}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('info', 15)} Как это работает</div></div>
      <div class="card-pad">
        <div class="step-list">
          <div class="step done"><div class="step-n">1</div><div><b>Выберите модель</b><p>Демо, YandexGPT, GigaChat или другой API</p></div></div>
          <div class="step"><div class="step-n">2</div><div><b>Введите свои ключи</b><p>Они привязаны к вашей компании</p></div></div>
          <div class="step"><div class="step-n">3</div><div><b>Проверьте соединение</b><p>Кнопка отправит тестовый запрос</p></div></div>
          <div class="step"><div class="step-n">4</div><div><b>Сохраните и включите</b><p>Агент сразу начнёт отвечать через неё</p></div></div>
        </div>
        <button class="btn mt" style="width:100%;justify-content:center" id="md-go-econ">${icon('wallet', 14)} Посчитать экономику модели</button>
      </div>
    </div>
  </div>`;
}

function collect(ai) {
  const provider = selected;
  const model = document.getElementById('md-model')?.value || '';
  const yandex = { ...(ai.yandex || {}) };
  const gigachat = { ...(ai.gigachat || {}) };
  const openai = { ...(ai.openai || {}) };
  const set = (id, key, obj) => { const el = document.getElementById(id); if (el) obj[key] = el.value; };
  set('md-y-folder', 'folderId', yandex); set('md-y-key', 'apiKey', yandex); if (model) yandex.model = model;
  set('md-g-id', 'clientId', gigachat); set('md-g-secret', 'clientSecret', gigachat); if (model) gigachat.model = model;
  set('md-o-url', 'baseUrl', openai); set('md-o-key', 'apiKey', openai); if (model) openai.model = model;
  return {
    ...ai, provider, yandex, gigachat, openai,
    temperature: Number(document.getElementById('md-temp')?.value ?? ai.temperature ?? 0.7),
    model: provider === 'demo' ? 'Демо-движок (встроенный)' : (model || provider),
  };
}

export function bind(root, ctx) {
  const { state, refresh, rerender } = ctx;
  const ai = state.settings.ai || {};

  root.querySelectorAll('[data-model]').forEach((el) => el.onclick = () => { selected = el.dataset.model; testResult = null; rerender(); });

  const runTest = async () => {
    const body = collect(ai);
    await api('/api/settings/ai', { method: 'PUT', body }).catch(() => {});
    const res = await api('/api/ai/test', { method: 'POST', body: {} });
    testResult = res;
    const el = document.getElementById('md-result');
    if (el) el.innerHTML = res.ok
      ? `<span style="color:var(--accent)">✓ Подключение работает: ${esc(res.message || res.model || 'OK')}</span>`
      : `<span style="color:var(--danger)">✗ ${esc(res.error || 'Не удалось подключиться')}</span>`;
  };
  document.getElementById('md-test').onclick = runTest;
  document.getElementById('md-test-top').onclick = async () => {
    const res = await api('/api/ai/test', { method: 'POST', body: {} });
    testResult = res;
    toast(res.ok ? 'Модель отвечает' : 'Ошибка подключения', res.ok ? 'ok' : 'err');
    rerender();
  };

  document.getElementById('md-save').onclick = async () => {
    await api('/api/settings/ai', { method: 'PUT', body: collect(ai) });
    toast('Модель сохранена и включена', 'ok');
    await refresh();
  };
  document.getElementById('md-go-econ').onclick = () => { location.hash = '#/economics'; };
}
