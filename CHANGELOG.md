# Changelog

All notable changes to AI Autochat are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-27

### Added

- Manifest V3 Edge extension with a global on/off switch.
- Random prompt loop with 71 built-in short prompts and custom message support.
- Reply-aware scheduling that waits for the provider’s stop/streaming control.
- Randomized delay bounds, reply timeout, and per-tab status reporting.
- Adapters for ChatGPT, Gemini, Claude, Copilot, Perplexity, Grok, DeepSeek,
  Mistral Le Chat, Poe, Qwen Chat, and HuggingChat.
- On-page draggable status chip with pause control.
- Popup with live tab states, timing controls, custom messages, and test send.
- Automatic injection into supported tabs that were open before installation.
- Keyboard toggle: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>.
- Animated preview, landing page, prompt packs, and project documentation.
- MIT license, contribution guide, security policy, and validation script.

### Notes

- The extension is unpacked and not published to a browser store.
- Site adapters are best-effort and can break when a provider ships a redesign.
