import { useEffect, useMemo, useState } from 'react'
import type { ThemeLibraryEntry } from '@shared/types'
import {
  normalizeColor,
  resolveTheme,
  THEME_GROUPS,
  THEME_KEYS,
  type Theme,
  type ThemeKey,
  type ThemeMode,
  type ThemeType,
} from '@shared/theme'
import { acceptThemeState, setPreview, useThemeState } from '../theme'
import { HeartIcon } from './Toolbar'
import { t } from '../i18n'

const MODES: Array<{ id: ThemeMode; label: string }> = [
  { id: 'dark', label: 'Appearance.mode.dark' },
  { id: 'light', label: 'Appearance.mode.light' },
  { id: 'system', label: 'Appearance.mode.system' },
]

const SIDES: Array<{ id: ThemeType; label: string }> = [
  { id: 'dark', label: 'Appearance.side.dark' },
  { id: 'light', label: 'Appearance.side.light' },
]

/** Two themes are the same when every colour they set is. */
function sameTheme(a: Theme, b: Theme): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    JSON.stringify(Object.entries(a.colors).sort()) === JSON.stringify(Object.entries(b.colors).sort())
  )
}

/**
 * Appearance: which theme shows when, and a place to make your own.
 *
 * The mode and each side's theme write through as they change, like every
 * other setting. Editing is different: changes build up in a draft, shown
 * only here until Apply lays it over the whole app for a look. Nothing is
 * kept until Save, and leaving the page drops a preview that was not saved.
 */
export function AppStyling(props: { active: boolean }): React.JSX.Element {
  const state = useThemeState()
  const { config, library } = state

  const [side, setSide] = useState<ThemeType>(config.mode === 'light' ? 'light' : 'dark')
  const [draft, setDraft] = useState<Theme>(config[side])
  const [dirty, setDirty] = useState(false)
  const [applied, setApplied] = useState(false)
  const [fineTune, setFineTune] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Follows the side being edited, and hand edits to the file, until the draft has changes of its own.
  useEffect(() => {
    if (!dirty) setDraft(config[side])
  }, [config, side, dirty])

  // An Apply only lasts while you are here.
  useEffect(() => {
    if (!props.active && applied) {
      setPreview(null)
      setApplied(false)
    }
  }, [props.active, applied])
  useEffect(() => () => setPreview(null), [])

  // A preview that is showing keeps up with the draft.
  useEffect(() => {
    if (applied) setPreview(draft)
  }, [applied, draft])

  const resolved = useMemo(() => resolveTheme(draft), [draft])

  const run = async (work: () => Promise<void>): Promise<void> => {
    setMessage(null)
    try {
      await work()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  const edit = (next: Theme): void => {
    setDraft({ ...next, type: side })
    setDirty(true)
    setMessage(null)
  }

  const setColor = (key: ThemeKey, value: string | null): void => {
    const colors = { ...draft.colors }
    if (value === null) delete colors[key]
    else colors[key] = value
    edit({ ...draft, colors })
  }

  const discard = (): void => {
    setDraft(config[side])
    setDirty(false)
    setApplied(false)
    setPreview(null)
    setMessage(null)
  }

  const chooseSide = (next: ThemeType): void => {
    if (next === side) return
    setSide(next)
    setDraft(config[next])
    setDirty(false)
    if (applied) {
      setApplied(false)
      setPreview(null)
    }
  }

  const ofSide = (type: ThemeType): ThemeLibraryEntry[] => library.filter((entry) => entry.theme.type === type)
  const savedEntry = library.find((entry) => !entry.builtIn && entry.theme.name === draft.name)

  return (
    <div className="styling">
      <div className="settings__field">
        <span className="settings__label">{t('Appearance.mode.label')}</span>
        <div
          className="cowatch__providers"
          role="radiogroup"
          aria-label={t('Appearance.mode.label')}
        >
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={config.mode === mode.id}
              className={config.mode === mode.id ? 'cowatch__provider cowatch__provider--on' : 'cowatch__provider'}
              onClick={() => void run(async () => acceptThemeState(await window.goonlib.theme.setMode(mode.id)))}
            >
              {t(mode.label)}
            </button>
          ))}
        </div>
        <span className="settings__hint">
          {config.mode === 'system'
            ? t('Appearance.mode.hint')
            : t('Appearance.mode.always', {
                mode: t(config.mode === 'light' ? 'Appearance.side.light' : 'Appearance.side.dark'),
              })}{' '}
          {t('Appearance.mode.guests')}
        </span>
      </div>

      <div className="styling__slots">
        {SIDES.map((slot) => {
          const theme = config[slot.id]
          const entries = ofSide(slot.id)
          const current = entries.find((entry) => sameTheme(entry.theme, theme))
          return (
            <div key={slot.id} className="styling__slot">
              <span className="settings__label">{t(slot.label)}</span>
              <Swatches theme={theme} />
              <select
                className="settings__select"
                aria-label={t(slot.label)}
                value={current?.id ?? ''}
                onChange={(event) => {
                  const entry = library.find((e) => e.id === event.target.value)
                  if (!entry) return
                  void run(async () => {
                    acceptThemeState(await window.goonlib.theme.use(slot.id, entry.theme))
                    if (slot.id === side) setDirty(false)
                  })
                }}
              >
                {current ? null : (
                  <option value="">{t('Appearance.theme.edited', { name: theme.name })}</option>
                )}
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.theme.name}
                    {entry.builtIn ? '' : ` · ${t('Appearance.theme.yours')}`}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      <div className="settings__group">
        <div className="styling__edithead">
          <span className="settings__label">{t('Appearance.edit')}</span>
          <div
            className="tabbar styling__sides"
            role="tablist"
            aria-label={t('Appearance.edit.label')}
          >
            {SIDES.map((slot) => (
              <button
                key={slot.id}
                type="button"
                role="tab"
                aria-selected={side === slot.id}
                className={side === slot.id ? 'tabbar__tab tabbar__tab--on' : 'tabbar__tab'}
                onClick={() => chooseSide(slot.id)}
              >
                {t(slot.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="styling__row">
          <label className="settings__field styling__grow">
            <span className="settings__label">{t('Appearance.name.label')}</span>
            <input
              className="settings__input"
              value={draft.name}
              maxLength={60}
              onChange={(event) => edit({ ...draft, name: event.target.value })}
              placeholder={t('Appearance.edit.myTheme')}
            />
          </label>
          <label className="settings__field">
            <span className="settings__label">{t('Appearance.startFrom')}</span>
            <select
              className="settings__select"
              value=""
              onChange={(event) => {
                const entry = library.find((e) => e.id === event.target.value)
                if (!entry) return
                edit({
                  ...entry.theme,
                  name: entry.builtIn ? `${entry.theme.name} copy` : entry.theme.name,
                  colors: { ...entry.theme.colors },
                })
              }}
            >
              <option value="" disabled>
                {t('Appearance.choose')}
              </option>
              {(['dark', 'light'] as const).map((type) => (
                <optgroup
                  key={type}
                  label={t(type === 'dark' ? 'Appearance.mode.dark' : 'Appearance.mode.light')}
                >
                  {ofSide(type).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.theme.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <ThemePreview vars={resolved.vars} />

        <div className="styling__colors">
          {THEME_GROUPS.slice(0, 1).map((group) => (
            <ColorGroup key={group.title} group={group} draft={draft} resolved={resolved.colors} onChange={setColor} />
          ))}
        </div>

        <button
          type="button"
          className="styling__disclosure"
          aria-expanded={fineTune}
          onClick={() => setFineTune((open) => !open)}
        >
          <span className={fineTune ? 'styling__chevron styling__chevron--open' : 'styling__chevron'} aria-hidden="true">
            ›
          </span>
          {t('Appearance.fineTune')}
          <span className="settings__hint">
            {t('Appearance.fineTune.count', {
              set: Object.keys(draft.colors).filter(
                (k) => !['background', 'foreground', 'accent'].includes(k),
              ).length,
              total: THEME_KEYS.length - 3,
            })}
          </span>
        </button>

        {fineTune ? (
          <div className="styling__colors">
            {THEME_GROUPS.slice(1).map((group) => (
              <ColorGroup key={group.title} group={group} draft={draft} resolved={resolved.colors} onChange={setColor} />
            ))}
          </div>
        ) : null}

        <div className="styling__actions">
          <button
            type="button"
            className={applied ? 'button button--on' : 'button'}
            aria-pressed={applied}
            onClick={() => {
              if (applied) {
                setApplied(false)
                setPreview(null)
              } else {
                setApplied(true)
              }
            }}
            title={t('Appearance.apply.title')}
          >
            {applied ? t('Appearance.applied') : t('Appearance.apply')}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!draft.name.trim()}
            onClick={() =>
              void run(async () => {
                const next = await window.goonlib.theme.save(side, { ...draft, name: draft.name.trim() })
                setDirty(false)
                setApplied(false)
                setPreview(null)
                acceptThemeState(next)
                setMessage({
                  ok: true,
                  text: t('Appearance.saved', {
                    name: draft.name.trim(),
                    side: t(side === 'light' ? 'Appearance.side.light' : 'Appearance.side.dark'),
                  }),
                })
              })
            }
            title={t('Appearance.save.title', {
              side: t(side === 'light' ? 'Appearance.side.light' : 'Appearance.side.dark'),
            })}
          >
            {t('Appearance.save')}
          </button>
          {dirty ? (
            <button type="button" className="button button--quiet" onClick={discard}>
              {t('Appearance.discard')}
            </button>
          ) : null}

          {savedEntry ? (
            <button
              type="button"
              className="button button--danger"
              onClick={() =>
                void run(async () => {
                  acceptThemeState(await window.goonlib.theme.remove(savedEntry.id))
                  setMessage({
                    ok: true,
                    text: t('Appearance.removed', { name: savedEntry.theme.name }),
                  })
                })
              }
              title={t('Appearance.remove.title')}
            >
              {t('Appearance.remove')}
            </button>
          ) : null}

          <span className="styling__spacer" />

          <button
            type="button"
            className="button"
            onClick={() =>
              void run(async () => {
                const result = await window.goonlib.theme.import()
                acceptThemeState(result.state)
                if (!result.theme) return
                edit(result.theme)
                setMessage({
                  ok: result.skipped.length === 0,
                  text:
                    result.skipped.length === 0
                      ? t('Appearance.imported', { name: result.theme.name })
                      : t('Appearance.imported.skipped', {
                          name: result.theme.name,
                          skipped: result.skipped.join(', '),
                        }),
                })
              })
            }
          >
            {t('Appearance.import')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              void run(async () => {
                if (await window.goonlib.theme.export(draft)) {
                  setMessage({ ok: true, text: t('Appearance.exported', { name: draft.name }) })
                }
              })
            }
          >
            {t('Appearance.export')}
          </button>
        </div>

        {message ? <span className={message.ok ? 'settings__ok' : 'settings__bad'}>{message.text}</span> : null}

        <span className="settings__hint">
          {t('Appearance.files')}{' '}
          <button type="button" className="styling__link" onClick={() => void window.goonlib.theme.revealFolder()}>
            {t('Appearance.themesFolder')}
          </button>
        </span>

        {state.problems.length > 0 ? (
          <div className="styling__problems">
            <span className="settings__label">{t('Appearance.problems')}</span>
            <ul>
              {state.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Swatches({ theme }: { theme: Theme }): React.JSX.Element {
  const { colors } = resolveTheme(theme)
  return (
    <span className="styling__swatches" aria-hidden="true">
      {(['background', 'panel.background', 'foreground', 'accent', 'favorite'] as const).map((key) => (
        <span key={key} className="styling__swatch" style={{ background: colors[key] }} />
      ))}
    </span>
  )
}

function ColorGroup(props: {
  group: (typeof THEME_GROUPS)[number]
  draft: Theme
  resolved: Record<string, string>
  onChange: (key: ThemeKey, value: string | null) => void
}): React.JSX.Element {
  return (
    <div className="styling__group">
      <span className="styling__grouptitle">{t(props.group.title)}</span>
      {props.group.keys.map(({ key, label }) => (
        <ColorField
          key={key}
          themeKey={key}
          label={t(label)}
          own={props.draft.colors[key]}
          shown={props.resolved[key] ?? '#000000'}
          onChange={(value) => props.onChange(key, value)}
        />
      ))}
    </div>
  )
}

/**
 * One colour: a swatch that opens the system picker, and the value as text
 * for pasting. Left unset, it shows what it follows, and says so.
 */
function ColorField(props: {
  themeKey: ThemeKey
  label: string
  own: string | undefined
  shown: string
  onChange: (value: string | null) => void
}): React.JSX.Element {
  const [text, setText] = useState(props.own ?? '')
  useEffect(() => setText(props.own ?? ''), [props.own])

  const commit = (): void => {
    const trimmed = text.trim()
    if (!trimmed) {
      if (props.own) props.onChange(null)
      return
    }
    const color = normalizeColor(trimmed)
    if (color) props.onChange(color)
    else setText(props.own ?? '')
  }

  return (
    <div className="styling__color" title={props.themeKey}>
      <label className="styling__picker" style={{ background: props.shown }}>
        <input
          type="color"
          value={props.shown.slice(0, 7)}
          onChange={(event) => props.onChange(event.target.value)}
          aria-label={props.label}
        />
      </label>
      <span className="styling__colorlabel">
        {props.label}
        <code>{props.themeKey}</code>
      </span>
      <input
        className="settings__input styling__hex"
        value={text}
        placeholder={t('Appearance.colour.auto', { colour: props.shown })}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        aria-label={t('Appearance.colour.asText', { label: props.label })}
      />
      {props.own ? (
        <button
          type="button"
          className="styling__reset"
          onClick={() => props.onChange(null)}
          title={t('Appearance.reset.title')}
          aria-label={t('Appearance.reset', { label: props.label })}
        >
          ×
        </button>
      ) : (
        <span className="styling__reset" aria-hidden="true" />
      )}
    </div>
  )
}

/** A small mock of the app in the draft's colours, drawn with the same variables. */
function ThemePreview({ vars }: { vars: Record<string, string> }): React.JSX.Element {
  return (
    <div className="themeprev" style={vars as React.CSSProperties} aria-hidden="true">
      <div className="themeprev__side">
        <span className="themeprev__nav themeprev__nav--on">{t('Appearance.colour.library')}</span>
        <span className="themeprev__nav">{t('Appearance.colour.favorites')}</span>
        <span className="themeprev__nav themeprev__nav--muted">
          {t('Appearance.colour.collections')}
        </span>
      </div>
      <div className="themeprev__main">
        <div className="themeprev__toolbar">
          <span className="themeprev__search">{t('Appearance.colour.search')}</span>
          <span className="themeprev__button">{t('Appearance.colour.random')}</span>
          <span className="themeprev__chip">{t('Appearance.colour.on')}</span>
        </div>
        <div className="themeprev__grid">
          <span className="themeprev__card" />
          <span className="themeprev__card themeprev__card--heart">
            <HeartIcon filled size={12} />
          </span>
          <span className="themeprev__card" />
        </div>
        <div className="themeprev__controls">
          <span className="themeprev__track">
            <span className="themeprev__progress" />
          </span>
          <span className="themeprev__status themeprev__status--ok">
            {t('Appearance.colour.saved')}
          </span>
          <span className="themeprev__status themeprev__status--bad">
            {t('Appearance.colour.stop')}
          </span>
        </div>
      </div>
    </div>
  )
}
