# news-portal

Personal news aggregator (separate app, not part of common-house-portal runtime).

## Status

Mockup phase. `mockup.html` is a single self-contained HTML file with fake data, mobile-first, no build step.

## Preview from mobile

After push, view via:

- **raw.githack** (renders proper HTML, recommended):
  `https://raw.githack.com/josemanuelmoller/common-house-portal/claude/news-aggregation-portal-cHx5d/news-portal/mockup.html`

- **htmlpreview.github.io** (alt):
  `https://htmlpreview.github.io/?https://github.com/josemanuelmoller/common-house-portal/blob/claude/news-aggregation-portal-cHx5d/news-portal/mockup.html`

Open either URL on the phone. Add to home screen for a PWA-like experience.

## Next steps (once mockup is approved)

- Scaffold Next.js 15 + TS + Tailwind
- SQLite + `rss-parser` ingest cron
- Sources config (CL: Emol, La Tercera, BioBio, CIPER, El Mostrador, Cooperativa · World: Guardian, BBC, Reuters, NYT, AP, FT)
- PWA manifest + service worker
