# CSAT & NPS Calculator

> Paste survey counts and get CSAT or NPS with margin of error and a clear-or-noise verdict on changes.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Type one line per period with the responses, for example `Oct | 10x40, 9x30, 8x20, 5x10`, and get the score, the margin of error, the change from the previous period and whether that change is bigger than noise. Compare with a target.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/csat-nps/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- csat-nps ../csat-nps-repo`.

## Features

- NPS (promoters minus detractors) or CSAT (share of 4s and 5s), with the 95% margin of error.
- Counts as `10x40` or as a list of scores `9 9 7`.
- Change against the previous period, flagged as real or within noise.
- Target check, CSV export, and save/open as `.json`.

## How it works

`js/core.js` exports `SatCore`: `METRICS`, `parse`, `figures`, `compute`, `toCsv`, `serialize`, `parseFile` and `sample`. The margin of error uses the normal approximation: 1.96 x the standard error.

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
- Survey counts are usually not personal data, but the file name and notes might be: check before sharing.

## Limitations

- Small samples give wide margins: below about 30 responses treat results as a hint.
- The normal approximation is rough for very small or very lopsided samples.
- It does not weight, de-duplicate or check how the survey was sent. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/csat-nps/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
