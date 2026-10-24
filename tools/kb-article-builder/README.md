# Knowledge Base Article Builder

> Write a how-to, troubleshooting or FAQ article with plain-language checks, then export Markdown or PDF.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Fill in what the reader sees, why it happens, the steps and what success looks like. The tool scores readability, flags long steps and vague wording, sets a review date and exports a clean article.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/kb-article-builder/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- kb-article-builder ../kb-article-builder-repo`.

## Features

- Article types and audiences; symptoms, cause, numbered steps with notes, result, related articles and tags.
- Flesch reading ease and tips (long steps, "click here", missing result).
- Review-by date from a review interval.
- Markdown (download or copy) and PDF with an optional company name.
- Save/open as `.json`.

## How it works

`js/core.js` exports `KbCore`: `TYPES`, `AUDIENCES`, `create`, `parseList`, `parseSteps`, `stepsToText`, `parseTags`, `readability`, `check`, `reviewDate`, `toMarkdown`, `sanitize`, `buildPdf`, `serialize`, `parse` and `sample`.

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
- Do not put customer data in articles: they are meant to be shared.

## Limitations

- Readability scoring is for English text only.
- PDF fonts are Latin only; the rupee sign prints as `Rs.` and other scripts as `?`.
- No images or screenshots in the article. Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/kb-article-builder/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
