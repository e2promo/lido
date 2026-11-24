const DIGITS_RE = /[\d]+/g;

export function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, '');
  if (s.startsWith('+') || s.startsWith('8')) s = s.startsWith('+') ? s.slice(1) : s;
  if (s.startsWith('8')) s = '7' + s.slice(1);
  if (s.length === 10 && /^[9]/.test(s)) s = '7' + s;
  if (!/^7\d{10}$/.test(s)) return null;
  return '+7' + s.slice(1);
}

export function formatPhone(digits) {
  const n = normalizePhone(digits);
  if (!n) return null;
  const d = n.slice(2);
  return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

export function extractPhone(text) {
  if (!text) return null;
  const candidate = String(text).replace(/[^\d+()\-\s]/g, ' ');
  let match = candidate.match(/\+?\d[\d()\s\-]{8,}\d/g);
  if (!match) {
    const digits = (String(text).match(DIGITS_RE) || []).join('');
    if (digits.length >= 10) match = [digits];
  }
  if (!match) return null;
  for (const item of match.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)) {
    const normalized = normalizePhone(item);
    if (normalized) return normalized;
  }
  return null;
}

const REFUSAL_PATTERNS = [
  { test: /(не\s*(хочу|буду|стану)\s*(оставлять|давать|писать)|не\s*оставлю|без\s*номера|не\s*нужен\s*номер)/i, reason: 'Не хочет оставлять контакт' },
  { test: /(просто\s*(узнаю|смотрю|интересно)|только\s*(цену|стоимость|информацию)|спасибо,\s*я\s*(подумаю|пока))/i, reason: 'Не готов оставлять номер' },
  { test: /(не\s*нравятся\s*такие\s*вопросы|зачем\s*вам\s*номер|почему\s*номер|не\s*хочу\s*чтоб\s*звонили)/i, reason: 'Опасения по персональным данным' },
  { test: /(уже\s*есть\s*номер|я\s*уже\s*писал|перезвоню\s*сам)/i, reason: 'Предпочитает связаться сам' },
];

export function isRefusal(text) {
  return REFUSAL_PATTERNS.some((p) => p.test.test(String(text || '')));
}

export function refusalReason(text) {
  const found = REFUSAL_PATTERNS.find((p) => p.test.test(String(text || '')));
  return found ? found.reason : 'Не указана';
}

export function isHandoff(text) {
  return /(менеджер|живой\s*человек|человек|оператор|перезвоните\s*мне|поговорить\s*с\s*человеком)/i.test(String(text || ''));
}

export function isGreeting(text) {
  return /^(здравств|добрый|привет|доброе|здравствуй|хай|hello)/i.test(String(text || '').trim());
}

export function isAcknowledgement(text) {
  return /^(да|давайте|хорошо|ок|окей|готово|интересно|конечно|да,\s*давайте|подходит|устраивает)[\s!.]*$/i.test(String(text || '').trim());
}

export function isThanks(text) {
  return /(спасибо|благодарю)/i.test(String(text || ''));
}

export function isPriceQuestion(text) {
  return /(сколько|стоим|цена|прайс|рубл|₽)/i.test(String(text || ''));
}
