import { expect, test } from 'claude-code/testing'

import { GROUPS, actionPrices, buildEntries, groupTotals, insight } from './entries'
import { helpFor } from './help'

const messages = [
  { role: 'user' as const, content: [{ type: 'text', text: 'привет'.repeat(10) }] },
  {
    role: 'assistant' as const,
    content: [
      { type: 'text', text: 'a'.repeat(400) },
      { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } },
      { type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: '/x/App.tsx', content: 'c'.repeat(4000) } },
      { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/x/README.md' } },
    ],
  },
  {
    role: 'user' as const,
    content: [
      { type: 'tool_result', tool_use_id: 'b1', content: 'o'.repeat(8000) },
      { type: 'tool_result', tool_use_id: 'w1', content: 'ok' },
      { type: 'tool_result', tool_use_id: 'r1', content: 'r'.repeat(2000) },
      { type: 'text', text: '<system-reminder>' + 's'.repeat(1200) },
      { type: 'text', text: 'Base directory for this skill: /s/skills/tdd\n' + 't'.repeat(2000) },
      { type: 'image' },
    ],
  },
]

const categories = [
  { name: 'Messages', tokens: 0, color: 'x', isFree: false },
  { name: 'System tools', tokens: 27_000, color: 'x', isFree: false },
  { name: 'Skills', tokens: 10_000, color: 'x', isFree: false },
  { name: 'Free space', tokens: 600_000, color: 'x', isFree: true },
]

test('buildEntries sorts the conversation and categories into the four groups', () => {
  const entries = buildEntries(categories, { Skills: [{ name: 'dataviz', tokens: 480 }] }, messages, 'ru')
  const by = Object.fromEntries(entries.map(e => [e.id, e]))

  expect(by['result:Bash']!.group).toBe('tools')
  expect(by['result:Bash']!.label).toBe('Вывод команд Bash')
  expect(by['result:Bash']!.top[0]!.label).toBe('Bash Run tests')
  expect(by['code']!.label).toBe('Код, который я написал')
  expect(by['code']!.top[0]!.label).toBe('Write App.tsx')
  expect(by['result:Read']!.label).toBe('Прочитанные файлы')
  expect(by['reminders']!.group).toBe('service')
  expect(by['skills-loaded']!.group).toBe('rules')
  expect(by['skills-loaded']!.top[0]!.label).toBe('tdd')
  expect(by['images']!.group).toBe('chat')
  expect(by['user']!.group).toBe('chat')
  expect(by['assistant']!.group).toBe('chat')
  expect(by['cat:System tools']!.group).toBe('service')
  expect(by['cat:Skills']!.group).toBe('rules')
  expect(by['cat:Skills']!.top[0]).toEqual({ label: 'dataviz', tokens: 480 })
  expect(entries.some(e => e.id === 'cat:Free space' || e.id === 'cat:Messages')).toBe(false)
})

test('conversation entries are scaled to the measured Messages total', () => {
  const measured = categories.map(c => (c.name === 'Messages' ? { ...c, tokens: 10_000 } : c))
  const entries = buildEntries(measured, {}, messages, 'ru')
  const fromMessages = entries.filter(e => !e.id.startsWith('cat:')).reduce((n, e) => n + e.tokens, 0)
  expect(Math.abs(fromMessages - 10_000)).toBeLessThan(10)
})

test('groupTotals keeps the fixed group order with their totals', () => {
  const totals = groupTotals(buildEntries(categories, {}, messages, 'ru'), 'ru')
  expect(totals.map(t => t.id)).toEqual(GROUPS.map(g => g.id))
  expect(totals.find(t => t.id === 'service')!.tokens).toBeGreaterThan(27_000)
})

test('every entry has help text', () => {
  for (const e of buildEntries(categories, {}, messages, 'en')) {
    const help = helpFor(e.id, 'en')
    expect(help.what.length).toBeGreaterThan(10)
  }
  expect(helpFor('cat:Something new', 'en').what.length).toBeGreaterThan(10)
})

test('actionPrices counts the whole call: what I sent plus what came back', () => {
  const prices = actionPrices(messages, 'ru')
  const by = Object.fromEntries(prices.map(p => [p.name, p]))
  expect(by['Записать файл']!.average).toBeGreaterThan(1000)
  expect(by['Команда в Bash']!.average).toBeGreaterThan(2000)
  expect(by['Скриншот']!.average).toBe(1500)
  expect(by['Скилл']!.count).toBe(1)
  expect(prices[0]!.average).toBeGreaterThanOrEqual(prices[prices.length - 1]!.average)
})

test('insight speaks only when there is something to do', () => {
  const entries = buildEntries(categories, {}, messages, 'ru')
  const used = entries.reduce((n, e) => n + e.tokens, 0)
  // A full context is shown by the meter; the hint line only names something to act on.
  expect(insight(entries, 60, used, 'ru')?.text ?? '').not.toContain('/compact')
  // System tools is the biggest entry here, but nothing can be done about it.
  expect(insight(entries, 20, used, 'ru')?.text ?? '').not.toContain('инструментов')
  expect(insight([], 20, 100, 'ru')).toBe(null)
  const bash = [{ id: 'result:Bash', label: 'Вывод команд Bash', group: 'tools' as const, tokens: 61_000, count: 3, top: [] }]
  expect(insight(bash, 20, 300_000, 'ru')).toEqual({
    id: 'result:Bash',
    text: 'Вывод команд Bash занял 61k. Проси Claude запускать тесты и разбирать длинные логи в субагенте: в чат вернётся только итог.',
    prompt: 'Дальше запускай тесты и разбирай длинные логи в субагенте, в чат возвращай только итог.',
  })
  // A hint the person acted on or hid stays away.
  expect(insight(bash, 20, 300_000, 'ru', ['result:Bash'])).toBe(null)
  // Some advice is for the person alone: nothing to put in the chat.
  const files = [{ id: 'result:Read', label: 'Прочитанные файлы', group: 'tools' as const, tokens: 61_000, count: 3, top: [] }]
  expect(insight(files, 20, 300_000, 'ru')?.prompt).toBe(null)
  const mcp = [{ id: 'cat:MCP tools', label: 'Схемы MCP-инструментов', group: 'service' as const, tokens: 61_000, count: 1, top: [] }]
  expect(insight(mcp, 20, 300_000, 'ru')?.prompt).toBe('/mcp')
  // System reminders can't be reduced, so they never make a hint.
  const reminders = [{ id: 'reminders', label: 'Служебные вставки', group: 'service' as const, tokens: 90_000, count: 40, top: [] }]
  expect(insight(reminders, 20, 300_000, 'ru')).toBe(null)
})

test('English labels and prices', () => {
  const entries = buildEntries(categories, {}, messages, 'en')
  expect(entries.find(e => e.id === 'code')!.label).toBe('Code Claude wrote')
  expect(groupTotals(entries, 'en')[0]!.label).toBe('Tool work')
  expect(actionPrices(messages, 'en').some(p => p.name === 'Write a file')).toBe(true)
  const bash = [{ id: 'result:Bash', label: 'Bash output', group: 'tools' as const, tokens: 61_000, count: 3, top: [] }]
  expect(insight(bash, 20, 300_000, 'en')).toEqual({
    id: 'result:Bash',
    text: 'Bash output took 61k. Ask Claude to run tests and go through long logs in a subagent: only the summary comes back.',
    prompt: 'From now on, run tests and go through long logs in a subagent, and bring back only the summary.',
  })
})
