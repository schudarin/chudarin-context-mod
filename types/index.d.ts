export type Step = { label: string; tokens: number }
export type Category = { name: string; tokens: number; color: string; isFree: boolean }
export type Item = { name: string; tokens: number }
export type Point = { tokens: number; turn: number; cause: string | null }

export type GroupId = 'tools' | 'service' | 'chat' | 'rules'

// Everything the pane reads, refreshed after each turn.
export type Snapshot = {
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
      trail: Point[]
      heaviest: Step | null
      top: Step[]
      snapshot: Snapshot | null
      expanded: string[]
      page: Page
      bandOn: boolean
    }
  }
}
