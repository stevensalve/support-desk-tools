# Customer Follow-up Planner

> Track call-backs and updates you promised, see what is due or overdue, and add reminders to your calendar.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

List what you promised, to whom, how and by when (with an optional time). The tool shows what is overdue, due today and coming up, gives you a plan for the day and a calendar file with reminders, and tracks how many promises you keep on time.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/followup-planner/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- followup-planner ../followup-planner-repo`.

## Features

- Channels Phone, Email, WhatsApp, Chat and SMS; owner and ticket reference.
- A timed item turns overdue once its time has passed today.
- Summary and "kept on time" percentage; filters by state, owner and search.
- Plain-text plan for the day; calendar file (`.ics`) with a 15-minute reminder for open items.
- CSV, print, and save/open as `.json`.

## How it works

`js/core.js` exports `FollowCore`: `CHANNELS`, `STATUSES`, `create`, `add`, `update`, `setStatus`, `remove`, `stateOf`, `list`, `summary`, `dayPlan`, `toCsv`, `toIcs`, `serialize`, `parse` and `sample`. "Today" and "now" are always passed in.

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

- Calendar events use your device's local time (no time zones).
- It does not send reminders itself: import the calendar file into your calendar.
- Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/followup-planner/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
