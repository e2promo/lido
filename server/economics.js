import { db, getUsageTotals, addLog } from './db.js';
import { getSetting, setSetting } from './util.js';

export function getEconomicsConfig() {
  const storedAi = getSetting(db, 'ai', {});
  const provider = storedAi.provider || process.env.AI_PROVIDER || 'demo';
  const envModel = provider === 'gigachat' ? process.env.GIGACHAT_MODEL
    : provider === 'yandex' ? process.env.YANDEX_MODEL
    : provider === 'openai' ? process.env.OPENAI_MODEL : null;
  const ai = { ...storedAi, provider, model: provider === 'demo' ? 'Демо-движок' : (storedAi.model || envModel || provider) };
  const aiPricing = getSetting(db, 'aiPricing', {});
  const billing = getSetting(db, 'billing', {});
  return {
    ai,
    aiPricing,
    billing,
    credentials: {
      demo: true,
      yandex: Boolean(process.env.YANDEX_API_KEY || ai.yandex?.apiKey) && Boolean(process.env.YANDEX_FOLDER_ID || ai.yandex?.folderId),
      gigachat: Boolean(process.env.GIGACHAT_CLIENT_ID || ai.gigachat?.clientId) && Boolean(process.env.GIGACHAT_CLIENT_SECRET || ai.gigachat?.clientSecret),
      openai: Boolean(process.env.OPENAI_API_KEY || ai.openai?.apiKey) && Boolean(process.env.OPENAI_BASE_URL || ai.openai?.baseUrl),
    },
  };
}

export function calculateCost(provider, inputTokens, outputTokens, pricing) {
  const price = pricing?.prices?.[provider] || { input: 0, output: 0 };
  return (Number(inputTokens || 0) / 1_000_000) * Number(price.input || 0)
    + (Number(outputTokens || 0) / 1_000_000) * Number(price.output || 0);
}

export function calculateScenario(params, pricing, billing) {
  const provider = params.provider || 'demo';
  const dialogs = Math.max(1, Number(params.dialogsPerMonth) || 1);
  const messages = Math.max(1, Number(params.messagesPerDialog) || 1);
  const input = Math.max(0, Number(params.inputTokensPerMessage) || 0);
  const output = Math.max(0, Number(params.outputTokensPerMessage) || 0);
  const tariff = Math.max(0, Number(params.tariffPrice ?? billing.price) || 0);

  const inputTokens = dialogs * messages * input;
  const outputTokens = dialogs * messages * output;
  const costInput = (inputTokens / 1_000_000) * (pricing?.prices?.[provider]?.input || 0);
  const costOutput = (outputTokens / 1_000_000) * (pricing?.prices?.[provider]?.output || 0);
  const total = costInput + costOutput;
  const costPerDialog = total / dialogs;
  const margin = tariff - total;

  return {
    provider,
    label: pricing?.prices?.[provider]?.label || provider,
    dialogsPerMonth: dialogs,
    messagesPerDialog: messages,
    inputTokensPerMessage: input,
    outputTokensPerMessage: output,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costInput: Number(costInput.toFixed(2)),
    costOutput: Number(costOutput.toFixed(2)),
    totalCost: Number(total.toFixed(2)),
    costPerDialog: Number(costPerDialog.toFixed(2)),
    costPerMessage: Number((total / (dialogs * messages)).toFixed(3)),
    tariffPrice: tariff,
    margin: Number(margin.toFixed(2)),
    marginPct: tariff ? Math.round((margin / tariff) * 1000) / 10 : 0,
    breakEvenDialogs: costPerDialog ? Math.ceil(tariff / costPerDialog) : 0,
  };
}

export function getEconomics() {
  const { ai, aiPricing, billing, credentials } = getEconomicsConfig();
  const usage = getUsageTotals(30);
  const defaults = aiPricing.defaults || {};
  const params = {
    provider: ai.provider || 'demo',
    dialogsPerMonth: defaults.dialogsPerMonth || 1000,
    messagesPerDialog: defaults.messagesPerDialog || 12,
    inputTokensPerMessage: defaults.inputTokensPerMessage || 700,
    outputTokensPerMessage: defaults.outputTokensPerMessage || 160,
    tariffPrice: billing.price || 2490,
  };
  const comparison = Object.keys(aiPricing.prices || {}).map((id) =>
    calculateScenario({ ...params, provider: id }, aiPricing, billing));

  const distinctDialogs = db.prepare('SELECT COUNT(DISTINCT dialog_id) AS c FROM ai_usage WHERE created_at >= ?')
    .get(new Date(Date.now() - 30 * 86400000).toISOString()).c;
  const actualCostPerDialog = distinctDialogs ? Number((usage.cost / distinctDialogs).toFixed(2)) : 0;

  return {
    pricing: aiPricing,
    ai: { provider: ai.provider || 'demo', model: ai.model || 'Демо-движок', credentials },
    billing,
    params,
    current: calculateScenario(params, aiPricing, billing),
    comparison,
    usage: { ...usage, distinctDialogs, actualCostPerDialog },
  };
}

export function savePricing(body) {
  const current = getSetting(db, 'aiPricing', {});
  const merged = { ...current, ...body, prices: { ...(current.prices || {}), ...(body.prices || {}) } };
  setSetting(db, 'aiPricing', merged);
  addLog('info', 'Обновлены цены и параметры экономики ИИ');
  return merged;
}
