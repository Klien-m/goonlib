/**
 * Which language the window is written in, and the words themselves.
 *
 * Two of everything: `en` is the source, and every other catalogue is written
 * against it. A translation is a plain object rather than a file loaded at
 * startup, so a missing language is a build error rather than a blank screen,
 * and nothing has to be fetched over the wire for the first paint.
 *
 * The locale is a setting like any other - it lives in the settings table, the
 * main process owns it, and every window is told when it changes. It is read
 * synchronously once, through the preload, so the first render is already in
 * the right language rather than flashing English.
 *
 * Anything a user reads that is *not* here is a string only the main process
 * can produce - a folder action's message, an error from ffmpeg. Those are
 * meant to stay as they are: they are reporting what happened on this machine,
 * in the words the rest of the system would use.
 */

import { en } from './en'
import { zh } from './zh'

/**
 * Every language the app can be read in. The name is the language's own, which
 * is the one thing in this file that is deliberately not translated: a menu
 * offering languages is no use to somebody who cannot read the menu.
 */
export const LOCALES = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
] as const

export type Locale = (typeof LOCALES)[number]['id']

/** The one used when nothing else has been chosen, and when a name is nonsense. */
export const DEFAULT_LOCALE: Locale = 'en'

/** A catalogue: every key in `en`, and whatever a translation has for it. */
export type Catalogue = Record<string, string>

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some((entry) => entry.id === value)
}

/** A stored value read back as a locale, falling back rather than throwing. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

const CATALOGUES: Record<Locale, Catalogue> = { en, zh }

/** Every key `en` defines, which is what a translation is measured against. */
export function englishKeys(): string[] {
  return Object.keys(en)
}

/**
 * The catalogue for one language, with anything it has not translated said in
 * English. The fallback is at lookup time rather than at build time on purpose:
 * a half-finished translation is a useful thing to ship, and a screen with
 * three words of English on it beats a screen with three blank labels.
 */
export function catalogueFor(locale: Locale): Catalogue {
  const found = CATALOGUES[locale]
  return found === en ? en : { ...en, ...found }
}
