(function () {
  "use strict";

  const AC = globalThis.AUTOCHAT;
  const DEFAULTS = AC.defaults;
  const MIN_DELAY = 5;
  const MAX_DELAY = 3600;
  const MIN_TIMEOUT = 15;
  const MAX_TIMEOUT = 1800;

  const els = {
    enabledToggle: document.getElementById("enabledToggle"),
    hero: document.getElementById("hero"),
    heroTitle: document.getElementById("heroTitle"),
    heroDetail: document.getElementById("heroDetail"),
    heroCount: document.getElementById("heroCount"),
    minSeconds: document.getElementById("minSeconds"),
    maxSeconds: document.getElementById("maxSeconds"),
    waitForResponse: document.getElementById("waitForResponse"),
    responseTimeoutSeconds: document.getElementById("responseTimeoutSeconds"),
    timeoutRow: document.getElementById("timeoutRow"),
    showHud: document.getElementById("showHud"),
    tabList: document.getElementById("tabList"),
    refreshButton: document.getElementById("refreshButton"),
    customMessages: document.getElementById("customMessages"),
    customCount: document.getElementById("customCount"),
    testButton: document.getElementById("testButton"),
    saveState: document.getElementById("saveState"),
    toast: document.getElementById("toast"),
    version: document.getElementById("version")
  };

  let settings = { ...DEFAULTS };
  let tabEntries = [];
  let refreshInFlight = false;
  let refreshTimer = null;
  let customSaveTimer = null;
  let saveStateTimer = null;
  let toastTimer = null;
  const injectionAttempted = new Set();

  init().catch((error) => {
    console.warn("[AI Autochat] popup init failed", error);
    setSaveState("Could not load", "error");
  });

  async function init() {
    els.version.textContent = chrome.runtime.getManifest().version;

    await loadSettings();
    bindEvents();
    renderControls();
    renderTabs();
    updateHero();

    await refreshTabs();
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) refreshTabs();
    }, 1200);

    window.addEventListener("unload", () => {
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (customSaveTimer) window.clearTimeout(customSaveTimer);
    });
  }

  /* ----------------------------------------------------------------------- */
  /* Settings                                                                */
  /* ----------------------------------------------------------------------- */

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
      settings = normalizeSettings({ ...DEFAULTS, ...stored });
    } catch (error) {
      console.warn("[AI Autochat] could not load settings", error);
      settings = { ...DEFAULTS };
    }
  }

  function normalizeSettings(value) {
    const min = clampNumber(value.minSeconds, MIN_DELAY, MAX_DELAY, DEFAULTS.minSeconds);
    const max = clampNumber(value.maxSeconds, min, MAX_DELAY, DEFAULTS.maxSeconds);

    return {
      enabled: Boolean(value.enabled),
      minSeconds: min,
      maxSeconds: Math.max(min, max),
      waitForResponse: value.waitForResponse !== false,
      responseTimeoutSeconds: clampNumber(
        value.responseTimeoutSeconds,
        MIN_TIMEOUT,
        MAX_TIMEOUT,
        DEFAULTS.responseTimeoutSeconds
      ),
      showHud: value.showHud !== false,
      customMessages: typeof value.customMessages === "string" ? value.customMessages : ""
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  async function save(patch) {
    let normalized = normalizeSettings({ ...settings, ...patch });

    if ("minSeconds" in patch || "maxSeconds" in patch) {
      patch = {
        ...patch,
        minSeconds: normalized.minSeconds,
        maxSeconds: normalized.maxSeconds
      };
    }

    settings = normalized;
    renderControls();
    updateHero();
    setSaveState("Saving…", "");

    try {
      await chrome.storage.local.set(patch);
      setSaveState("Saved", "saved");
    } catch (error) {
      console.warn("[AI Autochat] could not save settings", error);
      setSaveState("Save failed", "error");
      showToast("Could not save settings. Try reopening the popup.", "error");
    }
  }

  function renderControls() {
    els.enabledToggle.checked = settings.enabled;

    setNumberInput(els.minSeconds, settings.minSeconds);
    setNumberInput(els.maxSeconds, settings.maxSeconds);
    setNumberInput(els.responseTimeoutSeconds, settings.responseTimeoutSeconds);

    els.waitForResponse.checked = settings.waitForResponse;
    els.responseTimeoutSeconds.disabled = !settings.waitForResponse;
    els.timeoutRow.classList.toggle("is-disabled", !settings.waitForResponse);

    els.showHud.checked = settings.showHud;

    if (document.activeElement !== els.customMessages) {
      els.customMessages.value = settings.customMessages;
    }
    updateCustomCount();
  }

  function setNumberInput(element, value) {
    if (document.activeElement === element) return;
    element.value = String(value);
  }

  function updateCustomCount() {
    const lines = getCustomLines(els.customMessages.value);
    if (!lines.length) {
      els.customCount.textContent = "built-in";
      return;
    }
    els.customCount.textContent =
      lines.length > 200 ? "200 max" : `${lines.length} custom`;
  }

  function getCustomLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  /* ----------------------------------------------------------------------- */
  /* Events                                                                  */
  /* ----------------------------------------------------------------------- */

  function bindEvents() {
    els.enabledToggle.addEventListener("change", async () => {
      const enabled = els.enabledToggle.checked;
      injectionAttempted.clear();
      await save({ enabled });
      window.setTimeout(refreshTabs, 250);
    });

    els.minSeconds.addEventListener("change", commitTiming);
    els.maxSeconds.addEventListener("change", commitTiming);

    els.responseTimeoutSeconds.addEventListener("change", () => {
      const timeout = clampNumber(
        els.responseTimeoutSeconds.value,
        MIN_TIMEOUT,
        MAX_TIMEOUT,
        settings.responseTimeoutSeconds
      );
      save({ responseTimeoutSeconds: timeout });
    });

    els.waitForResponse.addEventListener("change", () => {
      save({ waitForResponse: els.waitForResponse.checked });
    });

    els.showHud.addEventListener("change", () => {
      save({ showHud: els.showHud.checked });
    });

    els.customMessages.addEventListener("input", () => {
      updateCustomCount();
      setSaveState("Saving…", "");

      if (customSaveTimer) window.clearTimeout(customSaveTimer);
      customSaveTimer = window.setTimeout(() => {
        customSaveTimer = null;
        save({ customMessages: els.customMessages.value });
      }, 500);
    });

    els.customMessages.addEventListener("blur", () => {
      if (customSaveTimer) {
        window.clearTimeout(customSaveTimer);
        customSaveTimer = null;
      }
      save({ customMessages: els.customMessages.value });
    });

    els.refreshButton.addEventListener("click", () => {
      refreshTabs();
    });

    els.testButton.addEventListener("click", handleTestMessage);
    els.toast.addEventListener("click", hideToast);

    els.tabList.addEventListener("click", onTabListClick);
    els.tabList.addEventListener("keydown", onTabListKeyDown);

    chrome.storage.onChanged.addListener(onStorageChanged);
  }

  function commitTiming() {
    const min = clampNumber(els.minSeconds.value, MIN_DELAY, MAX_DELAY, settings.minSeconds);
    const max = clampNumber(els.maxSeconds.value, MIN_DELAY, MAX_DELAY, settings.maxSeconds);
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    save({ minSeconds: low, maxSeconds: high });
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== "local") return;

    let changed = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        settings[key] = changes[key].newValue;
        changed = true;
      }
    }
    if (!changed) return;

    settings = normalizeSettings(settings);
    renderControls();
    updateHero();

    if (Object.prototype.hasOwnProperty.call(changes, "enabled")) {
      injectionAttempted.clear();
      refreshTabs();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Tab discovery and status                                                */
  /* ----------------------------------------------------------------------- */

  async function refreshTabs() {
    if (refreshInFlight) return;
    refreshInFlight = true;

    try {
      const tabs = await chrome.tabs.query({});
      const supported = [];

      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        const site = siteFromUrl(tab.url);
        if (site) supported.push({ tab, site });
      }

      supported.sort((a, b) => {
        if (a.tab.windowId !== b.tab.windowId) return a.tab.windowId - b.tab.windowId;
        return a.tab.index - b.tab.index;
      });

      const entries = await Promise.all(
        supported.map(async ({ tab, site }) => {
          let status = await sendToTab(tab.id, { type: "AUTOCHAT_GET_STATUS" });

          if (!status && settings.enabled && !tab.discarded && !injectionAttempted.has(tab.id)) {
            injectionAttempted.add(tab.id);
            await ensureTab(tab.id);
            await sleep(250);
            status = await sendToTab(tab.id, { type: "AUTOCHAT_GET_STATUS" });
          }

          return { tab, site, status };
        })
      );

      tabEntries = entries;
      renderTabs();
      updateHero();
    } catch (error) {
      console.warn("[AI Autochat] could not list tabs", error);
    } finally {
      refreshInFlight = false;
    }
  }

  function siteFromUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:") return null;
      return AC.getSite(url.hostname, url.pathname);
    } catch {
      return null;
    }
  }

  function sendToTab(tabId, message, timeoutMs = 1600) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, timeoutMs);

      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          void chrome.runtime.lastError;
          resolve(response || null);
        });
      } catch {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve(null);
        }
      }
    });
  }

  function ensureTab(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "AUTOCHAT_ENSURE_TAB", tabId }, (response) => {
          void chrome.runtime.lastError;
          resolve(response || { ok: false, error: "No response from the extension worker." });
        });
      } catch {
        resolve({ ok: false, error: "The extension worker is unavailable." });
      }
    });
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  /* ----------------------------------------------------------------------- */
  /* Rendering                                                               */
  /* ----------------------------------------------------------------------- */

  function updateHero() {
    const entries = tabEntries;
    const running = entries.filter((entry) => entry.status?.running);
    const totalSent = entries.reduce(
      (sum, entry) => sum + (Number(entry.status?.sentCount) || 0),
      0
    );

    els.hero.dataset.tone = "off";
    els.heroCount.textContent = "";

    if (!settings.enabled) {
      els.heroTitle.textContent = "Paused";
      els.heroCount.textContent = entries.length ? `${entries.length} open` : "";
      els.heroDetail.textContent = entries.length
        ? "Your AI tabs are open and untouched. Flip the switch to begin."
        : "Open ChatGPT, Gemini, Claude, or another supported AI chat to get started.";
      return;
    }

    if (!entries.length) {
      els.hero.dataset.tone = "warn";
      els.heroTitle.textContent = "Enabled — no AI tab open";
      els.heroDetail.textContent =
        "Open one of the supported sites in a tab. The loop starts as soon as the chat box appears.";
      return;
    }

    if (running.length) {
      els.hero.dataset.tone = "on";
      els.heroTitle.textContent = `Running in ${running.length} tab${running.length === 1 ? "" : "s"}`;
      els.heroCount.textContent = totalSent ? `${totalSent} sent` : "active";
      const first = running[0];
      els.heroDetail.textContent = `${first.site.name}: ${liveDetail(first)}`;
      return;
    }

    const errorEntry = entries.find((entry) => entry.status?.state === "error");
    if (errorEntry) {
      els.hero.dataset.tone = "warn";
      els.heroTitle.textContent = "Enabled — a tab needs attention";
      els.heroCount.textContent = `${entries.length} open`;
      els.heroDetail.textContent = `${errorEntry.site.name}: ${errorEntry.status.detail}`;
      return;
    }

    els.hero.dataset.tone = "warn";
    els.heroTitle.textContent = "Enabled — connecting…";
    els.heroCount.textContent = `${entries.length} open`;
    const withStatus = entries.find((entry) => entry.status);
    els.heroDetail.textContent =
      withStatus?.status?.detail ||
      "Keep a supported chat tab open. Attaching may take a moment after the extension loads.";
  }

  function liveDetail(entry) {
    const status = entry.status;
    if (!status) return "attaching…";
    if (status.state === "cooldown" && status.nextSendAt) {
      const seconds = Math.max(0, Math.ceil((status.nextSendAt - Date.now()) / 1000));
      return `next message in ${seconds}s`;
    }
    return status.detail || "working…";
  }

  function renderTabs() {
    const previousScroll = els.tabList.scrollTop;
    els.tabList.textContent = "";

    if (!tabEntries.length) {
      els.tabList.appendChild(renderEmptyState());
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const entry of tabEntries) {
      const row = document.createElement("li");
      row.className = "tab-row";
      row.dataset.tabId = String(entry.tab.id);
      row.dataset.windowId = String(entry.tab.windowId);
      row.dataset.site = entry.site.id;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.title = `Open ${entry.site.name} tab`;

      const mark = document.createElement("span");
      mark.className = "provider-mark";
      mark.textContent = siteMark(entry.site);
      mark.setAttribute("aria-hidden", "true");

      const copy = document.createElement("span");
      copy.className = "tab-copy";

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = entry.site.name;

      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = entry.tab.title || "Untitled chat";

      copy.append(name, title);

      const description = describeTab(entry);
      const state = document.createElement("span");
      state.className = "tab-state";
      state.dataset.tone = description.tone;
      state.textContent = description.label;
      state.title = description.title;

      row.append(mark, copy, state);
      fragment.appendChild(row);
    }

    els.tabList.appendChild(fragment);
    els.tabList.scrollTop = previousScroll;
  }

  function renderEmptyState() {
    const item = document.createElement("li");
    item.className = "empty-state";

    const text = document.createElement("div");
    text.textContent = "No supported AI chat tabs are open yet.";
    item.appendChild(text);

    const links = document.createElement("div");
    for (const target of [
      { label: "ChatGPT", url: "https://chatgpt.com/" },
      { label: "Gemini", url: "https://gemini.google.com/app" },
      { label: "Claude", url: "https://claude.ai/new" }
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-open";
      button.dataset.openUrl = target.url;
      button.textContent = `Open ${target.label} ↗`;
      links.appendChild(button);
    }
    item.appendChild(links);

    return item;
  }

  function describeTab(entry) {
    if (entry.tab.discarded) {
      return {
        label: "Sleeping",
        tone: "warn",
        title: "This tab was discarded by Edge. Click the row to wake it."
      };
    }

    if (!entry.status) {
      return {
        label: "Attach",
        tone: "warn",
        title: "The content script is not attached yet. Click the row to open it, then reload if needed."
      };
    }

    const status = entry.status;

    if (!settings.enabled) {
      return { label: "Paused", tone: "off", title: status.detail || "Autochat is paused." };
    }

    switch (status.state) {
      case "starting":
        return { label: "Starting", tone: "wait", title: status.detail };
      case "sending":
        return { label: "Sending", tone: "wait", title: status.detail };
      case "waiting-for-reply":
        return { label: "Replying", tone: "wait", title: status.detail };
      case "cooldown": {
        const seconds = status.nextSendAt
          ? Math.max(0, Math.ceil((status.nextSendAt - Date.now()) / 1000))
          : null;
        return {
          label: seconds === null ? "Waiting" : `Next ${seconds}s`,
          tone: "on",
          title: status.detail || `${status.sentCount || 0} message(s) sent.`
        };
      }
      case "waiting-for-input":
        return { label: "Needs chat", tone: "warn", title: status.detail };
      case "error":
        return { label: "Retrying", tone: "error", title: status.detail };
      default:
        return { label: "Idle", tone: "warn", title: status.detail || "Waiting to start." };
    }
  }

  function siteMark(site) {
    const words = site.name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return site.name.slice(0, 2).toUpperCase();
  }

  /* ----------------------------------------------------------------------- */
  /* Tab interactions                                                        */
  /* ----------------------------------------------------------------------- */

  function onTabListClick(event) {
    const quickOpen = event.target.closest("[data-open-url]");
    if (quickOpen) {
      chrome.tabs.create({ url: quickOpen.dataset.openUrl });
      window.close();
      return;
    }

    const row = event.target.closest(".tab-row");
    if (!row) return;

    activateTab(Number(row.dataset.tabId), Number(row.dataset.windowId));
  }

  function onTabListKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".tab-row");
    if (!row) return;

    event.preventDefault();
    activateTab(Number(row.dataset.tabId), Number(row.dataset.windowId));
  }

  function activateTab(tabId, windowId) {
    if (!Number.isInteger(tabId) || tabId <= 0) return;

    chrome.tabs.update(tabId, { active: true }, () => {
      if (chrome.runtime.lastError) {
        void chrome.runtime.lastError;
        showToast("Could not focus that tab. It may have been closed.", "error");
        refreshTabs();
        return;
      }

      if (Number.isInteger(windowId) && windowId >= 0) {
        chrome.windows.update(windowId, { focused: true }, () => {
          void chrome.runtime.lastError;
          window.close();
        });
      } else {
        window.close();
      }
    });
  }

  /* ----------------------------------------------------------------------- */
  /* Test send                                                               */
  /* ----------------------------------------------------------------------- */

  async function handleTestMessage() {
    const originalLabel = els.testButton.textContent;
    els.testButton.disabled = true;
    els.testButton.textContent = "Sending…";

    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];

      if (!activeTab?.id) {
        showToast("No active tab found. Open an AI chat first.", "error");
        return;
      }

      let result = await sendToTab(
        activeTab.id,
        { type: "AUTOCHAT_SEND_ONCE" },
        20000
      );

      if (!result) {
        const attached = await ensureTab(activeTab.id);
        if (attached.ok) {
          await sleep(350);
          result = await sendToTab(activeTab.id, { type: "AUTOCHAT_SEND_ONCE" }, 20000);
        } else {
          result = attached;
        }
      }

      if (result?.ok) {
        showToast(`Sent: “${truncate(result.text || "test message", 90)}”`, "ok");
      } else {
        showToast(
          result?.error ||
            "Could not reach this tab. Open a supported AI chat, make sure you are signed in, and try again.",
          "error"
        );
      }
    } catch (error) {
      console.warn("[AI Autochat] test send failed", error);
      showToast("The test message failed. Reload the AI tab and try again.", "error");
    } finally {
      els.testButton.disabled = false;
      els.testButton.textContent = originalLabel;
      refreshTabs();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Small UI utilities                                                      */
  /* ----------------------------------------------------------------------- */

  function setSaveState(text, tone) {
    els.saveState.textContent = text;
    els.saveState.dataset.tone = tone || "";

    if (saveStateTimer) window.clearTimeout(saveStateTimer);
    if (tone === "saved") {
      saveStateTimer = window.setTimeout(() => {
        els.saveState.textContent = "Synced";
        els.saveState.dataset.tone = "";
      }, 2200);
    }
  }

  function showToast(message, tone) {
    if (toastTimer) window.clearTimeout(toastTimer);

    els.toast.textContent = message;
    els.toast.dataset.tone = tone || "ok";
    els.toast.hidden = false;

    toastTimer = window.setTimeout(hideToast, 5200);
  }

  function hideToast() {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    els.toast.hidden = true;
  }

  function truncate(text, length) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > length ? value.slice(0, length - 1) + "…" : value;
  }
})();
