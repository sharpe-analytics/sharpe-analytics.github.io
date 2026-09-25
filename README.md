# Sharpe website

Static HTML, CSS and JavaScript, published by GitHub Pages from `main` at https://sharpe-analytics.github.io/.

## Preview and validate

```
python3 -m http.server 8000
python3 scripts/check-site.py
node scripts/test-example.cjs
python3 scripts/check-demo.py
```

Open http://localhost:8000/. No install or build is required. GitHub Actions validates pull requests and pushes to `main`.

## Editorial maintenance

- Keep product availability, pricing and network/privacy descriptions aligned with the shipping extension. Never publish real account screenshots.
- The homepage targets DEGIRO portfolio analysis. Features, Pricing, Guides and Privacy have independent URLs; the three articles answer distinct performance, benchmark and dividend questions.
- Update each guide's review date and sitemap `lastmod` only when its content is actually reviewed or changed.
- All content and feature panels work without JavaScript. JavaScript adds feature selection, embedded native extension previews and the illustrative deposit slider. The previews use fictional local data and make no network requests. The previews load the original extension dashboard HTML, CSS, Chart.js, rendering code and historical simulation worker. A separate in-memory Chrome API adapter supplies fictional holdings, transactions, dividends and prices; a frame CSP blocks external requests.
- Keep store links tagged with `utm_source=sharpe_website`, `utm_medium=website`, the page slug as `utm_campaign`, and CTA position as `utm_content`. These parameters identify referral placement; they do not track portfolio data.
- `activate.html` is the existing Pro activation flow. Do not change its URL, checkout parameters or messaging as part of editorial updates.
- No visitor analytics, cookies, external fonts or runtime third-party scripts are added to the marketing pages.

## Search Console launch checklist

GitHub access does not grant Google Search Console access. In the existing verified property, submit `/sitemap.xml` and inspect `/`, the four destination pages, and the three guide article URLs. Record the previous 28 days of search impressions, clicks, query mix and indexed pages. Pair this with available Chrome Web Store website campaign metrics. Review again at 28 and 56 days, separating branded from non-branded searches. Do not infer installs from outbound clicks alone.

No traffic baseline has been fabricated or populated from public search results. Search Console verification and `activate.html` are preserved.

## Updating the native demo

Run `python3 scripts/sync-extension-demo.py /path/to/extension` to copy the rendering files and regenerate the dashboard wrapper and source hashes. Keep the sample adapter (`demo/sample-data.js`) and embedding glue separate from the extension files. Do not reimplement its charts in the marketing scripts. Verify that the sample response shapes still match the extension, then test periods, benchmarks, positions, allocation, Today, Insights, Dividends and the simulation worker before publishing.

The original extension files are recorded in `demo/source-manifest.json` and checked in CI. Layout fitting and website-tab messages live in `assets/previews.js`; frame sizing/style overrides live in `demo/embed.css`. `/demo/` is a non-indexed full-size sample dashboard. Website previews expose a link to it for comfortable viewing on small screens.
