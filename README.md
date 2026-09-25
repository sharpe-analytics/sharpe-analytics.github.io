# Sharpe website

Static HTML, CSS and JavaScript, published by GitHub Pages from `main` at https://sharpe-analytics.github.io/.

## Preview and validate

```
python3 -m http.server 8000
python3 scripts/check-site.py
node scripts/test-example.cjs
```

Open http://localhost:8000/. No install or build is required. GitHub Actions validates pull requests and pushes to `main`.

## Editorial maintenance

- Keep product availability, pricing and network/privacy descriptions aligned with the shipping extension. Never publish real account screenshots.
- The homepage targets DEGIRO portfolio analysis; the three guides answer distinct performance, benchmark and dividend questions.
- Update each guide's review date and sitemap `lastmod` only when its content is actually reviewed or changed.
- All content and feature panels work without JavaScript. JavaScript only adds feature selection and the illustrative deposit slider.
- Keep store links tagged with `utm_source=sharpe_website`, `utm_medium=website`, the page slug as `utm_campaign`, and CTA position as `utm_content`. These parameters identify referral placement; they do not track portfolio data.
- `activate.html` is the existing Pro activation flow. Do not change its URL, checkout parameters or messaging as part of editorial updates.
- No visitor analytics, cookies, external fonts or runtime third-party scripts are added to the marketing pages.

## Search Console launch checklist

GitHub access does not grant Google Search Console access. In the existing verified property, submit `/sitemap.xml` and inspect `/` and the three `/guides/` URLs. Record the previous 28 days of search impressions, clicks, query mix and indexed pages. Pair this with available Chrome Web Store website campaign metrics. Review again at 28 and 56 days, separating branded from non-branded searches. Do not infer installs from outbound clicks alone.

No traffic baseline has been fabricated or populated from public search results. Search Console verification and `activate.html` are preserved.
