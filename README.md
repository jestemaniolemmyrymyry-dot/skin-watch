# Skin market watch

Compares CS2 skins on the Steam Community Market and CSFloat: availability on each market, the price gap, and price rises and drops over 24 hours and 7 days.

It runs entirely on GitHub for free. GitHub Actions collects prices every hour and saves them in `docs/data/`. GitHub Pages serves the website from `docs/`.

## Setup summary

1. Create a **public** GitHub repository and upload everything in this folder, including the hidden `.github` folder.
2. Settings → Secrets and variables → Actions → New repository secret: `CSFLOAT_API_KEY`.
3. Settings → Pages → Deploy from a branch → `main` / `/docs`.
4. Actions → Collect prices → Run workflow.

Your site: `https://<username>.github.io/<repository>/`

## Options

- **Tracked skins:** edit `watchlist.json` on GitHub. Use exact Steam names including wear.
- **Popular items:** Settings → Secrets and variables → Actions → Variables → add `STEAM_TOP_N` (for example `100`) to also track Steam's most popular items.
- **Schedule:** the `cron` line in `.github/workflows/collect.yml`. GitHub often starts scheduled runs a few minutes late.

## Notes

- Steam prices include Steam's ~15% fee. CSFloat listing counts stop at 50.
- GitHub pauses scheduled workflows in repositories with no activity for 60 days. If that happens, open Actions and re-enable it.
- Steam sometimes rate-limits GitHub's servers. Problems from the last run show in the top-right corner of the site.
