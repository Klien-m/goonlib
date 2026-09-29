import { useCallback, useEffect, useState } from 'react'
import { ADULT_CATEGORIES } from '@shared/categories'
import { AI_MODELS, AI_PROVIDERS, DEFAULT_BASE_URL } from '@shared/types'
import type {
  AiProvider,
  AiSettings,
  AiSettingsView,
  AiTestResult,
} from '@shared/types'
import { Slider, Switch } from './SettingsControls'
import { CheckIcon, SearchIcon, WarningIcon } from './SidebarIcons'
import { formatCount } from '../format'
import { TabPanel } from './TabPanel'
import type { SheetTab } from './TabPanel'
import { t } from '../i18n'

export interface AiSectionsProps {
  /** Which tab of the Settings sheet is showing. */
  tab: SheetTab
  onSelectTab: (tab: SheetTab) => void
  /** Fired after anything that could change the library, so the grid refreshes. */
  onChanged: () => void
  /** Closes the sheet and shows the duplicates screen. */
  onOpenDuplicates: () => void
}

/**
 * How alike two pictures must look to be grouped as duplicates, as the
 * Hamming distance between their perceptual hashes. Loose stops at 7, the
 * furthest the hash banding is guaranteed to find.
 */
const SIMILARITY: Array<{ distance: number; label: string; note: string; icon: React.ReactNode }> = [
  { distance: 3, label: 'Ai.similarity.strict', note: 'Ai.similarity.strict.note', icon: <CheckIcon /> },
  {
    distance: 6,
    label: 'Ai.similarity.balanced',
    note: 'Ai.similarity.balanced.note',
    icon: <SearchIcon />,
  },
  { distance: 7, label: 'Ai.similarity.loose', note: 'Ai.similarity.loose.note', icon: <WarningIcon /> },
]

/**
 * The AI tabs of the Settings sheet: who does the labelling, what it labels
 * with, how duplicates are judged, and running a classification pass by hand.
 * All four are rendered at once and only one shown, so what is typed into one
 * survives a look at another.
 *
 * Every control writes through to the main process as it changes rather than
 * batching behind a Save button — there is no partially-applied state to get
 * wrong, and the scan reads these values on its next pass either way.
 */
export function AiSections(props: AiSectionsProps): React.JSX.Element {
  const [settings, setSettings] = useState<AiSettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [keyDraft, setKeyDraft] = useState('')
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<AiTestResult | null>(null)
  const [queued, setQueued] = useState<number | null>(null)
  /** What the last reset took back, said once and cleared on the next run. */
  const [reset, setReset] = useState<string | null>(null)
  const [available, setAvailable] = useState<string[] | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)

  const [distance, setDistance] = useState<number | null>(null)
  // How many the duplicates page would show, counted the same way, whenever
  // this tab is opened or the threshold moves.
  const [dupeCount, setDupeCount] = useState<number | null>(null)
  const onDuplicatesTab = props.tab === 'duplicates'

  useEffect(() => {
    if (!onDuplicatesTab || distance === null) return
    let current = true
    void window.goonlib.duplicates
      .find()
      .then((report) => {
        if (current) setDupeCount(report.exact.length + report.near.length)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [onDuplicatesTab, distance])

  useEffect(() => {
    void window.goonlib.duplicates.distance().then(setDistance).catch(() => undefined)

    void window.goonlib.ai
      .settings()
      .then(setSettings)
      .catch((err: unknown) => setError(message(err)))
  }, [])

  const guard = useCallback(async (action: () => Promise<AiSettingsView>) => {
    try {
      setSettings(await action())
      setError(null)
    } catch (err) {
      setError(message(err))
    }
  }, [])

  const patch = useCallback(
    (changes: Partial<AiSettings>) => void guard(() => window.goonlib.ai.update(changes)),
    [guard],
  )

  const saveKey = useCallback(() => {
    const key = keyDraft.trim()
    if (!key) return
    setTest(null)
    void guard(async () => {
      const next = await window.goonlib.ai.setKey(key)
      setKeyDraft('')
      return next
    })
  }, [keyDraft, guard])

  const runTest = useCallback(async () => {
    setTesting(true)
    setTest(null)
    try {
      setTest(await window.goonlib.ai.test())
    } catch (err) {
      setTest({ ok: false, message: message(err) })
    }
    setTesting(false)
  }, [])

  const loadModels = useCallback(async () => {
    setLoadingModels(true)
    try {
      setAvailable(await window.goonlib.ai.models())
      setError(null)
    } catch (err) {
      // Left null, not empty: an empty list renders as "None loaded" and takes
      // the Load button away, so a failed fetch would strand the user with no
      // way to retry short of reopening settings.
      setAvailable(null)
      setError(message(err))
    }
    setLoadingModels(false)
  }, [])

  // Confirmed in the main process, where the dialog belongs, so a click here
  // can never take anything away on its own.
  const resetAi = useCallback(async () => {
    setQueued(null)
    setReset(null)
    try {
      const gone = await window.goonlib.ai.reset()
      if (!gone) return
      setReset(
        gone.items === 0
          ? t('Ai.classify.nothingFiled')
          : t('Ai.classify.tookBack', {
              entries:
                gone.items === 1
                  ? t('Ai.classify.entries.one')
                  : t('Ai.classify.entries.many', { count: gone.items }),
              tags:
                gone.tags === 0
                  ? ''
                  : gone.tags === 1
                    ? t('Ai.classify.tags.one')
                    : t('Ai.classify.tags.many', { count: gone.tags }),
              collections:
                gone.collections === 0
                  ? ''
                  : gone.collections === 1
                    ? t('Ai.classify.collections.one')
                    : t('Ai.classify.collections.many', { count: gone.collections }),
            }),
      )
      props.onChanged()
    } catch (err) {
      setError(message(err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- props read fresh each render
  }, [])

  const changeDistance = useCallback((next: number) => {
    void window.goonlib.duplicates
      .setDistance(next)
      .then(setDistance)
      .catch((err: unknown) => setError(message(err)))
  }, [])

  const reclassify = useCallback(
    async (all: boolean) => {
      setQueued(null)
      setReset(null)
      try {
        const count = await window.goonlib.ai.reclassify(all)
        setQueued(count)
        props.onChanged()
      } catch (err) {
        setError(message(err))
      }
    },
    [props],
  )

  const { tab } = props
  const choose = props.onSelectTab

  if (settings === null) {
    return (
      <p className="muted" hidden={!AI_TABS.includes(tab)}>
        {error ?? t('Ai.loading')}
      </p>
    )
  }

  return (
    <>
      {error && AI_TABS.includes(tab) ? (
        <div className="banner banner--error settings__banner" role="alert">
          {error}
        </div>
      ) : null}

            <TabPanel id="providers" tab={tab}>
              <Switch
                label={t('Ai.enable')}
                hint={t(settings.provider === 'openai' ? 'Ai.enable.openai' : 'Ai.enable.anthropic')}
                checked={settings.enabled}
                onChange={(enabled) => patch({ enabled })}
              />

              {settings.enabled ? (
                <div className="settings__group">
                  <Field label={t('Ai.provider')} hint={providerNote(settings.provider)}>
                    <select
                      className="settings__select"
                      value={settings.provider}
                      onChange={(event) => {
                        setTest(null)
                        setAvailable(null)
                        patch({ provider: event.target.value as AiProvider })
                      }}
                    >
                      {AI_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {t(provider.label)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {settings.provider === 'openai' ? (
                    <Field label={t('Ai.server')} hint={t('Ai.server.hint')}>
                      <BaseUrlEditor
                        baseUrl={settings.baseUrl}
                        onCommit={(baseUrl) => {
                          setTest(null)
                          setAvailable(null)
                          patch({ baseUrl })
                        }}
                      />
                    </Field>
                  ) : null}

                  <Field
                    label={
                      settings.provider === 'anthropic' ? t('Ai.key') : t('Ai.key.optional')
                    }
                    hint={keyStatus(settings)}
                  >
                    <div className="settings__row">
                      <input
                        type="password"
                        className="settings__input"
                        placeholder={
                          settings.apiKeyPresent ? t('Ai.key.replace') : 'sk-ant-…'
                        }
                        value={keyDraft}
                        onChange={(event) => setKeyDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveKey()
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={t('Ai.key.aria')}
                      />
                      <button
                        type="button"
                        className="button"
                        onClick={saveKey}
                        disabled={keyDraft.trim().length === 0}
                      >
                        {t('Ai.key.save')}
                      </button>
                      {settings.apiKeyPresent ? (
                        <button
                          type="button"
                          className="button button--quiet"
                          onClick={() => {
                            setTest(null)
                            void guard(() => window.goonlib.ai.clearKey())
                          }}
                        >
                          {t('Ai.key.remove')}
                        </button>
                      ) : null}
                    </div>

                    <div className="settings__row settings__row--tight">
                      <button
                        type="button"
                        className="button button--quiet"
                        onClick={() => void runTest()}
                        disabled={!settings.ready || testing}
                      >
                        {testing ? t('Ai.key.testing') : t('Ai.key.test')}
                      </button>
                      {test ? (
                        <span className={test.ok ? 'settings__ok' : 'settings__bad'}>
                          {test.message}
                        </span>
                      ) : null}
                    </div>
                  </Field>

                  {settings.provider === 'anthropic' ? (
                    <Field label={t('Ai.model')} hint={t('Ai.model.hint')}>
                      <select
                        className="settings__select"
                        value={settings.model}
                        onChange={(event) => patch({ model: event.target.value })}
                      >
                        {AI_MODELS.some((model) => model.id === settings.model) ? null : (
                          <option value={settings.model}>{settings.model}</option>
                        )}
                        {AI_MODELS.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label} - {model.note}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <Field label={t('Ai.model')} hint={t('Ai.model.local.hint')}>
                      {available === null ? (
                        <div className="settings__row">
                          <ModelEditor
                            model={settings.model}
                            onCommit={(model) => patch({ model })}
                          />
                          <button
                            type="button"
                            className="button button--quiet"
                            onClick={() => void loadModels()}
                            disabled={loadingModels}
                          >
                            {loadingModels ? t('Ai.model.loading') : t('Ai.model.load')}
                          </button>
                        </div>
                      ) : available.length === 0 ? (
                        <div className="settings__row">
                          <ModelEditor
                            model={settings.model}
                            onCommit={(model) => patch({ model })}
                          />
                          <span className="settings__bad">{t('Ai.model.none')}</span>
                        </div>
                      ) : (
                        <select
                          className="settings__select"
                          value={settings.model}
                          onChange={(event) => patch({ model: event.target.value })}
                        >
                          {/* Keep the stored value selectable even when the server
                              has since unloaded it, so opening settings can't
                              silently rewrite the model out from under a scan. */}
                          {available.includes(settings.model) ? null : (
                            <option value={settings.model}>
                              {t('Ai.model.notLoaded', { id: settings.model })}
                            </option>
                          )}
                          {available.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}

                  <Field
                    label={t('Ai.concurrency')}
                    hint={t(
                      settings.provider === 'openai'
                        ? 'Ai.concurrency.hint.openai'
                        : 'Ai.concurrency.hint.anthropic',
                    )}
                  >
                    <input
                      type="number"
                      className="settings__number"
                      min={1}
                      max={16}
                      value={settings.concurrency}
                      onChange={(event) => patch({ concurrency: Number(event.target.value) })}
                    />
                  </Field>
                </div>
              ) : null}
            </TabPanel>

            <TabPanel id="tagging" tab={tab}>
              {settings.enabled ? null : <OffNote onOpen={() => choose('providers')} />}

              <Field label={t('Ai.labels')} hint={t('Ai.labels.hint')}>
                <CategoryEditor
                  categories={settings.categories}
                  onCommit={(categories) => patch({ categories })}
                />
                <div className="settings__row settings__row--tight">
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() =>
                      patch({ categories: [...settings.categories, ...ADULT_CATEGORIES] })
                    }
                    title={t('Ai.prefill.title', { count: ADULT_CATEGORIES.length })}
                  >
                    {t('Ai.prefill')}
                  </button>
                  <span className="muted">{t('Ai.inUse', { count: settings.categories.length })}</span>
                </div>
              </Field>

              <div className="settings__group settings__field">
                <span className="settings__label">{t('Ai.classification')}</span>
                <div className="settings__row settings__row--tight">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void reclassify(false)}
                    disabled={!settings.ready}
                    title={t('Ai.classify.unlabelled.title')}
                  >
                    {t('Ai.classify.unlabelled')}
                  </button>
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => void reclassify(true)}
                    disabled={!settings.ready}
                    title={t('Ai.classify.all.title')}
                  >
                    {t('Ai.classify.all')}
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => void resetAi()}
                    title={t('Ai.classify.reset.title')}
                  >
                    {t('Ai.classify.reset')}
                  </button>
                  {queued !== null ? (
                    <span className="muted">
                      {queued === 0 ? t('Ai.classify.nothing') : t('Ai.classify.queued', { count: queued })}
                    </span>
                  ) : null}
                  {reset !== null ? <span className="muted">{reset}</span> : null}
                </div>
                <span className="settings__hint">{t('Ai.classify.hint')}</span>

                {settings.autoSort ? (
                  <Slider
                    label={t('Ai.confidence')}
                    hint={t('Ai.confidence.hint')}
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(settings.minConfidence * 100)}
                    format={(value) => `${value}%`}
                    onChange={(value) => patch({ minConfidence: value / 100 })}
                  />
                ) : null}
              </div>

              <div className="settings__group">
                <Switch
                  compact
                  label={t('Ai.autoSort')}
                  hint={t('Ai.autoSort.hint')}
                  checked={settings.autoSort}
                  onChange={(autoSort) => patch({ autoSort })}
                />

                <Switch
                  compact
                  label={t('Ai.captions')}
                  hint={t('Ai.captions.hint')}
                  checked={settings.captions}
                  onChange={(captions) => patch({ captions })}
                />

                <Switch
                  compact
                  label={t('Ai.videos')}
                  hint={t('Ai.videos.hint')}
                  checked={settings.includeVideos}
                  onChange={(includeVideos) => patch({ includeVideos })}
                />
              </div>

            </TabPanel>

            <TabPanel id="duplicates" tab={tab}>
              <div className="settings__field">
                <button type="button" className="button" onClick={props.onOpenDuplicates}>
                  {t('Ai.openDuplicates')}
                </button>
                <span className="settings__hint">
                  {dupeCount === null
                    ? t('Ai.duplicates.detected')
                    : t('Ai.duplicates.detected.count', { count: formatCount(dupeCount) })}
                </span>
              </div>

              <div className="settings__group">
                <Field label={t('Ai.similarity')}>
                  <div className="cowatch__providers" role="radiogroup" aria-label={t('Ai.similarity.aria')}>
                    {SIMILARITY.map((option) => (
                      <button
                        key={option.distance}
                        type="button"
                        role="radio"
                        aria-checked={distance === option.distance}
                        className={
                          distance === option.distance
                            ? 'cowatch__provider cowatch__provider--on'
                            : 'cowatch__provider'
                        }
                        onClick={() => changeDistance(option.distance)}
                        title={t(option.note)}
                      >
                        {t(option.label)}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const chosen = SIMILARITY.find((option) => option.distance === distance)
                    return (
                      <span className="settings__hint settings__hint--icon">
                        {chosen ? chosen.icon : null}
                        {chosen ? t(chosen.note) : t('Ai.similarity.custom')}
                      </span>
                    )
                  })()}
                </Field>
              </div>
            </TabPanel>

    </>
  )
}

const AI_TABS: SheetTab[] = ['providers', 'tagging', 'duplicates']

/** Said at the top of a tab whose settings do nothing while AI is switched off. */
function OffNote({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  return (
    <p className="settings__hint settings__note">
      {t('Ai.off')}{' '}
      <button type="button" className="linkish" onClick={onOpen}>
        {t('Ai.off.turnOn')}
      </button>
      .
    </p>
  )
}

function providerNote(provider: AiProvider): string {
  const note = AI_PROVIDERS.find((entry) => entry.id === provider)?.note ?? ''
  return note ? t(note) : ''
}

function keyStatus(settings: AiSettingsView): string {
  if (!settings.apiKeyPresent) {
    return t(settings.provider === 'openai' ? 'Ai.key.notSet.openai' : 'Ai.key.notSet.anthropic')
  }

  return t(settings.apiKeyEncrypted ? 'Ai.key.storedEncrypted' : 'Ai.key.storedPlain')
}

/** Committed on blur, so a half-typed URL is never saved and then requested. */
function BaseUrlEditor(props: {
  baseUrl: string
  onCommit: (baseUrl: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.baseUrl)

  // Re-sync when the main process normalises it (trailing slashes, bad schemes).
  useEffect(() => {
    setDraft(props.baseUrl)
  }, [props.baseUrl])

  return (
    <input
      type="url"
      className="settings__input"
      value={draft}
      placeholder={DEFAULT_BASE_URL}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => props.onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      aria-label={t('Ai.server.aria')}
    />
  )
}

/** Same idea for the model id, which is typed by hand for a local server. */
function ModelEditor(props: {
  model: string
  onCommit: (model: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.model)

  useEffect(() => {
    setDraft(props.model)
  }, [props.model])

  return (
    <input
      className="settings__input"
      value={draft}
      placeholder="qwen2.5-vl-7b"
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => props.onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      aria-label={t('Ai.model.local.aria')}
    />
  )
}

interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, hint, children }: FieldProps): React.JSX.Element {
  return (
    <div className="settings__field">
      <span className="settings__label">{label}</span>
      {children}
      {hint ? <span className="settings__hint">{hint}</span> : null}
    </div>
  )
}

/**
 * Categories are edited as free text and committed on blur rather than per
 * keystroke, so a half-typed line never briefly becomes a real category.
 */
function CategoryEditor(props: {
  categories: string[]
  onCommit: (categories: string[]) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.categories.join('\n'))

  // Re-sync when the main process normalises the list (dedupes, trims, caps it).
  useEffect(() => {
    setDraft(props.categories.join('\n'))
  }, [props.categories])

  return (
    <textarea
      className="settings__textarea"
      rows={5}
      value={draft}
      placeholder={t('Ai.labels.placeholder')}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => props.onCommit(draft.split('\n'))}
      aria-label={t('Ai.labels.aria')}
    />
  )
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
