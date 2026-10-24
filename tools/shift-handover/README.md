# Shift Handover Notes

> Write a clear shift handover with open cases, owners and reminders, and share it as text or PDF.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Fill in the shift, queue numbers, the cases to pick up (with owner and due time), known issues, things to watch and reminders. The tool checks nothing is missing and produces a text message and a one-page PDF with sign-off lines.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/shift-handover/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- shift-handover ../shift-handover-repo`.

## Features

- Case lines: `T-0412 | Rohit Mehta | call back about refund | Ravi | 11:00 tomorrow`.
- Checks for missing names, missing owners or due times, and numbers that do not add up.
- Copy as text for chat or e-mail; A4 PDF with sign-off lines (continues on more pages if long).
- Save/open as `.json` to start tomorrow from today.

## How it works

`js/core.js` exports `HandoverCore`: `SHIFTS`, `create`, `parseList`, `parseCases`, `casesToText`, `check`, `toText`, `sanitize`, `buildPdf`, `serialize`, `parse` and `sample`.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: pdf-lib 1.17.1 (MIT)                                                      |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Customer names, contact details and case notes are personal data. The files you save (`.json`, `.csv`, `.pdf`) are not password-protected: keep them where only the right people can open them, and delete them when you no longer need them.

## Limitations

- The sign-off lines are for ink: there are no digital signatures.
- PDF fonts are Latin only; the rupee sign prints as `Rs.` and other scripts as `?`.
- Up to 30 cases and 30 lines per list. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/shift-handover/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
