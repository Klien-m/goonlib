import { describe, expect, it } from 'vitest'
import { catalogueFor, DEFAULT_LOCALE, englishKeys, isLocale, LOCALES, toLocale } from '@shared/i18n'
import { en } from '@shared/i18n/en'
import { zh } from '@shared/i18n/zh'
import { TOY_PATTERNS } from '@shared/toy'
import { THEME_GROUPS } from '@shared/theme'
import { KEY_ACTIONS } from '@shared/keys'
import { AI_PROVIDERS } from '@shared/types'

/**
 * The catalogues, and the things that hold keys rather than words.
 *
 * What these are really guarding against is a translation that quietly falls
 * back: a missing key would be invisible in the running app, because the
 * English shows through, so the checks have to be made here where a gap is a
 * failure rather than a shrug.
 */

describe('the catalogues', () => {
  it('has a catalogue for every language offered', () => {
    for (const { id } of LOCALES) expect(catalogueFor(id)).toBeTruthy()
  })

  it('translates every English key into Chinese, and invents none', () => {
    const missing = englishKeys().filter((key) => !(key in zh))
    const extra = Object.keys(zh).filter((key) => !(key in en))
    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('says nothing in blank', () => {
    for (const [key, value] of Object.entries({ ...en, ...zh })) {
      expect(value.trim(), key).not.toBe('')
    }
  })

  /**
   * A `{place}` in the English with no counterpart in the translation is a
   * sentence that will never say which file was moved; one in the translation
   * with no counterpart in the English is a typo that renders as `{cout}`.
   */
  it('uses the same placeholders in both', () => {
    const places = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
    for (const key of englishKeys()) {
      expect(places(zh[key] ?? ''), key).toEqual(places(en[key] ?? ''))
    }
  })

  it('falls back to English for a language with nothing translated', () => {
    // Everything English is present in the merged catalogue, so a half-written
    // translation shows a few English lines rather than a few blank ones.
    const merged = catalogueFor(DEFAULT_LOCALE)
    expect(merged['Settings.title']).toBe(en['Settings.title'])
  })

  it('refuses a language it does not have, rather than throwing', () => {
    expect(toLocale('klingon')).toBe(DEFAULT_LOCALE)
    expect(toLocale(null)).toBe(DEFAULT_LOCALE)
    expect(toLocale(undefined)).toBe(DEFAULT_LOCALE)
    expect(toLocale('zh')).toBe('zh')
    expect(isLocale('zh')).toBe(true)
    expect(isLocale('en-GB')).toBe(false)
  })
})

/**
 * The lists that carry catalogue keys rather than words. Each is built once, at
 * import, before anything knows which language is showing - so a key typed
 * wrong here would show up as an untranslated key on screen and nowhere else.
 */
describe('keys held in shared lists', () => {
  const known = new Set(englishKeys())

  it('names a real key for every toy pattern', () => {
    for (const pattern of TOY_PATTERNS) expect(known, pattern.id).toContain(pattern.label)
  })

  it('names a real key for every theme group and colour', () => {
    for (const group of THEME_GROUPS) {
      expect(known).toContain(group.title)
      for (const { key, label } of group.keys) expect(known, key).toContain(label)
    }
  })

  it('names a real key for every shortcut and its heading', () => {
    for (const action of KEY_ACTIONS) {
      expect(known, action.id).toContain(action.label)
      expect(known, action.id).toContain(action.group)
    }
  })

  it('names a real key for every AI provider', () => {
    for (const provider of AI_PROVIDERS) {
      expect(known, provider.id).toContain(provider.label)
      expect(known, provider.id).toContain(provider.note)
    }
  })
})
