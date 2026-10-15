export type Step = { label: string; tokens: number }
export type Category = { name: string; tokens: number; color: string; isFree: boolean }
export type Item = { name: string; tokens: number }
export type Point = { tokens: number; turn: number; cause: string | null }
export type Compact = { turn: number; trigger: string; before: number; after: number }

// One session's running totals, kept in $.store under `session:<id>`.
export type SessionLog = {
  startedAt: number
  requests: number
  // Everything the model read across requests: fresh, cached and newly cached input.
  read: number
  cached: number
  written: number
  points: Point[]
  compacts: Compact[]
}

export type GroupId = 'tools' | 'service' | 'chat' | 'rules'

// Everything the pane reads, refreshed after each turn.
export type Snapshot = {
  lang: 'ru' | 'en'
  entries: {
    id: string
    label: string
    group: GroupId
    tokens: number
    count: number
    top: { label: string; tokens: number }[]
  }[]
  prices: { name: string; count: number; average: number }[]
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  // Where auto-compaction starts, or the whole window when it is off.
  threshold: number
  window: number
  used: number
}

export type Page = { kind: 'home' } | { kind: 'group'; id: string } | { kind: 'entry'; id: string }

declare module 'claude-code' {
  interface PluginState {
    'chudarin-context': {
      log: SessionLog | null
      heaviest: Step | null
      top: Step[]
      snapshot: Snapshot | null
      expanded: string[]
      page: Page
      bandOn: boolean
      lang: 'ru' | 'en'
    }
  }
}
