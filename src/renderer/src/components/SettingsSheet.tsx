import { useEffect, useRef, useState } from 'react'
import type { AppInfo, PlaybackPrefs } from '@shared/types'
import type { CoWatchView } from '../state/useCoWatch'
import type { ToyView } from '../state/useToy'
import { AiSections } from './AiSections'
import { AppSettings } from './AppSettings'
import { AppStyling } from './AppStyling'
import { BackupSettings } from './BackupSettings'
import { ShortcutsSettings } from './ShortcutsSettings'
import { PeopleIcon, PulseIcon, SlidersIcon, SparkleIcon } from './SidebarIcons'
import { TabPanel, type SheetTab } from './TabPanel'
import { ToySections } from './ToySections'
import { t } from '../i18n'

export interface SettingsSheetProps {
  toy: ToyView
  cowatch: CoWatchView
  /** The tab to open on. */
  tab: SheetTab
  /** The player's preferences, for the App page. */
  playback: PlaybackPrefs
  onPlaybackChange: (patch: Partial<PlaybackPrefs>) => void
  onSelectTab: (tab: SheetTab) => void
  onClose: () => void
  /** Fired after anything that could change the library, so the grid refreshes. */
  onChanged: () => void
  /** Closes the sheet and shows the duplicates screen. */
  onOpenDuplicates: () => void
}

/** One entry in the rail. `tabs` is every sheet tab the entry stands for. */
interface RailEntry {
  /** A catalogue key, not the words: the rail is built once, at import. */
  label: string
  /** The tab the entry opens on. */
  tab: SheetTab
  tabs: SheetTab[]
}

/**
 * The rail, in groups. Tabs run down the side rather than across the top: a
 * row would not fit across the sheet, and the groups say which belong
 * together. Features stands for two tabs, shown as tabs of their own inside it.
 */
const GROUPS: Array<{ label: string; icon: React.ReactNode; entries: RailEntry[] }> = [
  {
    label: 'Settings.group.general',
    icon: <SlidersIcon />,
    entries: [
      { label: 'Settings.tab.app', tab: 'app', tabs: ['app'] },
      { label: 'Settings.tab.styling', tab: 'styling', tabs: ['styling'] },
      { label: 'Settings.tab.duplicates', tab: 'duplicates', tabs: ['duplicates'] },
      { label: 'Settings.tab.shortcuts', tab: 'shortcuts', tabs: ['shortcuts'] },
      { label: 'Settings.tab.backup', tab: 'backup', tabs: ['backup'] },
    ],
  },
  {
    label: 'Settings.group.toys',
    icon: <PulseIcon />,
    entries: [
      { label: 'Settings.tab.controls', tab: 'controls', tabs: ['controls'] },
      { label: 'Settings.tab.solo', tab: 'solo', tabs: ['solo'] },
      { label: 'Settings.tab.patterns', tab: 'patterns', tabs: ['patterns'] },
    ],
  },
  {
    label: 'Settings.group.sharing',
    icon: <PeopleIcon />,
    entries: [{ label: 'Settings.tab.together', tab: 'together', tabs: ['together'] }],
  },
  {
    label: 'Settings.group.ai',
    icon: <SparkleIcon />,
    entries: [
      { label: 'Settings.tab.providers', tab: 'providers', tabs: ['providers'] },
      { label: 'Settings.tab.tagging', tab: 'tagging', tabs: ['tagging'] },
    ],
  },
]

/**
 * What each page opens with: its title, a line on what it is for, and a rule
 * under both. The two Features tabs share one.
 */
const PAGE_HEADS: Record<SheetTab, { title: string; intro: string }> = {
  app: { title: 'Settings.head.app', intro: 'Settings.head.app.intro' },
  styling: { title: 'Settings.head.styling', intro: 'Settings.head.styling.intro' },
  shortcuts: { title: 'Settings.head.shortcuts', intro: 'Settings.head.shortcuts.intro' },
  backup: { title: 'Settings.head.backup', intro: 'Settings.head.backup.intro' },
  duplicates: { title: 'Settings.head.duplicates', intro: 'Settings.head.duplicates.intro' },
  controls: { title: 'Settings.head.controls', intro: 'Settings.head.controls.intro' },
  solo: { title: 'Settings.head.solo', intro: 'Settings.head.solo.intro' },
  patterns: { title: 'Settings.head.patterns', intro: 'Settings.head.patterns.intro' },
  together: { title: 'Settings.head.together', intro: 'Settings.head.together.intro' },
  providers: { title: 'Settings.head.providers', intro: 'Settings.head.providers.intro' },
  tagging: { title: 'Settings.head.tagging', intro: 'Settings.head.tagging.intro' },
}

/** The tabs inside Features, across the top of it. */
const FEATURE_TABS: Array<{ id: SheetTab; label: string }> = [
  { id: 'tagging', label: 'Settings.tab.tagging.autoTagging' },
]

/**
 * Whether this is a beta build, which the footer says out loud.
 *
 * A plain flag rather than something read out of the version: the version
 * stays an ordinary number so the updater and the installers keep their usual
 * names, and "beta" is a thing said to the reader rather than a release
 * channel. Set it to false when 1.0 ships.
 */
const BETA = true

/**
 * Settings: everything behind the one gear — how the app looks, the toy,
 * watching together, and AI — in one sheet with a tab for each.
 *
 * Every tab stays mounted and only the chosen one is shown, so nothing typed,
 * drawn or previewing is lost by looking at another. Every control writes
 * through as it changes; the one Save is for keeping a theme being edited.
 */
export function SettingsSheet(props: SettingsSheetProps): React.JSX.Element {
  const { tab } = props
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    shellRef.current?.focus()
    void window.goonlib.app.info().then(setInfo).catch(() => undefined)
  }, [])

  const knocking = props.cowatch.session.knocking.length
  const sharing = props.cowatch.session.active

  return (
    <div
      className="prompt"
      role="dialog"
      aria-modal="true"
      aria-label={t('Settings.aria')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div
        className="settings settings--sheet"
        ref={shellRef}
        tabIndex={-1}
        // The viewer listens for keys at the window; without this its shortcuts
        // would fire while settings are being edited. X is let through, so the
        // toy can be stopped from here as from anywhere else.
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            props.onClose()
            event.stopPropagation()
            return
          }
          if (event.key !== 'x' && event.key !== 'X') event.stopPropagation()
        }}
      >
        <header className="settings__head">
          <h2 className="settings__title">{t('Settings.title')}</h2>
          <button
            type="button"
            className="lightbox__close"
            onClick={props.onClose}
            aria-label={t('Settings.close')}
          >
            ×
          </button>
        </header>

        <div className="sheet">
          <nav className="sheet__rail" role="tablist" aria-orientation="vertical" aria-label={t('Settings.aria')}>
            {GROUPS.map((group) => (
              <div key={group.label} className="sheet__group">
                <span className="sheet__group-label">
                  <span className="sheet__group-icon">{group.icon}</span>
                  {t(group.label)}
                </span>
                {group.entries.map((entry) => {
                  const on = entry.tabs.includes(tab)
                  return (
                    <button
                      key={entry.label}
                      type="button"
                      role="tab"
                      id={`settings-tab-${entry.tab}`}
                      aria-selected={on}
                      aria-controls={`settings-panel-${entry.tab}`}
                      className={on ? 'sheet__tab sheet__tab--on' : 'sheet__tab'}
                      // Stays on the inner tab already showing, when there is one.
                      onClick={() => (on ? undefined : props.onSelectTab(entry.tab))}
                    >
                      {t(entry.label)}
                      {entry.tab === 'together' && knocking > 0 ? (
                        <span className="sidebar__badge sheet__badge">{knocking}</span>
                      ) : entry.tab === 'together' && sharing ? (
                        <span className="tabbar__dot" title={t('Settings.session.running')} />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="settings__body sheet__content">
            <header className="sheet__pagehead">
              <h3 className="settings__heading">{t(PAGE_HEADS[tab].title)}</h3>
              <p className="settings__hint">{t(PAGE_HEADS[tab].intro)}</p>
            </header>
            {FEATURE_TABS.some((option) => option.id === tab) ? (
              <div className="tabbar sheet__subtabs" role="tablist" aria-label={t('Settings.features.aria')}>
                {FEATURE_TABS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === option.id}
                    aria-controls={`settings-panel-${option.id}`}
                    className={tab === option.id ? 'tabbar__tab tabbar__tab--on' : 'tabbar__tab'}
                    onClick={() => props.onSelectTab(option.id)}
                  >
                    {t(option.label)}
                  </button>
                ))}
              </div>
            ) : null}
            <TabPanel id="app" tab={tab}>
              <AppSettings
                playback={props.playback}
                onPlaybackChange={props.onPlaybackChange}
                onChanged={props.onChanged}
              />
            </TabPanel>
            <TabPanel id="shortcuts" tab={tab}>
              <ShortcutsSettings />
            </TabPanel>
            <TabPanel id="backup" tab={tab}>
              <BackupSettings />
            </TabPanel>
            <TabPanel id="styling" tab={tab}>
              <AppStyling active={tab === 'styling'} />
            </TabPanel>
            <ToySections
              toy={props.toy}
              cowatch={props.cowatch}
              playback={props.playback}
              onPlaybackChange={props.onPlaybackChange}
              sharing={sharing}
              tab={tab}
            />
            <AiSections
              tab={tab}
              onSelectTab={props.onSelectTab}
              onChanged={props.onChanged}
              onOpenDuplicates={props.onOpenDuplicates}
            />
          </div>
        </div>

        {info ? (
          <footer className="settings__foot">
            GoonLib {info.version}
            {BETA ? (
              <span className="settings__beta" title={t('Settings.footer.beta')}>
                {t('Settings.footer.betaTag')}
              </span>
            ) : null}
            {info.ffmpeg ? '' : ` · ${t('Settings.footer.ffmpegMissing')}`} · Author:{' '}
            {/* target=_blank rather than an IPC call: the window's open handler
                already sends anything opening a new window to the real browser
                and denies the window itself. */}
            <a
              className="settings__link"
              href="https://github.com/adatje"
              target="_blank"
              rel="noreferrer"
              title={t('Settings.footer.author')}
            >
              @Adatje
            </a>
          </footer>
        ) : null}
      </div>
    </div>
  )
}
