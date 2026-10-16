export type Step = { label: string; tokens: number }
export type Category = { name: string; tokens: number; color: string; isFree: boolean }
export type Item = { name: string; tokens: number }
export type Point = { tokens: number; turn: number; cause: string | null }
export type Compact = { turn: number; trigger: string; before: number; after: number }
// Samples of one rate-limit window, keyed by its reset time.
export type LimitTrack = { resetsAt: string; samples: { at: number; percent: number }[] }

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
  // Prompts the person sent (slash commands left out).
  prompts: number
  // What this session spent of each plan limit, by kind (five_hour, seven_day).
  limits: Record<string, LimitSpend>
}

// One plan limit as the session saw it: the last percent and how much it has added up.
export type LimitSpend = { resetsAt: string; last: number; spent: number }

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
    'chudarin-context-mod': {
      log: SessionLog | null
      heaviest: Step | null
      snapshot: Snapshot | null
      expanded: string[]
      page: Page
      bandOn: boolean
      lang: 'ru' | 'en'
      // The usual context rise per turn over past sessions; null until there are enough.
      usual: number | null
      // Hints acted on or hidden this session, by entry id.
      hidden: string[]
      // Advice sent to Claude or run as a command this session, by entry id.
      sent: string[]
      // Advice the person hid for good, by entry id; kept in $.store under `muted`.
      muted: string[]
      // Samples of the 5-hour limit in its current window, for the forecast; kept in $.store.
      limitTrack: LimitTrack | null
    }
  }
}
