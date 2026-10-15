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

## Open before publishing

- Untested surfaces: desktop (tests only), VS Code, mobile.
- Mods API is early access; README says "built and tested on Claude Code 2.1.300".
- Screenshots in README are Russian; English ones would read better on the English page.
- Published through the `chudarin` catalog (marketplace.json in repo chudarin-design-skills, entry with `source: github`); this repo has no marketplace of its own.
