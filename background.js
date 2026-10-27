/*
 * MV3 service worker.
 *
 * Scheduling stays in the content scripts. This worker only keeps defaults,
 * mirrors the on/off state to the toolbar badge, handles the keyboard toggle,
 * and attaches the content script to tabs that were already open when the
 * extension was installed or updated.
 */
importScripts("shared/config.js");

const AC = globalThis.AUTOCHAT;
const STORAGE_KEYS = Object.keys(AC.defaults);

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch((error) => console.warn("[AI Autochat] install init failed", error));
});

chrome.runtime.onStartup.addListener(() => {
  initialize().catch((error) => console.warn("[AI Autochat] startup init failed", error));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (Object.prototype.hasOwnProperty.call(changes, "enabled")) {
    updateBadge().catch(() => undefined);
    if (changes.enabled.newValue === true) {
      injectIntoSupportedTabs().catch((error) =>
        console.warn("[AI Autochat] could not attach to open tabs", error)
      );
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-autochat") return;

  try {
    const stored = await chrome.storage.local.get("enabled");
    await chrome.storage.local.set({ enabled: stored.enabled !== true });
  } catch (error) {
    console.warn("[AI Autochat] keyboard toggle failed", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

  if (message.type === "AUTOCHAT_ENSURE_TAB") {
    // Only extension pages (the popup) can request injection. Content scripts
    // have a tab in the sender object and do not need this capability.
    if (sender.tab) {
      sendResponse({ ok: false, error: "Injection requests must come from the popup." });
      return undefined;
    }

    ensureTabById(Number(message.tabId))
      .then(sendResponse)
      .catch((error) => {
        console.warn("[AI Autochat] tab injection failed", error);
        sendResponse({ ok: false, error: "Could not attach to this tab." });
      });
    return true;
  }

  return undefined;
});

async function initialize() {
  await ensureDefaults();
  await updateBadge();

  const stored = await chrome.storage.local.get("enabled");
  if (stored.enabled === true) {
    await injectIntoSupportedTabs();
  }
}

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);
  const patch = {};

  for (const key of STORAGE_KEYS) {
    if (stored[key] === undefined) patch[key] = AC.defaults[key];
  }

  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
  }
}

async function updateBadge() {
  try {
    const stored = await chrome.storage.local.get("enabled");
    const enabled = stored.enabled === true;

    await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#16a34a" : "#64748b" });
    await chrome.action.setTitle({
      title: enabled ? "AI Autochat is ON — click to manage" : "AI Autochat is off — click to start"
    });
  } catch (error) {
    console.warn("[AI Autochat] badge update failed", error);
  }
}

async function injectIntoSupportedTabs() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (!tab.id || tab.discarded || !tab.url) continue;
    const site = siteForUrl(tab.url);
    if (!site) continue;

    try {
      await ensureTabInjected(tab.id);
    } catch {
      /* A restricted page may reject injection; ignore that tab. */
    }
  }
}

async function ensureTabById(tabId) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    return { ok: false, error: "Invalid tab." };
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: "This tab is no longer available." };
  }

  const site = siteForUrl(tab.url);
  if (!site) {
    return { ok: false, error: "This tab is not a supported AI chat site." };
  }

  const attached = await ensureTabInjected(tabId);
  return attached
    ? { ok: true, siteId: site.id, siteName: site.name }
    : { ok: false, error: "Edge did not allow the extension to attach to this tab. Reload the page." };
}

async function ensureTabInjected(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: "AUTOCHAT_PING" });
    if (pong?.ok) return true;
  } catch {
    /* No content script yet, or the page is not ready. Inject below. */
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/content.css"]
    });
  } catch {
    /* CSS may already be present; script injection can still work. */
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["shared/config.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content.js"]
    });
    return true;
  } catch (error) {
    console.warn("[AI Autochat] script injection rejected", error);
    return false;
  }
}

function siteForUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    return AC.getSite(url.hostname, url.pathname);
  } catch {
    return null;
  }
}
