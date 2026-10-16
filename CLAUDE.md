# chudarin-context-mod

Claude Code mod: side panel `/ctx` with context usage, limits, action prices and help pages. `/ctx-line` toggles a line above the prompt.

## Layout

- `hooks/register.tsx` — hooks, pages, rendering.
- `hooks/entries.ts` — groups, entries, action prices, insight.
- `hooks/help.ts` — plain-language names and help per entry, Russian and English.
- `hooks/i18n.ts` — every interface string in Russian and English; language follows Claude Code's `language` setting (Russian → ru, else en).
- `hooks/model.ts` — formatting, chart, verdict maths.
- `hooks/history.ts` — session log (tokens read/written per request, context per turn, compactions), kept in `$.store` under `session:<id>`, last 30 sessions.
- `types/index.d.ts` — `$.state` contract.
- `docs/spec.md` — current spec (v3).
- `assets/` — README banner (light/dark SVG) and screenshots.

## Check before calling a change done

```
claude plugin validate .
npx -y -p typescript@5.6.3 tsc -p . --noEmit   # needs .claude-plugin/types/, written when the engine loads the mod
claude plugin test .
```

Write build/test output to a log file and read the file (a hook refuses `| tail`).
The live look is checked by the user in their own session.

## Published

Public since 2026-10-15: github.com/schudarin/chudarin-context-mod. Installs through the `chudarin` catalog:
`/plugin marketplace add schudarin/chudarin-design-skills` → `/plugin install chudarin-context-mod@chudarin`.
On the maintainer's machine the dev copy loads via `CLAUDE_CODE_PLUGIN_DIRS`; don't also install it from the catalog there, or it loads twice.

## Still open

- Before handing the mod to anyone: retake the README screenshots (en/ru home, group, item; they
  predate side padding, pace, limit forecast, hint buttons, the session block and the chart), and
  bump the version in `.claude-plugin/plugin.json` (still 0.1.0).
- Not checked live: running `/mcp` marks the MCP advice as done (needs the MCP hint to show first).
- Untested surfaces: desktop (tests only), VS Code, mobile.
- Mods API is early access; README says "built and tested on Claude Code 2.1.300".
