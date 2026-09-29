/**
 * The words, as the window sees them.
 *
 * Held outside React as well as in it, the same way the shortcuts are: there is
 * one current language for the whole window, half the strings are built by
 * plain functions rather than in a component, and threading a locale through
 * every call would touch every file for no gain.
 *
 * `locale` is read synchronously through the preload, so the very first render
 * is already in the right language. A change afterwards re-renders whatever is
 * subscribed - in practice the whole App, since `useLocale` is called at the
 * top - and anything holding on to a translated string from before it.
 *
 * A key with no entry in the catalogue is returned as the key itself rather
 * than as an empty string. A missing translation should look like a bug, not
 * like a label that was never there.
 */

import { useSyncExternalStore } from 'react'
import { catalogueFor, type Catalogue, type Locale } from '@shared/i18n'

let locale: Locale = window.goonlib.locale.initial
let words: Catalogue = catalogueFor(locale)

const listeners = new Set<() => void>()

function accept(next: Locale): void {
  if (next === locale) return
  locale = next
  words = catalogueFor(next)
  for (const listener of listeners) listener()
}

window.goonlib.locale.onUpdate(accept)

export function currentLocale(): Locale {
  return locale
}

/** Stores a language, and takes back whatever the main process actually kept. */
export function chooseLocale(next: Locale): void {
  void window.goonlib.locale
    .set(next)
    .then(accept)
    .catch(() => undefined)
}

/**
 * One string, with its `{place}` filled in.
 *
 * A placeholder given no value is left standing rather than blanked: `{count}`
 * on screen is a missing argument somebody can see, where an empty space is
 * one they cannot.
 */
export function t(key: string, values?: Record<string, string | number>): string {
  const text = words[key]
  if (text === undefined) return key
  if (!values) return text

  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
  )
}

/** Whether a key exists, for anything building a sentence out of parts. */
export function has(key: string): boolean {
  return words[key] !== undefined
}

/** Redraws the calling component when the language changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => locale,
  )
}
