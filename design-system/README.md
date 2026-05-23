# Castle Design System

> Castle turns business exposure into tradeable protection, helping enterprises protect against risks traditional markets leave uncovered.

Castle Technologies is building **enterprise hedging products by leveraging prediction markets** (Polymarket, Kalshi). Enter a company website → Castle researches the business, decomposes operational dependencies, identifies political / regulatory / macro risk events, maps them to live prediction-market contracts, and builds a recommended hedging portfolio.

Tagline: **Hedging the unhedgeable.**

## Products

Two surfaces are represented in this design system:

| Product | Repo | Stack | Audience |
|---|---|---|---|
| **castle-web** — Marketing site | `castle-main/castle-web` | Vite + React 19, Framer Motion, Three.js ASCII scene | Prospects, press, investors |
| **castle-dashboard** — Risk & hedging app | `castle-main/castle-dashboard` | Next.js 14 App Router, Tailwind, Radix, Supabase, Claude | Enterprise customers + internal admin |

`castle-web` is the **brand-accurate reference** — warm bone paper (`#F5F5F0`) background, SF Mono / Georgia typography, dark text on light, a large ASCII scene, and an extremely restrained content surface. Use it as the source of truth for brand feel.

`castle-dashboard` is a data-dense product. It has **two distinct visual treatments**:
1. **Main marketplace / dashboard** — light theme, neutral-based (`bg-background`, `bg-card`), cousin of the marketing brand.
2. **Situation Room** (`.situation-root`) — an opt-in dark terminal theme (`#080a0f`) with teal accent and JetBrains Mono, used for the live geopolitical dashboard. Tagged under its own namespace so it doesn't leak.

## Sources given

- **Figma file** — "Castle Tech.fig" (4 pages: Imagery / Colors / Logo-typography / Guidelines — WIP, 23 top-level frames). Mounted as a virtual filesystem.
- **Brand Guidelines PDF** — `uploads/Castle Brand Guidelines.pdf` (v1.0, April 2026, by Skarlo — luca@skarlo.co). Full extracted text in `brand_guidelines.txt`.
- **Repos** — `castle-main/castle-web`, `castle-main/castle-dashboard` (default branch `main`).

## Index (manifest of this folder)

```
README.md                     ← you are here
SKILL.md                      ← cross-compatible Agent Skill manifest
colors_and_type.css           ← CSS vars for color tokens + semantic type
brand_guidelines.txt          ← extracted text of the Skarlo guidelines PDF
assets/                       ← logos (SVG), dithered imagery (PNG), hero art
fonts/                        ← webfonts (Google Fonts import — see css)
preview/                      ← design-system cards (registered to the DS tab)
ui_kits/
  web/                        ← marketing site UI kit (castle-web)
  dashboard/                  ← product UI kit (castle-dashboard)
uploads/                      ← original uploads (brand guidelines PDF)
```

---

## Content Fundamentals

**Voice.** Serious. Institutional. Restrained. Castle writes for risk officers, CFOs, and treasurers — not consumer users. It reads closer to a research note or an 1800s banking pamphlet than a SaaS landing page. There is gravitas; there is no whimsy.

**Tone.** Confident, declarative, never promotional. Claims are concrete ("turns business exposure into tradeable protection"), not aspirational ("empower your business"). Headlines are *observations about the world*, not product features.

**Person.** Neutral third / occasional **you**. Avoid "we". Castle speaks *about* what it does, not *as* itself. Example: "Browse, track, and hedge…" not "We help you browse…".

**Casing.**
- **Headlines & display** — Sentence case in Hedvig Letters Serif. ("Hedging the unhedgeable", "Castle's risk marketplace".)
- **Eyebrow labels, buttons, meta** — ALL CAPS, wide tracking (`0.25em–0.4em`), Geist Mono. ("CASTLE TECHNOLOGIES", "COMING SOON", "SCROLL", "GET IN TOUCH".)
- **Body / UI text** — Sentence case, Geist.
- Use `&` sparingly; prefer "and". Use em-dashes for asides.

**Copywriting examples pulled from the real product:**
- "Hedging the unhedgeable" *(hero)*
- "Browse, track, and hedge against prediction market events that move your business."
- "Discover your company's risk" *(primary CTA)*
- "Ready to hedge your company's risk?" *(section head)*
- "For informational purposes only" *(footer disclaimer)*
- "Castle turns business exposure into tradeable protection, helping enterprises protect against risks traditional markets leave uncovered."

**Numbers.** Tabular-nums everywhere they appear (probabilities, prices, volumes). Percentages with no decimal (`64%`) unless precision matters. Dollar amounts with thousands separators, no cents for large values.

**Emoji.** **Never.** Not on marketing, not in product, not in docs. Iconography is stroke-based SVG (see ICONOGRAPHY).

**Vibe.** Medieval-strategic. Chess. Knights. Castles. Candlelight. Forests. The brand is the "citadel", and the customer's business is what's being defended. This is earned carefully — never cheesy.

---

## Visual Foundations

### Color
A **neutral foundation** — near-black `#171717` for primary text, warm-paper `#F5F5F0` and light greys (`#F5F5F5`, `#E5E5E5`) for backgrounds — with six **deep, earthy accents** used sparingly. Per the brand guidelines, accents should appear in **~20% of any composition** and **never more than two in a single context**. Accents **punctuate, not dominate**, and are never large background fills. Primary accents: **Teal `#246075`**, **Deep Teal `#00544F`**, **Forest `#395938`**, **Midnight Teal `#002E2C`**, **Deep Blue `#3A5C9A`**. See `colors_and_type.css`.

### Typography
Four faces, strict roles:
- **Hedvig Letters Serif Regular** — headings. `letter-spacing: -0.01em`. Line-height manually set (`1em` to `1.1em`); never auto.
- **Geist Regular** — subtext / body. `letter-spacing: -0.01em`.
- **Geist Mono Semibold** — tags, buttons, form labels, meta, metrics. `letter-spacing: -0.02em` (in design system), but for ALL-CAPS UI labels on the marketing site, letter-spacing is *widened* to `0.25em–0.4em`.
- **Averia Serif Libre Light** — **logo only**. `letter-spacing: -0.06em`. Never used in running text.

### Spacing, layout, rhythm
- **Radius: 0** across the main dashboard (`border-radius: 0 !important` is enforced globally) and the marketing surface. A few utility surfaces use `4–6px` (map overlays, settings dropdown, situation dialog) — these are the exception, not the rule.
- **Borders over shadows.** The visual vocabulary is 1px hairlines (`rgba(24,24,24,0.12)` on light, `#1c2030` on dark) separating surfaces. Cards don't float — they sit.
- **Tabular numerics** everywhere data appears.
- **Generous vertical whitespace** on marketing. **Dense grids** (3-column + bottom strip) in product dashboards.

### Backgrounds
- **Warm bone paper** (`#F5F5F0`) — the marketing site canvas, rendered large and empty with a lazy Three.js ASCII scene visible *behind* the content layer.
- **White / paper** (`#FFFFFF`, `#F5F5F5`) — product cards and surfaces.
- **Dark** (`#080a0f`) — Situation Room only, deep near-black with a subtle radial-gradient vignette (`radial-gradient(ellipse at 50% 50%, #0c1020, #080a0f)`).
- **Dithered painterly images** — from the Figma imagery library, always processed in Unicorn Studio with a Blue-Noise dither and the `#castle+=-;:,.` glyph dither preset. Never use raw photos — always dithered.
- **No gradients** (outside the Situation map vignette). **No patterns.** **No illustrations** beyond the knight/castle photography set.

### Animation
- **Restrained.** Fades, slow ease-outs, 0.15s–0.8s. No bounces, no spring overshoots, no parallax.
- Signature motions: a **1.5s hero fade-in** on page load; `landingFadeIn` for nav; Framer Motion `initial={{opacity:0, y:40}} whileInView={{opacity:1, y:0}}` on content reveals; a slow vertical bob on the scroll arrow.
- Dashboard: `fade-in 0.15s ease-out`, `slide-in-right 0.15s`, a subtle `shimmer 2s linear infinite` for loading, `pulse` for live indicators.
- Ticker scrolls horizontally at **480s linear infinite**.
- The ASCII scene on the marketing site provides the only "constant motion".

### Hover & press states
- **Hover = opacity 0.8** on solid buttons (`.btn-w:hover { opacity: 0.8 }`).
- **Hover = border + text brightens** on outline buttons (muted → full text).
- **Hover = subtle surface darken** on rows/cards (`--surface-2` overlay).
- **Hover knights** (the LinkedIn icons in the nav): `opacity 0.75 → 0.5`.
- Press states: no transform. No scale. Just a micro-darken.

### Borders, shadows, transparency
- **1px borders**, always. Light: `rgba(24,24,24,0.12)`. Dark: `#1c2030`.
- **Shadows are almost never used.** Exception: Situation Room dropdowns get `0 8px 24px rgba(0,0,0,0.4)`.
- **Transparency / blur** appears in: the fixed nav (`backdrop-filter: blur(12px)` over the bone background), map overlays in the Situation Room (`blur(8px)`), tooltip (`blur(12px)`), and dialog overlays (`rgba(0,0,0,0.65)` + `blur(4px)`). The hero text sits over an ASCII scene and uses a **radial protection gradient** (bone paper fades out at the edges) to ensure legibility — don't use a capsule.

### Imagery
- **Midjourney → Unicorn Studio → dithered.** Two registers: painterly illustration, hyperrealistic photography. Both get dithering applied before use.
- **Dither recipe (from guidelines):** Blue Noise, Threshold 0, Mix 96. Then Glyph Dither: preset Waffle, characters `#castle+=-;:,.`, Scale 96, Gamma 56, Mix 100, Color Mode Texture, Background On. Duotone in the accent colors.
- **Consistent motifs:** medieval and chess themes (knights, castles, strategy); earthy + muted tones with occasional green; natural light sources (candles, sunlight through forest); scale and gravitas.
- **Forbidden:** anything cartoonish, overly colourful, or modern in setting. No stock photography. No 3D renders (except the ASCII scene). No AI art without dithering.

### Cards
Castle cards are **flat rectangles with a 1px border, no radius, no shadow**. Light surface `--bg-card` (`#FFFFFF` or `#F5F5F5`), dark surface `#11141d`. Divide internal sections with 1px hairlines rather than padding-only. Header row uses a Geist Mono ALL-CAPS eyebrow (tracking `1.2px`, size `10px`, color muted).

---

## Iconography

Castle uses **stroke-based line SVG icons** — a 1.5–1.6px stroke weight, `round` caps and joins, drawn into a 20–24px viewbox. They match the serif/mono typography by staying geometric and slightly archaic.

- **Codebase icon library:** [lucide-react](https://lucide.dev) (pinned `^0.564.0` in `castle-dashboard`). Used throughout the product — `ArrowRight`, `Search`, `X`, `ChevronDown`, etc.
- **Custom icons:** The marketing site has four **hand-drawn knight icons** (helms and a chess knight) rendered inline as `<svg>` in `Nav.jsx`. They link to the founders' LinkedIn profiles and embody the brand's medieval voice. See `assets/knights.svg` (bundled) and the `ui_kits/web` `KnightIcons.jsx` recreation.
- **Logo:** the Castle wordmark is a **pixelated / bitmap-style SVG** — a grid of rounded rects that read as a dithered castle silhouette. `assets/castle-logo-black.svg` (light theme) + `assets/castle-logo-white.svg` (dark). Uses `currentColor` so it can be tinted.
- **Unicode chars as icons:** occasionally — `©` in footers, `•` as separators, `→` inline in body text when an `ArrowRight` lucide isn't available. Never use emoji.
- **PNG icons:** not used. All iconography is SVG.

**CDN link (if using directly in an HTML artifact):**
```html
<script type="module">
  import { createIcons, icons } from 'https://unpkg.com/lucide@0.564.0/dist/umd/lucide.min.js';
  createIcons({ icons });
</script>
```

---

## UI Kits

See each kit's own README for detail.

- **`ui_kits/web/`** — Marketing site recreation. Hero with ASCII background (canvas simulation), nav with knight icons, contact form. Based on `castle-web/src/pages/Home.jsx`.
- **`ui_kits/dashboard/`** — Product recreation. Marketplace page with situation nav, contract cards, news ticker, footer. Based on `castle-dashboard/src/app/page.tsx`.

---

## Known caveats / substitutions

- **Fonts loaded from Google Fonts:** Hedvig Letters Serif, Geist, Geist Mono, Averia Serif Libre. No `.ttf` files were bundled — Google Fonts is the source of truth. Flag: if offline use is required, download and drop them into `fonts/`.
- **ASCII scene:** the marketing hero uses a heavy Three.js scene (`AsciiScene.jsx`, 13 KB of Three code). The UI kit substitutes a simple CSS / canvas approximation — **not a full port**. Flag this if recreating the hero exactly.
- **Dithered photography:** the PNGs in `assets/` are the *output* of the Unicorn Studio pipeline, not the source. To generate new imagery, follow the recipe in the Imagery section.
