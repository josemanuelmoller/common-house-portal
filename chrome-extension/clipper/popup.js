// Common House Clipper — popup logic.

const els = {
  setup:      document.getElementById("setup"),
  main:       document.getElementById("main"),
  pageTitle:  document.getElementById("page-title"),
  pageUrl:    document.getElementById("page-url"),
  selection:  document.getElementById("selection"),
  notes:      document.getElementById("notes"),
  clipBtn:    document.getElementById("clip-btn"),
  cancelBtn:  document.getElementById("cancel-btn"),
  grabFull:   document.getElementById("grab-full-btn"),
  status:     document.getElementById("status"),
  openOpts:   document.getElementById("open-options"),
  settings:   document.getElementById("settings-link"),
};

const DEFAULT_API_URL = "https://portal.wearecommonhouse.com/api/clipper";

function showStatus(message, kind) {
  els.status.textContent = message;
  els.status.className = "status " + (kind === "ok" ? "ok" : "err");
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["clipperToken", "clipperApiUrl"], (res) => {
      resolve({
        token:  res.clipperToken  || "",
        apiUrl: res.clipperApiUrl || DEFAULT_API_URL,
      });
    });
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readSelectionFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() ?? "",
    });
    return results?.[0]?.result ?? "";
  } catch {
    return "";
  }
}

// Runs IN the page. Returns the main article text, cleaned of common noise.
// Keep this function self-contained — chrome.scripting serializes it and
// evaluates it in the page context, so outer-scope vars are not available.
function extractArticleText() {
  const selectors = [
    "article",
    "main [role='main']",
    "main",
    "[role='main']",
    "[itemprop='articleBody']",
    ".article-body",
    ".post-content",
    ".entry-content",
    "#content",
  ];
  let root = document.body;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length > 200) { root = el; break; }
  }

  const clone = root.cloneNode(true);
  const dropSelectors = [
    "nav", "header", "footer", "aside", "script", "style", "noscript",
    "form", "iframe",
    "[role='navigation']", "[role='banner']", "[role='contentinfo']",
    "[aria-hidden='true']",
    ".nav", ".navbar", ".menu", ".sidebar", ".footer", ".header",
    ".cookie", ".cookies", ".consent", ".newsletter", ".subscribe",
    ".share", ".social", ".comments", ".related", ".advertisement", ".ads", ".ad",
  ];
  clone.querySelectorAll(dropSelectors.join(",")).forEach(el => el.remove());

  let text = (clone.innerText || "").replace(/\r/g, "").trim();
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.split("\n").map(line => line.replace(/[ \t]{2,}/g, " ").trimEnd()).join("\n");
  return text;
}

async function grabFullPageFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractArticleText,
    });
    return results?.[0]?.result ?? "";
  } catch (err) {
    console.warn("grabFullPage failed:", err);
    return "";
  }
}

function openOptions(e) {
  if (e) e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
}

async function init() {
  els.openOpts.addEventListener("click", openOptions);
  els.settings.addEventListener("click", openOptions);
  els.cancelBtn.addEventListener("click", () => window.close());

  const { token } = await getSettings();
  if (!token) {
    els.setup.style.display = "block";
    return;
  }
  els.main.style.display = "block";

  const tab = await getActiveTab();
  if (!tab) {
    showStatus("No active tab detected.", "err");
    return;
  }

  els.pageTitle.textContent = tab.title || "(no title)";
  els.pageUrl.textContent   = tab.url   || "";

  const selection = await readSelectionFromTab(tab.id);
  els.selection.value = selection;

  els.clipBtn.addEventListener("click", () => submitClip(tab));
  els.grabFull.addEventListener("click", () => grabFullPage(tab));
}

async function grabFullPage(tab) {
  const original = els.grabFull.textContent;
  els.grabFull.disabled = true;
  els.grabFull.textContent = "Grabbing…";
  try {
    const text = await grabFullPageFromTab(tab.id);
    if (!text) {
      showStatus("Couldn't extract page text (restricted page?).", "err");
      return;
    }
    // Cap at 8000 chars for the UI — the server caps at 1900 anyway, but
    // we preserve more here so the user can trim before clipping.
    const capped = text.slice(0, 8000);
    els.selection.value = capped;
    const truncated = text.length > 8000 ? ` (truncated from ${text.length})` : "";
    showStatus(`Grabbed ${capped.length} chars${truncated}. Edit before clipping.`, "ok");
  } finally {
    els.grabFull.disabled = false;
    els.grabFull.textContent = original;
  }
}

async function submitClip(tab) {
  const { token, apiUrl } = await getSettings();
  if (!token) {
    showStatus("No token configured. Open settings.", "err");
    return;
  }

  els.clipBtn.disabled = true;
  els.clipBtn.textContent = "Clipping…";

  const body = {
    url:       tab.url,
    title:     tab.title,
    selection: els.selection.value.trim(),
    notes:     els.notes.value.trim(),
  };

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    let payload = {};
    try { payload = await res.json(); } catch { /* ignore */ }

    if (!res.ok) {
      showStatus(payload.error || `HTTP ${res.status}`, "err");
      els.clipBtn.disabled = false;
      els.clipBtn.textContent = "Clip";
      return;
    }

    if (payload.deduped) {
      showStatus("Already clipped — existing record kept.", "ok");
    } else {
      showStatus("Saved to Common House.", "ok");
    }
    els.clipBtn.textContent = "Done";
    setTimeout(() => window.close(), 1200);
  } catch (err) {
    showStatus("Network error: " + (err?.message || "unknown"), "err");
    els.clipBtn.disabled = false;
    els.clipBtn.textContent = "Clip";
  }
}

init();
