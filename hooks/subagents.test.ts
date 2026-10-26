import { expect, test } from 'claude-code/testing'

import { addLine, descriptionOf, runOf, summarize } from './subagents'
import { AGENT_A, AGENT_B } from './subagents.fixture'

const read = (text: string, description = 'x') => {
  const steps = new Map()
  for (const line of text.split('\n')) addLine(steps, line)
  return runOf(description, steps)
}

test('a reply written as several lines is one step, counted with its last output', () => {
  // Context per step: input + cache read + cache write. New: input + cache write + output.
  expect(read(AGENT_A, 'Review task 5')).toEqual({ description: 'Review task 5', steps: 2, peak: 3505, fresh: 1585, cached: 5000 })
})

test('a line still being written, and lines that are not replies, count for nothing', () => {
  expect(read(AGENT_B)).toEqual({ description: 'x', steps: 1, peak: 8002, fresh: 8102, cached: 0 })
  expect(read('')).toEqual({ description: 'x', steps: 0, peak: 0, fresh: 0, cached: 0 })
})

test('summarize counts the agents, adds up what they processed and keeps the three dearest', () => {
  const a = read(AGENT_A, 'a')
  const b = read(AGENT_B, 'b')
  const small = { description: 's', steps: 1, peak: 10, fresh: 10, cached: 0 }
  const s = summarize([a, small, b, { ...small, description: 't', cached: 5 }])
  expect(s).toMatchObject({ count: 4, fresh: 1585 + 8102 + 20, cached: 5005 })
  // Dearest by everything processed: b 8102, a 6585, t 15, s 10.
  expect(s?.top.map(r => r.description)).toEqual(['b', 'a', 't'])
  expect(summarize([])).toBeNull()
})

test('an agent is named by its task, else its type, else its file', () => {
  expect(descriptionOf({ agentType: 'Explore', description: 'Search code' }, 'agent-1')).toBe('Search code')
  expect(descriptionOf({ agentType: 'Explore' }, 'agent-1')).toBe('Explore')
  expect(descriptionOf(null, 'agent-1')).toBe('agent-1')
})

// The task text is the model's: an escape sequence in it must not reach the terminal.
test('control characters in a task become spaces', () => {
  expect(descriptionOf({ description: 'a\u001b[2Jb\nc\u009b' }, 'agent-1')).toBe('a [2Jb c')
})
