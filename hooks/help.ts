// Plain-language names and help for every kind of entry the dashboard shows, in Russian and English.
import type { Lang } from './i18n'

export type GroupId = 'tools' | 'service' | 'chat' | 'rules'

type Text = {
  label: string
  what: string
  // What the person can do about it; null when nothing can be done.
  todo: string | null
}

export type Help = Text & {
  group: GroupId
  // The insight sentence: "<label> <took> <tokens>. <todo>"
  took: string
}

type Entry = {
  group: GroupId
  // Past-tense Russian verb agreeing with the label.
  took: 'занял' | 'заняла' | 'заняли' | 'заняло'
  ru: Text
  en: Text
}

const HELP: Record<string, Entry> = {
  'result:Bash': {
    group: 'tools',
    took: 'занял',
    ru: {
      label: 'Вывод команд Bash',
      what: 'Всё, что напечатали команды, которые я запускал: тесты, сборка, поиск, git. Вывод остаётся в контексте до конца сессии.',
      todo: 'Пиши длинный вывод в файл и читай нужное.',
    },
    en: {
      label: 'Bash output',
      what: 'Everything the commands Claude ran printed: tests, builds, searches, git. The output stays in the context until the session ends.',
      todo: 'Send long output to a file and read only what you need.',
    },
  },
  'result:Read': {
    group: 'tools',
    took: 'заняли',
    ru: {
      label: 'Прочитанные файлы',
      what: 'Содержимое файлов, которые я прочитал. Файл остаётся в контексте целиком, даже если нужна была пара строк.',
      todo: 'Читай файлы частями или ищи нужное поиском.',
    },
    en: {
      label: 'Files read',
      what: 'The contents of files Claude read. A whole file stays in the context even when only a few lines were needed.',
      todo: 'Read files in parts, or search for what you need.',
    },
  },
  'result:WebSearch': {
    group: 'tools',
    took: 'занял',
    ru: { label: 'Поиск в вебе', what: 'Результаты поиска в интернете: заголовки, ссылки, выдержки.', todo: 'Ищи точнее: один запрос вместо нескольких.' },
    en: { label: 'Web search', what: 'Web search results: titles, links, snippets.', todo: 'Search more precisely: one query instead of several.' },
  },
  'result:WebFetch': {
    group: 'tools',
    took: 'заняли',
    ru: {
      label: 'Загруженные страницы',
      what: 'Веб-страницы, которые я загрузил и пересказал в текст.',
      todo: 'Проси выжимку нужного раздела, а не всю страницу.',
    },
    en: {
      label: 'Fetched pages',
      what: 'Web pages Claude fetched and turned into text.',
      todo: 'Ask for the section you need, not the whole page.',
    },
  },
  'result:Grep': {
    group: 'tools',
    took: 'занял',
    ru: { label: 'Поиск по файлам', what: 'Найденные строки и пути файлов.', todo: 'Сужай поиск папкой или шаблоном.' },
    en: { label: 'File search', what: 'Matching lines and file paths.', todo: 'Narrow the search to a folder or a pattern.' },
  },
  'result:Glob': {
    group: 'tools',
    took: 'заняли',
    ru: { label: 'Списки файлов', what: 'Пути файлов, найденные по шаблону.', todo: 'Сужай шаблон.' },
    en: { label: 'File lists', what: 'File paths matched by a pattern.', todo: 'Narrow the pattern.' },
  },
  'result:Agent': {
    group: 'tools',
    took: 'заняли',
    ru: {
      label: 'Отчёты субагентов',
      what: 'Итоговые отчёты субагентов. Их собственная работа в этот контекст не попадает, только отчёт.',
      todo: null,
    },
    en: {
      label: 'Subagent reports',
      what: "Final reports from subagents. Their own work stays out of this context; only the report comes back.",
      todo: null,
    },
  },
  'result:AskUserQuestion': {
    group: 'chat',
    took: 'заняли',
    ru: { label: 'Твои ответы на вопросы', what: 'Варианты и ответы из вопросов, которые я задавал.', todo: null },
    en: { label: 'Your answers to questions', what: 'Options and answers from the questions Claude asked.', todo: null },
  },
  'result:ToolSearch': {
    group: 'service',
    took: 'заняли',
    ru: { label: 'Подгруженные схемы', what: 'Описания инструментов, которые я подгрузил по ходу работы.', todo: null },
    en: { label: 'Loaded tool schemas', what: 'Descriptions of tools Claude loaded along the way.', todo: null },
  },
  code: {
    group: 'tools',
    took: 'занял',
    ru: {
      label: 'Код, который я написал',
      what: 'Содержимое файлов, которые я создал или поправил через Write и Edit. Я отправляю текст целиком, и он остаётся в контексте.',
      todo: 'Проси точечные правки вместо переписывания файла целиком.',
    },
    en: {
      label: 'Code Claude wrote',
      what: 'The contents of files Claude created or changed with Write and Edit. The text is sent in full and stays in the context.',
      todo: 'Ask for targeted edits instead of rewriting whole files.',
    },
  },
  args: {
    group: 'tools',
    took: 'заняли',
    ru: { label: 'Аргументы вызовов', what: 'Команды, запросы и параметры, с которыми я вызывал инструменты.', todo: null },
    en: { label: 'Tool call arguments', what: 'Commands, queries and parameters Claude passed to tools.', todo: null },
  },
  reminders: {
    group: 'service',
    took: 'заняли',
    ru: {
      label: 'Служебные вставки',
      what: 'Сообщения, которые Claude Code сам добавляет в разговор: список скиллов, изменения в файлах, состояние задач, подсказки хуков. Чем длиннее сессия, тем их больше.',
      todo: 'Под новую задачу начинай новую сессию.',
    },
    en: {
      label: 'System reminders',
      what: 'Messages Claude Code adds to the conversation on its own: the skill list, file changes, task state, hook notes. The longer the session, the more of them.',
      todo: 'Start a new session for a new task.',
    },
  },
  'skills-loaded': {
    group: 'rules',
    took: 'заняли',
    ru: {
      label: 'Загруженные скиллы',
      what: 'Полный текст скиллов, которые я вызвал. Скилл остаётся в контексте до конца сессии.',
      todo: 'Вызывай скиллы, только когда они нужны.',
    },
    en: {
      label: 'Loaded skills',
      what: 'The full text of skills Claude invoked. A skill stays in the context until the session ends.',
      todo: 'Invoke skills only when you need them.',
    },
  },
  images: {
    group: 'chat',
    took: 'заняли',
    ru: {
      label: 'Скриншоты и картинки',
      what: 'Картинки, которые ты прислал или вернули инструменты. Вес оценён грубо: 1.5k за штуку.',
      todo: 'Обрезай скриншот до нужного или присылай текст ошибки.',
    },
    en: {
      label: 'Screenshots and images',
      what: 'Images you sent or tools returned. The weight is a rough guess: 1.5k each.',
      todo: 'Crop screenshots to what matters, or paste the error text.',
    },
  },
  user: {
    group: 'chat',
    took: 'заняли',
    ru: { label: 'Твои сообщения', what: 'Всё, что ты написал или вставил в чат.', todo: null },
    en: { label: 'Your messages', what: 'Everything you typed or pasted into the chat.', todo: null },
  },
  assistant: {
    group: 'chat',
    took: 'заняли',
    ru: { label: 'Мои ответы', what: 'Текст моих ответов тебе.', todo: 'Проси отвечать короче, если ответы длинные.' },
    en: { label: "Claude's replies", what: "The text of Claude's replies to you.", todo: 'Ask for shorter replies if they run long.' },
  },
  thinking: {
    group: 'chat',
    took: 'заняли',
    ru: { label: 'Мои рассуждения', what: 'Мои рассуждения перед ответом, которые возвращаются в контекст.', todo: null },
    en: { label: "Claude's thinking", what: 'Reasoning before a reply that goes back into the context.', todo: null },
  },
  'cat:System prompt': {
    group: 'service',
    took: 'занял',
    ru: { label: 'Системный промпт', what: 'Базовые инструкции Claude Code. Есть в каждой сессии, уменьшить нельзя.', todo: null },
    en: { label: 'System prompt', what: "Claude Code's base instructions. Present in every session; it cannot be reduced.", todo: null },
  },
  'cat:System tools': {
    group: 'service',
    took: 'заняли',
    ru: {
      label: 'Схемы встроенных инструментов',
      what: 'Описания Bash, Read, Edit и других встроенных инструментов. Отправляются с каждым запросом.',
      todo: null,
    },
    en: {
      label: 'Built-in tool schemas',
      what: 'Descriptions of Bash, Read, Edit and the other built-in tools. Sent with every request.',
      todo: null,
    },
  },
  'cat:MCP tools': {
    group: 'service',
    took: 'заняли',
    ru: {
      label: 'Схемы MCP-инструментов',
      what: 'Описания подгруженных инструментов MCP-серверов.',
      todo: 'Отключай MCP-серверы, которыми не пользуешься.',
    },
    en: { label: 'MCP tool schemas', what: 'Descriptions of loaded MCP server tools.', todo: "Turn off MCP servers you don't use." },
  },
  'cat:MCP server instructions': {
    group: 'service',
    took: 'заняли',
    ru: {
      label: 'Инструкции MCP-серверов',
      what: 'Правила, которые MCP-серверы добавляют в начало сессии.',
      todo: 'Отключай MCP-серверы, которыми не пользуешься.',
    },
    en: {
      label: 'MCP server instructions',
      what: 'Rules MCP servers add at the start of a session.',
      todo: "Turn off MCP servers you don't use.",
    },
  },
  'cat:Custom agents': {
    group: 'rules',
    took: 'заняли',
    ru: { label: 'Описания агентов', what: 'Описания твоих агентов из .claude/agents, чтобы я знал, кого можно позвать.', todo: null },
    en: { label: 'Agent descriptions', what: 'Descriptions of your agents from .claude/agents, so Claude knows whom it can call.', todo: null },
  },
  'cat:Memory files': {
    group: 'rules',
    took: 'заняли',
    ru: {
      label: 'CLAUDE.md и память',
      what: 'Твои файлы инструкций: CLAUDE.md и индекс памяти. Загружаются в каждую сессию.',
      todo: 'Держи CLAUDE.md коротким, детали выноси в отдельные файлы.',
    },
    en: {
      label: 'CLAUDE.md and memory',
      what: 'Your instruction files: CLAUDE.md and the memory index. Loaded into every session.',
      todo: 'Keep CLAUDE.md short; move details into separate files.',
    },
  },
  'cat:Skills': {
    group: 'rules',
    took: 'занял',
    ru: {
      label: 'Список скиллов',
      what: 'Короткие описания всех установленных скиллов, чтобы я знал, какие есть.',
      todo: 'Удали скиллы, которыми не пользуешься.',
    },
    en: {
      label: 'Skill list',
      what: 'Short descriptions of every installed skill, so Claude knows what is there.',
      todo: "Remove skills you don't use.",
    },
  },
}

export const HELP_IDS = Object.keys(HELP)

const flat = (e: Entry, lang: Lang): Help => ({ ...e[lang], group: e.group, took: lang === 'ru' ? e.took : 'took' })

export function helpFor(id: string, lang: Lang): Help {
  const known = HELP[id]
  if (known) return flat(known, lang)
  if (id.startsWith('result:MCP ')) {
    const server = id.slice('result:MCP '.length)
    return flat(
      {
        group: 'tools',
        took: 'заняли',
        ru: {
          label: `Ответы MCP ${server}`,
          what: `Данные, которые вернул MCP-сервер ${server}.`,
          todo: 'Проси у сервера меньше полей или меньше строк.',
        },
        en: { label: `MCP ${server} replies`, what: `Data the ${server} MCP server returned.`, todo: 'Ask the server for fewer fields or rows.' },
      },
      lang,
    )
  }
  if (id.startsWith('result:')) {
    const tool = id.slice('result:'.length)
    return flat(
      {
        group: 'tools',
        took: 'заняли',
        ru: { label: `Результаты ${tool}`, what: `Ответы инструмента ${tool}.`, todo: null },
        en: { label: `${tool} results`, what: `What the ${tool} tool returned.`, todo: null },
      },
      lang,
    )
  }
  const name = id.startsWith('cat:') ? id.slice('cat:'.length) : id
  return flat(
    {
      group: 'service',
      took: 'заняла',
      ru: { label: name, what: 'Часть контекста, которую /context считает отдельной категорией.', todo: null },
      en: { label: name, what: 'A part of the context that /context counts as its own category.', todo: null },
    },
    lang,
  )
}
