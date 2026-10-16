import { expect, test } from 'claude-code/testing'

import { helpFor, HELP_IDS } from './help'
import { langOf, UI } from './i18n'

test('langOf reads the Claude Code language setting', () => {
  expect(langOf('Russian')).toBe('ru')
  expect(langOf('русский')).toBe('ru')
  expect(langOf('ru')).toBe('ru')
  expect(langOf('English')).toBe('en')
  expect(langOf('Spanish')).toBe('en')
  expect(langOf(undefined)).toBe('en')
})

test('every interface string exists in both languages', () => {
  expect(Object.keys(UI.en).sort()).toEqual(Object.keys(UI.ru).sort())
})

test('every help entry has English and Russian text', () => {
  for (const id of [...HELP_IDS, 'result:MCP linear', 'result:Something', 'cat:Something']) {
    for (const lang of ['ru', 'en'] as const) {
      const h = helpFor(id, lang)
      expect(h.label.length).toBeGreaterThan(1)
      expect(h.what.length).toBeGreaterThan(10)
    }
  }
  expect(helpFor('result:Bash', 'en').label).toBe('Bash output')
  expect(helpFor('result:Bash', 'ru').label).toBe('Вывод команд Bash')
})

test('speed reads as a comparison with the usual pace', () => {
  expect(UI.ru.speed('rocket', 3)).toBe('🚀 контекст растёт в 3 раза быстрее обычного')
  expect(UI.ru.speed('rabbit', 1.74)).toBe('🐇 контекст растёт в 1,7 раза быстрее обычного')
  expect(UI.ru.speed('cat', 1.1)).toBe('🐈 контекст растёт как обычно')
  expect(UI.ru.speed('snail', 0.5)).toBe('🐌 контекст растёт в 2 раза медленнее обычного')
  expect(UI.en.speed('rabbit', 1.74)).toBe('🐇 context grows 1.7× faster than usual')
  expect(UI.en.speed('cat', 0.9)).toBe('🐈 context grows at your usual pace')
  expect(UI.en.speed('snail', 0.5)).toBe('🐌 context grows 2× slower than usual')
})

test('limit forecast reads as time left', () => {
  expect(UI.ru.limitLeft(70)).toBe('хватит на ~1 ч 10 мин')
  expect(UI.ru.limitLeft(42)).toBe('хватит на ~40 мин')
  expect(UI.ru.limitLeft(2)).toBe('хватит на ~5 мин')
  expect(UI.ru.limitLeft(120)).toBe('хватит на ~2 ч')
  expect(UI.en.limitLeft(70)).toBe('about 1 h 10 min left')
  // Nothing left at this pace: no "5 min".
  expect(UI.ru.limitLeft(0)).toBe('лимит на исходе')
  expect(UI.en.limitLeft(0)).toBe('about to run out')
  expect(UI.ru.limitUntilReset).toBe('хватит до сброса')
  expect(UI.en.limitUntilReset).toBe('lasts until reset')
})

test('the session block speaks in plain sentences', () => {
  expect(UI.ru.sessionRuns(150, 4)).toBe('Идёт 2 ч 30 мин, 4 твоих сообщения')
  expect(UI.ru.sessionRuns(40, 1)).toBe('Идёт 40 мин, 1 твоё сообщение')
  expect(UI.ru.sessionRuns(61, 25)).toBe('Идёт 1 ч 1 мин, 25 твоих сообщений')
  expect(UI.en.sessionRuns(150, 1)).toBe('Running 2 h 30 min, 1 message from you')
  expect(UI.ru.sessionSpent(20, 4)).toBe('Съела 20% лимита на 5 часов и 4% недельного')
  expect(UI.ru.sessionSpent(20, null)).toBe('Съела 20% лимита на 5 часов')
  expect(UI.en.sessionSpent(20, 4)).toBe('Used 20% of the 5-hour limit and 4% of the weekly one')
  expect(UI.ru.perMessage(0.5)).toBe('Одно сообщение в среднем: 0,5% лимита на 5 часов')
  expect(UI.en.perMessage(5)).toBe('One message on average: 5% of the 5-hour limit')
  expect(UI.ru.compactsLine(0, '')).toBe('Компактов не было')
  expect(UI.ru.compactsLine(2, '300k')).toBe('Компактов: 2, сбросили 300k')
  expect(UI.en.compactsLine(2, '300k')).toBe('Compactions: 2, dropped 300k')
})
