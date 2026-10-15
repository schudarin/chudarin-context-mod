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
      plugin: 'chudarin-context',
      surface,
      component: 'Pane',
      requestId: 'chudarin-context',
      props: props as never,
    })
    expect(JSON.stringify(await ui.drawn())).toContain('Нет данных')
  })

  test(`home → group → entry → back on ${surface}`, async ($, on) => {
    on('session.usage', () => ({ value: usage }) as never)
    on('session.messages', () => ({ value: messages }) as never)
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('clock.now', () => ({ value: Date.parse('2026-10-15T12:00:00') }) as never)
    await $.session.measure({ context: { tokens: 20_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
    const ui = await $.ui.mount({
      plugin: 'chudarin-context',
      surface,
      component: 'Pane',
      requestId: 'chudarin-context',
      props: props as never,
    })
    const drawn = async () => JSON.stringify(await ui.drawn())

    const home = await drawn()
    expect(home).toContain('ЛИМИТ НЕДЕЛЯ')
    expect(home).toContain('Работа инструментов')
    expect(home).toContain('Команда в Bash')

    await ui.press({ key: 'group-tools' })
    expect(await drawn()).toContain('Вывод команд Bash')

    await ui.press({ key: 'entry-result:Bash' })
    const entry = await drawn()
    expect(entry).toContain('Что это')
    expect(entry).toContain('Что делать')
    expect(entry).toContain('npm test')

    await ui.press({ key: 'back' })
    expect(await drawn()).toContain('РАБОТА ИНСТРУМЕНТОВ')
    await ui.press({ key: 'back' })
    expect(await drawn()).toContain('ЧЕМ ЗАНЯТ КОНТЕКСТ')
  })
}
