# Canned Reply Library

> Keep your best replies in one searchable library, fill in names in one click, and check SMS length.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Store reusable replies with {placeholders} such as {name} or {ticket}. Pick a reply, fill the blanks, see what is still missing, and copy it. Import and export the whole library as CSV or save it as a file to share with the team.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/canned-replies/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- canned-replies ../canned-replies-repo`.

## Features

- Search ranks title, tags, category and body; filter by category.
- Placeholders are detected automatically and any left empty show as `[name]` so they are not sent by accident.
- SMS counter: GSM or Unicode, number of segments, characters left.
- Tracks how often each reply is used.
- Import and export CSV (Excel-safe), save/open as `.json`, sample library included.

## How it works

`js/core.js` exports `CannedCore`: `create`, `add`, `update`, `remove`, `markUsed`, `placeholders`, `fill`, `missing`, `search`, `categories`, `sms`, `toCsv`, `readCsv`, `importCsv`, `serialize`, `parse` and `sample`.

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

- Placeholders are plain text replacement, not templates with conditions.
- The SMS counter follows the standard GSM-7 and UCS-2 rules; operators and DLT templates may count differently.
- Replies are not sent anywhere: copy and paste them into your help desk. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/canned-replies/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
