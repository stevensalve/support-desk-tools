# Escalation Tracker

> Give every escalated case an owner, a level and a next-update date.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Log escalations with a reason, a level (1 to 3) and an owner. Each update sets the next one due after the interval for that level, so nothing goes quiet. Chase an owner with a ready-to-send message listing their overdue cases.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/escalation-tracker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- escalation-tracker ../escalation-tracker-repo`.

## Features

- Levels 1-3 with adjustable update intervals (default 2, 1 and 1 days).
- History of updates per case; raising the level is recorded.
- Overdue updates highlighted; filter by level, open only or overdue only.
- Copy-ready chase message per owner.
- CSV, print, and save/open as `.json`.

## How it works

`js/core.js` exports `EscalationCore`: `LEVELS`, `STATUSES`, `REASONS`, `create`, `setCadence`, `add`, `addUpdate`, `raiseLevel`, `setStatus`, `assign`, `list`, `summary`, `reminder`, `toCsv`, `serialize`, `parse` and `sample`.

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

- Intervals count calendar days, not working days.
- It records and reminds; it does not notify anyone: send the chase message yourself.
- Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/escalation-tracker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
