import { db, getDialog, getMessages, updateDialog, addMessage, addLog, createDialog, withOrg, openOrgDb, DEFAULT_ORG_ID } from './db.js';
import {
  masterDb, findUserByEmail, findUserByToken, createSession, getOrganizations,
  getOrganization, createOrganization, createUser, setUserOrg,
} from './master.js';
import { TEMPLATES, getTemplate, agentSettingsFromTemplate } from './templates.js';
import { json, readBody, verifyPassword, getSetting, setSetting, plainAll, uid, now } from './util.js';
import { getAnalytics, getDashboard } from './analytics.js';
import { getCommunityInfo, sendMessage } from './vk.js';
import { ingestIncoming, simulateReply, importHistoryForDialog } from './engine.js';
import { extractPhone, formatPhone, normalizePhone } from './phone.js';
import { getEconomics, getEconomicsConfig, calculateScenario, savePricing } from './economics.js';
import { testAiConnection } from './ai.js';

const PUBLIC_ROUTES = ['/api/login', '/api/register', '/api/templates'];

function applyEffectiveAi(settings) {
  const effective = getEconomicsConfig().ai;
  settings.ai = { ...(settings.ai || {}), provider: effective.provider, model: effective.model };
  return settings;
}

async function modelsList() {
  const { ai, aiPricing, credentials } = getEconomicsConfig();
  const meta = {
    demo: { label: 'Демо-движок', icon: '🟣', description: 'Встроенный сценарий, работает без ключей и интернета. Подходит для старта и тестов.' },
    yandex: { label: 'YandexGPT', icon: '🟡', description: 'Российская модель Яндекс.Облака. Нужны Folder ID и API-ключ.' },
    gigachat: { label: 'GigaChat', icon: '🔵', description: 'Модель Сбербанка. Нужны Client ID и Client Secret из личного кабинета.' },
    openai: { label: 'Другая модель', icon: '⚪', description: 'Любой OpenAI-совместимый API: Base URL, ключ и название модели.' },
  };
  return Object.entries(meta).map(([id, m]) => ({
    id, ...m,
    inputPrice: aiPricing?.prices?.[id]?.input ?? 0,
    outputPrice: aiPricing?.prices?.[id]?.output ?? 0,
    configured: Boolean(credentials[id]),
    active: (ai.provider || 'demo') === id,
    model: id === (ai.provider || 'demo') ? (ai.model || id) : undefined,
  }));
}

function authorize(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = findUserByToken(bearer);
  if (!user) return null;
  const org = getOrganization(user.org_id);
  return { id: user.id, name: user.name, email: user.email, orgId: user.org_id, orgName: org?.name || '', orgSlug: org?.slug || 'demo', industry: org?.industry || 'universal' };
}

export async function handleApi(req, res, pathname, url) {
  const method = req.method || 'GET';

  if (pathname === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const user = findUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return json(res, 401, { error: 'Неверный e-mail или пароль' });
    }
    const t = createSession(user.id);
    const org = getOrganization(user.org_id);
    return json(res, 200, {
      token: t,
      user: { id: user.id, name: user.name, email: user.email, orgId: user.org_id, orgName: org?.name || '', orgSlug: org?.slug || 'demo', industry: org?.industry || 'universal' },
    });
  }

  if (pathname === '/api/register' && method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const companyName = String(body.company || body.companyName || '').trim() || 'Моя компания';
    if (!email || !body.password) return json(res, 400, { error: 'Укажите e-mail и пароль' });
    if (findUserByEmail(email)) return json(res, 409, { error: 'Этот e-mail уже зарегистрирован' });
    const industry = getTemplate(body.industry).id;
    const slug = (String(body.slug || companyName).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company') + '-' + uid('').slice(0, 4);
    const org = createOrganization({ name: companyName, slug, industry });
    openOrgDb(org.id, industry, companyName);
    const newUser = createUser({ name: body.name || companyName, email, password: body.password, orgId: org.id });
    const t = createSession(newUser.id);
    return json(res, 201, {
      token: t,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, orgId: org.id, orgName: org.name, orgSlug: org.slug, industry },
    });
  }

  const user = authorize(req);
  if (!user && pathname.startsWith('/api/') && !PUBLIC_ROUTES.includes(pathname)) {
    return json(res, 401, { error: 'Требуется вход' });
  }

  if (pathname === '/api/me' && method === 'GET') return json(res, 200, { user });

  if (pathname === '/api/templates' && method === 'GET') {
    return json(res, 200, TEMPLATES.map((t) => ({ id: t.id, label: t.label, icon: t.icon })));
  }

  if (pathname === '/api/ai/models' && method === 'GET') {
    return json(res, 200, await modelsList());
  }

  if (pathname === '/api/ai/test' && method === 'POST') {
    const ai = getSetting(db, 'ai', {});
    const result = await testAiConnection(ai);
    return json(res, result.ok ? 200 : 502, result);
  }

  if (pathname === '/api/organizations' && method === 'GET') {
    return json(res, 200, getOrganizations(user.id));
  }

  if (pathname === '/api/organizations' && method === 'POST') {
    const body = await readBody(req);
    const industry = getTemplate(body.industry).id;
    const companyName = String(body.name || 'Новая компания').trim();
    const slug = companyName.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + uid('').slice(0, 4);
    const org = createOrganization({ name: companyName, slug, industry });
    openOrgDb(org.id, industry, companyName);
    return json(res, 201, { ok: true, organization: org });
  }

  const orgSelectMatch = pathname.match(/^\/api\/organizations\/([^/]+)\/select$/);
  if (orgSelectMatch && method === 'POST') {
    const org = getOrganization(orgSelectMatch[1]);
    if (!org) return json(res, 404, { error: 'Компания не найдена' });
    setUserOrg(user.id, org.id);
    return json(res, 200, { ok: true, orgId: org.id });
  }

  const orgUpdateMatch = pathname.match(/^\/api\/organizations\/([^/]+)$/);
  if (orgUpdateMatch && method === 'PUT') {
    const org = getOrganization(orgUpdateMatch[1]);
    if (!org) return json(res, 404, { error: 'Компания не найдена' });
    const body = await readBody(req);
    masterDb.prepare('UPDATE organizations SET name = ?, industry = ? WHERE id = ?')
      .run(body.name || org.name, body.industry || org.industry, org.id);
    if (body.name) {
      const agent = getSetting(db, 'agent', {});
      setSetting(db, 'agent', { ...agent, company: body.name });
    }
    if (body.industry && body.industry !== org.industry) {
      const template = getTemplate(body.industry);
      const agent = getSetting(db, 'agent', {});
      setSetting(db, 'agent', {
        ...agent, ...agentSettingsFromTemplate(template, body.name || org.name),
        enabled: agent.enabled, mode: agent.mode,
      });
      db.prepare('DELETE FROM knowledge').run();
      const kStmt = db.prepare(`INSERT INTO knowledge (id, question, answer, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
      template.knowledge.forEach(([q, a, c], i) => kStmt.run(`k_${i + 1}_${uid('')}`, q, a, c, 'Шаблон', now()));
      addLog('info', `Шаблон компании изменён: ${template.label}`);
    }
    return json(res, 200, { ok: true, organization: getOrganization(org.id) });
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const sections = ['vk', 'agent', 'ai', 'notifications', 'billing', 'compliance', 'aiPricing'];
    const settings = {};
    for (const key of sections) settings[key] = getSetting(db, key, {});
    applyEffectiveAi(settings);
    return json(res, 200, {
      user,
      settings,
      dashboard: getDashboard(),
      knowledge: plainAll(db.prepare('SELECT * FROM knowledge ORDER BY created_at DESC').all()),
      dialogs: plainAll(db.prepare('SELECT * FROM dialogs ORDER BY last_message_at DESC').all()),
      tariffs: TARIFFS,
      economics: getEconomics(),
      aiModels: await modelsList(),
      organizations: getOrganizations(user.id),
      templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      currentOrg: user,
    });
  }

  if (pathname === '/api/dashboard' && method === 'GET') return json(res, 200, getDashboard());

  if (pathname === '/api/settings' && method === 'GET') {
    const sections = ['vk', 'agent', 'ai', 'notifications', 'billing', 'compliance', 'aiPricing'];
    const settings = {};
    for (const key of sections) settings[key] = getSetting(db, key, {});
    return json(res, 200, applyEffectiveAi(settings));
  }

  const settingsMatch = pathname.match(/^\/api\/settings\/([a-z]+)$/);
  if (settingsMatch && method === 'PUT') {
    const section = settingsMatch[1];
    const allowed = ['vk', 'agent', 'ai', 'notifications', 'billing', 'compliance'];
    if (!allowed.includes(section)) return json(res, 400, { error: 'Неизвестный раздел' });
    const body = await readBody(req);
    const current = getSetting(db, section, {});
    const merged = { ...current, ...body };
    setSetting(db, section, merged);
    addLog('info', `Изменены настройки: ${section}`);
    return json(res, 200, { ok: true, settings: merged });
  }

  if (pathname === '/api/vk/test' && method === 'POST') {
    const info = await getCommunityInfo();
    return json(res, info.ok ? 200 : 502, info);
  }

  if (pathname === '/api/vk/send-test' && method === 'POST') {
    const body = await readBody(req);
    const dialog = getDialog(String(body.dialogId || ''));
    if (!dialog) return json(res, 404, { error: 'Диалог не найден' });
    const text = String(body.text || '').trim() || 'Тестовое сообщение от Лидо ✅';
    const sent = await sendMessage(dialog.peer_id, text);
    addMessage(dialog.id, 'out', 'Вы', text, now(), { action: 'test' }, {
      vkMessageId: sent?.messageId || null,
      delivered: sent?.ok ? 1 : 0,
      deliveryError: sent?.error || null,
    });
    addLog(sent?.ok ? 'info' : 'error',
      sent?.ok ? 'Тестовое сообщение отправлено в ВК' : 'Тестовое сообщение не отправлено: ' + sent?.error,
      { dialogId: dialog.id });
    return json(res, sent?.ok ? 200 : 502, {
      ok: Boolean(sent?.ok),
      simulated: Boolean(sent?.simulated),
      error: sent?.error || null,
      messageId: sent?.messageId || null,
      text,
    });
  }

  const importMatch = pathname.match(/^\/api\/vk\/import-history\/([^/]+)$/);
  if (importMatch && method === 'POST') {
    const dialog = getDialog(importMatch[1]);
    if (!dialog) return json(res, 404, { error: 'Диалог не найден' });
    const result = await importHistoryForDialog(dialog, 30);
    return json(res, result.ok ? 200 : 502, result);
  }

  if (pathname === '/api/knowledge') {
    if (method === 'GET') {
      return json(res, 200, plainAll(db.prepare('SELECT * FROM knowledge ORDER BY created_at DESC').all()));
    }
    if (method === 'POST') {
      const body = await readBody(req);
      if (!body.question || !body.answer) return json(res, 400, { error: 'Заполните вопрос и ответ' });
      const id = uid('k_');
      db.prepare(`INSERT INTO knowledge (id, question, answer, category, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, body.question, body.answer, body.category || 'Услуги', body.source || 'Вручную', now());
      addLog('info', 'Добавлена запись базы знаний');
      return json(res, 201, { ok: true, id });
    }
  }

  const knowledgeMatch = pathname.match(/^\/api\/knowledge\/([^/]+)$/);
  if (knowledgeMatch) {
    const id = knowledgeMatch[1];
    if (method === 'PUT') {
      const body = await readBody(req);
      const current = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id);
      if (!current) return json(res, 404, { error: 'Запись не найдена' });
      db.prepare(`UPDATE knowledge SET question = ?, answer = ?, category = ?, source = ? WHERE id = ?`)
        .run(body.question ?? current.question, body.answer ?? current.answer,
          body.category ?? current.category, body.source ?? current.source, id);
      return json(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/dialogs' && method === 'GET') {
    const where = [];
    const params = [];
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    const onlyPhone = url.searchParams.get('phone');
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (onlyPhone === 'yes') where.push("phone IS NOT NULL AND phone != ''");
    if (onlyPhone === 'no') where.push('(phone IS NULL OR phone = \'\')');
    if (q) {
      where.push('(client_name LIKE ? OR phone LIKE ? OR id LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const sortMap = {
      recent: 'last_message_at DESC',
      old: 'created_at ASC',
      name: 'client_name ASC',
      status: 'status ASC',
    };
    const sort = sortMap[url.searchParams.get('sort')] || sortMap.recent;
    const rows = db.prepare(`SELECT * FROM dialogs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort}`).all(...params);
    return json(res, 200, plainAll(rows));
  }

  const dialogMatch = pathname.match(/^\/api\/dialogs\/([^/]+)$/);
  if (dialogMatch) {
    const id = dialogMatch[1];
    if (method === 'GET') {
      const dialog = getDialog(id);
      if (!dialog) return json(res, 404, { error: 'Диалог не найден' });
      return json(res, 200, { dialog, messages: getMessages(id) });
    }
    if (method === 'PATCH') {
      const body = await readBody(req);
      const allowed = ['status', 'manager', 'notes', 'phone', 'consent', 'unread', 'refusal_reason', 'client_name'];
      const fields = {};
      for (const key of allowed) if (key in body) fields[key] = body[key];
      if (fields.phone) fields.phone = normalizePhone(fields.phone) || fields.phone;
      const updated = updateDialog(id, fields);
      if (!updated) return json(res, 404, { error: 'Диалог не найден' });
      return json(res, 200, { dialog: updated });
    }
  }

  const dialogMessagesMatch = pathname.match(/^\/api\/dialogs\/([^/]+)\/messages$/);
  if (dialogMessagesMatch && method === 'POST') {
    const id = dialogMessagesMatch[1];
    const dialog = getDialog(id);
    if (!dialog) return json(res, 404, { error: 'Диалог не найден' });
    const body = await readBody(req);
    if (!body.text) return json(res, 400, { error: 'Пустое сообщение' });
    const sent = await sendMessage(dialog.peer_id, body.text);
    addMessage(id, 'out', body.author || 'Вы', body.text, now(), { action: 'manager' }, {
      vkMessageId: sent?.messageId || null,
      delivered: sent?.ok ? 1 : 0,
      deliveryError: sent?.error || null,
    });
    updateDialog(id, { unread: 0, manager: body.manager || dialog.manager || 'Вы' });
    addLog(sent?.ok ? 'info' : 'error', 'Ответ менеджера ' + (sent?.ok ? 'отправлен в ВК' : 'не доставлен в ВК: ' + sent?.error), { dialogId: id });
    return json(res, 201, { ok: true, sentToVk: Boolean(sent?.ok), error: sent?.error || null });
  }

  if (pathname === '/api/analytics' && method === 'GET') {
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 14));
    return json(res, 200, getAnalytics(days));
  }

  if (pathname === '/api/logs' && method === 'GET') {
    const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
    const rows = db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit);
    return json(res, 200, plainAll(rows));
  }

  if (pathname === '/api/testing/message' && method === 'POST') {
    const body = await readBody(req);
    const result = await simulateReply({ history: body.history || [], incoming: body.incoming || '' });
    return json(res, 200, result);
  }

  if (pathname === '/api/demo/incoming' && method === 'POST') {
    const body = await readBody(req);
    const result = await ingestIncoming({
      peerId: body.peerId || 'demo_user',
      userId: body.userId || Math.floor(Math.random() * 90000000) + 10000000,
      text: body.text || '',
      firstName: body.firstName || 'Тестовый',
      lastName: body.lastName || 'Клиент',
    }, { sendToVk: Boolean(body.sendToVk) });
    return json(res, 200, { dialog: result.dialog, reply: result.reply, action: result.action, usage: result.usage, sentToVk: Boolean(result.sentToVk) });
  }

  if (pathname === '/api/tariffs' && method === 'GET') return json(res, 200, TARIFFS);

  if (pathname === '/api/economics' && method === 'GET') return json(res, 200, getEconomics());

  if (pathname === '/api/economics/calculate' && method === 'POST') {
    const body = await readBody(req);
    const { aiPricing, billing } = getEconomicsConfig();
    const provider = body.provider || 'demo';
    const scenarioPricing = {
      ...aiPricing,
      prices: {
        ...(aiPricing.prices || {}),
        [provider]: {
          ...(aiPricing.prices?.[provider] || {}),
          input: body.priceInput ?? aiPricing.prices?.[provider]?.input ?? 0,
          output: body.priceOutput ?? aiPricing.prices?.[provider]?.output ?? 0,
        },
      },
    };
    return json(res, 200, calculateScenario(body, scenarioPricing, billing));
  }

  if (pathname === '/api/settings/aiPricing' && method === 'PUT') {
    const body = await readBody(req);
    return json(res, 200, { ok: true, pricing: savePricing(body) });
  }

  if (pathname === '/api/phone/check' && method === 'POST') {
    const body = await readBody(req);
    const normalized = extractPhone(body.text || '');
    return json(res, 200, { found: Boolean(normalized), phone: normalized, formatted: normalized ? formatPhone(normalized) : null });
  }

  return json(res, 404, { error: 'Маршрут не найден' });
}

export const TARIFFS = [
  {
    id: 'free', name: 'Пробный', price: 0, period: '14 дней',
    features: ['1 сообщество ВК', 'До 100 диалогов', 'Все 10 экранов', 'Демо-режим ИИ', 'База знаний до 20 записей'],
    limitations: 'Без подключения платного ИИ',
  },
  {
    id: 'base', name: 'Базовый', price: 1490, period: 'месяц',
    features: ['1 сообщество ВК', 'До 1 000 диалогов', 'YandexGPT / GigaChat', 'База знаний без лимита', 'Telegram-уведомления', 'CRM и аналитика'],
    limitations: 'Без приоритетной поддержки',
  },
  {
    id: 'pro', name: 'Профессиональный', price: 2490, period: 'месяц',
    features: ['До 3 сообществ ВК', 'До 5 000 диалогов', 'Все ИИ-провайдеры', 'Режим ручного контроля', 'Назначение менеджеров', 'Приоритетная поддержка', 'Экспорт лидов'],
    limitations: '',
  },
  {
    id: 'enterprise', name: 'Для агентств', price: 7990, period: 'месяц',
    features: ['До 20 сообществ ВК', 'Безлимитные диалоги', 'Отдельный сервер в РФ', 'Белый бренд', 'Интеграции с CRM', 'Персональный менеджер'],
    limitations: '',
  },
];
