import { useEffect, useState } from 'react'
import { CONTINUE_COUNT, IMAGE_SECONDS, RESUME_AFTER } from '@shared/types'
import type { PlaybackPrefs } from '@shared/types'
import { LanguageSettings } from './LanguageSettings'
import { NumberField, Slider, Switch } from './SettingsControls'
import { UpdateSettings } from './UpdateSettings'
import { t } from '../i18n'

/**
 * Settings → App: how the app itself behaves, starting with the media player.
 * Every control writes through as it changes, like the rest of Settings.
 */
export function AppSettings(props: {
  playback: PlaybackPrefs
  onPlaybackChange: (patch: Partial<PlaybackPrefs>) => void
  /** Fired after the history is cleared, so the library drops what it showed. */
  onChanged: () => void
}): React.JSX.Element {
  const { playback } = props

  return (
    <>
      <LanguageSettings />

      <UpdateSettings playback={playback} onPlaybackChange={props.onPlaybackChange} />

      <div className="settings__group settings__section">
        <span className="settings__label">{t('App.player.label')}</span>

        <ImageSeconds
          value={playback.imageSeconds}
          onChange={(imageSeconds) => props.onPlaybackChange({ imageSeconds })}
        />

        <Switch
          label={t('App.player.playOnOpen')}
          hint={t('App.player.playOnOpen.hint')}
          checked={playback.playOnOpen}
          onChange={(playOnOpen) => props.onPlaybackChange({ playOnOpen })}
        />

        <Switch
          label={t('App.player.shuffle')}
          hint={t('App.player.shuffle.hint')}
          checked={playback.shuffleDefault}
          onChange={(shuffleDefault) => props.onPlaybackChange({ shuffleDefault })}
        />


        <Switch
          label={t('App.player.showMetadata')}
          hint={t('App.player.showMetadata.hint')}
          checked={playback.showMetadata}
          onChange={(showMetadata) => props.onPlaybackChange({ showMetadata })}
        />

        <Switch
          label={t('App.player.showDescription')}
          hint={t('App.player.showDescription.hint')}
          checked={playback.showCaption}
          disabled={!playback.showDescription}
          onChange={(showCaption) => props.onPlaybackChange({ showCaption })}
        />

        <Switch
          label={t('App.player.showTags')}
          hint={t('App.player.showTags.hint')}
          checked={playback.showTags}
          disabled={!playback.showDescription}
          onChange={(showTags) => props.onPlaybackChange({ showTags })}
        />

        <Switch
          label={t('App.player.showExif')}
          hint={t('App.player.showExif.hint')}
          checked={playback.showExif}
          onChange={(showExif) => props.onPlaybackChange({ showExif })}
        />

        <Switch
          label={t('App.player.showLocation')}
          hint={t('App.player.showLocation.hint')}
          checked={playback.showLocation}
          disabled={!playback.showExif}
          onChange={(showLocation) => props.onPlaybackChange({ showLocation })}
        />

        {/* Reading as well as writing: the scan checks it before it spends the
            time, so a library scanned with it off has no sheets until the next
            pass over it. */}
        <Switch
          label={t('App.player.buildSprites')}
          hint={t('App.player.buildSprites.hint')}
          checked={playback.buildSprites}
          onChange={(buildSprites) => props.onPlaybackChange({ buildSprites })}
        />
      </div>

      <WatchHistory
        playback={playback}
        onPlaybackChange={props.onPlaybackChange}
        onChanged={props.onChanged}
      />
    </>
  )
}

/** Watch history: what is remembered about what you have watched. */
function WatchHistory(props: {
  playback: PlaybackPrefs
  onPlaybackChange: (patch: Partial<PlaybackPrefs>) => void
  onChanged: () => void
}): React.JSX.Element {
  const { playback } = props

  return (
    <div className="settings__group settings__section">
      <span className="settings__label">{t('App.history.label')}</span>

      <Switch
        label={t('App.history.keep')}
        hint={t('App.history.keep.hint')}
        checked={playback.keepHistory}
        onChange={(keepHistory) => props.onPlaybackChange({ keepHistory })}
      />

      <Switch
        label={t('App.history.resume')}
        hint={t('App.history.resume.hint')}
        checked={playback.resumePosition}
        onChange={(resumePosition) => props.onPlaybackChange({ resumePosition })}
      />

      {/* As a share of the video's length rather than a number of seconds: half a
          minute is nothing in a film and most of a clip, and a library has
          plenty of both. */}
      <Slider
        label={t('App.history.after')}
        hint={t('App.history.after.hint')}
        min={RESUME_AFTER.min}
        max={RESUME_AFTER.max}
        step={5}
        value={playback.resumeAfterPercent}
        disabled={!playback.resumePosition}
        format={(value) => (value === 0 ? t('App.history.after.any') : `${value}%`)}
        onChange={(resumeAfterPercent) => props.onPlaybackChange({ resumeAfterPercent })}
      />

      <Switch
        label={t('App.history.continue')}
        hint={t('App.history.continue.hint')}
        checked={playback.showContinue}
        disabled={!playback.resumePosition}
        onChange={(showContinue) => props.onPlaybackChange({ showContinue })}
      />

      <NumberField
        label={t('App.history.holds')}
        hint={t('App.history.holds.hint')}
        suffix={t('App.history.holds.suffix')}
        min={CONTINUE_COUNT.min}
        max={CONTINUE_COUNT.max}
        value={playback.continueCount}
        disabled={!playback.resumePosition || !playback.showContinue}
        onChange={(continueCount) => props.onPlaybackChange({ continueCount })}
      />

      <ClearHistory onCleared={props.onChanged} />
    </div>
  )
}

/**
 * Forgets every count, time watched and position, after asking. Separate from
 * the switch above it: turning recording off should not throw away what is
 * already there, and throwing it away should not be a side effect of a switch.
 */
function ClearHistory({ onCleared }: { onCleared: () => void }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [gone, setGone] = useState<number | null>(null)

  return (
    <div className="settings__row settings__row--tight">
      {confirming ? (
        <>
          <button
            type="button"
            className="button button--danger"
            onClick={() => {
              setConfirming(false)
              void window.goonlib.media
                .clearHistory()
                .then((rows) => {
                  setGone(rows)
                  onCleared()
                })
                .catch(() => undefined)
            }}
          >
            {t('App.history.clear.confirm')}
          </button>
          <button type="button" className="button button--quiet" onClick={() => setConfirming(false)}>
            {t('App.history.clear.cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => {
            setGone(null)
            setConfirming(true)
          }}
          title={t('App.history.clear.title')}
        >
          {t('App.history.clear')}
        </button>
      )}
      {gone !== null ? (
        <span className="muted">
          {gone === 0 ? t('App.history.clear.nothing') : t('App.history.clear.done', { count: gone })}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Seconds as typed, kept to whole numbers between the limits. Typing is free —
 * a half-typed "1" on the way to "12" is never rejected — and the value is
 * held to the range when it is committed, on Enter or leaving the field.
 */
function ImageSeconds(props: { value: number; onChange: (seconds: number) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => setDraft(String(props.value)), [props.value])

  const commit = (): void => {
    const typed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(typed)) {
      setDraft(String(props.value))
      return
    }
    const seconds = Math.min(IMAGE_SECONDS.max, Math.max(IMAGE_SECONDS.min, Math.round(typed)))
    setDraft(String(seconds))
    if (seconds !== props.value) props.onChange(seconds)
  }

  return (
    <label className="settings__field">
      <span className="settings__label">{t('App.player.imageSeconds.label')}</span>
      <span className="settings__row">
        <input
          type="number"
          className="settings__number"
          min={IMAGE_SECONDS.min}
          max={IMAGE_SECONDS.max}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
          aria-describedby="image-seconds-hint"
        />
        <span className="settings__hint">{t('App.player.imageSeconds.suffix')}</span>
      </span>
      <span className="settings__hint" id="image-seconds-hint">
        {t('App.player.imageSeconds.hint')}
      </span>
    </label>
  )
}
