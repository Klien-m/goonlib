/**
 * Which language the app is read in, as the main process sees it.
 *
 * The locale is a setting in the settings table like any other, with the
 * catalogue itself living in `@shared/i18n` where the window can read it too.
 * The main process owns the value only so that it is stored in one place and
 * every window - including one opened later - starts in the right language.
 *
 * Nothing here translates anything. The strings the main process produces are
 * reports about this machine - where a file went, what ffmpeg said - and they
 * stay in the words the rest of the system would use.
 */

import { EventEmitter } from 'node:events'
import { toLocale, type Locale } from '@shared/i18n'
import { getSetting, setSetting } from './db/settings'

const SETTING_LOCALE = 'app.locale'

class Locales extends EventEmitter {
  /** The language as stored; anything unreadable falls back to English. */
  current(): Locale {
    return toLocale(getSetting(SETTING_LOCALE))
  }

  /** Stores a language and tells every window. An unknown one is refused. */
  set(value: unknown): Locale {
    const next = toLocale(value)
    if (next !== this.current()) {
      setSetting(SETTING_LOCALE, next)
      this.emit('change', next)
    }
    return next
  }
}

export const locales = new Locales()
