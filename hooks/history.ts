// The session log: what the model read and wrote, the context after each turn and every
// compaction. Kept in $.store per session, so it survives a restart or --resume.
import type { SessionLog } from '../types'

const MAX_POINTS = 300

// `launchedAt`: the conversation's first launch (`usage.startedAt`), kept so a resume under a new
// session id can find this log again.
export function emptyLog(startedAt: number, launchedAt?: number): SessionLog {
  return {
    startedAt,
    ...(launchedAt !== undefined ? { launchedAt } : {}),
    requests: 0, read: 0, cached: 0, written: 0, points: [], compacts: [], prompts: 0, limits: {},
  }
}

// The log a conversation launched at `launch` and resumed under a new session id left: the one that
// kept that launch time, else (a log from before launch times were kept) the one that started within
// a minute of it. Two candidates, or none: null.
export function findResumed(logs: readonly (readonly [string, SessionLog])[], launch: number): string | null {
  const exact = logs.filter(([, l]) => l.launchedAt === launch)
  if (exact.length > 0) return exact.length === 1 ? exact[0]![0] : null
  const near = logs.filter(([, l]) => l.launchedAt === undefined && Math.abs(l.startedAt - launch) <= 60_000)
  return near.length === 1 ? near[0]![0] : null
}

export function sessionKey(id: string): string {
  return `session:${id}`
}

type Usage = {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  output_tokens: number
}

// One model request: everything it read (fresh, cached and newly cached) and what it wrote.
export function addRequest(log: SessionLog, u: Usage): SessionLog {
  return {
    ...log,
    requests: log.requests + 1,
    read: log.read + u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    cached: log.cached + u.cache_read_input_tokens,
    written: log.written + u.output_tokens,
  }
}

// The context size after a turn, with the heaviest step of that turn as its likely cause.
export function addPoint(log: SessionLog, tokens: number, cause: string | null, detail: string | null = null): SessionLog {
  const last = log.points[log.points.length - 1]
  if (last?.tokens === tokens) return log
  const point = { tokens, turn: (last?.turn ?? 0) + 1, cause, detail }
  return { ...log, points: [...log.points, point].slice(-MAX_POINTS) }
}

// One more prompt from the person. Logs written before this field count from zero.
export function addPrompt(log: SessionLog): SessionLog {
  return { ...log, prompts: (log.prompts ?? 0) + 1 }
}

// A plan limit's percent now. Rises in the same window add up; after a reset the percent
// starts from zero, so all of it counts.
export function addLimit(log: SessionLog, kind: string, resetsAt: string, percent: number): SessionLog {
  const limits = log.limits ?? {}
  const prev = limits[kind]
  const spent = !prev ? 0 : prev.resetsAt === resetsAt ? prev.spent + Math.max(0, percent - prev.last) : prev.spent + percent
  return { ...log, limits: { ...limits, [kind]: { resetsAt, last: percent, spent } } }
}

export function addCompact(log: SessionLog, trigger: string, before: number, after: number): SessionLog {
  const turn = log.points[log.points.length - 1]?.turn ?? 0
  return { ...log, compacts: [...log.compacts, { turn, trigger, before, after }] }
}

// Session keys to drop so that only the newest `keep` remain (the store holds them in insertion order).
export function pruneKeys(keys: readonly string[], keep: number): string[] {
  const sessions = keys.filter(k => k.startsWith('session:'))
  return sessions.slice(0, Math.max(0, sessions.length - keep))
}
