import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TextProps } from 'claude-code'

import type { AgentRun, LimitTrack, Page, SessionLog, Snapshot, Step, Subagents } from '../types'
import { GROUPS, actionPrices, buildEntries, groupLabel, groupTotals, insight } from './entries'
import { HELP_IDS, helpFor } from './help'
import { type Lang, langOf, UI } from './i18n'
import { addCompact, addLimit, addPoint, addPrompt, addRequest, emptyLog, findResumed, pruneKeys, sessionKey } from './history'
import { chartRows, clip, detail, detailsFor, fitCell, joinLines, lineSvg, nameWidth, priceGrid, sentenceCase, wrapLines, jumps, k, label, limitForecast, pace, resetLabel, speed, trackLimit, turnRises, usualRise, windowRows } from './model'
import { addLine, descriptionOf, runOf, summarize } from './subagents'

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
const transcript = atom({ plugin: 'chudarin-context-mod', key: 'transcript' } as const, null)
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
// A session whose conversation was launched longer ago than this is a resumed one.
const RESUMED_MS = 60_000
// Store key for the last 5-hour and weekly figures: limits are the account's, not a session's.
const LAST_LIMITS = 'limits:last'
const CHART_ROWS = 6
// Content narrower than this stacks each row that holds a name and figures into two lines:
// the name, then the figures under it, indented 2.
const COMPACT = 48
// Lower blocks keep a gap between stacked rows; a dim dot marks the empty part of a meter.
const BLOCK = '▆'
const EMPTY = '·'

type Level = 'ok' | 'warn' | 'bad'
const LEVEL_COLOR: Record<Level, 'success' | 'warning' | 'error'> = { ok: 'success', warn: 'warning', bad: 'error' }
// The same levels, and the chart's 'suggestion', as fixed colors for vector graphics: an Svg is drawn
// isolated and knows no theme. Each holds at least 3:1 on #ffffff, #f5f5f0, #eeeeee, #282828,
// #1a1a19 and #000000.
const LEVEL_HEX: Record<Level, string> = { ok: '#2b8a3e', warn: '#b87400', bad: '#d6333a' }
const CHART_HEX = '#5769f7'

// The desktop's layout (and every surface but the terminal's): the host's font, spacing in the
// host's steps, columns as fixed-width Boxes in cells, graphics as Svg sized in pixels.
// Columns, in cells: tokens or a delta, a share, a count, a turn, a chevron or mark, the chart's axis,
// a group page's bar.
const D_NUM = 6
const D_PCT = 5
const D_COUNT = 5
const D_TURN = 8
const D_MARK = 1
const D_AXIS = 4
const D_BAR = 10
// Svg heights in pixels: a tile's meter, the stacked bar, a group page's bar.
const PX_METER = 6
const PX_STACK = 10
const PX_BAR = 6
// The chart's height in rows. Its columns are Boxes, not Svg: a hover restyles a Box, never what an
// Svg draws, and a lit column must turn the accent color whole.
const D_CHART_ROWS = 6
// The chart spreads its turns over the first of these slot counts they fit in, so a few turns don't
// draw fat columns, and a turn is a whole percent of the width (the engine takes whole percents only).
const CHART_SLOTS = [20, 25, 50, 100] as const

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

// Load session `id`'s log, or start one (`launch`: the conversation's first launch, when known).
// What was sent or hidden belonged to the session before.
async function loadSession($: EngineInterface, id: string, launch?: number): Promise<SessionLog | undefined> {
  // An unreadable store starts an empty log, as a missing one does.
  const stored = (await $.store.get(sessionKey(id)).catch(() => undefined)) as SessionLog | undefined
  const now = await $.clock.now()
  // Logs from older versions lack newer fields; the empty log fills them in.
  await update($, log, () => (stored ? { ...emptyLog(stored.startedAt), ...stored } : emptyLog(now, launch)))
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

type LastLimit = { percentUsed: number; resetsAt?: string }
function isLastLimits(v: unknown): v is Record<string, LastLimit> {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v).every(x => !!x && typeof (x as LastLimit).percentUsed === 'number')
}

// Each subagent transcript read, by path, with the mtime and size it had: a file is read again only
// once it changes, so a finished agent is read once.
const agentRuns = new Map<string, { stamp: string; run: AgentRun }>()

// One subagent's transcript can run to tens of MB, past what $.fs.read takes: grep streams only the
// reply lines, and they are summed line by line as they come.
async function readRun($: EngineInterface, dir: string, id: string): Promise<AgentRun> {
  const meta = await $.fs.read(`${dir}/${id}.meta.json`).then(t => JSON.parse(t) as unknown).catch(() => null)
  const steps = new Map()
  let rest = ''
  for await (const { stream, text } of $.process.spawn({ argv: ['grep', '-F', '"type":"assistant"', `${dir}/${id}.jsonl`] })) {
    if (stream !== 'stdout') continue
    const lines = (rest + text).split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) addLine(steps, line)
  }
  addLine(steps, rest)
  return runOf(descriptionOf(meta, id), steps)
}

// The session's subagents, from their transcripts beside the session's: <session>/subagents/agent-<id>.jsonl.
// Agents a workflow ran (subagents/workflows/) are not counted.
async function readSubagents($: EngineInterface): Promise<Subagents | null> {
  const main = await read($, transcript)
  if (!main) return null
  const dir = `${main.replace(/\.jsonl$/, '')}/subagents`
  const runs: AgentRun[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    const id = /^(agent-.+)\.jsonl$/.exec(f.name)?.[1]
    if (f.kind !== 'file' || !id) continue
    const path = `${dir}/${f.name}`
    const stamp = `${f.mtimeMs}:${f.size}`
    let known = agentRuns.get(path)
    if (known?.stamp !== stamp) {
      // An agent that can't be read now is left out and tried again on the next refresh.
      const run = await readRun($, dir, id).catch(err => void $.ui.log(`chudarin-context-mod: ${f.name} not read: ${String(err)}`, { to: 'debug' }))
      if (!run) continue
      known = { stamp, run }
      agentRuns.set(path, known)
    }
    runs.push(known.run)
  }
  return summarize(runs)
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
  const fresh = usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }))
  // Limit figures come with model replies (the last API response's); right after a start, or in an
  // idle refresh, there are none. Limits are the account's: the last figures any session read are
  // kept in the store, and the session log is the fallback. A reset time that has passed shows as reset.
  const stored = await $.store.get(LAST_LIMITS).catch(() => undefined)
  const last: Record<string, LastLimit> = isLastLimits(stored) ? stored : {}
  const logged = (await read($, log))?.limits ?? {}
  const next0: Record<string, LastLimit> = { ...last }
  const kept: { kind: string; percentUsed: number; resetsAt?: string }[] = []
  for (const kind of ['five_hour', 'seven_day'] as const) {
    const r = fresh.find(x => x.kind.includes(kind) && !/fable/i.test(x.kind))
    if (r) next0[kind] = { percentUsed: r.percentUsed, ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}) }
    else if (last[kind]) kept.push({ kind, ...last[kind]! })
    else if (logged[kind]) kept.push({ kind, percentUsed: logged[kind]!.last, resetsAt: logged[kind]!.resetsAt })
  }
  if (JSON.stringify(next0) !== JSON.stringify(last))
    await $.store.set(LAST_LIMITS, next0).catch(err => $.ui.log(`chudarin-context-mod: limits not saved: ${String(err)}`))
  const next: Snapshot = {
    lang: l,
    at: await $.clock.now(),
    entries,
    prices: actionPrices(messages, l),
    limits: [...fresh, ...kept],
    threshold: b.isAutoCompactEnabled && b.autoCompactThreshold ? b.autoCompactThreshold : usage.context.window,
    window: usage.context.window,
    used: entries.reduce((n, e) => n + e.tokens, 0),
    subagents: await readSubagents($),
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
    const { context, startedAt: launch } = await $.session.usage()
    const now = await $.clock.now()
    let stored = await loadSession($, id, launch)
    // Every other session's log: the usual pace, and the one a resumed conversation may have left.
    const others: (readonly [string, SessionLog])[] = []
    for (const key of await $.store.keys())
      if (key.startsWith('session:') && key !== sessionKey(id)) {
        const other = (await $.store.get(key)) as SessionLog | undefined
        if (other) others.push([key, other])
      }
    // A conversation launched well before this process (the desktop app after a restart) can come back
    // under a new session id; its first launch is still `usage.startedAt`, so its log is found by that.
    const resumed = !stored && now - launch > RESUMED_MS ? findResumed(others, launch) : null
    const adopted = others.find(([key]) => key === resumed)?.[1]
    if (adopted) {
      stored = adopted
      await update($, log, () => ({ ...emptyLog(adopted.startedAt), ...adopted, launchedAt: launch }))
    }
    // The store keeps its keys in insertion order and pruning drops the oldest: this session's log goes
    // to the end now, so a long conversation resumed after many short ones is not the one dropped.
    if (stored) {
      const current = await read($, log)
      await $.store.delete(sessionKey(id)).catch(() => undefined)
      if (current) await $.store.set(sessionKey(id), current)
    }
    for (const key of pruneKeys(await $.store.keys(), KEEP_SESSIONS)) await $.store.delete(key)
    await update($, usual, () => usualRise(others.map(([, l]) => l)))
    // Only a list of ids counts; anything else in the store is ignored.
    const rawMuted = await $.store.get(MUTED)
    const mutedBefore = Array.isArray(rawMuted) ? rawMuted.filter((x): x is string => typeof x === 'string') : []
    await update($, muted, () => mutedBefore)
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

  // Only the classic events carry the transcript's path; /clear and a resume change it.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    await update($, transcript, () => e.transcript_path)
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
      const elements = $.ui.resolve(e)
      const { Box, Button, Text: HostText } = elements
      // The terminal's tree keeps `mono` on every Text, as it was drawn before the desktop got its
      // own layout; the terminal ignores it.
      const Text: typeof HostText = props => HostText({ mono: true, ...props })
      // Everywhere but the terminal: the desktop layout, in the host's own font.
      const gui = e.surface !== 'terminal'
      // Meters, bars and the chart as vector graphics where the surface draws Svg. An Svg is a leaf
      // that takes no hover and can't sit in a Button: a Box around it carries the hover group.
      const Svg = gui && 'Svg' in elements ? elements.Svg : null
      // A figure in a table column: a fixed width in cells, right-aligned, digits of one width.
      const figure = (text: string, width: number, style: TextProps = {}) => (
        <Box width={width} flexShrink={0} justifyContent="flex-end">
          <HostText tabular {...style}>
            {text}
          </HostText>
        </Box>
      )
      // A fixed-width cell for a chevron, a mark or a dot, so the rows' edges line up; dim unless
      // given a color.
      const markCell = (mark: string | null, style: TextProps = {}) => (
        <Box width={D_MARK} flexShrink={0}>
          {mark !== null && <HostText {...(style.color ? style : { dimColor: true, ...style })}>{mark}</HostText>}
        </Box>
      )
      // A page title or a section title, with a figure at the far end that moves under it when the
      // pane is too narrow for both.
      const heading = (title: string, note: string | null, size: 'heading' | 'body' = 'body') => (
        <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="flex-end" columnGap="md">
          <HostText size={size} weight="semibold">
            {title}
          </HostText>
          {note !== null && (
            <HostText size="caption" dimColor>
              {note}
            </HostText>
          )}
        </Box>
      )
      // The back link, a line of its own at the top of a page: a link, dim at rest and full under the
      // pointer or the focus (the Button's own `dimColor`). `ring` is the key that takes the focus on
      // the page it leads to, the row the person came from.
      const backLink = (to: Page, ring: string) => <Button key="back" plain dimColor label={t.back} onPress={go(to, ring)} />
      // Actions are the host's own buttons, with chrome: `plain` would draw them as bare text. "Put in
      // chat" is the screen's one primary action; the rest are secondary.
      const action = (key: string, text: string, onPress: () => unknown, variant: 'primary' | 'secondary' = 'secondary') => (
        <Button key={key} variant={variant} label={text} onPress={() => void onPress()} />
      )
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
      if (!snap)
        return gui ? (
          <Box padding="md">
            <HostText dimColor>{t.noData}</HostText>
          </Box>
        ) : (
          <Text dimColor>{t.noData}</Text>
        )

      const points = session?.points ?? []
      const fiveSpent = session?.limits?.five_hour?.spent ?? null
      const weekSpent = session?.limits?.seven_day?.spent ?? null
      const agents = snap.subagents
      // Each agent's figures, in a column as wide as the longest: they start in one place.
      const agentNotes = agents?.top.map(r => t.agentPeak(k(r.peak), r.steps)) ?? []
      const NOTE_W = Math.max(0, ...agentNotes.map(n => n.length))
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
      // A press that changes the page removes the Button that held the focus. On the desktop the ring
      // goes to the new page's first stop (`ring`, else its back link), so the pane keeps the keyboard
      // and the next click presses at once. The terminal's ring stays the engine's, as before.
      // Not awaited: the ring waits for the next drawing. What came of it goes to the debug log only.
      const go = (to: Page, ring = 'back') => async () => {
        await update($, page, () => to)
        if (gui)
          void $.ui.focus({ requestId: PANE, key: ring }).then(
            r => $.ui.log(`chudarin-context-mod: focus to ${ring}: ${r.deny ?? 'moved'}`, { to: 'debug' }),
            err => $.ui.log(`chudarin-context-mod: focus to ${ring}: ${String(err)}`, { to: 'debug' }),
          )
      }
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
        if (gui && !entry)
          return (
            <Box flexDirection="column" padding="md" gap="lg">
              {backLink(parent, 'back')}
              <HostText dimColor>{t.entryGone}</HostText>
            </Box>
          )
        if (!entry)
          return (
            <Box flexDirection="column" paddingX={PAD}>
              {back(parent)}
              <Text dimColor>{t.entryGone}</Text>
            </Box>
          )
        const average = entry.count ? Math.round(entry.tokens / entry.count) : 0
        const state = stateOf(entry.id)
        if (gui) {
          // A section of the page: its title, then what it says, rows `xs` apart.
          const part = (title: string, body: ReturnType<typeof HostText>[]) => (
            <Box flexDirection="column" gap="sm">
              <HostText weight="semibold">{title}</HostText>
              <Box flexDirection="column" gap="xs">
                {body}
              </Box>
            </Box>
          )
          return (
            <Box flexDirection="column" padding="md" gap="lg">
              {backLink(parent, `entry-${entry.id}`)}
              {heading(entry.label, ofUsed(entry.tokens), 'heading')}
              {part(t.whatIs, [<HostText>{help.what}</HostText>])}
              {part(t.whySoMuch, [
                <HostText>{entry.count > 1 ? t.times(entry.count, k(average)) : t.once}</HostText>,
                ...(entry.top.length > 0
                  ? [
                      <HostText size="caption" dimColor>
                        {t.heaviest}
                      </HostText>,
                    ]
                  : []),
                ...entry.top.map(c => (
                  <Box flexDirection="row" alignItems="flex-start" columnGap="sm">
                    {figure(`+${k(c.tokens)}`, D_NUM)}
                    <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                      <HostText>{c.label}</HostText>
                    </Box>
                  </Box>
                )),
              ])}
              {/* advice hidden for good leaves no trace here either */}
              {state !== 'muted' &&
                part(t.whatToDo, [
                  // hidden this session: the mark below stands in for the advice
                  ...(state !== 'hidden' ? [<HostText>{help.todo ?? t.nothingToDo}</HostText>] : []),
                  // one row of actions; what it holds depends on the advice's state
                  ...(help.todo
                    ? [
                        <Box flexDirection="row" flexWrap="wrap" alignItems="flex-end" columnGap="md" rowGap="xs">
                          {state === 'sent' && <HostText dimColor>{help.prompt?.startsWith('/') ? t.hintRan : t.hintSent}</HostText>}
                          {state === 'hidden' && <HostText dimColor>{t.adviceHidden}</HostText>}
                          {state === 'shown' && help.prompt && action('entry-fill', t.hintFill, putInChat({ id: entry.id, prompt: help.prompt }), 'primary')}
                          {state === 'shown'
                            ? action('entry-hide', t.hideAdvice, hide(entry.id))
                            : action('entry-mute', t.neverShow, () => setMuted(prev => [...prev, entry.id]))}
                        </Box>,
                      ]
                    : []),
                ])}
            </Box>
          )
        }
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
        // The name column in cells: the row less tokens, share, the bar where it shows, the chevron and
        // a cell for each gap.
        const groupName = Math.max(8, W - D_NUM - D_PCT - D_MARK - 4 - (compact ? 0 : D_BAR + 1))
        if (gui)
          return (
            <Box flexDirection="column" padding="md" gap="lg">
              {backLink({ kind: 'home' }, `group-${group.id}`)}
              {heading(groupLabel(group.id, snap.lang), ofUsed(sum), 'heading')}
              {list.length === 0 && <HostText dimColor>{t.emptyGroup}</HostText>}
              {/* name | tokens | share | bar | chevron; a narrow pane leaves the bar out, the figures say it */}
              <Box flexDirection="column" gap="xs">
                {list.map(x => (
                  <Box key={`row-${x.id}`} flexDirection="row" alignItems="flex-start" columnGap="sm">
                    {/* the name may shrink below its text and is cut to its column, so the figures stay put */}
                    <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                      <Button key={`entry-${x.id}`} plain label={x.label} onPress={go({ kind: 'entry', id: x.id })}>
                        <HostText wrap="truncate-end">{clip(x.label, groupName)}</HostText>
                      </Button>
                    </Box>
                    {figure(k(x.tokens), D_NUM)}
                    {figure(pctOfUsed(x.tokens), D_PCT, { dimColor: true })}
                    {!compact && Svg && (
                      <Box width={D_BAR} flexShrink={0} alignSelf="center">
                        <Svg source={lineSvg(max > 0 ? x.tokens / max : 0, group.color)} alt={`${x.label} ${k(x.tokens)}`} height={PX_BAR} />
                      </Box>
                    )}
                    {markCell('›')}
                  </Box>
                ))}
              </Box>
            </Box>
          )
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
                        {clip(x.label, W - 2)}
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
                    {name}
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
      // One point is the context at start: nothing to chart until a second one (or a compaction).
      const chartable = points.length >= 2 || (session?.compacts.length ?? 0) > 0
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

      if (gui) {
        const stale = now - (snap.at ?? now) >= STALE_MS
        // The chart's slots: one a turn, so a few turns draw slim columns at the left and the empty
        // slots are the turns to come. Past 100 turns a slot's width is rounded where it ends.
        const slots = CHART_SLOTS.find(n => n >= rises.length) ?? rises.length
        const slotWidth = (from: number) => `${Math.round(((from + 1) / slots) * 100) - Math.round((from / slots) * 100)}%`
        // A column's height: its share of the biggest rise, a whole percent, at least 1 when above zero.
        const columnHeight = (rise: number) =>
          chartMax > 0 && rise > 0 ? Math.max(1, Math.round((Math.min(rise, chartMax) / chartMax) * 100)) : 0
        // The stacked bar's pieces in whole percents that add up to 100.
        const piece = widths(
          usedGroups.map(g => g.tokens),
          100,
        )
        // A jump's caption column, in cells: the row less the delta, the turn, the mark and the gaps.
        const captionCells = Math.max(8, W - D_NUM - D_TURN - D_MARK - 3)
        return (
          <Box flexDirection="column" padding="md" gap="xl">
            {/* three cards side by side; a narrow pane stacks them */}
            <Box flexDirection="column" gap="sm">
              <Box flexDirection={compact ? 'column' : 'row'} gap="md">
                {tiles.map(tile => (
                  <Box
                    flexDirection="column"
                    flexGrow={1}
                    flexShrink={1}
                    {...(compact ? {} : { width: `${Math.floor(100 / tiles.length)}%` })}
                    borderStyle="round"
                    borderDimColor
                    padding="md"
                    gap="xs"
                  >
                    <HostText size="caption" dimColor>
                      {sentenceCase(tile.title)}
                    </HostText>
                    {/* the level's color only once it asks for attention; the meter always carries it */}
                    <HostText size="title" weight="semibold" tabular {...(tile.level === 'ok' ? {} : { color: LEVEL_COLOR[tile.level] })}>
                      {`${Math.round(tile.percent)}%`}
                    </HostText>
                    {Svg && (
                      <Svg
                        source={lineSvg(tile.percent / 100, LEVEL_HEX[tile.level], { track: true })}
                        alt={`${sentenceCase(tile.title)} ${Math.round(tile.percent)}%`}
                        height={PX_METER}
                      />
                    )}
                    {tile.lines.filter(Boolean).map(l => (
                      <HostText size="caption" dimColor>
                        {l}
                      </HostText>
                    ))}
                  </Box>
                ))}
              </Box>
              {tempo && <HostText>{t.speed(tempo.kind, tempo.ratio)}</HostText>}
            </Box>

            {/* what fills the window: the title over the tokens column with the total */}
            <Box flexDirection="column" gap="sm">
              <Box flexDirection="row" alignItems="flex-end" columnGap="sm">
                <Box flexGrow={1} flexShrink={1}>
                  <HostText weight="semibold">{t.whatFills}</HostText>
                </Box>
                {figure(k(snap.used), D_NUM, { dimColor: true })}
                <Box width={D_PCT} flexShrink={0} />
                {markCell(null)}
              </Box>
              {/* A bar piece and its legend row share a hover group: pointing at either lights both.
                  The piece is drawn translucent over a Box that takes the group's color when lit. */}
              {Svg && (
                <Box flexDirection="row" columnGap="xs">
                  {usedGroups.map((g, i) => (
                    <Box
                      width={`${piece[i] ?? 0}%`}
                      flexShrink={1}
                      hover={{ scope: `group-${g.id}`, backgroundColor: g.color }}
                    >
                      <Svg source={lineSvg(1, g.color, { opacity: 0.7 })} alt={`${g.label} ${k(g.tokens)}`} height={PX_STACK} />
                    </Box>
                  ))}
                </Box>
              )}
              {/* dot | name | tokens | share | chevron */}
              <Box flexDirection="column" gap="xs">
                {usedGroups.map(g => {
                  const lit = { scope: `group-${g.id}`, bold: true } as const
                  return (
                    <Box key={`row-${g.id}`} flexDirection="row" alignItems="flex-start" columnGap="sm">
                      {markCell('●', { color: g.color, hover: lit })}
                      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                        <Button key={`group-${g.id}`} plain label={g.label} hover={lit} onPress={go({ kind: 'group', id: g.id })}>
                          <HostText wrap="truncate-end">{clip(g.label, Math.max(8, W - D_MARK - D_NUM - D_PCT - D_MARK - 4))}</HostText>
                        </Button>
                      </Box>
                      {figure(k(g.tokens), D_NUM, { hover: lit })}
                      {figure(pctOfUsed(g.tokens), D_PCT, { dimColor: true, hover: lit })}
                      {markCell('›', { hover: lit })}
                    </Box>
                  )
                })}
              </Box>
              {/* the arrow on the hint's first line; the buttons under the text */}
              {hint && (
                <Box flexDirection="row" alignItems="flex-start" columnGap="sm" marginTop="sm">
                  {/* the arrow in the text color: the primary button is the screen's one accent */}
                  <HostText weight="semibold">→</HostText>
                  <Box flexDirection="column" flexShrink={1} gap="sm">
                    <HostText>{hint.text}</HostText>
                    <Box flexDirection="row" flexWrap="wrap" columnGap="md" rowGap="xs">
                      {hint.prompt && action('hint-fill', t.hintFill, putInChat(hint), 'primary')}
                      {/* the entry page's label: one name for one action on this surface */}
                      {action('hint-hide', t.hideAdvice, hide(hint.id))}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>

            {/* what one action costs: name | average | how many times */}
            <Box flexDirection="column" gap="sm">
              <HostText weight="semibold">{t.prices}</HostText>
              {prices.length === 0 && <HostText dimColor>{t.noActions}</HostText>}
              {prices.length > 0 && (
                <Box flexDirection="column" gap="xs">
                  {prices.map(p => (
                    <Box flexDirection="row" alignItems="flex-start" columnGap="sm">
                      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                        <HostText>{p.name}</HostText>
                      </Box>
                      {figure(k(p.average), D_NUM)}
                      {figure(`×${p.count}`, D_COUNT, { dimColor: true })}
                      {/* an empty chevron cell: the figures end where the context table's do */}
                      {markCell(null)}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {/* the whole session, compactions included */}
            {session && session.requests > 0 && (
              <Box flexDirection="column" gap="sm">
                <Box flexDirection="row" flexWrap="wrap" alignItems="flex-end" columnGap="sm">
                  <HostText weight="semibold">{t.session}</HostText>
                  <HostText size="caption" dimColor>
                    {t.since(resetLabel(new Date(session.startedAt).toISOString(), now))}
                  </HostText>
                </Box>
                <Box flexDirection="column" gap="xs">
                  <HostText>{t.sessionRuns(Math.max(0, Math.round((now - session.startedAt) / 60_000)), session.prompts ?? 0)}</HostText>
                  {fiveSpent !== null && <HostText>{t.sessionSpent(fiveSpent, weekSpent)}</HostText>}
                  {fiveSpent !== null && fiveSpent > 0 && (session.prompts ?? 0) > 0 && (
                    <HostText>{t.perMessage(fiveSpent / (session.prompts ?? 1))}</HostText>
                  )}
                  <HostText>
                    {t.compactsLine(session.compacts.length, k(session.compacts.reduce((n, c) => n + Math.max(0, c.before - c.after), 0)))}
                  </HostText>
                  {/* subagents: their reports alone reach the context, so what they processed shows here */}
                  {agents && [
                    <HostText>{t.agents(agents.count, k(agents.fresh + agents.cached))}</HostText>,
                    <HostText>{t.agentsSplit(k(agents.fresh), k(agents.cached))}</HostText>,
                    ...agents.top.map((r, i) => (
                      <Box flexDirection="row" alignItems="flex-start" columnGap="sm">
                        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                          <HostText>{r.description}</HostText>
                        </Box>
                        <Box width={NOTE_W} flexShrink={0}>
                          <HostText dimColor tabular>
                            {agentNotes[i]}
                          </HostText>
                        </Box>
                      </Box>
                    )),
                  ]}
                </Box>
              </Box>
            )}

            {/* folded: the chart, its jumps and the compactions; once there is something to chart */}
            {chartable && (
            <Box flexDirection="column" gap="sm">
              <Button key="block-dynamics" plain label={t.growth} onPress={toggle('block:dynamics')}>
                <HostText weight="semibold">{`${isOpen('block:dynamics') ? '▾' : '▸'} ${t.growth}`}</HostText>
              </Button>
              {isOpen('block:dynamics') && (
                <Box flexDirection="column" gap="sm">
                  {/* the axis (the biggest rise on top, 0 at the bottom), then the plot */}
                  <Box flexDirection="row" alignItems="stretch" columnGap="sm">
                    <Box width={D_AXIS} flexShrink={0} flexDirection="column" justifyContent="space-between" alignItems="flex-end">
                      <HostText size="caption" dimColor tabular>
                        {k(chartMax)}
                      </HostText>
                      <HostText size="caption" dimColor tabular>
                        0
                      </HostText>
                    </Box>
                    {/* one slot a turn; a column is a colored Box, and a peak's column joins its hover
                        group, so the jump list and the chart light each other */}
                    <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} height={D_CHART_ROWS}>
                      {rises.map((rise, c) => {
                        const peak = peakAt.get(c)
                        // not `h`: that name is the JSX factory
                        const tall = columnHeight(rise)
                        return (
                          <Box width={slotWidth(c)} flexShrink={0} flexDirection="column" justifyContent="flex-end" alignItems="center">
                            {tall > 0 && (
                              <Box
                                width="60%"
                                height={`${tall}%`}
                                backgroundColor={CHART_HEX}
                                {...(peak !== undefined ? { hover: { scope: `peak-${peak}`, backgroundColor: 'claude' } } : {})}
                              />
                            )}
                          </Box>
                        )
                      })}
                    </Box>
                  </Box>
                  {shown.length > 2 && (
                    <Box flexDirection="row" columnGap="sm">
                      <Box width={D_AXIS} flexShrink={0} />
                      <HostText size="caption" dimColor>
                        {t.turnRange(shown[1]!.turn, shown[shown.length - 1]!.turn)}
                      </HostText>
                    </Box>
                  )}
                  {/* delta | turn | caption | mark. A jump with more to read opens on a press. */}
                  <Box flexDirection="column" gap="xs" marginTop="sm">
                    {peaks.map((j, n) => {
                      const caption = j.cause ?? t.conversation
                      const full = j.detail ?? caption
                      const opens = full !== caption || caption.length > captionCells
                      const line = clip(caption, captionCells)
                      const hover = { scope: `peak-${n + 1}`, color: 'claude' } as const
                      const isOpenJump = isOpen(`jump:${j.turn}`)
                      // Opened: what the line doesn't already say. The label caption in full is not repeated.
                      const rest = line === caption && full.startsWith(caption) ? full.slice(caption.length).replace(/^[:\s]+/, '') : full
                      return (
                        <Box flexDirection="column" gap="xs">
                          <Box flexDirection="row" alignItems="flex-start" columnGap="sm">
                            {figure(`+${k(j.delta)}`, D_NUM, { hover })}
                            <Box width={D_TURN} flexShrink={0}>
                              <HostText dimColor hover={hover}>
                                {t.turn(j.turn)}
                              </HostText>
                            </Box>
                            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                              {opens ? (
                                <Button key={`jump-${j.turn}`} plain label={caption} hover={hover} onPress={toggle(`jump:${j.turn}`)}>
                                  <HostText>{line}</HostText>
                                </Button>
                              ) : (
                                <HostText hover={hover}>{line}</HostText>
                              )}
                            </Box>
                            {markCell(opens ? (isOpenJump ? '▾' : '▸') : null, { hover })}
                          </Box>
                          {isOpenJump && (
                            <Box flexDirection="row" columnGap="sm">
                              <Box width={D_NUM} flexShrink={0} />
                              <Box width={D_TURN} flexShrink={0} />
                              <Box flexGrow={1} flexShrink={1}>
                                <HostText size="caption" dimColor>
                                  {rest || full}
                                </HostText>
                              </Box>
                            </Box>
                          )}
                        </Box>
                      )
                    })}
                    {(session?.compacts ?? []).map(c => (
                      <Box flexDirection="row" alignItems="flex-start" columnGap="sm">
                        {figure(`−${k(Math.max(0, c.before - c.after))}`, D_NUM)}
                        <Box width={D_TURN} flexShrink={0}>
                          <HostText dimColor>{t.turn(c.turn)}</HostText>
                        </Box>
                        <Box flexGrow={1} flexShrink={1}>
                          <HostText>
                            {t.compactLine(c.trigger === 'manual' ? t.manual : c.trigger === 'auto' ? t.auto : t.plugin, k(c.before), k(c.after))}
                          </HostText>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
            )}

            {/* only once the figures are five minutes old; limits move only when a reply comes in */}
            {stale && (
              <Box flexDirection="row" flexWrap="wrap" alignItems="flex-end" columnGap="sm">
                <HostText size="caption" dimColor>
                  {t.stale(resetLabel(new Date(snap.at).toISOString(), now))}
                </HostText>
                {action('refresh', t.refresh, () => refresh($))}
              </Box>
            )}
          </Box>
        )
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
                      {clip(g.label, W - 4)}
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
                  {name}
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
              {/* subagents: the three dearest under the totals, the figures at the right edge; a narrow
                  pane puts them under the task */}
              {agents && [
                <Text>{t.agents(agents.count, k(agents.fresh + agents.cached))}</Text>,
                <Text>{t.agentsSplit(k(agents.fresh), k(agents.cached))}</Text>,
                ...agents.top.map((r, i) => {
                  const note = agentNotes[i]!
                  return compact ? (
                    <Box flexDirection="column">
                      <Text>{`  ${clip(r.description, W - 2)}`}</Text>
                      <Text dimColor>{`    ${note}`}</Text>
                    </Box>
                  ) : (
                    <Text>
                      {`  ${fitCell(r.description, W - 3 - NOTE_W)} `}
                      <Text dimColor>{note.padEnd(NOTE_W)}</Text>
                    </Text>
                  )
                }),
              ]}
              {sectionGap}
            </Box>
          )}

          {/* folded details, once there is something to chart */}
          {chartable && [
          <Button key="block-dynamics" plain label={t.growth} onPress={toggle('block:dynamics')}>
            <Text>
              <Text dimColor>{isOpen('block:dynamics') ? '▾ ' : '▸ '}</Text>
              {t.growth}
            </Text>
          </Button>,
          isOpen('block:dynamics') && (
            <Box flexDirection="column" paddingLeft={2}>
              {chartRows(rises, CHART_ROWS).map((line, i) => (
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
          ),
          ]}

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
