const STORE_KEY = "shared-cards";
const DEFAULT_TEMPLATE = "自助上车链接：https://invite.jerrylove.de5.net\n卡密：{{card}}";
const DEFAULT_TYPES = [
  { id: "warranty", name: "质保卡密", allowDuplicate: false },
  { id: "noWarranty", name: "无质保卡密", allowDuplicate: false },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sanitizePayload(input) {
  const inputCardTypes = Array.isArray(input?.cardTypes) ? input.cardTypes : DEFAULT_TYPES;
  const cardTypes = [];
  const usedIds = new Set();

  inputCardTypes.forEach((type, index) => {
    if (!type || typeof type.name !== "string") return;
    const name = type.name.trim();
    if (!name) return;

    let id = typeof type.id === "string" ? type.id.trim() : "";
    if (!id || usedIds.has(id)) {
      id = `${DEFAULT_TYPES[index]?.id || "type"}-${index + 1}`;
    }

    usedIds.add(id);
    cardTypes.push({
      id,
      name,
      allowDuplicate: Boolean(type.allowDuplicate),
    });
  });

  if (!cardTypes.length) {
    DEFAULT_TYPES.forEach((type) => cardTypes.push({ ...type }));
  }

  const sourceCards = input?.cards && typeof input.cards === "object" ? input.cards : input;
  const cards = {};

  cardTypes.forEach((type) => {
    const list = Array.isArray(sourceCards?.[type.id]) ? sourceCards[type.id] : [];
    cards[type.id] = sanitizeCardList(list, type.allowDuplicate);
  });

  const sourceTemplates = input?.templates && typeof input.templates === "object" ? input.templates : {};
  const templates = {};

  cardTypes.forEach((type) => {
    const value = sourceTemplates[type.id];
    templates[type.id] = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TEMPLATE;
  });

  return { cardTypes, cards, templates };
}

function sanitizeCardList(list, allowDuplicate) {
  const output = [];
  const values = new Set();

  list.forEach((item) => {
    if (!item || typeof item.value !== "string") return;
    const value = item.value.trim();
    if (!value) return;
    if (!allowDuplicate && values.has(value)) return;
    values.add(value);
    output.push({ value, copied: Boolean(item.copied) });
  });

  return output;
}

export async function onRequestGet(context) {
  const kv = context.env.CARDS_KV;
  if (!kv) return json({ error: "CARDS_KV binding is missing" }, 500);

  const raw = await kv.get(STORE_KEY);
  if (!raw) {
    const empty = sanitizePayload({});
    return json({
      cardTypes: empty.cardTypes,
      cards: empty.cards,
      templates: empty.templates,
      updatedAt: null,
    });
  }

  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizePayload(parsed);
    return json({
      cardTypes: sanitized.cardTypes,
      cards: sanitized.cards,
      templates: sanitized.templates,
      updatedAt: parsed.updatedAt || null,
    });
  } catch {
    const empty = sanitizePayload({});
    return json({
      cardTypes: empty.cardTypes,
      cards: empty.cards,
      templates: empty.templates,
      updatedAt: null,
    });
  }
}

export async function onRequestPut(context) {
  const kv = context.env.CARDS_KV;
  if (!kv) return json({ error: "CARDS_KV binding is missing" }, 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sanitized = sanitizePayload(body);
  const payload = {
    cardTypes: sanitized.cardTypes,
    cards: sanitized.cards,
    templates: sanitized.templates,
    updatedAt: new Date().toISOString(),
  };

  await kv.put(STORE_KEY, JSON.stringify(payload));
  return json(payload);
}
