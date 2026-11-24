import { icon, esc, api, toast } from '../lib.js';

let activeTab = 'main';
let draft = null;

function tagsHtml(items, id, placeholder) {
  return `<div class="tag-input" id="${id}">${items.map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-tag-remove="${i}" data-parent="${id}">×</button></span>`).join('')}<input placeholder="${placeholder}" data-tag-input="${id}" /></div>`;
}

function section(active, id, title, subtitle, body) {
  return `<div data-section="${id}" style="display:${active === id ? 'block' : 'none'}">
    <div class="card"><div class="card-head"><div><div class="card-title">${title}</div><div class="card-sub">${subtitle}</div></div></div>
      <div class="card-pad">${body}</div></div></div>`;
}

export function render({ state }) {
  const a = state.settings.agent || {};
  if (!draft) draft = { restrictions: [...(a.restrictions || [])], forbidden: [...(a.forbidden || [])] };
  const styles = [
    ['дружелюбный', '😊', 'Тёплый и живой'], ['деловой', '💼', 'Сдержанный'],
    ['консультативный', '🎯', 'Как эксперт'], ['краткий', '⚡', 'Без лишнего'],
  ];
  const goals = [
    ['phone', '📞', 'Получить телефон', 'Основная цель — контакт клиента'],
    ['meeting', '📅', 'Записать на визит', 'Сразу подобрать удобное время'],
    ['consult', '💬', 'Ответить на вопросы', 'Консультация без давления'],
  ];

  return `
  <div class="page-head">
    <div><h2>Настройка ИИ-агента</h2><p>Настройте характер и логику агента — без программирования и сложных терминов</p></div>
    <div class="page-actions"><button class="btn" data-go="testing">${icon('flask', 15)} Проверить в тесте</button><button class="btn primary" id="save-agent">${icon('check', 15)} Сохранить агента</button></div>
  </div>

  <div class="tabs mb">
    ${[['main', 'Основное'], ['goal', 'Цель и логика'], ['limits', 'Ограничения'], ['modes', 'Режимы работы']].map(([id, label]) => `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
  </div>

  ${section(activeTab, 'main', icon('bot', 15) + ' Характер агента', 'Как агент будет общаться с клиентами', `
    <div class="grid g2">
      <div class="field"><label>Имя агента</label><input class="input" id="a-name" value="${esc(a.name || '')}" placeholder="Аня" /><span class="hint">Клиент увидит это имя в переписке</span></div>
      <div class="field"><label>Название компании</label><input class="input" id="a-company" value="${esc(a.company || '')}" placeholder="Студия красоты «Локон»" /></div>
    </div>
    <div class="field mt"><label>Стиль общения</label>
      <div class="option-grid">${styles.map(([id, ic, desc]) => `<div class="option-card ${a.style === id ? 'active' : ''}" data-style="${id}"><span class="o-ic">${ic}</span><span class="o-name">${id[0].toUpperCase() + id.slice(1)}</span><span class="o-desc">${desc}</span></div>`).join('')}</div></div>
    <div class="field mt"><label>Первое сообщение клиенту</label><textarea class="textarea" id="a-greeting">${esc(a.greeting || '')}</textarea><span class="hint">Агент отправит его сразу после обращения</span></div>
    <div class="field mt"><label>О компании, товарах и услугах</label><textarea class="textarea" id="a-about" style="min-height:110px">${esc(a.about || '')}</textarea><span class="hint">Эта информация помогает агенту отвечать на вопросы. Подробные цены добавьте в «Базу знаний».</span></div>
    <div class="preview mt"><span class="k">Превью:</span> <span class="v">${esc(a.greeting || 'Здравствуйте! Чем могу помочь?')}</span></div>`)}

  ${section(activeTab, 'goal', icon('target', 15) + ' Цель и логика', 'Что агент должен сделать в итоге', `
    <div class="field"><label>Цель диалога</label>
      <div class="option-grid">${goals.map(([id, ic, name, desc]) => `<div class="option-card ${a.goal === id ? 'active' : ''}" data-goal="${id}"><span class="o-ic">${ic}</span><span class="o-name">${name}</span><span class="o-desc">${desc}</span></div>`).join('')}</div></div>
    <div class="field mt"><label>Как просить номер телефона</label><textarea class="textarea" id="a-pitch">${esc(a.pitch || '')}</textarea><span class="hint">Сформулируйте пользу для клиента: перезвоним, подтвердим запись, ответим на вопросы</span></div>
    <div class="field mt"><label>Логика общения</label><textarea class="textarea" id="a-logic">${esc(a.logic || '')}</textarea></div>
    <div class="banner ok mt"><div class="b-ic">💡</div><div><b>Совет</b><span>Лучше всего работают короткие сообщения с конкретной пользой. Не просите номер в первом сообщении — сначала ответьте на вопрос клиента.</span></div></div>`)}

  ${section(activeTab, 'limits', icon('shield', 15) + ' Ограничения', 'Запрещённые темы и поведение в сложных ситуациях', `
    <div class="field"><label>Ограничения агента</label>${tagsHtml(draft.restrictions, 'a-restrictions', 'Добавить ограничение и нажать Enter')}<span class="hint">Например: не обещать скидки без согласования</span></div>
    <div class="field mt"><label>Запрещённые темы</label>${tagsHtml(draft.forbidden, 'a-forbidden', 'Добавить тему и нажать Enter')}</div>
    <div class="field mt"><label>Если агент не знает ответ</label><input class="input" id="a-unknown" value="${esc(a.onUnknown || '')}" /></div>
    <div class="field mt"><label>Фразы, при которых нужен менеджер</label><input class="input" id="a-handoff" value="${esc(a.handoffPhrases || '')}" /><span class="hint">Через запятую: менеджер, человек, оператор</span></div>
    <div class="field mt"><label>Действие при передаче</label><select class="select" id="a-fallback">
      <option ${a.fallback === 'Передать диалог живому менеджеру' ? 'selected' : ''}>Передать диалог живому менеджеру</option>
      <option ${a.fallback === 'Уведомить владельца и продолжить' ? 'selected' : ''}>Уведомить владельца и продолжить</option>
      <option ${a.fallback === 'Завершить диалог' ? 'selected' : ''}>Завершить диалог</option>
    </select></div>`)}

  ${section(activeTab, 'modes', icon('zap', 15) + ' Режимы работы', 'Управление автоматизацией и лимитами', `
    <div class="toggle-row"><div><div class="t-title">Агент включён</div><div class="t-desc">Отвечать на входящие сообщения автоматически</div></div><button class="toggle ${a.enabled !== false ? 'on' : ''}" id="a-enabled"></button></div>
    <div class="field mt"><label>Режим работы</label><div class="option-grid">
      ${[['auto', '🤖', 'Автоматический', 'Агент отвечает сам'], ['control', '👀', 'Ручной контроль', 'Вы подтверждаете ответы'], ['manual', '✋', 'Только я', 'Агент не отвечает']].map(([id, ic, name, desc]) => `<div class="option-card ${a.mode === id ? 'active' : ''}" data-mode="${id}"><span class="o-ic">${ic}</span><span class="o-name">${name}</span><span class="o-desc">${desc}</span></div>`).join('')}
    </div></div>
    <div class="grid g2 mt">
      <div class="field"><label>Максимум сообщений в диалоге</label><input class="input" id="a-max" type="number" value="${a.maxMessages || 12}" /></div>
      <div class="field"><label>Задержка перед ответом, сек</label><input class="input" id="a-delay" type="number" value="${a.delaySec || 2}" /></div>
    </div>
    <div class="field mt"><label>Часы работы агента</label><input class="input" id="a-hours" value="${esc(a.workingHours || 'Ежедневно 09:00–21:00')}" /></div>
    <div class="banner warn mt"><div class="b-ic">⚠️</div><div><b>Важно</b><span>В нерабочие часы агент оставляет сообщение без ответа, чтобы не создавать впечатление живого круглосуточного менеджера.</span></div></div>`)}`;
}

export function bind(root, { state, refresh, rerender }) {
  const a = state.settings.agent || {};
  let style = a.style;
  let goal = a.goal;
  let mode = a.mode;
  let enabled = a.enabled !== false;

  root.querySelectorAll('[data-tab]').forEach((el) => el.onclick = () => {
    activeTab = el.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === activeTab));
    root.querySelectorAll('[data-section]').forEach((s) => s.style.display = s.dataset.section === activeTab ? 'block' : 'none');
  });

  const selectOne = (selector, attr, setter) => {
    root.querySelectorAll(selector).forEach((el) => el.onclick = () => {
      root.querySelectorAll(selector).forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      setter(el.dataset[attr]);
    });
  };
  selectOne('[data-style]', 'style', (v) => style = v);
  selectOne('[data-goal]', 'goal', (v) => goal = v);
  selectOne('[data-mode]', 'mode', (v) => mode = v);

  const enabledBtn = document.getElementById('a-enabled');
  enabledBtn.onclick = () => { enabled = !enabled; enabledBtn.classList.toggle('on', enabled); };

  root.querySelectorAll('[data-tag-input]').forEach((input) => {
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const parentId = input.dataset.tagInput;
      draft[parentId === 'a-restrictions' ? 'restrictions' : 'forbidden'].push(value);
      rerender();
    };
  });
  root.querySelectorAll('[data-tag-remove]').forEach((btn) => btn.onclick = () => {
    const key = btn.dataset.parent === 'a-restrictions' ? 'restrictions' : 'forbidden';
    draft[key].splice(Number(btn.dataset.tagRemove), 1);
    rerender();
  });

  document.getElementById('save-agent').onclick = async () => {
    const body = {
      name: document.getElementById('a-name').value,
      company: document.getElementById('a-company').value,
      style, goal,
      greeting: document.getElementById('a-greeting').value,
      about: document.getElementById('a-about').value,
      pitch: document.getElementById('a-pitch').value,
      logic: document.getElementById('a-logic').value,
      restrictions: draft.restrictions,
      forbidden: draft.forbidden,
      onUnknown: document.getElementById('a-unknown').value,
      handoffPhrases: document.getElementById('a-handoff').value,
      fallback: document.getElementById('a-fallback').value,
      enabled,
      mode,
      maxMessages: Number(document.getElementById('a-max').value),
      delaySec: Number(document.getElementById('a-delay').value),
      workingHours: document.getElementById('a-hours').value,
    };
    await api('/api/settings/agent', { method: 'PUT', body });
    toast('Настройки агента сохранены', 'ok');
    await refresh();
  };
  root.querySelector('[data-go="testing"]').onclick = () => { location.hash = '#/testing'; };
}
