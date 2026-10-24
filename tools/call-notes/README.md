# Call & Chat Notes

> Write consistent contact notes, with a warning if card, Aadhaar, PAN or OTP numbers slip in.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

A short form for the reason, mood, what you did and the outcome, with follow-ups. Before you copy the note into the ticket the tool scans for sensitive numbers and offers to mask them.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/call-notes/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- call-notes ../call-notes-repo`.

## Features

- Reason, channel, mood and outcome lists; call length.
- Detects card numbers (Luhn check), Aadhaar-style numbers, PAN and OTP/CVV/PIN mentions.
- One click masks what it found.
- Follow-ups as `what | date` lines; copy-ready text note.
- Save/open as `.json`.

## How it works

`js/core.js` exports `NotesCore`: `CHANNELS`, `OUTCOMES`, `MOODS`, `REASONS`, `create`, `findSensitive`, `mask`, `parseFollowUps`, `followUpsToText`, `validate`, `toText`, `serialize`, `parse` and `sample`.

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
- The sensitive-number check is a safety net, not a guarantee. It can miss unusual formats and flag harmless numbers. Never ask customers to read out card numbers, OTPs or PINs.

## Limitations

- Patterns are heuristics for Indian and common international formats.
- It does not read your ticketing system: paste the note yourself.
- Up to 10 follow-ups per note. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/call-notes/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
