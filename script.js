const STORAGE_KEY = "xianyu-card-storage-v2";
const CLOUD_API = "/api/cards";
const COPY_MESSAGE_TEMPLATE = [
  "自助上车链接：https://invite.jerrylove.de5.net",
  "卡密：",
];

const state = {
  activeType: "warranty",
  activeView: "import",
  cards: {
    warranty: [],
    noWarranty: [],
  },
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
const tabs = [...document.querySelectorAll(".tab")];
const cardItemTemplate = document.querySelector("#cardItemTemplate");
const syncStatus = document.querySelector("#syncStatus");
const manualSyncBtn = document.querySelector("#manualSyncBtn");
const navBtns = [...document.querySelectorAll(".nav-btn")];
const viewPanels = [...document.querySelectorAll(".view-panel")];

initialize();

async function initialize() {
  loadLocalState();
  bindEvents();
  updateView();
  render();
  await syncFromCloud();
}

function bindEvents() {
  importBtn.addEventListener("click", importCards);
  clearCopiedBtn.addEventListener("click", clearCopiedCards);
  manualSyncBtn.addEventListener("click", syncFromCloud);

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeView = btn.dataset.view;
      updateView();
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeType = tab.dataset.type;
      updateTabs();
      render();
    });
  });
}

function importCards() {
  const type = cardTypeSelect.value;
  const raw = bulkInput.value.trim();
  if (!raw) return;

  const extracted = extractCards(raw);
  if (!extracted.length) return;

  const existingSet = new Set(state.cards[type].map((item) => item.value));
  extracted.forEach((value) => {
    if (!existingSet.has(value)) {
      state.cards[type].push({ value, copied: false });
      existingSet.add(value);
    }
  });

  bulkInput.value = "";
  persistAndSync();

  state.activeType = type;
  state.activeView = "extract";
  updateTabs();
  updateView();
  render();
}

function extractCards(raw) {
  return [...new Set(raw.split(/[\n,;，；\s]+/).map((s) => s.trim()).filter(Boolean))];
}

async function copyCard(text, btn, index) {
  const copyText = `${COPY_MESSAGE_TEMPLATE.join("\n")}${text}`;

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

  const list = state.cards[state.activeType];
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
  const list = state.cards[state.activeType];
  state.cards[state.activeType] = list.filter((item) => !item.copied);
  persistAndSync();
  render();
}

function render() {
  renderList();
  renderSummary();
  renderSyncStatus();
}

function renderList() {
  const list = state.cards[state.activeType];
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
  const list = state.cards[state.activeType];
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

function updateTabs() {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.type === state.activeType);
  });
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.cards = sanitizeCards(parsed);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
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

function persistAndSync() {
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
    state.cards = sanitizeCards(data.cards);
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
      body: JSON.stringify({ cards: state.cards }),
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
