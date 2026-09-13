# Design — Crosscheck

Written from the built world, not ahead of it. The implementation is
`crosscheck/src/app/{globals.css,layout.tsx,page.tsx}`; this file describes what is there.

## Thesis

A research page that reports disagreement and refuses to resolve it. It declines the
crypto-dashboard arrangement — tiles, gauges, glowing deltas, red-and-green badges —
because every one of those devices implies a direction, and this product's single
promise is that it never issues one.

The form is a printed sheet: a bordered bone panel inset on a charcoal field, divided by
a visible cell grid. Art direction pinned by the user's own reference image (`VETT2.png`).

## Palette

Two inks and a ground. There is no accent colour, and that is a product decision rather
than a stylistic one: on a page that ranks how much a disagreement matters, a red badge is
a verdict smuggled in through the palette.

| Token | Value | Role |
|---|---|---|
| `--field` | `#1c1b18` | The surround the sheet lies on |
| `--sheet` | `#e4e1d5` | Bone. The page itself |
| `--sheet-sunken` | `#dbd7ca` | Raw-output wells |
| `--ink` | `#191814` | Body and display |
| `--ink-2` | `#474439` | Secondary prose |
| `--ink-3` | `#5c584f` | Captions and small caps. Darkened from `#76726a`, which failed 4.5:1 |
| `--rule` | `#c2beac` | Inner hairlines |
| `--frame` | `#191814` | The sheet's edge and its structural rules |

**Light only, deliberately.** A printed sheet has no dark mode; the darkness in this design
is the field, not a theme. An earlier build followed `prefers-color-scheme` and produced a
muddy inversion that read as a different, worse product. If a dark variant is ever wanted it
should be authored as its own world, never as a flip of this one.

## Type

| Face | Use |
|---|---|
| **Bodoni Moda** | Display. A Didone is the letterform of the printed research page — enough contrast to hold a full-measure statement without shouting. Hero, section heads, ordinals, pull-quotes, drop cap, the `What resolves it` lead-in |
| **Inter** | Reading copy and UI |
| **JetBrains Mono** | Identifiers and measured figures only — Skill names, tool calls, latencies, small-caps labels. Never as costume |

Measures are held to 64–74ch. `font-variant-numeric: tabular-nums` is set on `body` so
figures align in columns.

## Structure

- `.sheet` — bordered bone panel, `max-w-[80rem]`, inset from the field.
- `.band` — a full-width horizontal division. Sections are bands, not cards.
- `.cells` — a grid whose children are separated by vertical rules on `sm`+ and horizontal
  rules when stacked. Empty space inside a cell is part of the rhythm.

**No cards, and no nested containers.** Rules and space do all the dividing. The two
competing cases inside a conflict are split by a vertical rule, not boxed.

## The plate

The page's one figure, and the thing that carries the argument. Horizon runs left to
right (`intraday → months`), direction bottom to top (`bearish → bullish`), so a source's
position states its entire claim. Mark size is conviction. A conflict is a link between two
marks, weighted by the materiality `materiality.ts` assigned (high 2px, medium 1.15px, low
0.6px) and dashed where the pair diverges only by horizon and both can be right. Labels
carry a `--sheet` halo via `paint-order: stroke` so links never overprint them.

It opens a brief. A worked example — the same numbers as the `sharp-conflict` fixture the
Pass 2 suite asserts against — anchors the landing, labelled as constructed.

## Drawn marks

One set, one stroke weight, all authored SVG. No emoji, no icon font.

- **Materiality** — three ascending bars, filled to level. Ascending, not equal: three equal
  filled bars read as a hamburger menu, where rising bars read as magnitude.
- **Direction** — arrow up, arrow down, or a flat rule for neutral.
- **Call status** — filled square (ok), hollow (dead), crossed (error). Distinguished by
  form, never by colour alone.
- **Select chevron** — one drawn caret as a data-URI, same stroke weight as the rest.

## Motion

One authored moment: when a brief lands, hairlines draw themselves left to right
(`scaleX`, 820ms, exponential ease-out) from an already-visible default — the type never
fades in, only the rules arrive. In-flight Skills carry a travelling marker rather than a
pulse: a pulse says *busy*, a traverse says *fetching*. Both respect
`prefers-reduced-motion`.

## Browser surfaces

Themed rather than left to the browser: selection, caret, placeholder, focus ring,
scrollbar track and thumb, underline offset and thickness, and the select's arrow.

## Copy

The product's own voice, and the constraint is load-bearing: nothing on this page may read
as advice. Controls name their action (`Compare the sources`, not `Crosscheck` — which was
the wordmark wearing a button's clothes). Agreement is stated as a finding, never dressed
as an absence. `scripts/cases.ts` scans every generated sentence for recommendation and
prediction patterns.

## Known gaps

- Phone width is untested on a real device. The layout stacks structurally
  (`cells` switches to horizontal dividers below 640px) but has not been verified.
- The result state's plate and drop cap were built and typecheck clean but were not
  visually confirmed — the session hit a rate limit mid-inspection.
