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

function isWhatsAppTab(tab) {
  return !!tab?.url && /^https:\/\/web\.whatsapp\.com/i.test(tab.url);
}

// Parse the WhatsApp Web tab.title into just the chat/contact name.
// Typical formats: "(3) Francisco Cerda L — WhatsApp", "Francisco Cerda L - WhatsApp".
function parseWaTabTitle(title) {
  if (!title) return null;
  return title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*[-—–]\s*WhatsApp\s*$/i, "")
    .replace(/\s*\(\d+\s+(new|nuevos?|mensajes?)\s*\)\s*$/i, "")
    .trim() || null;
}

function fmtClipStamp(d = new Date()) {
  // "21/4/2026 21:50"
  const pad = n => String(n).padStart(2, "0");
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// ─── Generic article extractor ────────────────────────────────────────────────

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

// ─── WhatsApp Web extractor ───────────────────────────────────────────────────
// Runs entirely in the page context — chrome.scripting serializes this function
// so it cannot reference outer-scope helpers. Everything is inlined.
// Strategy: find the scrollable messages container, scroll to top in a loop
// while harvesting messages by their `data-pre-plain-text` attribute (stable
// across WhatsApp Web versions for years).

async function extractWhatsAppConversation() {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const main = document.querySelector("#main");
  if (!main) {
    return { error: "NO_CHAT_OPEN" };
  }

  // Find the largest scrollable child inside #main
  function findContainer() {
    const rolePick = main.querySelector("[role='application']");
    if (rolePick && rolePick.scrollHeight > rolePick.clientHeight + 50) return rolePick;
    let best = null;
    main.querySelectorAll("div").forEach(div => {
      try {
        const cs = getComputedStyle(div);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") &&
            div.scrollHeight > div.clientHeight + 50) {
          if (!best || div.scrollHeight > best.scrollHeight) best = div;
        }
      } catch { /* ignore cross-origin or detached */ }
    });
    return best;
  }

  const container = findContainer();
  if (!container) {
    return { error: "NO_SCROLL_CONTAINER" };
  }

  // Chat title from the header — skip status strings like "en línea", "online",
  // "escribiendo…", "last seen".
  function getTitle() {
    const header = main.querySelector("header");
    if (!header) return null;
    const skip = /^(en línea|en linea|online|offline|last seen|visto por última vez|escribiendo|typing|…|\s*)$/i;
    const candidates = header.querySelectorAll("span[title], span[dir='auto']");
    for (const c of candidates) {
      const t = (c.getAttribute("title") || c.textContent || "").trim();
      if (!t || skip.test(t)) continue;
      // Skip lone timestamps too
      if (/^\d{1,2}:\d{2}$/.test(t)) continue;
      return t;
    }
    return null;
  }
  const chatTitle = getTitle() || "WhatsApp conversation";

  // Parse a message element (one that carries data-pre-plain-text)
  function parseWaDateTime(date, time) {
    const dm = (date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!dm) return 0;
    let d = parseInt(dm[1], 10), m = parseInt(dm[2], 10), y = parseInt(dm[3], 10);
    if (y < 100) y += 2000;
    const tm = (time || "").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const hh = tm ? parseInt(tm[1], 10) : 0;
    const mm = tm ? parseInt(tm[2], 10) : 0;
    return new Date(y, m - 1, d, hh, mm).getTime();
  }

  // WhatsApp UI chrome that shows up inside contact cards / previews — drop it
  const CHROME_LINES = new Set([
    "Mensaje", "Añadir a un grupo", "Guardar contacto",
    "Llamar", "Videollamada", "Bloquear",
    "Message", "Add to group", "Save contact",
    "Call", "Video call", "Block",
  ]);

  function cleanLines(text) {
    return text
      .split("\n")
      .map(l => l.trimEnd())
      .filter(l => {
        const t = l.trim();
        if (!t) return false;
        if (CHROME_LINES.has(t)) return false;
        // Drop lone HH:MM timestamps repeated inside card UI
        if (/^\d{1,2}:\d{2}$/.test(t)) return false;
        return true;
      })
      .join("\n")
      .trim();
  }

  // Post-process a single message's text: strip leaked CSS classnames, icon
  // markers, trailing timestamps, forwarded labels, file-size annotations, and
  // collapse duplicated URLs that come from link-preview cards rendering the
  // same URL twice.
  function scrubText(text) {
    let t = text || "";
    // WhatsApp internal icon / class names leaking as text
    t = t.replace(/\b(?:ic|msg|forward|emoji|status|video|audio|image|sticker)-[a-z0-9-]+/gi, "");
    // "Reenviado" / "Forwarded" label (standalone word surrounded by punctuation/space)
    t = t.replace(/(^|[\s,.;:·—])Reenviado(?=[\s,.;:·—]|$)/g, "$1");
    t = t.replace(/(^|[\s,.;:·—])Forwarded(?=[\s,.;:·—]|$)/g, "$1");
    // File size annotations: "26 kB", "142 kB", "2 MB"
    t = t.replace(/\b\d+(?:[.,]\d+)?\s?(?:kB|KB|MB|GB|Mb|kb)\b/g, "");
    // Double-check / check mark icon residues
    t = t.replace(/\bmsg-dblcheck\b/gi, "").replace(/\bmsg-check\b/gi, "");
    // Trailing HH:MM on each line (the bubble timestamp that leaks in)
    t = t.split("\n").map(l => l.replace(/\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/, "")).join("\n");
    // Collapse adjacent duplicate URLs (link-preview dup)
    //   "domain.comhttps://domain.com/pathdomain.comhttps://domain.com/path"
    //   → keep one occurrence
    t = t.replace(/(https?:\/\/\S+)\1/g, "$1");
    // Collapse "<domain><url><domain><url>" → "<url>"
    t = t.replace(/([a-z0-9.-]+\.[a-z]{2,})(https?:\/\/[^\s]+?)\1\2/g, "$2");
    // Collapse multiple spaces
    t = t.replace(/[ \t]+/g, " ");
    return t.trim();
  }

  function findBubble(el) {
    let b = el;
    for (let i = 0; i < 10 && b; i++) {
      const cn = typeof b.className === "string" ? b.className : "";
      if (/message-(in|out)/.test(cn)) return b;
      b = b.parentElement;
    }
    return el.parentElement || el;
  }

  // Extract the main message text scoped to the data-pre-plain-text element
  // itself. This keeps us out of link-preview cards and quoted-reply blocks
  // that live elsewhere in the bubble.
  function extractMainText(el) {
    const clone = el.cloneNode(true);
    // Remove quoted-reply blocks if they happen to be nested inside
    clone.querySelectorAll([
      "[aria-label*='quoted' i]",
      "[class*='quoted-mention']",
    ].join(",")).forEach(n => n.remove());
    const selTxt = clone.querySelector(".selectable-text");
    return (selTxt ? selTxt.innerText : clone.innerText) || "";
  }

  // Extract the quoted reply preview (a sibling or parent-sibling of el, not
  // necessarily a descendant — reply UI is often a separate block above the
  // actual text within the same bubble).
  function extractQuote(bubble) {
    const q = bubble.querySelector(
      "[aria-label*='quoted' i], [class*='quoted-mention']"
    );
    if (!q) return null;
    const txt = (q.innerText || "").replace(/\s+/g, " ").trim();
    if (!txt) return null;
    return txt.length > 100 ? txt.slice(0, 100) + "…" : txt;
  }

  function detectMedia(bubble) {
    if (bubble.querySelector("[data-icon*='audio']")) {
      // Find duration text — a span like "0:05"
      const durSpan = [...bubble.querySelectorAll("span")]
        .find(s => /^\d+:\d{2}$/.test((s.textContent || "").trim()));
      return durSpan ? `[audio ${durSpan.textContent.trim()}]` : "[audio]";
    }
    if (bubble.querySelector("video, [data-icon*='video']")) return "[video]";
    if (bubble.querySelector("[data-icon*='sticker']"))      return "[sticker]";
    if (bubble.querySelector("[data-icon*='document']")) {
      const fn = [...bubble.querySelectorAll("span")]
        .find(s => /\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt|rtf)$/i.test((s.textContent || "").trim()));
      return fn ? `[document: ${fn.textContent.trim()}]` : "[document]";
    }
    if (bubble.querySelector("[data-icon*='contact']")) {
      const titled = bubble.querySelector("span[title]");
      if (titled) return `[contact: ${titled.getAttribute("title") || titled.textContent}]`;
      return "[contact]";
    }
    if (bubble.querySelector("img[src]")) return "[image]";
    // Emoji-only message — WhatsApp renders emoji as <img alt="🫶">
    const emojiImgs = [...bubble.querySelectorAll("img[alt]")]
      .map(i => (i.getAttribute("alt") || "").trim())
      .filter(a => a && a.length <= 6 && !/[A-Za-z0-9]/.test(a));
    if (emojiImgs.length) return emojiImgs.join("");
    return "";
  }

  function parseMessage(el) {
    const meta = el.getAttribute("data-pre-plain-text") || "";
    const m = meta.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?),\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\]\s*(.+?):\s*$/);
    const time   = m ? m[1] : "";
    const date   = m ? m[2] : "";
    const sender = m ? m[3].trim() : "";

    const bubble = findBubble(el);
    const quote  = extractQuote(bubble);

    // Main text, scoped to the data-pre-plain-text element (avoids the
    // link-preview card duplication and quoted-reply bleed).
    let text = scrubText(cleanLines(extractMainText(el)));

    // If scoped extraction was empty, it might be a message whose text sits
    // outside the data-pre-plain-text element (rare). Fall back to bubble
    // scope minus quote.
    if (!text) {
      const bClone = bubble.cloneNode(true);
      bClone.querySelectorAll("[aria-label*='quoted' i], [class*='quoted-mention']")
        .forEach(n => n.remove());
      text = scrubText(cleanLines(bClone.querySelector(".selectable-text")?.innerText || ""));
    }

    // Still nothing → it's media / contact / emoji
    if (!text) text = detectMedia(bubble) || "[empty]";

    return {
      time, date, sender, quote,
      text: text.replace(/\r/g, "").trim(),
      ts: parseWaDateTime(date, time),
    };
  }

  // Collect loop: scroll to top, wait, harvest visible, repeat until stable.
  const collected = new Map();
  const keyOf = (el) => {
    const meta = el.getAttribute("data-pre-plain-text") || "";
    const sig = (el.closest("[role='row']") || el.parentElement)?.innerText?.slice(0, 160) || "";
    return meta + "::" + sig;
  };

  const startTime = Date.now();
  const MAX_MS = 60_000;
  const MAX_STABLE_PASSES = 4;
  let stable = 0;
  let prevHeight = -1;

  while (stable < MAX_STABLE_PASSES && (Date.now() - startTime) < MAX_MS) {
    // Harvest what's currently rendered
    container.querySelectorAll("[data-pre-plain-text]").forEach(el => {
      const key = keyOf(el);
      if (!collected.has(key)) collected.set(key, parseMessage(el));
    });

    // Try to load older messages
    const beforeHeight = container.scrollHeight;
    container.scrollTop = 0;
    await sleep(700);
    const afterHeight = container.scrollHeight;

    if (afterHeight === beforeHeight && beforeHeight === prevHeight) {
      stable++;
    } else {
      stable = 0;
    }
    prevHeight = afterHeight;
  }

  // Final pass
  container.querySelectorAll("[data-pre-plain-text]").forEach(el => {
    const key = keyOf(el);
    if (!collected.has(key)) collected.set(key, parseMessage(el));
  });

  // ── Reactions pass ─────────────────────────────────────────────────────
  // Reactions are separate DOM elements (no data-pre-plain-text). Find them
  // and attach each to the nearest ancestor that wraps a message we already
  // collected.
  const keyByMessage = new Map();
  collected.forEach((msg, key) => { keyByMessage.set(msg, key); });

  const reactionMap = new Map(); // key → Set<emoji>
  const reactionEls = container.querySelectorAll(
    "button[aria-label*='reaction' i], [aria-label*='reaction' i][role='button']"
  );
  reactionEls.forEach(rEl => {
    // Extract emoji text
    const emoji = (rEl.textContent || "").trim().replace(/\d+$/, "").trim();
    if (!emoji) return;
    // Walk up to find the message this reaction belongs to
    let cur = rEl.parentElement;
    for (let i = 0; i < 20 && cur; i++) {
      const anchor = cur.querySelector?.("[data-pre-plain-text]");
      if (anchor) {
        const key = keyOf(anchor);
        if (collected.has(key)) {
          if (!reactionMap.has(key)) reactionMap.set(key, new Set());
          reactionMap.get(key).add(emoji);
        }
        break;
      }
      cur = cur.parentElement;
    }
  });
  // Attach reactions onto messages
  reactionMap.forEach((emojiSet, key) => {
    const msg = collected.get(key);
    if (msg) msg.reactions = [...emojiSet];
  });

  const messages = Array.from(collected.values()).sort((a, b) => a.ts - b.ts);

  return {
    title: chatTitle,
    messageCount: messages.length,
    elapsedMs: Date.now() - startTime,
    timedOut: (Date.now() - startTime) >= MAX_MS,
    messages,
  };
}

async function grabWhatsAppFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractWhatsAppConversation,
    });
    return results?.[0]?.result ?? { error: "NO_RESULT" };
  } catch (err) {
    console.warn("grabWhatsApp failed:", err);
    return { error: "EXEC_FAILED", message: err?.message || "unknown" };
  }
}

function formatWhatsAppDump(data) {
  const hdrLines = [
    `Chat: ${data.title} (WhatsApp Web)`,
    `Messages: ${data.messageCount}`,
  ];
  if (data.messages.length) {
    const first = data.messages[0];
    const last  = data.messages[data.messages.length - 1];
    hdrLines.push(`Range: ${first.date} ${first.time} — ${last.date} ${last.time}`);
  }
  if (data.timedOut) hdrLines.push("(Timed out — older messages may be missing.)");

  const body = data.messages.map(m => {
    const lines = [];
    if (m.quote) lines.push(`  > [replying to: ${m.quote}]`);
    lines.push(`[${m.time}, ${m.date}] ${m.sender}: ${m.text}`);
    if (m.reactions?.length) {
      lines.push(`  ⟲ reactions: ${m.reactions.join(" ")}`);
    }
    return lines.join("\n");
  }).join("\n");

  return hdrLines.join("\n") + "\n\n" + body;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

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

  const isWa = isWhatsAppTab(tab);

  if (isWa) {
    // WA mode — show the chat name if the tab title exposes it
    const chatName = parseWaTabTitle(tab.title);
    els.pageTitle.textContent = chatName
      ? `${chatName} · WhatsApp · Clipped ${fmtClipStamp()}`
      : "WhatsApp conversation (open a chat first)";
    els.pageUrl.textContent   = tab.url || "";
    els.grabFull.textContent  = "Clip conversation";
    els.grabFull.title        = "Auto-scroll the open chat and capture all visible messages";
    els.selection.placeholder = "Conversation text will appear here after extraction…";
  } else {
    els.pageTitle.textContent = tab.title || "(no title)";
    els.pageUrl.textContent   = tab.url   || "";
    const selection = await readSelectionFromTab(tab.id);
    els.selection.value = selection;
  }

  els.clipBtn.addEventListener("click", () => submitClip(tab));
  els.grabFull.addEventListener("click", () => {
    if (isWhatsAppTab(tab)) {
      grabWhatsApp(tab);
    } else {
      grabFullPage(tab);
    }
  });
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
    const capped = text.slice(0, 8000);
    els.selection.value = capped;
    const truncated = text.length > 8000 ? ` (truncated from ${text.length})` : "";
    showStatus(`Grabbed ${capped.length} chars${truncated}. Edit before clipping.`, "ok");
  } finally {
    els.grabFull.disabled = false;
    els.grabFull.textContent = original;
  }
}

async function grabWhatsApp(tab) {
  const original = els.grabFull.textContent;
  els.grabFull.disabled = true;
  els.grabFull.textContent = "Reading…";
  showStatus("Scrolling through messages… this may take a few seconds.", "ok");
  try {
    const data = await grabWhatsAppFromTab(tab.id);

    if (data?.error === "NO_CHAT_OPEN") {
      showStatus("Open a conversation in WhatsApp first, then try again.", "err");
      return;
    }
    if (data?.error === "NO_SCROLL_CONTAINER") {
      showStatus("Couldn't find the messages pane. Is WhatsApp Web fully loaded?", "err");
      return;
    }
    if (data?.error) {
      showStatus("WhatsApp extraction failed: " + (data.message || data.error), "err");
      return;
    }
    if (!data.messageCount) {
      showStatus("No messages found in the open chat.", "err");
      return;
    }

    const chatName = data.title || parseWaTabTitle(tab.title) || "WhatsApp conversation";
    els.pageTitle.textContent = `${chatName} · WhatsApp · Clipped ${fmtClipStamp()}`;
    const dump = formatWhatsAppDump(data);
    // Popup textarea cap generous — user can trim before clipping. Server caps
    // Processed Summary at ~1900 chars. Longer dumps will get truncated server-side
    // in v0.4.0 — v0.4.1 will chunk into Notion page children.
    const POPUP_CAP = 100000;
    const capped = dump.slice(0, POPUP_CAP);
    els.selection.value = capped;
    const truncated = dump.length > POPUP_CAP ? ` (shown truncated from ${dump.length})` : "";
    const elapsed = (data.elapsedMs / 1000).toFixed(1);
    const warn = data.timedOut ? " — scroll timed out, older messages may be missing" : "";
    const serverWarn = dump.length > 1800 ? ` ⚠ only first ~1900 chars will land in Notion this version — trim to what matters most.` : "";
    showStatus(`Read ${data.messageCount} messages in ${elapsed}s${warn}${truncated}.${serverWarn}`, "ok");
  } catch (err) {
    showStatus("Error: " + (err?.message || "unknown"), "err");
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

  // On WhatsApp, prefer the (possibly overridden) chat title over the raw page title
  const title = isWhatsAppTab(tab) && els.pageTitle.textContent
    ? `WhatsApp — ${els.pageTitle.textContent}`
    : tab.title;

  const body = {
    url:       tab.url,
    title,
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
