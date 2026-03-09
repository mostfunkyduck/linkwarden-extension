const $ = id => document.getElementById(id);
const status = (msg, cls) => { $("status").textContent = msg; $("status").className = cls; };

function getConfig() {
  return {
    apiBase: $("cfg-base").value.trim().replace(/\/$/, ""),
    apiKey:  $("cfg-key").value.trim()
  };
}

async function bgFetch(path) {
  const { apiBase, apiKey } = getConfig();
  const result = await browser.runtime.sendMessage({ type: "FETCH", apiBase, apiKey, path });
  if (!result.ok) throw new Error(`${result.status}`);
  return result.response;
}

function populateCollections(collections, savedId) {
  const sel = $("link-collection");
  sel.innerHTML = "";
  (collections || []).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.dataset.name = c.name;
    opt.textContent = c.name;
    if (String(c.id) === String(savedId)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!savedId && sel.options.length) sel.options[0].selected = true;
}

function addTagOption(tag, selected = false) {
  const sel = $("link-tags");
  const opt = document.createElement("option");
  opt.value = tag.id || "";
  opt.dataset.name = tag.name;
  opt.textContent = tag.name;
  opt.selected = selected;
  sel.appendChild(opt);
}

async function loadRemoteData(savedCollectionId) {
  status("LOADING...", "inf");
  try {
    const [collections, tags] = await Promise.all([
      bgFetch("/api/v1/collections"),
      bgFetch("/api/v1/tags")
    ]);
    $("link-tags").innerHTML = "";
    (tags || []).forEach(t => addTagOption(t));
    populateCollections(collections, savedCollectionId);
    status(`LOADED — ${(collections||[]).length} collections, ${(tags||[]).length} tags`, "ok");
  } catch (err) {
    status(`ERROR loading: ${err.message}`, "err");
  }
}

// Init
browser.storage.local.get(["apiBase","apiKey","collectionId"]).then(cfg => {
  if (cfg.apiBase) $("cfg-base").value = cfg.apiBase;
  if (cfg.apiKey)  $("cfg-key").value  = cfg.apiKey;
  if (cfg.apiBase && cfg.apiKey) loadRemoteData(cfg.collectionId);
});

browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  $("current-url").textContent = tab?.url || "unavailable";
  if (tab?.title) $("link-name").placeholder = tab.title;
});

$("btn-save-cfg").addEventListener("click", async () => {
  const { apiBase, apiKey } = getConfig();
  if (!apiBase) { status("ERROR: instance URL required", "err"); return; }
  await browser.storage.local.set({ apiBase, apiKey });
  await loadRemoteData(null);
});

$("btn-reload").addEventListener("click", () => loadRemoteData(null));

$("btn-add-tag").addEventListener("click", () => {
  const name = $("new-tag-name").value.trim();
  if (!name) return;
  const exists = Array.from($("link-tags").options).some(o => o.textContent === name);
  if (exists) { status(`TAG EXISTS: ${name}`, "inf"); return; }
  addTagOption({ id: null, name }, true);
  $("new-tag-name").value = "";
  status(`TAG QUEUED: "${name}" — created on save`, "inf");
});

$("new-tag-name").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-add-tag").click(); });

$("btn-add-collection").addEventListener("click", async () => {
  const name = $("new-collection-name").value.trim();
  if (!name) return;
  const { apiBase, apiKey } = getConfig();
  if (!apiBase || !apiKey) { status("ERROR: config incomplete", "err"); return; }

  $("btn-add-collection").disabled = true;
  status(`CREATING collection "${name}"...`, "inf");

  try {
    const result = await browser.runtime.sendMessage({ type: "CREATE_COLLECTION", apiBase, apiKey, name });
    if (!result.ok) throw new Error(result.status);
    const created = result.response;
    const sel = $("link-collection");
    Array.from(sel.options).forEach(o => o.selected = false);
    const opt = document.createElement("option");
    opt.value = created.id;
    opt.dataset.name = created.name;
    opt.textContent = created.name;
    opt.selected = true;
    sel.appendChild(opt);
    $("new-collection-name").value = "";
    status(`CREATED collection "${name}" (id: ${created.id})`, "ok");
  } catch (err) {
    status(`ERROR creating collection: ${err.message}`, "err");
  } finally {
    $("btn-add-collection").disabled = false;
  }
});

$("new-collection-name").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-add-collection").click(); });

$("btn-save-link").addEventListener("click", async () => {
  const { apiBase, apiKey } = getConfig();
  if (!apiBase || !apiKey) { status("ERROR: config incomplete", "err"); return; }

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { status("ERROR: no active tab", "err"); return; }

  const selectedTags = Array.from($("link-tags").selectedOptions).map(o => {
    const tag = { name: o.dataset.name || o.textContent };
    if (o.value) tag.id = parseInt(o.value);
    return tag;
  });

  const selCol = $("link-collection").selectedOptions[0];
  const collection = selCol
    ? { id: parseInt(selCol.value), name: selCol.dataset.name || selCol.textContent }
    : { id: 1, name: "Unorganized" };

  browser.storage.local.set({ collectionId: collection.id });

  const payload = {
    name:        $("link-name").value.trim() || tab.title || tab.url,
    url:         tab.url,
    type:        "url",
    description: $("link-desc").value.trim(),
    tags:        selectedTags,
    collection
  };

  $("btn-save-link").disabled = true;
  status("SENDING...", "inf");

  const result = await browser.runtime.sendMessage({ type: "SEND_URL", apiBase, apiKey, payload });
  $("btn-save-link").disabled = false;

  if (result?.ok) {
    status(`OK ${result.status}`, "ok");
    $("link-name").value = "";
    $("link-desc").value = "";
    Array.from($("link-tags").options).forEach(o => o.selected = false);
  } else {
    status(`ERROR ${result?.status || ""}: ${result?.error || result?.body || "unknown"}`, "err");
  }
});
