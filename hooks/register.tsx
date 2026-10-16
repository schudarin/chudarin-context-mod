import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LimitTrack, Page, SessionLog, Snapshot, Step } from '../types'
import { GROUPS, actionPrices, buildEntries, groupLabel, groupTotals, insight } from './entries'
import { HELP_IDS, helpFor } from './help'
import { type Lang, langOf, UI } from './i18n'
import { addCompact, addLimit, addPoint, addPrompt, addRequest, emptyLog, pruneKeys, sessionKey } from './history'
import { chartRows, clip, detail, detailsFor, fitCell, joinLines, nameWidth, priceGrid, wrapLines, jumps, k, label, limitForecast, pace, resetLabel, speed, trackLimit, turnRises, usualRise, windowRows } from './model'

const log = atom({ plugin: 'chudarin-context-mod', key: 'log' } as const, null)
const heaviest = atom({ plugin: 'chudarin-context-mod', key: 'heaviest' } as const, null)
const snapshot = atom({ plugin: 'chudarin-context-mod', key: 'snapshot' } as const, null)
const expanded = atom({ plugin: 'chudarin-context-mod', key: 'expanded' } as const, [])
const page = atom({ plugin: 'chudarin-context-mod', key: 'page' } as const, { kind: 'home' } as Page)
const lang = atom({ plugin: 'chudarin-context-mod', key: 'lang' } as const, 'en' as Lang)
const usual = atom({ plugin: 'chudarin-context-mod', key: 'usual' } as const, null)
const hidden = atom({ plugin: 'chudarin-context-mod', key: 'hidden' } as const, [])
const sent = atom({ plugin: 'chudarin-context-mod', key: 'sent' } as const, [])
const muted = atom({ plugin: 'chudarin-context-mod', key: 'muted' } as const, [])
const limitTrack = atom({ plugin: 'chudarin-context-mod', key: 'limitTrack' } as const, null)
const minute = atom({ plugin: 'chudarin-context-mod', key: 'minute' } as const, 0)
const logId = atom({ plugin: 'chudarin-context-mod', key: 'logId' } as const, null)
// Store key for the 5-hour limit samples: the limit is shared by every session.
const LIMIT = 'limit:five_hour'

function isTrack(v: unknown): v is LimitTrack {
  const t = v as LimitTrack | null
  return !!t && typeof t.resetsAt === 'string' && Array.isArray(t.samples)
}

// One more sample of the 5-hour limit. The store is merged in, so every session adds to one track.
async function sampleLimit($: EngineInterface, resetsAt: string, percent: number) {
  const now = await $.clock.now()
  // A window already over is an idle session's old figure: it must not start the track over.
  if (Date.parse(resetsAt) <= now) return
  const stored = await $.store.get(LIMIT).catch(() => undefined)
  const own = await read($, limitTrack)
  // The newest window wins; in the same window, the track with more samples.
  const [base = null] = [stored, own]
    .filter(isTrack)
    .sort((a, b) => Date.parse(b.resetsAt) - Date.parse(a.resetsAt) || b.samples.length - a.samples.length)
  if (base && Date.parse(resetsAt) < Date.parse(base.resetsAt)) return
  const next = trackLimit(base, resetsAt, now, percent)
  await update($, limitTrack, () => next)
  await $.store.set(LIMIT, next).catch(err => $.ui.log(`chudarin-context-mod: limit samples not saved: ${String(err)}`))
}
// Store key for advice hidden for good: it outlives sessions.
const MUTED = 'muted'

// Marks advice as done once its request was sent or its command run: what counts is
// what reached Claude, not what the panel put in the box.
async function markDone($: EngineInterface, matches: (prompt: string) => boolean) {
  // The first message after a /clear belongs to the new session: switch before marking.
  await followSession($)
  const ids = HELP_IDS.filter(id => (['ru', 'en'] as const).some(l => {
    const p = helpFor(id, l).prompt
    return p !== null && matches(p)
  }))
  if (ids.length === 0) return
  const add = (prev: string[]) => [...prev, ...ids.filter(id => !prev.includes(id))]
  await update($, sent, add)
}

const PANE = 'chudarin-context-mod'
// Figures older than this get the "data is stale" line.
const STALE_MS = 5 * 60_000
// Session logs kept in the store; older ones are dropped.
const KEEP_SESSIONS = 30
const CHART_ROWS = 6
// Content narrower than this stacks each row that holds a name and figures into two lines:
// the name, then the figures under it, indented 2.
const COMPACT = 48
// Lower blocks keep a gap between stacked rows; a dim dot marks the empty part of a meter.
const BLOCK = '▆'
const EMPTY = '·'

type Level = 'ok' | 'warn' | 'bad'
const LEVEL_COLOR: Record<Level, 'success' | 'warning' | 'error'> = { ok: 'success', warn: 'warning', bad: 'error' }

function levelOf(percent: number, warn: number, bad: number): Level {
  return percent > bad ? 'bad' : percent >= warn ? 'warn' : 'ok'
}

// Split a width among values in proportion, at least one cell for any value above zero.
function widths(values: readonly number[], width: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0) return values.map(() => 0)
  const out = values.map(v => (v > 0 ? Math.max(1, Math.round((v / sum) * width)) : 0))
  let extra = out.reduce((a, b) => a + b, 0) - width
  while (extra > 0) {
    const i = out.indexOf(Math.max(...out))
    out[i]! -= 1
    extra -= 1
  }
  return out
}

// Load session `id`'s log, or start one. What was sent or hidden belonged to the session before.
async function loadSession($: EngineInterface, id: string): Promise<SessionLog | undefined> {
  // An unreadable store starts an empty log, as a missing one does.
  const stored = (await $.store.get(sessionKey(id)).catch(() => undefined)) as SessionLog | undefined
  const now = await $.clock.now()
  // Logs from older versions lack newer fields; the empty log fills them in.
  await update($, log, () => (stored ? { ...emptyLog(stored.startedAt), ...stored } : emptyLog(now)))
  await update($, hidden, () => [])
  await update($, sent, () => [])
  await update($, logId, () => id)
  return stored
}

// /clear and a resume inside the process go on under a new session id, and no session.start
// fires: the first write after one loads the new id's log.
async function followSession($: EngineInterface): Promise<string> {
  const id = await $.session.id()
  if ((await read($, logId)) !== id) await loadSession($, id)
  return id
}

// Change the session log in the panel's state and persist it, so a restart or `claude --resume` keeps it.
async function saveLog($: EngineInterface, change: (l: SessionLog) => SessionLog) {
  const id = await followSession($)
  const now = await $.clock.now()
  let next: SessionLog | null = null
  await update($, log, prev => (next = change(prev ?? emptyLog(now))))
  if (next) await $.store.set(sessionKey(id), next)
}

// Claude Code's `language` setting decides the panel's language.
async function readLang($: EngineInterface): Promise<Lang> {
  const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
  return langOf(settings.language)
}

async function refresh($: EngineInterface) {
  const l = await readLang($)
  await update($, lang, () => l)
  const usage = await $.session.usage({ breakdown: 'summary' })
  const b = usage.context.breakdown
  if (!b) return
  const messages = await $.session.messages({ as: 'api' })
  const categories = windowRows(b.categories)
  const entries = buildEntries(categories, detailsFor(b), messages, l)
  const next: Snapshot = {
    lang: l,
    at: await $.clock.now(),
    entries,
    prices: actionPrices(messages, l),
    limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    threshold: b.isAutoCompactEnabled && b.autoCompactThreshold ? b.autoCompactThreshold : usage.context.window,
    window: usage.context.window,
    used: entries.reduce((n, e) => n + e.tokens, 0),
  }
  await update($, snapshot, () => next)
  const five = usage.rateLimits.find(r => /five_hour/.test(r.kind) && !/fable/i.test(r.kind))
  if (five?.resetsAt) await sampleLimit($, five.resetsAt, five.percentUsed)
  // What this session spent of each limit; the log is a nice-to-have, a failure must not stop the refresh.
  const week = usage.rateLimits.find(r => /seven_day/.test(r.kind) && !/fable/i.test(r.kind))
  for (const [kind, r] of [['five_hour', five], ['seven_day', week]] as const)
    if (r?.resetsAt) {
      const { resetsAt, percentUsed } = r
      await saveLog($, l => addLimit(l, kind, resetsAt, percentUsed)).catch(err => $.ui.log(`chudarin-context-mod: limit not logged: ${String(err)}`))
    }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const t0 = UI[await readLang($)]
    await $.command.register({ name: 'ctx', description: t0.cmdPanel })
    // Pick up this session's log (after a restart or `claude --resume`), or start one.
    const id = await $.session.id()
    const stored = await loadSession($, id)
    for (const key of pruneKeys(await $.store.keys(), KEEP_SESSIONS)) await $.store.delete(key)
    // The usual pace, from the other sessions in the store.
    const others: SessionLog[] = []
    for (const key of await $.store.keys())
      if (key.startsWith('session:') && key !== sessionKey(id)) {
        const other = (await $.store.get(key)) as SessionLog | undefined
        if (other) others.push(other)
      }
    await update($, usual, () => usualRise(others))
    // Only a list of ids counts; anything else in the store is ignored.
    const rawMuted = await $.store.get(MUTED)
    const mutedBefore = Array.isArray(rawMuted) ? rawMuted.filter((x): x is string => typeof x === 'string') : []
    await update($, muted, () => mutedBefore)
    const { context } = await $.session.usage()
    if (context.tokens !== undefined && !stored?.points.length) {
      const tokens = context.tokens
      await saveLog($, l => addPoint(l, tokens, null))
    }
    // A failed read must not keep the minute clock below from starting.
    await refresh($).catch(err => $.ui.log(`chudarin-context-mod: refresh failed: ${String(err)}`))
    // A minute clock for the session's life. The pane reads `minute`, so each write redraws it:
    // an idle session still shows a passed reset time and, after five minutes, that its figures
    // are stale. Redraw only; reading the data again here would keep it from ever looking stale.
    $.clock.every(60_000, () => {
      void $.clock
        .now()
        .then(at => update($, minute, () => at))
        .catch(err => $.ui.log(`chudarin-context-mod: minute clock failed: ${String(err)}`))
    })
    return r
  })

  // Any slash command, built-in ones included: running /mcp or /effort counts as done.
  on('command.run', async ($, e, next) => {
    const r = await next(e)
    await markDone($, p => p === `/${e.command}`).catch(err => $.ui.log(`chudarin-context-mod: ${String(err)}`))
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'ctx' }, async $ => {
    const t = UI[await read($, lang)]
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: t.panelClosed }
    }
    await update($, page, () => ({ kind: 'home' }) as Page)
    await refresh($).catch(err => $.ui.log(`chudarin-context-mod: refresh failed: ${String(err)}`))
    await $.ui.open({ id: PANE, title: t.paneTitle, focus: true, closeOnEscape: true })
    return { text: t.panelOpened }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, heaviest, () => null)
    await markDone($, p => !p.startsWith('/') && e.text.includes(p))
    if (!e.command && !e.isMeta) await saveLog($, addPrompt).catch(err => $.ui.log(`chudarin-context-mod: prompt not logged: ${String(err)}`))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    // Rough estimate: ~4 characters per token.
    const tokens = Math.round((r.text?.length ?? 0) / 4)
    const step: Step = { label: label(e as Record<string, unknown>), tokens, detail: detail(e as Record<string, unknown>) }
    await update($, heaviest, prev => (prev && prev.tokens >= tokens ? prev : step))
    return r
  }).catch(($, e, next) => next(e))

  // Every model request of the main conversation: what it read and wrote.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const usage = r?.usage
    if (!e.agentId && usage) await saveLog($, l => addRequest(l, usage))
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    const isMain = !e.agentId && e.trigger !== 'precompute'
    if (isMain && r.skip === undefined) {
      const { tokensBefore, tokensAfter } = r
      if (tokensBefore !== undefined && tokensAfter !== undefined)
        await saveLog($, l => addCompact(l, e.trigger, tokensBefore, tokensAfter))
    }
    return r
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    const tokens = e.context.tokens
    if (tokens !== undefined) {
      const step = await read($, heaviest)
      const cause = step?.label ?? null
      // The log is a nice-to-have: a failure here must not stop the panel's refresh.
      await saveLog($, l => addPoint(l, tokens, cause, step?.detail ?? null)).catch(err => $.ui.log(`chudarin-context-mod: log not saved: ${String(err)}`))
    }
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      const { Box, Button, Text: SurfaceText } = $.ui.resolve(e)
      // Every Text in the surface's monospaced face: the desktop draws a proportional one, and the
      // pane's columns, meters, bars and chart are counted in cells. The terminal ignores `mono`.
      // A nested Text isn't said to take it from its parent (only size and weight are), so each asks.
      const Text: typeof SurfaceText = props => SurfaceText({ mono: true, ...props })
      // A Button draws a bare string in the surface's own face, so a name in a list goes in a Text.
      // The terminal is monospaced already: its tree stays as it was.
      const named = (name: string) => (e.surface === 'terminal' ? name : <Text>{name}</Text>)
      // Every read at once: one wait per redraw instead of one per read (a resize redraws
      // on each step). Reading `minute` subscribes the pane to the minute clock.
      const [snap, language, session, open, where, , now, mutedIds, done, hiddenIds, track, usualPace] = await Promise.all([
        read($, snapshot),
        read($, lang),
        read($, log),
        read($, expanded),
        read($, page),
        read($, minute),
        $.clock.now(),
        read($, muted),
        read($, sent),
        read($, hidden),
        read($, limitTrack),
        read($, usual),
      ])
      const t = UI[language]
      if (!snap) return <Text dimColor>{t.noData}</Text>

      const points = session?.points ?? []
      const fiveSpent = session?.limits?.five_hour?.spent ?? null
      const weekSpent = session?.limits?.seven_day?.spent ?? null
      // Two empty columns on each side of every page; the grid fits inside them.
      const PAD = 2
      // The real width, however narrow: content wider than the pane wraps and breaks the grid.
      const W = Math.max(16, e.props.bodyColumns - 2 * PAD)
      const compact = W < COMPACT
      // One grid for every list: name, tokens, share, then a bar or a chevron.
      const NAME = nameWidth(W)
      const NUM = 7
      const PCT = 6
      // An empty row where column labels used to be: keeps the rhythm without the words.
      const columnsHead = <Text> </Text>
      // Two empty rows between the home page's main blocks.
      const sectionGap = (
        <Box flexDirection="column">
          <Text> </Text>
          <Text> </Text>
        </Box>
      )
      const go = (to: Page) => () => update($, page, () => to)
      const pctOfUsed = (n: number) => (snap.used ? `${Math.round((n / snap.used) * 100)}%` : '')
      const ofUsed = (n: number) => t.ofUsed(k(n), pctOfUsed(n))
      const total = points[points.length - 1]?.tokens ?? snap.used

      const back = (to: Page) => (
        <Box flexDirection="column">
          <Button key="back" plain label={t.back} onPress={go(to)}>
            <Text dimColor>{t.back}</Text>
          </Button>
          <Text> </Text>
        </Box>
      )
      // A narrow pane's title whose figure doesn't fit beside it: the figure goes under it.
      const titleOver = (title: string, figure: string) => (
        <Box flexDirection="column">
          <Text bold>{title.toUpperCase()}</Text>
          <Text dimColor>{`  ${figure}`}</Text>
        </Box>
      )
      // A title with a figure on the right; `edge` is the column the figure ends at.
      const titleRow = (title: string, right: string, edge = W) =>
        compact && title.length + 1 + right.length > edge ? (
          titleOver(title, right)
        ) : (
          <Text>
            <Text bold>{title.toUpperCase()}</Text>
            <Text dimColor>{right.padStart(Math.max(1, edge - title.length))}</Text>
          </Text>
        )
      // A title with a note right after it, for a note that reads with the title.
      const titleNote = (title: string, note: string) =>
        compact && title.length + 2 + note.length > W ? (
          titleOver(title, note)
        ) : (
          <Text>
            <Text bold>{title.toUpperCase()}</Text>
            <Text dimColor>{`  ${note}`}</Text>
          </Text>
        )

      // "Don't show again" is for good and kept in the store; there is no way back.
      const setMuted = async (change: (prev: string[]) => string[]) => {
        const next = await update($, muted, change)
        await $.store.set(MUTED, next).catch(err => $.ui.log(`chudarin-context-mod: hidden advice not saved: ${String(err)}`))
      }
      // Adds the request after whatever the person has typed; a command takes the draft's place,
      // since it runs only on its own. The hint stays until it is sent.
      const putInChat = (h: { id: string; prompt: string | null }) => async () => {
        if (!h.prompt) return
        const after = !h.prompt.startsWith('/') && (await $.prompt.read()).text.trim() !== ''
        await $.prompt.fill({ text: after ? ` ${h.prompt}` : h.prompt, mode: after ? 'append' : 'replace' })
      }
      // Hidden for this session; after a /clear, for the new one.
      const hide = (id: string) => async () => {
        await followSession($)
        await update($, hidden, prev => [...prev, id])
      }
      // Muted for good, sent to Claude this session, hidden by the person this session, or shown.
      const stateOf = (id: string) =>
        mutedIds.includes(id) ? 'muted' : done.includes(id) ? 'sent' : hiddenIds.includes(id) ? 'hidden' : 'shown'

      // ---- entry page: what it is, why so much, what to do ----
      if (where.kind === 'entry') {
        const entry = snap.entries.find(x => x.id === where.id)
        const help = helpFor(where.id, snap.lang)
        const parent: Page = { kind: 'group', id: entry?.group ?? help.group }
        if (!entry)
          return (
            <Box flexDirection="column" paddingX={PAD}>
              {back(parent)}
              <Text dimColor>{t.entryGone}</Text>
            </Box>
          )
        const average = entry.count ? Math.round(entry.tokens / entry.count) : 0
        const state = stateOf(entry.id)
        return (
          <Box flexDirection="column" paddingX={PAD}>
            {back(parent)}
            {titleRow(entry.label, ofUsed(entry.tokens))}
            <Text> </Text>
            <Text bold>{t.whatIs}</Text>
            <Box paddingLeft={2}>
              <Text>{help.what}</Text>
            </Box>
            <Text> </Text>
            <Text bold>{t.whySoMuch}</Text>
            <Box paddingLeft={2} flexDirection="column">
              <Text>{entry.count > 1 ? t.times(entry.count, k(average)) : t.once}</Text>
              {entry.top.length > 0 && <Text dimColor>{t.heaviest}</Text>}
              {entry.top.map(c => (
                <Text wrap="truncate-end">
                  {`+${k(c.tokens)}`.padStart(7)}
                  {'  '}
                  {c.label}
                </Text>
              ))}
            </Box>
            {/* advice hidden for good leaves no trace here either */}
            {state !== 'muted' && (
              <Box flexDirection="column">
                <Text> </Text>
                <Text bold>{t.whatToDo}</Text>
                <Box paddingLeft={2} flexDirection="column">
              {/* hidden this session: the mark below stands in for the advice */}
              {state !== 'hidden' && <Text>{help.todo ?? t.nothingToDo}</Text>}
              {/* one row of actions; what it holds depends on the advice's state */}
              {help.todo && (
                <Box flexDirection="row">
                  {state === 'sent' && <Text dimColor>{help.prompt?.startsWith('/') ? t.hintRan : t.hintSent}</Text>}
                  {state === 'hidden' && <Text dimColor>{t.adviceHidden}</Text>}
                  {state === 'shown' && help.prompt && (
                    <Button key="entry-fill" plain label={t.hintFill} onPress={putInChat({ id: entry.id, prompt: help.prompt })}>
                      <Text color="claude">{t.hintFill}</Text>
                    </Button>
                  )}
                  {(state !== 'shown' || help.prompt) && <Text>{'   '}</Text>}
                  {state === 'shown' ? (
                    <Button key="entry-hide" plain label={t.hideAdvice} onPress={hide(entry.id)}>
                      <Text dimColor>{t.hideAdvice}</Text>
                    </Button>
                  ) : (
                    <Button key="entry-mute" plain label={t.neverShow} onPress={() => setMuted(prev => [...prev, entry.id])}>
                      <Text color="claude">{t.neverShow}</Text>
                    </Button>
                  )}
                </Box>
              )}
                </Box>
              </Box>
            )}
          </Box>
        )
      }

      // ---- group page: its entries ----
      if (where.kind === 'group') {
        const group = GROUPS.find(g => g.id === where.id) ?? GROUPS[0]!
        const list = snap.entries.filter(x => x.group === group.id)
        const sum = list.reduce((n, x) => n + x.tokens, 0)
        const max = Math.max(0, ...list.map(x => x.tokens))
        // Group rows also hold a bar: the name leaves it four cells, and in a pane too narrow even
        // for that the bar goes.
        const NAME_G = nameWidth(W, 4)
        const barW = Math.max(0, W - NAME_G - NUM - PCT - 4)
        const bar = (tokens: number, width: number) =>
          BLOCK.repeat(max > 0 ? Math.min(width, Math.max(1, Math.round((tokens / max) * width))) : 0)
        // A narrow pane: the figures under the name, each row's bar starting at the same column.
        const figures = (tokens: number) => `  ${k(tokens)} · ${pctOfUsed(tokens)}`
        const FIG = Math.max(0, ...list.map(x => figures(x.tokens).length)) + 2
        return (
          <Box flexDirection="column" paddingX={PAD}>
            {back({ kind: 'home' })}
            {titleRow(groupLabel(group.id, snap.lang), ofUsed(sum))}
            <Text> </Text>
            {columnsHead}
            {list.length === 0 && <Text dimColor>{t.emptyGroup}</Text>}
            {list.map(x => {
              const open = go({ kind: 'entry', id: x.id })
              if (compact)
                return (
                  <Box key={`row-${x.id}`} flexDirection="column">
                    <Box flexDirection="row">
                      <Button key={`entry-${x.id}`} plain label={x.label} onPress={open}>
                        {named(clip(x.label, W - 2))}
                      </Button>
                      <Text dimColor> ▸</Text>
                    </Box>
                    <Text>
                      {`  ${k(x.tokens)}`}
                      <Text dimColor>{` · ${pctOfUsed(x.tokens)}`.padEnd(FIG - 2 - k(x.tokens).length)}</Text>
                      <Text color={group.color}>{bar(x.tokens, Math.max(0, W - FIG))}</Text>
                    </Text>
                  </Box>
                )
              // Only the name is the button: the pointer inverts a button, and an inverted bar breaks.
              const name = clip(x.label, NAME_G - 1)
              return (
                <Box key={`row-${x.id}`} flexDirection="row">
                  <Button key={`entry-${x.id}`} plain label={x.label} onPress={open}>
                    {named(name)}
                  </Button>
                  <Text>
                    {' '.repeat(NAME_G - name.length)}
                    {k(x.tokens).padStart(NUM)}
                    <Text dimColor>{pctOfUsed(x.tokens).padStart(PCT)}</Text>
                    {'  '}
                    <Text color={group.color}>{bar(x.tokens, barW).padEnd(barW)}</Text>
                    <Text dimColor> ▸</Text>
                  </Text>
                </Box>
              )
            })}
          </Box>
        )
      }

      // ---- home ----
      const v = pace(points)
      const fill = snap.window ? (total / snap.window) * 100 : 0
      // Past the threshold there is nothing left to count.
      const turnsLeft = v.recent > 0 && total < snap.threshold ? Math.floor((snap.threshold - total) / v.recent) : null
      // Limit figures arrive with model replies. In an idle session the reset time can pass while the
      // percent stays old: then the window has started over, so the limit shows as reset.
      const limit = (re: RegExp) => {
        const l = snap.limits.find(x => re.test(x.kind) && !/fable/i.test(x.kind))
        const passed = !!l?.resetsAt && Date.parse(l.resetsAt) <= now
        return l && { ...l, percentUsed: passed ? 0 : l.percentUsed, passed }
      }
      const limitLine = (l: { resetsAt?: string | null; passed: boolean }) =>
        !l.resetsAt ? '' : l.passed ? t.wasReset(resetLabel(l.resetsAt, now)) : t.resets(resetLabel(l.resetsAt, now))
      const five = limit(/five_hour/)
      const forecast =
        five?.resetsAt && !five.passed && track?.resetsAt === five.resetsAt
          ? limitForecast(track, now, Date.parse(five.resetsAt))
          : null
      const fiveForecast = forecast === null ? '' : forecast === 'untilReset' ? t.limitUntilReset : t.limitLeft(forecast.minutes)
      const week = limit(/seven_day/)
      const tiles = [
        {
          title: t.tileContext,
          percent: fill,
          level: levelOf((total / snap.threshold) * 100, 50, 80),
          lines: [t.ofWindow(k(total), k(snap.window)), turnsLeft !== null ? t.turnsLeft(turnsLeft) : ''],
        },
        ...(five
          ? [
              {
                title: t.tile5h,
                percent: five.percentUsed,
                level: levelOf(five.percentUsed, 70, 90),
                lines: [limitLine(five), fiveForecast],
              },
            ]
          : []),
        ...(week
          ? [
              {
                title: t.tileWeek,
                percent: week.percentUsed,
                level: levelOf(week.percentUsed, 70, 90),
                lines: [limitLine(week), ''],
              },
            ]
          : []),
      ]
      const gap = 2
      const colW = Math.floor((W - gap * (tiles.length - 1)) / tiles.length)
      // Never wider than its column: in a very narrow pane the meter takes the whole of it.
      const meterW = Math.min(colW, Math.max(6, colW - 2))
      // Each tile's text is cut to its column; the gap between columns always stays.
      const cell = (text: string, i: number) => fitCell(text, colW) + (i < tiles.length - 1 ? ' '.repeat(gap) : '')

      const groups = groupTotals(snap.entries, snap.lang)
      const usedGroups = groups.filter(g => g.tokens > 0)
      const stack = widths(
        usedGroups.map(g => g.tokens),
        W - (usedGroups.length - 1),
      )
      const hint = insight(snap.entries, snap.used, snap.lang, [...hiddenIds, ...done, ...mutedIds])
      const tempo = speed(points, usualPace)
      const prices = snap.prices.slice(0, 6)
      const grid = priceGrid(W)
      const priceRows = Math.ceil(prices.length / grid.columns)
      const toggle = (id: string) => () =>
        update($, expanded, prev => (prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]))
      const isOpen = (id: string) => open.includes(id)
      // One column per turn: what that turn added, so a heavy turn stands out as a peak.
      const shown = points.slice(-Math.max(10, W - 8) - 1)
      const rises = turnRises(shown)
      const chartMax = Math.max(0, ...rises)
      // The five biggest jumps, listed below the chart; each one's column joins its hover group.
      const peaks = jumps(shown, 5)
      const peakAt = new Map(peaks.map((j, n) => [shown.findIndex(p => p.turn === j.turn) - 1, n + 1]))
      // A chart row split so each peak's cell joins its hover group: pointing at a jump in the
      // list lights its column, and pointing at the column lights the jump. The surface does the
      // lighting; no hook runs.
      const chartLine = (line: string) => {
        const parts: ReturnType<typeof Text>[] = []
        let run = ''
        const flush = () => {
          if (run) parts.push(<Text color="suggestion">{run}</Text>)
          run = ''
        }
        for (let c = 0; c < line.length; c++) {
          const n = peakAt.get(c)
          if (n === undefined) {
            run += line[c]
            continue
          }
          flush()
          parts.push(
            <Text color="suggestion" hover={{ scope: `peak-${n}`, color: 'claude', bold: true }}>
              {line[c]}
            </Text>,
          )
        }
        flush()
        return parts
      }

      return (
        <Box flexDirection="column" paddingX={PAD}>
          {/* three tiles on one grid; a narrow pane stacks them, each meter the whole width */}
          {compact
            ? tiles.map((tile, i) => {
                const n = Math.min(W, Math.max(tile.percent > 0 ? 1 : 0, Math.round((tile.percent / 100) * W)))
                return (
                  <Box flexDirection="column">
                    {i > 0 && <Text> </Text>}
                    <Text>
                      <Text bold dimColor>
                        {tile.title}
                      </Text>
                      <Text bold color={LEVEL_COLOR[tile.level]}>{`  ${Math.round(tile.percent)}%`}</Text>
                    </Text>
                    <Text>
                      <Text color={LEVEL_COLOR[tile.level]}>{BLOCK.repeat(n)}</Text>
                      <Text dimColor>{EMPTY.repeat(W - n)}</Text>
                    </Text>
                    {joinLines(tile.lines, W).map(l => (
                      <Text dimColor>{l}</Text>
                    ))}
                  </Box>
                )
              })
            : [
              <Text>
                {tiles.map((t, i) => (
                  <Text bold dimColor>
                    {cell(t.title, i)}
                  </Text>
                ))}
              </Text>,
              <Text>
                {tiles.map((t, i) => (
                  <Text bold color={LEVEL_COLOR[t.level]}>
                    {cell(`${Math.round(t.percent)}%`, i)}
                  </Text>
                ))}
              </Text>,
              <Text>
                {tiles.map((t, i) => {
                  const n = Math.min(meterW, Math.max(t.percent > 0 ? 1 : 0, Math.round((t.percent / 100) * meterW)))
                  return (
                    <Text>
                      <Text color={LEVEL_COLOR[t.level]}>{BLOCK.repeat(n)}</Text>
                      <Text dimColor>{EMPTY.repeat(meterW - n)}</Text>
                      {' '.repeat(colW - meterW + (i < tiles.length - 1 ? gap : 0))}
                    </Text>
                  )
                })}
              </Text>,
              ...[0, 1].map(row =>
                tiles.some(t => t.lines[row]) ? (
                  <Text dimColor>{tiles.map((t, i) => cell(t.lines[row] ?? '', i)).join('')}</Text>
                ) : null,
              ),
            ]}
          {tempo && <Text>{t.speed(tempo.kind, tempo.ratio)}</Text>}
          {sectionGap}

          {/* what fills the window */}
          {titleRow(t.whatFills, k(snap.used))}
          {/* A bar piece and its legend row share a hover group: pointing at either lights both.
              The piece fills its whole cell when lit; pressing it opens the group, like the row. */}
          <Box flexDirection="row">
            {usedGroups.flatMap((g, i) => [
              ...(i > 0 ? [<Text> </Text>] : []),
              <Button
                key={`bar-${g.id}`}
                plain
                label={g.label}
                hover={{ scope: `group-${g.id}`, backgroundColor: g.color }}
                onPress={go({ kind: 'group', id: g.id })}
              >
                <Text color={g.color}>{BLOCK.repeat(stack[i] ?? 0)}</Text>
              </Button>,
            ])}
          </Box>
          {columnsHead}
          {usedGroups.map(g => {
            const lit = { scope: `group-${g.id}`, bold: true } as const
            // A narrow pane: the name on its own line, the figures under it; every lit part still
            // sits straight in a Box, so either line lights the bar piece.
            if (compact)
              return (
                <Box key={`row-${g.id}`} flexDirection="column">
                  <Box flexDirection="row">
                    <Text color={g.color} hover={lit}>
                      ■{' '}
                    </Text>
                    <Button key={`group-${g.id}`} plain label={g.label} hover={lit} onPress={go({ kind: 'group', id: g.id })}>
                      {named(clip(g.label, W - 4))}
                    </Button>
                    <Text dimColor hover={lit}>
                      {' ▸'}
                    </Text>
                  </Box>
                  <Text dimColor hover={lit}>{`  ${k(g.tokens)} · ${pctOfUsed(g.tokens)}`}</Text>
                </Box>
              )
            const name = clip(g.label, NAME - 3)
            return (
              <Box key={`row-${g.id}`} flexDirection="row">
                <Text color={g.color} hover={lit}>
                  ■{' '}
                </Text>
                <Button key={`group-${g.id}`} plain label={g.label} hover={lit} onPress={go({ kind: 'group', id: g.id })}>
                  {named(name)}
                </Button>
                <Text hover={lit}>
                  {' '.repeat(NAME - 2 - name.length)}
                  {k(g.tokens).padStart(NUM)}
                  <Text dimColor>{pctOfUsed(g.tokens).padStart(PCT)}</Text>
                  <Text dimColor>{'  ▸'}</Text>
                </Text>
              </Box>
            )
          })}
          {hint && (
            <Box flexDirection="column">
              <Text> </Text>
              {/* the arrow in its own column, so wrapped lines line up with the buttons */}
              <Box flexDirection="row">
                <Text bold color="claude">
                  →{' '}
                </Text>
                <Box flexDirection="column" flexShrink={1}>
                  <Text>{hint.text}</Text>
                </Box>
              </Box>
              <Box flexDirection="row" paddingLeft={2}>
                {hint.prompt && (
                  <Button key="hint-fill" plain label={t.hintFill} onPress={putInChat(hint)}>
                    <Text color="claude">{t.hintFill}</Text>
                  </Button>
                )}
                {hint.prompt && <Text>{'   '}</Text>}
                <Button key="hint-hide" plain label={t.hintHide} onPress={hide(hint.id)}>
                  <Text dimColor>{t.hintHide}</Text>
                </Button>
              </Box>
            </Box>
          )}
          {sectionGap}

          {/* what one action costs */}
          <Text bold>{t.prices.toUpperCase()}</Text>
          {prices.length === 0 && <Text dimColor>{t.noActions}</Text>}
          {Array.from({ length: priceRows }, (_, row) => {
            const cells = Array.from({ length: grid.columns }, (_, c) => prices[row + c * priceRows])
            // Name, average price, then how many times: a cheap action done often can outweigh
            // a dear one done once.
            const NAME_W = grid.width - 12
            const priceCell = (p: (typeof cells)[number], last: boolean) =>
              p ? (
                <Text>
                  {fitCell(p.name, NAME_W)}
                  {k(p.average).padStart(5)}
                  <Text dimColor>{` ×${p.count}`.padEnd(7 + (last ? 0 : 4))}</Text>
                </Text>
              ) : (
                ' '.repeat(grid.width + (last ? 0 : 4))
              )
            return <Text>{cells.map((p, c) => priceCell(p, c === cells.length - 1))}</Text>
          })}
          {sectionGap}

          {/* the whole session, compactions included */}
          {session && session.requests > 0 && (
            <Box flexDirection="column">
              {titleNote(t.session, t.since(resetLabel(new Date(session.startedAt).toISOString(), now)))}
              <Text>{t.sessionRuns(Math.max(0, Math.round((now - session.startedAt) / 60_000)), session.prompts ?? 0)}</Text>
              {fiveSpent !== null && <Text>{t.sessionSpent(fiveSpent, weekSpent)}</Text>}
              {fiveSpent !== null && fiveSpent > 0 && (session.prompts ?? 0) > 0 && (
                <Text>{t.perMessage(fiveSpent / (session.prompts ?? 1))}</Text>
              )}
              <Text>
                {t.compactsLine(session.compacts.length, k(session.compacts.reduce((n, c) => n + Math.max(0, c.before - c.after), 0)))}
              </Text>
              {sectionGap}
            </Box>
          )}

          {/* folded details */}
          <Button key="block-dynamics" plain label={t.growth} onPress={toggle('block:dynamics')}>
            <Text>
              <Text dimColor>{isOpen('block:dynamics') ? '▾ ' : '▸ '}</Text>
              {t.growth}
            </Text>
          </Button>
          {isOpen('block:dynamics') && (
            <Box flexDirection="column" paddingLeft={2}>
              {chartRows(
                rises,
                CHART_ROWS,
              ).map((line, i) => (
                // A row of sibling Texts, not one Text: a nested Text can't light its hover group,
                // and a peak's cells must light the list line too.
                <Box flexDirection="row">
                  <Text dimColor>{`${(i === 0 ? k(chartMax) : '').padStart(5)} `}</Text>
                  {chartLine(line)}
                </Box>
              ))}
              <Text dimColor>
                {'    0 '}
                {shown.length > 2 ? t.turnRange(shown[1]!.turn, shown[shown.length - 1]!.turn) : ''}
              </Text>
              {/* Each jump fits one line, cut by hand: a Button doesn't truncate its label. A jump
                  with more to read opens on a press, marked ▸ / ▾ like the folded blocks. A narrow
                  pane puts the caption on a line of its own, under the figures. */}
              {peaks.map((j, n) => {
                const delta = `+${k(j.delta)}`.padStart(6)
                const turn = `  ${t.turn(j.turn)}  `
                const caption = j.cause ?? t.conversation
                // Opens when there is more to read: a kept whole text, or a label the line cuts.
                const full = j.detail ?? caption
                // The block is indented 2, so a line here has W - 2 cells; a narrow pane's caption line
                // gives 2 of them to its own indent.
                const fits = compact ? W - 4 : W - 2 - delta.length - turn.length
                const opens = full !== caption || caption.length > fits
                const room = compact ? fits : Math.max(8, fits - (opens ? 2 : 0))
                const line = caption.length > room ? `${caption.slice(0, room - 1)}…` : caption
                const hover = { scope: `peak-${n + 1}`, color: 'claude' } as const
                const isOpenJump = isOpen(`jump:${j.turn}`)
                const mark = opens && <Text dimColor>{isOpenJump ? ' ▾' : ' ▸'}</Text>
                const row = compact ? (
                  <Text>
                    {`+${k(j.delta)}`}
                    <Text dimColor>{`  ${t.turn(j.turn)}`}</Text>
                    {mark}
                  </Text>
                ) : (
                  <Text>
                    {delta}
                    <Text dimColor>{turn}</Text>
                    {line}
                    {mark}
                  </Text>
                )
                // The caption's own line in a narrow pane: it lights the column as the row does.
                const under = compact && <Text hover={hover}>{`  ${line}`}</Text>
                if (!opens)
                  return compact ? (
                    <Box flexDirection="column">
                      <Text hover={hover}>{row}</Text>
                      {under}
                    </Box>
                  ) : (
                    <Text hover={hover}>{row}</Text>
                  )
                // Opened: what the line doesn't already say. The label caption in full is not repeated.
                const rest = line === caption && full.startsWith(caption) ? full.slice(caption.length).replace(/^[:\s]+/, '') : full
                return (
                  <Box flexDirection="column">
                    <Button key={`jump-${j.turn}`} plain label={caption} hover={hover} onPress={toggle(`jump:${j.turn}`)}>
                      {row}
                    </Button>
                    {under}
                    {/* wrapped by hand: the pane cuts a long Text at its edge rather than wrapping it */}
                    {isOpenJump && (
                      <Box paddingLeft={compact ? 2 : 8} flexDirection="column">
                        {wrapLines(rest || full, compact ? W - 4 : Math.max(10, W - 10)).map(l => (
                          <Text dimColor>{l}</Text>
                        ))}
                      </Box>
                    )}
                  </Box>
                )
              })}
              {(session?.compacts ?? []).map(c => (
                <Text wrap="truncate-end">
                  {`−${k(Math.max(0, c.before - c.after))}`.padStart(6)}
                  <Text dimColor>{`  ${t.turn(c.turn)}  `}</Text>
                  {t.compactLine(c.trigger === 'manual' ? t.manual : c.trigger === 'auto' ? t.auto : t.plugin, k(c.before), k(c.after))}
                </Text>
              ))}
            </Box>
          )}

          {/* only once the figures are five minutes old; limits move only when a reply comes in */}
          {now - (snap.at ?? now) >= STALE_MS && <Text> </Text>}
          {now - (snap.at ?? now) >= STALE_MS && (
            <Box flexDirection="row">
              <Text dimColor>{`${t.stale(resetLabel(new Date(snap.at).toISOString(), now))} · `}</Text>
              <Button key="refresh" plain label={t.refresh} onPress={() => refresh($)}>
                <Text color="claude">{t.refresh}</Text>
              </Button>
            </Box>
          )}
        </Box>
      )
    } catch (err) {
      const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      $.ui.log(`chudarin-context-mod: pane render failed: ${text}`)
      const { Text } = $.ui.resolve(e)
      return <Text color="error" mono>chudarin-context-mod: {text}</Text>
    }
  })
}
