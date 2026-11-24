import { isPriceQuestion, isAcknowledgement, isThanks } from './phone.js';
import https from 'node:https';

function httpsJson(urlString, { method = 'GET', headers = {}, body } = {}, insecure = false) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers,
    };
    if (insecure) options.agent = new https.Agent({ rejectUnauthorized: false });
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, text: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const NEED_KEYWORDS = [
  { need: 'стрижка', re: /стриж|волос|подстричь/i },
  { need: 'брови', re: /бров/i },
  { need: 'маникюр', re: /маникюр|ногот|ногти/i },
  { need: 'педикюр', re: /педикюр/i },
  { need: 'окрашивание', re: /окраш|мелиров|тониров|цвет/i },
  { need: 'ламинирование', re: /ламинат/i },
  { need: 'лазерная эпиляция', re: /эпиляц|волос.*удал/i },
  { need: 'уходовая процедура', re: /ухов|маск|пилинг/i },
];

const STAGES = ['greeting', 'need', 'answer', 'value', 'ask_phone', 'done'];

export function estimateTokens(text) {
  const length = String(text || '').length;
  return length ? Math.max(1, Math.ceil(length / 3.6)) : 0;
}

export function resolveProvider(ai) {
  return ai?.provider || process.env.AI_PROVIDER || 'demo';
}

export function detectNeed(text, knowledge = []) {
  const item = findKnowledge(knowledge, text);
  if (item) return item.category || item.question.replace(/\?$/, '');
  const found = NEED_KEYWORDS.find((k) => k.re.test(String(text || '')));
  return found ? found.need : null;
}

export function findKnowledge(knowledge, text) {
  const q = String(text || '').toLowerCase();
  let best = null;
  let score = 0;
  for (const item of knowledge) {
    let s = 0;
    const words = (item.question + ' ' + item.answer).toLowerCase().match(/[а-яё]{4,}/g) || [];
    for (const w of new Set(words)) if (q.includes(w)) s += 1;
    if (s > score) { score = s; best = item; }
  }
  return score >= 2 ? best : null;
}

export function buildSystemPrompt(ctx) {
  const { agent, knowledge, companyInfo } = ctx;
  const faq = knowledge.map((k) => `Вопрос: ${k.question}\nОтвет: ${k.answer}`).join('\n\n');
  return `Ты — ${agent.name}, ассистент компании «${agent.company}» в сообщениях ВКонтакте.
Стиль общения: ${agent.style}. Отвечай кратко, естественно, по-русски, без роботизированных шаблонов.

ИНФОРМАЦИЯ О КОМПАНИИ:
${agent.about || companyInfo || ''}

БАЗА ЗНАНИЙ (используй для ответов, не выдумывай цены):
${faq}

ЦЕЛЬ ДИАЛОГА: ${agent.goalHint || 'Получить номер телефона клиента'}.

СТРАТЕГИЯ:
1. Приветствуй и выявляй потребность.
2. Отвечай на вопросы по базе знаний.
3. Расскажи о пользе и преимуществах.
4. Естественно и ненавязчиво предложи оставить номер: ${agent.pitch}
5. Если клиент оставил номер — подтверди его и заверши диалог.
6. Если клиент отказался — не дави, вежливо ответь на его вопрос и предложения оставить номер не повторяй.
7. Если клиент просит менеджера — сразу передай диалог.

ЛОГИКА: ${agent.logic || ''}
ОГРАНИЧЕНИЯ: ${(agent.restrictions || []).join('; ')}
ЗАПРЕЩЁННЫЕ ТЕМЫ: ${(agent.forbidden || []).join('; ')}
ЕСЛИ НЕ ЗНАЕШЬ: ${agent.onUnknown || 'Вежливо уточнить и предложить связаться с менеджером.'}

ФОРМАТ ОТВЕТА — строго JSON без пояснений:
{"reply":"текст ответа клиенту","stage":"${STAGES.join('|')}","need":"определённая потребность или null","handoff":false}`;
}

const ASK_VARIANTS = [
  (a) => `${a.pitch || 'Оставьте номер телефона — перезвоним и всё расскажем.'}`,
  (a) => `Если удобно, оставьте номер — ${a.company ? 'наш мастер' : 'мы'} перезвоним и уточним детали. Это займёт меньше минуты 🙂`,
  (a) => `Чтобы не потерять время, давайте обменяемся контактами: напишите номер, и мы сразу подберём для вас время.`,
  (a) => `Могу перезвонить и ответить на все вопросы по телефону — сейчас удобнее оставить номер или лучше написать сюда?`,
];

function emojiFriendly(agent) {
  return agent.style === 'деловой' ? '' : ' 🙂';
}

function demoReply(ctx) {
  const { agent, knowledge, dialog, history, incoming } = ctx;
  const name = agent.name || 'Ассистент';
  const text = String(incoming || '');
  const stage = STAGES.includes(dialog?.stage) ? dialog.stage : 'greeting';
  const need = detectNeed(text, knowledge) || detectNeed(history.filter((m) => m.direction === 'in').map((m) => m.text).join(' '), knowledge);
  const item = findKnowledge(knowledge, text) || (need ? findKnowledge(knowledge, need) : null);
  const meta = (() => { try { return JSON.parse(dialog?.meta || '{}'); } catch { return {}; } })();
  const askCount = meta.askCount || 0;
  const em = emojiFriendly(agent);
  let reply;
  let nextStage = stage;

  if (isThanks(text)) {
    reply = `Пожалуйста! Если появятся вопросы — пишите, всегда рады помочь 💜`;
    nextStage = stage === 'done' ? 'done' : 'value';
  } else if (isAcknowledgement(text) && stage !== 'greeting') {
    reply = `${ASK_VARIANTS[askCount % ASK_VARIANTS.length](agent)}`;
    nextStage = 'ask_phone';
  } else if (isPriceQuestion(text) || item) {
    const answer = item ? item.answer.replace(/\s+/g, ' ').trim() : 'Подскажу точную стоимость — зависит от выбранной услуги и мастера.';
    reply = `${answer} ${ASK_VARIANTS[askCount % ASK_VARIANTS.length](agent)}`;
    nextStage = 'value';
  } else if (stage === 'greeting') {
    reply = need
      ? `Здравствуйте! 👋 ${item ? item.answer : `По поводу «${need}» всё расскажу. ${agent.about ? '' : ''}`} Что именно вас интересует?${em}`
      : `${agent.greeting || `Здравствуйте! 👋 Я ${name}, помогу с записью. Что вас интересует?`}`;
    nextStage = need ? 'answer' : 'need';
  } else if (stage === 'need') {
    reply = need
      ? `Понял вас — ${need}. ${item ? item.answer : 'Расскажу подробнее, когда уточним детали.'} Хотите, запишем?${em}`
      : `Подскажите, пожалуйста, какая услуга вас интересует? Тогда смогу сразу назвать стоимость и свободное время.`;
    nextStage = need ? 'answer' : 'need';
  } else if (stage === 'ask_phone') {
    if (askCount >= 2) {
      reply = `Понимаю, не хочу навязываться 🙂 Могу передать вас менеджеру — он ответит на все вопросы. Или просто напишите сюда, когда решите.`;
      nextStage = 'ask_phone';
    } else {
      reply = ASK_VARIANTS[(askCount + 1) % ASK_VARIANTS.length](agent);
      nextStage = 'ask_phone';
    }
  } else {
    reply = `${item ? item.answer + ' ' : ''}${ASK_VARIANTS[askCount % ASK_VARIANTS.length](agent)}`;
    nextStage = askCount >= 1 ? 'ask_phone' : 'value';
  }

  return { reply, stage: nextStage, need, handoff: false, source: 'demo' };
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

async function callProvider(ctx, systemPrompt) {
  const ai = { ...(ctx.ai || {}), provider: resolveProvider(ctx.ai) };
  const messages = [
    { role: 'system', content: systemPrompt },
    ...ctx.history.map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: ctx.incoming },
  ];
  messages[0].content += '\n\nОтветь строго одним JSON-объектом без обёрток и пояснений: {"reply":"...","stage":"...","need":"...","handoff":false}. Поле reply — текст для клиента, в нём обязательно должна быть естественная просьба оставить номер, если это уместно.';

  if (ai.provider === 'yandex') {
    const cfg = ai.yandex || {};
    if (!cfg.apiKey || !cfg.folderId) throw new Error('Не указан ключ или Folder ID YandexGPT');
    const res = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${cfg.apiKey}` },
      body: JSON.stringify({
        modelUri: `gpt://${cfg.folderId}/${cfg.model || 'yandexgpt/latest'}`,
        completionOptions: { stream: false, temperature: ai.temperature ?? 0.7 },
        messages: messages.map((m) => ({ role: m.role, text: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`YandexGPT: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.result?.alternatives?.[0]?.message?.text || '',
      usage: { input: data.result?.usage?.promptTokens || 0, output: data.result?.usage?.completionTokens || 0 },
    };
  }

  if (ai.provider === 'gigachat') {
    const cfg = ai.gigachat || {};
    const clientId = process.env.GIGACHAT_CLIENT_ID || cfg.clientId;
    const clientSecret = process.env.GIGACHAT_CLIENT_SECRET || cfg.clientSecret;
    if (!clientId || !clientSecret) throw new Error('Не указаны данные GigaChat');
    const model = process.env.GIGACHAT_MODEL || cfg.model || 'GigaChat';
    const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
    const insecure = process.env.GIGACHAT_TLS_INSECURE === '1';

    let basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
      const decoded = Buffer.from(clientSecret, 'base64').toString('utf8');
      if (decoded.includes(':') && decoded.startsWith(clientId)) basic = clientSecret;
    } catch { /* используем обычную кодировку */ }

    const authRes = await httpsJson('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: 'Basic ' + basic,
        RqUID: cryptoUUID(),
      },
      body: 'scope=' + scope,
    }, insecure);
    if (authRes.status !== 200) throw new Error(`GigaChat OAuth: HTTP ${authRes.status} ${authRes.text.slice(0, 200)}`);
    let accessToken;
    try { accessToken = JSON.parse(authRes.text).access_token; } catch { throw new Error('GigaChat OAuth: некорректный ответ'); }
    if (!accessToken) throw new Error('GigaChat OAuth: токен не получен');

    const res = await httpsJson('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ model, messages, temperature: ai.temperature ?? 0.7 }),
    }, insecure);
    if (res.status !== 200) throw new Error(`GigaChat: HTTP ${res.status} ${res.text.slice(0, 300)}`);
    let data;
    try { data = JSON.parse(res.text); } catch { throw new Error('GigaChat: некорректный ответ'); }
    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
    };
  }

  if (ai.provider === 'openai') {
    const cfg = ai.openai || {};
    if (!cfg.baseUrl || !cfg.apiKey) throw new Error('Не указан OpenAI-совместимый провайдер');
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages, temperature: ai.temperature ?? 0.7 }),
    });
    if (!res.ok) throw new Error(`OpenAI-провайдер: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
    };
  }

  throw new Error('Неизвестный провайдер');
}

function cryptoUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function withUsage(result, ctx, inputTokens, outputTokens) {
  return {
    ...result,
    usage: {
      input: inputTokens ?? estimateTokens(JSON.stringify(ctx.history || []) + (ctx.incoming || '') + JSON.stringify(ctx.agent || {})),
      output: outputTokens ?? estimateTokens(result.reply),
    },
  };
}

export async function generateReply(ctx) {
  const ai = { ...(ctx.ai || {}), provider: resolveProvider(ctx.ai) };
  if (ai.provider && ai.provider !== 'demo') {
    try {
      const systemPrompt = buildSystemPrompt(ctx);
      const response = await callProvider(ctx, systemPrompt);
      const raw = response.text;
      const parsed = extractJson(raw);
      if (parsed?.reply) {
        let reply = String(parsed.reply);
        const stage = STAGES.includes(parsed.stage) ? parsed.stage : ctx.dialog?.stage || 'need';
        const asksPhone = /тел(?:ефон|ефона)|номер|перезвон/i.test(reply);
        const shouldAsk = !['done', 'refused', 'handoff', 'ask_phone'].includes(stage) && !asksPhone;
        if (shouldAsk && ctx.agent?.pitch) reply = `${reply}\n\n${ctx.agent.pitch}`;
        return withUsage({
          reply,
          stage: shouldAsk ? 'value' : stage,
          need: parsed.need || detectNeed(ctx.incoming, ctx.knowledge),
          handoff: Boolean(parsed.handoff),
          source: ai.provider,
        }, ctx, response.usage?.input, response.usage?.output);
      }
      let reply = String(raw).trim().replace(/^```(?:json)?|```$/gi, '').trim();
      const stage = ctx.dialog?.stage || 'need';
      const asksPhone = /тел(?:ефон|ефона)|номер|перезвон/i.test(reply);
      const shouldAsk = !['done', 'refused', 'handoff', 'ask_phone'].includes(stage) && !asksPhone;
      if (shouldAsk && ctx.agent?.pitch) reply = `${reply}\n\n${ctx.agent.pitch}`;
      return withUsage({
        reply, stage: shouldAsk ? 'value' : stage,
        need: detectNeed(ctx.incoming, ctx.knowledge), handoff: false, source: ai.provider,
      }, ctx, response.usage?.input, response.usage?.output);
    } catch (err) {
      ctx.onError?.(err.message);
    }
  }
  return withUsage(demoReply(ctx), ctx);
}

export async function testAiConnection(ai) {
  const provider = resolveProvider(ai);
  const model = ai?.model || provider;
  if (provider === 'demo') {
    return { ok: true, simulated: true, provider, model: 'Демо-движок', message: 'Встроенный демо-движок работает без ключей' };
  }
  try {
    const ctx = {
      ai: { ...(ai || {}), provider },
      history: [],
      incoming: 'Ответь одним словом: готов',
      agent: { name: 'Тест', restrictions: [], forbidden: [] },
      knowledge: [],
      onError: () => {},
    };
    const response = await callProvider(ctx, 'Ты проверочный ассистент. Ответь строго одним словом: готов.');
    return { ok: true, provider, model, message: String(response.text || '').slice(0, 160) };
  } catch (err) {
    return { ok: false, provider, model, error: err.message };
  }
}
