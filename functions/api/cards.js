const STORE_KEY = "shared-cards";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sanitizeCards(input) {
  const output = { warranty: [], noWarranty: [] };

  ["warranty", "noWarranty"].forEach((type) => {
    const list = Array.isArray(input?.[type]) ? input[type] : [];
    const values = new Set();

    list.forEach((item) => {
      if (!item || typeof item.value !== "string") return;
      const value = item.value.trim();
      if (!value || values.has(value)) return;
      values.add(value);
      output[type].push({ value, copied: Boolean(item.copied) });
    });
  });

  return output;
}

export async function onRequestGet(context) {
  const kv = context.env.CARDS_KV;
  if (!kv) return json({ error: "CARDS_KV binding is missing" }, 500);

  const raw = await kv.get(STORE_KEY);
  if (!raw) {
    return json({ cards: { warranty: [], noWarranty: [] }, updatedAt: null });
  }

  try {
    const parsed = JSON.parse(raw);
    return json({
      cards: sanitizeCards(parsed.cards),
      updatedAt: parsed.updatedAt || null,
    });
  } catch {
    return json({ cards: { warranty: [], noWarranty: [] }, updatedAt: null });
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

  const cards = sanitizeCards(body.cards);
  const payload = {
    cards,
    updatedAt: new Date().toISOString(),
  };

  await kv.put(STORE_KEY, JSON.stringify(payload));
  return json(payload);
}
