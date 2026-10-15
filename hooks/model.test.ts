import { expect, test } from 'claude-code/testing'
import {
  barParts,
  chartRows,
  detailsFor,
  fillColor,
  jumps,
  k,
  kind,
  label,
  shorten,
  messageBreakdown,
  scaleTo,
  sparkline,
  windowRows,
} from './model'

test('sparkline rises with growth', () => {
  expect(sparkline([10, 20, 30])).toBe('▁▅█')
  expect(sparkline([])).toBe('')
})

test('k formats tokens', () => {
  expect(k(56_100)).toBe('56k')
  expect(k(1_000_000)).toBe('1M')
  expect(k(1_500_000)).toBe('1.5M')
  expect(k(800)).toBe('800')
  expect(k(1_540)).toBe('1.5k')
  expect(k(2_000)).toBe('2k')
  expect(k(9_960)).toBe('10k')
})

test('label names the tool and its main argument', () => {
  expect(label({ tool: 'Read', file_path: '/a/b/App.tsx' })).toBe('Read App.tsx')
  expect(label({ tool: 'Bash', command: 'npm test --watch' })).toBe('Bash npm test')
  expect(label({ tool: 'Bash', command: 'D=/x; cat $D', description: 'Read band example' })).toBe('Bash Read band example')
  expect(label({ tool: 'Skill', skill: 'superpowers:tdd' })).toBe('Skill superpowers:tdd')
  expect(label({ tool: 'mcp__linear__list_issues' })).toBe('linear:list_issues')
})

test('kind groups MCP tools by server', () => {
  expect(kind('mcp__linear__list_issues')).toBe('MCP linear')
  expect(kind('Read')).toBe('Read')
})

test('barParts splits filled and empty and never overflows', () => {
  expect(barParts(5, 10, 4)).toEqual(['━━', '──'])
  expect(barParts(15, 10, 4)).toEqual(['━━━━', ''])
  expect(barParts(1, 0, 4)).toEqual(['', '────'])
})

test('fillColor follows how full the window is', () => {
  expect(fillColor(13)).toBe('success')
  expect(fillColor(60)).toBe('warning')
  expect(fillColor(90)).toBe('error')
})

test('windowRows keeps used rows by size, then free, drops buffer and deferred', () => {
  expect(
    windowRows([
      { name: 'System prompt', tokens: 3, kind: 'used', color: 'c' },
      { name: 'Messages', tokens: 20, kind: 'used', color: 'c' },
      { name: 'MCP tools', tokens: 134, kind: 'deferred', color: 'c' },
      { name: 'Free space', tokens: 900, kind: 'free', color: 'c' },
      { name: 'Autocompact buffer', tokens: 33, kind: 'buffer', color: 'c' },
    ]),
  ).toEqual([
    { name: 'Messages', tokens: 20, color: 'c', isFree: false },
    { name: 'System prompt', tokens: 3, color: 'c', isFree: false },
    { name: 'Free space', tokens: 900, color: 'c', isFree: true },
  ])
})

test('messageBreakdown sorts the conversation into kinds', () => {
  const items = messageBreakdown([
    { role: 'user', content: [{ type: 'text', text: 'x'.repeat(40) }] },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'y'.repeat(80) },
        { type: 'tool_use', id: 't1', name: 'Read', input: {} },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'z'.repeat(400) }] },
        { type: 'text', text: 'Base directory for this skill: /a/skills/tdd\n' + 'w'.repeat(200) },
        { type: 'text', text: '<system-reminder>' + 'r'.repeat(100) },
      ],
    },
  ])
  const by = Object.fromEntries(items.map(i => [i.name, i.tokens]))
  expect(by['Результаты Read']).toBe(100)
  expect(by['Мои ответы']).toBe(20)
  expect(by['Твои сообщения']).toBe(10)
  expect(by['Скилл tdd']).toBeGreaterThan(50)
  expect(by['Системные напоминания']).toBeGreaterThan(25)
  expect(items[0]!.name).toBe('Результаты Read')
})

test('scaleTo makes estimates add up to the total', () => {
  expect(scaleTo([{ name: 'a', tokens: 1 }, { name: 'b', tokens: 3 }], 100)).toEqual([
    { name: 'a', tokens: 25 },
    { name: 'b', tokens: 75 },
  ])
})

test('detailsFor lists items under their category, Messages scaled to its total', () => {
  const d = detailsFor(
    {
      categories: [
        { name: 'Skills', tokens: 6 },
        { name: 'Memory files', tokens: 9 },
        { name: 'MCP tools', tokens: 0 },
        { name: 'Messages', tokens: 1000 },
      ],
      skills: { skillFrontmatter: [{ name: 'a', tokens: 1 }, { name: 'b', tokens: 5 }] },
      memoryFiles: [{ path: '/x/y/CLAUDE.md', tokens: 9 }],
      mcpTools: [{ name: 't', serverName: 's', tokens: 3, isLoaded: false }],
      agents: [],
    },
    [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
  )
  expect(d).toEqual({
    Skills: [{ name: 'b', tokens: 5 }, { name: 'a', tokens: 1 }],
    'Memory files': [{ name: 'y/CLAUDE.md', tokens: 9 }],
    Messages: [{ name: 'Твои сообщения', tokens: 1000 }],
  })
})

test('shorten cuts on a word boundary with an ellipsis', () => {
  expect(shorten('Find code tied to the tool-types section', 24)).toBe('Find code tied to the…')
  expect(shorten('short', 24)).toBe('short')
  expect(shorten('averyveryverylongsingleword', 10)).toBe('averyvery…')
})

test('label keeps whole words of a long description', () => {
  expect(label({ tool: 'Bash', command: 'x', description: 'Clamp bar fill, fix table max, drop open log; run checks' })).toBe(
    'Bash Clamp bar fill, fix table max, drop open…',
  )
})

test('chartRows draws columns from zero, top row first', () => {
  expect(chartRows([0, 4, 8], 2)).toEqual(['  █', ' ██'])
  expect(chartRows([1, 2], 1)).toEqual(['▄█'])
  expect(chartRows([], 3)).toEqual(['', '', ''])
})

test('jumps lists the biggest rises with their turn and cause', () => {
  expect(
    jumps(
      [
        { tokens: 10, turn: 1, cause: null },
        { tokens: 40, turn: 2, cause: 'Read a.md' },
        { tokens: 45, turn: 3, cause: null },
        { tokens: 30, turn: 4, cause: null },
        { tokens: 50, turn: 5, cause: 'Bash x' },
      ],
      2,
    ),
  ).toEqual([
    { delta: 30, turn: 2, cause: 'Read a.md' },
    { delta: 20, turn: 5, cause: 'Bash x' },
  ])
})

import { actionCosts, limitLabel, pace, resetLabel, tip, verdict, whereItWent } from './model'

const pt = (tokens: number, turn: number) => ({ tokens, turn, cause: null })

test('pace averages the last five rises and all of them', () => {
  const p = pace([pt(0, 1), pt(10, 2), pt(20, 3), pt(30, 4), pt(40, 5), pt(50, 6), pt(110, 7)])
  expect(p.recent).toBe(20)
  expect(Math.round(p.overall * 100)).toBe(Math.round((110 / 6) * 100))
})

test('verdict takes the worst of fill, turns left and limits', () => {
  const base = { total: 100_000, limit: 1_000_000, points: [pt(90_000, 1), pt(100_000, 2)], limits: [] }
  expect(verdict(base).level).toBe('ok')
  expect(verdict({ ...base, total: 600_000 }).level).toBe('warn')
  expect(verdict({ ...base, total: 850_000 }).level).toBe('bad')
  expect(verdict({ ...base, points: [pt(0, 1), pt(200_000, 2)] }).turnsLeft).toBe(4)
  expect(verdict({ ...base, points: [pt(0, 1), pt(200_000, 2)] }).level).toBe('warn')
  expect(verdict({ ...base, limits: [{ kind: 'five_hour', percentUsed: 75 }] }).level).toBe('warn')
  expect(verdict({ ...base, limits: [{ kind: 'seven_day', percentUsed: 85 }] }).level).toBe('warn')
  expect(verdict({ ...base, limits: [{ kind: 'seven_day', percentUsed: 96 }] }).level).toBe('bad')
})

test('tip picks the first rule that fires', () => {
  const where = [
    { name: 'Системные напоминания', tokens: 70 },
    { name: 'Результаты Bash', tokens: 55 },
    { name: 'Мои ответы', tokens: 75 },
  ]
  const base = { fill: 20, recent: 10, overall: 10, used: 200, where, mcpLoaded: 0, limits: [], now: 0 }
  expect(tip(base)).toContain('пиши в лог')
  expect(tip({ ...base, fill: 60 })).toContain('/compact')
  expect(tip({ ...base, recent: 30 })).toContain('ходы тяжелеют')
  expect(tip({ ...base, where: [{ name: 'Мои ответы', tokens: 10 }] })).toBe('всё ровно')
  expect(
    tip({ ...base, limits: [{ kind: 'five_hour', percentUsed: 72, resetsAt: '2026-10-15T18:40:00' }], now: Date.parse('2026-10-15T12:00:00') }),
  ).toBe('лимит 5 ч на 72%, сброс в 18:40')
})

test('limitLabel names the known windows and Fable', () => {
  expect(limitLabel('five_hour')).toBe('5 ч')
  expect(limitLabel('seven_day')).toBe('7 дн')
  expect(limitLabel('seven_day_fable')).toBe('Fable 7 дн')
  expect(limitLabel('spend_limit')).toBe('spend_limit')
})

test('resetLabel shows a time today and a date otherwise', () => {
  const now = Date.parse('2026-10-15T12:00:00')
  expect(resetLabel('2026-10-15T18:40:00', now)).toBe('18:40')
  expect(resetLabel('2026-10-18T09:05:00', now)).toBe('18.10 09:05')
})

test('whereItWent merges categories with the parts of Messages, top five plus the rest', () => {
  const rows = whereItWent(
    [
      { name: 'Messages', tokens: 100, color: 'a', isFree: false },
      { name: 'System tools', tokens: 30, color: 'b', isFree: false },
      { name: 'Skills', tokens: 5, color: 'c', isFree: false },
      { name: 'Free space', tokens: 900, color: 'd', isFree: true },
    ],
    {
      Messages: [
        { name: 'Напоминания', tokens: 40 },
        { name: 'Bash', tokens: 25 },
        { name: 'Ответы', tokens: 20 },
        { name: 'Read', tokens: 10 },
        { name: 'Картинки', tokens: 5 },
      ],
    },
  )
  expect(rows.map(r => [r.name, r.tokens])).toEqual([
    ['Напоминания', 40],
    ['System tools', 30],
    ['Bash', 25],
    ['Ответы', 20],
    ['Read', 10],
    ['остальное', 10],
  ])
})

test('actionCosts averages each kind of action per call', () => {
  const costs = actionCosts([
    {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'a', name: 'Bash', input: {} },
        { type: 'tool_use', id: 'b', name: 'Bash', input: {} },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'a', content: 'x'.repeat(400) },
        { type: 'tool_result', tool_use_id: 'b', content: 'x'.repeat(800) },
        { type: 'image' },
        { type: 'text', text: 'Base directory for this skill: /s/tdd\n' + 'y'.repeat(4000) },
      ],
    },
  ])
  const by = Object.fromEntries(costs.map(c => [c.name, c]))
  expect(by['Bash']).toEqual({ name: 'Bash', count: 2, average: 150 })
  expect(by['картинка']!.average).toBe(1500)
  expect(by['скилл']!.count).toBe(1)
  expect(costs[0]!.name).toBe('картинка')
})
