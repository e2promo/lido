import { icon, esc, api, toast, copyText, timeAgo } from '../lib.js';

function friendlyVkError(error) {
  const text = String(error || '');
  if (text.includes('901')) return '901 — пользователь не разрешил сообщения от сообщества. Пусть первым напишет в сообщество или нажмёт «Разрешить сообщения» в диалоге с сообществом.';
  if (text.includes('1116')) return '1116 — неверный токен сообщества. Создайте новый ключ с правом «Сообщения сообщества» и вставьте его выше.';
  if (/peer_id|VK API 100/.test(text)) return '100 — некорректный Peer ID. Укажите числовой ID пользователя, беседы (2000000000+id) или сообщества (-id).';
  if (text.includes('403')) return '403 — проверьте секретный ключ Callback API.';
  return text;
}

export function render({ state }) {
  const vk = state.settings.vk || {};
  const connected = vk.connected !== false;
  const webhookUrl = `${location.origin}/webhook/vk?org=${encodeURIComponent(state.user?.orgSlug || 'demo')}`;
  const steps = [
    { n: 1, title: 'Создайте сообщество', text: 'Если его ещё нет — создайте группу ВКонтакте для вашего бизнеса.', done: true },
    { n: 2, title: 'Выдайте права администратора', text: 'В разделе «Управление» → «Администраторы» добавьте аккаунт, от которого будет работать токен.', done: true },
    { n: 3, title: 'Добавьте токен и секрет', text: 'Создайте ключ доступа сообщества с правами «Сообщения» и вставьте его ниже.', done: connected },
  ];

  return `
  <div class="page-head">
    <div><h2>Подключение ВКонтакте</h2><p>Свяжите сообщество с Лидо — агент начнёт отвечать на входящие сообщения</p></div>
    <div class="page-actions"><button class="btn" id="test-vk">${icon('refresh', 15)} Проверить соединение</button><button class="btn primary" id="save-vk">${icon('check', 15)} Сохранить</button></div>
  </div>

  <div class="banner ${connected ? 'ok' : 'warn'} mb">
    <div class="b-ic">${connected ? '🔗' : '⚠️'}</div>
    <div><b>${connected ? 'Сообщество подключено' : 'Подключение не настроено'}</b>
      <span>${connected ? `${esc(vk.communityName || '')} · ID ${esc(vk.communityId || '')} · синхронизация ${esc(vk.lastSync || 'только что')}` : 'Выполните шаги ниже, чтобы агент начал работать'}</span></div>
    <span class="badge ${connected ? 'green' : 'orange'}"><i class="dot"></i>${connected ? 'Активно' : 'Требует настроек'}</span>
  </div>

  ${!state.dashboard?.vk?.tokenConfigured ? `<div class="banner warn mb"><div class="b-ic">⚠️</div><div><b>Демо-режим без токена ВК</b><span>Входящие сообщения и ответы попадают в софт, но не отправляются в сообщество. Укажите ключ доступа сообщества выше или в переменной VK_GROUP_TOKEN и перезапустите сервер.</span></div></div>` : ''}

  <div class="grid g-2-1">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('link', 15)} Настройки подключения</div><span class="card-sub">Данные хранятся на вашем сервере</span></div>
      <div class="card-pad">
        <div class="grid g2">
          <div class="field"><label>Название сообщества</label><input class="input" id="vk-name" value="${esc(vk.communityName || '')}" placeholder="Например, Локон — студия красоты" /></div>
          <div class="field"><label>ID сообщества</label><input class="input" id="vk-id" value="${esc(vk.communityId || '')}" placeholder="128452301" /></div>
        </div>
        <div class="field mt"><label>Ключ доступа сообщества (токен)</label><input class="input mono" id="vk-token" type="password" value="${esc(vk.token || '')}" placeholder="vk1.a.…" />
          <span class="hint">Нужен для отправки сообщений от имени сообщества. Токен не будет показан повторно.</span></div>
        <div class="grid g2 mt">
          <div class="field"><label>Секретный ключ Callback API</label><input class="input mono" id="vk-secret" value="${esc(vk.secret || '')}" placeholder="lido_demo_secret" /></div>
          <div class="field"><label>Строка подтверждения</label><input class="input mono" id="vk-confirm" value="${esc(vk.confirmationToken || '')}" placeholder="Укажите при настройке Callback API" /></div>
        </div>
        <div class="field mt"><label>Адрес для Callback API ВКонтакте</label>
          <div class="flex"><input class="input mono" id="vk-webhook" readonly value="${esc(webhookUrl)}" /><button class="btn" id="copy-webhook">${icon('copy', 14)}</button></div>
          <span class="hint">Вставьте этот адрес в раздел «Работа с API» → «Callback API» сообщества. Параметр org=<slug> направляет сообщения в текущую компанию; для демо-компании используйте адрес без параметра.</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">${icon('shield', 15)} Права доступа</div></div>
      <div class="card-pad">
        ${[['messages', 'Сообщения', 'Читать и отправлять сообщения'], ['manage', 'Управление сообществом', 'Настройки и статус'], ['groups', 'Информация о сообществе', 'Название и участники']].map(([k, t, d]) => `
          <label class="check-row" style="margin-bottom:13px"><input type="checkbox" class="vk-perm" value="${k}" ${(vk.permissions || []).includes(k) ? 'checked' : ''} />
            <span><b style="display:block;font-size:12.5px">${t}</b><span class="hint">${d}</span></span></label>`).join('')}
        <div class="login-note mt" style="margin-top:8px">${icon('info', 14)} ${esc(vk.scopesNote || 'Для работы нужны права «Сообщения» и «Управление сообществом».')}</div>
      </div>
    </div>
  </div>

  <div class="card mt">
    <div class="card-head"><div class="card-title">${icon('refresh', 15)} Двусторонняя синхронизация</div><span class="badge purple">Включено</span></div>
    <div class="card-pad"><div class="step-list">
      <div class="step done"><div class="step-n">1</div><div><b>Входящее сообщение → софт</b><p>Callback API получает сообщение, сохраняет его в диалог и не дублирует повторные события по ID сообщения.</p></div></div>
      <div class="step done"><div class="step-n">2</div><div><b>Ответ ИИ → ВК и в софт</b><p>Агент отвечает через messages.send, а отправленный текст сразу сохраняется в переписке со статусом доставки.</p></div></div>
      <div class="step done"><div class="step-n">3</div><div><b>Ответ менеджера → ВК</b><p>Сообщения, написанные в окне переписки, тоже уходят в сообщество и дублируются локально.</p></div></div>
      <div class="step done"><div class="step-n">4</div><div><b>Вы пишете из ВК → софт</b><p>Включите «Исходящие сообщения» во вкладке «Типы событий» — ваши сообщения от имени сообщества появятся в переписке Лидо.</p></div></div>
      <div class="step"><div class="step-n">5</div><div><b>История переписки</b><p>При первом обращении подтягиваются последние сообщения ВК. Кнопка «История ВК» в диалоге повторяет импорт вручную.</p></div></div>
    </div></div>
  </div>

  <div class="card mt">
    <div class="card-head"><div class="card-title">${icon('send', 15)} Отправить тестовое сообщение в ВК</div><span class="card-sub">Проверьте, что токен действительно работает</span></div>
    <div class="card-pad">
      <div class="grid g3">
        <div class="field"><label>Диалог</label><select class="select" id="vk-test-dialog">
          ${(state.dialogs || []).map((d) => `<option value="${esc(d.id)}" data-peer="${esc(d.peer_id)}">${esc(d.client_name)} · ${esc(d.vk_id)}</option>`).join('') || '<option value="">Нет диалогов</option>'}
        </select></div>
        <div class="field"><label>Peer ID (число)</label><input class="input mono" id="vk-test-peer" value="${esc(state.dialogs?.[0]?.peer_id || '')}" placeholder="123456789 или 2000000001" /></div>
        <div class="field"><label>Текст</label><input class="input" id="vk-test-text" value="Тестовое сообщение от Лидо ✅" /></div>
      </div>
      <div class="hint mt">Peer ID можно взять из ссылки на диалог ВК; для беседы это 2000000000 + номер беседы. Демо-диалоги с peer_id «demo_user» для отправки не подходят.</div>
      <div class="flex mt" style="justify-content:flex-end"><button class="btn primary" id="vk-send-test">${icon('send', 14)} Отправить</button></div>
      <div id="vk-test-result" class="hint mt"></div>
    </div>
  </div>

  <div class="grid g2 mt">
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('rocket', 15)} Как подключить за 10 минут</div></div>
      <div class="card-pad"><div class="step-list">
        ${steps.map((s) => `<div class="step ${s.done ? 'done' : ''}"><div class="step-n">${s.done ? icon('check', 13) : s.n}</div><div><b>${s.title}</b><p>${s.text}</p></div></div>`).join('')}
      </div></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">${icon('clock', 15)} Диагностика</div></div>
      <div class="card-pad">
        <div class="toggle-row"><div><div class="t-title">Статус подключения</div><div class="t-desc">Проверяется автоматически каждые 5 минут</div></div><span class="badge ${connected ? 'green' : 'orange'}"><i class="dot"></i>${connected ? 'OK' : 'Ошибка'}</span></div>
        <div class="toggle-row"><div><div class="t-title">Последняя синхронизация</div><div class="t-desc">Входящие сообщения обрабатываются в реальном времени</div></div><b class="text-sm">${esc(vk.lastSync || 'только что')}</b></div>
        <div class="toggle-row"><div><div class="t-title">Режим</div><div class="t-desc">Демо-режим работает без реального токена</div></div><span class="badge purple">${!vk.tokenConfigured ? 'Демо' : 'VK API'}</span></div>
        <div id="vk-result" class="hint mt" style="min-height:20px"></div>
      </div>
    </div>
  </div>`;
}

export function bind(root, { state, refresh }) {
  document.getElementById('copy-webhook').onclick = () => copyText(document.getElementById('vk-webhook').value);
  document.getElementById('test-vk').onclick = async () => {
    const el = document.getElementById('vk-result');
    el.textContent = 'Проверяем соединение…';
    try {
      const res = await api('/api/vk/test', { method: 'POST', body: {} });
      el.innerHTML = res.ok
        ? `<span style="color:var(--accent)">✓ Соединение установлено: ${res.simulated ? 'демо-режим (реальный токен не задан)' : esc(res.name || '')}</span>`
        : `<span style="color:var(--danger)">✗ ${esc(friendlyVkError(res.error || 'Ошибка'))}</span>`;
      toast('Проверка соединения выполнена', 'ok');
    } catch (e) { el.textContent = e.message; }
  };
  const dialogSelect = document.getElementById('vk-test-dialog');
  const peerInput = document.getElementById('vk-test-peer');
  dialogSelect.onchange = () => {
    const option = dialogSelect.selectedOptions[0];
    if (option?.dataset.peer) peerInput.value = option.dataset.peer;
  };

  document.getElementById('vk-send-test').onclick = async () => {
    const dialogId = dialogSelect.value;
    const peerId = peerInput.value.trim();
    const el = document.getElementById('vk-test-result');
    if (!/^-?\d+$/.test(peerId)) { el.textContent = 'Укажите числовой Peer ID'; return; }
    el.textContent = 'Отправляем…';
    try {
      const res = await api('/api/vk/send-test', { method: 'POST', body: {
        dialogId, peerId, text: document.getElementById('vk-test-text').value,
      } });
      el.innerHTML = res.ok
        ? `<span style="color:var(--accent)">✓ ${res.simulated ? 'Сохранено локально (демо-режим: реальный токен не задан)' : `Отправлено в ВК, ID сообщения ${esc(res.messageId || '—')}`}</span>`
        : `<span style="color:var(--danger)">✗ ${esc(res.error || 'Не удалось отправить')}</span>`;
      toast(res.ok ? 'Тестовое сообщение отправлено' : 'Ошибка отправки', res.ok ? 'ok' : 'err');
    } catch (err) { el.textContent = err.message; }
  };
  document.getElementById('save-vk').onclick = async () => {
    const body = {
      communityName: document.getElementById('vk-name').value,
      communityId: document.getElementById('vk-id').value,
      token: document.getElementById('vk-token').value,
      secret: document.getElementById('vk-secret').value,
      confirmationToken: document.getElementById('vk-confirm').value,
      permissions: [...document.querySelectorAll('.vk-perm:checked')].map((e) => e.value),
      connected: true,
      tokenConfigured: Boolean(document.getElementById('vk-token').value),
      lastSync: 'только что',
    };
    await api('/api/settings/vk', { method: 'PUT', body });
    toast('Настройки подключения сохранены', 'ok');
    await refresh();
  };
}
