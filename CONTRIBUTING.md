# Contributing to AI Autochat

Thanks for wanting to make the loop a little better. This is a small,
dependency-free extension, so the process is deliberately light.

## Good first issues

- Add support for a new AI chat site.
- Repair a selector that broke after a provider redesign.
- Improve the popup on narrow screens.
- Add a short prompt pack to `docs/samples.md`.
- Fix a typo or improve the docs.

## Before you open a PR

1. Read `shared/config.js` and keep site-specific selectors there, not in the
   loop.
2. Run the validation script:

   ```powershell
   pwsh scripts/validate.ps1
   ```

3. Load the extension at `edge://extensions` and test:
   - **Send one now** on the affected site.
   - Enable the switch and confirm one complete send → reply → delay cycle.
   - Pause from the popup and from the on-page chip.
4. Keep the diff focused. One adapter or one bug per PR is ideal.

## Adding a site adapter

Add a block to `SITES` in `shared/config.js`:

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

Then add the URL to both `content_scripts[0].matches` and `host_permissions` in
`manifest.json`. Reload the extension and test with **Send one now**.

Selectors should be ordered from specific to generic. If you are not sure which
control is the send button, include a screenshot of the composer in the PR.

## Style

- Plain JavaScript, no build step, no framework.
- Prefer small functions with descriptive names.
- Keep user-facing strings in English.
- Do not add analytics, remote code, or network requests.
- Do not include personal data or screenshots of private conversations.

## Reporting bugs

Use the [bug report form](https://github.com/Aritra-01/ai-autochat/issues/new?template=bug_report.yml).
Include the site, Edge version, and what the popup status said. There is no need
to share your account details or the contents of a private chat.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
