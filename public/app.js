import { api, setToken, getToken, icon, esc, toast, timeAgo, navigate, modal } from './lib.js';
import * as dashboard from './pages/dashboard.js';
import * as vk from './pages/vk.js';
import * as agent from './pages/agent.js';
import * as knowledge from './pages/knowledge.js';
import * as dialogs from './pages/dialogs.js';
import * as chat from './pages/chat.js';
import * as lead from './pages/lead.js';
import * as analytics from './pages/analytics.js';
import * as settings from './pages/settings.js';
import * as testing from './pages/testing.js';
import * as economics from './pages/economics.js';
import * as models from './pages/models.js';

export const state = {
  user: null, settings: {}, dashboard: {}, dialogs: [], knowledge: [], tariffs: [], analytics: null, logs: [],
  route: 'dashboard', params: {}, selectedDialogId: null, testHistory: [], logsOpen: false, dialogQuery: '', orgSwitchOpen: false,
};

const PAGES = {
  dashboard: { title: 'Главная', sub: 'Обзор работы ИИ-агента', icon: 'dashboard', module: dashboard, group: 'Рабочее пространство' },
  dialogs: { title: 'Диалоги', sub: 'Все обращения клиентов', icon: 'chat', module: dialogs, group: 'Рабочее пространство' },
  analytics: { title: 'Аналитика', sub: 'Эффективность и конверсия', icon: 'chart', module: analytics, group: 'Рабочее пространство' },
  vk: { title: 'Подключение ВК', sub: 'Сообщество и доступы', icon: 'plug', module: vk, group: 'Настройка агента' },
  agent: { title: 'ИИ-агент', sub: 'Характер, цели и логика', icon: 'bot', module: agent, group: 'Настройка агента' },
  knowledge: { title: 'База знаний', sub: 'Услуги, цены и ответы', icon: 'book', module: knowledge, group: 'Настройка агента' },
  testing: { title: 'Тестирование', sub: 'Проверьте агента перед запуском', icon: 'flask', module: testing, group: 'Настройка агента' },
  models: { title: 'Модели ИИ', sub: 'Выберите модель и подключите ключи', icon: 'sparkles', module: models, group: 'Настройка агента' },
  economics: { title: 'Экономика ИИ', sub: 'Модели, цены и стоимость диалога', icon: 'wallet', module: economics, group: 'Система' },
  settings: { title: 'Настройки', sub: 'Интеграции, тариф и безопасность', icon: 'settings', module: settings, group: 'Система' },
  chat: { title: 'Переписка', sub: 'Диалог с клиентом', icon: 'message', module: chat, group: 'Рабочее пространство' },
  lead: { title: 'Карточка лида', sub: 'Информация о клиенте', icon: 'user', module: lead, group: 'Рабочее пространство' },
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [route, param] = raw.split('/');
  return { route: PAGES[route] ? route : 'dashboard', param: param || null };
}

function navItem(key) {
  const p = PAGES[key];
  const active = state.route === key || (key === 'dialogs' && (state.route === 'chat' || state.route === 'lead'));
  let badge = '';
  if (key === 'dialogs' && state.dashboard?.newCount) badge = `<span class="nav-badge">${state.dashboard.newCount}</span>`;
  return `<button class="nav-item ${active ? 'active' : ''}" data-nav="${key}">${icon(p.icon)}<span>${p.title}</span>${badge}</button>`;
}

function sidebar() {
  const groups = ['Рабочее пространство', 'Настройка агента', 'Система'];
  return `<aside class="sidebar" id="sidebar">
    <div class="brand"><div class="logo-mark">Л</div><span>Лидо</span></div>
    <div class="brand-sub">VK AI ASSISTANT</div>
    <div class="workspace-switch" id="workspace-switch">
      <button class="ws-current" id="ws-toggle">
        <span class="ws-avatar">${esc((state.user?.orgName || 'К').slice(0, 1).toUpperCase())}</span>
        <span class="ws-name truncate">${esc(state.user?.orgName || 'Моя компания')}</span>
        <span class="ws-arrow">▾</span>
      </button>
      ${state.orgSwitchOpen ? `<div class="ws-menu">
        <div class="ws-menu-label">Компании</div>
        ${(state.organizations || []).map((o) => `<button class="ws-item ${o.id === state.user?.orgId ? 'active' : ''}" data-org="${o.id}">${esc(o.name)}</button>`).join('')}
        <button class="ws-item add" id="ws-new">+ Новая компания</button>
      </div>` : ''}
    </div>
    <nav class="nav">
      ${groups.map((g) => `<div class="nav-label">${g}</div>
        ${Object.keys(PAGES).filter((k) => PAGES[k].group === g).map(navItem).join('')}`).join('')}
    </nav>
    <div class="sidebar-foot">
      <div class="sidebar-user">
        <div class="avatar teal">${esc((state.user?.name || 'АВ').slice(0, 2).toUpperCase())}</div>
        <div><div class="u-name">${esc(state.user?.name || '')}</div><div class="u-mail">${esc(state.user?.email || '')}</div></div>
        <button class="logout" id="logout" title="Выйти">${icon('logout', 16)}</button>
      </div>
    </div>
  </aside>`;
}

function logsPopover() {
  if (!state.logsOpen) return '';
  const logs = state.logs.slice(0, 6);
  return `<div class="card" style="position:absolute;right:60px;top:60px;width:330px;z-index:60;box-shadow:var(--shadow-lg);max-height:400px;overflow:auto">
    <div class="card-head"><div class="card-title">${icon('bell', 15)} Последние события</div><button class="btn ghost sm" data-close-logs>${icon('close', 14)}</button></div>
    <div class="card-pad" style="padding:6px 16px">${logs.length ? logs.map((l) => `<div class="log-line"><span class="log-time">${timeAgo(l.created_at)}</span><span class="log-level ${l.level}">${esc(l.level)}</span><span>${esc(l.message)}</span></div>`).join('') : '<div class="empty">Событий пока нет</div>'}</div>
  </div>`;
}

function topbar() {
  const page = PAGES[state.route];
  const agent = state.settings.agent || {};
  const online = agent.enabled !== false;
  return `<header class="topbar">
    <button class="icon-btn mobile-toggle" id="mobile-toggle">${icon('menu', 18)}</button>
    <div><h1>${page.title}</h1><div class="crumb">Лидо / ${page.sub}</div></div>
    <div class="topbar-actions">
      <div class="search-box">${icon('search', 15)}<input id="global-search" placeholder="Поиск по диалогам…" /></div>
      <div class="status-chip ${online ? '' : 'off'}" id="agent-toggle" title="Включить или выключить агента"><i class="live-dot"></i>${online ? 'Агент работает' : 'Агент выключен'}</div>
      <button class="icon-btn" id="logs-btn" title="События">${icon('bell', 17)}<i class="dot"></i></button>
      <div class="avatar teal" title="${esc(state.user?.name || '')}">${esc((state.user?.name || 'АВ').slice(0, 2).toUpperCase())}</div>
    </div>
    ${logsPopover()}
  </header>`;
}

let loginMode = 'login';

function loginPage() {
  const register = loginMode === 'register';
  return `<div class="login-page">
    <div class="login-hero">
      <div class="login-brand"><div class="logo-mark">Л</div><span>Лидо</span></div>
      <h1>ИИ-агент для любого бизнеса в ВКонтакте</h1>
      <p>Подключите сообщество за 10 минут. Агент ответит на вопросы, выявит потребность и аккуратно соберёт контакты — прямо в сообщениях.</p>
      <div class="hero-badges"><span class="hero-badge">🇷🇺 Россия и СНГ</span><span class="hero-badge">🔒 152-ФЗ</span><span class="hero-badge">🤖 YandexGPT · GigaChat</span><span class="hero-badge">💬 ВКонтакте</span></div>
    </div>
    <div class="login-side"><div class="login-card">
      <h2>${register ? 'Создать компанию' : 'С возвращением'}</h2>
      <p class="sub">${register ? 'Выберите сферу — агент настроится автоматически' : 'Войдите в рабочее пространство Лидо'}</p>
      ${register ? `
        <div class="field"><label>Название компании</label><input class="input" id="reg-company" placeholder="Например, Автосервис «Скорость»" /></div>
        <div class="field mt"><label>Сфера деятельности</label><select class="select" id="reg-industry"></select></div>
        <div class="field mt"><label>Ваше имя</label><input class="input" id="reg-name" placeholder="Как к вам обращаться" /></div>` : ''}
      <div class="field ${register ? 'mt' : ''}"><label>Электронная почта</label><input class="input" id="login-email" type="email" value="${register ? '' : 'demo@lido.ru'}" autocomplete="username" /></div>
      <div class="field mt"><label>Пароль</label><input class="input" id="login-password" type="password" value="${register ? '' : 'lido2026'}" autocomplete="${register ? 'new-password' : 'current-password'}" /></div>
      <button class="btn primary lg" id="login-btn">${icon('arrow', 16)} ${register ? 'Создать аккаунт' : 'Войти'}</button>
      <button class="btn ghost" id="toggle-mode" style="width:100%;justify-content:center;margin-top:10px">${register ? 'Уже есть аккаунт — войти' : 'Нет аккаунта — создать компанию'}</button>
      <div id="login-error" class="hint" style="color:var(--danger);margin-top:10px"></div>
      ${!register ? '<div class="login-note"><b>Демо-доступ:</b> demo@lido.ru / lido2026<br />Пример рабочего пространства салона красоты.</div>' : ''}
    </div></div>
  </div>`;
}

function bindLogin() {
  if (loginMode === 'register') {
    api('/api/templates').then((list) => {
      const select = document.getElementById('reg-industry');
      if (select) select.innerHTML = list.map((t) => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('');
    }).catch(() => {});
    document.getElementById('toggle-mode').onclick = () => { loginMode = 'login'; render(); };
  } else {
    document.getElementById('toggle-mode').onclick = () => { loginMode = 'register'; render(); };
  }

  const submit = async () => {
    const wasRegister = loginMode === 'register';
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    try {
      const data = loginMode === 'register'
        ? await api('/api/register', { method: 'POST', body: {
            email, password,
            company: document.getElementById('reg-company').value,
            name: document.getElementById('reg-name').value || document.getElementById('reg-company').value,
            industry: document.getElementById('reg-industry').value,
          } })
        : await api('/api/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      state.user = data.user;
      loginMode = 'login';
      await loadBootstrap();
      if (!location.hash) location.hash = '#/dashboard';
      render();
      toast(wasRegister ? 'Компания создана — агент настроен по шаблону' : `Привет, ${data.user.name.split(' ')[0]}!`, 'ok');
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
      btn.disabled = false;
    }
  };
  document.getElementById('login-btn').onclick = submit;
  document.getElementById('login-password').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

export async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  Object.assign(state, data);
}

async function refresh() {
  await loadBootstrap();
  render();
}

export { navigate };

function ctx() {
  return { state, refresh, navigate, rerender: render, api };
}

export async function render() {
  const app = document.getElementById('app');
  if (!getToken()) {
    app.innerHTML = loginPage();
    bindLogin();
    return;
  }
  if (!state.user) {
    try { await loadBootstrap(); } catch { setToken(null); app.innerHTML = loginPage(); bindLogin(); return; }
  }
  const parsed = parseHash();
  state.route = parsed.route;
  state.params = parsed.param;
  if (state.route === 'chat' && parsed.param) state.selectedDialogId = parsed.param;
  if (state.route === 'lead' && parsed.param) state.selectedDialogId = parsed.param;
  if ((state.route === 'chat' || state.route === 'lead') && !state.selectedDialogId && state.dialogs?.length) {
    state.selectedDialogId = state.dialogs[0].id;
  }

  app.innerHTML = `<div class="shell">${sidebar()}<div class="main">${topbar()}<main class="content" id="page-root"></main></div></div>`;
  const root = document.getElementById('page-root');
  const page = PAGES[state.route];
  try {
    root.innerHTML = page.module.render(ctx());
    page.module.bind?.(root, ctx());
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="card card-pad"><h3>Ошибка отображения страницы</h3><p class="text-muted">${esc(err.message)}</p></div>`;
  }
  bindShell();
}

async function bindOrgSwitcher() {
  document.querySelectorAll('[data-org]').forEach((el) => el.onclick = async () => {
    await api(`/api/organizations/${el.dataset.org}/select`, { method: 'POST', body: {} });
    state.orgSwitchOpen = false;
    state.selectedDialogId = null;
    await refresh();
    toast('Компания переключена', 'ok');
  });
  const newBtn = document.getElementById('ws-new');
  if (!newBtn) return;
  newBtn.onclick = () => {
    const templates = state.templates || [];
    modal('Новая компания', `
      <div class="field"><label>Название компании</label><input class="input" id="new-org-name" placeholder="Например, Автосервис «Скорость»" /></div>
      <div class="field mt"><label>Сфера деятельности</label><select class="select" id="new-org-industry">
        ${templates.map((t) => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}
      </select></div>
      <div class="hint mt">База знаний и настройки агента будут созданы по выбранному шаблону.</div>`,
      async () => {
        const name = document.getElementById('new-org-name').value.trim() || 'Моя компания';
        const industry = document.getElementById('new-org-industry').value || 'universal';
        const res = await api('/api/organizations', { method: 'POST', body: { name, industry } });
        await api(`/api/organizations/${res.organization.id}/select`, { method: 'POST', body: {} });
        state.orgSwitchOpen = false;
        state.selectedDialogId = null;
        await refresh();
        toast(`Компания «${name}» создана`, 'ok');
      });
  };
}

function bindShell() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.onclick = () => { document.getElementById('sidebar')?.classList.remove('open'); navigate(el.dataset.nav); };
  });
  const wsToggle = document.getElementById('ws-toggle');
  if (wsToggle) wsToggle.onclick = () => { state.orgSwitchOpen = !state.orgSwitchOpen; render(); };
  bindOrgSwitcher();

  const logout = document.getElementById('logout');
  if (logout) logout.onclick = () => { setToken(null); state.user = null; location.hash = ''; render(); };
  const mobile = document.getElementById('mobile-toggle');
  if (mobile) mobile.onclick = () => document.getElementById('sidebar').classList.toggle('open');
  const toggle = document.getElementById('agent-toggle');
  if (toggle) toggle.onclick = async () => {
    const current = state.settings.agent || {};
    current.enabled = !current.enabled;
    await api('/api/settings/agent', { method: 'PUT', body: current });
    toast(current.enabled ? 'ИИ-агент включён' : 'ИИ-агент выключен', 'ok');
    await refresh();
  };
  const logsBtn = document.getElementById('logs-btn');
  if (logsBtn) logsBtn.onclick = async () => {
    if (!state.logsOpen) state.logs = await api('/api/logs?limit=20');
    state.logsOpen = !state.logsOpen;
    render();
  };
  document.querySelector('[data-close-logs]')?.addEventListener('click', () => { state.logsOpen = false; render(); });
  const search = document.getElementById('global-search');
  if (search) search.onkeydown = (e) => {
    if (e.key === 'Enter' && search.value.trim()) { state.dialogQuery = search.value.trim(); navigate('dialogs'); }
  };
}

window.addEventListener('hashchange', () => render());
window.addEventListener('lido:logout', () => { setToken(null); state.user = null; location.hash = ''; render(); });

if (getToken()) {
  loadBootstrap().then(() => { if (!location.hash) location.hash = '#/dashboard'; render(); }).catch(() => { setToken(null); render(); });
} else {
  render();
}
