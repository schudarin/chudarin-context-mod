import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Page, SessionLog, Snapshot, Step } from '../types'
import { GROUPS, actionPrices, buildEntries, groupLabel, groupTotals, insight } from './entries'
import { helpFor } from './help'
import { type Lang, langOf, UI } from './i18n'
import { addCompact, addPoint, addRequest, emptyLog, pruneKeys, sessionKey } from './history'
import { chartRows, detailsFor, jumps, k, label, pace, resetLabel, sparkline, windowRows } from './model'

const log = atom({ plugin: 'chudarin-context-mod', key: 'log' } as const, null)
const heaviest = atom({ plugin: 'chudarin-context-mod', key: 'heaviest' } as const, null)
const top = atom({ plugin: 'chudarin-context-mod', key: 'top' } as const, [])
const snapshot = atom({ plugin: 'chudarin-context-mod', key: 'snapshot' } as const, null)
const expanded = atom({ plugin: 'chudarin-context-mod', key: 'expanded' } as const, [])
const page = atom({ plugin: 'chudarin-context-mod', key: 'page' } as const, { kind: 'home' } as Page)
const bandOn = atom({ plugin: 'chudarin-context-mod', key: 'bandOn' } as const, false)
const lang = atom({ plugin: 'chudarin-context-mod', key: 'lang' } as const, 'en' as Lang)

const PANE = 'chudarin-context-mod'
// Session logs kept in the store; older ones are dropped.
const KEEP_SESSIONS = 30
const BAND_POINTS = 24
const CHART_ROWS = 6
const TOP_STEPS = 8
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

// Change the session log in the panel's state and persist it, so a restart or --resume keeps it.
async function saveLog($: EngineInterface, change: (l: SessionLog) => SessionLog) {
  const id = await $.session.id()
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
    entries,
    prices: actionPrices(messages, l),
    limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    threshold: b.isAutoCompactEnabled && b.autoCompactThreshold ? b.autoCompactThreshold : usage.context.window,
    window: usage.context.window,
    used: entries.reduce((n, e) => n + e.tokens, 0),
  }
  await update($, snapshot, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const t0 = UI[await readLang($)]
    await $.command.register({ name: 'ctx', description: t0.cmdPanel })
    await $.command.register({ name: 'ctx-line', description: t0.cmdLine })
    // Pick up this session's log (after a restart or --resume), or start one.
    const id = await $.session.id()
    const stored = (await $.store.get(sessionKey(id))) as SessionLog | undefined
    const now = await $.clock.now()
    await update($, log, () => stored ?? emptyLog(now))
    for (const key of pruneKeys(await $.store.keys(), KEEP_SESSIONS)) await $.store.delete(key)
    const { context } = await $.session.usage()
    if (context.tokens !== undefined && !stored?.points.length) {
      const tokens = context.tokens
      await saveLog($, l => addPoint(l, tokens, null))
    }
    await refresh($)
    return r
  })

  on('command.run', { command: 'ctx' }, async $ => {
    const t = UI[await read($, lang)]
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: t.panelClosed }
    }
    await update($, page, () => ({ kind: 'home' }) as Page)
    await $.ui.open({ id: PANE, title: t.paneTitle, focus: true, closeOnEscape: true })
    return { text: t.panelOpened }
  })

  on('command.run', { command: 'ctx-line' }, async $ => {
    const t = UI[await read($, lang)]
    const isOn = !(await read($, bandOn))
    await update($, bandOn, () => isOn)
    return { text: isOn ? t.lineOn : t.lineOff }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, heaviest, () => null)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    // Rough estimate: ~4 characters per token.
    const tokens = Math.round((r.text?.length ?? 0) / 4)
    const step: Step = { label: label(e as Record<string, unknown>), tokens }
    await update($, heaviest, prev => (prev && prev.tokens >= tokens ? prev : step))
    await update($, top, prev => [...prev, step].sort((a, b) => b.tokens - a.tokens).slice(0, TOP_STEPS))
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
      const cause = (await read($, heaviest))?.label ?? null
      // The log is a nice-to-have: a failure here must not stop the panel's refresh.
      await saveLog($, l => addPoint(l, tokens, cause)).catch(err => $.ui.log(`chudarin-context-mod: log not saved: ${String(err)}`))
    }
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, bandOn))) return next(e)
    const points = ((await read($, log))?.points ?? []).slice(-BAND_POINTS).map(p => p.tokens)
    const total = points[points.length - 1]
    const snap = await read($, snapshot)
    if (total === undefined || !snap) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>
          ctx {UI[snap.lang].ofWindow(k(total), k(snap.window))} · {Math.round((total / snap.window) * 100)}%{' '}
          <Text color="suggestion">{sparkline(points)}</Text>
          {'  /ctx'}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      const { Box, Button, Text } = $.ui.resolve(e)
      const snap = await read($, snapshot)
      const t = UI[await read($, lang)]
      if (!snap) return <Text dimColor>{t.noData}</Text>

      const session = await read($, log)
      const points = session?.points ?? []
      const steps = await read($, top)
      const open = await read($, expanded)
      const where = await read($, page)
      const now = await $.clock.now()
      // Two empty columns on each side of every page; the grid fits inside them.
      const PAD = 2
      const W = Math.max(40, e.props.bodyColumns - 2 * PAD)
      // One grid for every list: name, tokens, share, then a bar or a chevron.
      const NAME = 30
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
      // A title with a figure on the right; `edge` is the column the figure ends at.
      const titleRow = (title: string, right: string, edge = W) => (
        <Text>
          <Text bold>{title.toUpperCase()}</Text>
          <Text dimColor>{right.padStart(Math.max(1, edge - title.length))}</Text>
        </Text>
      )

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
            <Text> </Text>
            <Text bold>{t.whatToDo}</Text>
            <Box paddingLeft={2}>
              <Text>{help.todo ?? t.nothingToDo}</Text>
            </Box>
          </Box>
        )
      }

      // ---- group page: its entries ----
      if (where.kind === 'group') {
        const group = GROUPS.find(g => g.id === where.id) ?? GROUPS[0]!
        const list = snap.entries.filter(x => x.group === group.id)
        const sum = list.reduce((n, x) => n + x.tokens, 0)
        const max = Math.max(0, ...list.map(x => x.tokens))
        const barW = Math.max(4, W - NAME - NUM - PCT - 4)
        return (
          <Box flexDirection="column" paddingX={PAD}>
            {back({ kind: 'home' })}
            {titleRow(groupLabel(group.id, snap.lang), ofUsed(sum))}
            <Text> </Text>
            {columnsHead}
            {list.length === 0 && <Text dimColor>{t.emptyGroup}</Text>}
            {list.map(x => {
              // Only the name is the button: the pointer inverts a button, and an inverted bar breaks.
              const name = x.label.slice(0, NAME - 1)
              return (
                <Box key={`row-${x.id}`} flexDirection="row">
                  <Button key={`entry-${x.id}`} plain label={x.label} onPress={go({ kind: 'entry', id: x.id })}>
                    {name}
                  </Button>
                  <Text>
                    {' '.repeat(NAME - name.length)}
                    {k(x.tokens).padStart(NUM)}
                    <Text dimColor>{pctOfUsed(x.tokens).padStart(PCT)}</Text>
                    {'  '}
                    <Text color={group.color}>
                      {BLOCK.repeat(max > 0 ? Math.max(1, Math.round((x.tokens / max) * barW)) : 0).padEnd(barW)}
                    </Text>
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
      const turnsLeft = v.recent > 0 ? Math.floor((snap.threshold - total) / v.recent) : null
      const limit = (re: RegExp) => snap.limits.find(l => re.test(l.kind) && !/fable/i.test(l.kind))
      const five = limit(/five_hour/)
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
                lines: [five.resetsAt ? t.resets(resetLabel(five.resetsAt, now)) : '', ''],
              },
            ]
          : []),
        ...(week
          ? [
              {
                title: t.tileWeek,
                percent: week.percentUsed,
                level: levelOf(week.percentUsed, 70, 90),
                lines: [week.resetsAt ? t.resets(resetLabel(week.resetsAt, now)) : '', ''],
              },
            ]
          : []),
      ]
      const gap = 2
      const colW = Math.floor((W - gap * (tiles.length - 1)) / tiles.length)
      const meterW = Math.max(6, colW - 2)
      const cell = (text: string, i: number) => text.padEnd(colW + (i < tiles.length - 1 ? gap : 0)).slice(0, colW + gap)

      const groups = groupTotals(snap.entries, snap.lang)
      const usedGroups = groups.filter(g => g.tokens > 0)
      const stack = widths(
        usedGroups.map(g => g.tokens),
        W - (usedGroups.length - 1),
      )
      const hint = insight(snap.entries, fill, snap.used, snap.lang)
      const prices = snap.prices.slice(0, 6)
      const half = Math.ceil(prices.length / 2)
      const priceW = Math.floor((W - 4) / 2)
      const toggle = (id: string) => () =>
        update($, expanded, prev => (prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]))
      const isOpen = (id: string) => open.includes(id)
      const shown = points.slice(-Math.max(10, W - 8))
      const chartMax = Math.max(0, ...shown.map(p => p.tokens))

      return (
        <Box flexDirection="column" paddingX={PAD}>
          {/* three tiles on one grid */}
          <Text>
            {tiles.map((t, i) => (
              <Text bold dimColor>
                {cell(t.title, i)}
              </Text>
            ))}
          </Text>
          <Text>
            {tiles.map((t, i) => (
              <Text bold color={LEVEL_COLOR[t.level]}>
                {cell(`${Math.round(t.percent)}%`, i)}
              </Text>
            ))}
          </Text>
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
          </Text>
          {[0, 1].map(row =>
            tiles.some(t => t.lines[row]) ? (
              <Text dimColor>{tiles.map((t, i) => cell(t.lines[row] ?? '', i)).join('')}</Text>
            ) : null,
          )}
          {sectionGap}

          {/* what fills the window */}
          {titleRow(t.whatFills, k(snap.used))}
          <Text>
            {usedGroups.map((g, i) => (
              <Text>
                {i > 0 ? ' ' : ''}
                <Text color={g.color}>{BLOCK.repeat(stack[i] ?? 0)}</Text>
              </Text>
            ))}
          </Text>
          {columnsHead}
          {usedGroups.map(g => {
            const name = g.label.slice(0, NAME - 3)
            return (
              <Box key={`row-${g.id}`} flexDirection="row">
                <Text color={g.color}>■ </Text>
                <Button key={`group-${g.id}`} plain label={g.label} onPress={go({ kind: 'group', id: g.id })}>
                  {name}
                </Button>
                <Text>
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
              <Text>
                <Text bold color="claude">
                  →{' '}
                </Text>
                {hint}
              </Text>
            </Box>
          )}
          {sectionGap}

          {/* what one action costs */}
          <Text bold>{t.prices.toUpperCase()}</Text>
          <Text dimColor>{t.pricesHint}</Text>
          {prices.length === 0 && <Text dimColor>{t.noActions}</Text>}
          {Array.from({ length: half }, (_, row) => {
            const left = prices[row]
            const right = prices[row + half]
            const priceCell = (p: typeof left) =>
              p ? `${p.name.padEnd(priceW - 7).slice(0, priceW - 7)}${k(p.average).padStart(5)}` : ''
            return (
              <Text>
                {priceCell(left).padEnd(priceW + 4)}
                {priceCell(right)}
              </Text>
            )
          })}
          {sectionGap}

          {/* the whole session, compactions included */}
          {session && session.requests > 0 && (
            <Box flexDirection="column">
              {titleRow(t.session, t.since(resetLabel(new Date(session.startedAt).toISOString(), now)))}
              <Text>
                {t.readByModel.padEnd(NAME)}
                {k(session.read).padStart(NUM)}
                <Text dimColor>
                  {'  '}
                  {t.fromCache(session.read ? Math.round((session.cached / session.read) * 100) : 0)}
                </Text>
              </Text>
              <Text>
                {t.written.padEnd(NAME)}
                {k(session.written).padStart(NUM)}
              </Text>
              <Text>
                {t.requests.padEnd(NAME)}
                {String(session.requests).padStart(NUM)}
              </Text>
              <Text>
                {t.compacts.padEnd(NAME)}
                {String(session.compacts.length).padStart(NUM)}
                {session.compacts.length > 0 && (
                  <Text dimColor>
                    {'  '}
                    {t.dropped(k(session.compacts.reduce((n, c) => n + Math.max(0, c.before - c.after), 0)))}
                  </Text>
                )}
              </Text>
              <Text dimColor>{t.sessionHint}</Text>
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
              <Text dimColor>
                {t.pace(k(Math.round(v.overall)), k(Math.round(v.recent)))}
              </Text>
              {chartRows(
                shown.map(p => p.tokens),
                CHART_ROWS,
              ).map((line, i) => (
                <Text>
                  <Text dimColor>{(i === 0 ? k(chartMax) : '').padStart(5)} </Text>
                  <Text color="suggestion">{line}</Text>
                </Text>
              ))}
              <Text dimColor>
                {'    0 '}
                {shown.length > 1 ? t.turnRange(shown[0]!.turn, shown[shown.length - 1]!.turn) : ''}
              </Text>
              {jumps(shown, 3).map(j => (
                <Text wrap="truncate-end">
                  {`+${k(j.delta)}`.padStart(6)}
                  <Text dimColor>{`  ${t.turn(j.turn)}  `}</Text>
                  {j.cause ?? t.conversation}
                </Text>
              ))}
              {(session?.compacts ?? []).map(c => (
                <Text wrap="truncate-end">
                  {`−${k(Math.max(0, c.before - c.after))}`.padStart(6)}
                  <Text dimColor>{`  ${t.turn(c.turn)}  `}</Text>
                  {t.compactLine(c.trigger === 'manual' ? t.manual : c.trigger === 'auto' ? t.auto : t.plugin, k(c.before), k(c.after))}
                </Text>
              ))}
            </Box>
          )}
          <Button key="block-steps" plain label={t.steps} onPress={toggle('block:steps')}>
            <Text>
              <Text dimColor>{isOpen('block:steps') ? '▾ ' : '▸ '}</Text>
              {t.steps}
            </Text>
          </Button>
          {isOpen('block:steps') && (
            <Box flexDirection="column" paddingLeft={2}>
              {steps.length === 0 && <Text dimColor>{t.noSteps}</Text>}
              {steps.map(s => (
                <Text wrap="truncate-end">
                  {`+${k(s.tokens)}`.padStart(6)}
                  {'  '}
                  <Text dimColor>{s.label}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    } catch (err) {
      const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      $.ui.log(`chudarin-context-mod: pane render failed: ${text}`)
      const { Text } = $.ui.resolve(e)
      return <Text color="error">chudarin-context-mod: {text}</Text>
    }
  })
}
