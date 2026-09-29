import { useState } from 'react'
import { t } from '../i18n'

/**
 * Settings and themes, out to a file and back in.
 *
 * Only settings and themes: what is filed under which tag is about this
 * machine's own files, and carrying that to another machine would mean
 * guessing which copy is which. Preferences are yours, not your files'.
 */
export function BackupSettings(): React.JSX.Element {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const run = (
    work: () => Promise<boolean>,
    done: string,
  ): void => {
    setNote(null)
    void work()
      .then((ok) => ok && setNote({ ok: true, text: done }))
      .catch((err: unknown) =>
        setNote({ ok: false, text: err instanceof Error ? err.message : String(err) }),
      )
  }

  return (
    <div className="settings__section">
      <div className="settings__row settings__row--tight">
        <button
          type="button"
          className="button"
          onClick={() => run(() => window.goonlib.settings.export(), t('Backup.export.done'))}
          title={t('Backup.export.title')}
        >
          {t('Backup.export')}
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => run(() => window.goonlib.settings.import(), t('Backup.import.done'))}
          title={t('Backup.import.title')}
        >
          {t('Backup.import')}
        </button>
      </div>

      {note ? <span className={note.ok ? 'settings__ok' : 'settings__bad'}>{note.text}</span> : null}

      <span className="settings__hint">{t('Backup.hint')}</span>
    </div>
  )
}
