// What the session's subagents processed, read from their transcripts (<session>/subagents/agent-<id>.jsonl).
import type { AgentRun, Subagents } from '../types'

type Usage = {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  output_tokens: number
}

// One transcript line into the steps so far, by message id. A reply is written as several lines, one
// per block, each with the same id; the last carries the final output count, so it wins. Anything
// else, a line cut short by a running agent included, counts for nothing.
export function addLine(steps: Map<string, Usage>, line: string): void {
  if (!line.includes('"assistant"')) return
  let o: { type?: string; message?: { id?: string; usage?: Partial<Usage> } }
  try {
    o = JSON.parse(line)
  } catch {
    return
  }
  const u = o.message?.usage
  if (o.type !== 'assistant' || !o.message?.id || !u) return
  steps.set(o.message.id, {
    input_tokens: u.input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
  })
}

// A step's context is everything it read: input, cache read and cache write.
export function runOf(description: string, steps: ReadonlyMap<string, Usage>): AgentRun {
  const run = { description, steps: steps.size, peak: 0, fresh: 0, cached: 0 }
  for (const u of steps.values()) {
    run.peak = Math.max(run.peak, u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens)
    run.fresh += u.input_tokens + u.cache_creation_input_tokens + u.output_tokens
    run.cached += u.cache_read_input_tokens
  }
  return run
}

// Dearest by everything processed, new and cached.
export function summarize(runs: readonly AgentRun[]): Subagents | null {
  if (runs.length === 0) return null
  const top = [...runs].sort((a, b) => b.fresh + b.cached - (a.fresh + a.cached)).slice(0, 3)
  return {
    count: runs.length,
    fresh: runs.reduce((n, r) => n + r.fresh, 0),
    cached: runs.reduce((n, r) => n + r.cached, 0),
    top,
  }
}

// From agent-<id>.meta.json: the Agent call's task, else the agent type, else the file name. The model
// writes the task, so control characters (an escape sequence for the terminal) become spaces.
export function descriptionOf(meta: unknown, fallback: string): string {
  const m = (meta ?? {}) as { description?: unknown; agentType?: unknown }
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim() : '')
  return clean(m.description) || clean(m.agentType) || fallback
}
