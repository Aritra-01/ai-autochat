# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | ✅ |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's
private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, browser version, reproduction steps, and the
   impact you believe it has.

If private reporting is unavailable, open a minimal issue asking for a private
contact channel without including exploit details.

## Scope

AI Autochat is a browser extension that reads the DOM of supported AI chat sites
to find the composer, send button, and reply state. It has no backend and does
not collect analytics.

In scope:

- Injection of unexpected content into a page through the extension's UI.
- Exposure of local settings or credentials.
- A selector or message path that could send unintended page data to a third
  party.
- Permission or manifest issues that grant more access than documented.

Out of scope:

- A provider changing its DOM and breaking a selector.
- Rate limits, account restrictions, or CAPTCHAs caused by automated use.
- Vulnerabilities in the AI provider's own application.
- Social engineering of the user or their account.

## Safe use

The extension automates your own logged-in session. Automated activity may
violate a provider's terms. Keep delays at 20 seconds or more, do not use it for
spam, and stop if a site asks you to slow down.

## What is stored

The extension stores only local settings in `chrome.storage.local`:

- enabled state
- delay bounds
- reply timeout
- whether the on-page chip is shown
- custom messages

No tokens, cookies, chat transcripts, or account identifiers are read, stored,
or transmitted by the extension.
