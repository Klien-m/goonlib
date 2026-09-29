import { useCallback, useEffect, useState } from 'react'
import type { CoWatchGuest, CoWatchKnock, CoWatchTunnelProvider } from '@shared/types'
import { CLOUDFLARED_INSTALL, IS_WINDOWS } from '../platform'
import type { CoWatchView } from '../state/useCoWatch'
import { PeopleIcon } from './SidebarIcons'
import { t } from '../i18n'

export interface CoWatchSectionProps {
  cowatch: CoWatchView
}

/**
 * The host's side of a session: how to start one, who is in it, and how to end
 * it. Shown on the Watch Together tab of Settings, above the toy's guest
 * settings.
 *
 * Two things are given more room than their size suggests. Approving a knock is
 * the only thing standing between an invite link and the whole library, so it
 * is the loudest element on the panel whenever someone is waiting. And stopping
 * is always one click away, because the answer to "who is looking at my
 * library right now" should never be more than that.
 */
/** Where a session is reachable from: through one of the tunnels, or this network only. */
type Reach = CoWatchTunnelProvider | 'lan'

/** How to get cloudflared, in the words of this platform. */
const CLOUDFLARED_NOTE: React.ReactNode = CLOUDFLARED_INSTALL ? (
  <>
    {t('CoWatch.cloudflared.install', { command: '' })}
    <code className="settings__code">{CLOUDFLARED_INSTALL}</code>
  </>
) : (
  <>{t('CoWatch.cloudflared.note')}</>
)

const CLOUDFLARED_TITLE = CLOUDFLARED_INSTALL
  ? t('CoWatch.cloudflared.install', { command: CLOUDFLARED_INSTALL })
  : t('CoWatch.cloudflared.note')

const PROVIDERS: Array<{ id: Reach; label: string; note: React.ReactNode; title: string }> = [
  {
    id: 'auto',
    label: 'CoWatch.auto',
    note: null,
    title: 'CoWatch.auto.note',
  },
  {
    id: 'cloudflared',
    label: 'cloudflared',
    note: CLOUDFLARED_NOTE,
    title: CLOUDFLARED_TITLE,
  },
  {
    id: 'ngrok',
    label: 'ngrok',
    note: (
      <>
        {t('CoWatch.ngrok.noteBefore')}
        <code className="settings__code">ngrok config add-authtoken &lt;token&gt;</code>
      </>
    ),
    title: t('CoWatch.ngrok.note'),
  },
  { id: 'lan', label: 'LAN', note: null, title: 'CoWatch.lan.note' },
]

function noteFor(id: Reach): React.ReactNode {
  return PROVIDERS.find((option) => option.id === id)?.note ?? null
}

export function CoWatchSection({ cowatch }: CoWatchSectionProps): React.JSX.Element {
  const { session } = cowatch
  const [copied, setCopied] = useState(false)
  const [provider, setProvider] = useState<Reach>(session.provider)

  const { refreshTunnels } = cowatch

  useEffect(() => {
    // Checked on open rather than at startup: someone can install cloudflared
    // while the app is running, and should not have to restart it to be offered
    // the option.
    refreshTunnels()
  }, [refreshTunnels])

  const copy = useCallback(() => {
    void cowatch.copyInvite().then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }, [cowatch])

  return (
    <div className="cowatch">
      <div>

        {session.error ? (
          <div className="banner banner--error" role="alert">
            {session.error}
          </div>
        ) : null}

        {!session.active ? (
          <div>
            <span className="settings__label">{t('CoWatch.sessions')}</span>

            <div className="cowatch__start">
              <div
                className="cowatch__providers"
                role="group"
                aria-label={t('CoWatch.reach')}
              >
                {PROVIDERS.map((option) => {
                  const installed =
                    option.id === 'lan'
                      ? null
                      : option.id === 'auto'
                        ? session.available.length > 0
                        : session.available.includes(option.id)

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={
                        provider === option.id
                          ? 'cowatch__provider cowatch__provider--on'
                          : 'cowatch__provider'
                      }
                      aria-pressed={provider === option.id}
                      onClick={() => setProvider(option.id)}
                      title={
                        installed === false
                          ? t('CoWatch.notInstalled', { name: option.label })
                          : t(option.title)
                      }
                    >
                      {t(option.label)}
                      {installed === null ? null : (
                        <span className={installed ? 'cowatch__tick' : 'cowatch__tick--missing'}>
                          {installed ? '✓' : '-'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {provider === 'lan' || (session.available.length > 0 && !noteFor(provider)) ? null : (
                <p className="settings__hint">
                  {session.available.length === 0 ? (
                    <>
                      {t('CoWatch.neitherInstalled')} {CLOUDFLARED_NOTE}
                    </>
                  ) : (
                    noteFor(provider)
                  )}
                </p>
              )}

              {provider === 'lan' ? null : (
                <p className="settings__hint">{t('CoWatch.tunnelNote')}</p>
              )}

              {IS_WINDOWS ? (
                <p className="settings__hint">{t('CoWatch.windowsFirewall')}</p>
              ) : null}

              <button
                type="button"
                className="button button--withicon"
                disabled={cowatch.busy}
                onClick={() => (provider === 'lan' ? cowatch.start('lan') : cowatch.start('tunnel', provider))}
              >
                <PeopleIcon />
                {t('CoWatch.startSession')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {session.knocking.length > 0 ? (
              <div>
                {session.knocking.map((knock) => (
                  <Knock key={knock.id} knock={knock} cowatch={cowatch} />
                ))}
              </div>
            ) : null}

            <div className="settings__group">
              <span className="settings__label">{t('CoWatch.link')}</span>
              <div className="settings__row">
                <input
                  className="settings__input"
                  readOnly
                  value={session.url ?? t('CoWatch.link.getting')}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label={t('CoWatch.invite')}
                />
                <button
                  type="button"
                  className="button"
                  onClick={copy}
                  disabled={!session.url}
                >
                  {copied ? t('CoWatch.copied') : t('CoWatch.copy')}
                </button>
              </div>

              {session.tunnel === 'starting' ? (
                <p className="settings__hint">{t('CoWatch.opening')}</p>
              ) : null}
              {session.tunnel === 'up' ? (
                <p className="settings__ok">
                  {t('CoWatch.reachable', { kind: session.tunnelKind ?? '' })}
                </p>
              ) : null}
              {session.tunnel === 'error' ? (
                <p className="settings__bad">{session.tunnelMessage}</p>
              ) : null}
            </div>

            <p className="cowatch__warning">{t('CoWatch.warning')}</p>

            <div className="settings__group">
              <span className="settings__label">
                {session.guests.length > 0
                  ? t('CoWatch.inSession.count', { count: session.guests.length })
                  : t('CoWatch.inSession')}
              </span>
              {session.guests.length === 0 ? (
                <p className="settings__hint">{t('CoWatch.nobody')}</p>
              ) : (
                session.guests.map((guest) => (
                  <GuestRow key={guest.id} guest={guest} onKick={() => cowatch.kick(guest.id)} />
                ))
              )}
            </div>

            <div className="settings__group">
              <button
                type="button"
                className="button button--danger"
                disabled={cowatch.busy}
                onClick={() => cowatch.stop()}
              >
                {t('CoWatch.stopShort')}
              </button>
              <p className="settings__hint">{t('CoWatch.stopNote')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Someone waiting to be let in.
 *
 * The two words are the point of this card: an address proves nothing about who
 * is on the other end, but asking "do you see amber otter?" over a call you are
 * already on settles it in two seconds.
 */
function Knock({ knock, cowatch }: { knock: CoWatchKnock; cowatch: CoWatchView }): React.JSX.Element {
  return (
    <div className="cowatch__knock">
      <div className="cowatch__knock-who">
        <strong>{knock.name}</strong> {t('CoWatch.wantsJoinSuffix')}
        <span className="cowatch__addr">{t('CoWatch.knockFrom', { address: knock.address })}</span>
      </div>

      <div className="cowatch__fingerprint">{knock.fingerprint}</div>
      <p className="settings__hint">{t('CoWatch.fingerprintHint')}</p>

      <div className="settings__row">
        <button type="button" className="button" onClick={() => cowatch.approve(knock.id, true)}>
          {t('CoWatch.letIn')}
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => cowatch.approve(knock.id, false)}
        >
          {t('CoWatch.turnAway')}
        </button>
      </div>
    </div>
  )
}

function GuestRow({
  guest,
  onKick,
}: {
  guest: CoWatchGuest
  onKick: () => void
}): React.JSX.Element {
  const state = !guest.connected ? 'off' : !guest.ready ? 'busy' : 'on'

  return (
    <div className="cowatch__guest">
      <span className={`cowatch__dot cowatch__dot--${state}`} aria-hidden="true" />
      <span className="cowatch__name">{guest.name}</span>
      <span className="cowatch__addr">
        {!guest.connected
          ? t('CoWatch.guest.disconnected')
          : !guest.ready
            ? t('CoWatch.guest.loading')
            : guest.latencyMs !== null
              ? `${guest.latencyMs} ms`
              : t('CoWatch.guest.watching')}
      </span>
      <button type="button" className="button button--quiet" onClick={onKick}>
        {t('Card.remove')}
      </button>
    </div>
  )
}

/**
 * What guests see the host called. Saved when the field is left or Enter is
 * pressed; left empty, it goes back to the default.
 */
export function SessionName(): React.JSX.Element {
  const [stored, setStored] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    void window.goonlib.cowatch
      .hostName()
      .then((name) => {
        setStored(name)
        setDraft(name)
      })
      .catch(() => undefined)
  }, [])

  const commit = (): void => {
    if (stored === null || draft.trim() === stored) return
    void window.goonlib.cowatch
      .setHostName(draft)
      .then((name) => {
        setStored(name)
        setDraft(name)
      })
      .catch(() => undefined)
  }

  return (
    <label className="settings__field">
      <span className="settings__label">{t('CoWatch.username')}</span>
      <input
        className="settings__input"
        value={draft}
        maxLength={32}
        placeholder={t('CoWatch.username.placeholder')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
      <span className="settings__hint">{t('CoWatch.username.hint')}</span>
    </label>
  )
}
