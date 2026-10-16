// Turns /context categories and the conversation into the dashboard's groups and entries.
import type { Category, Item } from '../types'

import { type GroupId, helpFor } from './help'
import { type Lang, type Strings, UI } from './i18n'
import { IMAGE_TOKENS, type Message, k, kind, label } from './model'

export type Call = { label: string; tokens: number }
export type Entry = { id: string; label: string; group: GroupId; tokens: number; count: number; top: Call[] }
export type GroupTotal = { id: GroupId; label: string; color: string; tokens: number }
export type Price = { name: string; count: number; average: number }

// Fixed order: a group keeps its color whatever its size. Blue, orange, aqua, violet from the
// dataviz categorical palette, aqua and violet a step darker so one set works on any terminal:
// checked with the dataviz validator on #000000, #1a1a19, #282828, #eeeeee, #f5f5f0 and #ffffff,
// every check passing on each. Yellow is skipped: it means "warning" on the meters.
export const GROUPS: readonly { id: GroupId; text: keyof Strings; color: string }[] = [
  { id: 'tools', text: 'groupTools', color: '#3987e5' },
  { id: 'service', text: 'groupService', color: '#d95926' },
  { id: 'chat', text: 'groupChat', color: '#178f66' },
  { id: 'rules', text: 'groupRules', color: '#7a6ce4' },
]

export function groupLabel(id: GroupId, lang: Lang): string {
  const g = GROUPS.find(x => x.id === id) ?? GROUPS[0]!
  return UI[lang][g.text] as string
}

const TOP_CALLS = 5
const CODE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit'])
const SKILL_BODY = /^Base directory for this skill: (\S+)/

type Block = { type: string; [field: string]: unknown }

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

type Piece = { id: string; tokens: number; call: string | null; action: string | null; callId: string | null }

// Every piece of the conversation, tagged with its entry id, the call it belongs to and the action kind.
function pieces(messages: readonly Message[]): Piece[] {
  const out: Piece[] = []
  const calls = new Map<string, { name: string; label: string }>()
  for (const m of messages) {
    for (const b of m.content) {
      if (m.role === 'assistant') {
        if (b.type === 'text' && typeof b.text === 'string')
          out.push({ id: 'assistant', tokens: b.text.length / 4, call: null, action: null, callId: null })
        if (b.type === 'thinking' && typeof b.thinking === 'string')
          out.push({ id: 'thinking', tokens: b.thinking.length / 4, call: null, action: null, callId: null })
        if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
          const input = (b.input ?? {}) as Record<string, unknown>
          const name = b.name
          const callLabel = label({ ...input, tool: name })
          calls.set(b.id, { name, label: callLabel })
          out.push({
            id: CODE_TOOLS.has(name) ? 'code' : 'args',
            tokens: JSON.stringify(input).length / 4,
            call: callLabel,
            action: name,
            callId: b.id,
          })
        }
        continue
      }
      if (b.type === 'tool_result') {
        const call = typeof b.tool_use_id === 'string' ? calls.get(b.tool_use_id) : undefined
        const { chars, images } = textOf(b.content)
        // A Skill call answers with one line; its body arrives as its own row below.
        const id = call?.name === 'Skill' ? 'args' : `result:${kind(call?.name ?? 'tool')}`
        out.push({
          id,
          tokens: chars / 4,
          call: call?.label ?? null,
          action: call?.name ?? null,
          callId: typeof b.tool_use_id === 'string' ? b.tool_use_id : null,
        })
        for (let i = 0; i < images; i++)
          out.push({ id: 'images', tokens: IMAGE_TOKENS, call: null, action: 'image', callId: null })
      } else if (b.type === 'text' && typeof b.text === 'string') {
        const text = b.text.trimStart()
        const skill = SKILL_BODY.exec(text)
        if (skill) {
          const name = skill[1]!.split('/').filter(Boolean).pop() ?? 'skill'
          out.push({ id: 'skills-loaded', tokens: text.length / 4, call: name, action: 'skill', callId: null })
        } else if (text.startsWith('<system-reminder>')) {
          out.push({ id: 'reminders', tokens: text.length / 4, call: null, action: null, callId: null })
        } else {
          out.push({ id: 'user', tokens: text.length / 4, call: null, action: null, callId: null })
        }
      } else if (b.type === 'image') {
        out.push({ id: 'images', tokens: IMAGE_TOKENS, call: null, action: 'image', callId: null })
      }
    }
  }
  return out
}

// All entries: categories from /context, with Messages replaced by the parts of the conversation.
export function buildEntries(
  categories: readonly Category[],
  details: Record<string, Item[]>,
  messages: readonly Message[],
  lang: Lang,
): Entry[] {
  const entries: Entry[] = []
  for (const c of categories) {
    if (c.isFree || /^messages/i.test(c.name) || c.tokens <= 0) continue
    const id = `cat:${c.name}`
    const help = helpFor(id, lang)
    const list = details[c.name] ?? []
    entries.push({
      id,
      label: help.label,
      group: help.group,
      tokens: c.tokens,
      count: list.length,
      top: list.slice(0, TOP_CALLS).map(i => ({ label: i.name, tokens: i.tokens })),
    })
  }

  const sums = new Map<string, { tokens: number; count: number; calls: Map<string, number> }>()
  for (const p of pieces(messages)) {
    const s = sums.get(p.id) ?? { tokens: 0, count: 0, calls: new Map<string, number>() }
    s.tokens += p.tokens
    s.count += 1
    if (p.call) s.calls.set(p.call, (s.calls.get(p.call) ?? 0) + p.tokens)
    sums.set(p.id, s)
  }
  const raw = [...sums.values()].reduce((n, s) => n + s.tokens, 0)
  const measured = categories.find(c => /^messages/i.test(c.name))?.tokens ?? 0
  const scale = raw > 0 && measured > 0 ? measured / raw : 1

  for (const [id, s] of sums) {
    const tokens = Math.round(s.tokens * scale)
    if (tokens <= 0) continue
    const help = helpFor(id, lang)
    entries.push({
      id,
      label: help.label,
      group: help.group,
      tokens,
      count: s.count,
      top: [...s.calls]
        .map(([callLabel, t]) => ({ label: callLabel, tokens: Math.round(t * scale) }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, TOP_CALLS),
    })
  }
  return entries.sort((a, b) => b.tokens - a.tokens)
}

export function groupTotals(entries: readonly Entry[], lang: Lang): GroupTotal[] {
  return GROUPS.map(g => ({
    id: g.id,
    label: groupLabel(g.id, lang),
    color: g.color,
    tokens: entries.filter(e => e.group === g.id).reduce((n, e) => n + e.tokens, 0),
  }))
}

const ACTION_TEXT: Record<string, keyof Strings> = {
  Write: 'actWrite',
  Edit: 'actEdit',
  MultiEdit: 'actEdit',
  NotebookEdit: 'actNotebook',
  Read: 'actRead',
  Bash: 'actBash',
  WebSearch: 'actWebSearch',
  WebFetch: 'actWebFetch',
  Grep: 'actSearch',
  Glob: 'actSearch',
  Agent: 'actAgent',
  image: 'actImage',
  skill: 'actSkill',
}

function actionName(action: string, lang: Lang): string | null {
  if (action === 'Skill' || action === 'AskUserQuestion' || action === 'ToolSearch') return null
  if (action.startsWith('mcp__')) return `MCP ${action.split('__')[1]}`
  const text = ACTION_TEXT[action]
  return text ? (UI[lang][text] as string) : action
}

// Average price of one action: what I sent plus what came back, in estimated tokens.
export function actionPrices(messages: readonly Message[], lang: Lang): Price[] {
  const perCall = new Map<string, { action: string; tokens: number }>()
  const single: { action: string; tokens: number }[] = []
  for (const p of pieces(messages)) {
    if (!p.action) continue
    if (p.callId) {
      const c = perCall.get(p.callId) ?? { action: p.action, tokens: 0 }
      c.tokens += p.tokens
      perCall.set(p.callId, c)
    } else {
      single.push({ action: p.action, tokens: p.tokens })
    }
  }
  const sums = new Map<string, { count: number; tokens: number }>()
  for (const { action, tokens } of [...perCall.values(), ...single]) {
    const name = actionName(action, lang)
    if (!name) continue
    const s = sums.get(name) ?? { count: 0, tokens: 0 }
    sums.set(name, { count: s.count + 1, tokens: s.tokens + tokens })
  }
  return [...sums]
    .map(([name, s]) => ({ name, count: s.count, average: Math.round(s.tokens / s.count) }))
    .filter(p => p.average > 0)
    .sort((a, b) => b.average - a.average)
}

// One line worth acting on, or nothing.
export type Hint = { id: string; text: string; prompt: string | null }

// The biggest entry with advice, if it holds over a tenth of the used context.
// `hidden`: hints the person acted on or hid this session.
export function insight(
  entries: readonly Entry[],
  fill: number,
  used: number,
  lang: Lang,
  hidden: readonly string[] = [],
): Hint | null {
  for (const e of entries) {
    const help = helpFor(e.id, lang)
    if (!help.todo || hidden.includes(e.id)) continue
    if (used > 0 && e.tokens / used > 0.1)
      return { id: e.id, text: `${e.label} ${help.took} ${k(e.tokens)}. ${help.todo}`, prompt: help.prompt }
    return null
  }
  return null
}
