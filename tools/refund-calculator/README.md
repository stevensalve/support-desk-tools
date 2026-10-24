# Refund & Credit Calculator

> Work out pro-rata subscription refunds, returns with shared discounts, and goodwill credits in rupees.

Part of [Support Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Three small calculators in one page. Pro-rata: refund the unused part of a plan after cooling-off, fees and GST. Returns: refund per item with the order discount shared fairly, shipping and restocking fee rules. Goodwill: a credit as a percentage or fixed amount with a cap. Each has a copy-ready note.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/refund-calculator/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- refund-calculator ../refund-calculator-repo`.

## Features

- All money is counted in paise, so totals add up exactly.
- GST included or excluded, split into taxable value and tax (rates 0, 0.25, 3, 5, 12, 18, 28%).
- Pro-rata by days, with a cooling-off window and a cancellation fee.
- Returns with order-level discount shared by item value; CSV export.
- Goodwill credit with a cap; rupee amounts in lakh/crore grouping.

## How it works

`js/core.js` exports `RefundCore`: `GST_RATES`, `toPaise`, `split`, `prorate`, `parseLines`, `returns`, `goodwill`, `returnsCsv` and `sample`.

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
- No customer data is needed to calculate: leave names out of the notes you copy if they are going outside the company.

## Limitations

- It applies the rules you enter, not your refund policy or consumer law: check them with your policy owner.
- Rounding is to the nearest paisa per line; payment gateways may round differently.
- GST handling is simplified (one rate per line, no cess or place-of-supply rules). Check anything important before you rely on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/refund-calculator/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
