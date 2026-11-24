import { icon, esc, api, toast, fmtDate, modal } from '../lib.js';

let query = '';
let category = 'Все';
let adding = false;

export function render({ state }) {
  const items = state.knowledge || [];
  const categories = ['Все', ...new Set(items.map((k) => k.category))];
  const filtered = items.filter((k) =>
    (category === 'Все' || k.category === category) &&
    (!query || (k.question + k.answer).toLowerCase().includes(query.toLowerCase())));

  return `
  <div class="page-head">
    <div><h2>База знаний</h2><p>Ответы на вопросы клиентов — агент использует их в переписке</p></div>
    <div class="page-actions"><button class="btn primary" id="add-knowledge">${icon('plus', 15)} Добавить ответ</button></div>
  </div>

  <div class="grid g4 mb">
    <div class="kpi-card"><div class="kpi-top"><div class="kpi-ic">${icon('book', 16)}</div></div><div class="kpi-val" style="font-size:23px">${items.length}</div><div class="kpi-name">Записей в базе знаний</div></div>
    <div class="kpi-card purple"><div class="kpi-top"><div class="kpi-ic">${icon('target', 16)}</div></div><div class="kpi-val" style="font-size:23px">${new Set(items.map((k) => k.category)).size}</div><div class="kpi-name">Категорий</div></div>
    <div class="kpi-card green"><div class="kpi-top"><div class="kpi-ic">${icon('check', 16)}</div></div><div class="kpi-val" style="font-size:23px">${items.filter((k) => k.source !== 'Вручную').length}</div><div class="kpi-name">Из внешних источников</div></div>
    <div class="kpi-card orange"><div class="kpi-top"><div class="kpi-ic">${icon('sparkles', 16)}</div></div><div class="kpi-val" style="font-size:23px">AI</div><div class="kpi-name">Используется агентом автоматически</div></div>
  </div>

  ${adding ? `<div class="card mb" style="border-color:var(--primary)">
    <div class="card-head"><div class="card-title">${icon('plus', 15)} Новый ответ</div><button class="btn ghost sm" id="cancel-add">${icon('close', 14)}</button></div>
    <div class="card-pad">
      <div class="grid g2"><div class="field"><label>Вопрос клиента</label><input class="input" id="k-q" placeholder="Например, Сколько стоит маникюр?" /></div>
      <div class="field"><label>Категория</label><select class="select" id="k-cat"><option>Услуги</option><option>Цены</option><option>Запись</option><option>Контакты</option><option>Акции</option><option>FAQ</option></select></div></div>
      <div class="field mt"><label>Ответ агента</label><textarea class="textarea" id="k-a" placeholder="Краткий и понятный ответ, который агент скажет клиенту"></textarea></div>
      <div class="flex mt" style="justify-content:flex-end"><button class="btn" id="cancel-add-2">Отмена</button><button class="btn primary" id="save-k">${icon('check', 14)} Сохранить в базу знаний</button></div>
    </div></div>` : ''}

  <div class="card">
    <div class="card-head">
      <div class="flex"><div class="card-title">${icon('book', 15)} Вопросы и ответы</div><span class="badge gray">${filtered.length}</span></div>
      <div class="flex"><div class="search-box" style="width:220px;display:flex">${icon('search', 15)}<input id="k-search" value="${esc(query)}" placeholder="Поиск по базе…" /></div></div>
    </div>
    <div class="card-pad" style="padding-top:10px">
      <div class="chip-row mb">${categories.map((c) => `<button class="chip ${category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      ${filtered.map((k) => `<div class="faq-item">
        <div class="faq-q"><b>${esc(k.question)}</b><p>${esc(k.answer)}</p>
          <div class="flex mt" style="gap:6px"><span class="badge purple">${esc(k.category)}</span><span class="badge gray">${esc(k.source)}</span><span class="text-xs text-muted">${fmtDate(k.created_at)}</span></div></div>
        <div class="flex"><button class="faq-a" data-edit="${k.id}">${icon('edit', 13)} Изменить</button><button class="faq-a" data-del="${k.id}">${icon('trash', 13)}</button></div>
      </div>`).join('') || '<div class="empty"><div class="em-ic">📚</div><h4>Ничего не найдено</h4><p>Измените запрос или добавьте новый ответ</p></div>'}
    </div>
  </div>

  <div class="card mt">
    <div class="card-head"><div class="card-title">${icon('file', 15)} Загрузка документов</div><span class="card-sub">Прайс-листы, инструкции, FAQ</span></div>
    <div class="card-pad">
      <div style="border:2px dashed var(--border-2);border-radius:12px;padding:28px;text-align:center;color:var(--muted)">
        <div style="font-size:28px;margin-bottom:6px">📄</div><b style="color:var(--text);font-size:13px">Перетащите файлы сюда</b>
        <p class="text-sm">Поддерживаются PDF, DOCX, TXT и CSV. В MVP загрузка файлов эмулируется — добавьте содержимое вручную как запись базы знаний.</p>
        <button class="btn sm" id="fake-upload">${icon('plus', 14)} Выбрать файл</button>
      </div>
    </div>
  </div>`;
}

export function bind(root, { state, refresh, rerender }) {
  const search = root.querySelector('#k-search');
  search.oninput = (e) => { query = e.target.value; const pos = search.selectionStart; rerender(); const s2 = document.getElementById('k-search'); s2.focus(); s2.setSelectionRange(pos, pos); };
  root.querySelectorAll('[data-cat]').forEach((el) => el.onclick = () => { category = el.dataset.cat; rerender(); });
  document.getElementById('add-knowledge').onclick = () => { adding = true; rerender(); setTimeout(() => document.getElementById('k-q')?.focus(), 50); };
  document.getElementById('cancel-add')?.addEventListener('click', () => { adding = false; rerender(); });
  document.getElementById('cancel-add-2')?.addEventListener('click', () => { adding = false; rerender(); });
  document.getElementById('save-k')?.addEventListener('click', async () => {
    const q = document.getElementById('k-q').value.trim();
    const answer = document.getElementById('k-a').value.trim();
    if (!q || !answer) return toast('Заполните вопрос и ответ', 'err');
    await api('/api/knowledge', { method: 'POST', body: { question: q, answer, category: document.getElementById('k-cat').value } });
    adding = false;
    toast('Ответ добавлен в базу знаний', 'ok');
    await refresh();
  });
  document.getElementById('fake-upload').onclick = () => toast('В MVP добавьте запись вручную через «Добавить ответ»');
  root.querySelectorAll('[data-edit]').forEach((el) => el.onclick = async () => {
    const item = state.knowledge.find((k) => k.id === el.dataset.edit);
    modal('Изменить ответ', `
      <div class="field"><label>Вопрос</label><input class="input" id="ed-q" value="${esc(item.question)}" /></div>
      <div class="field mt"><label>Ответ</label><textarea class="textarea" id="ed-a">${esc(item.answer)}</textarea></div>`,
      async () => {
        await api(`/api/knowledge/${item.id}`, { method: 'PUT', body: { question: document.getElementById('ed-q').value, answer: document.getElementById('ed-a').value } });
        toast('Ответ обновлён', 'ok'); await refresh();
      });
  });
  root.querySelectorAll('[data-del]').forEach((el) => el.onclick = () => {
    modal('Удалить ответ?', 'Запись исчезнет из базы знаний, и агент перестанет её использовать.', async () => {
      await api(`/api/knowledge/${el.dataset.del}`, { method: 'DELETE' });
      toast('Ответ удалён', 'ok'); await refresh();
    });
  });
}
