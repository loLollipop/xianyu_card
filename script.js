const STORAGE_KEY = "xianyu-card-storage-v5";
const LEGACY_STORAGE_KEYS = ["xianyu-card-storage-v4", "xianyu-card-storage-v3", "xianyu-card-storage-v2"];
const CLOUD_API = "/api/cards";
const DEFAULT_TEMPLATE = "自助上车链接：https://invite.jerrylove.de5.net\n卡密：{{card}}";
const DEFAULT_TYPES = [
  { id: "warranty", name: "质保卡密", allowDuplicate: false, duplicateCount: 1 },
  { id: "noWarranty", name: "无质保卡密", allowDuplicate: false, duplicateCount: 1 },
];

const state = {
  activeType: DEFAULT_TYPES[0].id,
  activeView: "import",
  cardTypes: [...DEFAULT_TYPES],
  cards: {},
  templates: {},
  sync: {
    pending: false,
    lastSyncAt: null,
  },
};

const cardTypeSelect = document.querySelector("#cardType");
const bulkInput = document.querySelector("#bulkInput");
const importBtn = document.querySelector("#importBtn");
const cardList = document.querySelector("#cardList");
const listSummary = document.querySelector("#listSummary");
const clearCopiedBtn = document.querySelector("#clearCopiedBtn");
const typeTabs = document.querySelector("#typeTabs");
const cardItemTemplate = document.querySelector("#cardItemTemplate");
const syncStatus = document.querySelector("#syncStatus");
const manualSyncBtn = document.querySelector("#manualSyncBtn");
const navBtns = [...document.querySelectorAll(".nav-btn")];
const viewPanels = [...document.querySelectorAll(".view-panel")];
const newTypeNameInput = document.querySelector("#newTypeName");
const allowDuplicateTypeInput = document.querySelector("#allowDuplicateType");
const newTypeDuplicateCountInput = document.querySelector("#newTypeDuplicateCount");
const addTypeBtn = document.querySelector("#addTypeBtn");
const manageTypeSelect = document.querySelector("#manageTypeSelect");
const manageAllowDuplicateInput = document.querySelector("#manageAllowDuplicate");
const manageDuplicateCountInput = document.querySelector("#manageDuplicateCount");
const saveTypeSettingsBtn = document.querySelector("#saveTypeSettingsBtn");
const deleteTypeBtn = document.querySelector("#deleteTypeBtn");
const templateTypeSelect = document.querySelector("#templateType");
const templateInput = document.querySelector("#templateInput");
const saveTemplateBtn = document.querySelector("#saveTemplateBtn");
const templateStatus = document.querySelector("#templateStatus");

initialize();

async function initialize() {
  loadLocalState();
  bindEvents();
  ensureStateConsistency();
  updateView();
  render();
  await syncFromCloud();
}

function bindEvents() {
  importBtn.addEventListener("click", importCards);
  clearCopiedBtn.addEventListener("click", clearCopiedCards);
  manualSyncBtn.addEventListener("click", syncFromCloud);
  addTypeBtn.addEventListener("click", addCardType);
  saveTemplateBtn.addEventListener("click", saveTemplate);
  saveTypeSettingsBtn.addEventListener("click", saveTypeSettings);
  deleteTypeBtn.addEventListener("click", deleteType);

  allowDuplicateTypeInput.addEventListener("change", () => {
    newTypeDuplicateCountInput.disabled = !allowDuplicateTypeInput.checked;
  });

  manageAllowDuplicateInput.addEventListener("change", () => {
    manageDuplicateCountInput.disabled = !manageAllowDuplicateInput.checked;
  });

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeView = btn.dataset.view;
      updateView();
      if (state.activeView === "template") {
        renderTemplateEditor();
      }
    });
  });

  templateTypeSelect.addEventListener("change", renderTemplateEditor);
  manageTypeSelect.addEventListener("change", renderTypeEditor);
}

function addCardType() {
  const name = newTypeNameInput.value.trim();
  if (!name) return;

  const id = createTypeId(name);
  const allowDuplicate = allowDuplicateTypeInput.checked;
  const duplicateCount = allowDuplicate ? normalizeDuplicateCount(newTypeDuplicateCountInput.value) : 1;

  state.cardTypes.push({ id, name, allowDuplicate, duplicateCount });
  state.cards[id] = [];
  state.templates[id] = DEFAULT_TEMPLATE;
  state.activeType = id;

  newTypeNameInput.value = "";
  allowDuplicateTypeInput.checked = false;
  newTypeDuplicateCountInput.value = "1";
  newTypeDuplicateCountInput.disabled = true;

  persistAndSync();
  render();
}

function saveTypeSettings() {
  const typeId = manageTypeSelect.value;
  const typeMeta = getTypeMeta(typeId);
  if (!typeMeta) return;

  typeMeta.allowDuplicate = manageAllowDuplicateInput.checked;
  typeMeta.duplicateCount = typeMeta.allowDuplicate
    ? normalizeDuplicateCount(manageDuplicateCountInput.value)
    : 1;

  if (!typeMeta.allowDuplicate) {
    state.cards[typeId] = sanitizeCardList(state.cards[typeId] || [], false);
  }

  persistAndSync();
  render();
}

function deleteType() {
  const typeId = manageTypeSelect.value;
  if (!typeId) return;
  if (state.cardTypes.length <= 1) {
    alert("至少保留一个卡密类型。");
    return;
  }

  const typeMeta = getTypeMeta(typeId);
  if (!typeMeta) return;

  const confirmed = confirm(`确定删除类型「${typeMeta.name}」及其全部卡密吗？`);
  if (!confirmed) return;

  state.cardTypes = state.cardTypes.filter((type) => type.id !== typeId);
  delete state.cards[typeId];
  delete state.templates[typeId];

  if (state.activeType === typeId) {
    state.activeType = state.cardTypes[0].id;
  }

  persistAndSync();
  render();
}

function createTypeId(name) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  const base = normalized || "type";
  let candidate = base;
  let index = 1;
  const existing = new Set(state.cardTypes.map((type) => type.id));

  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function normalizeDuplicateCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(count, 200);
}

function importCards() {
  const typeId = cardTypeSelect.value;
  const typeMeta = getTypeMeta(typeId);
  const raw = bulkInput.value;
  if (!typeMeta || !raw.trim() || !state.cards[typeId]) return;

  if (typeMeta.allowDuplicate) {
    const cardValue = raw.trim();
    const repeat = normalizeDuplicateCount(typeMeta.duplicateCount);
    for (let i = 0; i < repeat; i += 1) {
      state.cards[typeId].push({ value: cardValue, copied: false });
    }
  } else {
    const extracted = extractCards(raw);
    if (!extracted.length) return;

    const existingSet = new Set(state.cards[typeId].map((item) => item.value));
    extracted.forEach((value) => {
      if (!existingSet.has(value)) {
        state.cards[typeId].push({ value, copied: false });
        existingSet.add(value);
      }
    });
  }

  bulkInput.value = "";
  persistAndSync();

  state.activeType = typeId;
  state.activeView = "extract";
  updateView();
  render();
}

function extractCards(raw) {
  return raw.split(/[\n,;，；\s]+/).map((s) => s.trim()).filter(Boolean);
}

function getTypeMeta(typeId) {
  return state.cardTypes.find((type) => type.id === typeId);
}

function getTemplateForType(typeId) {
  const value = state.templates[typeId];
  return typeof value === "string" && value.trim() ? value : DEFAULT_TEMPLATE;
}

function buildCopyText(typeId, cardValue) {
  const template = getTemplateForType(typeId);
  if (template.includes("{{card}}")) {
    return template.replaceAll("{{card}}", cardValue);
  }
  return `${template}\n${cardValue}`;
}

function saveTemplate() {
  const typeId = templateTypeSelect.value;
  if (!typeId) return;

  state.templates[typeId] = templateInput.value.trim() || DEFAULT_TEMPLATE;
  templateStatus.textContent = "模板已保存";
  persistAndSync();
}

async function copyCard(text, btn, index) {
  const copyText = buildCopyText(state.activeType, text);

  try {
    await navigator.clipboard.writeText(copyText);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = copyText;
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }

  const list = state.cards[state.activeType] || [];
  if (list[index]) {
    list[index].copied = true;
  }

  btn.textContent = "已复制";
  btn.classList.add("copied");
  btn.disabled = true;

  persistAndSync();
  renderSummary();
}

function clearCopiedCards() {
  const list = state.cards[state.activeType] || [];
  state.cards[state.activeType] = list.filter((item) => !item.copied);
  persistAndSync();
  render();
}

function render() {
  renderTypeControls();
  renderTypeEditorSelect();
  renderTypeEditor();
  renderTemplateTypeSelect();
  renderTemplateEditor();
  renderList();
  renderSummary();
  renderSyncStatus();
}

function renderTypeControls() {
  renderTypeSelect();
  renderTypeTabs();
}

function renderTypeSelect() {
  cardTypeSelect.innerHTML = "";

  state.cardTypes.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = `${type.name}${type.allowDuplicate ? `（重复 x${type.duplicateCount}）` : ""}`;
    cardTypeSelect.appendChild(option);
  });

  cardTypeSelect.value = state.activeType;
}

function renderTypeTabs() {
  typeTabs.innerHTML = "";

  state.cardTypes.forEach((type) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.dataset.type = type.id;
    tab.textContent = type.name;
    tab.classList.toggle("active", type.id === state.activeType);

    tab.addEventListener("click", () => {
      state.activeType = type.id;
      render();
    });

    typeTabs.appendChild(tab);
  });
}

function renderTypeEditorSelect() {
  const currentType = manageTypeSelect.value;
  manageTypeSelect.innerHTML = "";

  state.cardTypes.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.name;
    manageTypeSelect.appendChild(option);
  });

  if (state.cardTypes.some((type) => type.id === currentType)) {
    manageTypeSelect.value = currentType;
  } else {
    manageTypeSelect.value = state.activeType;
  }
}

function renderTypeEditor() {
  const typeMeta = getTypeMeta(manageTypeSelect.value || state.activeType);
  if (!typeMeta) return;

  manageAllowDuplicateInput.checked = typeMeta.allowDuplicate;
  manageDuplicateCountInput.disabled = !typeMeta.allowDuplicate;
  manageDuplicateCountInput.value = String(typeMeta.duplicateCount || 1);
}

function renderTemplateTypeSelect() {
  const currentType = templateTypeSelect.value;
  templateTypeSelect.innerHTML = "";

  state.cardTypes.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.name;
    templateTypeSelect.appendChild(option);
  });

  if (state.cardTypes.some((type) => type.id === currentType)) {
    templateTypeSelect.value = currentType;
  } else {
    templateTypeSelect.value = state.activeType;
  }
}

function renderTemplateEditor() {
  const typeId = templateTypeSelect.value || state.activeType;
  templateInput.value = getTemplateForType(typeId);
  templateStatus.textContent = "未保存";
}

function renderList() {
  const list = state.cards[state.activeType] || [];
  cardList.innerHTML = "";

  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "暂无卡密，请先导入。";
    cardList.appendChild(li);
    return;
  }

  list.forEach((item, index) => {
    const fragment = cardItemTemplate.content.cloneNode(true);
    const cardText = fragment.querySelector(".card-text");
    const copyBtn = fragment.querySelector(".copy-btn");

    cardText.textContent = item.value;
    if (item.copied) {
      copyBtn.textContent = "已复制";
      copyBtn.classList.add("copied");
      copyBtn.disabled = true;
    }

    copyBtn.addEventListener("click", () => copyCard(item.value, copyBtn, index));
    cardList.appendChild(fragment);
  });
}

function renderSummary() {
  const list = state.cards[state.activeType] || [];
  const copied = list.filter((item) => item.copied).length;
  listSummary.textContent = `当前共有 ${list.length} 条，已复制 ${copied} 条`;
}

function renderSyncStatus(message) {
  if (message) {
    syncStatus.textContent = `云端状态：${message}`;
    return;
  }

  if (state.sync.pending) {
    syncStatus.textContent = "云端状态：同步中...";
    return;
  }

  if (!state.sync.lastSyncAt) {
    syncStatus.textContent = "云端状态：未同步";
    return;
  }

  const time = new Date(state.sync.lastSyncAt).toLocaleString();
  syncStatus.textContent = `云端状态：已同步（${time}）`;
}

function updateView() {
  navBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.activeView);
  });

  viewPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.view === state.activeView);
  });
}

function saveLocalState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      cardTypes: state.cardTypes,
      cards: state.cards,
      templates: state.templates,
    }),
  );
}

function loadLocalState() {
  try {
    const raw = getLocalStorageRaw();
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const sanitized = sanitizePayload(parsed);
    state.cardTypes = sanitized.cardTypes;
    state.cards = sanitized.cards;
    state.templates = sanitized.templates;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function getLocalStorageRaw() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return current;

  for (const key of LEGACY_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }

  return null;
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

    const allowDuplicate = Boolean(type.allowDuplicate);
    const duplicateCount = allowDuplicate ? normalizeDuplicateCount(type.duplicateCount) : 1;

    usedIds.add(id);
    cardTypes.push({
      id,
      name,
      allowDuplicate,
      duplicateCount,
    });
  });

  if (!cardTypes.length) {
    DEFAULT_TYPES.forEach((type) => {
      cardTypes.push({ ...type });
      usedIds.add(type.id);
    });
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

function ensureStateConsistency() {
  if (!state.cardTypes.some((type) => type.id === state.activeType)) {
    state.activeType = state.cardTypes[0]?.id || DEFAULT_TYPES[0].id;
  }

  state.cardTypes.forEach((type) => {
    if (!Array.isArray(state.cards[type.id])) {
      state.cards[type.id] = [];
    }

    if (typeof state.templates[type.id] !== "string" || !state.templates[type.id].trim()) {
      state.templates[type.id] = DEFAULT_TEMPLATE;
    }

    type.duplicateCount = type.allowDuplicate ? normalizeDuplicateCount(type.duplicateCount) : 1;
  });
}

function persistAndSync() {
  ensureStateConsistency();
  saveLocalState();
  syncToCloud();
}

async function syncFromCloud() {
  state.sync.pending = true;
  renderSyncStatus();

  try {
    const response = await fetch(CLOUD_API, { method: "GET", cache: "no-store" });
    if (!response.ok) throw new Error("load_failed");

    const data = await response.json();
    const sanitized = sanitizePayload(data);
    state.cardTypes = sanitized.cardTypes;
    state.cards = sanitized.cards;
    state.templates = sanitized.templates;
    ensureStateConsistency();
    state.sync.lastSyncAt = data.updatedAt || new Date().toISOString();
    saveLocalState();
    render();
  } catch {
    renderSyncStatus("连接云端失败，当前使用本地缓存");
  } finally {
    state.sync.pending = false;
    renderSyncStatus();
  }
}

async function syncToCloud() {
  state.sync.pending = true;
  renderSyncStatus();

  try {
    const response = await fetch(CLOUD_API, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardTypes: state.cardTypes,
        cards: state.cards,
        templates: state.templates,
      }),
    });

    if (!response.ok) throw new Error("save_failed");

    const data = await response.json();
    state.sync.lastSyncAt = data.updatedAt || new Date().toISOString();
    saveLocalState();
  } catch {
    renderSyncStatus("保存到云端失败，稍后可点手动同步");
    return;
  } finally {
    state.sync.pending = false;
  }

  renderSyncStatus();
}
