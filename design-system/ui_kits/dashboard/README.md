# Castle Dashboard — UI Kit

Recreates the **castle-dashboard** marketplace page (the first screen a visitor sees at app.castle.tech). Based on `src/app/page.tsx` and the `src/components/marketplace/*` + `src/components/discover/*` components.

Stack in the real app: Next.js 14 · Tailwind · Radix · lucide-react.
Stack here: plain React via Babel-standalone — visuals only, no data.

## Files

- `index.html` — click-thru: marketplace → contract detail modal
- `MarketplaceNavbar.jsx` — top nav with Castle logo + log in / sign up
- `NewsTicker.jsx` — full-bleed inverted ticker (foreground bg)
- `SituationNav.jsx` — horizontal severity pills
- `ContractCard.jsx` — prediction-market contract card with probability color
- `SituationHero.jsx` — situation-of-the-day featured row
- `Footer.jsx` — minimal two-column footer

## Visual rules (from source)

- Background: `--castle-bone` (#F5F5F0) page, `--castle-white` cards
- Borders: 1px `rgba(24,24,24,0.12)` — everywhere. No shadows.
- Radii: **0** (dashboard is square — only overlays round)
- Probability color: ≥70 emerald, 40–69 amber, <40 red (tabular-nums)
- News ticker: inverted (black bg, bone text), 40s linear infinite scroll
- Primary CTA: `bg-foreground text-background` — black square button
