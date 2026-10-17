# Design — chudarin-context-mod

No design system. Built straight in code (no Figma).

## Style source
- Terminal surface: its own cell grid, unchanged since 1.0.0 (see docs/spec.md, "Ширина и шрифт").
- Desktop surface: Claude Code Desktop's own side panels (Context, Connectors, Changes cards): the host's
  proportional font, muted secondary text, values right-aligned, rounded bordered cards, generous spacing.
  The pane must look like part of the host, not like a terminal inside it.

## Decisions
- 2026-10-17: desktop gets its own layout (not the terminal grid in another font): proportional text,
  columns as fixed-width Boxes, numbers right-aligned with tabular digits, graphics as Svg.
- Group colors `#3987e5`, `#d95926`, `#178f66`, `#7a6ce4`; level colors for Svg `#2b8a3e`, `#b87400`, `#d6333a`.
- 2026-10-17, desktop layout settled (every surface but the terminal; details in docs/spec.md, "Десктоп"):
  - No `mono` anywhere; the host's font. The terminal tree is byte-identical to 1.0.0.
  - Spacing in the host's steps, one scale: `xl` between sections; `lg` between blocks on the group and
    entry pages; `md` card padding, page padding (all round, the no-data line too), gap between cards,
    between buttons; `sm` section title
    to content, between table columns, hint text to its buttons; `xs` between table rows and inside a card.
  - Type scale, four steps: `title` semibold (tile percent), `heading` semibold (group/entry page title),
    `body` (section titles semibold, rows, sentences), `caption` dim (tile lines, "since", turn range,
    an opened jump, the stale note). Titles in sentence case, no capitals.
  - Columns in cells (the code font's advance): tokens or delta 6, share 5, count 5, turn 8, chevron/mark/dot 1,
    chart axis 4, group page bar 10. A name column may shrink below its text (`minWidth={0}`,
    `overflow="hidden"`); names in Buttons are cut to the column's cells with an ellipsis, so figures
    never move. The full name is the Button's label and the next page's title.
  - Svg drawn with no width (fills its slot) and a pixel height: meter 6, stacked bar 10, group bar 6.
    Box widths in percent must be whole numbers (the engine refuses decimals); the stacked bar splits
    100 by largest remainder.
  - 2026-10-17 (after the live look): the chart's columns are Boxes, not Svg. A hover restyles a Box,
    never what an Svg draws, so a lit Svg column showed the accent as a frame around the blue. Now a
    column is a Box (60% of its slot, height a whole percent of the biggest rise, `#5769f7`) whose hover
    turns it `claude` whole. The plot is 6 rows high; 20/25/50/100 slots so a turn is a whole percent.
  - The figure columns of "What fills the context" and "Action costs" share their right edge: price rows
    end in an empty chevron cell.
  - One label for hiding advice on this surface: "Hide advice" / "Скрыть совет" on home and the entry page.
    The terminal keeps "Hide" on home (its tree stays as it was).
  - A press that changes the page moves the focus ring to the new page's first stop (its back link, or
    on the way back the row the person came from), so the pane keeps the keyboard. The outcome goes to
    the debug log (`claude --debug`): "focus to back: moved" or why not.
  - Limits are the account's: every reading that has the 5-hour or weekly figure writes it to the store
    (`limits:last`, percent + resetsAt); a reading without one (right after a start, an idle refresh)
    shows the stored one, else the session log's. A passed reset shows as reset.
  - A session's log is found by its id, or, for a conversation resumed under a new id (the desktop
    app after a restart), by its first launch (`usage.startedAt`, kept as `launchedAt`). At start the
    current log is moved to the end of the store, so pruning (oldest inserted first) keeps it.
  - The chart and its fold appear from the second point (or a compaction); one point draws nothing.
  - 2026-10-17 (live: "Скрыть совет" read as text): desktop actions are the host's native buttons,
    `variant` and no `plain` (`plain` draws a bare label): "Put in chat" `primary`, the one per screen;
    "Hide advice", "Don't show again", "Refresh" `secondary`. Navigation stays link-like: back is a
    `plain` Button with its own `dimColor` (dim at rest, full under the pointer or focus); rows that open
    a page are `plain` with the chevron; jump captions and the chart fold are `plain` toggles with ▸/▾.
  - An MCP server id that is a UUID shows as its first 8 characters in labels and prices, on every surface.
  - Tiles are cards: Box `borderStyle="round"` + `borderDimColor` + padding `md`, 33% each in a row;
    stacked at W < 48. The group page drops its bar column at W < 48.
  - Tile percent in the level color only at warn/bad; the meter always carries the level.

## Signature traits
- One accent per hint: the arrow and "Put in chat" in the `claude` color (terminal). On the desktop the
  one accent is the native primary button "Put in chat"; the arrow is in the text color.
- Tiles first, then what fills the context, the hint, action costs, this session, the folded chart.
- Desktop tables: fixed figure columns, right-aligned and tabular; the text column grows and can shrink.
  Lists of things (context groups, a group's entries, action costs): dot | name | tokens | share | chevron
  (prices: name | average | ×count | empty cell). Lists of events (jumps, compactions, heaviest calls):
  figure first, then turn, then the caption that grows, then a mark (heaviest: +tokens | caption).
  The "What fills the context" title carries the total over the tokens column.

## In progress
- Desktop redesign (2026-10-17): readability first; checked live by the user with screenshots.
  Seen live 2026-10-17: cards, Svg bars and percent Boxes draw. Fixed after it: back needed two clicks,
  limit cards missing, long names pushing figures, the lit chart column. Not yet seen live after the fixes.
