import { expect, test } from 'claude-code/testing'

import { addCompact, addLimit, addPoint, addPrompt, addRequest, emptyLog, pruneKeys, sessionKey } from './history'

const usage = (input: number, read: number, write: number, out: number) => ({
  input_tokens: input,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  output_tokens: out,
})

test('addRequest sums what the model read, what came from cache and what it wrote', () => {
  let log = emptyLog(1000)
  log = addRequest(log, usage(10, 900, 90, 50))
  log = addRequest(log, usage(5, 1000, 0, 20))
  expect(log.requests).toBe(2)
  expect(log.read).toBe(2005)
  expect(log.cached).toBe(1900)
  expect(log.written).toBe(70)
})

test('addPoint keeps one point per turn and caps the history', () => {
  let log = emptyLog(0)
  log = addPoint(log, 100, 'Read a.md')
  log = addPoint(log, 100, null)
  log = addPoint(log, 300, 'Bash x')
  expect(log.points.map(p => [p.turn, p.tokens, p.cause])).toEqual([
    [1, 100, 'Read a.md'],
    [2, 300, 'Bash x'],
  ])
  for (let i = 0; i < 500; i++) log = addPoint(log, 1000 + i, null)
  expect(log.points.length).toBe(300)
  expect(log.points[log.points.length - 1]!.turn).toBe(502)
})

test('addCompact records the drop at the current turn', () => {
  let log = addPoint(emptyLog(0), 950_000, null)
  log = addCompact(log, 'manual', 950_000, 18_000)
  expect(log.compacts).toEqual([{ turn: 1, trigger: 'manual', before: 950_000, after: 18_000 }])
})

test('sessionKey and pruneKeys keep only the newest sessions', () => {
  expect(sessionKey('abc')).toBe('session:abc')
  const keys = ['other', 'session:a', 'session:b', 'session:c', 'session:d']
  expect(pruneKeys(keys, 2)).toEqual(['session:a', 'session:b'])
  expect(pruneKeys(keys, 10)).toEqual([])
})

test('addPrompt counts what the person sent, logs from before it count as zero', () => {
  const old = { ...emptyLog(0) } as Partial<ReturnType<typeof emptyLog>>
  delete old.prompts
  expect(addPrompt(old as ReturnType<typeof emptyLog>).prompts).toBe(1)
  expect(addPrompt(addPrompt(emptyLog(0))).prompts).toBe(2)
})

test('addLimit adds up what the session spent, across a reset', () => {
  let l = addLimit(emptyLog(0), 'five_hour', 'r1', 40)
  expect(l.limits.five_hour).toEqual({ resetsAt: 'r1', last: 40, spent: 0 })
  l = addLimit(l, 'five_hour', 'r1', 55)
  l = addLimit(l, 'five_hour', 'r1', 55)
  expect(l.limits.five_hour!.spent).toBe(15)
  // After the reset the percent starts from zero: all of it is this session's.
  l = addLimit(l, 'five_hour', 'r2', 6)
  expect(l.limits.five_hour).toEqual({ resetsAt: 'r2', last: 6, spent: 21 })
})
