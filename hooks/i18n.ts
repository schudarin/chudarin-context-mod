// Interface strings in Russian and English. The language follows Claude Code's `language` setting.

export type Lang = 'ru' | 'en'

type SpeedKind = 'snail' | 'cat' | 'rabbit' | 'rocket'
const ICON: Record<SpeedKind, string> = { snail: '🐌', cat: '🐈', rabbit: '🐇', rocket: '🚀' }
// Minutes, rounded for a forecast: to 5 under an hour, to 10 above.
const roundMinutes = (m: number) => (m < 60 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10)
const duration = (m: number, h: string, min: string) => {
  const r = roundMinutes(m)
  const hours = Math.floor(r / 60)
  const rest = r % 60
  return [hours ? `${hours} ${h}` : '', rest ? `${rest} ${min}` : ''].filter(Boolean).join(' ')
}
// Time a session has run: "2 h 30 min", "40 min", "2 h".
const elapsed = (m: number, h: string, min: string) => {
  const hours = Math.floor(m / 60)
  const rest = m % 60
  return [hours ? `${hours} ${h}` : '', rest || !hours ? `${rest} ${min}` : ''].filter(Boolean).join(' ')
}
// A percent to one decimal, without a trailing .0.
const percent = (x: number, comma: boolean) => {
  const s = String(Math.round(x * 10) / 10)
  return comma ? s.replace('.', ',') : s
}
// Russian noun form for a count: 1 сообщение, 2 сообщения, 5 сообщений.
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many
// How many times faster or slower, to one decimal: 1.74 → 1.7, 0.5 → 2.
const times = (ratio: number) => Math.round((ratio >= 1 ? ratio : 1 / ratio) * 10) / 10

export function langOf(setting: unknown): Lang {
  return typeof setting === 'string' && /^(ru|russian|русск)/i.test(setting.trim()) ? 'ru' : 'en'
}

const ru = {
  cmdPanel: 'Панель: что съедает контекст',
  cmdLine: 'Строка контекста над полем ввода: вкл/выкл',
  panelClosed: 'Панель контекста закрыта.',
  panelOpened: 'Панель открыта. Esc или /ctx закрывает.',
  lineOn: 'Строка контекста включена.',
  lineOff: 'Строка контекста выключена.',
  paneTitle: 'Контекст',
  noData: 'Нет данных до первого ответа.',
  renderFailed: 'отрисовка упала',
  back: '← Назад',
  entryGone: 'Этого пункта сейчас нет в контексте.',
  whatIs: 'Что это',
  whySoMuch: 'Почему столько',
  times: (n: number, avg: string) => `${n} раз, в среднем ${avg} за раз`,
  once: '1 раз',
  heaviest: 'Самые тяжёлые:',
  whatToDo: 'Что делать',
  nothingToDo: 'Ничего: это постоянная часть работы Claude Code.',
  emptyGroup: 'Здесь пока пусто.',
  ofUsed: (tokens: string, pct: string) => `${tokens} · ${pct} занятого`,
  tileContext: 'КОНТЕКСТ',
  tile5h: 'ЛИМИТ 5 Ч',
  tileWeek: 'ЛИМИТ НЕДЕЛЯ',
  ofWindow: (used: string, window: string) => `${used} из ${window}`,
  turnsLeft: (n: number) => `хватит на ~${n} ходов`,
  limitLeft: (minutes: number) => `хватит на ~${duration(minutes, 'ч', 'мин')}`,
  limitUntilReset: 'хватит до сброса',
  hintFill: 'Вставить в чат',
  hintHide: 'Скрыть',
  hintSent: '✓ Отправлено Claude',
  adviceHidden: '✓ Совет скрыт',
  hideAdvice: 'Скрыть совет',
  neverShow: 'Не показывать снова',
  hintRan: '✓ Команда запущена',
  speed: (kind: SpeedKind, ratio: number) => {
    if (kind === 'cat') return `${ICON.cat} контекст растёт как обычно`
    const x = times(ratio)
    const word = Number.isInteger(x) && x >= 5 ? 'раз' : 'раза'
    return `${ICON[kind]} контекст растёт в ${String(x).replace('.', ',')} ${word} ${kind === 'snail' ? 'медленнее' : 'быстрее'} обычного`
  },
  resets: (at: string) => `сброс ${at}`,
  wasReset: (at: string) => `сбросился в ${at}`,
  stale: (at: string) => `Данные устарели, последнее обновление в ${at}`,
  refresh: 'Обновить',
  whatFills: 'Чем занят контекст',
  prices: 'Сколько стоит действие',
  pricesHint: 'чем дешевле способ, тем дольше хватит контекста',
  noActions: 'Пока нет действий.',
  session: 'За сессию',
  since: (at: string) => `с ${at}`,
  sessionRuns: (minutes: number, prompts: number) =>
    `Идёт ${elapsed(minutes, 'ч', 'мин')}, ${prompts} ${plural(prompts, 'твоё сообщение', 'твоих сообщения', 'твоих сообщений')}`,
  sessionSpent: (five: number, week: number | null) =>
    `Съела ${percent(five, true)}% лимита на 5 часов${week === null ? '' : ` и ${percent(week, true)}% недельного`}`,
  perMessage: (pct: number) => `Одно сообщение в среднем: ${percent(pct, true)}% лимита на 5 часов`,
  compactsLine: (n: number, dropped: string) => (n === 0 ? 'Компактов не было' : `Компактов: ${n}, сбросили ${dropped}`),
  growth: 'График загрузки контекста',
  turnRange: (from: number, to: number) => `ход ${from} → ход ${to}`,
  turn: (n: number) => `ход ${n}`,
  conversation: 'переписка',
  compactLine: (how: string, before: string, after: string) => `компакт ${how}: ${before} → ${after}`,
  manual: 'вручную',
  auto: 'автоматически',
  plugin: 'плагином',
  groupTools: 'Работа инструментов',
  groupService: 'Служебное Claude Code',
  groupChat: 'Наш разговор',
  groupRules: 'Скиллы и правила',
  actWrite: 'Записать файл',
  actEdit: 'Правка файла',
  actNotebook: 'Правка ноутбука',
  actRead: 'Прочитать файл',
  actBash: 'Команда в Bash',
  actWebSearch: 'Поиск в вебе',
  actWebFetch: 'Загрузить страницу',
  actSearch: 'Поиск по файлам',
  actAgent: 'Субагент',
  actImage: 'Скриншот',
  actSkill: 'Скилл',
}

const en: typeof ru = {
  cmdPanel: 'Panel: what fills your context',
  cmdLine: 'Context line above the prompt: on/off',
  panelClosed: 'Context panel closed.',
  panelOpened: 'Panel open. Esc or /ctx closes it.',
  lineOn: 'Context line on.',
  lineOff: 'Context line off.',
  paneTitle: 'Context',
  noData: 'No data until the first reply.',
  renderFailed: 'drawing failed',
  back: '← Back',
  entryGone: 'This item is not in the context right now.',
  whatIs: 'What it is',
  whySoMuch: 'Why so much',
  times: (n, avg) => `${n} times, ${avg} each on average`,
  once: 'once',
  heaviest: 'Heaviest:',
  whatToDo: 'What to do',
  nothingToDo: 'Nothing: this is a fixed part of how Claude Code works.',
  emptyGroup: 'Nothing here yet.',
  ofUsed: (tokens, pct) => `${tokens} · ${pct} of used`,
  tileContext: 'CONTEXT',
  tile5h: '5-HOUR LIMIT',
  tileWeek: 'WEEKLY LIMIT',
  ofWindow: (used, window) => `${used} of ${window}`,
  turnsLeft: n => `about ${n} turns left`,
  limitLeft: minutes => `about ${duration(minutes, 'h', 'min')} left`,
  limitUntilReset: 'lasts until reset',
  hintFill: 'Put in chat',
  hintHide: 'Hide',
  hintSent: '✓ Sent to Claude',
  adviceHidden: '✓ Advice hidden',
  hideAdvice: 'Hide advice',
  neverShow: "Don't show again",
  hintRan: '✓ Command run',
  speed: (kind, ratio) =>
    kind === 'cat'
      ? `${ICON.cat} context grows at your usual pace`
      : `${ICON[kind]} context grows ${times(ratio)}× ${kind === 'snail' ? 'slower' : 'faster'} than usual`,
  resets: at => `resets ${at}`,
  wasReset: at => `reset at ${at}`,
  stale: at => `Data is stale, last updated at ${at}`,
  refresh: 'Refresh',
  whatFills: 'What fills the context',
  prices: 'What an action costs',
  pricesHint: 'the cheaper the way, the longer the context lasts',
  noActions: 'No actions yet.',
  session: 'This session',
  since: at => `since ${at}`,
  sessionRuns: (minutes, prompts) => `Running ${elapsed(minutes, 'h', 'min')}, ${prompts} ${prompts === 1 ? 'message' : 'messages'} from you`,
  sessionSpent: (five, week) =>
    `Used ${percent(five, false)}% of the 5-hour limit${week === null ? '' : ` and ${percent(week, false)}% of the weekly one`}`,
  perMessage: pct => `One message on average: ${percent(pct, false)}% of the 5-hour limit`,
  compactsLine: (n, dropped) => (n === 0 ? 'No compactions' : `Compactions: ${n}, dropped ${dropped}`),
  growth: 'Context load chart',
  turnRange: (from, to) => `turn ${from} → turn ${to}`,
  turn: n => `turn ${n}`,
  conversation: 'conversation',
  compactLine: (how, before, after) => `${how} compaction: ${before} → ${after}`,
  manual: 'manual',
  auto: 'automatic',
  plugin: 'plugin',
  groupTools: 'Tool work',
  groupService: 'Claude Code itself',
  groupChat: 'Our conversation',
  groupRules: 'Skills and rules',
  actWrite: 'Write a file',
  actEdit: 'Edit a file',
  actNotebook: 'Edit a notebook',
  actRead: 'Read a file',
  actBash: 'Bash command',
  actWebSearch: 'Web search',
  actWebFetch: 'Fetch a page',
  actSearch: 'Search files',
  actAgent: 'Subagent',
  actImage: 'Screenshot',
  actSkill: 'Skill',
}

export const UI: Record<Lang, typeof ru> = { ru, en }
export type Strings = typeof ru
