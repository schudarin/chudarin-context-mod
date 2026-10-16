import { expect, test } from 'claude-code/testing'

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
