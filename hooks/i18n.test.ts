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
