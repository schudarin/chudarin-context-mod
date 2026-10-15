# chudarin-context

Claude Code mod: side panel `/ctx` with context usage, limits, action prices and help pages. `/ctx-line` toggles a line above the prompt.

## Layout

- `hooks/register.tsx` — hooks, pages, rendering.
- `hooks/entries.ts` — groups, entries, action prices, insight.
- `hooks/help.ts` — plain-language names and help per entry.
- `hooks/model.ts` — formatting, chart, verdict maths.
- `hooks/history.ts` — session log (tokens read/written per request, context per turn, compactions), kept in `$.store` under `session:<id>`, last 30 sessions.
- `types/index.d.ts` — `$.state` contract.
- `docs/spec.md` — current spec (v3).

## Check before calling a change done

```
claude plugin validate .
npx -y -p typescript@5.6.3 tsc -p . --noEmit   # needs .claude-plugin/types/, written when the engine loads the mod
claude plugin test .
```

Write build/test output to a log file and read the file (a hook refuses `| tail`).
The live look is checked by the user in their own session.

## Open before publishing

- English UI (now Russian only).
- Light theme: group colors are tuned for a dark surface.
- Untested surfaces: desktop (tests only), VS Code, mobile.
- Mods API is early access; pin the minimum Claude Code version.
- First feedback from a friend.
- Then publish as a second plugin in the `chudarin` marketplace (repo chudarin-design-skills).
