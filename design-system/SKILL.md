---
name: castle-design
description: Use this skill to generate well-branded interfaces and assets for Castle Technologies, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping enterprise-hedging products that leverage prediction markets.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out of `assets/` and create static HTML files that import `colors_and_type.css`. If working on production code, you can read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions (audience, product surface — marketing vs. dashboard vs. Situation Room, fidelity), and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation

- **Brand**: Castle Technologies — enterprise hedging via prediction markets. Warm, classical, serious. Not fintech-slick; more like a Bloomberg terminal with good taste.
- **Two visual modes**:
  - **Light / marketing + dashboard** — `#F5F5F0` bone paper, Hedvig Letters Serif headings, Geist + Geist Mono body, square corners, 1px borders, almost no shadows.
  - **Situation Room** — opt-in dark terminal (`#080A0F`) with teal `#3AB8C0` accent, monospace-heavy, live-intel aesthetic.
- **Colors live in `colors_and_type.css`** — always import it. Use semantic tokens (`--fg`, `--bg`, `--accent-teal`) never raw hex.
- **Primary CTA** is a black square button (`bg: var(--fg)`, `color: var(--castle-bone)`), never rounded.
- **Icons**: Lucide (1.6px stroke, round caps) from CDN, or SVGs from `assets/` (knight icons, wordmark).
- **UI kits** in `ui_kits/dashboard/` recreate real product components — reuse them directly via `<script src>`.

## What NOT to do

- No bluish-purple gradients, no emoji, no pastel rounded containers.
- Do not round corners. Castle is square (radius 0). Exception: overlays / pills.
- Do not invent new colors; pick from the palette or darken/lighten with oklch.
- Do not re-draw the logo — use `assets/castle-logo-black.svg` / `castle-logo-white.svg`.
