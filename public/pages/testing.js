import { icon, esc, api, toast, fmtTime } from '../lib.js';

const SCENARIOS = [
  { label: 'Вопрос о цене', text: 'Здравствуйте, сколько стоит стрижка?' },
  { label: 'Интерес к услуге', text: 'Делаете ли вы маникюр?' },
  { label: 'Согласие', text: 'Да, давайте запишемся' },
  { label: 'Клиент оставил телефон', text: '+7 (916) 123-45-67' },
  { label: 'Просит менеджера', text: 'Можно поговорить с человеком?' },
  { label: 'Отказ от номера', text: 'Нет, спасибо, я просто узнаю цены' },
];

let busy = false;
let lastMeta = null;

export function render({ state }) {
  const a = state.settings.agent || {};
  const history = state.testHistory || [];
  return `
  <div class="page-head">
    <div><h2>Тестирование агента</h2><p>Проверьте, как «${esc(a.name || 'агент')}» отвечает на сообщения, прежде чем включать автоматизацию</p></div>
    <div class="page-actions"><button class="btn" id="clear-test">${icon('refresh', 14)} Начать заново</button></div>
  </div>

  <div class="test-layout">
    <div class="card test-chat">
      <div class="card-head"><div><div class="card-title">${icon('flask', 15)} Песочница</div><div class="card-sub">Сообщения не отправляются в ВКонтакте и не попадают в CRM</div></div><span class="badge purple">${esc(a.name || 'Агент')}</span></div>
      <div class="test-msgs" id="test-msgs">
        <div class="msg out"><div class="msg-author">${esc(a.name || 'Агент')}</div><div class="bubble">${esc(a.greeting || 'Здравствуйте! Чем могу помочь?')}</div><div class="m-time">сейчас</div></div>
        ${history.map((m) => `<div class="msg ${m.direction}"><div class="msg-author">${m.direction === 'in' ? 'Вы (клиент)' : esc(a.name || 'Агент')}</div><div class="bubble">${esc(m.text)}</div><div class="m-time">${fmtTime(m.time)}</div></div>`).join('')}
      </div>
      <div class="composer"><div class="composer-box"><textarea id="test-input" placeholder="Напишите сообщение от лица клиента…"></textarea><button class="send" id="test-send">${icon('send', 17)}</button></div>
        <div class="hint mt">Enter — отправить, Shift+Enter — новая строка</div></div>
    </div>

    <div>
      <div class="card">
        <div class="card-head"><div class="card-title">${icon('zap', 15)} Готовые сценарии</div></div>
        <div class="card-pad"><div class="scenario-grid">
          ${SCENARIOS.map((s, i) => `<button class="scenario" data-scenario="${i}">${esc(s.label)} →</button>`).join('')}
        </div></div>
      </div>
      <div class="card mt">
        <div class="card-head"><div class="card-title">${icon('target', 15)} Что происходит</div></div>
        <div class="card-pad">
          <div class="toggle-row"><div><div class="t-title">Этап диалога</div><div class="t-desc">Определяется агентом</div></div><span class="badge purple">${esc(lastMeta?.stage || 'greeting')}</span></div>
          <div class="toggle-row"><div><div class="t-title">Потребность</div><div class="t-desc">Распознана из сообщения</div></div><b class="text-sm">${esc(lastMeta?.need || 'не определена')}</b></div>
          <div class="toggle-row"><div><div class="t-title">Действие</div><div class="t-desc">Результат обработки</div></div><b class="text-sm">${esc(({ phone: 'Телефон получен', handoff: 'Передача менеджеру', refusal: 'Отказ', reply: 'Обычный ответ' })[lastMeta?.action] || 'ожидание')}</b></div>
          <div class="toggle-row"><div><div class="t-title">Провайдер</div><div class="t-desc">Источник ответа</div></div><b class="text-sm">${esc(state.settings.ai?.model || 'Демо')}</b></div>
        </div>
      </div>
      <div class="card mt">
        <div class="card-head"><div class="card-title">${icon('info', 15)} Советы</div></div>
        <div class="card-pad text-sm text-muted">
          Проверьте три ситуации: вопрос о цене, согласие оставить номер и отказ. Агент должен отвечать по-человечески, не повторять одну и ту же просьбу и не давить на клиента.
        </div>
      </div>
    </div>
  </div>`;
}

export function bind(root, { state, rerender }) {
  const scroll = () => { const el = document.getElementById('test-msgs'); if (el) el.scrollTop = el.scrollHeight; };
  scroll();

  const send = async (text) => {
    const input = document.getElementById('test-input');
    const message = (text || input?.value || '').trim();
    if (!message || busy) return;
    busy = true;
    if (input) input.value = '';
    state.testHistory.push({ direction: 'in', text: message, time: new Date().toISOString() });
    rerender();
    try {
      const result = await api('/api/testing/message', { method: 'POST', body: { history: state.testHistory.slice(0, -1), incoming: message } });
      state.testHistory.push({ direction: 'out', text: result.reply, time: new Date().toISOString() });
      lastMeta = result;
      rerender();
    } catch (e) { toast(e.message, 'err'); busy = false; }
    busy = false;
  };

  document.getElementById('test-send').onclick = () => send();
  document.getElementById('test-input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  root.querySelectorAll('[data-scenario]').forEach((el) => el.onclick = () => send(SCENARIOS[Number(el.dataset.scenario)].text));
  document.getElementById('clear-test').onclick = () => { state.testHistory = []; lastMeta = null; rerender(); };
}
