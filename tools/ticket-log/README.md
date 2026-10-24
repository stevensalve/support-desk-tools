# Ticket Log with SLA Timers

> Log tickets and see time left to respond and resolve in business hours.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

A small ticket log for teams without a help desk, or for tracking a handful of hard cases. Each priority has a response and a resolution target counted in your business hours (default 10:00-19:00, Monday to Saturday, with your holidays). The tool shows what is breached, what is about to breach and what is on track.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/ticket-log/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- ticket-log ../ticket-log-repo`.

## Features

- Priorities with their own response and resolution targets, editable.
- Business-hours clock with weekly off-days and a holiday list; times outside hours roll to the next opening.
- "Pending customer" pauses the clock and gives the waiting time back.
- Response and resolution recorded with their times; breach and at-risk flags.
- Summary, filters, CSV, and save/open as `.json`.

## How it works

`js/core.js` exports `TicketCore`: `toMs`, `nextOpen`, `addBusinessMinutes`, `businessMinutes`, `remaining`, `duration`, `create`, `setConfig`, `add`, `respond`, `setStatus`, `assign`, `setPriority`, `list`, `summary`, `toCsv`, `serialize`, `parse` and `sample`. "Now" is always passed in.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- The tool has no third-party dependencies at all.
- Customer names, contact details and case notes are personal data. The files you save (`.json`, `.csv`, `.pdf`) are not password-protected: keep them where only the right people can open them, and delete them when you no longer need them.

## Limitations

- The business-hours model is simplified: one set of hours for every day worked, no per-day or per-customer calendars and no time zones.
- The default targets are illustrations, not a promise to anyone: set your own.
- Not a replacement for a help desk: no e-mail, assignment rules or customer portal. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/ticket-log/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
