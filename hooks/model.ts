// Formatting and small maths shared by the panel: no engine calls and no words here.
import type { Category, Item, Point } from '../types'

const BARS = '▁▂▃▄▅▆▇█'
const EIGHTHS = ' ▁▂▃▄▅▆▇█'
// A flat guess per image: the transcript does not carry their pixel size.
export const IMAGE_TOKENS = 1500

type Block = { type: string; [field: string]: unknown }
export type Message = { role: 'user' | 'assistant'; content: readonly Block[] }

export function k(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (tokens >= 9_950) return `${Math.round(tokens / 1000)}k`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(tokens)
}

// Cut a text to max characters on a word boundary, ending with an ellipsis.
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// Group name for a tool: built-in tools by name, MCP tools by server.
export function kind(tool: string): string {
  return tool.startsWith('mcp__') ? `MCP ${tool.split('__')[1]}` : tool
}

// Short name for a tool call: tool plus its main argument.
export function label(e: Record<string, unknown>): string {
  const tool = String(e.tool)
  const short = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':') : tool
  const arg =
    (typeof e.file_path === 'string' && e.file_path.split('/').pop()) ||
    (typeof e.skill === 'string' && e.skill) ||
    (typeof e.description === 'string' && e.description) ||
    (typeof e.command === 'string' && e.command.split(/\s+/).slice(0, 2).join(' ')) ||
    (typeof e.query === 'string' && e.query) ||
    (typeof e.url === 'string' && e.url) ||
    (typeof e.pattern === 'string' && e.pattern) ||
    ''
  return arg ? `${short} ${shorten(arg, 45)}` : short
}

export function sparkline(points: readonly number[]): string {
  if (points.length === 0) return ''
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  return points.map(p => BARS[Math.round(((p - lo) / span) * (BARS.length - 1))]).join('')
}

// A column chart from zero, one column per value, top row first; each cell in eighths.
export function chartRows(values: readonly number[], height: number): string[] {
  const max = Math.max(0, ...values)
  return Array.from({ length: height }, (_, i) => {
    const row = height - 1 - i
    return values
      .map(v => {
        const level = max > 0 ? Math.round((v / max) * height * 8) : 0
        return EIGHTHS[Math.min(8, Math.max(0, level - row * 8))]
      })
      .join('')
  })
}

const two = (n: number) => String(n).padStart(2, '0')

// Local time: HH:MM today, otherwise DD.MM HH:MM.
export function resetLabel(iso: string, now: number): string {
  const at = new Date(iso)
  const today = new Date(now)
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`
  const isToday =
    at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate()
  return isToday ? time : `${two(at.getDate())}.${two(at.getMonth() + 1)} ${time}`
}

// Average rise per turn: over the last five turns and over all of them.
export function pace(points: readonly Point[]): { recent: number; overall: number } {
  const rises: number[] = []
  for (let i = 1; i < points.length; i++) rises.push(Math.max(0, points[i]!.tokens - points[i - 1]!.tokens))
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return { recent: mean(rises.slice(-5)), overall: mean(rises) }
}

// The biggest rises from one turn to the next, with what likely caused them.
export function jumps(points: readonly Point[], n: number): { delta: number; turn: number; cause: string | null }[] {
  const out: { delta: number; turn: number; cause: string | null }[] = []
  for (let i = 1; i < points.length; i++) {
    const delta = points[i]!.tokens - points[i - 1]!.tokens
    if (delta > 0) out.push({ delta, turn: points[i]!.turn, cause: points[i]!.cause })
  }
  return out.sort((a, b) => b.delta - a.delta).slice(0, n)
}

// The /context rows that sit in the window: used content by size, then free space.
export function windowRows(
  rows: readonly { name: string; tokens: number; kind: string; color: string }[],
): Category[] {
  const used = rows.filter(r => r.kind === 'used').sort((a, b) => b.tokens - a.tokens)
  const free = rows.filter(r => r.kind === 'free')
  return [...used, ...free].map(({ name, tokens, color, kind }) => ({ name, tokens, color, isFree: kind === 'free' }))
}

type BreakdownLists = {
  categories: readonly { name: string; tokens: number }[]
  skills?: { skillFrontmatter: readonly { name: string; tokens: number }[] }
  memoryFiles: readonly { path: string; tokens: number }[]
  mcpTools: readonly { name: string; serverName: string; tokens: number; isLoaded: boolean }[]
  agents: readonly { agentType: string; tokens: number }[]
}

// Per-item lists for the /context categories that have them, keyed by the category's name.
export function detailsFor(b: BreakdownLists): Record<string, Item[]> {
  const lists: [RegExp, () => Item[]][] = [
    [/skill/i, () => (b.skills?.skillFrontmatter ?? []).map(s => ({ name: s.name, tokens: s.tokens }))],
    [/memory/i, () => b.memoryFiles.map(f => ({ name: f.path.split('/').slice(-2).join('/'), tokens: f.tokens }))],
    [/mcp tools/i, () => b.mcpTools.filter(t => t.isLoaded).map(t => ({ name: `${t.serverName}: ${t.name}`, tokens: t.tokens }))],
    [/agent/i, () => b.agents.map(a => ({ name: a.agentType, tokens: a.tokens }))],
  ]
  const out: Record<string, Item[]> = {}
  for (const { name } of b.categories) {
    const match = lists.find(([re]) => re.test(name))
    const items = match ? match[1]() : []
    if (items.length > 0) out[name] = [...items].sort((x, y) => y.tokens - x.tokens)
  }
  return out
}
