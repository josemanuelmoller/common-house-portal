// Common House Clipper — settings page.
//
// apiUrl is hardcoded; only the token is user-settable. Letting users override
// the destination URL was an exfiltration foot-gun (the audit called it out).
// If you need a different endpoint for a fork, change DEFAULT_API_URL here.

const DEFAULT_API_URL = "https://portal.wearecommonhouse.com/api/clipper";

const tokenInput = document.getElementById("token");
const apiUrlInput = document.getElementById("apiUrl");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const statusEl = document.getElementById("status");

function showStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status " + (kind === "ok" ? "ok" : "err");
}

function load() {
  chrome.storage.local.get(["clipperToken"], (res) => {
    tokenInput.value  = res.clipperToken || "";
    if (apiUrlInput) {
      apiUrlInput.value    = DEFAULT_API_URL;
      apiUrlInput.readOnly = true;
      apiUrlInput.title    = "Hardcoded for security. Edit DEFAULT_API_URL in options.js to change.";
    }
  });
}

function save() {
  const token = tokenInput.value.trim();
  // apiUrl is hardcoded; ignore any stale value stored under clipperApiUrl.
  chrome.storage.local.set({ clipperToken: token }, () => {
    chrome.storage.local.remove("clipperApiUrl");
    showStatus("Saved.", "ok");
  });
}

async function test() {
  const token  = tokenInput.value.trim();
  const apiUrl = DEFAULT_API_URL;
  if (!token) {
    showStatus("Set a token first.", "err");
    return;
  }
  testBtn.disabled = true;
  testBtn.textContent = "Testing…";
  try {
    // Use a clearly-marked probe URL. The route will create a test Clipping record.
    const probeUrl = "https://example.invalid/clipper-test-" + Date.now();
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        url:       probeUrl,
        title:     "Clipper connection test",
        selection: "",
        notes:     "This is an automated test from the Chrome extension settings.",
      }),
    });
    let payload = {};
    try { payload = await res.json(); } catch { /* ignore */ }

    if (res.ok) {
      showStatus(`OK — Notion record: ${payload.id ?? "(no id returned)"}`, "ok");
    } else if (res.status === 401) {
      showStatus("401 Unauthorized — token rejected.", "err");
    } else {
      showStatus(`HTTP ${res.status}: ${payload.error ?? "unknown error"}`, "err");
    }
  } catch (err) {
    showStatus("Network error: " + (err?.message || "unknown"), "err");
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = "Test connection";
  }
}

saveBtn.addEventListener("click", save);
testBtn.addEventListener("click", test);
load();
