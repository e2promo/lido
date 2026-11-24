import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { now, plain, plainAll, getSetting, setSetting, uid, hashPassword } from './util.js';
import { getTemplate, agentSettingsFromTemplate } from './templates.js';

export const DEFAULT_ORG_ID = 'demo';
export const orgStorage = new AsyncLocalStorage();

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultDb = new DatabaseSync(path.join(DATA_DIR, 'lido.db'));
export const db = new Proxy({}, {
  get(_target, prop) {
    const target = orgStorage.getStore() || defaultDb;
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
defaultDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Услуги',
  source TEXT NOT NULL DEFAULT 'Вручную',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dialogs (
  id TEXT PRIMARY KEY,
  peer_id TEXT NOT NULL,
  vk_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Сообщество ВК',
  status TEXT NOT NULL DEFAULT 'new',
  phone TEXT,
  manager TEXT,
  notes TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 1,
  stage TEXT NOT NULL DEFAULT 'greeting',
  refusal_reason TEXT,
  created_at TEXT NOT NULL,
  first_reply_at TEXT,
  phone_at TEXT,
  last_message_at TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dialog_id TEXT NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  vk_message_id TEXT,
  delivered INTEGER NOT NULL DEFAULT 1,
  delivery_error TEXT
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dialog_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_dialog ON messages(dialog_id);
CREATE INDEX IF NOT EXISTS idx_dialogs_status ON dialogs(status);
`);

const messageColumns = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
if (!messageColumns.includes('vk_message_id')) db.exec('ALTER TABLE messages ADD COLUMN vk_message_id TEXT');
if (!messageColumns.includes('delivered')) db.exec('ALTER TABLE messages ADD COLUMN delivered INTEGER NOT NULL DEFAULT 1');
if (!messageColumns.includes('delivery_error')) db.exec('ALTER TABLE messages ADD COLUMN delivery_error TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_vk_id ON messages(vk_message_id) WHERE vk_message_id IS NOT NULL');

export function addLog(level, message, meta = {}) {
  db.prepare('INSERT INTO logs (level, message, meta, created_at) VALUES (?, ?, ?, ?)')
    .run(level, message, JSON.stringify(meta), now());
}

export function recordUsage({ dialogId = null, provider = 'demo', model = '', inputTokens = 0, outputTokens = 0, cost = 0 }) {
  db.prepare(`INSERT INTO ai_usage (dialog_id, provider, model, input_tokens, output_tokens, cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(dialogId, provider, model, Math.round(inputTokens), Math.round(outputTokens), Number(cost.toFixed(4)), now());
}

export function getUsageTotals(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const total = db.prepare(`SELECT COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens, COALESCE(SUM(cost), 0) AS cost,
      COUNT(*) AS calls FROM ai_usage WHERE created_at >= ?`).get(since);
  const byProvider = plainAll(db.prepare(`SELECT provider, model,
      SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
      SUM(cost) AS cost, COUNT(*) AS calls
      FROM ai_usage WHERE created_at >= ? GROUP BY provider, model ORDER BY cost DESC`).all(since));
  const daily = [];
  for (let i = Math.min(days, 14) - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const row = db.prepare(`SELECT COALESCE(SUM(input_tokens),0) AS inputTokens,
      COALESCE(SUM(output_tokens),0) AS outputTokens, COALESCE(SUM(cost),0) AS cost
      FROM ai_usage WHERE substr(created_at,1,10) = ?`).get(d);
    daily.push({ date: d, ...row });
  }
  return { inputTokens: total.inputTokens, outputTokens: total.outputTokens, cost: total.cost, calls: total.calls, byProvider, daily };
}

export function getDialog(id) {
  return plain(db.prepare('SELECT * FROM dialogs WHERE id = ?').get(id));
}

export function getMessages(dialogId) {
  return plainAll(db.prepare('SELECT * FROM messages WHERE dialog_id = ? ORDER BY id').all(dialogId));
}

export function hasVkMessage(vkMessageId) {
  if (!vkMessageId) return false;
  return Boolean(db.prepare('SELECT id FROM messages WHERE vk_message_id = ?').get(String(vkMessageId)));
}

export function updateDialog(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getDialog(id);
  const sql = `UPDATE dialogs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map((k) => fields[k]), id);
  return getDialog(id);
}

export function createDialog(data) {
  const id = data.id || uid('d_');
  db.prepare(`INSERT INTO dialogs
    (id, peer_id, vk_id, client_name, profile_url, source, status, phone, manager, notes,
     consent, stage, refusal_reason, created_at, first_reply_at, phone_at, last_message_at, unread, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.peer_id, data.vk_id, data.client_name, data.profile_url,
    data.source || 'Сообщество ВК', data.status || 'new', data.phone || null,
    data.manager || null, data.notes || '', data.consent ?? 1, data.stage || 'greeting',
    data.refusal_reason || null, data.created_at || now(), data.first_reply_at || null,
    data.phone_at || null, data.last_message_at || data.created_at || now(),
    data.unread ?? 0, JSON.stringify(data.meta || {}),
  );
  return getDialog(id);
}

export function addMessage(dialogId, direction, author, text, createdAt = now(), meta = {}, extra = {}) {
  const result = db.prepare(`INSERT INTO messages (dialog_id, direction, author, text, created_at, meta, vk_message_id, delivered, delivery_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    dialogId, direction, author, text, createdAt, JSON.stringify(meta),
    extra.vkMessageId || null,
    extra.delivered === false ? 0 : extra.delivered === true ? 1 : (extra.delivered ?? 1),
    extra.deliveryError || null,
  );
  db.prepare('UPDATE dialogs SET last_message_at = ?, unread = CASE WHEN ? = \'in\' THEN unread + 1 ELSE unread END WHERE id = ?')
    .run(createdAt, direction, dialogId);
  return Number(result.lastInsertRowid);
}

const DEFAULT_SETTINGS = {
  vk: {
    connected: true,
    communityName: 'Локон — студия красоты',
    communityId: '128452301',
    status: 'ok',
    tokenConfigured: false,
    secret: 'lido_demo_secret',
    confirmationToken: '',
    permissions: ['messages', 'manage', 'groups'],
    lastSync: 'только что',
    scopesNote: 'Для работы нужны права «Сообщения» и «Управление сообществом».',
  },
  agent: {
    name: 'Аня',
    style: 'дружелюбный',
    greeting: 'Здравствуйте! 👋 Я Аня, помогу с записью и отвечу на вопросы. Что вас интересует?',
    company: 'Студия красоты «Локон»',
    about: 'Студия красоты в Москве, работает с 2016 года. Стрижки, окрашивание, маникюр, брови, уходовые процедуры. Мастера с сертификатами, стерильный инструмент, кофе и чай в подарок.',
    goal: 'phone',
    goalHint: 'Получить номер телефона и записать клиента',
    pitch: 'Оставьте номер телефона — мастер перезвонит и подберёт удобное время. Это займёт меньше минуты.',
    logic: 'Сначала выявить потребность, ответить на вопросы, затем ненавязчиво предложить оставить номер.',
    restrictions: ['Не обсуждать цены конкурентов', 'Не обещать скидки без согласования', 'Не писать по-английски'],
    forbidden: ['Политика', 'Религия', 'Здоровье и диагнозы'],
    onUnknown: 'Вежливо уточнить вопрос и предложить связаться с менеджером.',
    fallback: 'Передать диалог живому менеджеру',
    handoffPhrases: 'менеджер, человек, оператор, перезвоните мне',
    maxMessages: 12,
    delaySec: 2,
    workingHours: 'Ежедневно 09:00–21:00',
    enabled: true,
    mode: 'auto',
  },
  ai: {
    provider: 'demo',
    model: 'Демо-движок (встроенный)',
    temperature: 0.7,
    yandex: { folderId: '', apiKey: '', model: 'yandexgpt/latest' },
    gigachat: { clientId: '', clientSecret: '', model: 'GigaChat' },
    openai: { baseUrl: '', apiKey: '', model: 'gpt-4o-mini' },
  },
  notifications: {
    telegram: { enabled: false, botToken: '', chatId: '' },
    events: ['КОНТАКТ ПОЛУЧЕН', 'Передан менеджеру', 'Отказ от номера', 'Ошибка подключения'],
    digest: true,
  },
  billing: {
    tariff: 'pro',
    tariffName: 'Профессиональный',
    price: 2490,
    messagesUsed: 1243,
    messagesLimit: 5000,
    trial: false,
    nextPayment: '23 декабря 2026',
    costPerDialog: 3.4,
  },
  aiPricing: {
    currency: 'RUB',
    prices: {
      demo: { input: 0, output: 0, label: 'Демо-движок (встроенный)' },
      yandex: { input: 15, output: 90, label: 'YandexGPT' },
      gigachat: { input: 25, output: 120, label: 'GigaChat' },
      openai: { input: 90, output: 270, label: 'OpenAI-совместимый' },
    },
    defaults: { dialogsPerMonth: 1000, messagesPerDialog: 12, inputTokensPerMessage: 700, outputTokensPerMessage: 160 },
    note: 'Цены заданы для оценки и редактируются в разделе «Экономика ИИ». Уточняйте актуальные тарифы у провайдера.',
  },
  compliance: {
    consentRequired: true,
    consentText: 'Нажимая «Отправить», вы соглашаетесь на обработку персональных данных в соответствии с 152-ФЗ.',
    policyVersion: '1.0',
    redisentionDays: 90,
  },
};

const KNOWLEDGE = [
  ['Сколько стоит стрижка?', 'Стрижка — от 2 500 ₽. Стоимость зависит от длины волос и категории мастера. Точную цену мастер назовёт при записи.', 'Цены', 'Прайс-лист'],
  ['Сколько стоит стрижка + брови?', 'Стрижка и оформление бровей вместе — 3 800 ₽. Это выгоднее, чем отдельно.', 'Цены', 'Прайс-лист'],
  ['Делаете ли вы окрашивание?', 'Да, делаем окрашивание, мелирование и тонирование. Стоимость от 4 500 ₽, включает консультацию колориста.', 'Услуги', 'Сайт'],
  ['Маникюр и педикюр', 'Классический маникюр — 2 200 ₽, с покрытием — 2 900 ₽. Педикюр — 3 200 ₽. Записывайтесь заранее, мест немного.', 'Цены', 'Прайс-лист'],
  ['Ламинирование волос', 'Да, делаем ламинирование — 4 000 ₽, эффект держится до 2 месяцев. Часто совмещаем со стрижкой.', 'Услуги', 'Сайт'],
  ['Лазерная эпиляция', 'Есть лазерная эпиляция на косметологическом оборудовании. Стоимость процедуры от 1 800 ₽ за зону. Нужна консультация.', 'Услуги', 'Сайт'],
  ['Часы работы и адрес', 'Мы работаем ежедневно с 9:00 до 21:00. Адрес: Москва, ул. Тверская, 18, 2 этаж. Метро Пушкинская.', 'Контакты', 'Сайт'],
  ['Как записаться?', 'Записаться можно прямо здесь — оставьте номер телефона, и администратор перезвонит в течение 15 минут, чтобы выбрать время.', 'Запись', 'FAQ'],
  ['Есть ли скидки?', 'Для новых клиентов действует скидка 10% на первую процедуру. Также есть карта постоянного клиента.', 'Акции', 'FAQ'],
  ['Можно ли перенести запись?', 'Да, перенести запись можно по телефону не позднее чем за 3 часа до визита.', 'Запись', 'FAQ'],
];

const SEED_DIALOGS = [
  {
    id: 'd_katerina', peer: '184523901', vk: 'id184523901', name: 'Екатерина Морозова',
    status: 'contact_received', phone: '+7 916 123-45-67', consent: 1, stage: 'done',
    created: 34, manager: 'Мария Соколова', notes: 'Запись на стрижку + брови, предпочтительно вечер.',
    messages: [
      ['in', 'Здравствуйте! Подскажите, сколько стоит стрижка?', 'Клиент', 0],
      ['out', 'Здравствуйте! 👋 Стрижка в нашей студии — от 2 500 ₽. Вас интересует только стрижка или что-то ещё?', 'Аня', 1],
      ['in', 'Да ещё брови хочу поправить', 'Клиент', 3],
      ['out', 'Отлично! Стрижка + оформление бровей — 3 800 ₽. Завтра есть свободные окошки. Оставьте, пожалуйста, номер — мастер перезвонит и подтвердит удобное время 🙂', 'Аня', 4],
      ['in', '+7 (916) 123-45-67', 'Клиент', 6],
      ['out', 'Спасибо! Записала +7 916 123-45-67. Мастер свяжется с вами в течение 15 минут. До встречи! ✨', 'Аня', 6],
    ],
  },
  {
    id: 'd_maria', peer: '172234560', vk: 'id172234560', name: 'Мария Литвинова',
    status: 'in_progress', phone: null, consent: 1, stage: 'value', created: 18,
    messages: [
      ['in', 'Добрый день! Делаете ли вы ламинирование волос?', 'Клиент', 0],
      ['out', 'Добрый день! Да, делаем ламинирование — 4 000 ₽, эффект держится до 2 месяцев. Можно совместить со стрижкой.', 'Аня', 1],
      ['in', 'Интересно. А сколько по времени занимает?', 'Клиент', 4],
      ['out', 'Процедура занимает около 1,5 часов. Мастер подробно расскажет всё на месте. Хотите, перезвоним и запишем?', 'Аня', 5],
    ],
  },
  {
    id: 'd_olga', peer: '159887341', vk: 'id159887341', name: 'Ольга Белова',
    status: 'new', phone: null, consent: 1, stage: 'greeting', created: 4,
    messages: [
      ['in', 'Здравствуйте, есть свободное время на завтра?', 'Клиент', 0],
    ],
  },
  {
    id: 'd_anna', peer: '191120087', vk: 'id191120087', name: 'Анна Ковалёва',
    status: 'contact_received', phone: '+7 903 555-12-34', consent: 1, stage: 'done',
    created: 62, manager: 'Мария Соколова', notes: 'Маникюр с покрытием, записать на пятницу.',
    messages: [
      ['in', 'Здравствуйте! Хочу записаться на маникюр', 'Клиент', 0],
      ['out', 'Здравствуйте! 🙂 Маникюр с покрытием — 2 900 ₽. На этой неделе есть свободные дни. Оставьте номер телефона, пожалуйста — перезвоним и выберем время.', 'Аня', 1],
      ['in', 'Хорошо, 8 903 555 12 34', 'Клиент', 3],
      ['out', 'Принято! +7 903 555-12-34 записала. Менеджер перезвонит в ближайшие 15 минут. Спасибо! 💜', 'Аня', 3],
    ],
  },
  {
    id: 'd_dmitry', peer: '166342819', vk: 'id166342819', name: 'Дмитрий Соколов',
    status: 'refused', phone: null, consent: 1, stage: 'refused',
    refusal_reason: 'Не готов оставлять номер', created: 47,
    messages: [
      ['in', 'Сколько стоит подстричься?', 'Клиент', 0],
      ['out', 'Здравствуйте! Стрижка — от 2 500 ₽. Если оставите номер, мастер сможет назвать точную стоимость и сразу записать.', 'Аня', 1],
      ['in', 'Нет, спасибо, я просто узнаю цены', 'Клиент', 2],
      ['out', 'Понял вас, ничего не навязываю 🙂 Если передумаете — напишите сюда, с радостью помогу. Хорошего дня!', 'Аня', 2],
    ],
  },
  {
    id: 'd_irina', peer: '143209876', vk: 'id143209876', name: 'Ирина Петрова',
    status: 'handoff', phone: null, consent: 1, stage: 'handoff', created: 26,
    manager: 'Мария Соколова', notes: 'Клиент попросил живого менеджера.',
    messages: [
      ['in', 'Здравствуйте, у меня вопрос по окрашиванию', 'Клиент', 0],
      ['out', 'Здравствуйте! С радостью помогу. Окрашивание от 4 500 ₽, включает консультацию колориста. Что именно вас интересует?', 'Аня', 1],
      ['in', 'Мне лучше поговорить с человеком', 'Клиент', 3],
      ['out', 'Конечно, передаю вас менеджеру. Мария свяжется с вами в течение нескольких минут.', 'Аня', 3],
      ['out', 'Система: диалог передан менеджеру Марии Соколовой', 'Система', 3],
    ],
  },
  {
    id: 'd_svetlana', peer: '188456712', vk: 'id188456712', name: 'Светлана Орлова',
    status: 'contact_received', phone: '+7 985 777-88-99', consent: 1, stage: 'done',
    created: 95, manager: 'Алексей Иванов', notes: 'Лазерная эпиляция, нужна консультация.',
    messages: [
      ['in', 'Добрый день! Делаете лазерную эпиляцию?', 'Клиент', 0],
      ['out', 'Добрый день! Да, от 1 800 ₽ за зону. Перед процедурой нужна бесплатная консультация специалиста.', 'Аня', 1],
      ['in', 'Да, интересно', 'Клиент', 5],
      ['out', 'Отлично! Оставьте номер — запишем вас на консультацию, специалист перезвонит и уточнит зоны.', 'Аня', 6],
      ['in', '+79857778899', 'Клиент', 8],
      ['out', 'Спасибо! +7 985 777-88-99 записала, консультант перезвонит в течение 15 минут ✨', 'Аня', 8],
    ],
  },
  {
    id: 'd_alexey', peer: '155678903', vk: 'id155678903', name: 'Алексей Новиков',
    status: 'in_progress', phone: null, consent: 1, stage: 'need', created: 12,
    messages: [
      ['in', 'А можно прайс?', 'Клиент', 0],
      ['out', 'Конечно! Основное: стрижка от 2 500 ₽, окрашивание от 4 500 ₽, маникюр от 2 200 ₽. Что именно вас интересует?', 'Аня', 1],
    ],
  },
  {
    id: 'd_natalya', peer: '177889021', vk: 'id177889021', name: 'Наталья Фёдорова',
    status: 'closed', phone: '+7 916 000-11-22', consent: 1, stage: 'done',
    created: 240, manager: 'Мария Соколова', notes: 'Клиент записан, визит состоялся.',
    messages: [
      ['in', 'Здравствуйте! Хочу записаться на уходовую процедуру', 'Клиент', 0],
      ['out', 'Здравствуйте! Уходовые процедуры от 3 500 ₽. Оставьте номер, пожалуйста — подберём время.', 'Аня', 1],
      ['in', '9160001122', 'Клиент', 2],
      ['out', 'Спасибо! +7 916 000-11-22 записала, менеджер перезвонит. До встречи! 💜', 'Аня', 2],
      ['out', 'Система: лид обработан, диалог завершён', 'Система', 30],
    ],
  },
  {
    id: 'd_polina', peer: '199045678', vk: 'id199045678', name: 'Полина Сергеева',
    status: 'new', phone: null, consent: 1, stage: 'greeting', created: 2,
    messages: [
      ['in', 'Добрый день! Вы работаете в воскресенье?', 'Клиент', 0],
    ],
  },
  {
    id: 'd_elena', peer: '134567890', vk: 'id134567890', name: 'Елена Тихонова',
    status: 'contact_received', phone: '+7 962 111-22-33', consent: 1, stage: 'done',
    created: 130, notes: 'Брови, подписана на рассылку.',
    messages: [
      ['in', 'Здравствуйте! Сколько стоит оформление бровей?', 'Клиент', 0],
      ['out', 'Здравствуйте! Оформление бровей — 1 500 ₽, с окрашиванием — 1 900 ₽. Запишем вас?', 'Аня', 1],
      ['in', 'Да, давайте', 'Клиент', 2],
      ['out', 'Супер! Оставьте номер телефона — мастер перезвонит и выберет время 🙂', 'Аня', 2],
      ['in', '+7 (962) 111-22-33', 'Клиент', 4],
      ['out', 'Готово! +7 962 111-22-33 записала. Менеджер свяжется в течение 15 минут ✨', 'Аня', 4],
    ],
  },
  {
    id: 'd_maxim', peer: '156789012', vk: 'id156789012', name: 'Максим Егоров',
    status: 'refused', phone: null, consent: 1, stage: 'refused',
    refusal_reason: 'Не хочет оставлять контакт', created: 75,
    messages: [
      ['in', 'Привет. Сколько у вас стоит маникюр?', 'Клиент', 0],
      ['out', 'Здравствуйте! Маникюр с покрытием — 2 900 ₽. Если оставите номер, сразу запишем на удобное время.', 'Аня', 1],
      ['in', 'Не буду оставлять номер', 'Клиент', 2],
      ['out', 'Без проблем 🙂 Цена маникюра с покрытием — 2 900 ₽. Если решите записаться — просто напишите сюда. Хорошего дня!', 'Аня', 2],
    ],
  },
];

function seed() {
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    db.prepare(`INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run('u_demo', 'Анастасия Волкова', 'demo@lido.ru', hashPassword('lido2026'), now(-8000));
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!getSetting(db, key)) setSetting(db, key, value);
  }
  if (!db.prepare('SELECT id FROM knowledge LIMIT 1').get()) {
    const stmt = db.prepare(`INSERT INTO knowledge (id, question, answer, category, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    KNOWLEDGE.forEach(([q, a, c, s], i) => stmt.run(`k_${i + 1}`, q, a, c, s, now(-1000 + i)));
  }
  if (!db.prepare('SELECT id FROM dialogs LIMIT 1').get()) {
    const dStmt = db.prepare(`INSERT INTO dialogs
      (id, peer_id, vk_id, client_name, profile_url, source, status, phone, manager, notes, consent,
       stage, refusal_reason, created_at, first_reply_at, phone_at, last_message_at, unread, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const mStmt = db.prepare(`INSERT INTO messages (dialog_id, direction, author, text, created_at, meta)
      VALUES (?, ?, ?, ?, ?, '{}')`);
    for (const d of SEED_DIALOGS) {
      const createdAt = now(-d.created);
      const firstReply = d.messages.find((m) => m[0] === 'out');
      const phoneMsg = d.messages.find((m) => m[1].replace(/\D/g, '').length >= 10);
      const lastOffset = d.messages[d.messages.length - 1][3];
      dStmt.run(d.id, d.peer, d.vk, d.name, `https://vk.com/${d.vk}`, 'Сообщество ВК',
        d.status, d.phone, d.manager || null, d.notes || '', d.consent, d.stage,
        d.refusal_reason || null, createdAt,
        firstReply ? now(-d.created + firstReply[3]) : null,
        phoneMsg ? now(-d.created + phoneMsg[3]) : null,
        now(-d.created + lastOffset), d.status === 'new' ? 1 : 0, '{}');
      for (const [direction, text, author, offset] of d.messages) {
        mStmt.run(d.id, direction, author, text, now(-d.created + offset));
      }
    }
    db.prepare(`INSERT INTO logs (level, message, meta, created_at) VALUES (?, ?, ?, ?)`)
      .run('info', 'ИИ-агент «Аня» запущен', '{}', now(-34));
    db.prepare(`INSERT INTO logs (level, message, meta, created_at) VALUES (?, ?, ?, ?)`)
      .run('success', 'Получен номер телефона: Екатерина Морозова', '{}', now(-28));
    db.prepare(`INSERT INTO logs (level, message, meta, created_at) VALUES (?, ?, ?, ?)`)
      .run('info', 'Диалог передан менеджеру: Ирина Петрова', '{}', now(-23));
  }

  if (!db.prepare('SELECT id FROM ai_usage LIMIT 1').get()) {
    const uStmt = db.prepare(`INSERT INTO ai_usage (dialog_id, provider, model, input_tokens, output_tokens, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const dialogIds = db.prepare('SELECT id FROM dialogs').all().map((r) => r.id);
    let counter = 0;
    for (let day = 13; day >= 0; day--) {
      const calls = 3 + ((day * 7) % 6);
      for (let i = 0; i < calls; i++) {
        const inputTokens = 600 + ((day * 53 + i * 37) % 400);
        const outputTokens = 130 + ((day * 17 + i * 11) % 90);
        const cost = (inputTokens / 1_000_000) * 15 + (outputTokens / 1_000_000) * 90;
        uStmt.run(dialogIds[counter % dialogIds.length] || null, 'yandex', 'yandexgpt/latest',
          inputTokens, outputTokens, Number(cost.toFixed(4)), now(-day * 1440 + i * 7));
        counter++;
      }
    }
  }
}

seed();

const orgDbCache = new Map([[DEFAULT_ORG_ID, defaultDb]]);

function seedOrganization(database, templateId, companyName) {
  const template = getTemplate(templateId);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    let finalValue = value;
    if (key === 'agent') finalValue = agentSettingsFromTemplate(template, companyName);
    if (key === 'vk') finalValue = { ...value, connected: false, communityName: companyName, status: 'off' };
    database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(finalValue));
  }
  const kStmt = database.prepare(`INSERT INTO knowledge (id, question, answer, category, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  template.knowledge.forEach(([q, a, c], i) => kStmt.run(`k_${i + 1}`, q, a, c, 'Шаблон', now(-100 + i)));
  database.prepare(`INSERT INTO logs (level, message, meta, created_at) VALUES (?, ?, ?, ?)`)
    .run('success', `Рабочее пространство «${companyName}» создано`, '{}', now());
}

export function openOrgDb(orgId, templateId = 'universal', companyName = 'Моя компания') {
  if (orgDbCache.has(orgId)) return orgDbCache.get(orgId);
  const file = path.join(DATA_DIR, `org_${orgId}.db`);
  const isNew = !fs.existsSync(file);
  const database = new DatabaseSync(file);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (isNew) {
    const objects = defaultDb.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all();
    const skip = new Set(['users', 'sessions', 'organizations']);
    for (const object of objects) {
      if (skip.has(object.name)) continue;
      if (object.type === 'index' || object.type === 'table' || object.type === 'trigger') database.exec(object.sql);
    }
    seedOrganization(database, templateId, companyName);
  }
  orgDbCache.set(orgId, database);
  return database;
}

export function withOrg(orgId, fn) {
  return orgStorage.run(openOrgDb(orgId), fn);
}

export function closeOrgDb(orgId) {
  const database = orgDbCache.get(orgId);
  if (database && orgId !== DEFAULT_ORG_ID) { database.close(); orgDbCache.delete(orgId); }
}
