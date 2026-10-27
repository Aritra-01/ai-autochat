# AI Autochat for Microsoft Edge

A Manifest V3 Edge extension that keeps a conversation going with browser AI
assistants. While it is switched on, it types a random short message into an
open AI chat, sends it, waits for the answer to finish, waits a randomized
interval, and repeats — indefinitely, until you pause it or close Edge.

It uses selector-based adapters for ChatGPT, Gemini, Claude, Copilot,
Perplexity, Grok, DeepSeek, Mistral Le Chat, Poe, Qwen Chat, and HuggingChat.

> **Use it responsibly.** This automates your own logged-in browser session.
> Automated activity may violate a provider's terms, trigger rate limits, or
> get an account restricted. Keep the delay at 20 seconds or more, do not use
> it for spam, and stop if a site shows a CAPTCHA or asks you to slow down.

## Install in Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode** in the left sidebar.
3. Click **Load unpacked**.
4. Select the `edge-ai-autochat` folder (the folder containing `manifest.json`).
   If you downloaded the ZIP, extract it first and select the extracted folder.
5. Pin the extension from the toolbar's puzzle-piece menu if you want quick
   access.

The extension is unpacked, so Edge may show a developer-mode reminder after a
restart. It stays installed until you remove it.

## Use it

1. Open and sign in to one or more supported AI chats.
   - ChatGPT: <https://chatgpt.com/>
   - Gemini: <https://gemini.google.com/app>
   - Claude: <https://claude.ai/new>
   - Copilot: <https://copilot.microsoft.com/>
   - and the other sites listed below.
2. Click the AI Autochat toolbar icon.
3. Flip the switch on.
4. Leave the chat tab open. The loop starts as soon as it finds the message box.

The popup lists every open supported tab and its live state. Click a row to jump
to that tab. Each supported tab runs its own independent loop.

To stop everything, flip the switch off, press `Alt+Shift+A`, or click **Pause**
on the small on-page status chip.

### First run checks

- If a tab was already open before you installed the extension, the extension
  attaches automatically when you switch it on. If the row still says
  **Attach**, reload that tab once.
- **Send one now** sends a single test message even while the loop is off. Use
  it to confirm the selectors work on a particular site.
- Make sure you are on the actual chat page and signed in; a login screen has no
  composer, so the extension will wait.

## How the loop works

1. Find the chat input using the provider's adapter.
2. If a reply is currently streaming (a "Stop" button is visible), wait.
3. Pick a message from a shuffled bag of built-in prompts, or from your custom
   list. A bag avoids repeating a prompt until the pool is exhausted.
4. Insert the text using the native value setter for textareas and
   `document.execCommand("insertText")` for contenteditable editors, then fire
   the input/change events that React, Vue, ProseMirror, and Quill expect.
5. Click the send button. If no usable button is found, press Enter as a
   fallback, then verify that the composer cleared or that generation started.
6. Wait for the stop button to disappear (or the reply timeout to expire).
7. Wait a random number of seconds between your minimum and maximum, then
   repeat.

The scheduler lives in the content script, not in the MV3 service worker, so it
keeps working while the service worker is asleep. The tradeoff is that closing
the tab, closing Edge, or discarding the tab stops that loop. Background tabs
may also be throttled by the browser, so the real delay can be longer than the
configured range.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Switch** | Off | Master on/off for every supported tab. Persists across restarts. |
| **Shortest wait** | 20 sec | Lower bound of the randomized delay after a reply. Minimum 5 sec. |
| **Longest wait** | 45 sec | Upper bound of the randomized delay. |
| **Wait for each reply** | On | Watches for the provider's stop/streaming control before sending again. |
| **Give up waiting after** | 300 sec | If a reply takes longer, the loop checks the page again instead of blindly sending. |
| **Show on-page chip** | On | Small draggable status card with a Pause button. |
| **Custom messages** | Empty | One message per line. Empty means the 71 built-in prompts. First 200 lines, max 1,000 characters each. |

The reply timeout and the on-page chip live under **Messages & options** to keep
the popup compact; the switch, delays, and tab list stay on the main screen.

The popup saves changes automatically. The keyboard shortcut `Alt+Shift+A`
toggles the extension without opening the popup.

## Supported sites

| Provider | Hosts | Notes |
| --- | --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` | Uses `#prompt-textarea` and the stop button. |
| Gemini | `gemini.google.com` | Quill editor and "Stop response". |
| Claude | `claude.ai` | ProseMirror editor and "Stop response". |
| Copilot | `copilot.microsoft.com` | Textarea composer. |
| Perplexity | `perplexity.ai`, `www.perplexity.ai` | Textarea and submit button. |
| Grok | `grok.com`, `www.grok.com` | Generic composer/send adapter. |
| DeepSeek | `chat.deepseek.com` | Textarea and generic send adapter. |
| Mistral Le Chat | `chat.mistral.ai` | Generic contenteditable adapter. |
| Poe | `poe.com`, `www.poe.com` | Generic contenteditable/textarea adapter. |
| Qwen Chat | `chat.qwen.ai` | Generic adapter. |
| HuggingChat | `huggingface.co/chat*` | Generic adapter. |

These are best-effort adapters. AI sites change their DOM frequently, and
localized or A/B-tested layouts can break a selector. If a site stops working,
the fix is usually a selector update in `shared/config.js` (see below).

## Troubleshooting

**The popup says "Enabled — no AI tab open"**
Open a supported URL in a normal tab. The extension deliberately does not run on
other sites.

**The row says "Attach"**
The content script is not in that page yet. Reload the tab, then reopen the
popup. Enabling the extension normally injects it automatically.

**The row says "Needs chat"**
The page is probably on a login screen, a landing page, or a temporary error
screen with no visible composer. Sign in / open a conversation.

**A message was typed but not sent**
The site may have changed its send button. The extension falls back to Enter.
Try **Send one now**; if that also fails, update the `send` selectors for that
site.

**It sends while the AI is still replying**
Some providers do not expose a recognizable stop button. Increase the reply
timeout and the delay, or disable the site until its selectors can be updated.
Sending another prompt mid-reply is the most common cause of overlapping or
confusing responses.

**The delay is much longer than configured**
Edge throttles timers in background/minimized tabs. Keep the AI tab visible for
predictable timing, or treat the configured delay as a lower bound.

**It stopped after Edge restarted**
The switch state persists, so it should resume on the next page load. If the
tab was discarded, activate it to let the page reload. If the extension itself
was reloaded, refresh the AI tab.

**It is stuck after a CAPTCHA or rate limit**
Pause the extension, complete the challenge manually, then wait before
restarting. Repeated automated traffic can make the restriction worse.

## Add or repair a site adapter

All selectors live in `shared/config.js`. Each entry looks like this:

```js
{
  id: "example",
  name: "Example AI",
  hosts: ["example.ai"],
  composer: ["textarea", "div[contenteditable='true']"],
  send: ["button[type='submit']", "button[aria-label*='Send' i]"],
  generating: ["button[aria-label*='Stop' i]"]
}
```

To add a new provider:

1. Add the adapter object to `SITES`.
2. Add the URL pattern to `content_scripts[0].matches` and
   `host_permissions` in `manifest.json`.
3. Reload the extension at `edge://extensions` (the reload arrow on its card).
4. Open the site and use **Send one now** to verify.

Selectors should be ordered from most specific to most generic. The content
script also has a generic fallback that chooses the visible editable element
nearest the bottom of the page and the nearest actionable button.

## File map

```text
edge-ai-autochat/
├── manifest.json          Manifest V3, permissions, content-script matches
├── background.js          Defaults, badge, keyboard toggle, automatic injection
├── shared/
│   └── config.js          Site adapters, defaults, built-in prompts
├── content/
│   ├── content.js         Typing, sending, waiting, loop, on-page chip
│   └── content.css        Namespaced status-chip styles
├── popup/
│   ├── popup.html         Popup markup
│   ├── popup.css          Popup styling (dark/light)
│   └── popup.js           Settings, tab status, test send
├── icons/                 Generated PNG icons
└── scripts/
    └── make-icons.ps1     Reproducible icon generator
```

Reloading the extension does not automatically reload already-open tabs. Refresh
them after changing content-script code.

## Privacy

- No analytics, telemetry, external servers, or remote code.
- Settings and the on/off switch use `chrome.storage.local` only.
- Messages are typed into the page exactly as if you typed them, so they are
  sent to the AI provider under your account.
- The extension reads the page only to find inputs, buttons, and reply state.

## Known limitations

- Not headless: Edge and the tab must remain open.
- Site UI changes can break an adapter at any time.
- The stop detection is heuristic; providers without a stop control rely on the
  timeout and composer state.
- Edge may throttle or discard background tabs.
- No account, proxy, CAPTCHA, or rate-limit bypass. This is a UI automation
  helper, not a bot farm.

## Version

1.0.0
