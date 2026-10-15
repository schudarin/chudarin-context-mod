// Plain-language names and help for every kind of entry the dashboard shows.

export type GroupId = 'tools' | 'service' | 'chat' | 'rules'

export type Help = {
  label: string
  group: GroupId
  what: string
  // What the person can do about it; null when nothing can be done.
  todo: string | null
  // Past-tense verb agreeing with the label, for the insight line.
  took: 'занял' | 'заняла' | 'заняли' | 'заняло'
}

const HELP: Record<string, Help> = {
  'result:Bash': {
    label: 'Вывод команд Bash',
    group: 'tools',
    what: 'Всё, что напечатали команды, которые я запускал: тесты, сборка, поиск, git. Вывод остаётся в контексте до конца сессии.',
    todo: 'Пиши длинный вывод в файл и читай нужное.',
    took: 'занял',
  },
  'result:Read': {
    label: 'Прочитанные файлы',
    group: 'tools',
    what: 'Содержимое файлов, которые я прочитал. Файл остаётся в контексте целиком, даже если нужна была пара строк.',
    todo: 'Читай файлы частями или ищи нужное поиском.',
    took: 'заняли',
  },
  'result:WebSearch': {
    label: 'Поиск в вебе',
    group: 'tools',
    what: 'Результаты поиска в интернете: заголовки, ссылки, выдержки.',
    todo: 'Ищи точнее: один запрос вместо нескольких.',
    took: 'занял',
  },
  'result:WebFetch': {
    label: 'Загруженные страницы',
    group: 'tools',
    what: 'Веб-страницы, которые я загрузил и пересказал в текст.',
    todo: 'Проси выжимку нужного раздела, а не всю страницу.',
    took: 'заняли',
  },
  'result:Grep': {
    label: 'Поиск по файлам',
    group: 'tools',
    what: 'Найденные строки и пути файлов.',
    todo: 'Сужай поиск папкой или шаблоном.',
    took: 'занял',
  },
  'result:Glob': {
    label: 'Списки файлов',
    group: 'tools',
    what: 'Пути файлов, найденные по шаблону.',
    todo: 'Сужай шаблон.',
    took: 'заняли',
  },
  'result:Agent': {
    label: 'Отчёты субагентов',
    group: 'tools',
    what: 'Итоговые отчёты субагентов. Их собственная работа в этот контекст не попадает, только отчёт.',
    todo: null,
    took: 'заняли',
  },
  'result:AskUserQuestion': {
    label: 'Твои ответы на вопросы',
    group: 'chat',
    what: 'Варианты и ответы из вопросов, которые я задавал.',
    todo: null,
    took: 'заняли',
  },
  'result:ToolSearch': {
    label: 'Подгруженные схемы',
    group: 'service',
    what: 'Описания инструментов, которые я подгрузил по ходу работы.',
    todo: null,
    took: 'заняли',
  },
  code: {
    label: 'Код, который я написал',
    group: 'tools',
    what: 'Содержимое файлов, которые я создал или поправил через Write и Edit. Я отправляю текст целиком, и он остаётся в контексте.',
    todo: 'Проси точечные правки вместо переписывания файла целиком.',
    took: 'занял',
  },
  args: {
    label: 'Аргументы вызовов',
    group: 'tools',
    what: 'Команды, запросы и параметры, с которыми я вызывал инструменты.',
    todo: null,
    took: 'заняли',
  },
  reminders: {
    label: 'Служебные вставки',
    group: 'service',
    what: 'Сообщения, которые Claude Code сам добавляет в разговор: список скиллов, изменения в файлах, состояние задач, подсказки хуков. Чем длиннее сессия, тем их больше.',
    todo: 'Под новую задачу начинай новую сессию.',
    took: 'заняли',
  },
  'skills-loaded': {
    label: 'Загруженные скиллы',
    group: 'rules',
    what: 'Полный текст скиллов, которые я вызвал. Скилл остаётся в контексте до конца сессии.',
    todo: 'Вызывай скиллы, только когда они нужны.',
    took: 'заняли',
  },
  images: {
    label: 'Скриншоты и картинки',
    group: 'chat',
    what: 'Картинки, которые ты прислал или вернули инструменты. Вес оценён грубо: 1.5k за штуку.',
    todo: 'Обрезай скриншот до нужного или присылай текст ошибки.',
    took: 'заняли',
  },
  user: {
    label: 'Твои сообщения',
    group: 'chat',
    what: 'Всё, что ты написал или вставил в чат.',
    todo: null,
    took: 'заняли',
  },
  assistant: {
    label: 'Мои ответы',
    group: 'chat',
    what: 'Текст моих ответов тебе.',
    todo: 'Проси отвечать короче, если ответы длинные.',
    took: 'заняли',
  },
  thinking: {
    label: 'Мои рассуждения',
    group: 'chat',
    what: 'Мои рассуждения перед ответом, которые возвращаются в контекст.',
    todo: null,
    took: 'заняли',
  },
  'cat:System prompt': {
    label: 'Системный промпт',
    group: 'service',
    what: 'Базовые инструкции Claude Code. Есть в каждой сессии, уменьшить нельзя.',
    todo: null,
    took: 'занял',
  },
  'cat:System tools': {
    label: 'Схемы встроенных инструментов',
    group: 'service',
    what: 'Описания Bash, Read, Edit и других встроенных инструментов. Отправляются с каждым запросом.',
    todo: null,
    took: 'заняли',
  },
  'cat:MCP tools': {
    label: 'Схемы MCP-инструментов',
    group: 'service',
    what: 'Описания подгруженных инструментов MCP-серверов.',
    todo: 'Отключай MCP-серверы, которыми не пользуешься.',
    took: 'заняли',
  },
  'cat:MCP server instructions': {
    label: 'Инструкции MCP-серверов',
    group: 'service',
    what: 'Правила, которые MCP-серверы добавляют в начало сессии.',
    todo: 'Отключай MCP-серверы, которыми не пользуешься.',
    took: 'заняли',
  },
  'cat:Custom agents': {
    label: 'Описания агентов',
    group: 'rules',
    what: 'Описания твоих агентов из .claude/agents, чтобы я знал, кого можно позвать.',
    todo: null,
    took: 'заняли',
  },
  'cat:Memory files': {
    label: 'CLAUDE.md и память',
    group: 'rules',
    what: 'Твои файлы инструкций: CLAUDE.md и индекс памяти. Загружаются в каждую сессию.',
    todo: 'Держи CLAUDE.md коротким, детали выноси в отдельные файлы.',
    took: 'заняли',
  },
  'cat:Skills': {
    label: 'Список скиллов',
    group: 'rules',
    what: 'Короткие описания всех установленных скиллов, чтобы я знал, какие есть.',
    todo: 'Удали скиллы, которыми не пользуешься.',
    took: 'занял',
  },
}

export function helpFor(id: string): Help {
  const known = HELP[id]
  if (known) return known
  if (id.startsWith('result:MCP ')) {
    const server = id.slice('result:MCP '.length)
    return {
      label: `Ответы MCP ${server}`,
      group: 'tools',
      what: `Данные, которые вернул MCP-сервер ${server}.`,
      todo: 'Проси у сервера меньше полей или меньше строк.',
      took: 'заняли',
    }
  }
  if (id.startsWith('result:')) {
    const tool = id.slice('result:'.length)
    return {
      label: `Результаты ${tool}`,
      group: 'tools',
      what: `Ответы инструмента ${tool}.`,
      todo: null,
      took: 'заняли',
    }
  }
  const name = id.startsWith('cat:') ? id.slice('cat:'.length) : id
  return {
    label: name,
    group: 'service',
    what: 'Часть контекста, которую /context считает отдельной категорией.',
    todo: null,
    took: 'заняла',
  }
}
