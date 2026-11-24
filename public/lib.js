const TOKEN_KEY = 'lido_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(value) { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = { error: 'Ошибка сервера' }; }
  if (res.status === 401 && path !== '/api/login') {
    setToken(null);
    window.dispatchEvent(new CustomEvent('lido:logout'));
  }
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 7V5M15 7V5"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 17h6"/>',
  book: '<path d="M4 4a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V4z"/><path d="M4 20a2 2 0 0 1 2-2h13"/>',
  chat: '<path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-4a3 3 0 0 1-2-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21v4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  flask: '<path d="M9 2h6M10 2v7L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V2M7 15h10"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.7M20 5v6h-6"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  zap: '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sparkles: '<path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-5.1a8.4 8.4 0 0 1-1-4 8.5 8.5 0 0 1 8.5-8.5h.5a8.4 8.4 0 0 1 8.1 8z"/>',
  alert: '<path d="M12 3L2 20h20L12 3zM12 9v5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/>',
  rocket: '<path d="M4 15s-1-5 3-9 12-5 12-5 1 8-3 12-9 3-9 3l-3-1zM9 15l-4 4M8 10h.01"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  filter: '<path d="M3 4h18l-7 8v6l-4 2v-8L3 4z"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
  wallet: '<rect x="2" y="5" width="20" height="15" rx="3"/><path d="M2 10h20M16 15h2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6"/>',
  play: '<path d="M6 3l15 9-15 9V3z"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
};

export function icon(name, size = 18) {
  const body = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const STATUS = {
  new: { label: 'Новый', cls: 'blue' },
  in_progress: { label: 'В работе', cls: 'purple' },
  contact_received: { label: 'Телефон получен', cls: 'green' },
  refused: { label: 'Отказ', cls: 'red' },
  handoff: { label: 'У менеджера', cls: 'orange' },
  closed: { label: 'Закрыт', cls: 'gray' },
};

export function badge(status) {
  const s = STATUS[status] || STATUS.new;
  return `<span class="badge ${s.cls}"><i class="dot"></i>${s.label}</span>`;
}

const AVATARS = ['purple', 'pink', 'teal', 'orange', 'blue', 'vk'];
export function avatarClass(name) {
  let sum = 0;
  for (const ch of String(name || '')) sum += ch.charCodeAt(0);
  return AVATARS[sum % AVATARS.length];
}
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '').toUpperCase();
}
export function avatar(name, cls) {
  return `<div class="avatar ${cls || avatarClass(name)}">${esc(initials(name))}</div>`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${fmtTime(iso)}`;
}
export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'только что';
  if (diff < 60) return `${Math.floor(diff)} мин назад`;
  if (diff < 1440) return `${Math.floor(diff / 60)} ч назад`;
  if (diff < 2880) return 'вчера';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
export function money(n) { return `${Number(n || 0).toLocaleString('ru-RU')} ₽`; }
export function pct(n) { return `${String(n).replace('.', ',')}%`; }
export function shortNum(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} тыс.`;
  return String(n);
}

export function navigate(route, param) {
  location.hash = `#/${route}${param ? '/' + encodeURIComponent(param) : ''}`;
}

export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check', 16)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, 3200);
}

export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Скопировано', 'ok')).catch(() => toast('Не удалось скопировать', 'err'));
}

export function modal(title, bodyHtml, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,23,42,.5);z-index:200;display:grid;place-items:center;padding:20px;backdrop-filter:blur(2px)';
  overlay.innerHTML = `<div class="card" style="width:100%;max-width:440px;padding:24px;box-shadow:var(--shadow-lg)">
    <h3 style="margin:0 0 8px;font-size:17px">${esc(title)}</h3>
    <div style="font-size:13px;color:var(--text-2);margin-bottom:20px">${bodyHtml}</div>
    <div class="flex" style="justify-content:flex-end"><button class="btn" data-cancel>Отмена</button><button class="btn primary" data-ok>Подтвердить</button></div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-cancel]').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('[data-ok]').onclick = async () => {
    await onConfirm?.();
    overlay.remove();
  };
}
