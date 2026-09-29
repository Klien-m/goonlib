import { LOCALES } from '@shared/i18n'
import type { Locale } from '@shared/i18n'
import { chooseLocale, t, useLocale } from '../i18n'

/**
 * Settings → App → Language: which language the app is written in.
 *
 * A select rather than a row of buttons, because the list is every language the
 * app is translated into and there is no reason for it to stop at two. Each
 * option is written in its own language: a menu offering languages is no use to
 * somebody who cannot read the menu, and "Chinese" is not a word that helps
 * anyone who only reads Chinese.
 *
 * It takes effect at once - the whole window re-renders - so there is nothing
 * to save here and no restart to ask for.
 */
export function LanguageSettings(): React.JSX.Element {
  const locale = useLocale()

  return (
    <div className="settings__group settings__section">
      <label className="settings__field">
        <span className="settings__label">{t('Language.name')}</span>
        <select
          className="settings__select"
          value={locale}
          onChange={(event) => chooseLocale(event.target.value as Locale)}
        >
          {LOCALES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <span className="settings__hint">{t('Language.hint')}</span>
      </label>
    </div>
  )
}
