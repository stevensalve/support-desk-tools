# Response-Time & Backlog Report

> Load a ticket export and see backlog age, response and resolution times, and trends.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Drop in an Excel or CSV export from your help desk. The tool finds the columns, then shows how old the open tickets are, median and 90th-percentile times to first response and to resolution, the daily trend, and splits by agent, priority, channel and category.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/backlog-report/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- backlog-report ../backlog-report-repo`.

## Features

- Flexible column names (created, first response, resolved, status, priority, agent, channel, category).
- Backlog age buckets and a daily opened/closed/backlog trend.
- Median and p90 response and resolution times, in hours.
- Breakdown tables with CSV export.
- Choose the "as of" date to look back in time.

## How it works

`js/core.js` exports `ReportCore`: `toDateTime`, `rowsToTickets`, `percentile`, `report`, `toCsv` and `sampleRows`. SheetJS only reads the file in `app.js`; the logic works on plain rows.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: SheetJS Community Edition 0.20.3 (Apache-2.0)                             |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Customer names, contact details and case notes are personal data. The files you save (`.json`, `.csv`, `.pdf`) are not password-protected: keep them where only the right people can open them, and delete them when you no longer need them.

## Limitations

- Times are elapsed clock time, not business hours.
- Tickets closed by status only (no resolved time) are counted as closed but left out of resolution times.
- Only the first sheet is read, and the first row must be the headers. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/backlog-report/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
