// Pure calculations behind the context dashboard: no engine calls here.
import type { Category, Item, Point } from '../types'

const BARS = '▁▂▃▄▅▆▇█'
const EIGHTHS = ' ▁▂▃▄▅▆▇█'
// A flat guess per image: the transcript does not carry their pixel size.
export const IMAGE_TOKENS = 1500

export type Level = 'ok' | 'warn' | 'bad'
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type WhereRow = { name: string; tokens: number; color: string; category: string | null }
export type ActionCost = { name: string; count: number; average: number }

type Block = { type: string; [field: string]: unknown }
export type Message = { role: 'user' | 'assistant'; content: readonly Block[] }

// ---- formatting ----

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

// Filled and empty parts of a bar, drawn in two colors.
export function barParts(value: number, max: number, width: number): [string, string] {
  const n = max > 0 && width > 0 ? Math.min(width, Math.max(0, Math.round((value / max) * width))) : 0
  return ['━'.repeat(n), '─'.repeat(Math.max(0, width - n))]
}

// Theme color for how full the window is.
export function fillColor(percent: number): 'success' | 'warning' | 'error' {
  return percent < 50 ? 'success' : percent < 80 ? 'warning' : 'error'
}

export const LEVEL_COLOR: Record<Level, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
}
export const LEVEL_TEXT: Record<Level, string> = { ok: 'Норма', warn: 'Внимание', bad: 'Плохо' }

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

// ---- limits ----

export function limitLabel(kind: string): string {
  const span = /five_hour/.test(kind) ? '5 ч' : /seven_day/.test(kind) ? '7 дн' : null
  if (/fable/i.test(kind)) return span ? `Fable ${span}` : 'Fable'
  return span ?? kind
}

const two = (n: number) => String(n).padStart(2, '0')

// Local reset time: HH:MM today, otherwise DD.MM HH:MM.
export function resetLabel(iso: string, now: number): string {
  const at = new Date(iso)
  const today = new Date(now)
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`
  const isToday =
    at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate()
  return isToday ? time : `${two(at.getDate())}.${two(at.getMonth() + 1)} ${time}`
}

function limitLevel(l: Limit): Level {
  const [warn, bad] = /five_hour/.test(l.kind) ? [70, 90] : [80, 95]
  return l.percentUsed > bad ? 'bad' : l.percentUsed >= warn ? 'warn' : 'ok'
}

// ---- pace and verdict ----

// Average rise per turn: over the last five turns and over all of them.
export function pace(points: readonly Point[]): { recent: number; overall: number } {
  const rises: number[] = []
  for (let i = 1; i < points.length; i++) rises.push(Math.max(0, points[i]!.tokens - points[i - 1]!.tokens))
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return { recent: mean(rises.slice(-5)), overall: mean(rises) }
}

const worst = (levels: Level[]): Level =>
  levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'ok'

// The dashboard's verdict: the worst of fill, turns left and limits.
export function verdict(input: {
  total: number
  limit: number
  points: readonly Point[]
  limits: readonly Limit[]
}): { level: Level; fill: number; recent: number; turnsLeft: number } {
  const fill = input.limit > 0 ? (input.total / input.limit) * 100 : 0
  const { recent } = pace(input.points)
  const turnsLeft = recent > 0 ? Math.floor((input.limit - input.total) / recent) : Infinity
  const fillLevel: Level = fill > 80 ? 'bad' : fill >= 50 ? 'warn' : 'ok'
  const turnsLevel: Level = turnsLeft < 3 ? 'bad' : turnsLeft <= 10 ? 'warn' : 'ok'
  return {
    level: worst([fillLevel, turnsLevel, ...input.limits.map(limitLevel)]),
    fill,
    recent,
    turnsLeft,
  }
}

// One hint: the first rule that fires, top to bottom.
export function tip(input: {
  fill: number
  recent: number
  overall: number
  used: number
  where: readonly Item[]
  mcpLoaded: number
  limits: readonly Limit[]
  now: number
}): string {
  const share = (test: (name: string) => boolean) =>
    input.used > 0 ? input.where.filter(i => test(i.name)).reduce((n, i) => n + i.tokens, 0) / input.used : 0

  const hot = input.limits.find(l => l.percentUsed >= 70)
  if (hot) {
    const reset = hot.resetsAt ? `, сброс в ${resetLabel(hot.resetsAt, input.now)}` : ''
    return `лимит ${limitLabel(hot.kind)} на ${Math.round(hot.percentUsed)}%${reset}`
  }
  if (input.fill > 50) return 'если задача сменилась — /compact или новая сессия'
  if (input.overall > 0 && input.recent > 2 * input.overall) return 'ходы тяжелеют — что-то тянет много'
  if (share(n => n === 'Результаты Bash') > 0.2) return 'длинный вывод команд — пиши в лог и читай нужное'
  if (share(n => n === 'Результаты Read') > 0.2) return 'читай файлы частями или ищи нужное поиском'
  if (share(n => n === 'Картинки') > 0.1) return 'скриншоты дорогие — обрезай до нужного'
  if (share(n => n.startsWith('Скилл ')) > 0.1) return 'скилл остаётся в контексте до конца сессии'
  if (share(n => n === 'Аргументы моих вызовов') > 0.15) return 'файлы переписываются целиком — лучше точечные правки'
  if (share(n => n === 'Системные напоминания') > 0.15)
    return 'длинная сессия копит служебные вставки — под новую задачу лучше новая сессия'
  if (input.mcpLoaded > 10_000) return 'отключи MCP-серверы, которыми не пользуешься'
  return 'всё ровно'
}

// ---- breakdown ----

// The /context rows that sit in the window: used content by size, then free space.
export function windowRows(
  rows: readonly { name: string; tokens: number; kind: string; color: string }[],
): Category[] {
  const used = rows.filter(r => r.kind === 'used').sort((a, b) => b.tokens - a.tokens)
  const free = rows.filter(r => r.kind === 'free')
  return [...used, ...free].map(({ name, tokens, color, kind }) => ({ name, tokens, color, isFree: kind === 'free' }))
}

function textOf(content: unknown): { chars: number; images: number } {
  if (typeof content === 'string') return { chars: content.length, images: 0 }
  if (!Array.isArray(content)) return { chars: 0, images: 0 }
  let chars = 0
  let images = 0
  for (const b of content as Block[]) {
    if (b.type === 'text' && typeof b.text === 'string') chars += b.text.length
    if (b.type === 'image') images += 1
  }
  return { chars, images }
}

const SKILL_BODY = /^Base directory for this skill: (\S+)/

type Part = { group: string; action: string | null; tokens: number }

// Every piece of the conversation, with its group and, for actions, the action's kind.
function parts(messages: readonly Message[]): Part[] {
  const out: Part[] = []
  const toolNames = new Map<string, string>()
  for (const m of messages) {
    for (const b of m.content) {
      if (m.role === 'assistant') {
        if (b.type === 'text' && typeof b.text === 'string')
          out.push({ group: 'Мои ответы', action: null, tokens: b.text.length / 4 })
        if (b.type === 'thinking' && typeof b.thinking === 'string')
          out.push({ group: 'Мои рассуждения', action: null, tokens: b.thinking.length / 4 })
        if (b.type === 'tool_use') {
          if (typeof b.id === 'string' && typeof b.name === 'string') toolNames.set(b.id, b.name)
          out.push({ group: 'Аргументы моих вызовов', action: null, tokens: JSON.stringify(b.input ?? {}).length / 4 })
        }
        continue
      }
      if (b.type === 'tool_result') {
        const tool = typeof b.tool_use_id === 'string' ? toolNames.get(b.tool_use_id) : undefined
        const { chars, images } = textOf(b.content)
        const name = kind(tool ?? 'инструмента')
        out.push({ group: `Результаты ${name}`, action: tool === 'Skill' ? null : name, tokens: chars / 4 })
        for (let i = 0; i < images; i++) out.push({ group: 'Картинки', action: 'картинка', tokens: IMAGE_TOKENS })
      } else if (b.type === 'text' && typeof b.text === 'string') {
        const text = b.text.trimStart()
        const skill = SKILL_BODY.exec(text)
        if (skill)
          out.push({ group: `Скилл ${skill[1]!.split('/').filter(Boolean).pop()}`, action: 'скилл', tokens: text.length / 4 })
        else if (text.startsWith('<system-reminder>'))
          out.push({ group: 'Системные напоминания', action: null, tokens: text.length / 4 })
        else out.push({ group: 'Твои сообщения', action: null, tokens: text.length / 4 })
      } else if (b.type === 'image') {
        out.push({ group: 'Картинки', action: 'картинка', tokens: IMAGE_TOKENS })
      }
    }
  }
  return out
}

// What the conversation is made of, by group, in estimated tokens (~4 characters each).
export function messageBreakdown(messages: readonly Message[]): Item[] {
  const sums = new Map<string, number>()
  for (const p of parts(messages)) if (p.tokens > 0) sums.set(p.group, (sums.get(p.group) ?? 0) + p.tokens)
  return [...sums].map(([name, tokens]) => ({ name, tokens: Math.round(tokens) })).sort((a, b) => b.tokens - a.tokens)
}

// Average weight of one action of each kind, heaviest first.
export function actionCosts(messages: readonly Message[]): ActionCost[] {
  const sums = new Map<string, { count: number; tokens: number }>()
  for (const p of parts(messages)) {
    if (!p.action) continue
    const s = sums.get(p.action) ?? { count: 0, tokens: 0 }
    sums.set(p.action, { count: s.count + 1, tokens: s.tokens + p.tokens })
  }
  return [...sums]
    .map(([name, s]) => ({ name, count: s.count, average: Math.round(s.tokens / s.count) }))
    .sort((a, b) => b.average - a.average)
}

// Scale estimates so they add up to the measured total.
export function scaleTo(items: readonly Item[], total: number): Item[] {
  const sum = items.reduce((n, i) => n + i.tokens, 0)
  if (sum === 0 || total <= 0) return [...items]
  return items.map(i => ({ ...i, tokens: Math.round((i.tokens / sum) * total) }))
}

type BreakdownLists = {
  categories: readonly { name: string; tokens: number }[]
  skills?: { skillFrontmatter: readonly { name: string; tokens: number }[] }
  memoryFiles: readonly { path: string; tokens: number }[]
  mcpTools: readonly { name: string; serverName: string; tokens: number; isLoaded: boolean }[]
  agents: readonly { agentType: string; tokens: number }[]
}

// Per-item lists for the categories that have them, keyed by the category's name.
export function detailsFor(b: BreakdownLists, messages: readonly Message[] = []): Record<string, Item[]> {
  const lists: [RegExp, (total: number) => Item[]][] = [
    [/skill/i, () => (b.skills?.skillFrontmatter ?? []).map(s => ({ name: s.name, tokens: s.tokens }))],
    [/memory/i, () => b.memoryFiles.map(f => ({ name: f.path.split('/').slice(-2).join('/'), tokens: f.tokens }))],
    [/mcp tools/i, () => b.mcpTools.filter(t => t.isLoaded).map(t => ({ name: `${t.serverName}: ${t.name}`, tokens: t.tokens }))],
    [/agent/i, () => b.agents.map(a => ({ name: a.agentType, tokens: a.tokens }))],
    [/^messages/i, total => scaleTo(messageBreakdown(messages), total)],
  ]
  const out: Record<string, Item[]> = {}
  for (const { name, tokens } of b.categories) {
    const match = lists.find(([re]) => re.test(name))
    const items = match ? match[1](tokens) : []
    if (items.length > 0) out[name] = [...items].sort((x, y) => y.tokens - x.tokens)
  }
  return out
}

// One list of where the window went: categories, with Messages split into its parts.
export function whereItWent(cats: readonly Category[], details: Record<string, Item[]>, top = 5): WhereRow[] {
  const rows: WhereRow[] = []
  for (const c of cats) {
    if (c.isFree) continue
    const split = /^messages/i.test(c.name) ? details[c.name] : undefined
    if (split) for (const i of split) rows.push({ ...i, color: c.color, category: null })
    else rows.push({ name: c.name, tokens: c.tokens, color: c.color, category: details[c.name] ? c.name : null })
  }
  rows.sort((a, b) => b.tokens - a.tokens)
  const rest = rows.slice(top).reduce((n, r) => n + r.tokens, 0)
  return rest > 0
    ? [...rows.slice(0, top), { name: 'остальное', tokens: rest, color: 'inactive', category: null }]
    : rows.slice(0, top)
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
