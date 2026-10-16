import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { SessionLog } from '../types'

const props = {
  title: 'Контекст',
  isFocused: false,
  bodyColumns: 72,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 60, contentRows: 0 },
} as const

const usage = {
  startedAt: 0,
  rateLimits: [
    { kind: 'five_hour', percentUsed: 5, resetsAt: '2026-10-15T19:00:00' },
    { kind: 'seven_day', percentUsed: 72, resetsAt: '2026-10-19T10:00:00' },
  ],
  context: {
    tokens: 20_000,
    window: 1_000_000,
    breakdown: {
      categories: [
        { name: 'Skills', tokens: 10_000, color: 'warning', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 10_000, color: 'x', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
      ],
      skills: { totalSkills: 1, includedSkills: 1, tokens: 80, skillFrontmatter: [{ name: 'brainstorming', source: 'plugin', tokens: 80 }] },
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: false,
    },
  },
}

const messages = [
  { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(4000) }] },
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pane says it has no data yet on ${surface}`, async ($, on) => {
    on('clock.now', () => ({ value: 0 }) as never)
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface,
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: props as never,
    })
    expect(JSON.stringify(await ui.drawn())).toContain('No data')
  })

  for (const [language, w] of [
    ['Russian', { week: 'ЛИМИТ НЕДЕЛЯ', group: 'Работа инструментов', price: 'Команда в Bash', entry: 'Вывод команд Bash', what: 'Что это', todo: 'Что делать', groupTitle: 'РАБОТА ИНСТРУМЕНТОВ', home: 'ЧЕМ ЗАНЯТ КОНТЕКСТ' }],
    ['English', { week: 'WEEKLY LIMIT', group: 'Tool work', price: 'Bash command', entry: 'Bash output', what: 'What it is', todo: 'What to do', groupTitle: 'TOOL WORK', home: 'WHAT FILLS THE CONTEXT' }],
  ] as const) {
    test(`home → group → entry → back on ${surface} in ${language}`, async ($, on) => {
      on('session.usage', () => ({ value: usage }) as never)
      on('session.messages', () => ({ value: messages }) as never)
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      on('settings.read', () => ({ value: { language } }) as never)
      on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
      on('session.id', () => ({ value: 'test-session' }) as never)
      await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
      const ui = await $.ui.mount({
        plugin: 'chudarin-context-mod',
        surface,
        component: 'Pane',
        requestId: 'chudarin-context-mod',
        props: props as never,
      })
      const drawn = async () => JSON.stringify(await ui.drawn())

      const home = await drawn()
      expect(home).toContain(w.week)
      expect(home).toContain(w.group)
      expect(home).toContain(w.price)

      await ui.press({ key: 'group-tools' })
      expect(await drawn()).toContain(w.entry)

      await ui.press({ key: 'entry-result:Bash' })
      const entry = await drawn()
      expect(entry).toContain(w.what)
      expect(entry).toContain(w.todo)
      expect(entry).toContain('npm test')

      await ui.press({ key: 'back' })
      expect(await drawn()).toContain(w.groupTitle)
      await ui.press({ key: 'back' })
      expect(await drawn()).toContain(w.home)
    })
  }
}

test('every page keeps two empty columns on each side', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  const padding = async () => {
    const root = (await ui.drawn()) as { props: { paddingX?: number } }
    return root.props.paddingX
  }
  expect(await padding()).toBe(2)
  await ui.press({ key: 'group-tools' })
  expect(await padding()).toBe(2)
  await ui.press({ key: 'entry-result:Bash' })
  expect(await padding()).toBe(2)
})

test('the session title and its start time sit side by side', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  const stored = {
    startedAt: Date.parse('2026-10-15T09:30:00'),
    requests: 3,
    read: 90_000,
    cached: 80_000,
    written: 2_000,
    points: [],
    compacts: [],
    prompts: 4,
    limits: {
      five_hour: { resetsAt: '2026-10-15T19:00:00', last: 5, spent: 20 },
      seven_day: { resetsAt: '2026-10-19T10:00:00', last: 72, spent: 4 },
    },
  }
  on('store.get', () => ({ value: stored }) as never)
  on('store.keys', () => ({ value: ['session:test-session'] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('store.delete', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  const home = JSON.stringify(await ui.drawn())
  expect(home).toContain('THIS SESSION')
  expect(home).toMatch(/"  since /)
  // No standing explanation under the block: nothing to act on.
  expect(home).not.toContain('reads the whole context')
  // Plain sentences instead of raw totals.
  expect(home).toContain('Running 2 h 30 min, 4 messages from you')
  expect(home).toContain('Used 20% of the 5-hour limit and 4% of the weekly one')
  expect(home).toContain('One message on average: 5% of the 5-hour limit')
  expect(home).toContain('No compactions')
  expect(home).not.toContain('Read by the model')
})

test('the context tile compares the pace with past sessions', async ($, on) => {
  const rising = (from: number, step: number, turns: number) =>
    Array.from({ length: turns }, (_, i) => ({ tokens: from + i * step, turn: i + 1, cause: null }))
  const past = { startedAt: 0, requests: 9, read: 0, cached: 0, written: 0, points: rising(10_000, 1000, 8), compacts: [] }
  const logs: Record<string, unknown> = {
    'session:a': past,
    'session:b': past,
    'session:c': past,
    'session:test-session': { ...past, points: rising(5_000, 3000, 5) },
  }
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('store.get', (_$, e) => ({ value: logs[e.key] }) as never)
  on('store.keys', () => ({ value: Object.keys(logs) }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('store.delete', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(JSON.stringify(await ui.drawn())).toContain('🚀 context grows 3× faster than usual')
})

for (const button of ['hint-fill', 'hint-hide'] as const) {
  test(`the hint goes away after ${button}`, async ($, on) => {
    const bigBash = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(40_000) }] },
    ]
    const filled: string[] = []
    const categories = [
      { name: 'Skills', tokens: 1_000, color: 'warning', isDeferred: false, kind: 'used' },
      { name: 'Messages', tokens: 19_000, color: 'x', isDeferred: false, kind: 'used' },
      { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
    ]
    const bashHeavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
    on('session.usage', () => ({ value: bashHeavy }) as never)
    on('session.messages', () => ({ value: bigBash }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('settings.read', () => ({ value: { language: 'English' } }) as never)
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    on('session.id', () => ({ value: 'test-session' }) as never)
    on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: props as never,
    })
    expect(JSON.stringify(await ui.drawn())).toContain('Bash output took')
    await ui.press({ key: button })
    if (button === 'hint-fill') {
      expect(filled).toEqual(['From now on, run tests and go through long logs in a subagent, and bring back only the summary.'])
      // Put in the box is not done yet: the hint waits until the request is sent.
      expect(JSON.stringify(await ui.drawn())).toContain('Bash output took')
      await $.prompt.submit({ text: `fix the login ${filled[0]}` } as never)
    }
    expect(JSON.stringify(await ui.drawn())).not.toContain('Bash output took')
  })
}

test('the entry page puts its advice in the chat too', async ($, on) => {
  const filled: string[] = []
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('prompt.read', () => ({ value: { text: 'fix the login', cursor: 13 } }) as never)
  on('prompt.fill', (_$, e) => {
    filled.push(`${e.mode}:${e.text}`)
    return { isFilled: true }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  await ui.press({ key: 'group-tools' })
  await ui.press({ key: 'entry-result:Bash' })
  await ui.press({ key: 'entry-fill' })
  expect(filled).toEqual(['append: From now on, run tests and go through long logs in a subagent, and bring back only the summary.'])
  // Not sent yet: the button stays, so it can be put in again.
  expect(JSON.stringify(await ui.drawn())).toContain('"Put in chat"')
  await $.prompt.submit({ text: 'fix the login From now on, run tests and go through long logs in a subagent, and bring back only the summary.' } as never)
  // Sent: a quiet mark instead of the button.
  const after = JSON.stringify(await ui.drawn())
  expect(after).toContain('✓ Sent to Claude')
  expect(after).not.toContain('"Put in chat"')
})

test('running the advised command counts as done', async ($, on) => {
  const categories = [
    { name: 'MCP tools', tokens: 15_000, color: 'x', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 5_000, color: 'x', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
  ]
  const mcpHeavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
  on('session.usage', () => ({ value: mcpHeavy }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('command.run', () => ({ text: '' }))
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(JSON.stringify(await ui.drawn())).toContain('MCP tool schemas took')
  await $.command.run({ command: 'mcp', args: '' } as never)
  expect(JSON.stringify(await ui.drawn())).not.toContain('MCP tool schemas took')
})

for (const stored of [undefined, ['result:Bash']] as const) {
  test(`hide for the session, then for good (muted before: ${stored ? 'yes' : 'no'})`, async ($, on) => {
    const bigBash = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(40_000) }] },
    ]
    const categories = [
      { name: 'Skills', tokens: 1_000, color: 'warning', isDeferred: false, kind: 'used' },
      { name: 'Messages', tokens: 19_000, color: 'x', isDeferred: false, kind: 'used' },
      { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
    ]
    const bashHeavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
    const store: Record<string, unknown> = stored ? { muted: [...stored] } : {}
    on('session.usage', () => ({ value: bashHeavy }) as never)
    on('session.messages', () => ({ value: bigBash }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('settings.read', () => ({ value: { language: 'English' } }) as never)
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    on('session.id', () => ({ value: 'test-session' }) as never)
    on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
    on('store.keys', () => ({ value: Object.keys(store) }) as never)
    on('store.set', (_$, e) => {
      store[e.key] = e.value
      return { value: undefined } as never
    })
    on('store.delete', () => ({ value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
    await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: props as never,
    })
    const drawn = async () => JSON.stringify(await ui.drawn())
    const openEntry = async () => {
      await ui.press({ key: 'group-tools' })
      await ui.press({ key: 'entry-result:Bash' })
    }

    if (stored) {
      // Muted in an earlier session: gone from home, and no way back.
      expect(await drawn()).not.toContain('Bash output took')
      await openEntry()
      // Muted advice is gone from the entry page too: no "What to do" block at all.
      const entry = await drawn()
      expect(entry).toContain('What it is')
      expect(entry).not.toContain('What to do')
      expect(entry).not.toContain('subagent')
      return
    }

    expect(await drawn()).toContain('Bash output took')
    await openEntry()
    // Hidden for this session: the request button goes, "don't show again" comes.
    await ui.press({ key: 'entry-hide' })
    const hiddenNow = await drawn()
    // The advice itself goes; a mark stands in its place.
    expect(hiddenNow).toContain('✓ Advice hidden')
    expect(hiddenNow).not.toContain('subagent')
    expect(hiddenNow).not.toContain('"Put in chat"')
    expect(store.muted).toBe(undefined)
    await ui.press({ key: 'entry-mute' })
    expect(store.muted).toEqual(['result:Bash'])
    expect(await drawn()).not.toContain('What to do')
    await ui.press({ key: 'back' })
    await ui.press({ key: 'back' })
    expect(await drawn()).not.toContain('Bash output took')
  })
}

test('the 5-hour tile says how long the limit lasts at this pace', async ($, on) => {
  let now = Date.parse('2026-10-15T12:00:00')
  let percent = 50
  const store: Record<string, unknown> = {}
  const limited = () => ({
    ...usage,
    rateLimits: [
      { kind: 'five_hour', percentUsed: percent, resetsAt: '2026-10-15T16:00:00' },
      { kind: 'seven_day', percentUsed: 72, resetsAt: '2026-10-19T10:00:00' },
    ],
  })
  on('session.usage', () => ({ value: limited() }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: now }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e) => {
    store[e.key] = e.value
    return { value: undefined } as never
  })
  const measure = () =>
    $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  await measure()
  now += 30 * 60_000
  percent = 65
  await measure()
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(JSON.stringify(await ui.drawn())).toContain('about 1 h 10 min left')
})

test('the chart block keeps the chart, jumps and compactions, and nothing doubled', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  const home = JSON.stringify(await ui.drawn())
  expect(home).toContain('Context load chart')
  // No standing note under the prices: the numbers speak for themselves.
  expect(home).not.toContain('the cheaper the way')
  // Each price says how many times the action happened.
  expect(home).toMatch(/Bash command[^×]*×1/)
  // "Heaviest steps" was the same list as the jumps: one place for it now.
  expect(home).not.toContain('Heaviest steps')
  await ui.press({ key: 'block-dynamics' })
  // The pace line repeated the speed mark on the context tile.
  expect(JSON.stringify(await ui.drawn())).not.toContain('per turn on average')
})

test('hovering a jump in the list lights its column on the chart', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  for (const tokens of [20_000, 25_000, 70_000, 72_000])
    await $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  await ui.press({ key: 'block-dynamics' })
  const drawn = JSON.stringify(await ui.drawn())
  // The +45k jump: its list line and its column's cells share one hover group.
  const group = drawn.split('"scope":"peak-1"').length - 1
  expect(group).toBeGreaterThan(1)
  expect(drawn).toContain('+45k')
  // Both ways: in the terminal a Text nested in a Text lights with its group but cannot light it,
  // so every member sits straight in a Box, the chart's cells included.
  type Node = { type?: string; props?: unknown; children?: unknown[] }
  const parents: string[] = []
  const walk = (n: unknown, parent: string) => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    // Wherever the drawn tree keeps the hover scope, it is on the element itself, not its children.
    const { children: _children, ...own } = node
    if (JSON.stringify(own).includes('"scope":"peak-1"')) parents.push(parent)
    for (const c of node.children ?? []) walk(c, node.type ?? '')
  }
  walk(await ui.drawn(), '')
  expect(parents.length).toBeGreaterThan(1)
  expect(parents.every(p => p === 'Box')).toBe(true)
})

test('a limit whose reset time has passed shows as reset, not as the old percent', async ($, on) => {
  const stale = {
    ...usage,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 50, resetsAt: '2026-10-15T11:30:00' },
      { kind: 'seven_day', percentUsed: 72, resetsAt: '2026-10-19T10:00:00' },
    ],
  }
  on('session.usage', () => ({ value: stale }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  const home = JSON.stringify(await ui.drawn())
  expect(home).toContain('reset at 11:30')
  expect(home).not.toContain('resets 11:30')
})

test('after five idle minutes the panel says its data is stale, and the button refreshes it', async ($, on) => {
  let now = Date.parse('2026-10-15T12:00:00')
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: now }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  // The minute timer redraws the open panel; the test redraws it after moving the clock.
  const look = async () => {
    await ui.redraw()
    return JSON.stringify(await ui.drawn())
  }
  // Fresh: no line at all.
  expect(await look()).not.toContain('Data is stale')
  now = Date.parse('2026-10-15T12:04:00')
  expect(await look()).not.toContain('Data is stale')
  now = Date.parse('2026-10-15T12:07:00')
  expect(await look()).toContain('Data is stale, last updated at 12:00')
  await ui.press({ key: 'refresh' })
  expect(await look()).not.toContain('Data is stale')
})

test('the mod registers one command, /ctx', async ($, on) => {
  const names: string[] = []
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.keys', () => ({ value: [] }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('store.delete', () => ({ value: undefined }) as never)
  on('command.register', (_$, e) => {
    names.push(e.name)
    return { value: undefined } as never
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  expect(names).toEqual(['ctx'])
})

test('a jump opens to its whole text', async ($, on) => {
  const command = 'npm run build -- --filter @scope/a-very-long-package-name --verbose --log-level debug --reporter verbose --no-cache'
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('tool.check', () => ({ decision: 'allow' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'o'.repeat(400) } }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  await $.tool.call({ tool: 'Bash', command } as never)
  await $.session.measure({ context: { tokens: 70_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  await ui.press({ key: 'block-dynamics' })
  expect(JSON.stringify(await ui.drawn())).not.toContain(command)
  await ui.press({ key: 'jump-2' })
  // The whole text, wrapped over lines: its last word is there too.
  const open = JSON.stringify(await ui.drawn())
  expect(open).toContain('@scope/a-very-long-package-name')
  expect(open).toContain('--no-cache')
  // Split over lines, not one long line the pane cuts off.
  expect(open).not.toContain(command)
  await ui.press({ key: 'jump-2' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('--no-cache')
})

test('a jump with nothing more to show is not a button', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  for (const tokens of [20_000, 70_000])
    await $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  await ui.press({ key: 'block-dynamics' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('+50k')
  expect(drawn).not.toContain('jump-2')
})

test('a jump logged without its whole text opens to its label when the line cuts it', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  const long = 'Bash ' + 'word '.repeat(30).trim()
  const stored = {
    startedAt: 0, requests: 2, read: 0, cached: 0, written: 0, compacts: [], prompts: 0, limits: {},
    points: [
      { tokens: 20_000, turn: 1, cause: null },
      { tokens: 70_000, turn: 2, cause: long },
    ],
  }
  on('store.get', (_$, e) => ({ value: e.key === 'session:test-session' ? stored : undefined }) as never)
  on('store.keys', () => ({ value: ['session:test-session'] }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('store.delete', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  await ui.press({ key: 'block-dynamics' })
  const closed = JSON.stringify(await ui.drawn())
  await ui.press({ key: 'jump-2' })
  // The whole label, wrapped under the row: more is drawn than before.
  expect(JSON.stringify(await ui.drawn()).length).toBeGreaterThan(closed.length)
})

test('a narrow pane keeps whole names: prices in one column', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: { ...props, bodyColumns: 40 } as never,
  })
  expect(JSON.stringify(await ui.drawn())).toContain('Bash command')
})

test('the context bar and its legend light each other, and a bar piece opens its group', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  // Every member of the tool-work group sits straight in a Box, so it can light the others.
  type Node = { type?: string; children?: unknown[] }
  const parents: string[] = []
  const walk = (n: unknown, parent: string) => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    const { children: _children, ...own } = node
    if (JSON.stringify(own).includes('"scope":"group-tools"')) parents.push(parent)
    for (const c of node.children ?? []) walk(c, node.type ?? '')
  }
  walk(await ui.drawn(), '')
  expect(parents.length).toBeGreaterThan(1)
  expect(parents.every(p => p === 'Box')).toBe(true)
  await ui.press({ key: 'bar-tools' })
  expect(JSON.stringify(await ui.drawn())).toContain('TOOL WORK')
})

// What an element draws, as the terminal shows it: the strings under it, in order.
const shownText = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  return ((n as { children?: unknown[] }).children ?? []).map(shownText).join('')
}

// The lines an element draws: a column Box stacks its children, anything else is one line.
const drawnLines = (n: unknown): string[] => {
  if (n === null || n === undefined || typeof n === 'boolean') return []
  const el = n as { type?: string; props?: { flexDirection?: string }; children?: unknown[] }
  return el.type === 'Box' && el.props?.flexDirection === 'column' ? (el.children ?? []).flatMap(drawnLines) : [shownText(n)]
}

// Every element in hover group `scope` and the tag of the element it sits in.
const hoverParents = (tree: unknown, scope: string): string[] => {
  type Node = { type?: string; children?: unknown[] }
  const parents: string[] = []
  const walk = (n: unknown, parent: string) => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    const { children: _children, ...own } = node
    if (JSON.stringify(own).includes(`"scope":"${scope}"`)) parents.push(parent)
    for (const c of node.children ?? []) walk(c, node.type ?? '')
  }
  walk(tree, '')
  return parents
}

for (const bodyColumns of [40, 33]) {
  test(`group page rows fit a narrow pane (${bodyColumns} columns)`, async ($, on) => {
    on('session.usage', () => ({ value: usage }) as never)
    on('session.messages', () => ({ value: messages }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('settings.read', () => ({ value: { language: 'English' } }) as never)
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    on('session.id', () => ({ value: 'test-session' }) as never)
    await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: { ...props, bodyColumns } as never,
    })
    await ui.press({ key: 'group-tools' })
    const rows = (await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('row-'))
    expect(rows.length).toBeGreaterThan(0)
    // Two empty columns on each side: what is left is the room of each line a row draws.
    for (const row of rows) for (const line of drawnLines(row)) expect(line.length).toBeLessThanOrEqual(bodyColumns - 4)
  })
}

test('a very narrow pane still draws the tiles', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: { ...props, bodyColumns: 20 } as never,
  })
  const home = JSON.stringify(await ui.drawn())
  expect(home).not.toContain('RangeError')
  expect(home).toContain('2%')
})

test('"Put in chat" puts a command in place of the draft', async ($, on) => {
  const filled: string[] = []
  const categories = [
    { name: 'MCP tools', tokens: 15_000, color: 'x', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 5_000, color: 'x', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
  ]
  const mcpHeavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
  on('session.usage', () => ({ value: mcpHeavy }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('prompt.read', () => ({ value: { text: 'fix the login', cursor: 13 } }) as never)
  on('prompt.fill', (_$, e) => {
    filled.push(`${e.mode}:${e.text}`)
    return { isFilled: true }
  })
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  await ui.press({ key: 'hint-fill' })
  // "fix the login /mcp" would go to Claude as text; the command has to stand alone.
  expect(filled).toEqual(['replace:/mcp'])
})

for (const [resetsAt, why] of [
  ['2026-10-15T11:30:00', 'its window has passed'],
  ['2026-10-15T15:00:00', 'its window is older'],
] as const) {
  test(`a session leaves the shared 5-hour samples alone when ${why}`, async ($, on) => {
    const shared = { resetsAt: '2026-10-15T16:00:00', samples: [{ at: Date.parse('2026-10-15T11:50:00'), percent: 40 }] }
    const store: Record<string, unknown> = { 'limit:five_hour': shared }
    const idle = { ...usage, rateLimits: [{ kind: 'five_hour', percentUsed: 90, resetsAt }] }
    on('session.usage', () => ({ value: idle }) as never)
    on('session.messages', () => ({ value: messages }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('settings.read', () => ({ value: { language: 'English' } }) as never)
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    on('session.id', () => ({ value: 'test-session' }) as never)
    on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
    on('store.set', (_$, e) => {
      store[e.key] = e.value
      return { value: undefined } as never
    })
    await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    expect(store['limit:five_hour']).toEqual(shared)
  })
}

test('past the compaction threshold the context tile does not count turns', async ($, on) => {
  const near = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, isAutoCompactEnabled: true, autoCompactThreshold: 10_000 } } }
  on('session.usage', () => ({ value: near }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  for (const tokens of [20_000, 25_000])
    await $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(JSON.stringify(await ui.drawn())).not.toContain('turns left')
})

test('a failed first read at start still starts the minute clock', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T12:00:00') })
  let broken = true
  on('session.usage', () => ({ value: usage }) as never)
  // A transcript the panel cannot read: the first refresh throws.
  on('session.messages', () => ({ value: broken ? null : messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  mock.store(on)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  broken = false
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(JSON.stringify(await ui.drawn())).not.toContain('Data is stale')
  // No redraw by the test: only the minute clock brings the line.
  await clock.advance(7 * 60_000)
  expect(JSON.stringify(await ui.drawn())).toContain('Data is stale')
})

for (const reason of ['clear', 'resume'] as const) {
  test(`after ${reason === 'clear' ? '/clear' : 'a resume in the same process'} the panel follows the new session`, async ($, on) => {
    let id = 'first'
    const bigBash = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(40_000) }] },
    ]
    const categories = [
      { name: 'Skills', tokens: 1_000, color: 'warning', isDeferred: false, kind: 'used' },
      { name: 'Messages', tokens: 19_000, color: 'x', isDeferred: false, kind: 'used' },
      { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
    ]
    const bashHeavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
    const resumed = {
      startedAt: Date.parse('2026-10-15T08:00:00'), requests: 5, read: 0, cached: 0, written: 0, compacts: [], prompts: 7, limits: {},
      points: [{ tokens: 30_000, turn: 1, cause: null }],
    }
    const store: Record<string, unknown> = reason === 'resume' ? { 'session:other': resumed } : {}
    on('session.usage', () => ({ value: bashHeavy }) as never)
    on('session.messages', () => ({ value: bigBash }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('settings.read', () => ({ value: { language: 'English' } }) as never)
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    on('session.id', () => ({ value: id }) as never)
    on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
    on('store.keys', () => ({ value: Object.keys(store) }) as never)
    on('store.set', (_$, e) => {
      store[e.key] = e.value
      return { value: undefined } as never
    })
    on('store.delete', () => ({ value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
    const measure = () =>
      $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
    await $.prompt.submit({ text: 'hello' } as never)
    await measure()
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: props as never,
    })
    await ui.press({ key: 'hint-hide' })
    expect(JSON.stringify(await ui.drawn())).not.toContain('Bash output took')

    // The process goes on under another id, and no session.start fires.
    await $.session.end({ reason, sessionId: 'first', resume: { id: 'first' } } as never)
    id = reason === 'clear' ? 'second' : 'other'
    await measure()
    expect((store['session:first'] as SessionLog).prompts).toBe(1)
    // The new id gets its own log: a fresh one after /clear, the stored one after a resume.
    expect((store[`session:${id}`] as SessionLog).prompts).toBe(reason === 'clear' ? 0 : 7)
    // What was hidden belonged to the session before.
    expect(JSON.stringify(await ui.drawn())).toContain('Bash output took')
  })
}

test('advice sent in the first message after /clear counts for the new session', async ($, on) => {
  let id = 'first'
  const bigBash = [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(40_000) }] },
  ]
  const categories = [
    { name: 'Skills', tokens: 1_000, color: 'warning', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 19_000, color: 'x', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
  ]
  const bashHeavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
  on('session.usage', () => ({ value: bashHeavy }) as never)
  on('session.messages', () => ({ value: bigBash }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: id }) as never)
  mock.store(on)
  on('command.register', () => ({ value: undefined }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(JSON.stringify(await ui.drawn())).toContain('Bash output took')
  await $.session.end({ reason: 'clear', sessionId: 'first', resume: { id: 'first' } } as never)
  id = 'second'
  // Nothing measured yet: the message is the first thing the new session does.
  await $.prompt.submit({ text: 'From now on, run tests and go through long logs in a subagent, and bring back only the summary.' } as never)
  expect(JSON.stringify(await ui.drawn())).not.toContain('Bash output took')
})

test('a narrow pane cuts group names with an ellipsis', async ($, on) => {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: { ...props, bodyColumns: 20 } as never,
  })
  // "Skills and rules" doesn't fit a 16-cell pane even on a line of its own: it ends with an ellipsis.
  expect(JSON.stringify(await ui.drawn())).toMatch(/"Skills[^"]*…"/)
})

// ---- a narrow pane: rows that hold a name and figures stack into two lines ----

// The English pane at `bodyColumns`, after `before` ran and the context was measured at each of `tokens`.
async function mountAt(
  [$, on]: Parameters<TestBody>,
  bodyColumns: number,
  tokens: readonly number[] = [20_000],
  before?: () => Promise<unknown>,
) {
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  await before?.()
  for (const t of tokens)
    await $.session.measure({ context: { tokens: t, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  return $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: { ...props, bodyColumns } as never,
  })
}

test('a narrow pane stacks the tiles: title and percent, a full-width meter, then the lines', async (...env) => {
  const ui = await mountAt(env, 40, [20_000, 25_000])
  const lines = drawnLines(await ui.drawn())
  expect(lines).toContain('CONTEXT  3%')
  const from = lines.indexOf('CONTEXT  3%')
  // 36 cells of content: each meter takes all of them.
  expect(lines.slice(from, from + 11)).toEqual([
    'CONTEXT  3%',
    '▆' + '·'.repeat(35),
    '25k of 1M · about 195 turns left',
    ' ',
    '5-HOUR LIMIT  5%',
    '▆'.repeat(2) + '·'.repeat(34),
    'resets 19:00',
    ' ',
    'WEEKLY LIMIT  72%',
    '▆'.repeat(26) + '·'.repeat(10),
    'resets 19.10 10:00',
  ])
  // The percent keeps its level color; the title stays bold and dim.
  const percent = await ui.find({ type: 'Text', text: /^ {2}72%$/ })
  expect(percent?.props).toMatchObject({ bold: true, color: 'warning' })
  expect((await ui.find({ type: 'Text', text: /^WEEKLY LIMIT$/ }))?.props).toMatchObject({ bold: true, dimColor: true })
})

test('a narrow pane puts each legend row on two lines and keeps its hover group', async (...env) => {
  const ui = await mountAt(env, 40)
  const tree = await ui.drawn()
  const lines = drawnLines(tree)
  expect(lines).toContain('■ Tool work ▸')
  const at = lines.indexOf('■ Tool work ▸')
  expect(lines[at + 1]).toMatch(/^ {2}\S+ · \d+%$/)
  // Every lit element sits straight in a Box, so pointing at either line lights the bar piece too.
  const parents = hoverParents(tree, 'group-tools')
  expect(parents.length).toBeGreaterThan(3)
  expect(parents.every(p => p === 'Box')).toBe(true)
  await ui.press({ key: 'group-tools' })
  expect(JSON.stringify(await ui.drawn())).toContain('TOOL WORK')
})

test('a narrow pane puts each group page row on two lines, the bar after the figures', async (...env) => {
  const ui = await mountAt(env, 40)
  await ui.press({ key: 'group-tools' })
  const row = (await ui.findAll({ type: 'Box' })).find(b => b.key === 'row-result:Bash')
  const [name, figures, ...rest] = drawnLines(row)
  expect(name).toBe('Bash output ▸')
  expect(figures).toMatch(/^ {2}\S+ · \d+% {2}▆+ *$/)
  expect(figures!.length).toBeLessThanOrEqual(36)
  expect(rest).toEqual([])
  await ui.press({ key: 'entry-result:Bash' })
  expect(JSON.stringify(await ui.drawn())).toContain('What it is')
})

test('a narrow pane moves a title\'s figure under it when both don\'t fit', async (...env) => {
  const [$, on] = env
  const stored = {
    startedAt: Date.parse('2026-10-15T09:30:00'), requests: 3, read: 0, cached: 0, written: 0, points: [], compacts: [], prompts: 4, limits: {},
  }
  on('store.get', () => ({ value: stored }) as never)
  on('store.keys', () => ({ value: ['session:test-session'] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('store.delete', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  // 24 cells: "WHAT FILLS THE CONTEXT" and "THIS SESSION  since 09:30" don't fit with their figures.
  const ui = await mountAt(env, 28, [20_000], () => $.session.start({ cwd: '/tmp', surface: 'terminal' } as never))
  const lines = drawnLines(await ui.drawn())
  expect(lines).toContain('WHAT FILLS THE CONTEXT')
  const fills = lines.indexOf('WHAT FILLS THE CONTEXT')
  expect(lines[fills + 1]).toBe('  20k')
  expect(lines).toContain('THIS SESSION')
  const since = lines.indexOf('THIS SESSION')
  expect(lines[since + 1]).toBe('  since 09:30')
  expect((await ui.find({ type: 'Text', text: '  since 09:30' }))?.props).toMatchObject({ dimColor: true })
})

test('a narrow pane puts each jump on two lines, and a jump with more to read still opens', async (...env) => {
  const [$, on] = env
  const command = 'npm run build -- --filter @scope/a-very-long-package-name --verbose --log-level debug --reporter verbose --no-cache'
  on('tool.check', () => ({ decision: 'allow' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'o'.repeat(400) } }) as never)
  const measure = (tokens: number) =>
    $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await mountAt(env, 40, [], async () => {
    await measure(20_000)
    await $.tool.call({ tool: 'Bash', command } as never)
    await measure(70_000)
  })
  await ui.press({ key: 'block-dynamics' })
  const tree = await ui.drawn()
  const lines = drawnLines(tree)
  expect(lines).toContain('+50k  turn 2 ▸')
  const at = lines.indexOf('+50k  turn 2 ▸')
  expect(lines[at + 1]).toBe('  Bash npm run')
  // Both lines light the jump's column.
  const parents = hoverParents(tree, 'peak-1')
  expect(parents.length).toBeGreaterThan(2)
  expect(parents.every(p => p === 'Box')).toBe(true)
  await ui.press({ key: 'jump-2' })
  const open = drawnLines(await ui.drawn())
  expect(open).toContain('+50k  turn 2 ▾')
  expect(open.join('\n')).toContain('--no-cache')
  // The chart block is indented 2: its lines have 34 of the 36 cells.
  for (const line of open.slice(open.indexOf('+50k  turn 2 ▾'))) expect(line.length).toBeLessThanOrEqual(34)
  await ui.press({ key: 'jump-2' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('--no-cache')
})

test('a narrow pane cuts a long jump caption to its own line', async (...env) => {
  const [$, on] = env
  const long = 'Bash ' + 'word '.repeat(30).trim()
  const stored = {
    startedAt: 0, requests: 2, read: 0, cached: 0, written: 0, compacts: [], prompts: 0, limits: {},
    points: [
      { tokens: 20_000, turn: 1, cause: null },
      { tokens: 70_000, turn: 2, cause: long },
    ],
  }
  on('store.get', (_$, e) => ({ value: e.key === 'session:test-session' ? stored : undefined }) as never)
  on('store.keys', () => ({ value: ['session:test-session'] }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('store.delete', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  const ui = await mountAt(env, 40, [], () => $.session.start({ cwd: '/tmp', surface: 'terminal' } as never))
  await ui.press({ key: 'block-dynamics' })
  const lines = drawnLines(await ui.drawn())
  expect(lines).toContain('+50k  turn 2 ▸')
  const at = lines.indexOf('+50k  turn 2 ▸')
  // The chart block is indented 2: the caption line, its own indent included, has 34 cells.
  expect(lines[at + 1]).toBe(`  ${long.slice(0, 31)}…`)
})

test('a wide pane keeps the one-row legend', async (...env) => {
  const ui = await mountAt(env, 72)
  const row = (await ui.findAll({ type: 'Box' })).find(b => b.key === 'row-tools')
  expect(row?.props.flexDirection).toBe('row')
  expect(drawnLines(row)).toEqual([expect.stringMatching(/^■ Tool work +\S+ +\d+% {2}▸$/)])
  // The three tiles still share a row.
  expect(drawnLines(await ui.drawn())).toContainEqual(expect.stringMatching(/^CONTEXT +5-HOUR LIMIT +WEEKLY LIMIT/))
})

// ---- the desktop draws a proportional face: every Text asks for the monospaced one ----

test('on the desktop every Text is monospaced and no Button label is a bare string', async ($, on) => {
  const command = 'npm run build -- --filter @scope/a-very-long-package-name --verbose --no-cache'
  on('session.usage', () => ({ value: usage }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  on('tool.check', () => ({ decision: 'allow' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'o'.repeat(400) } }) as never)
  const measure = (tokens: number) =>
    $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  await measure(20_000)
  await measure(25_000)
  await $.tool.call({ tool: 'Bash', command } as never)
  await measure(70_000)
  // Every Text in the tree that isn't monospaced, and every string a Button holds outside a Text.
  const check = (tree: unknown) => {
    type Node = { type?: string; props?: { mono?: boolean }; children?: unknown[] }
    const plain: string[] = []
    const bare: string[] = []
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return
      const node = n as Node
      if (node.type === 'Text' && node.props?.mono !== true) plain.push(shownText(node))
      if (node.type === 'Button') for (const c of node.children ?? []) if (typeof c === 'string') bare.push(c)
      for (const c of node.children ?? []) walk(c)
    }
    walk(tree)
    return { plain, bare }
  }
  for (const bodyColumns of [72, 40]) {
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: { ...props, bodyColumns } as never,
    })
    const pages: unknown[] = [await ui.drawn()]
    await ui.press({ key: 'block-dynamics' })
    await ui.press({ key: 'jump-3' })
    pages.push(await ui.drawn())
    await ui.press({ key: 'group-tools' })
    pages.push(await ui.drawn())
    await ui.press({ key: 'entry-result:Bash' })
    pages.push(await ui.drawn())
    expect(JSON.stringify(pages)).toContain('--no-cache')
    for (const page of pages) expect(check(page)).toEqual({ plain: [], bare: [] })
    // Back home with the chart folded, for the next width.
    await ui.press({ key: 'back' })
    await ui.press({ key: 'back' })
    await ui.press({ key: 'jump-3' })
    await ui.press({ key: 'block-dynamics' })
    await ui.unmount()
  }
})

test('a pane with no data yet is monospaced on the desktop too', async ($, on) => {
  on('clock.now', () => ({ value: 0 }) as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  expect(await ui.drawn()).toMatchObject({ type: 'Text', props: { mono: true } })
})
