import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePhone, extractPhone, formatPhone, isRefusal, refusalReason, isHandoff } from '../server/phone.js';
import { findKnowledge, generateReply } from '../server/ai.js';
import { db } from '../server/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
let server;
let token;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lido-test-'));
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, AI_PROVIDER: 'demo' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) break;
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 150));
  }
});

after(() => { server?.kill(); });

test('нормализация российских номеров телефона', () => {
  assert.equal(normalizePhone('+7 (916) 123-45-67'), '+79161234567');
  assert.equal(normalizePhone('8 903 555 12 34'), '+79035551234');
  assert.equal(normalizePhone('9161234567'), '+79161234567');
  assert.equal(normalizePhone('+79857778899'), '+79857778899');
  assert.equal(normalizePhone('123'), null);
  assert.equal(formatPhone('+79161234567'), '+7 (916) 123-45-67');
});

test('извлечение номера из текста', () => {
  assert.equal(extractPhone('Мой номер +7 (916) 123-45-67, позвоните'), '+79161234567');
  assert.equal(extractPhone('Запишите: 8 985 777 88 99'), '+79857778899');
  assert.equal(extractPhone('Сколько стоит стрижка?'), null);
});

test('определение отказа и передачи менеджеру', () => {
  assert.equal(isRefusal('Нет, спасибо, я просто узнаю цены'), true);
  assert.equal(refusalReason('Не хочу оставлять номер'), 'Не хочет оставлять контакт');
  assert.equal(isRefusal('Здравствуйте, сколько стоит?'), false);
  assert.equal(isHandoff('Можно поговорить с человеком?'), true);
  assert.equal(isHandoff('Делаете маникюр?'), false);
});

test('база знаний и демо-ответ агента', async () => {
  const knowledge = db.prepare('SELECT * FROM knowledge').all().map((r) => ({ ...r }));
  const found = findKnowledge(knowledge, 'Сколько стоит стрижка?');
  assert.ok(found, 'ответ найден в базе знаний');
  const result = await generateReply({
    agent: { name: 'Аня', style: 'дружелюбный', pitch: 'Оставьте номер — перезвоним.' },
    ai: { provider: 'demo' },
    knowledge,
    dialog: { stage: 'greeting', meta: '{}' },
    history: [],
    incoming: 'Здравствуйте, сколько стоит стрижка?',
  });
  assert.match(result.reply, /2 500/);
  assert.match(result.reply, /Оставьте номер/);
  assert.equal(result.need, 'Цены');
});

test('HTTP: вход, загрузка данных и симуляция обращения', async () => {
  const login = await fetch(`http://127.0.0.1:${PORT}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@lido.ru', password: 'lido2026' }),
  });
  assert.equal(login.status, 200);
  const data = await login.json();
  token = data.token;
  assert.ok(token);

  const headers = { Authorization: `Bearer ${token}` };
  const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`, { headers }).then((r) => r.json());
  assert.equal(bootstrap.dialogs.length, 12);
  assert.equal(bootstrap.knowledge.length, 10);
  assert.ok(bootstrap.dashboard.analytics.totals.phones > 0);

  const simulated = await fetch(`http://127.0.0.1:${PORT}/api/demo/incoming`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Здравствуйте, сколько стоит маникюр?' }),
  }).then((r) => r.json());
  assert.ok(simulated.reply.length > 10);
  assert.equal(simulated.action, 'reply');

  const phoneResult = await fetch(`http://127.0.0.1:${PORT}/api/testing/message`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ history: [], incoming: '+7 (916) 000-11-22' }),
  }).then((r) => r.json());
  assert.equal(phoneResult.action, 'phone');
  assert.equal(phoneResult.phone, '+79160001122');
});

test('HTTP: экономика ИИ — калькулятор и учёт токенов', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const before = await fetch(`http://127.0.0.1:${PORT}/api/economics`, { headers }).then((r) => r.json());
  assert.ok(before.pricing.prices.yandex, 'цены провайдеров присутствуют');
  assert.equal(before.comparison.length, 4);

  const calc = await fetch(`http://127.0.0.1:${PORT}/api/economics/calculate`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'yandex', dialogsPerMonth: 1000, messagesPerDialog: 10,
      inputTokensPerMessage: 1000, outputTokensPerMessage: 100, tariffPrice: 2490,
      priceInput: 15, priceOutput: 90,
    }),
  }).then((r) => r.json());
  assert.equal(calc.inputTokens, 10_000_000);
  assert.equal(calc.costInput, 150);
  assert.equal(calc.costOutput, 90);
  assert.equal(calc.totalCost, 240);
  assert.equal(calc.costPerDialog, 0.24);

  const simulated = await fetch(`http://127.0.0.1:${PORT}/api/demo/incoming`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Здравствуйте!' }),
  }).then((r) => r.json());
  assert.ok(simulated.usage?.inputTokens > 0, 'учтены входные токены');

  const after = await fetch(`http://127.0.0.1:${PORT}/api/economics`, { headers }).then((r) => r.json());
  assert.ok(after.usage.calls > 0, 'вызовы модели записаны');
});

test('HTTP: мультикомпания — регистрация и изоляция данных', async () => {
  const demoBefore = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const templates = await fetch(`http://127.0.0.1:${PORT}/api/templates`).then((r) => r.json());
  assert.ok(templates.length >= 8);

  const registration = await fetch(`http://127.0.0.1:${PORT}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'auto@test.ru', password: 'pass12345', company: 'Автосервис Тест', industry: 'auto', name: 'Иван' }),
  });
  assert.equal(registration.status, 201);
  const reg = await registration.json();
  const orgToken = reg.token;
  assert.equal(reg.user.orgName, 'Автосервис Тест');
  assert.equal(reg.user.industry, 'auto');

  const orgHeaders = { Authorization: `Bearer ${orgToken}` };
  const boot = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`, { headers: orgHeaders }).then((r) => r.json());
  assert.equal(boot.dialogs.length, 0, 'новая компания начинает с пустого CRM');
  assert.equal(boot.settings.agent.industry, 'auto');
  assert.ok(boot.knowledge.some((k) => /диагностика/i.test(k.question)));
  assert.equal(boot.organizations.length, 2);

  await fetch(`http://127.0.0.1:${PORT}/api/demo/incoming`, {
    method: 'POST', headers: { ...orgHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Здравствуйте, нужна диагностика' }),
  });
  const boot2 = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`, { headers: orgHeaders }).then((r) => r.json());
  assert.equal(boot2.dialogs.length, 1);

  const demoBoot = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  assert.equal(demoBoot.dialogs.length, demoBefore.dialogs.length, 'данные демо-компании не изменились');
});

test('HTTP: клиент сам выбирает модель ИИ для своей компании', async () => {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const list = await fetch(`http://127.0.0.1:${PORT}/api/ai/models`, { headers }).then((r) => r.json());
  assert.equal(list.length, 4);
  assert.equal(list.filter((m) => m.active).length, 1);

  await fetch(`http://127.0.0.1:${PORT}/api/settings/ai`, {
    method: 'PUT', headers,
    body: JSON.stringify({ provider: 'gigachat', model: 'GigaChat', gigachat: { clientId: 'test-id', clientSecret: 'test-secret', model: 'GigaChat' } }),
  });
  const econ = await fetch(`http://127.0.0.1:${PORT}/api/economics`, { headers }).then((r) => r.json());
  assert.equal(econ.ai.provider, 'gigachat', 'выбор компании важнее переменной окружения');
  const list2 = await fetch(`http://127.0.0.1:${PORT}/api/ai/models`, { headers }).then((r) => r.json());
  assert.equal(list2.find((m) => m.id === 'gigachat').active, true);
  assert.equal(list2.find((m) => m.id === 'gigachat').configured, true);

  await fetch(`http://127.0.0.1:${PORT}/api/settings/ai`, {
    method: 'PUT', headers, body: JSON.stringify({ provider: 'demo', model: 'Демо-движок (встроенный)' }),
  });
  const test = await fetch(`http://127.0.0.1:${PORT}/api/ai/test`, { method: 'POST', headers, body: JSON.stringify({}) }).then((r) => r.json());
  assert.equal(test.ok, true);
  assert.equal(test.simulated, true);
});

test('HTTP: webhook ВК возвращает строку подтверждения без проверки секрета', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/webhook/vk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'confirmation', group_id: 54775709 }),
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /^[a-z0-9-]+$/i);
});

test('HTTP: webhook ВК подтверждает секрет и возвращает ok', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/webhook/vk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message_new', secret: 'lido_demo_secret', object: { message: { peer_id: 1, from_id: 1, text: 'Привет' } } }),
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('HTTP: сообщение от имени сообщества дублируется в софт', async () => {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const payload = {
    type: 'message_reply', secret: 'lido_demo_secret',
    object: { message: { id: 654321, peer_id: 777001, from_id: -54775709, out: 1, text: 'Здравствуйте! Мы на связи.' } },
  };
  await fetch(`http://127.0.0.1:${PORT}/webhook/vk`, { method: 'POST', headers, body: JSON.stringify(payload) });
  await fetch(`http://127.0.0.1:${PORT}/webhook/vk`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const dialogs = await fetch(`http://127.0.0.1:${PORT}/api/dialogs`, { headers }).then((r) => r.json());
  const dialog = dialogs.find((d) => d.peer_id === '777001');
  assert.ok(dialog, 'диалог создан');
  const detail = await fetch(`http://127.0.0.1:${PORT}/api/dialogs/${dialog.id}`, { headers }).then((r) => r.json());
  assert.equal(detail.messages.length, 1, 'сообщение не дублируется');
  assert.equal(detail.messages[0].direction, 'out');
  assert.equal(detail.messages[0].author, 'Сообщество');
});

test('HTTP: синхронизация ВК — incoming, ответ и защита от дублей', async () => {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const payload = {
    type: 'message_new', secret: 'lido_demo_secret',
    object: { message: { id: 987654, peer_id: 555001, from_id: 555001, text: 'Здравствуйте, есть место завтра?' } },
  };
  await fetch(`http://127.0.0.1:${PORT}/webhook/vk`, { method: 'POST', headers, body: JSON.stringify(payload) });
  await fetch(`http://127.0.0.1:${PORT}/webhook/vk`, { method: 'POST', headers, body: JSON.stringify(payload) });

  const dialogs = await fetch(`http://127.0.0.1:${PORT}/api/dialogs?q=Клиент`, { headers }).then((r) => r.json());
  const dialog = dialogs.find((d) => d.peer_id === '555001');
  assert.ok(dialog, 'диалог создан из webhook');
  const detail = await fetch(`http://127.0.0.1:${PORT}/api/dialogs/${dialog.id}`, { headers }).then((r) => r.json());
  assert.equal(detail.messages.filter((m) => m.direction === 'in').length, 1, 'входящее сообщение не дублируется');
  assert.ok(detail.messages.some((m) => m.direction === 'out'), 'ответ агента сохранён локально');

  const manager = await fetch(`http://127.0.0.1:${PORT}/api/dialogs/${dialog.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ text: 'Перезвоним в 12:00', author: 'Вы' }),
  }).then((r) => r.json());
  assert.equal(manager.ok, true);
  const after = await fetch(`http://127.0.0.1:${PORT}/api/dialogs/${dialog.id}`, { headers }).then((r) => r.json());
  const last = after.messages[after.messages.length - 1];
  assert.equal(last.text, 'Перезвоним в 12:00');
  assert.equal(last.author, 'Вы');
});
