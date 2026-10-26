import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { SessionLog } from '../types'
import { AGENT_A, AGENT_B, META_A, META_B } from './subagents.fixture'

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

      // The desktop sets titles in sentence case, as its own panels do; the terminal in capitals.
      const cased = (title: string) => (surface === 'terminal' ? title : title[0] + title.slice(1).toLowerCase())
      const home = await drawn()
      expect(home).toContain(cased(w.week))
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
      expect(await drawn()).toContain(cased(w.groupTitle))
      await ui.press({ key: 'back' })
      expect(await drawn()).toContain(cased(w.home))
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
  // Two points: the chart has a rise to draw.
  await $.session.measure({ context: { tokens: 25_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
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

// ---- the desktop: its own layout in the host's font, columns as Boxes, graphics as Svg ----

type DNode = { type?: string; props?: Record<string, unknown>; hover?: { scope?: string }; children?: unknown[] }

// Every element of a drawn tree with its parent, depth first.
const elements = (tree: unknown): { node: DNode; parent: DNode | null }[] => {
  const out: { node: DNode; parent: DNode | null }[] = []
  const walk = (n: unknown, parent: DNode | null) => {
    if (!n || typeof n !== 'object') return
    const node = n as DNode
    out.push({ node, parent })
    for (const c of node.children ?? []) walk(c, node)
  }
  walk(tree, null)
  return out
}
// Every string drawn, as it sits in the tree.
const strings = (tree: unknown): string[] => {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') out.push(n)
    else if (n && typeof n === 'object') for (const c of (n as DNode).children ?? []) walk(c)
  }
  walk(tree)
  return out
}

// The English desktop pane at `bodyColumns`, after three turns and a long Bash call; `pages` walks it:
// home, home with the chart and a jump open, the tool group, the Bash entry. With `hint`, Bash output
// fills most of the context, so the panel has advice to give.
async function desktopAt([$, on]: Parameters<TestBody>, bodyColumns: number, hint = false) {
  const categories = [
    { name: 'Skills', tokens: 1_000, color: 'warning', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 19_000, color: 'x', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 980_000, color: 'x', isDeferred: false, kind: 'free' },
  ]
  const heavy = { ...usage, context: { ...usage.context, breakdown: { ...usage.context.breakdown, categories } } }
  const bigBash = [messages[0], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(40_000) }] }]
  on('session.usage', () => ({ value: hint ? heavy : usage }) as never)
  on('session.messages', () => ({ value: hint ? bigBash : messages }) as never)
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
  await $.tool.call({ tool: 'Bash', command: 'npm run build -- --filter @scope/a-very-long-package-name --verbose --no-cache' } as never)
  await measure(70_000)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: { ...props, bodyColumns } as never,
  })
  const pages = async () => {
    const home = await ui.drawn()
    await ui.press({ key: 'block-dynamics' })
    await ui.press({ key: 'jump-3' })
    const chart = await ui.drawn()
    await ui.press({ key: 'group-tools' })
    const group = await ui.drawn()
    await ui.press({ key: 'entry-result:Bash' })
    const entry = await ui.drawn()
    return { home, chart, group, entry }
  }
  return { ui, pages }
}

// A figure in a table: tokens, a share, a delta, a count.
const FIGURE = /^[+−-]?\d[\d.,]*[kM]?%?$|^×\d+$/

for (const bodyColumns of [72, 40]) {
  for (const hint of [false, true])
  test(`desktop: the host's font, no space-padded columns, no empty rows (${bodyColumns} columns${hint ? ', with a hint' : ''})`, async (...env) => {
    const { pages } = await desktopAt(env, bodyColumns, hint)
    const all = await pages()
    // The opened jump shows the whole command; with advice to give, home shows the hint.
    expect(JSON.stringify(all.chart)).toContain('--no-cache')
    if (hint) expect(JSON.stringify(all.home)).toContain('hint-fill')
    for (const page of Object.values(all)) {
      const els = elements(page)
      // No Text asks for the monospaced face.
      expect(els.filter(e => e.node.type === 'Text' && e.node.props?.mono !== undefined).length).toBe(0)
      // A Button's label is a Text, never a bare string.
      expect(els.filter(e => e.node.type === 'Button' && (e.node.children ?? []).some(c => typeof c === 'string')).length).toBe(0)
      // Columns are Boxes and gaps are spacing: no run of spaces, no padding at a string's ends, no blank line.
      const padded = strings(page).filter(t => /\s{2,}|^\s|\s$/.test(t))
      expect(padded).toEqual([])
      // No block glyphs: meters, bars and the chart are Svg.
      expect(strings(page).filter(t => /[▁▂▃▄▅▆▇█·]{2,}/.test(t))).toEqual([])
    }
  })

  test(`desktop: every figure in a table is tabular, right-aligned in a fixed-width Box (${bodyColumns} columns)`, async (...env) => {
    const { pages } = await desktopAt(env, bodyColumns)
    const all = await pages()
    for (const page of Object.values(all)) {
      const figures = elements(page).filter(e => e.node.type === 'Text' && FIGURE.test(strings(e.node).join('')))
      expect(figures.length).toBeGreaterThan(0)
      for (const { node, parent } of figures) {
        expect(node.props?.tabular).toBe(true)
        // The tiles' big percent stands alone; every other figure sits in a column.
        if (node.props?.size === 'title') continue
        expect(parent?.type).toBe('Box')
        expect(typeof parent?.props?.width).toBe('number')
        expect([parent?.props?.justifyContent, parent?.props?.alignItems]).toContain('flex-end')
      }
    }
    // The tables hold their figures: what fills the context, action costs, the jumps, the group's entries.
    const shown = (page: unknown) => elements(page).filter(e => e.node.type === 'Text' && FIGURE.test(strings(e.node).join(''))).map(e => strings(e.node).join(''))
    expect(shown(all.home)).toEqual(expect.arrayContaining(['10k', '50%', '×1']))
    expect(shown(all.chart)).toEqual(expect.arrayContaining(['+45k']))
    expect(shown(all.group).length).toBeGreaterThanOrEqual(2)
  })

  test(`desktop: tiles are cards with a big percent and an Svg meter (${bodyColumns} columns)`, async (...env) => {
    const { ui } = await desktopAt(env, bodyColumns)
    const home = await ui.drawn()
    const els = elements(home)
    const cards = els.filter(e => e.node.type === 'Box' && e.node.props?.borderStyle !== undefined)
    expect(cards.length).toBe(3)
    // Side by side when there is room, one under another when the pane is narrow.
    const row = cards[0]!.parent
    expect(cards.every(c => c.parent === row)).toBe(true)
    expect(row?.props?.flexDirection).toBe(bodyColumns >= 52 ? 'row' : 'column')
    for (const card of cards) {
      const inside = elements(card.node)
      const big = inside.filter(e => e.node.type === 'Text' && e.node.props?.size === 'title')
      expect(big.length).toBe(1)
      expect(strings(big[0]!.node).join('')).toMatch(/^\d+%$/)
      expect(inside.filter(e => e.node.type === 'Svg').length).toBe(1)
    }
    // Titles in sentence case, not in capitals.
    const text = JSON.stringify(home)
    expect(text).toContain('"Context"')
    expect(text).toContain('5-hour limit')
    expect(text).not.toContain('WHAT FILLS')
    expect(text).toContain('What fills the context')
  })

  test(`desktop: the graphics are Svg sized in pixels, the chart bounded in height (${bodyColumns} columns)`, async (...env) => {
    const { pages } = await desktopAt(env, bodyColumns)
    const all = await pages()
    const svgs = (page: unknown) => elements(page).filter(e => e.node.type === 'Svg')
    for (const page of Object.values(all))
      for (const { node, parent } of svgs(page)) {
        expect(String(node.props?.source).length).toBeLessThanOrEqual(131_072)
        expect(String(node.props?.alt).length).toBeGreaterThan(0)
        // Drawn with no width, so it fills its slot; the height in pixels, never in cells.
        expect(node.props?.width).toBeUndefined()
        expect(typeof node.props?.height).toBe('number')
        expect(parent?.props?.height).toBeUndefined()
      }
    // Three meters, then the stacked bar: one piece per group in use, each lighting with its row.
    const home = svgs(all.home)
    expect(home.length).toBe(5)
    const pieces = home.slice(3)
    expect(pieces.map(p => p.parent?.hover?.scope)).toEqual(['group-tools', 'group-rules'])
    expect(pieces.every(p => /%$/.test(String(p.parent?.props?.width)))).toBe(true)
    // The chart is drawn in Boxes, not Svg: a lit column must take the lit color whole, and an Svg
    // can't be restyled by a hover, only the Box behind it.
    expect(svgs(all.chart).length).toBe(5)
    const els = elements(all.chart)
    // A column is a colored Box whose height is its share of the biggest rise, in a box of fixed rows.
    const columns = els.filter(e => e.node.type === 'Box' && e.node.props?.backgroundColor === '#5769f7')
    expect(columns.length).toBe(2)
    for (const c of columns) {
      expect(String(c.node.props?.height)).toMatch(/^\d+%$/)
      expect(c.node.children ?? []).toEqual([])
    }
    const plot = columns[0]!.parent && els.find(e => e.node === columns[0]!.parent)?.parent
    expect(typeof plot?.props?.height).toBe('number')
    expect(Number(plot?.props?.height)).toBeGreaterThanOrEqual(3)
    expect(Number(plot?.props?.height)).toBeLessThanOrEqual(8)
    // The biggest jump's column lights itself in the accent; its row in the list lights with it.
    const peak = columns.find(c => c.node.hover?.scope === 'peak-1')
    expect(peak?.node.hover).toEqual({ scope: 'peak-1', backgroundColor: 'claude' })
    expect(peak?.node.props?.height).toBe('100%')
    expect(els.some(e => e.node.type === 'Text' && e.node.hover?.scope === 'peak-1')).toBe(true)
    // The group page draws a bar per entry only where there is room.
    expect(svgs(all.group).length).toBe(bodyColumns >= 52 ? 2 : 0)
  })

  test(`desktop: rows, hint, back link (${bodyColumns} columns)`, async (...env) => {
    const { ui, pages } = await desktopAt(env, bodyColumns, true)
    const home = await ui.drawn()
    const els = elements(home)
    // A legend row: the dot, the name that opens the group, the figures, all in one hover group.
    const lit = els.filter(e => e.node.type === 'Text' && e.node.hover?.scope === 'group-tools')
    expect(lit.length).toBeGreaterThanOrEqual(3)
    const name = els.find(e => e.node.type === 'Button' && e.node.props?.key === 'group-tools')
    expect(name?.parent?.props?.flexGrow).toBe(1)
    // The hint: the arrow on the first line, then the text, then both buttons; "Hide advice", as on
    // the entry page.
    const fill = els.find(e => e.node.type === 'Button' && e.node.props?.key === 'hint-fill')
    const hideHint = els.find(e => e.node.type === 'Button' && e.node.props?.key === 'hint-hide')
    expect(hideHint?.node.props?.label).toBe('Hide advice')
    const hint = els.find(e => e.node.type === 'Box' && e.node.props?.alignItems === 'flex-start' && elements(e.node).some(x => x.node === fill?.node))
    expect(hint).toBeDefined()
    expect(strings((hint!.node.children ?? [])[0]).join('')).toBe('→')
    // Sections are spaced by the root's gap, not by empty lines; the page padding is `md` all round.
    expect((home as DNode).props?.gap).toBeDefined()
    // The figure columns of "What fills the context" and "Action costs" share their right edge:
    // from the right, a mark cell, then the share or count, then tokens or average.
    const tail = (row: DNode) => (row.children as DNode[]).slice(-3).map(c => c.props?.width)
    const groupRow = els.find(e => e.node.props?.key === 'row-tools')!.node
    const priceRow = els.find(e => e.node.type === 'Box' && e.node.props?.flexDirection === 'row' && strings(e.node).includes('Bash command'))!.node
    expect(tail(priceRow)).toEqual(tail(groupRow))
    const all = await pages()
    for (const page of Object.values(all)) expect((page as DNode).props?.padding).toBe('md')
    // On the group and entry pages the back link is a line of its own, first.
    for (const page of [all.group, all.entry]) {
      const first = ((page as DNode).children ?? [])[0] as DNode
      const back = first.type === 'Button' ? first : (first.children ?? [])[0] as DNode
      expect(back.props?.key).toBe('back')
      expect(first.type === 'Button' || (first.children ?? []).length === 1).toBe(true)
    }
  })
}

test('desktop: a pane with no data yet sits inside the page padding', async ($, on) => {
  on('clock.now', () => ({ value: 0 }) as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  const drawn = (await ui.drawn()) as DNode
  expect(drawn.type).toBe('Box')
  expect(drawn.props?.padding).toBe('md')
  expect(strings(drawn).join('')).toBe('No data until the first reply.')
})

// A press that changes the page removes the Button that held the focus. On the desktop the ring is
// handed to the new page's first stop, so the pane keeps the keyboard and the next click presses.
// The test engine has no focus ring (its `ui.focus` is unimplemented), so the asks are read off the
// debug log, where the mod says what came of each.
const focusAsks = (on: Parameters<TestBody>[1]) => {
  const asked: string[] = []
  on('ui.log', (_$, e) => {
    const m = /focus to (\S+):/.exec(e.text)
    if (m && e.to === 'debug') asked.push(m[1]!)
    return { value: undefined } as never
  })
  return asked
}

test('desktop: a press that changes the page puts the ring on the new page', async (...env) => {
  const asked = focusAsks(env[1])
  const { ui } = await desktopAt(env, 72)
  await ui.press({ key: 'group-tools' })
  await ui.press({ key: 'entry-result:Bash' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'back' })
  expect(asked).toEqual(['back', 'back', 'entry-result:Bash', 'group-tools'])
})

test('terminal: a press that changes the page leaves the ring to the engine, as before', async (...env) => {
  const asked = focusAsks(env[1])
  const ui = await mountAt(env, 72)
  await ui.press({ key: 'group-tools' })
  await ui.press({ key: 'back' })
  expect(asked).toEqual([])
})

// The 5-hour and weekly figures come with model replies; a reading without them (an idle refresh)
// must not drop the cards while the session block still shows what was spent.
test('desktop: the limit cards stay when a later reading brings no limits', async ($, on) => {
  let rateLimits = usage.rateLimits
  on('session.usage', () => ({ value: { ...usage, rateLimits } }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
  on('session.id', () => ({ value: 'test-session' }) as never)
  const measure = (tokens: number) =>
    $.session.measure({ context: { tokens, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  await measure(20_000)
  rateLimits = []
  await measure(25_000)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  const home = await ui.drawn()
  expect(elements(home).filter(e => e.node.type === 'Box' && e.node.props?.borderStyle !== undefined).length).toBe(3)
  const text = strings(home)
  expect(text).toContain('5-hour limit')
  expect(text).toContain('72%')
})

// A name longer than its column: it is cut there, and its column can shrink, so the figures stay put.
for (const bodyColumns of [72, 40])
  test(`desktop: a long name stays in its column on the group page (${bodyColumns} columns)`, async ($, on) => {
    const tool = 'mcp__a-very-long-server-name-that-keeps-going-and-going-and-going__search'
    const mcp = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'm1', name: tool, input: { query: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'm1', content: 'o'.repeat(4000) }] },
    ]
    on('session.usage', () => ({ value: usage }) as never)
    on('session.messages', () => ({ value: mcp }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('settings.read', () => ({ value: { language: 'English' } }) as never)
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    on('session.id', () => ({ value: 'test-session' }) as never)
    await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    const ui = await $.ui.mount({
      plugin: 'chudarin-context-mod',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'chudarin-context-mod',
      props: { ...props, bodyColumns } as never,
    })
    await ui.press({ key: 'group-tools' })
    const els = elements(await ui.drawn())
    const full = 'MCP a-very-long-server-name-that-keeps-going-and-going-and-going replies'
    const button = els.find(e => e.node.type === 'Button' && e.node.props?.label === full)
    expect(button).toBeDefined()
    // The name's Box may shrink below its text and clips what overflows.
    expect(button!.parent?.props?.minWidth).toBe(0)
    expect(button!.parent?.props?.overflow).toBe('hidden')
    // What is drawn fits the name column (the row less the figures, the bar, the mark and the gaps).
    const shown = strings(button!.node).join('')
    expect(shown.endsWith('…')).toBe(true)
    expect(shown.length).toBeLessThanOrEqual(bodyColumns - 4 - 6 - 5 - 1 - 4 - (bodyColumns >= 52 ? 11 : 0))
  })

// ---- desktop: actions look like actions ----

// The Buttons of a drawn tree by key: their props.
const buttons = (tree: unknown) =>
  Object.fromEntries(elements(tree).filter(e => e.node.type === 'Button').map(e => [String(e.node.props?.key), e.node.props ?? {}]))

test('desktop: "Put in chat" is the one primary action, hiding is a secondary button, back is a dim link', async (...env) => {
  const { ui } = await desktopAt(env, 72, true)
  // Home: the hint's two actions are buttons with chrome; one primary on the screen.
  const home = buttons(await ui.drawn())
  expect(home['hint-fill']).toMatchObject({ variant: 'primary', label: 'Put in chat' })
  expect(home['hint-fill']!.plain).toBeUndefined()
  expect(home['hint-hide']).toMatchObject({ variant: 'secondary', label: 'Hide advice' })
  expect(home['hint-hide']!.plain).toBeUndefined()
  expect(Object.values(home).filter(b => b.variant === 'primary').length).toBe(1)
  // Rows that open a page stay link-like.
  expect(home['group-tools']!.plain).toBe(true)
  // The entry page: the same two, then "Don't show again" as a secondary button once hidden.
  await ui.press({ key: 'group-tools' })
  const group = buttons(await ui.drawn())
  expect(group['back']).toMatchObject({ plain: true, dimColor: true, label: '← Back' })
  await ui.press({ key: 'entry-result:Bash' })
  const entry = buttons(await ui.drawn())
  expect(entry['entry-fill']).toMatchObject({ variant: 'primary' })
  expect(entry['entry-hide']).toMatchObject({ variant: 'secondary', label: 'Hide advice' })
  expect(entry['entry-fill']!.plain).toBeUndefined()
  expect(entry['entry-hide']!.plain).toBeUndefined()
  expect(entry['back']).toMatchObject({ plain: true, dimColor: true })
  expect(Object.values(entry).filter(b => b.variant === 'primary').length).toBe(1)
  await ui.press({ key: 'entry-hide' })
  const hidden = buttons(await ui.drawn())
  expect(hidden['entry-mute']).toMatchObject({ variant: 'secondary', label: "Don't show again" })
  expect(hidden['entry-mute']!.plain).toBeUndefined()
})

test('desktop: "Refresh" on stale data is a secondary button', async ($, on) => {
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
    surface: 'desktop',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: props as never,
  })
  now = Date.parse('2026-10-15T12:07:00')
  await ui.redraw()
  const refresh = buttons(await ui.drawn()).refresh
  expect(refresh).toMatchObject({ variant: 'secondary', label: 'Refresh' })
  expect(refresh!.plain).toBeUndefined()
})

// ---- what a session starts with: account-wide limits, its own log, a chart only with two points ----

// A session started at `now`, launched at `launch` (a resumed conversation's first launch), with the
// store holding `stored` and no limit reading yet: what the engine has right after a restart.
async function startAt(
  [$, on]: Parameters<TestBody>,
  opts: { id?: string; launch?: number; stored?: Record<string, unknown>; rateLimits?: unknown[]; tokens?: number } = {},
) {
  const now = Date.parse('2026-10-17T19:20:00')
  mock.clock(on, { now })
  const reading = { ...usage, startedAt: opts.launch ?? now, rateLimits: opts.rateLimits ?? [] }
  on('session.usage', () => ({ value: { ...reading, context: { ...reading.context, tokens: opts.tokens ?? 711_000 } } }) as never)
  on('session.messages', () => ({ value: messages }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: { language: 'English' } }) as never)
  on('session.id', () => ({ value: opts.id ?? 'new' }) as never)
  // The store as a record the test reads; its keys keep insertion order, as the engine's do.
  const store: Record<string, unknown> = { ...(opts.stored ?? {}) }
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }) as never)
  on('store.set', (_$, e) => {
    store[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    delete store[e.key]
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true } as never)
  const mount = (surface: 'desktop' | 'terminal') =>
    $.ui.mount({ plugin: 'chudarin-context-mod', surface, component: 'Pane', requestId: 'chudarin-context-mod', props: props as never })
  return { mount, store }
}

const LAST_LIMITS = {
  five_hour: { percentUsed: 5, resetsAt: '2026-10-17T20:50:00' },
  seven_day: { percentUsed: 72, resetsAt: '2026-10-19T10:00:00' },
}

for (const surface of ['desktop', 'terminal'] as const)
  test(`limits are account-wide: right after start the last stored figures show (${surface})`, async (...env) => {
    const { mount } = await startAt(env, { stored: { 'limits:last': LAST_LIMITS } })
    const text = JSON.stringify(await (await mount(surface)).drawn())
    expect(text).toContain(surface === 'desktop' ? '5-hour limit' : '5-HOUR LIMIT')
    expect(text).toContain('72%')
  })

test('a reading with limits stores them for every later session', async (...env) => {
  const { store } = await startAt(env, { rateLimits: usage.rateLimits })
  expect(store['limits:last']).toEqual({
    five_hour: { percentUsed: 5, resetsAt: '2026-10-15T19:00:00' },
    seven_day: { percentUsed: 72, resetsAt: '2026-10-19T10:00:00' },
  })
})

const LAUNCH = Date.parse('2026-10-15T17:09:00')
const OLD_LOG = {
  startedAt: LAUNCH + 20_000, requests: 595, read: 0, cached: 0, written: 0, compacts: [], prompts: 72, limits: {},
  points: [{ tokens: 611_000, turn: 1, cause: null }, { tokens: 702_000, turn: 263, cause: null }],
}

test('a conversation resumed under a new session id picks up its own log', async (...env) => {
  const { mount, store } = await startAt(env, { id: 'new', launch: LAUNCH, stored: { 'session:old': OLD_LOG } })
  const text = JSON.stringify(await (await mount('desktop')).drawn())
  expect(text).toContain('This session')
  expect((store['session:new'] as SessionLog).prompts).toBe(72)
})

test('a fresh session does not take the log of another that started a moment before', async (...env) => {
  const now = Date.parse('2026-10-17T19:20:00')
  const other = { ...OLD_LOG, startedAt: now - 20_000 }
  const { store } = await startAt(env, { id: 'new', stored: { 'session:other': other } })
  expect((store['session:new'] as SessionLog).prompts).toBe(0)
})

test('a resumed conversation is not pruned at its own start, however many sessions came after it', async (...env) => {
  const stored: Record<string, unknown> = { 'session:mine': OLD_LOG }
  for (let i = 0; i < 30; i++) stored[`session:s${i}`] = { ...OLD_LOG, startedAt: LAUNCH + 86_400_000 + i * 60_000 }
  const { store } = await startAt(env, { id: 'mine', launch: LAUNCH, stored })
  const keys = Object.keys(store)
  expect(keys).toContain('session:mine')
  expect(keys.filter(k => k.startsWith('session:')).length).toBe(30)
})

for (const surface of ['desktop', 'terminal'] as const)
  test(`the chart and its fold wait for two points (${surface})`, async (...env) => {
    const [$] = env
    const { mount } = await startAt(env)
    const ui = await mount(surface)
    // One point (the context at start): nothing to chart, no fold.
    expect(JSON.stringify(await ui.drawn())).not.toContain('block-dynamics')
    await $.session.measure({ context: { tokens: 720_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    expect(JSON.stringify(await ui.drawn())).toContain('block-dynamics')
  })

// The session's transcript is /p/s1.jsonl; its subagents' lie in /p/s1/subagents.
const AGENTS_DIR = '/p/s1/subagents'
const AGENT_TEXT: Record<string, string> = { [`${AGENTS_DIR}/agent-a.jsonl`]: AGENT_A, [`${AGENTS_DIR}/agent-b.jsonl`]: AGENT_B }
const AGENT_META: Record<string, string> = { [`${AGENTS_DIR}/agent-a.meta.json`]: META_A, [`${AGENTS_DIR}/agent-b.meta.json`]: META_B }

// The two agents' files as the engine would hand them over; `touchA` makes agent a's file newer.
function stubAgents(on: Parameters<TestBody>[1]) {
  let mtimeA = 1
  const file = (name: string, kind: 'file' | 'dir' = 'file') => ({ name, kind, size: 10, mtimeMs: name === 'agent-a.jsonl' ? mtimeA : 1, isLink: false })
  on('fs.list', (_$, e) =>
    (e.path === AGENTS_DIR
      ? { value: ['agent-a.jsonl', 'agent-a.meta.json', 'agent-b.jsonl', 'agent-b.meta.json'].map(n => file(n)).concat(file('workflows', 'dir')) }
      : { value: [] }) as never,
  )
  on('fs.read', (_$, e) => ({ value: AGENT_META[e.path] }) as never)
  on('classic.UserPromptSubmit', () => ({}))
  const spawned: string[] = []
  on('process.spawn', async function* (_$, e) {
    const path = e.argv[e.argv.length - 1]!
    spawned.push(path)
    const text = AGENT_TEXT[path] ?? ''
    // In pieces that cut lines, as a pipe hands them over.
    for (let i = 0; i < text.length; i += 40) yield { stream: 'stdout' as const, text: text.slice(i, i + 40) }
    return { value: { code: 0, signal: null } } as never
  })
  return { spawned, touchA: () => void (mtimeA += 1) }
}
const AGENTS_LOG = { ...OLD_LOG, startedAt: Date.parse('2026-10-17T18:00:00') }

for (const surface of ['desktop', 'terminal'] as const)
  test(`the session block shows what subagents processed, each file read again only once it changes (${surface})`, async (...env) => {
    const [$, on] = env
    const { spawned, touchA } = stubAgents(on)
    const { mount } = await startAt(env, { stored: { 'session:new': AGENTS_LOG } })
    // Before the first prompt the session's transcript is not known: no block.
    const ui = await mount(surface)
    expect(JSON.stringify(await ui.drawn())).not.toContain('Subagents')
    await $.classic.UserPromptSubmit({ prompt: 'go', transcript_path: '/p/s1.jsonl' })
    const measure = () => $.session.measure({ context: { tokens: 720_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    await measure()
    const text = JSON.stringify(await ui.drawn())
    // 9.7k new (input + cache write + output) and 5k read from cache: 15k in all.
    expect(text).toContain('Subagents: 2, processed 15k')
    expect(text).toContain('New 9.7k, from cache 5k')
    // The dearest first: its task, its biggest context and its steps.
    expect(text.indexOf('Search code')).toBeLessThan(text.indexOf('Review task 5'))
    expect(text).toContain('peak 8k · 1 step')
    expect(text).toContain('peak 3.5k · 2 steps')
    // The figures start in one column, however long each agent's are.
    if (surface === 'terminal') {
      const lines = drawnLines(await ui.drawn())
      const row = (task: string) => lines.find(l => l.startsWith(`  ${task}`)) ?? ''
      expect(row('Search code').trimEnd()).toEndWith('peak 8k · 1 step')
      expect(row('Search code').indexOf('peak')).toBe(row('Review task 5').indexOf('peak'))
    } else {
      // A Box of one width around each agent's figures, the longest's ("peak 3.5k · 2 steps").
      const noteBoxes = (n: unknown): unknown[] => {
        if (!n || typeof n !== 'object') return []
        const el = n as { type?: string; props?: { width?: number }; children?: unknown[] }
        const own = el.type === 'Box' && el.children?.length === 1 && shownText(el.children[0]).startsWith('peak ') ? [el.props?.width] : []
        return [...own, ...(el.children ?? []).flatMap(noteBoxes)]
      }
      expect(noteBoxes(await ui.drawn())).toEqual([19, 19])
    }
    expect(spawned.sort()).toEqual([`${AGENTS_DIR}/agent-a.jsonl`, `${AGENTS_DIR}/agent-b.jsonl`])
    // Nothing changed: nothing read again. Agent a wrote on: only it is read again.
    await measure()
    expect(spawned.length).toBe(2)
    touchA()
    await measure()
    expect(spawned.slice(2)).toEqual([`${AGENTS_DIR}/agent-a.jsonl`])
  })

test('a narrow pane puts each subagent\'s figures under its task', async (...env) => {
  const [$, on] = env
  stubAgents(on)
  await startAt(env, { stored: { 'session:new': AGENTS_LOG } })
  await $.classic.UserPromptSubmit({ prompt: 'go', transcript_path: '/p/s1.jsonl' })
  await $.session.measure({ context: { tokens: 720_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'chudarin-context-mod',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'chudarin-context-mod',
    props: { ...props, bodyColumns: 40 } as never,
  })
  const lines = drawnLines(await ui.drawn())
  const at = lines.indexOf('  Search code')
  expect(at).toBeGreaterThan(-1)
  expect(lines[at + 1]).toBe('    peak 8k · 1 step')
})
