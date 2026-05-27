# Three takes on the archetype detail page

The problem we're solving: the current page reads as four disconnected full-width
bands (hero → sliders → chart → table+rail). The sliders look like a skipped
"settings box," the slider→chart causality is invisible, and the waterfall + table
show the same 7 items twice. Each variant takes a different **structural stance**
to fix this. All three have working sliders that re-price the model live — drag
any input and the numbers move.

## Variant comparison

| Dimension | A · Control Deck | B · Inline Model | C · Briefing |
|---|---|---|---|
| **Stance** | Split-pane workspace | Table-led, dense | Editorial document |
| **Layout** | Sticky left control panel + live outputs | Horizontal slider strip → summary band → ledger | Single narrow column, top-to-bottom |
| **Slider→output link** | Spatial: controls sit beside the numbers they drive | Strip directly above a black summary band | Sliders inside the same card as the big composite |
| **Chart** | Full waterfall, hover-synced to the table | **No separate chart** — inline drag bars in each row | No chart — minibars per risk |
| **Redundancy** | Chart + table coexist but hover-linked | Eliminated (table IS the viz) | Eliminated (list IS the viz) |
| **Density** | Medium-high | High | Low / airy |
| **Feel** | Bloomberg terminal, analyst cockpit | Sharp, utilitarian ledger | Calm institutional research note |
| **Best for** | Power users modeling many scenarios | Scanning all risks fast, dense data | Reading / sharing as a credible brief |

## The core fix each makes

- **A (Control Deck):** solves *invisible causality* by making the sliders a
  permanent sticky panel physically next to the live composite / stressed-IRR /
  capital-at-risk readouts. Keeps the waterfall (it's the strongest analytical
  element) but fuses it to the table via shared hover-highlight, so they stop
  feeling like duplicate sections. Most "tool."

- **B (Inline Model):** solves *chart/table duplication* by deleting the separate
  waterfall entirely. The risk ledger's inline drag-bars ARE the visualization,
  and a single black "target → drag → stressed" band carries the headline math.
  Sliders are a flush horizontal strip in the content flow, not a gray box.
  Densest, most efficient.

- **C (Briefing):** solves *disconnection* by collapsing everything into one narrow
  editorial column with real narrative flow. The interactive model is a single calm
  centered card (composite + the target→stressed arc + sliders together), and risks
  read as a numbered briefing list. Most trustworthy / shareable, least "dashboard."

## My take

**A and B are the real contenders; C is the wildcard.**

- If Castle's user is an analyst who'll *model many deals*, **A (Control Deck)** wins
  — the sticky panel makes iterating fast and the causality is undeniable.
- If the priority is *information density and killing redundancy*, **B (Inline Model)**
  is the cleanest — it's the most honest answer to "you're showing the same data twice."
- **C (Briefing)** is the strongest if these pages are meant to be *read and shared*
  with LPs / clients as credible research, not operated as a tool. It sacrifices
  power-user speed for trust and calm.

My lean: **B's "kill the separate chart" insight is the single biggest improvement**,
but **A's sticky control deck is the better home for the sliders.** The ideal is
probably a hybrid — A's sticky deck + B's inline-bar table instead of a separate
waterfall. Worth seeing all three first, then composing the winner.
