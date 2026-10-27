/*
 * AI Autochat content script.
 *
 * The automation loop lives in the page rather than in the MV3 service
 * worker: content scripts keep running while the service worker sleeps, and
 * each supported tab can make progress independently.
 */
(function () {
  "use strict";

  const AC = globalThis.AUTOCHAT;
  if (!AC) return;
  if (globalThis.__AI_AUTOCHAT_CONTENT__) return;

  const site = AC.getSite(location.hostname, location.pathname);
  if (!site) return;
  globalThis.__AI_AUTOCHAT_CONTENT__ = true;

  const MIN_DELAY_SECONDS = 5;
  const MAX_DELAY_SECONDS = 3600;
  const MIN_TIMEOUT_SECONDS = 15;
  const MAX_TIMEOUT_SECONDS = 1800;
  const MAX_CUSTOM_MESSAGES = 200;
  const MAX_MESSAGE_LENGTH = 1000;

  let settings = { ...AC.defaults };
  let running = false;
  let activeToken = 0;
  let status = { state: "off", detail: "Paused" };
  let sentCount = 0;
  let lastMessage = "";
  let lastSentAt = 0;
  let nextSendAt = 0;
  let initialized = false;

  let promptBag = [];
  let promptBagKey = "";
  let sendChain = Promise.resolve();
  const waitCancels = new Set();

  let hudEl = null;
  let hudTimer = null;
  let dragState = null;

  init().catch((error) => console.warn("[AI Autochat] init failed", error));

  async function init() {
    try {
      const stored = await chrome.storage.local.get(Object.keys(AC.defaults));
      settings = normalizeSettings({ ...AC.defaults, ...stored });
    } catch (error) {
      console.warn("[AI Autochat] could not read settings", error);
    }

    initialized = true;

    try {
      chrome.storage.onChanged.addListener(onStorageChanged);
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
    } catch (error) {
      console.warn("[AI Autochat] extension context unavailable", error);
      return;
    }

    if (settings.enabled) {
      start();
    } else {
      setStatus("off", "Paused");
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Settings and state                                                       */
  /* ----------------------------------------------------------------------- */

  function normalizeSettings(value) {
    const min = clampNumber(value.minSeconds, MIN_DELAY_SECONDS, MAX_DELAY_SECONDS, AC.defaults.minSeconds);
    const max = clampNumber(value.maxSeconds, min, MAX_DELAY_SECONDS, AC.defaults.maxSeconds);

    return {
      enabled: Boolean(value.enabled),
      minSeconds: min,
      maxSeconds: Math.max(min, max),
      waitForResponse: value.waitForResponse !== false,
      responseTimeoutSeconds: clampNumber(
        value.responseTimeoutSeconds,
        MIN_TIMEOUT_SECONDS,
        MAX_TIMEOUT_SECONDS,
        AC.defaults.responseTimeoutSeconds
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

  function onStorageChanged(changes, areaName) {
    if (areaName !== "local") return;

    let changed = false;
    for (const key of Object.keys(AC.defaults)) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        settings[key] = changes[key].newValue;
        changed = true;
      }
    }
    if (!changed) return;

    settings = normalizeSettings(settings);

    if (settings.enabled && !running) {
      start();
    } else if (!settings.enabled && running) {
      stop();
    } else if (!settings.enabled) {
      removeHud();
    } else {
      ensureHud();
      updateHud();
    }
  }

  function isAlive(token) {
    return running && settings.enabled && token === activeToken;
  }

  function setStatus(state, detail) {
    status = { state, detail: detail || "" };
    updateHud();
  }

  function getStatus() {
    return {
      ok: true,
      siteId: site.id,
      siteName: site.name,
      enabled: settings.enabled,
      running,
      state: status.state,
      detail: status.detail,
      sentCount,
      lastMessage,
      lastSentAt,
      nextSendAt,
      url: location.href
    };
  }

  function start() {
    if (running) {
      ensureHud();
      return;
    }

    running = true;
    const token = ++activeToken;
    ensureHud();
    setStatus("starting", "Looking for the chat box…");

    loop(token).catch((error) => {
      console.warn("[AI Autochat] loop stopped", error);
      if (token === activeToken) {
        running = false;
        removeHud();
        setStatus("error", "Stopped after an unexpected error. Reload the page and try again.");
      }
    });
  }

  function stop() {
    running = false;
    activeToken += 1;
    nextSendAt = 0;
    cancelAllWaits();
    removeHud();
    setStatus("off", "Paused");
  }

  function cancelAllWaits() {
    for (const cancel of Array.from(waitCancels)) {
      try {
        cancel();
      } catch {
        /* ignore */
      }
    }
    waitCancels.clear();
  }

  /* ----------------------------------------------------------------------- */
  /* Main loop                                                                */
  /* ----------------------------------------------------------------------- */

  async function loop(token) {
    while (isAlive(token)) {
      const composer = await waitForComposer(token);
      if (!composer || !isAlive(token)) break;

      if (isGenerating()) {
        setStatus("waiting-for-reply", "Waiting for the current reply to finish…");
        await waitUntilIdle(token);
        continue;
      }

      const text = pickPrompt();
      setStatus("sending", "Sending: " + shorten(text, 44));

      const result = await withSendLock(() => performSend(text, token));
      if (!isAlive(token)) break;

      if (!result.ok) {
        setStatus("error", (result.error || "Could not send the message.") + " Retrying…");
        await wait(6000, token);
        continue;
      }

      sentCount += 1;
      lastMessage = text;
      lastSentAt = Date.now();
      updateHud();

      if (settings.waitForResponse) {
        setStatus("waiting-for-reply", "Waiting for the AI to reply…");
        await waitForResponse(token);
      } else {
        await wait(2000, token);
      }
      if (!isAlive(token)) break;

      if (isGenerating()) {
        setStatus("waiting-for-reply", "Still replying…");
        await waitUntilIdle(token);
      }
      if (!isAlive(token)) break;

      const delay = randomDelayMs();
      nextSendAt = Date.now() + delay;
      setStatus("cooldown", "Next message in " + formatCountdown(delay));
      await wait(delay, token);
      nextSendAt = 0;
    }

    if (token === activeToken) {
      running = false;
      nextSendAt = 0;
      removeHud();
      setStatus(settings.enabled ? "error" : "off", settings.enabled ? "Stopped" : "Paused");
    }
  }

  async function waitForComposer(token) {
    let announced = false;

    while (isAlive(token)) {
      const composer = findComposer();
      if (composer) return composer;

      if (!announced) {
        setStatus("waiting-for-input", "Waiting for a chat box. Make sure you are signed in.");
        announced = true;
      }
      await wait(1500, token);
    }
    return null;
  }

  async function waitForResponse(token) {
    const timeoutMs = settings.responseTimeoutSeconds * 1000;
    const startedAt = Date.now();
    let sawGenerating = false;
    let idleSince = 0;

    await wait(900, token);

    while (isAlive(token) && Date.now() - startedAt < timeoutMs) {
      if (isGenerating()) {
        sawGenerating = true;
        idleSince = 0;
        setStatus("waiting-for-reply", "The AI is replying…");
      } else if (sawGenerating) {
        if (!idleSince) idleSince = Date.now();
        if (Date.now() - idleSince > 1600) return;
      } else if (Date.now() - startedAt > 5000) {
        // Some fast replies finish before a stop button can be observed.
        return;
      }

      await wait(450, token);
    }

    if (isAlive(token)) {
      setStatus("waiting-for-reply", "This reply is taking longer than the timeout…");
    }
  }

  async function waitUntilIdle(token) {
    let idleSince = 0;
    let lastNoticeAt = Date.now();

    while (isAlive(token)) {
      if (!isGenerating()) {
        if (!idleSince) idleSince = Date.now();
        if (Date.now() - idleSince > 1400) return;
      } else {
        idleSince = 0;
        if (Date.now() - lastNoticeAt > 60000) {
          setStatus("waiting-for-reply", "Still waiting for the reply to finish…");
          lastNoticeAt = Date.now();
        }
      }
      await wait(600, token);
    }
  }

  function randomDelayMs() {
    const min = settings.minSeconds;
    const max = Math.max(min, settings.maxSeconds);
    const seconds = min + Math.random() * (max - min);
    return Math.round(seconds * 1000);
  }

  function withSendLock(task) {
    const result = sendChain.then(task, task);
    sendChain = result.catch(() => undefined);
    return result;
  }

  /* ----------------------------------------------------------------------- */
  /* Sending                                                                  */
  /* ----------------------------------------------------------------------- */

  async function performSend(text, token) {
    try {
      return await performSendInner(text, token);
    } catch (error) {
      console.warn("[AI Autochat] send threw", error);
      return { ok: false, error: "The page changed while the message was being sent." };
    }
  }

  async function performSendInner(text, token) {
    const composer = findComposer();
    if (!composer) {
      return { ok: false, error: "No chat box found." };
    }
    if (isGenerating()) {
      return { ok: false, error: "The AI is still replying." };
    }

    try {
      composer.focus({ preventScroll: true });
    } catch {
      composer.focus();
    }

    setComposerText(composer, text);
    await wait(350, token);

    if (!readComposer(composer).trim()) {
      return { ok: false, error: "The chat box did not accept the text." };
    }

    const sendButton = findSendButton(composer);
    let usedButton = false;

    if (sendButton) {
      try {
        sendButton.click();
        usedButton = true;
      } catch {
        usedButton = false;
      }
    }
    if (!usedButton) pressEnter(composer);

    await wait(750, token);
    if (didSend(composer, text)) {
      return { ok: true, text };
    }

    // One fallback attempt. Some sites enable their send button a beat late.
    if (sendButton && !usedButton) {
      try {
        sendButton.click();
      } catch {
        pressEnter(composer);
      }
    } else {
      pressEnter(composer);
    }

    await wait(900, token);
    if (didSend(composer, text)) {
      return { ok: true, text };
    }

    return {
      ok: false,
      error: "The send button or Enter key did not submit the message."
    };
  }

  function setComposerText(composer, text) {
    composer.focus({ preventScroll: true });

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype =
        composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

      if (setter) setter.call(composer, text);
      else composer.value = text;

      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: text
        })
      );
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    selectElementContents(composer);

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {
      inserted = false;
    }

    if (!inserted || !readComposer(composer).includes(text)) {
      selectElementContents(composer);
      try {
        document.execCommand("delete", false);
      } catch {
        /* ignore */
      }
      composer.textContent = text;
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: text
        })
      );
    }

    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function selectElementContents(element) {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function pressEnter(composer) {
    try {
      composer.focus({ preventScroll: true });
    } catch {
      composer.focus();
    }

    const target = composer.contains(document.activeElement) ? document.activeElement : composer;

    for (const type of ["keydown", "keypress", "keyup"]) {
      const event = new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        composed: true
      });
      Object.defineProperty(event, "keyCode", { get: () => 13 });
      Object.defineProperty(event, "which", { get: () => 13 });
      target.dispatchEvent(event);
    }
  }

  function didSend(composer, text) {
    const current = readComposer(composer).trim();
    const expected = text.trim();

    if (!current) return true;
    if (!current.includes(expected) && !expected.includes(current)) return true;
    if (isGenerating()) return true;
    if (isDisabled(composer)) return true;

    return false;
  }

  function readComposer(composer) {
    if (!composer) return "";

    if (
      (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) &&
      typeof composer.value === "string"
    ) {
      return composer.value.replace(/\u200b/g, "");
    }

    return (composer.innerText || composer.textContent || "").replace(/\u200b/g, "");
  }

  /* ----------------------------------------------------------------------- */
  /* DOM helpers                                                              */
  /* ----------------------------------------------------------------------- */

  function findComposer() {
    for (const selector of site.composer) {
      for (const element of queryAll(selector)) {
        if (isUsableComposer(element)) return element;
      }
    }

    // Generic fallback: choose the editable field nearest the bottom of the
    // page, which is where chat composers normally live.
    const candidates = [];
    for (const element of queryAll(
      'textarea, input[type="text"], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]'
    )) {
      if (!isUsableComposer(element)) continue;

      const type = (element.getAttribute("type") || "").toLowerCase();
      const label = [
        element.getAttribute("placeholder"),
        element.getAttribute("aria-label"),
        element.getAttribute("role")
      ]
        .filter(Boolean)
        .join(" ");

      if (type === "search" || /search/i.test(label)) continue;

      const rect = element.getBoundingClientRect();
      candidates.push({ element, score: rect.bottom + rect.width * 0.001 });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.length ? candidates[0].element : null;
  }

  function isUsableComposer(element) {
    if (!element || !element.isConnected) return false;
    if (!isVisible(element)) return false;
    if (isDisabled(element)) return false;
    if (hudEl && hudEl.contains(element)) return false;

    if (element instanceof HTMLInputElement) {
      const type = (element.type || "text").toLowerCase();
      if (!["text", "search", ""].includes(type)) return false;
    }

    if (element instanceof HTMLTextAreaElement) return !element.readOnly;

    const editable = element.getAttribute("contenteditable");
    return element.isContentEditable || editable === "true" || editable === "plaintext-only";
  }

  function findSendButton(composer) {
    const candidates = [];
    const seen = new Set();
    const composerRect = composer.getBoundingClientRect();

    const add = (element, depth) => {
      if (!element || seen.has(element)) return;
      if (!isVisible(element) || isDisabled(element)) return;

      const isButton =
        element.tagName === "BUTTON" ||
        (element.getAttribute("role") || "").toLowerCase() === "button";
      if (!isButton) return;

      seen.add(element);
      const rect = element.getBoundingClientRect();
      const distance = Math.hypot(
        Math.max(0, rect.left - composerRect.right, composerRect.left - rect.right),
        Math.max(0, rect.top - composerRect.bottom, composerRect.top - rect.bottom)
      );
      candidates.push({ element, score: depth * 1000 + distance });
    };

    let root = composer;
    for (let depth = 0; depth < 7 && root; depth += 1, root = root.parentElement) {
      for (const selector of site.send) {
        for (const element of safeQueryAll(root, selector)) add(element, depth);
      }
    }

    for (const selector of site.send) {
      for (const element of queryAll(selector)) add(element, 20);
    }

    candidates.sort((a, b) => a.score - b.score);
    if (candidates.length) return candidates[0].element;

    // Last resort: the final actionable element in the composer's form.
    const form = composer.closest("form");
    const scope = form || composer.parentElement?.parentElement;
    if (scope) {
      const actions = Array.from(scope.querySelectorAll('button, [role="button"]')).filter((element) => {
        if (!isVisible(element) || isDisabled(element)) return false;
        if (element.contains(composer) || composer.contains(element)) return false;
        const label = getLabel(element);
        return !/attach|upload|mic|voice|file|image|model|setting|menu|plus|more|tool/i.test(label);
      });
      if (actions.length) return actions[actions.length - 1];
    }

    return null;
  }

  function isGenerating() {
    for (const selector of site.generating) {
      for (const element of queryAll(selector)) {
        if (isVisible(element) && !isDisabled(element)) return true;
      }
    }

    for (const element of queryAll('button[aria-label], button[title], [role="button"][aria-label]')) {
      if (!isVisible(element)) continue;
      const label = getLabel(element);
      if (/\bstop\b/i.test(label) && /(response|generat|stream|reply|answer)/i.test(label)) {
        return true;
      }
    }

    return false;
  }

  function getLabel(element) {
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test-id"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;

    let style;
    try {
      style = window.getComputedStyle(element);
    } catch {
      return false;
    }

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      Number.parseFloat(style.opacity) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width >= 4 && rect.height >= 4;
  }

  function isDisabled(element) {
    if (!element) return true;
    if (element.disabled === true) return true;
    if (element.getAttribute("aria-disabled") === "true") return true;
    if (element.getAttribute("data-disabled") === "true") return true;
    try {
      if (window.getComputedStyle(element).pointerEvents === "none") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function queryAll(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function safeQueryAll(root, selector) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Messages                                                                */
  /* ----------------------------------------------------------------------- */

  function getPromptPool() {
    const custom = String(settings.customMessages || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_CUSTOM_MESSAGES)
      .map((line) => line.slice(0, MAX_MESSAGE_LENGTH));

    const pool = custom.length ? custom : AC.prompts.map((prompt) => prompt);
    return { pool, key: site.id + "\u0001" + pool.join("\u0001") };
  }

  function pickPrompt() {
    const { pool, key } = getPromptPool();

    if (key !== promptBagKey) {
      promptBagKey = key;
      promptBag = [];
    }
    if (!promptBag.length) {
      promptBag = shuffle(pool.slice());
    }

    let text = promptBag.pop() || pool[0] || "Hello!";
    if (pool.length > 1 && text === lastMessage) {
      const alternative = promptBag.pop();
      if (alternative) {
        promptBag.unshift(text);
        text = alternative;
      }
    }
    return text;
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (!message || typeof message !== "object") return undefined;

    if (message.type === "AUTOCHAT_PING") {
      sendResponse({ ok: true, siteId: site.id });
      return undefined;
    }

    if (message.type === "AUTOCHAT_GET_STATUS") {
      sendResponse(getStatus());
      return undefined;
    }

    if (message.type === "AUTOCHAT_SEND_ONCE") {
      handleSendOnce()
        .then(sendResponse)
        .catch((error) => {
          console.warn("[AI Autochat] test send failed", error);
          sendResponse({ ok: false, error: "The test message failed unexpectedly." });
        });
      return true;
    }

    return undefined;
  }

  async function handleSendOnce() {
    if (isGenerating()) {
      return { ok: false, error: "Wait for the current reply to finish first." };
    }

    const text = pickPrompt();
    setStatus("sending", "Sending a test message…");
    const result = await withSendLock(() => performSend(text, null));

    if (result.ok) {
      sentCount += 1;
      lastMessage = text;
      lastSentAt = Date.now();
      setStatus(settings.enabled ? "sending" : "off", "Test message sent.");
      updateHud();

      if (!settings.enabled) {
        window.setTimeout(() => {
          if (!settings.enabled) setStatus("off", "Paused");
        }, 5000);
      }
    } else {
      setStatus("error", result.error || "The test message could not be sent.");
    }

    return result;
  }

  /* ----------------------------------------------------------------------- */
  /* Waiting utilities                                                        */
  /* ----------------------------------------------------------------------- */

  function wait(milliseconds, token) {
    return new Promise((resolve) => {
      if (token !== null && !isAlive(token)) {
        resolve();
        return;
      }

      const startedAt = Date.now();
      let settled = false;
      let intervalId = null;
      let timeoutId = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        if (intervalId) window.clearInterval(intervalId);
        waitCancels.delete(finish);
        resolve();
      };

      timeoutId = window.setTimeout(finish, Math.max(0, milliseconds));
      intervalId = window.setInterval(() => {
        if ((token !== null && !isAlive(token)) || Date.now() - startedAt >= milliseconds) {
          finish();
        }
      }, 250);

      waitCancels.add(finish);
    });
  }

  function formatCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
  }

  function shorten(text, length) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > length ? value.slice(0, Math.max(0, length - 1)) + "…" : value;
  }

  /* ----------------------------------------------------------------------- */
  /* On-page status chip                                                      */
  /* ----------------------------------------------------------------------- */

  function ensureHud() {
    if (!initialized) return;
    if (!settings.enabled || !settings.showHud) {
      removeHud();
      return;
    }
    if (hudEl && hudEl.isConnected) {
      updateHud();
      return;
    }

    const element = document.createElement("div");
    element.id = "autochat-hud";
    element.setAttribute("data-state", status.state);
    element.setAttribute("role", "complementary");
    element.setAttribute("aria-label", "AI Autochat status");

    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const head = make("div", "autochat-hud-head");
    head.setAttribute("data-autochat-drag-handle", "");

    const dot = make("span", "autochat-hud-dot");
    dot.setAttribute("aria-hidden", "true");

    const name = make("span", "autochat-hud-name", "AI Autochat");

    const pause = make("button", "autochat-hud-pause", "Pause");
    pause.type = "button";
    pause.title = "Pause AI Autochat";

    const close = make("button", "autochat-hud-close", "×");
    close.type = "button";
    close.title = "Hide this status chip";
    close.setAttribute("aria-label", "Hide this status chip");

    head.append(dot, name, pause, close);

    const body = make("div", "autochat-hud-body");
    const state = make("span", "autochat-hud-state", "Starting…");
    const count = make("span", "autochat-hud-count");
    body.append(state, count);

    const last = make("div", "autochat-hud-last");
    element.append(head, body, last);

    pause.addEventListener("click", () => {
      chrome.storage.local.set({ enabled: false }).catch(() => stop());
    });

    close.addEventListener("click", () => {
      chrome.storage.local.set({ showHud: false }).catch(() => removeHud());
    });

    head.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = element.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId
      };
      try {
        head.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      event.preventDefault();
    });

    head.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const left = Math.min(Math.max(4, event.clientX - dragState.offsetX), window.innerWidth - width - 4);
      const top = Math.min(Math.max(4, event.clientY - dragState.offsetY), window.innerHeight - height - 4);

      element.style.left = `${Math.max(4, left)}px`;
      element.style.top = `${Math.max(4, top)}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
    });

    const finishDrag = (event) => {
      if (!dragState) return;
      if (event.pointerId === dragState.pointerId) dragState = null;
    };
    head.addEventListener("pointerup", finishDrag);
    head.addEventListener("pointercancel", finishDrag);

    document.documentElement.appendChild(element);
    hudEl = element;

    if (hudTimer) window.clearInterval(hudTimer);
    hudTimer = window.setInterval(updateHud, 1000);
    updateHud();
  }

  function removeHud() {
    if (hudTimer) {
      window.clearInterval(hudTimer);
      hudTimer = null;
    }
    if (hudEl) {
      hudEl.remove();
      hudEl = null;
    }
    dragState = null;
  }

  function updateHud() {
    if (!hudEl) return;

    const stateLabels = {
      off: "Paused",
      starting: "Starting…",
      "waiting-for-input": "Waiting for chat box",
      sending: "Sending…",
      "waiting-for-reply": "AI is replying…",
      cooldown: "Next message",
      error: "Retrying…"
    };

    hudEl.dataset.state = status.state;

    const stateEl = hudEl.querySelector(".autochat-hud-state");
    const countEl = hudEl.querySelector(".autochat-hud-count");
    const lastEl = hudEl.querySelector(".autochat-hud-last");

    if (stateEl) stateEl.textContent = stateLabels[status.state] || status.detail || status.state;

    if (countEl) {
      if (status.state === "cooldown" && nextSendAt) {
        countEl.textContent = `in ${formatCountdown(nextSendAt - Date.now())}`;
      } else {
        countEl.textContent = sentCount > 0 ? `${sentCount} sent` : "";
      }
    }

    if (lastEl) {
      lastEl.textContent = lastMessage ? `Last: “${shorten(lastMessage, 48)}”` : status.detail || "";
      lastEl.title = lastMessage || status.detail || "";
    }
  }
})();
