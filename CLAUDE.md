# chudarin-context-mod

Claude Code mod: side panel `/ctx` with context usage, limits, action prices and help pages.

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

- Version 1.1.0 since 2026-10-17 (desktop layout); README screenshots (terminal) retaken 2026-10-16.
- Checked live: terminal and the desktop app (macOS, 2026-10-16). Untested: VS Code, mobile.
- Mods API is early access; README says "built and tested on Claude Code 2.1.300".
