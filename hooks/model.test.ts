import { expect, test } from 'claude-code/testing'

import { chartRows, detailsFor, jumps, k, kind, label, pace, resetLabel, shorten, speed, sparkline, usualRise, windowRows } from './model'

const pt = (tokens: number, turn: number) => ({ tokens, turn, cause: null })

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

test('detailsFor lists items under their category', () => {
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
  )
  expect(d).toEqual({
    Skills: [{ name: 'b', tokens: 5 }, { name: 'a', tokens: 1 }],
    'Memory files': [{ name: 'y/CLAUDE.md', tokens: 9 }],
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



test('pace averages the last five rises and all of them', () => {
  const p = pace([pt(0, 1), pt(10, 2), pt(20, 3), pt(30, 4), pt(40, 5), pt(50, 6), pt(110, 7)])
  expect(p.recent).toBe(20)
  expect(Math.round(p.overall * 100)).toBe(Math.round((110 / 6) * 100))
})

test('resetLabel shows a time today and a date otherwise', () => {
  const now = Date.parse('2026-10-15T12:00:00')
  expect(resetLabel('2026-10-15T18:40:00', now)).toBe('18:40')
  expect(resetLabel('2026-10-18T09:05:00', now)).toBe('18.10 09:05')
})

// A session whose context rises by `step` every turn.
const steady = (step: number, turns = 8) => ({ points: Array.from({ length: turns }, (_, i) => pt(10_000 + i * step, i + 1)) })

test('usualRise needs three sessions with enough turns, and ignores compaction drops', () => {
  expect(usualRise([steady(1000), steady(1000)])).toBe(null)
  expect(usualRise([steady(1000), steady(1000), steady(1000, 3)])).toBe(null)
  expect(usualRise([steady(1000), steady(2000), steady(3000)])).toBe(2000)
  const compacted = { points: [...steady(1000).points, pt(5_000, 9), pt(6_000, 10)] }
  expect(usualRise([compacted, steady(1000), steady(1000)])).toBe(1000)
})

test('speed compares the last turns with the usual pace', () => {
  expect(speed(steady(1000).points, null)).toBe(null)
  expect(speed(steady(1000, 3).points, 1000)).toBe(null)
  expect(speed(steady(400).points, 1000)).toEqual({ kind: 'snail', ratio: 0.4 })
  expect(speed(steady(1000).points, 1000)).toEqual({ kind: 'cat', ratio: 1 })
  expect(speed(steady(1700).points, 1000)).toEqual({ kind: 'rabbit', ratio: 1.7 })
  expect(speed(steady(3000).points, 1000)).toEqual({ kind: 'rocket', ratio: 3 })
})
