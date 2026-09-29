import { useEffect, useState } from 'react'
import type { PlaybackPrefs, UpdateState } from '@shared/types'
import { Switch } from './SettingsControls'
import { t } from '../i18n'

/**
 * Settings → App → Updates: what is running, what is out, and one button that
 * means the right thing at each step.
 *
 * The button is deliberately singular. An updater that offers Check, Download
 * and Restart at once asks the reader to work out which applies; there is only
 * ever one sensible next move, so only that one is shown.
 */
export function UpdateSettings(props: {
  playback: PlaybackPrefs
  onPlaybackChange: (patch: Partial<PlaybackPrefs>) => void
}): React.JSX.Element {
  const [state, setState] = useState<UpdateState>({ kind: 'idle', version: '' })

  useEffect(() => {
    void window.goonlib.updates.status().then(setState).catch(() => undefined)
    return window.goonlib.updates.onUpdate(setState)
  }, [])

  return (
    <div className="settings__section">
      <span className="settings__label">{t('App.updates.label')}</span>

      <Switch
        label={t('App.updates.check')}
        hint={t('App.updates.check.hint')}
        checked={props.playback.autoUpdate}
        onChange={(autoUpdate) => props.onPlaybackChange({ autoUpdate })}
      />

      {/* Nothing to say from source: there is no button, and the version is
          already in the sheet's footer. */}
      {state.kind === 'unsupported' ? null : (
        <div className="settings__row settings__row--tight">
          <Action state={state} />
          <span
            className="settings__hint settings__hint--clamp"
            title={state.kind === 'error' ? (state.message ?? '') : undefined}
          >
            {describe(state)}
          </span>
        </div>
      )}
    </div>
  )
}

function Action({ state }: { state: UpdateState }): React.JSX.Element | null {
  switch (state.kind) {
    case 'checking':
    case 'downloading':
      return (
        <button type="button" className="button button--quiet" disabled>
          {t('App.updates.working')}
        </button>
      )
    case 'available':
      return (
        <button
          type="button"
          className="button"
          onClick={() => void window.goonlib.updates.download().catch(() => undefined)}
        >
          {t('App.updates.download', { version: state.newVersion ?? '' })}
        </button>
      )
    case 'manual':
      return (
        <button
          type="button"
          className="button"
          onClick={() => void window.goonlib.updates.download().catch(() => undefined)}
        >
          {t('App.updates.openRelease')}
        </button>
      )
    case 'ready':
      return (
        <button type="button" className="button button--primary" onClick={() => window.goonlib.updates.install()}>
          {t('App.updates.restart')}
        </button>
      )
    default:
      return (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => void window.goonlib.updates.check().catch(() => undefined)}
        >
          {t('App.updates.checkNow')}
        </button>
      )
  }
}

/**
 * An updater failure in words someone can act on.
 *
 * The two that actually happen get a sentence of their own; anything else
 * falls through to what the updater said, which the main process has already
 * cut down to one line. The full text is on the hint's tooltip either way.
 */
function failure(message: string | undefined): string {
  const text = message ?? ''
  if (/unable to find latest version|cannot parse releases feed|no published versions/i.test(text)) {
    return t('App.updates.nothing')
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(text)) {
    return t('App.updates.unreachable')
  }
  return text || t('App.updates.failed')
}

function describe(state: UpdateState): string {
  switch (state.kind) {
    case 'checking':
      return t('App.updates.looking')
    case 'none':
      return t('App.updates.newest', { version: state.version })
    case 'available':
      return t('App.updates.available', { new: state.newVersion ?? '', current: state.version })
    case 'downloading':
      return t('App.updates.fetching', { percent: state.percent ?? 0 })
    case 'ready':
      return t('App.updates.ready', { version: state.newVersion ?? '' })
    case 'manual':
      // macOS will not replace an app it has not signed, so this build can find
      // an update but not become one.
      return t('App.updates.manual', { version: state.newVersion ?? '' })
    case 'error':
      return failure(state.message)
    default:
      return ''
  }
}
