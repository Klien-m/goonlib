import { useCallback, useState } from 'react'
import type { CustomPattern, PatternId } from '@shared/toy'
import { customIdOf, customPatternId, TOY_PATTERNS } from '@shared/toy'
import { PatternEditor } from './PatternEditor'
import { Slider, Switch } from './SettingsControls'
import type { PlaybackPrefs, ToyPrefs, ToyScriptState, ToyStatus } from '@shared/types'
import type { CoWatchView } from '../state/useCoWatch'
import type { ToyView } from '../state/useToy'
import { CoWatchSection, SessionName } from './CoWatchPanel'
import { TabPanel } from './TabPanel'
import { t } from '../i18n'
import type { SheetTab } from './TabPanel'

export interface ToySectionsProps {
  toy: ToyView
  cowatch: CoWatchView
  /** The player's preferences, for the one session setting that belongs here. */
  playback: PlaybackPrefs
  onPlaybackChange: (patch: Partial<PlaybackPrefs>) => void
  /** Whether a co-watching session is running, so the guest settings can say so. */
  sharing: boolean
  /** Which tab of the Settings sheet is showing. */
  tab: SheetTab
}

const TOY_TABS: SheetTab[] = ['controls', 'solo', 'patterns', 'together']

/**
 * The toy's tabs of the Settings sheet — the toy itself, playing on your own,
 * and playing with guests — with the co-watching session itself on the last.
 *
 * Stop sits above the toy tabs rather than inside one. It is the loudest thing
 * here and never moves: on any toy tab, the place to press to make it stop is
 * the same place.
 */
export function ToySections({
  toy,
  cowatch,
  sharing,
  tab,
  playback,
  onPlaybackChange,
}: ToySectionsProps): React.JSX.Element {
  const { status, prefs } = toy
  const ready = status.engine === 'ready'
  const onToyTab = TOY_TABS.includes(tab)
  // A dismissed message stays dismissed until a different one comes along.
  const [dismissed, setDismissed] = useState<string | null>(null)

  return (
    <>
      {tab === 'controls' && status.message && status.message !== dismissed && status.engine !== 'installing' ? (
        <div className="banner banner--error settings__banner banner--dismissable" role="alert">
          <span>{status.message}</span>
          <button
            type="button"
            className="banner__close"
            onClick={() => setDismissed(status.message)}
            aria-label={t('Toy.dismiss')}
            title={t('Toy.dismiss')}
          >
            ×
          </button>
        </div>
      ) : null}

      {onToyTab && ready && status.devices.length > 0 ? <StopStrip toy={toy} /> : null}

      <TabPanel id="controls" tab={tab}>
        <Devices toy={toy} />
        {prefs ? <ConnectionSettings toy={toy} prefs={prefs} /> : null}
        <p className="settings__hint toy__foot">
          {ready
            ? t('Toy.connectedThrough', {
                name:
                  status.server === 'external'
                    ? t('Toy.intifaceCentral')
                    : t('Toy.intifaceEngine'),
              })
            : null}
          {ready ? (
            <button type="button" className="button button--quiet" onClick={toy.disconnect}>
              {t('Toy.disconnect')}
            </button>
          ) : null}
        </p>
      </TabPanel>

      <TabPanel id="solo" tab={tab}>
        {prefs ? <Strength toy={toy} prefs={prefs} /> : null}
        {prefs ? <StrokerSettings toy={toy} prefs={prefs} /> : null}
      </TabPanel>

      <TabPanel id="patterns" tab={tab}>
        <PatternsTab toy={toy} />
      </TabPanel>

      <TabPanel id="together" tab={tab}>
        <Together toy={toy} sharing={sharing} />
        <div className="settings__group">
          <SessionName />
          <Switch
            label={t('Toy.start')}
            hint={t('Toy.start.hint')}
            checked={playback.resumeInSessions}
            onChange={(resumeInSessions) => onPlaybackChange({ resumeInSessions })}
          />
        </div>
        <div className="settings__group">
          <CoWatchSection cowatch={cowatch} />
        </div>
      </TabPanel>
    </>
  )
}

/** Stop, the live meter, and what is driving the toy. Shown on every tab. */
function StopStrip({ toy }: { toy: ToyView }): React.JSX.Element {
  const { status } = toy
  return (
    <div className="toy__stop">
      {status.armed ? (
        <button type="button" className="button button--danger toy__big" onClick={toy.stop}>
          {t('Scan.stop')}
        </button>
      ) : (
        <button type="button" className="button toy__big" onClick={toy.resume}>
          {t('Toy.resume')}
        </button>
      )}
      <div
        className="toy__meter"
        aria-label={t('Toy.running', { percent: Math.round(status.level * 100) })}
      >
        <div className="toy__meter-fill" style={{ width: `${status.level * 100}%` }} />
      </div>
      <p className="settings__hint">{describeSource(status)}</p>
    </div>
  )
}

/**
 * The toys, and the one button that finds them: it connects first, and once
 * connected looks again. The list is always here, so connecting never moves
 * the button out from under the pointer.
 */
function Devices({ toy }: { toy: ToyView }): React.JSX.Element {
  const { status } = toy
  const ready = status.engine === 'ready'
  const busy = status.engine === 'installing' || status.engine === 'starting' || status.scanning

  const label =
    status.engine === 'installing'
      ? t('Toy.downloading')
      : status.engine === 'starting'
        ? t('Toy.connecting')
        : status.scanning
          ? t('Toy.scanning')
          : t('Toy.scan')

  return (
    <div className="toy__devices">
      <span className="settings__label">{t('Toy.connected')}</span>
      <div className="toy__list" role="list" aria-label={t('Toy.connected')}>
        {status.devices.length === 0 ? (
          <span className="toy__list-empty">
            {status.scanning
              ? t('Toy.searching')
              : ready
                ? t('Toy.none')
                : null}
          </span>
        ) : (
          status.devices.map((device) => (
            <div key={device.index} className="toy__device" role="listitem">
              <span className="toy__device-name">{device.name}</span>
              <span className="toy__device-meta">
                {device.stroke
                  ? t('Toy.device.strokes')
                  : device.vibrate
                    ? t('Toy.device.vibrates')
                    : t('Toy.device.none')}
                {device.battery !== null ? ` · ${Math.round(device.battery * 100)}%` : ''}
              </span>
            </div>
          ))
        )}
      </div>

      {status.engine === 'installing' ? (
        <div className="player__progress" role="status" aria-label={t('Toy.download.bar')}>
          <div className="player__progress-fill" style={{ width: `${status.progress ?? 0}%` }} />
        </div>
      ) : null}

      <div className="settings__row">
        <button type="button" className="button" onClick={ready ? toy.scan : toy.connect} disabled={busy}>
          {label}
        </button>
      </div>

      {!ready && !status.installed ? (
        <p className="settings__hint">
          {status.supported
            ? t('Toy.firstTime')
            : t('Toy.unsupported')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * How strong the toy gets. Intensity scales everything it does, from every
 * source; guests are held under their own ceiling as well. Timing sits here
 * because it is also about how the toy feels rather than what drives it.
 */
function Strength({ toy, prefs }: { toy: ToyView; prefs: ToyPrefs }): React.JSX.Element {
  // The sliders are percentages; the toy is driven from 0 to 1. Kept stable so
  // the slider's repeat does not restart on every render of this panel.
  const previewToy = useCallback(
    (value: number | null): void => window.goonlib.toy.preview(value === null ? null : value / 100),
    [],
  )

  return (
    <div className="settings__section">
      <Switch
        label={t('Toy.preview.enable')}
        hint={t('Toy.preview.hint')}
        checked={prefs.preview}
        onChange={(preview) => toy.setPrefs({ preview })}
      />

      <Slider
        label={t('Toy.intensity')}
        hint={t('Toy.intensity.hint')}
        preview={prefs.preview ? previewToy : undefined}
        min={5}
        max={100}
        step={5}
        value={Math.round(prefs.maxIntensity * 100)}
        format={(value) => `${value}%`}
        // Lowering it below Guest Intensity takes that down with it; the main
        // process holds the same rule.
        onChange={(value) => toy.setPrefs({ maxIntensity: value / 100 })}
      />
      <Slider
        label={t('Toy.guestIntensity')}
        hint={t('Toy.guestIntensity.hint')}
        preview={prefs.preview ? previewToy : undefined}
        min={5}
        max={100}
        ceiling={Math.round(prefs.maxIntensity * 100)}
        step={5}
        value={Math.round(prefs.guestMaxIntensity * 100)}
        format={(value) => `${value}%`}
        onChange={(value) => toy.setPrefs({ guestMaxIntensity: value / 100 })}
      />
      <Slider
        label={t('Toy.guestDuration')}
        hint={t('Toy.guestDuration.hint')}
        min={1}
        max={30}
        step={1}
        value={prefs.guestMaxSeconds}
        format={(value) => `${value}s`}
        onChange={(guestMaxSeconds) => toy.setPrefs({ guestMaxSeconds })}
      />
      <Slider
        label={t('Toy.timing')}
        hint={t('Toy.timing.hint')}
        min={-500}
        max={1000}
        step={25}
        value={prefs.leadMs}
        format={(value) => `${value > 0 ? '+' : ''}${value} ms`}
        onChange={(leadMs) => toy.setPrefs({ leadMs })}
      />
    </div>
  )
}

/** How GoonLib finds the toy. */
function ConnectionSettings({ toy, prefs }: { toy: ToyView; prefs: ToyPrefs }): React.JSX.Element {
  return (
    <>
      <div className="settings__group">
        <span className="settings__label">{t('Toy.connectingGroup')}</span>
        <Switch
          label={t('Toy.connectOnOpen')}
          checked={prefs.autoConnect}
          onChange={(autoConnect) => toy.setPrefs({ autoConnect })}
        />
        <Switch
          label={t('Toy.lovenseConnect')}
          hint={t('Toy.lovenseConnect.hint')}
          checked={prefs.lovenseConnect}
          onChange={(lovenseConnect) => toy.setPrefs({ lovenseConnect })}
        />
      </div>
    </>
  )
}

/** The Patterns tab. While a pattern is being drawn, the editor has the tab to itself. */
function PatternsTab({ toy }: { toy: ToyView }): React.JSX.Element {
  const [editing, setEditing] = useState<CustomPattern | 'new' | null>(null)

  if (editing) {
    return (
      <PatternEditor
        toy={toy}
        initial={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    )
  }

  return (
    <>
      {toy.prefs ? <SyncSettings toy={toy} prefs={toy.prefs} /> : null}
      <div className="settings__group">
        <Patterns toy={toy} onEdit={setEditing} />
      </div>
    </>
  )
}

/** Patterns from the panel: the built-in ones, your own, and a way to draw one. */
function Patterns({
  toy,
  onEdit,
}: {
  toy: ToyView
  onEdit: (pattern: CustomPattern | 'new') => void
}): React.JSX.Element {
  const { status } = toy
  const running = status.manual
  const ready = status.engine === 'ready'

  // Patterns run at full strength; Intensity scales them with everything else.
  const run = (pattern: PatternId): void => toy.manual({ pattern, intensity: 1 })

  return (
    <div className="settings__section">
      <div className="toy__patterns" role="group" aria-label={t('Pattern.label')}>
        {TOY_PATTERNS.map((pattern) => (
          <PatternChip
            key={pattern.id}
            label={t(pattern.label)}
            glyph={pattern.glyph}
            on={running?.pattern === pattern.id}
            disabled={!ready || !status.armed}
            onToggle={() => (running?.pattern === pattern.id ? toy.manual(null) : run(pattern.id))}
          />
        ))}
        {status.patterns.map((pattern) => {
          const id = customPatternId(pattern.id)
          return (
            <span key={pattern.id} className="toy__custom">
              <PatternChip
                label={pattern.name}
                glyph="✎"
                on={running?.pattern === id}
                disabled={!ready || !status.armed}
                onToggle={() => (running?.pattern === id ? toy.manual(null) : run(id))}
              />
              <button
                type="button"
                className="toy__edit"
                onClick={() => onEdit(pattern)}
                aria-label={t('Toy.editPattern', { name: pattern.name })}
                title={t('Toy.edit')}
              >
                ⋯
              </button>
            </span>
          )
        })}
        <button type="button" className="cowatch__provider toy__new" onClick={() => onEdit('new')}>
          + {t('Toy.newPattern')}
        </button>
      </div>
      <p className="settings__hint">
        {ready ? t('Toy.overlay.hint') : t('Toy.noToyHint')}
      </p>
    </div>
  )
}

const STROKE_FEEL: Array<{ id: ToyPrefs['vibrateFrom']; label: string }> = [
  { id: 'position', label: 'Toy.deeper' },
  { id: 'speed', label: 'Toy.faster' },
]

/** Whether the toy follows what is playing. */
function SyncSettings({ toy, prefs }: { toy: ToyView; prefs: ToyPrefs }): React.JSX.Element {
  return (
    <div className="settings__group">
      <span className="settings__label">{t('Toy.sync')}</span>

      <Switch
        label={t('Toy.sync.enable')}
        hint={t('Toy.sync.hint')}
        checked={prefs.followVideo}
        onChange={(followVideo) => toy.setPrefs({ followVideo })}
      />

      <Switch
        label={t('Toy.generate')}
        hint={t('Toy.generate.hint')}
        checked={prefs.audio}
        disabled={!prefs.followVideo}
        onChange={(audio) => toy.setPrefs({ audio })}
      />
    </div>
  )
}

/** How a script's strokes are felt on a toy that vibrates. */
function StrokerSettings({ toy, prefs }: { toy: ToyView; prefs: ToyPrefs }): React.JSX.Element {
  return (
    <div className="settings__group">
      <div className="settings__field">
        <span className="settings__label">{t('Toy.stroker')}</span>
        <span className="settings__hint">{t('Toy.stroker.hint')}</span>
        <div className="cowatch__providers" role="radiogroup" aria-label={t('Toy.stroker')}>
          {STROKE_FEEL.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={prefs.vibrateFrom === option.id}
              className={
                prefs.vibrateFrom === option.id ? 'cowatch__provider cowatch__provider--on' : 'cowatch__provider'
              }
              onClick={() => toy.setPrefs({ vibrateFrom: option.id })}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <span className="settings__hint">{t('Toy.stroker.choiceHint')}</span>
      </div>
    </div>
  )
}

/** Letting co-watching guests at the toy, and what they are doing with it. */
function Together({ toy, sharing }: { toy: ToyView; sharing: boolean }): React.JSX.Element {
  const { status, prefs } = toy
  if (!prefs) return <></>

  return (
    <div className="settings__section">
      <Switch
        label={t('Toy.guestControl')}
        hint={t('Toy.guestControl.hint')}
        checked={prefs.guests}
        onChange={(guests) => toy.setPrefs({ guests })}
      />

      {prefs.guests && guestState(status, sharing) ? (
        <p className={status.guests.open ? 'settings__ok' : 'settings__hint'}>{guestState(status, sharing)}</p>
      ) : null}
    </div>
  )
}

/**
 * Whether guests can reach the toy right now, and if not, what is in the way.
 * Null with no toy connected, which the switch's own hint already covers.
 */
function guestState(status: ToyStatus, sharing: boolean): string | null {
  if (status.engine !== 'ready' || status.devices.length === 0) return null
  if (!status.armed) return t('Toy.state.stopped')
  if (!sharing) return t('Toy.state.ready')
  if (status.guests.playing) {
    const pattern = patternLabel(status, status.guests.playing.pattern)
    const queued =
      status.guests.waiting > 0 ? t('Toy.state.moreQueued', { count: status.guests.waiting }) : ''
    return t('Toy.state.sending', { name: status.guests.playing.name, pattern, queued })
  }
  return t('Toy.state.guests')
}

/** One line on what is driving the toy right now, if anything. */
function describeSource(status: ToyStatus): string {
  if (!status.armed) return t('Toy.state.nothing')

  const parts: string[] = []
  const script = describeScript(status.script)
  if (script) parts.push(script)
  if (status.manual) {
    parts.push(t('Toy.state.pattern', { name: patternLabel(status, status.manual.pattern) }))
  }
  if (status.guests.playing) {
    parts.push(
      t('Toy.state.guestPattern', {
        name: status.guests.playing.name,
        pattern: patternLabel(status, status.guests.playing.pattern),
      }),
    )
  }
  if (status.guests.waiting > 0) {
    parts.push(t('Toy.state.buzzQueued', { count: status.guests.waiting }))
  }

  return parts.length > 0 ? parts.join(' · ') : t('Toy.state.waiting')
}

export function describeScript(script: ToyScriptState): string | null {
  switch (script.kind) {
    case 'funscript':
      return t('Toy.state.playing', { name: script.name })
    case 'audio':
      return t('Toy.state.sound')
    case 'loading':
      return t('Toy.state.reading')
    case 'error':
      return t('Toy.state.unreadable', { reason: script.message })
    case 'none':
      return script.mediaId !== null ? t('Toy.state.noScript') : null
  }
}

/** What to call a pattern, whether built in, saved, or still being drawn. */
export function patternLabel(status: ToyStatus, pattern: PatternId | 'preview'): string {
  if (pattern === 'preview') return t('Toy.preview')
  const id = customIdOf(pattern)
  if (id !== null) return status.patterns.find((saved) => saved.id === id)?.name ?? t('Toy.saved')
  const known = TOY_PATTERNS.find((entry) => entry.id === pattern)
  return known ? t(known.label) : pattern
}

function PatternChip(props: {
  label: string
  glyph: string
  on: boolean
  disabled: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={props.on ? 'cowatch__provider cowatch__provider--on' : 'cowatch__provider'}
      aria-pressed={props.on}
      disabled={props.disabled}
      onClick={props.onToggle}
      title={props.on ? t('Toy.stopPattern') : undefined}
    >
      <span aria-hidden="true">{props.glyph}</span> {props.label}
    </button>
  )
}

